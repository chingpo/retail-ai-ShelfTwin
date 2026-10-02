import { aggregateInteractions, getEventEvidence, getShelfContext, queryEvents } from '../domain/queries.ts'
import type { EventFilter, QueryContext } from '../domain/types.ts'

const string = { type: 'string' }
const filters = { shelfId: string, category: string, shopperId: string,
  action: { type: 'string', enum: ['PICK', 'PUT BACK', 'TOUCH'] } }
const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object', properties, required, additionalProperties: false,
})

// Provider-independent function definitions; no model or network dependency.
export const toolDefinitions = [
  { name: 'query_events', description: 'Query annotated events in the curated sample pool; no exact SKU or transaction inference.',
    parameters: object({ ...filters, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }) },
  { name: 'aggregate_interactions', description: 'Count interactions grouped by demo-mapped shelf. PUT BACK counts are not pick-return pairs.',
    parameters: object({ ...filters, sortBy: { type: 'string', enum: ['interactions', 'puts'] }, limit: { type: 'integer', minimum: 1, maximum: 100 } }) },
  { name: 'get_shelf_context', description: 'Get shelf context and planogram candidates, not verified SKU identity.', parameters: object({ shelfId: string }, ['shelfId']) },
  { name: 'get_event_evidence', description: 'Resolve a stable event reference to its source video and seek time.', parameters: object({ eventRef: string }, ['eventRef']) },
] as const

export function runTool(context: QueryContext, name: string, input: unknown) {
  const definition = toolDefinitions.find(tool => tool.name === name)
  if (!definition) throw new Error(`Unknown tool: ${name}`)
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Arguments must be an object')
  const args = input as Record<string, unknown>
  const schema = definition.parameters
  for (const key of schema.required) if (!(key in args)) throw new Error(`Missing argument: ${key}`)
  for (const [key, value] of Object.entries(args)) {
    const rule = schema.properties[key] as { type: string; enum?: string[]; minimum?: number; maximum?: number } | undefined
    if (!rule) throw new Error(`Unknown argument: ${key}`)
    if (rule.type === 'string' && (typeof value !== 'string' || !value.trim())) throw new Error(`Invalid string: ${key}`)
    if (rule.enum && !rule.enum.includes(value as string)) throw new Error(`Invalid choice: ${key}`)
    if (rule.type === 'integer' && (typeof value !== 'number' || !Number.isInteger(value)
      || value < (rule.minimum ?? 0) || value > (rule.maximum ?? Number.MAX_SAFE_INTEGER))) throw new Error(`Invalid integer: ${key}`)
  }
  const filter = args as EventFilter & { offset?: number; limit?: number; sortBy?: 'interactions' | 'puts' }
  switch (name) {
    case 'query_events': return queryEvents(context, filter)
    case 'aggregate_interactions': return aggregateInteractions(context, filter)
    case 'get_shelf_context': return getShelfContext(context, args.shelfId as string)
    case 'get_event_evidence': return getEventEvidence(context, args.eventRef as string)
    default: throw new Error(`Unknown tool: ${name}`)
  }
}
