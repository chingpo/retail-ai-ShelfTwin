import type { DemoData, IndexedEvent, ShopperSource, StoreConfig } from './types.ts'

export const eventReference = (shopperId: string, eventId: string) => JSON.stringify([shopperId, eventId])

export function buildEventIndex(sources: readonly ShopperSource[], data: Record<string, DemoData>, store: StoreConfig | null): IndexedEvent[] {
  return sources.flatMap(source => (data[source.id]?.events ?? []).map(event => ({
    ...event, eventRef: eventReference(source.id, event.id), shopperId: source.id,
    shopperLabel: source.label, video: source.video,
    shelfId: store?.shelves.some(shelf => shelf.id === store.event_shelves[eventReference(source.id, event.id)])
      ? store.event_shelves[eventReference(source.id, event.id)] : undefined,
  })))
}

export function parseDemoData(value: unknown): DemoData {
  const data = value as DemoData | null
  if (!data || !Array.isArray(data.trajectory) || !Array.isArray(data.events)
    || !data.trajectory.every(p => p && [p.t, p.x, p.z].every(Number.isFinite) && p.t >= 0)
    || !data.events.every(e => e && typeof e.id === 'string' && Number.isFinite(e.t) && e.t >= 0
      && ['PICK', 'PUT BACK', 'TOUCH'].includes(e.type) && typeof e.item === 'string' && typeof e.aisle === 'string')
    || new Set(data.events.map(e => e.id)).size !== data.events.length) {
    throw new Error('Invalid trajectory or event data')
  }
  return data
}

export async function loadDemoData(url: string): Promise<DemoData> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Unable to load ${url}: ${response.status}`)
  return parseDemoData(await response.json())
}
