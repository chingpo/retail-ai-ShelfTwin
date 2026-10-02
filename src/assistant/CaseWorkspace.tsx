import { t, useLocale, formatDate, querySource } from '../i18n'
import { useEffect, useState } from 'react'
import type { CaseAction, InvestigationCase, QueueItem } from './case-types'
import type { UiCommand } from './commands'
import './cases.css'
import { CaseExamples, type CaseExample } from './CaseExamples'

const labels = { investigating: '调查中', waiting_evidence: '等待证据', awaiting_decision: '待负责人决策', observing: '观察干预', closed: '已结束' }
const decisions = { continue: '可推进', wait: '等待', escalate: '需决策', stop: '停止' }
const outcomes = { improved: '放回比例下降', worsened: '放回比例上升', unchanged: '无明显变化', insufficient: '证据不足' }
const percent = (n: number | null) => n === null ? t('暂无数据') : `${(n * 100).toFixed(1)}%`
const dateInput = formatDate

export function CaseWorkspace({ onClose, execute }: { onClose: () => void; execute: (command: UiCommand) => void }) {
  useLocale()
  const [cases, setCases] = useState<InvestigationCase[]>([]), [queue, setQueue] = useState<QueueItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [title, setTitle] = useState(t('饮料区放回调查')), [question, setQuestion] = useState(t('调查饮料区的放回行为，列出证据和需要补充的信息')), [owner, setOwner] = useState(t('门店负责人'))
  const [templateLoaded, setTemplateLoaded] = useState(false)
  const useExample = (example: CaseExample) => {
    setTitle(t(example.title)); setQuestion(t(example.question)); setDescription(t(example.intervention))
    setSelectedId(null); setTemplateLoaded(true)
  }
  const [taskTitle, setTaskTitle] = useState(''), [feedback, setFeedback] = useState<Record<string, string>>({}), [feedbackOutcome, setFeedbackOutcome] = useState<Record<string, 'supports' | 'refutes' | 'unknown'>>({})
  const [reason, setReason] = useState(t('已检查现有证据，继续补充调查。'))
  const [description, setDescription] = useState(t('调整饮料区价签（模拟演练）'))
  const [days, setDays] = useState(7), [minimumSamples, setMinimumSamples] = useState(30), [threshold, setThreshold] = useState(10)
  const [baselineN, setBaselineN] = useState(100), [baselinePuts, setBaselinePuts] = useState(30), [sampleSource, setSampleSource] = useState<'simulated' | 'manual'>('simulated')
  const [afterN, setAfterN] = useState(100), [afterPuts, setAfterPuts] = useState(15), [note, setNote] = useState(t('模拟观察批次；非真实经营结果。'))
  const [observedAt, setObservedAt] = useState(new Date().toISOString().slice(0, 16))
  const [impact, setImpact] = useState(3), [reliability, setReliability] = useState(3), [actionability, setActionability] = useState(3), [cost, setCost] = useState(2), [maxRuns, setMaxRuns] = useState(3)
  const selected = cases.find(c => c.id === selectedId)
  async function api(path: string, value?: unknown) {
    const response = await fetch(`/api/agent${path}`, { method: value === undefined ? 'GET' : 'POST', headers: value === undefined ? {} : { 'Content-Type': 'application/json' }, body: value === undefined ? undefined : JSON.stringify(value) })
    let result
    try { result = await response.json() } catch { throw new Error(t('工作台服务未连接，请运行 npm run dev:agent。')) }
    if (!response.ok) throw new Error(result.error ?? '请求失败。')
    return result
  }
  async function refresh() {
    const [a, b] = await Promise.all([api('/cases'), api('/queue')]); setCases(a.cases); setQueue(b.queue)
  }
  async function perform(work: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError('')
    try { await work(); await refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : t('操作失败。')); try { await refresh() } catch {} }
    finally { setBusy(false) }
  }
  useEffect(() => { void refresh().catch(cause => setError(cause.message)) }, [])
  useEffect(() => {
    if (selected) { setImpact(selected.impact); setReliability(selected.reliability); setActionability(selected.actionability); setCost(selected.cost); setMaxRuns(selected.maxRuns) }
  }, [selected?.id, selected?.revision])
  useEffect(() => { const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape) }, [onClose])
  const command = (action: CaseAction) => perform(async () => { if (selected) await api(`/cases/${selected.id}/commands`, { action, revision: selected.revision, requestId: crypto.randomUUID() }) })
  const numeric = (label: string, value: number, set: (n: number) => void, max = 5, min = 1) => <label>{t(label)}<input type="number" min={min} max={max} required value={value} onChange={e => set(Number(e.target.value))} /></label>
  return <div className="case-scrim" onMouseDown={onClose}><section className="case-workspace" role="dialog" aria-modal="true" aria-labelledby="case-workspace-title" onMouseDown={e => e.stopPropagation()}>
    <header><div><h2 id="case-workspace-title">{t("调查工作台")}</h2><p>{t("保存 Case → 现场反馈 → 干预复查 → 队列调度 · 本地固定流程，无模型调用")}</p></div><button aria-label={t("关闭工作台")} onClick={onClose}>×</button></header>
    {error && <p className="case-error" role="alert">{t(error)}</p>}
    <div className="case-columns"><aside>
    <form onSubmit={e => { e.preventDefault(); void perform(async () => { const item = await api('/cases', { title, question: querySource(question), owner, requestId: crypto.randomUUID() }); setSelectedId(item.id) }) }}>
    <h3>{t("创建调查")}</h3>{templateLoaded && <p className="case-template-loaded" role="status">{t("模板已填入，可修改后创建。")}</p>}<label>{t("标题")}<input required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></label><label>{t("目标")}<textarea required maxLength={2000} value={question} onChange={e => setQuestion(e.target.value)} /></label><label>{t("负责人")}<input required maxLength={80} value={owner} onChange={e => setOwner(e.target.value)} /></label><button disabled={busy}>{t("创建 Case")}</button>
    </form>
    <button type="button" className="case-gallery-link" onClick={() => setSelectedId(null)}>{t("浏览场景模板")} ↗</button>
    <h3>{t("调查队列")}</h3><p className="case-note">{t("优先分数 = 影响 × 可靠性 × 可行动性 ÷ 成本。等待和已结束项不会被自动推进。")}</p>
    <button disabled={busy} onClick={() => void perform(async () => { const result = await api('/dispatch', { requestId: crypto.randomUUID() }); if (result.selected) setSelectedId(result.selected.id); else setError(t('没有可推进的调查，请处理反馈、决策或预算。')) })}>{t("推进最高优先级的一项")}</button>
    <button disabled={busy} onClick={() => void perform(async () => {})}>{t("刷新")}</button>
    {queue.map(item => <button key={item.caseId} className={`case-list-item ${selectedId === item.caseId ? 'selected' : ''}`} onClick={() => setSelectedId(item.caseId)}><strong>{item.title}</strong><span>{t(labels[item.status])} · {t(decisions[item.decision])} · {item.score}</span><small>{item.reason}</small></button>)}
    {!queue.length && <p>{t("尚无调查，创建后即可保存并继续跟进。")}</p>}
    </aside><div className="case-detail">{selected ? <>
    <h2>{selected.title}</h2><p>{selected.question}</p><p className="case-badge">{t(labels[selected.status])} · {selected.owner}{t(" · 预算 ")}{selected.runsUsed}/{selected.maxRuns}{t(" 次 · 更新 ")}{dateInput(selected.updatedAt)}</p>
    {selected.report && <section className="case-section"><h3>{t("已保存的事实与证据")}</h3><small>{t("调查内容保留原文")}</small><p>{selected.report.report.summary}</p>{selected.report.report.findings.map((f, index) => <article key={index}><p>{f.statement}</p>{f.evidenceRefs.map(ref => { const ev = selected.report!.evidence.find(e => e.eventRef === ref); return ev && <button key={ref} onClick={() => { execute({ type: 'open_evidence', eventRef: ref }); onClose() }}>{ev.shopperId} · {t(ev.action)} · {ev.seekTime.toFixed(2)}s →</button> })}</article>)}<ul>{selected.report.report.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul></section>}
    <fieldset disabled={busy || selected.status === 'closed'}>
    <div className="case-actions"><button disabled={selected.status !== 'investigating'} onClick={() => void command({ type: 'investigate' })}>{t("执行本地调查")}</button></div>
    <section className="case-section"><h3>{t("待办与现场反馈")}</h3>{selected.tasks.map(task => <article key={task.id}><strong>{task.title} · {task.status === 'done' ? t('已完成') : t('等待反馈')}</strong>{task.status === 'done' ? <p>{task.feedback}{t(" · 人工判断：")}{task.outcome === 'supports' ? t('支持假设') : task.outcome === 'refutes' ? t('反驳假设') : t('暂不能判断')}</p> : <div><textarea aria-label={t("现场反馈")} placeholder={t("填写现场检查结果")} value={feedback[task.id] ?? ''} onChange={e => setFeedback({ ...feedback, [task.id]: e.target.value })} /><select aria-label={t("假设判断")} value={feedbackOutcome[task.id] ?? 'unknown'} onChange={e => setFeedbackOutcome({ ...feedbackOutcome, [task.id]: e.target.value as 'supports' | 'refutes' | 'unknown' })}><option value="unknown">{t("暂不能判断假设")}</option><option value="supports">{t("人工判断：支持假设")}</option><option value="refutes">{t("人工判断：反驳假设")}</option></select><button disabled={!feedback[task.id]?.trim()} onClick={() => void command({ type: 'feedback', taskId: task.id, note: feedback[task.id], outcome: feedbackOutcome[task.id] ?? 'unknown' })}>{t("保存反馈")}</button></div>}</article>)}
    <div className="case-inline"><input aria-label={t("新待办")} placeholder={t("新增补证据待办")} value={taskTitle} onChange={e => setTaskTitle(e.target.value)} /><button disabled={!taskTitle.trim() || selected.status === 'observing'} onClick={() => void command({ type: 'add_task', title: taskTitle })}>{t("登记待办")}</button></div>
    {selected.hypotheses.map((h, i) => <p key={i}>{t("假设：")}{h.explanation} · {h.status === 'refuted' ? t('已被人工反馈反驳') : h.status === 'supported' ? t('人工反馈支持，尚非因果结论') : t('待验证')}</p>)}
    </section>
    {selected.status === 'awaiting_decision' && !selected.intervention && <form className="case-section" onSubmit={e => { e.preventDefault(); const start = new Date(); void command({ type: 'intervention', description, startedAt: start.toISOString(), observeUntil: new Date(start.getTime() + days * 86400000).toISOString(), minimumSamples, improvementThreshold: threshold / 100, baseline: { interactions: baselineN, puts: baselinePuts, source: sampleSource } }) }}>
    <h3>{t("登记干预和评估计划")}</h3><p>{t("保存后锁定窗口、阈值与基线。指标是放回事件 / 交互事件，不能解释为商品退回率或销售转化。")}</p><label>{t("措施")}<input required value={description} onChange={e => setDescription(e.target.value)} /></label><label>{t("数据来源")}<select value={sampleSource} onChange={e => setSampleSource(e.target.value as 'simulated' | 'manual')}><option value="simulated">{t("模拟演练")}</option><option value="manual">{t("人工录入，未经独立验证")}</option></select></label><div className="case-inputs">{numeric(t('观察天数'), days, setDays, 365)}{numeric(t('最小样本数'), minimumSamples, setMinimumSamples, 1000000)}{numeric(t('变化阈值（百分点）'), threshold, setThreshold, 100)}{numeric(t('基线交互数'), baselineN, setBaselineN, 1000000)}{numeric(t('基线放回数'), baselinePuts, setBaselinePuts, baselineN, 0)}</div><button>{t("保存并开始观察")}</button>
    </form>}
    {selected.intervention && <section className="case-section"><h3>{t("干预复查 · ")}{selected.intervention.baseline.source === 'simulated' ? t('包含模拟数据') : t('人工录入数据')}</h3><p>{selected.intervention.description}</p><p>{t("窗口：")}{dateInput(selected.intervention.startedAt)} → {dateInput(selected.intervention.observeUntil)}{t(" · 最少 ")}{selected.intervention.minimumSamples}{t(" 样本 · 阈值 ")}{selected.intervention.improvementThreshold * 100}{t(" 个百分点")}</p><p>{t("基线：")}{selected.intervention.baseline.interactions}{t(" 次交互 / ")}{selected.intervention.baseline.puts}{t(" 次放回")}</p>
    {selected.status === 'observing' && <form onSubmit={e => { e.preventDefault(); void command({ type: 'observation', observedAt: sampleSource === 'simulated' ? selected.intervention!.observeUntil : `${observedAt}:00Z`, interactions: afterN, puts: afterPuts, source: sampleSource, note }) }}><h4>{t("录入独立、互不重叠的观察批次")}</h4><label>{t("来源")}<select value={sampleSource} onChange={e => setSampleSource(e.target.value as 'simulated' | 'manual')}><option value="simulated">{t("模拟窗口结束后的数据")}</option><option value="manual">{t("人工录入，未经独立验证")}</option></select></label>{sampleSource === 'manual' && <label>{t("批次观察时间（UTC）")}<input required type="datetime-local" value={observedAt} onChange={e => setObservedAt(e.target.value)} /></label>}<div className="case-inputs">{numeric(t('观察交互数'), afterN, setAfterN, 1000000)}{numeric(t('观察放回数'), afterPuts, setAfterPuts, afterN, 0)}</div><label>{t("批次说明")}<input required value={note} onChange={e => setNote(e.target.value)} /></label><button>{t("保存观察批次")}</button><button type="button" onClick={() => void command({ type: 'evaluate' })}>{t("按锁定计划复查")}</button></form>}
    {selected.intervention.observations.map(o => <p key={o.id}>{o.source === 'simulated' ? t('模拟') : t('人工录入')} · {dateInput(o.observedAt)} · {o.interactions}{t(" 次交互 / ")}{o.puts}{t(" 次放回 · ")}{o.note}</p>)}
    {selected.intervention.assessment && <div className="case-assessment"><strong>{t(outcomes[selected.intervention.assessment.outcome])}</strong><p>{percent(selected.intervention.assessment.baselineRate)} → {percent(selected.intervention.assessment.afterRate)}</p><p>{selected.intervention.assessment.explanation}</p></div>}
    </section>}
    <section className="case-section"><h3>{t("负责人决策")}</h3><label>{t("继续 / 结束原因")}<textarea value={reason} onChange={e => setReason(e.target.value)} /></label><button disabled={!reason.trim() || selected.status === 'observing' || selected.tasks.some(t => t.status === 'open')} onClick={() => void command({ type: 'resume', reason })}>{t("继续调查")}</button><button disabled={!reason.trim()} onClick={() => void command({ type: 'close', reason })}>{t("结束 Case")}</button></section>
    <form className="case-section" onSubmit={e => { e.preventDefault(); void command({ type: 'priority', impact, reliability, actionability, cost, maxRuns }) }}><h3>{t("队列优先级与预算")}</h3><div className="case-inputs">{numeric(t('影响'), impact, setImpact)}{numeric(t('证据可靠性'), reliability, setReliability)}{numeric(t('可行动性'), actionability, setActionability)}{numeric(t('调查成本'), cost, setCost)}{numeric(t('总调查次数'), maxRuns, setMaxRuns, 20, selected.runsUsed)}</div><button>{t("保存调度参数")}</button></form>
    </fieldset>
    {selected.reports?.length > 1 && <details className="case-section"><summary>{t("历次报告与证据（")}{selected.reports.length}{t(" 次）")}</summary>{selected.reports.map((report, index) => <article key={index}><h3>{t("第 ")}{index + 1}{t(" 次调查")}</h3><p>{report.report.summary}</p>{report.report.findings.map((f, i) => <p key={i}>{f.statement}</p>)}{report.evidence.map(ev => <button key={ev.eventRef} onClick={() => { execute({ type: 'open_evidence', eventRef: ev.eventRef }); onClose() }}>{ev.shopperId} · {t(ev.action)} · {ev.seekTime.toFixed(2)}s →</button>)}</article>)}</details>}
    <details className="case-section"><summary>{t("完整历史（")}{selected.history.length}{t(" 条）")}</summary><ol>{selected.history.map((h, i) => <li key={i}><small>{dateInput(h.at)} · {h.action}</small><p>{h.detail}</p></li>)}</ol></details>
    </> : <CaseExamples onUse={useExample} />}</div></div>
    </section></div>
}
