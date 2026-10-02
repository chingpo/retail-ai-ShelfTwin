import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { investigateLocally } from './mock-investigation.ts'
import type { QueryContext } from '../src/domain/types.ts'
import type { CaseAction, InvestigationCase, MetricSample, QueueItem } from '../src/assistant/case-types.ts'

export class CaseError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status } }
const nonempty = (value: unknown, max = 2000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new CaseError('文本不能为空或过长。')
  return value.trim()
}
const number = (value: unknown, min: number, max: number, integer = true) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new CaseError('数值超出范围。')
  return value
}
function sample(value: MetricSample): MetricSample {
  if (!value || !['simulated', 'manual'].includes(value.source)) throw new CaseError('需标明模拟或人工录入数据。')
  return { interactions: number(value.interactions, 1, 1_000_000), puts: number(value.puts, 0, value.interactions), source: value.source }
}
function date(value: unknown): string {
  const result = nonempty(value, 40)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result))) throw new CaseError('日期格式无效。')
  return new Date(result).toISOString()
}

export function queueFor(cases: InvestigationCase[], now = new Date()): QueueItem[] {
  return cases.map(item => {
    const score = Math.round(100 * item.impact * item.reliability * item.actionability / item.cost) / 100
    let decision: QueueItem['decision'] = 'continue', reason = '有调查预算，按影响、可靠性、可行动性与成本排序。'
    if (item.status === 'closed') { decision = 'stop'; reason = '调查已结束。' }
    else if (item.status === 'observing') { decision = 'wait'; reason = item.intervention && now.getTime() >= Date.parse(item.intervention.observeUntil) ? '观察窗口已结束，请录入数据并复查。' : '等待干预观察窗口结束。' }
    else if (item.status === 'waiting_evidence') { decision = 'wait'; reason = '等待现场反馈或补充证据。' }
    else if (item.status === 'awaiting_decision') { decision = 'escalate'; reason = '需负责人选择干预、继续调查或结束。' }
    else if (item.runsUsed >= item.maxRuns) { decision = 'escalate'; reason = '调查预算已用完，需负责人调整预算或结束。' }
    return { caseId: item.id, title: item.title, status: item.status, score, decision, reason }
  }).sort((a, b) => b.score - a.score || a.caseId.localeCompare(b.caseId))
}

// A single-process local store. Serialize mutations, replace atomically, and never overwrite a corrupt file.
export class CaseStore {
  private tail: Promise<unknown> = Promise.resolve()
  private path: string
  private getContext: () => Promise<QueryContext>
  private clock: () => Date
  constructor(path: string, getContext: () => Promise<QueryContext>, clock = () => new Date()) {
    this.path = path; this.getContext = getContext; this.clock = clock
  }
  private async read(): Promise<InvestigationCase[]> {
    try {
      const data = JSON.parse(await readFile(this.path, 'utf8'))
      if (data.version !== 1 || !Array.isArray(data.cases) || !data.cases.every((c: InvestigationCase) => typeof c.id === 'string' && Number.isInteger(c.revision) && Array.isArray(c.history) && Array.isArray(c.processedCommands))) throw new Error('Invalid case store')
      return data.cases
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw new CaseError('调查存储文件损坏或不可读取；保留原文件，请检查。', 503)
    }
  }
  private mutate<T>(operation: (cases: InvestigationCase[]) => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      const cases = await this.read()
      const value = await operation(cases)
      await mkdir(dirname(this.path), { recursive: true })
      const temp = `${this.path}.${randomUUID()}.tmp`
      await writeFile(temp, JSON.stringify({ version: 1, cases }, null, 2), { mode: 0o600 })
      await rename(temp, this.path)
      return value
    })
    this.tail = result.catch(() => {})
    return result
  }
  async list() { await this.tail; return this.read() }
  async get(id: string) { const item = (await this.list()).find(c => c.id === id); if (!item) throw new CaseError('调查不存在。', 404); return item }
  async create(input: { title: string; question: string; owner: string; requestId: string }) {
    return this.mutate(async cases => {
      const requestId = nonempty(input.requestId, 100)
      const existing = cases.find(c => c.processedCommands.includes(requestId))
      if (existing) return existing
      const now = this.clock().toISOString()
      const item: InvestigationCase = { id: randomUUID(), title: nonempty(input.title, 120), question: nonempty(input.question), owner: nonempty(input.owner, 80),
        status: 'investigating', createdAt: now, updatedAt: now, revision: 1, impact: 3, reliability: 3, actionability: 3, cost: 2,
        maxRuns: 3, runsUsed: 0, tasks: [], hypotheses: [], reports: [], history: [{ at: now, action: 'create', detail: '创建调查；固定流程，不调用模型。' }], processedCommands: [requestId] }
      cases.push(item); return item
    })
  }
  private async apply(item: InvestigationCase, action: CaseAction) {
    if (!action || typeof action.type !== 'string') throw new CaseError('操作格式无效。')
    if (item.status === 'closed') throw new CaseError('调查已结束，不能继续修改。', 409)
    let detail = ''
    switch (action.type) {
      case 'investigate': {
        if (item.status !== 'investigating') throw new CaseError('当前状态不允许调查，请先处理待办或明确继续调查。', 409)
        if (item.runsUsed >= item.maxRuns) throw new CaseError('调查预算已用完。', 409)
        const context = await this.getContext()
        if (context.status !== 'ready') throw new CaseError('事件数据未完整加载，调查未执行且不消耗预算。', 503)
        const fingerprint = createHash('sha256').update(JSON.stringify({ question: item.question, events: context.events, shelves: context.shelves,
          feedback: item.tasks.filter(t => t.status === 'done').map(t => ({ id: t.id, feedback: t.feedback, outcome: t.outcome })) })).digest('hex')
        if (item.lastFingerprint === fingerprint) { item.status = 'awaiting_decision'; detail = '没有新证据，复用已保存报告；未重复消耗调查预算。'; break }
        item.report = investigateLocally(context, item.question)
        item.reports ??= []
        item.reports.push(item.report)
        item.lastFingerprint = fingerprint; item.runsUsed++
        if (!item.tasks.length) {
          const taskId = randomUUID()
          item.tasks.push({ id: taskId, title: '现场检查货架和价签，并人工核对代表性视频', status: 'open' })
          item.hypotheses.push({ explanation: '货架或价签可能影响交互行为，需现场检查，尚无因果证据。', status: 'unverified', taskId })
        }
        item.status = item.tasks.some(t => t.status === 'open') ? 'waiting_evidence' : 'awaiting_decision'
        detail = `保存第 ${item.runsUsed} 次调查和证据；${item.report.stopReason}`; break
      }
      case 'add_task': {
        if (item.status === 'observing') throw new CaseError('观察中请先完成复查。', 409)
        item.tasks.push({ id: randomUUID(), title: nonempty(action.title, 300), status: 'open' }); item.status = 'waiting_evidence'; detail = '登记补证据待办。'; break
      }
      case 'feedback': {
        const task = item.tasks.find(t => t.id === action.taskId)
        if (!task || task.status !== 'open') throw new CaseError('待办不存在或已完成。', 409)
        if (!['supports', 'refutes', 'unknown'].includes(action.outcome)) throw new CaseError('反馈判断无效。')
        task.feedback = nonempty(action.note); task.outcome = action.outcome; task.status = 'done'
        item.hypotheses.filter(h => h.taskId === task.id).forEach(h => { h.status = action.outcome === 'supports' ? 'supported' : action.outcome === 'refutes' ? 'refuted' : 'unverified' })
        item.status = item.tasks.some(t => t.status === 'open') ? 'waiting_evidence' : 'awaiting_decision'
        detail = `现场反馈：${task.feedback}；${action.outcome}（人工判断，非模型验证）。`; break
      }
      case 'resume': {
        if (item.status === 'observing' || item.tasks.some(t => t.status === 'open')) throw new CaseError('请先完成观察或待办。', 409)
        detail = `继续调查：${nonempty(action.reason)}`; item.status = 'investigating'; break
      }
      case 'close': item.status = 'closed'; detail = `结束原因：${nonempty(action.reason)}`; break
      case 'priority': {
        item.impact = number(action.impact, 1, 5); item.reliability = number(action.reliability, 1, 5)
        item.actionability = number(action.actionability, 1, 5); item.cost = number(action.cost, 1, 5)
        item.maxRuns = number(action.maxRuns, item.runsUsed, 20); detail = '负责人更新优先级参数和总调查预算。'; break
      }
      case 'intervention': {
        if (item.status !== 'awaiting_decision' || item.intervention) throw new CaseError('需完成调查及反馈后登记干预；评估计划不可覆盖。', 409)
        const startedAt = date(action.startedAt), observeUntil = date(action.observeUntil)
        if (Date.parse(observeUntil) <= Date.parse(startedAt)) throw new CaseError('观察结束时间需晚于开始时间。')
        item.intervention = { id: randomUUID(), description: nonempty(action.description), startedAt, observeUntil,
          minimumSamples: number(action.minimumSamples, 1, 1_000_000), improvementThreshold: number(action.improvementThreshold, 0.01, 1, false), baseline: sample(action.baseline), observations: [] }
        item.status = 'observing'; detail = '锁定干预评估计划；指标为 PUT BACK / 标注交互数，不代表销售转化。'; break
      }
      case 'observation': {
        const plan = item.intervention
        if (item.status !== 'observing' || !plan) throw new CaseError('当前没有待观察干预。', 409)
        const observedAt = date(action.observedAt), data = sample(action)
        if (Date.parse(observedAt) < Date.parse(plan.startedAt)) throw new CaseError('观察数据不能早于干预。')
        if (data.source === 'manual' && Date.parse(observedAt) > this.clock().getTime()) throw new CaseError('人工录入的观察时间不能在未来。')
        plan.observations.push({ ...data, id: randomUUID(), observedAt, note: nonempty(action.note) }); detail = `新增${data.source === 'simulated' ? '模拟' : '人工录入'}观察批次（应互不重叠）。`; break
      }
      case 'evaluate': {
        const plan = item.intervention
        if (item.status !== 'observing' || !plan) throw new CaseError('当前没有待复查干预。', 409)
        const observations = plan.observations
        const simulated = plan.baseline.source === 'simulated' || observations.some(o => o.source === 'simulated')
        const eligible = observations.filter(o => Date.parse(o.observedAt) >= Date.parse(plan.startedAt))
        const total = eligible.reduce((n, o) => n + o.interactions, 0), puts = eligible.reduce((n, o) => n + o.puts, 0)
        const windowEnded = this.clock().getTime() >= Date.parse(plan.observeUntil) || (simulated && eligible.some(o => o.source === 'simulated' && Date.parse(o.observedAt) >= Date.parse(plan.observeUntil)))
        const baselineRate = plan.baseline.puts / plan.baseline.interactions, afterRate = total ? puts / total : null
        const enough = windowEnded && total >= plan.minimumSamples && plan.baseline.interactions >= plan.minimumSamples
        const change = afterRate === null ? 0 : baselineRate - afterRate
        const outcome = !enough ? 'insufficient' : change >= plan.improvementThreshold - 1e-12 ? 'improved' : -change >= plan.improvementThreshold - 1e-12 ? 'worsened' : 'unchanged'
        plan.assessment = { outcome, baselineRate, afterRate, explanation: `${simulated ? '模拟复查' : '人工数据复查'}：${total} 次交互；${!enough ? '窗口未结束或样本不足，继续观察。' : '按预先锁定的绝对比例差阈值比较。'}前后变化不证明干预因果效果，需考虑对照与同期变化。` }
        item.status = enough ? 'awaiting_decision' : 'observing'; detail = plan.assessment.explanation; break
      }
      default: throw new CaseError('不支持的操作。')
    }
    item.revision++; item.updatedAt = this.clock().toISOString(); item.history.push({ at: item.updatedAt, action: action.type, detail })
  }
  async command(id: string, revision: number, requestId: string, action: CaseAction) {
    return this.mutate(async cases => {
      const item = cases.find(c => c.id === id); if (!item) throw new CaseError('调查不存在。', 404)
      const key = nonempty(requestId, 100)
      if (item.processedCommands.includes(key)) return item
      if (revision !== item.revision) throw new CaseError('调查已更新，请刷新后重试。', 409)
      await this.apply(item, action); item.processedCommands.push(key); return item
    })
  }
  async dispatch(requestId: string) {
    return this.mutate(async cases => {
      const key = nonempty(requestId, 100)
      const prior = cases.find(c => c.processedCommands.includes(key)); if (prior) return { selected: prior, queue: queueFor(cases, this.clock()) }
      const next = queueFor(cases, this.clock()).find(q => q.decision === 'continue')
      if (!next) return { selected: null, queue: queueFor(cases, this.clock()) }
      const item = cases.find(c => c.id === next.caseId)!
      await this.apply(item, { type: 'investigate' }); item.processedCommands.push(key)
      return { selected: item, queue: queueFor(cases, this.clock()) }
    })
  }
}
