import { readFile } from 'node:fs/promises'
import { buildEventIndex, parseDemoData } from '../src/domain/event-index.ts'
import { shopperSources } from '../src/domain/shopper-sources.ts'
import type { DemoData, QueryContext, StoreConfig } from '../src/domain/types.ts'

export async function loadQueryContext(root: string): Promise<QueryContext> {
  const errors: string[] = []
  let store: StoreConfig | null = null
  try {
    store = JSON.parse(await readFile(`${root}/public/data/store-config.json`, 'utf8')) as StoreConfig
    if (!store || !Array.isArray(store.shelves) || !store.event_shelves) throw new Error('Invalid store config')
  } catch { errors.push('store-config'); store = null }
  const loaded = await Promise.allSettled(shopperSources.map(async source =>
    parseDemoData(JSON.parse(await readFile(`${root}/public${source.data}`, 'utf8')))))
  const data: Record<string, DemoData> = {}
  loaded.forEach((result, index) => {
    if (result.status === 'fulfilled') data[shopperSources[index].id] = result.value
    else errors.push(shopperSources[index].id)
  })
  return { events: buildEventIndex(shopperSources, data, store), shelves: store?.shelves ?? [], status: errors.length ? 'error' : 'ready', errors }
}
