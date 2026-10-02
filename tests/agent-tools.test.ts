import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildEventIndex, eventReference, parseDemoData, loadDemoData } from '../src/domain/event-index.ts'
import { aggregateInteractions, getEventEvidence, queryEvents } from '../src/domain/queries.ts'
import { answerQuery } from '../src/assistant/rule-router.ts'
import { runTool } from '../src/assistant/tools.ts'
import type { DemoData, QueryContext, Shelf, StoreConfig } from '../src/domain/types.ts'

const shelf: Shelf = { id: 'shelf-a', name: 'Beverages', category: 'Beverages',
  map_zone: { x: 0, z: 0, width: 1, depth: 1 }, sku_candidates: [{ name: 'Candidate', confidence: 0.7 }] }
const sources = [{ id: 'shopper-a', label: 'A', video: '/a.mp4', data: '/a.json' },
  { id: 'shopper-b', label: 'B', video: '/b.mp4', data: '/b.json' }]
const makeEvent = (id: string, t = 1) => ({ id, t, type: 'PUT BACK' as const, item: 'Candidate', aisle: 'A' })
const store: StoreConfig = { shelves: [shelf], event_shelves: {
  [eventReference('shopper-a', 'one')]: shelf.id, [eventReference('shopper-b', 'one')]: shelf.id } }
const data: Record<string, DemoData> = {
  'shopper-a': { trajectory: [], events: [makeEvent('unmapped'), makeEvent('one', 5)] },
  'shopper-b': { trajectory: [], events: [makeEvent('one', 8)] } }
const context: QueryContext = { events: buildEventIndex(sources, data, store), shelves: [shelf], status: 'ready', errors: [] }

test('bundled config references existing events and shelves', () => {
  const config = JSON.parse(readFileSync(new URL('../public/data/store-config.json', import.meta.url), 'utf8')) as StoreConfig
  const app = readFileSync(new URL('../src/domain/shopper-sources.ts', import.meta.url), 'utf8')
  const bundled = [...app.matchAll(/\{ id: '(shopper-\d+)', label: '[^']+', video: '[^']+', data: '([^']+)'/g)]
  const refs = new Set<string>()
  for (const [, shopperId, url] of bundled) {
    const clip = parseDemoData(JSON.parse(readFileSync(new URL(`../public${url}`, import.meta.url), 'utf8')))
    for (const event of clip.events) refs.add(eventReference(shopperId, event.id))
  }
  assert.equal(bundled.length, 12)
  assert.ok(Object.keys(config.event_shelves).length > 0)
  for (const [ref, shelfId] of Object.entries(config.event_shelves)) {
    assert.ok(refs.has(ref), `Missing event ${ref}`)
    assert.ok(config.shelves.some(s => s.id === shelfId), `Missing shelf ${shelfId}`)
  }
})

test('event reordering preserves shelf association and same IDs in different clips remain distinct', () => {
  const reversed = buildEventIndex(sources, { ...data, 'shopper-a': { trajectory: [], events: [...data['shopper-a'].events].reverse() } }, store)
  assert.equal(reversed.find(e => e.eventRef === eventReference('shopper-a', 'one'))?.shelfId, shelf.id)
  const evidence = getEventEvidence(context, eventReference('shopper-b', 'one')).result
  assert.equal(evidence?.video, '/b.mp4')
  assert.equal(evidence?.seekTime, 8)
  assert.equal(getEventEvidence(context, 'unknown').result, null)
})

test('pagination does not truncate aggregate counts; unmapped events are accounted for', () => {
  const large = { ...context, events: Array.from({ length: 125 }, (_, i) => ({ ...context.events[1], id: String(i), eventRef: String(i) })) }
  assert.equal(queryEvents(large, { limit: 1 }).result.events.length, 1)
  assert.equal(queryEvents(large, { limit: 1 }).result.total, 125)
  assert.equal(aggregateInteractions(large).result.clusters[0].puts, 125)
  assert.equal(aggregateInteractions(context).result.unmapped, 1)
  assert.equal(aggregateInteractions(context).result.clusters[0].shoppers, 2)
})

test('rule answers combine category and action and refuse incomplete-data rankings', () => {
  const reply = answerQuery(context, '饮料区放回最多的证据')
  assert.match(reply.body, /2 次放回/)
  assert.match(reply.body, /不能直接解释/)
  assert.equal(reply.actions[1].command.type, 'open_evidence')
  assert.equal(answerQuery({ ...context, status: 'error', errors: ['shopper-b'] }, '放回最多').actions.length, 0)
  assert.match(answerQuery({ ...context, events: [] }, '放回').title, /没有匹配/)
})

test('tool boundary rejects malformed arguments and matches direct queries', () => {
  assert.deepEqual(runTool(context, 'query_events', { shelfId: shelf.id }), queryEvents(context, { shelfId: shelf.id }))
  for (const args of [{ limit: -1 }, { limit: 1.5 }, { limit: 101 }, { action: 'BUY' }, { sku: 'x' }]) {
    assert.throws(() => runTool(context, 'query_events', args))
  }
  assert.throws(() => runTool(context, 'get_event_evidence', {}))
  assert.throws(() => runTool(context, 'unknown', {}))
})

test('invalid JSON shape and failed requests do not become demo events', async () => {
  assert.throws(() => parseDemoData({ trajectory: [], events: [makeEvent('one'), makeEvent('one')] }))
  assert.throws(() => parseDemoData({ trajectory: [], events: [makeEvent('one', -1)] }))
  assert.deepEqual(parseDemoData({ trajectory: [], events: [] }), { trajectory: [], events: [] })
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('', { status: 404 })
  try { await assert.rejects(loadDemoData('/missing.json'), /404/) } finally { globalThis.fetch = original }
})
