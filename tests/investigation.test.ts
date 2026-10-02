import { test } from 'node:test'
import assert from 'node:assert/strict'
import { investigate, type ModelRequest, type ModelResponse, type ModelTransport } from '../server/investigation.ts'
import type { QueryContext } from '../src/domain/types.ts'

export const ref = JSON.stringify(['shopper-a', 'event-a'])
export const context: QueryContext = { status: 'ready', errors: [], shelves: [
  { id: 'shelf-a', name: '饮料', category: 'Beverages', map_zone: { x: 0, z: 0, width: 1, depth: 1 }, sku_candidates: [] },
], events: [{ id: 'event-a', eventRef: ref, shopperId: 'shopper-a', shopperLabel: 'A', video: '/a.mp4',
  t: 5, type: 'PUT BACK', item: 'candidate', aisle: 'A', shelfId: 'shelf-a' }] }
export const call = (name: string, args: unknown, id = name): ModelResponse => ({ status: 'completed',
  output: [{ type: 'function_call', name, arguments: JSON.stringify(args), call_id: id }], usage: { input_tokens: 100, output_tokens: 20 } })
export const report = (evidenceRef = ref) => ({ outcome: 'completed', title: '饮料区放回证据', summary: '找到一条放回标注。',
  findings: [{ statement: '样本含 PUT BACK 标注。', evidenceRefs: [evidenceRef] }], hypotheses: [], limitations: [], nextSteps: ['人工查看视频。'] })
export const scripted = (responses: ModelResponse[], requests: ModelRequest[] = []): ModelTransport => async request => {
  requests.push(request)
  const response = responses.shift()
  if (!response) throw new Error('Script exhausted')
  return response
}

test('adaptive multi-round investigation retains reasoning items and produces resolved evidence', async () => {
  const requests: ModelRequest[] = []
  const first = call('aggregate_interactions', { category: 'Beverages' })
  first.output.unshift({ type: 'reasoning', id: 'reasoning-1', summary: [] })
  const result = await investigate(context, '调查饮料区', scripted([
    first, call('get_shelf_context', { shelfId: 'shelf-a' }),
    call('get_event_evidence', { eventRef: ref }), call('finish_investigation', report()),
  ], requests))
  assert.equal(result.status, 'completed')
  assert.equal(result.evidence[0].video, '/a.mp4')
  assert.equal(result.usage.modelRequests, 4)
  assert.equal(result.usage.inputTokens, 400)
  assert.ok(requests[1].input.some((item: any) => item.type === 'reasoning'))
  assert.ok(requests[1].input.some((item: any) => item.type === 'function_call_output'))
  assert.ok(requests.every(request => request.store === false && request.parallel_tool_calls === false))
  assert.match(result.report.limitations.join(' '), /尚未观看/)
})

test('fabricated citations are rejected and correction can finish', async () => {
  const result = await investigate(context, '调查', scripted([
    call('query_events', {}), call('finish_investigation', report('invented')),
    call('get_event_evidence', { eventRef: ref }), call('finish_investigation', report()),
  ]))
  assert.equal(result.status, 'completed')
  assert.equal(result.steps[1].status, 'error')
  assert.match(result.steps[1].detail, /not been resolved/)
})

test('request and tool budgets stop repeated exploration without fabricating a report', async () => {
  const repeated: ModelTransport = async () => call('query_events', {})
  const rounds = await investigate(context, '调查', repeated, { budget: { maxRequests: 2 } })
  assert.equal(rounds.status, 'budget_reached')
  assert.equal(rounds.steps[1].status, 'error')
  assert.equal(rounds.report.findings.length, 0)
  const tools = await investigate(context, '调查', repeated, { budget: { maxToolCalls: 1 } })
  assert.equal(tools.usage.toolCalls, 1)
  assert.equal(tools.status, 'budget_reached')
})

test('missing data prevents model requests and unsupported questions can finish with insufficient evidence', async () => {
  let called = false
  const missing = await investigate({ ...context, status: 'error', errors: ['clip'] }, '调查', async () => { called = true; return call('query_events', {}) })
  assert.equal(called, false)
  assert.equal(missing.status, 'insufficient_evidence')
  const result = await investigate(context, '判断销售原因', scripted([
    call('query_events', {}), call('finish_investigation', { ...report(), outcome: 'insufficient_evidence',
      summary: '缺少 POS 和同店基线，不能判断销售原因。', findings: [] }),
  ]))
  assert.equal(result.status, 'insufficient_evidence')
})

test('cancellation, time budget and provider failures produce explicit stop reasons', async () => {
  const controller = new AbortController()
  controller.abort()
  const cancelled = await investigate(context, '调查', scripted([]), { signal: controller.signal })
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.usage.modelRequests, 0)
  const waiting: ModelTransport = (_, signal) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(call('query_events', {})), 1000)
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
  })
  const timeout = await investigate(context, '调查', waiting, { budget: { maxElapsedMs: 10 } })
  assert.equal(timeout.status, 'budget_reached')
  const failed = await investigate(context, '调查', async () => { throw new Error('SECRET should not leak') })
  assert.equal(failed.status, 'error')
  assert.ok(!JSON.stringify(failed).includes('SECRET'))
})

test('ordinary text is not accepted as a grounded report, and input budget is enforced', async () => {
  const result = await investigate(context, '调查', scripted([{ output: [{ type: 'message', content: 'invented facts' }] }]))
  assert.equal(result.status, 'error')
  assert.deepEqual(result.report.findings, [])
  const budget = await investigate(context, '调查', scripted([]), { budget: { maxInputChars: 1 } })
  assert.equal(budget.status, 'budget_reached')
  assert.equal(budget.usage.modelRequests, 0)
  const incomplete = await investigate(context, '调查', scripted([{ ...call('finish_investigation', report()), status: 'incomplete' }]))
  assert.equal(incomplete.status, 'budget_reached')
  assert.equal(incomplete.report.findings.length, 0)
})
