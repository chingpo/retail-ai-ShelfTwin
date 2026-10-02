import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createAgentServer } from '../server/http.ts'
import { loadQueryContext } from '../server/data.ts'
import type { QueryContext } from '../src/domain/types.ts'
import type { ModelTransport } from '../server/investigation.ts'
import { fileURLToPath } from 'node:url'

const empty: QueryContext = { status: 'ready', errors: [], events: [], shelves: [] }
async function withServer(transport: ModelTransport | undefined, run: (base: string) => Promise<void>) {
  const server = createAgentServer({ provider: 'openai', getContext: async () => empty, transport, model: transport ? 'test-model' : undefined })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  try { await run(`http://127.0.0.1:${address.port}`) } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}
const post = (base: string, body: unknown, extra: Record<string, string> = {}) => fetch(`${base}/api/agent/investigate`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body),
})

test('unconfigured service reports availability without exposing credentials', async () => {
  await withServer(undefined, async base => {
    const response = await fetch(`${base}/api/agent/status`)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).configured, false)
    assert.equal((await post(base, { question: '调查' })).status, 503)
  })
})

test('HTTP validates requests, ignores client-supplied context, and returns grounded insufficient result', async () => {
  let calls = 0
  const transport: ModelTransport = async () => {
    calls++
    return calls === 1 ? { output: [{ type: 'function_call', name: 'query_events', arguments: '{}', call_id: 'query' }] }
      : { output: [{ type: 'function_call', name: 'finish_investigation', call_id: 'finish', arguments: JSON.stringify({
        outcome: 'insufficient_evidence', title: '无事件', summary: '没有加载可用事件。', findings: [], hypotheses: [], limitations: [], nextSteps: ['补充事件。'],
      }) }] }
  }
  await withServer(transport, async base => {
    assert.equal((await post(base, { question: '' })).status, 400)
    assert.equal((await post(base, { question: 'x'.repeat(2001) })).status, 400)
    assert.equal((await post(base, { question: '调查' }, { Origin: 'https://example.com' })).status, 403)
    assert.equal((await fetch(`${base}/api/agent/investigate`)).status, 405)
    const response = await post(base, { question: '调查', context: { events: ['fabricated'] } })
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.status, 'insufficient_evidence')
    assert.equal(result.evidence.length, 0)
  })
})

test('disconnect cancels provider work and concurrent requests are rejected', async () => {
  let entered!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  let aborted!: () => void
  const cancelled = new Promise<void>(resolve => { aborted = resolve })
  const transport: ModelTransport = async (_, signal) => {
    entered()
    return new Promise((_, reject) => signal.addEventListener('abort', () => { aborted(); reject(signal.reason) }, { once: true }))
  }
  await withServer(transport, async base => {
    const controller = new AbortController()
    const first = fetch(`${base}/api/agent/investigate`, { method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: '调查' }) }).catch(() => null)
    await started
    assert.equal((await post(base, { question: '另一项调查' })).status, 429)
    controller.abort()
    await first
    await cancelled
  })
})

test('authoritative local loader handles complete bundled data and missing root', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const loaded = await loadQueryContext(root)
  assert.equal(loaded.status, 'ready')
  assert.ok(loaded.events.length > 0)
  const missing = await loadQueryContext(`${root}/missing-root`)
  assert.equal(missing.status, 'error')
  assert.equal(missing.events.length, 0)
})
