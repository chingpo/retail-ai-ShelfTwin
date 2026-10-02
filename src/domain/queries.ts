import type { Cluster, EventFilter, QueryContext, ToolResult } from './types.ts'

function envelope<T>(context: QueryContext, result: T, refs: string[] = []): ToolResult<T> {
  return { data_status: context.status, scope: 'curated_cross_sample', result, evidence_refs: refs,
    errors: context.errors, provenance: { action: 'RetailAction annotation', shelf: 'demo_mapped', product: 'planogram_candidate' } }
}

function matchingEvents(context: QueryContext, filter: EventFilter) {
  return context.events.filter(event => (!filter.shelfId || event.shelfId === filter.shelfId)
    && (!filter.shopperId || event.shopperId === filter.shopperId)
    && (!filter.action || event.type === filter.action)
    && (!filter.category || context.shelves.some(s => s.id === event.shelfId && s.category === filter.category)))
}

export function queryEvents(context: QueryContext, filter: EventFilter & { offset?: number; limit?: number } = {}) {
  const matches = matchingEvents(context, filter)
  const offset = Math.max(0, Math.floor(filter.offset ?? 0))
  const events = matches.slice(offset, offset + Math.min(100, Math.max(1, Math.floor(filter.limit ?? 20))))
  return envelope(context, { events, total: matches.length }, events.map(e => e.eventRef))
}

export function aggregateInteractions(context: QueryContext, filter: EventFilter & { sortBy?: 'interactions' | 'puts'; limit?: number } = {}) {
  // Aggregation must include every match, independently of retrieval pagination.
  const matching = matchingEvents(context, filter)
  const clusters: Cluster[] = context.shelves.filter(s => (!filter.shelfId || s.id === filter.shelfId)
    && (!filter.category || s.category === filter.category)).map(shelf => {
    const items = matching.filter(e => e.shelfId === shelf.id)
    return { shelf, events: items, shoppers: new Set(items.map(e => e.shopperId)).size,
      picks: items.filter(e => e.type === 'PICK').length, puts: items.filter(e => e.type === 'PUT BACK').length }
  }).sort((a, b) => (filter.sortBy === 'puts' ? b.puts - a.puts : 0) || b.events.length - a.events.length || a.shelf.id.localeCompare(b.shelf.id))
  const result = clusters.slice(0, filter.limit === undefined ? clusters.length : Math.max(0, Math.floor(filter.limit)))
  return envelope(context, { clusters: result, total: matching.length, unmapped: matching.filter(e => !e.shelfId).length,
    metric_definition: 'Annotated interaction counts by demo-mapped shelf; not SKU counts, transactions, or pick-return pairs.' }, result.flatMap(c => c.events.map(e => e.eventRef)))
}

export function getShelfContext(context: QueryContext, shelfId: string) {
  return envelope(context, context.shelves.find(s => s.id === shelfId) ?? null)
}

export function getEventEvidence(context: QueryContext, eventRef: string) {
  const event = context.events.find(e => e.eventRef === eventRef)
  return envelope(context, event ? { eventRef, shopperId: event.shopperId, eventId: event.id,
    video: event.video, seekTime: event.t, shelfId: event.shelfId, action: event.type } : null, event ? [eventRef] : [])
}
