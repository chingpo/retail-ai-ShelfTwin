import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createOpenAITransport } from '../server/openai.ts'

test('Responses transport uses server credentials, supplied model and complete tool input', async () => {
  const original = globalThis.fetch
  const controller = new AbortController()
  const request = { instructions: 'instructions', input: [{ type: 'function_call_output', call_id: 'a', output: '{}' }],
    tools: [], max_output_tokens: 2500, store: false as const, parallel_tool_calls: false as const }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses')
    assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer fake-test-key')
    assert.deepEqual(JSON.parse(options?.body as string), { ...request, model: 'test-model' })
    assert.equal(options?.signal, controller.signal)
    return Response.json({ output: [], status: 'completed' })
  }
  try { assert.equal((await createOpenAITransport('fake-test-key', 'test-model')(request, controller.signal)).status, 'completed') }
  finally { globalThis.fetch = original }
})
