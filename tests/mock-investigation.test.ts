import { test } from 'node:test'
import assert from 'node:assert/strict'
import { investigateLocally } from '../server/mock-investigation.ts'
import { configureProvider } from '../server/provider.ts'
import { loadQueryContext } from '../server/data.ts'
import { createAgentServer } from '../server/http.ts'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'

const root = fileURLToPath(new URL('../', import.meta.url))
test('mock is default even with credentials present; API needs explicit provider selection', () => {
  const config = configureProvider({ OPENAI_API_KEY: 'fake', OPENAI_MODEL: 'fake' })
  assert.equal(config.provider, 'mock')
  assert.equal(config.transport, undefined)
  assert.ok(configureProvider({ AGENT_PROVIDER: 'openai', OPENAI_API_KEY: 'fake', OPENAI_MODEL: 'fake' }).transport)
  assert.throws(() => configureProvider({ AGENT_PROVIDER: 'typo' }))
})

test('local investigation uses real counts and refs, with no fetch or model calls', async () => {
  const context = await loadQueryContext(root)
  const original = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('External fetch forbidden in mock') }
  try {
    const result = investigateLocally(context, '调查饮料区放回')
    assert.equal(result.status, 'completed')
    assert.equal(result.execution, 'mock')
    assert.equal(result.usage.modelRequests, 0)
    assert.equal(result.usage.outputTokens, 0)
    const expected = context.events.filter(e => context.shelves.some(s => s.id === e.shelfId && s.category === 'Beverages') && e.type === 'PUT BACK').length
    assert.ok(result.report.findings.some(f => f.statement.includes(`${expected} 次放回`)))
    assert.ok(result.evidence.every(e => context.events.some(item => item.eventRef === e.eventRef)))
    assert.deepEqual(investigateLocally(context, '调查饮料区放回').report, result.report)
    assert.equal(investigateLocally(context, '比较饮料与零食交互').report.findings.length, 2)
    assert.equal(investigateLocally(context, '销量下降的原因').status, 'insufficient_evidence')
    assert.equal(investigateLocally(context, '写一个诗').status, 'insufficient_evidence')
  } finally { globalThis.fetch = original }
})

test('default HTTP service works without credentials and ignores injected paid transport', async () => {
  const context = await loadQueryContext(root)
  let called = false
  const server = createAgentServer({ getContext: async () => context, transport: async () => { called = true; throw new Error('No paid calls') } })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}`
  try {
    const status = await (await fetch(`${base}/api/agent/status`)).json()
    assert.equal(status.provider, 'mock'); assert.equal(status.configured, true)
    const result = await (await fetch(`${base}/api/agent/investigate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: '调查饮料区放回' }) })).json()
    assert.equal(result.execution, 'mock')
    assert.equal(result.status, 'completed')
    assert.equal(called, false)
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
