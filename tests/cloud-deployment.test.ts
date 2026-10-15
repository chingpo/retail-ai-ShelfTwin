import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createAgentServer } from '../server/http.ts'
import { createGeminiTransport } from '../server/gemini.ts'
import { GenerateContentResponse, FinishReason } from '@google/genai'
import { fileURLToPath } from 'node:url'
import type { QueryContext } from '../src/domain/types.ts'

const context: QueryContext = { events: [], shelves: [], status: 'ready', errors: [] }
test('Gemini preserves signed parts and returns named tool results with usage', async () => {
  let round = 0
  const transport = createGeminiTransport('project', 'gemini-2.5-flash-lite', 'global', async request => {
    const response = new GenerateContentResponse()
    response.candidates = [{ finishReason: FinishReason.STOP, content: { role: 'model', parts: [
      { functionCall: { name: 'query_events', args: {} }, thoughtSignature: 'signature' },
    ] } }]
    response.usageMetadata = { promptTokenCount: 15, candidatesTokenCount: 4, thoughtsTokenCount: 2 }
    if (++round === 2) {
      const contents = request.contents as import('@google/genai').Content[]
      assert.equal(contents[1].parts?.[0].thoughtSignature, 'signature')
      assert.equal(contents[2].parts?.[0].functionResponse?.name, 'query_events')
      assert.deepEqual(contents[2].parts?.[0].functionResponse?.response, { result: { events: [] } })
    }
    return response
  })
  const request = { instructions: 'Investigate', input: [{ role: 'user', content: 'question' }] as unknown[], tools: [{ name: 'query_events', description: 'query', parameters: { type: 'object' } }], max_output_tokens: 100, store: false as const, parallel_tool_calls: false as const }
  const first = await transport(request, new AbortController().signal)
  assert.deepEqual(first.usage, { input_tokens: 15, output_tokens: 6 })
  await transport({ ...request, input: [...request.input, ...first.output, { type: 'function_call_output', call_id: first.output[0].call_id, output: '{"events":[]}' }] }, new AbortController().signal)
})

test('cloud service gates API and assets, supports same origin and video ranges, enforces quota', async () => {
  const root = fileURLToPath(new URL('../dist', import.meta.url))
  const server = createAgentServer({ getContext: async () => context, provider: 'gemini', transport: async () => { throw new Error('quota should prevent model calls') }, staticRoot: root, credentials: 'review:test', reserveInvestigation: async () => false })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  const headers = { Authorization: `Basic ${Buffer.from('review:test').toString('base64')}` }
  try {
    assert.equal((await fetch(`${base}/healthz`)).status, 200)
    assert.equal((await fetch(base)).status, 401)
    assert.equal((await fetch(`${base}/api/agent/status`)).status, 401)
    assert.equal((await fetch(base, { headers })).status, 200)
    assert.equal((await fetch(`${base}/models/supermarket.glb`, { headers: { ...headers, Range: 'bytes=0-15' } })).status, 206)
    const response = await fetch(`${base}/api/agent/investigate`, { method: 'POST', headers: { ...headers, Origin: base, 'Content-Type': 'application/json' }, body: '{"question":"调查"}' })
    assert.equal(response.status, 429)
    assert.equal((await fetch(`${base}/api/agent/investigate`, { method: 'POST', headers: { ...headers, Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{"question":"调查"}' })).status, 403)
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})

test('investigation repairs missing tool submission without accepting ungrounded text', async () => {
  const { investigate } = await import('../server/investigation.ts')
  let calls = 0
  const result = await investigate(context, '销量下降原因', async request => {
    calls++
    if (calls === 1) return { output: [{ type: 'function_call', name: 'query_events', arguments: '{}', call_id: 'q' }] }
    if (calls === 2) return { output: [{ type: 'message', content: 'Unsupported conclusion' }] }
    assert.ok(request.input.some(item => (item as { role?: string; content?: string }).role === 'user' && String((item as { content?: string }).content).includes('上一轮没有提交工具调用')))
    return { output: [{ type: 'function_call', name: 'finish_investigation', call_id: 'f', arguments: JSON.stringify({ outcome: 'insufficient_evidence', title: '缺少销售数据', summary: '缺少 POS 与经营基线。', findings: [], hypotheses: [], limitations: [], nextSteps: ['补充 POS。'] }) }] }
  }, { execution: 'gemini' })
  assert.equal(result.status, 'insufficient_evidence')
  assert.equal(result.usage.modelRequests, 3)
  assert.equal(result.report.findings.length, 0)
})
