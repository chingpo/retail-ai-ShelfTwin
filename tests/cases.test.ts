import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { CaseStore, queueFor } from '../server/cases.ts'
import { createAgentServer } from '../server/http.ts'
import { loadQueryContext } from '../server/data.ts'
import { fileURLToPath } from 'node:url'
import type { CaseAction, InvestigationCase } from '../src/assistant/case-types.ts'

const context = await loadQueryContext(fileURLToPath(new URL('../', import.meta.url)))
async function fixture(work: (store: CaseStore, path: string, tick: (days: number) => void) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'shelftwin-cases-'))
  const path = join(dir, 'cases.json')
  let now = new Date('2026-10-02T00:00:00Z')
  const store = new CaseStore(path, async () => context, () => now)
  try { await work(store, path, days => { now = new Date(now.getTime() + days * 86400000) }) } finally { await rm(dir, { recursive: true, force: true }) }
}
const create = (store: CaseStore, title = '饮料调查') => store.create({ title, question: '调查饮料区放回行为', owner: '店长', requestId: randomUUID() })
const command = (store: CaseStore, c: InvestigationCase, action: CaseAction, key = randomUUID()) => store.command(c.id, c.revision, key, action)
async function ready(store: CaseStore) {
  let c = await create(store)
  c = await command(store, c, { type: 'investigate' })
  return command(store, c, { type: 'feedback', taskId: c.tasks[0].id, note: '价签已检查，无问题。', outcome: 'refutes' })
}
const intervention = (source: 'manual' | 'simulated' = 'simulated'): CaseAction => ({ type: 'intervention', description: '调整价签', startedAt: '2026-10-02T00:00:00Z', observeUntil: '2026-10-09T00:00:00Z', minimumSamples: 30, improvementThreshold: 0.1, baseline: { interactions: 100, puts: 30, source } })

test('persisted case survives a new store instance, saves evidence and feedback, and closes', async () => fixture(async (store, path) => {
  let c = await ready(store)
  const reopened = new CaseStore(path, async () => context)
  c = await reopened.get(c.id)
  assert.equal(c.status, 'awaiting_decision')
  assert.equal(c.hypotheses[0].status, 'refuted')
  assert.ok(c.report?.evidence.length)
  assert.equal(c.reports.length, 1)
  c = await command(reopened, c, { type: 'close', reason: '现有证据无需继续。' })
  assert.equal(c.status, 'closed')
  await assert.rejects(command(reopened, c, { type: 'resume', reason: '再查' }), /已结束/)
}))

test('create and commands are idempotent, stale revisions conflict and concurrent writes serialize', async () => fixture(async store => {
  const requestId = randomUUID(), input = { title: '调查', question: '饮料放回', owner: '店长', requestId }
  const [a, b] = await Promise.all([store.create(input), store.create(input)])
  assert.equal(a.id, b.id); assert.equal((await store.list()).length, 1)
  const key = randomUUID()
  const done = await command(store, a, { type: 'investigate' }, key)
  const retry = await store.command(a.id, a.revision, key, { type: 'investigate' })
  assert.equal(retry.runsUsed, 1); assert.equal(retry.revision, done.revision)
  await assert.rejects(command(store, a, { type: 'add_task', title: '旧版本' }), /刷新/)
}))

test('waiting tasks gate resume; unchanged evidence does not consume another investigation', async () => fixture(async store => {
  let c = await create(store); c = await command(store, c, { type: 'investigate' })
  await assert.rejects(command(store, c, { type: 'resume', reason: '继续' }), /先完成/)
  c = await command(store, c, { type: 'feedback', taskId: c.tasks[0].id, note: '已现场检查。', outcome: 'unknown' })
  c = await command(store, c, { type: 'resume', reason: '纳入反馈' }); c = await command(store, c, { type: 'investigate' })
  assert.equal(c.runsUsed, 2); assert.equal(c.reports.length, 2)
  c = await command(store, c, { type: 'resume', reason: '再次尝试' }); c = await command(store, c, { type: 'investigate' })
  assert.equal(c.runsUsed, 2); assert.match(c.history.at(-1)!.detail, /没有新证据/)
}))

test('simulated intervention completes full loop with locked plan and clear noncausal assessment', async () => fixture(async store => {
  let c = await ready(store); c = await command(store, c, intervention())
  await assert.rejects(command(store, c, intervention()), /不可覆盖|完成调查/)
  c = await command(store, c, { type: 'evaluate' }); assert.equal(c.intervention!.assessment!.outcome, 'insufficient')
  assert.equal(c.status, 'observing')
  c = await command(store, c, { type: 'observation', observedAt: '2026-10-09T00:00:00Z', interactions: 100, puts: 15, source: 'simulated', note: '模拟演练' })
  c = await command(store, c, { type: 'evaluate' })
  assert.equal(c.intervention!.assessment!.outcome, 'improved')
  assert.equal(c.status, 'awaiting_decision')
  assert.match(c.intervention!.assessment!.explanation, /模拟.*不证明/)
  c = await command(store, c, { type: 'close', reason: '模拟闭环验证完成。' }); assert.equal(c.status, 'closed')
}))

test('manual data cannot bypass time window or have future dates; sample size is enforced', async () => fixture(async (store, _, tick) => {
  let c = await ready(store); c = await command(store, c, intervention('manual'))
  await assert.rejects(command(store, c, { type: 'observation', observedAt: '2026-10-09T00:00:00Z', interactions: 100, puts: 15, source: 'manual', note: 'future' }), /不能在未来/)
  c = await command(store, c, { type: 'observation', observedAt: '2026-10-02T00:00:00Z', interactions: 10, puts: 1, source: 'manual', note: '少量真实时间录入' })
  c = await command(store, c, { type: 'evaluate' }); assert.equal(c.intervention!.assessment!.outcome, 'insufficient')
  tick(8)
  c = await command(store, c, { type: 'evaluate' }); assert.equal(c.intervention!.assessment!.outcome, 'insufficient')
  c = await command(store, c, { type: 'observation', observedAt: '2026-10-10T00:00:00Z', interactions: 90, puts: 14, source: 'manual', note: '新增独立批次' })
  c = await command(store, c, { type: 'evaluate' }); assert.equal(c.intervention!.assessment!.outcome, 'improved')
}))

test('assessment handles exact threshold, worsening and unchanged results', async () => fixture(async store => {
  for (const [puts, expected] of [[20, 'improved'], [40, 'worsened'], [25, 'unchanged']] as const) {
    let c = await ready(store); c = await command(store, c, intervention())
    c = await command(store, c, { type: 'observation', observedAt: '2026-10-09T00:00:00Z', interactions: 100, puts, source: 'simulated', note: '独立模拟案例' })
    c = await command(store, c, { type: 'evaluate' })
    assert.equal(c.intervention!.assessment!.outcome, expected)
  }
}))

test('queue dispatch selects priority, skips waiting/closed, and respects run budget', async () => fixture(async store => {
  let low = await create(store, '低优先级'), high = await create(store, '高优先级')
  high = await command(store, high, { type: 'priority', impact: 5, reliability: 5, actionability: 5, cost: 1, maxRuns: 1 })
  const key = randomUUID(), result = await store.dispatch(key)
  assert.equal(result.selected!.id, high.id)
  assert.equal((await store.dispatch(key)).selected!.runsUsed, 1)
  assert.equal(queueFor(await store.list()).find(q => q.caseId === high.id)!.decision, 'wait')
  assert.equal((await store.dispatch(randomUUID())).selected!.id, low.id)
  assert.equal((await store.dispatch(randomUUID())).selected, null)
  high = await store.get(high.id)
  high = await command(store, high, { type: 'feedback', taskId: high.tasks[0].id, note: '检查完成', outcome: 'unknown' })
  high = await command(store, high, { type: 'resume', reason: '继续' })
  assert.match(queueFor(await store.list()).find(q => q.caseId === high.id)!.reason, /预算已用完/)
  await assert.rejects(command(store, high, { type: 'investigate' }), /预算已用完/)
}))

test('corrupt storage is preserved and invalid commands do not persist partial edits', async () => fixture(async (store, path) => {
  let c = await create(store)
  await assert.rejects(command(store, c, { type: 'priority', impact: 5, reliability: 99, actionability: 2, cost: 2, maxRuns: 3 }), /范围/)
  assert.equal((await store.get(c.id)).impact, 3)
  await writeFile(path, 'BROKEN')
  await assert.rejects(create(store), /损坏/)
  assert.equal(await readFile(path, 'utf8'), 'BROKEN')
}))

test('case HTTP create, dispatch, feedback, conflicts and service restart use durable state', async () => fixture(async store => {
  const server = createAgentServer({ getContext: async () => context, caseStore: store })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}/api/agent`
  const post = (path: string, value: unknown) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
  try {
    const response = await post('/cases', { title: 'API Case', question: '饮料放回', owner: '店长', requestId: randomUUID() }); assert.equal(response.status, 201)
    let c = await response.json()
    assert.equal((await (await fetch(base + '/queue')).json()).queue.length, 1)
    const run = await (await post('/dispatch', { requestId: randomUUID() })).json(); c = run.selected
    assert.equal(c.status, 'waiting_evidence')
    const feedback = await post(`/cases/${c.id}/commands`, { revision: c.revision, requestId: randomUUID(), action: { type: 'feedback', taskId: c.tasks[0].id, note: '现场已查', outcome: 'refutes' } }); assert.equal(feedback.status, 200)
    assert.equal((await post(`/cases/${c.id}/commands`, { revision: c.revision, requestId: randomUUID(), action: { type: 'close', reason: 'stale' } })).status, 409)
    assert.equal((await (await fetch(base + `/cases/${c.id}`)).json()).status, 'awaiting_decision')
    assert.equal((await post('/cases', null)).status, 400)
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
}))
