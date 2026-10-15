import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { investigateLocally } from './mock-investigation.ts'
import type { QueryContext } from '../src/domain/types.ts'
import type { CaseAction, InvestigationCase, MetricSample, QueueItem } from '../src/assistant/case-types.ts'
import type { InvestigationResult } from '../src/assistant/investigation-types.ts'
import type { InvestigationLocale } from '../src/assistant/investigation-types.ts'

export class CaseError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status } }
export interface CasePersistence {
  read(): Promise<InvestigationCase[]>
  mutate<T>(operation: (cases: InvestigationCase[]) => Promise<T>): Promise<T>
}
const nonempty = (value: unknown, max = 2000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new CaseError('文本不能为空或过长。')
  return value.trim()
}
const number = (value: unknown, min: number, max: number, integer = true) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new CaseError('数值超出范围。')
  return value
}
const caseCopy = (locale: InvestigationLocale | undefined, zh: string, ja: string, en: string, ko: string) => ({ zh, ja, en, ko })[locale ?? 'zh']
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
  private persistence?: CasePersistence
  private runModelInvestigation?: (question: string, context: QueryContext, locale: InvestigationLocale) => Promise<InvestigationResult>
  private modelBusy = false
  constructor(path: string, getContext: () => Promise<QueryContext>, clock = () => new Date(), persistence?: CasePersistence,
    runModelInvestigation?: (question: string, context: QueryContext, locale: InvestigationLocale) => Promise<InvestigationResult>) {
    this.path = path; this.getContext = getContext; this.clock = clock; this.runModelInvestigation = runModelInvestigation
    this.persistence = persistence
  }
  private async read(): Promise<InvestigationCase[]> {
    if (this.persistence) return this.persistence.read()
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
      if (this.persistence) return this.persistence.mutate(operation)
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
  async create(input: { title: string; question: string; owner: string; requestId: string; locale?: InvestigationLocale }) {
    return this.mutate(async cases => {
      const requestId = nonempty(input.requestId, 100)
      const existing = cases.find(c => c.processedCommands.includes(requestId))
      if (existing) return existing
      const now = this.clock().toISOString()
      const locale: InvestigationLocale = ['zh', 'ja', 'en', 'ko'].includes(input.locale ?? '') ? input.locale! : 'zh'
      const item: InvestigationCase = { id: randomUUID(), title: nonempty(input.title, 120), question: nonempty(input.question), owner: nonempty(input.owner, 80), locale,
        status: 'investigating', createdAt: now, updatedAt: now, revision: 1, impact: 3, reliability: 3, actionability: 3, cost: 2,
        maxRuns: 3, runsUsed: 0, tasks: [], hypotheses: [], reports: [], history: [{ at: now, action: 'create', detail: this.runModelInvestigation
          ? caseCopy(locale, '创建持续跟进 Case，首次调查将调用 AI。', '継続調査 Case を作成しました。初回調査では AI を実行します。', 'Follow-up case created; the initial investigation will use AI.', '후속 조사 Case를 만들었습니다. 초기 조사에서 AI를 실행합니다.')
          : caseCopy(locale, '创建调查；固定流程，不调用模型。', '調査を作成しました。固定ルールを使用し、モデルは呼び出しません。', 'Investigation created; fixed workflow, no model call.', '조사를 만들었습니다. 고정 워크플로를 사용하며 모델을 호출하지 않습니다.') }], processedCommands: [requestId] }
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
        const fingerprint = createHash('sha256').update(JSON.stringify({ question: item.question, locale: item.locale ?? 'zh', events: context.events, shelves: context.shelves,
          feedback: item.tasks.filter(t => t.status === 'done').map(t => ({ id: t.id, feedback: t.feedback, outcome: t.outcome })) })).digest('hex')
        if (item.lastFingerprint === fingerprint) { item.status = 'awaiting_decision'; detail = '没有新证据，复用已保存报告；未重复消耗调查预算。'; break }
        item.report = investigateLocally(context, item.question, undefined, item.locale ?? 'zh')
        item.reports ??= []
        item.reports.push(item.report)
        item.lastFingerprint = fingerprint; item.runsUsed++
        if (!item.tasks.length) {
          const taskId = randomUUID()
          item.tasks.push({ id: taskId, title: caseCopy(item.locale, '现场检查货架和价签，并人工核对代表性视频', '売場と値札を現場で確認し、代表的な動画を人が照合する', 'Inspect the shelf and price label, then manually review representative clips', '매대와 가격표를 현장에서 확인하고 대표 영상을 직접 검토하기'), status: 'open' })
          item.hypotheses.push({ explanation: caseCopy(item.locale, '货架或价签可能影响交互行为，需现场检查，尚无因果证据。', '棚や値札が行動に影響している可能性があります。現場確認が必要で、因果関係を示す証拠はまだありません。', 'The shelf or price label may influence interactions. Verify on site; no causal evidence is available yet.', '매대나 가격표가 상호작용에 영향을 줄 가능성이 있습니다. 현장 확인이 필요하며 아직 인과 증거는 없습니다.'), status: 'unverified', taskId })
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
  async command(id: string, revision: number, requestId: string, action: CaseAction, requestedLocale?: InvestigationLocale) {
    if (action?.type === 'investigate' && this.runModelInvestigation) return this.investigateWithModel(id, revision, requestId, requestedLocale)
    return this.mutate(async cases => {
      const item = cases.find(c => c.id === id); if (!item) throw new CaseError('调查不存在。', 404)
      const key = nonempty(requestId, 100)
      if (item.processedCommands.includes(key)) return item
      if (revision !== item.revision) throw new CaseError('调查已更新，请刷新后重试。', 409)
      await this.apply(item, action); item.processedCommands.push(key); return item
    })
  }
  private async investigateWithModel(id: string, revision: number, requestId: string, requestedLocale?: InvestigationLocale): Promise<InvestigationCase> {
    let runId = ''
    const prepared = await this.mutate(async cases => {
      const item = cases.find(c => c.id === id); if (!item) throw new CaseError('调查不存在。', 404)
      if (!item.locale && requestedLocale && ['zh', 'ja', 'en', 'ko'].includes(requestedLocale)) item.locale = requestedLocale
      const key = nonempty(requestId, 100)
      if (item.processedCommands.includes(key)) return { item, run: false }
      if (revision !== item.revision) throw new CaseError('调查已更新，请刷新后重试。', 409)
      if (item.pendingInvestigation) {
        if (this.clock().getTime() - Date.parse(item.pendingInvestigation.startedAt) < 180_000) throw new CaseError('此 Case 的 AI 调查仍在运行，请稍后刷新。', 409)
        item.pendingInvestigation = undefined
      }
      if (item.status !== 'investigating') throw new CaseError('当前状态不允许调查，请先处理待办或明确继续调查。', 409)
      if (item.runsUsed >= item.maxRuns) throw new CaseError('调查预算已用完。', 409)
      const context = await this.getContext()
      if (context.status !== 'ready') throw new CaseError('事件数据未完整加载，调查未执行且不消耗预算。', 503)
      const fingerprint = createHash('sha256').update(JSON.stringify({ question: item.question, locale: item.locale ?? 'zh', events: context.events, shelves: context.shelves,
        feedback: item.tasks.filter(t => t.status === 'done').map(t => ({ id: t.id, feedback: t.feedback, outcome: t.outcome })) })).digest('hex')
      if (item.lastFingerprint === fingerprint) {
        await this.apply(item, { type: 'investigate' }); item.processedCommands.push(key)
        return { item, run: false }
      }
      runId = randomUUID()
      const now = this.clock().toISOString()
      item.pendingInvestigation = { runId, requestId: key, startedAt: now }
      item.revision++; item.updatedAt = now
      item.history.push({ at: now, action: 'investigate_started', detail: caseCopy(item.locale, '开始 AI 证据调查；正在读取标注、统计交互并定位代表性视频证据。', 'AI 証拠調査を開始しました。注釈とインタラクションを確認し、代表的な動画証拠を特定しています。', 'AI evidence investigation started; reviewing annotations, interaction counts, and representative video evidence.', 'AI 증거 조사를 시작했습니다. 주석과 상호작용을 확인하고 대표 영상 증거를 찾고 있습니다.') })
        return { item, run: true, fingerprint, context }
    })
    if (!prepared.run) return prepared.item
    if (!prepared.context || !prepared.fingerprint) throw new CaseError('调查上下文未就绪，请重试。', 503)
    if (this.modelBusy) {
      await this.clearPending(id, runId, '已有 AI 调查正在运行，本次请求未启动。')
      throw new CaseError('已有 AI 调查正在运行，请稍后重试。', 429)
    }
    this.modelBusy = true
    try {
      const result = await this.runModelInvestigation!(prepared.item.question, prepared.context, prepared.item.locale ?? 'zh')
      if (result.status === 'error' || result.status === 'cancelled') throw new CaseError(`AI 调查未完成：${result.stopReason}`, 503)
      return await this.mutate(async cases => {
        const item = cases.find(c => c.id === id); if (!item) throw new CaseError('调查不存在。', 404)
        if (item.pendingInvestigation?.runId !== runId) throw new CaseError('调查锁已变化，未保存旧结果，请刷新 Case。', 409)
        const key = item.pendingInvestigation.requestId
        item.report = result; item.reports ??= []; item.reports.push(result)
        item.lastFingerprint = prepared.fingerprint
        item.runsUsed++
        if (!item.tasks.length) {
          const taskId = randomUUID()
          item.tasks.push({ id: taskId, title: caseCopy(item.locale, '现场检查货架和价签，并人工核对代表性视频', '売場と値札を現場で確認し、代表的な動画を人が照合する', 'Inspect the shelf and price label, then manually review representative clips', '매대와 가격표를 현장에서 확인하고 대표 영상을 직접 검토하기'), status: 'open' })
          item.hypotheses.push({ explanation: caseCopy(item.locale, '货架或价签可能影响交互行为，需现场检查，尚无因果证据。', '棚や値札が行動に影響している可能性があります。現場確認が必要で、因果関係を示す証拠はまだありません。', 'The shelf or price label may influence interactions. Verify on site; no causal evidence is available yet.', '매대나 가격표가 상호작용에 영향을 줄 가능성이 있습니다. 현장 확인이 필요하며 아직 인과 증거는 없습니다.'), status: 'unverified', taskId })
        }
        item.pendingInvestigation = undefined
        item.status = item.tasks.some(t => t.status === 'open') ? 'waiting_evidence' : 'awaiting_decision'
        item.revision++; item.updatedAt = this.clock().toISOString()
        item.history.push({ at: item.updatedAt, action: 'investigate', detail: caseCopy(item.locale, `AI 调查已保存；${result.execution} · ${result.usage.modelRequests} 次模型请求 · ${result.usage.toolCalls} 次工具调用 · ${result.stopReason}`, `AI 調査を保存しました；${result.execution} · モデル要求 ${result.usage.modelRequests} 回 · ツール呼び出し ${result.usage.toolCalls} 回 · ${result.stopReason}`, `AI investigation saved; ${result.execution} · ${result.usage.modelRequests} model requests · ${result.usage.toolCalls} tool calls · ${result.stopReason}`, `AI 조사 저장됨; ${result.execution} · 모델 요청 ${result.usage.modelRequests}회 · 도구 호출 ${result.usage.toolCalls}회 · ${result.stopReason}`) })
        item.processedCommands.push(key)
        return item
      })
    } catch (error) {
      await this.clearPending(id, runId, error instanceof Error ? error.message : 'AI 调查失败。')
      throw error instanceof CaseError ? error : new CaseError('AI 调查失败，Case 保留，可稍后重试。', 503)
    } finally { this.modelBusy = false }
  }
  private async clearPending(id: string, runId: string, reason: string) {
    await this.mutate(async cases => {
      const item = cases.find(c => c.id === id)
      if (!item || item.pendingInvestigation?.runId !== runId) return
      item.pendingInvestigation = undefined; item.revision++; item.updatedAt = this.clock().toISOString()
      item.history.push({ at: item.updatedAt, action: 'investigate_failed', detail: reason.slice(0, 300) })
    })
  }
  async dispatch(requestId: string) {
    if (this.runModelInvestigation) {
      const cases = await this.list()
      const prior = cases.find(c => c.processedCommands.includes(nonempty(requestId, 100)))
      if (prior) return { selected: prior, queue: queueFor(cases, this.clock()) }
      const next = queueFor(cases, this.clock()).find(q => q.decision === 'continue')
      if (!next) return { selected: null, queue: queueFor(cases, this.clock()) }
      const item = cases.find(c => c.id === next.caseId)!
      const selected = await this.command(item.id, item.revision, requestId, { type: 'investigate' })
      return { selected, queue: queueFor(await this.list(), this.clock()) }
    }
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
