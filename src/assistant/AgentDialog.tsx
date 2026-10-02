import { t, useLocale, querySource } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import type { AgentReply, UiCommand } from './commands'
import type { InvestigationResult } from './investigation-types'
import type { QueryContext } from '../domain/types'
import { answerQuery } from './rule-router'

type ServiceStatus = { provider: 'mock' | 'openai'; configured: boolean; model: string | null; dataStatus: string; errors: string[] }
const statusLabels: Record<InvestigationResult['status'], string> = {
  completed: '调查完成', insufficient_evidence: '关键证据不足', budget_reached: '达到预算', cancelled: '已取消', error: '调查失败',
}
const toolLabels: Record<string, string> = { query_events: '检索事件', aggregate_interactions: '统计交互',
  get_shelf_context: '获取货架信息', get_event_evidence: '定位视频证据', finish_investigation: '提交调查报告' }

export function AgentDialog({ context, onClose, execute }: { context: QueryContext; onClose: () => void; execute: (command: UiCommand) => void }) {
  useLocale()
  const [question, setQuestion] = useState(t('调查饮料区的放回行为，给我事实、证据和需要补充的信息'))
  const [mode, setMode] = useState<'investigation' | 'rules'>('investigation')
  const [service, setService] = useState<ServiceStatus | null>(null)
  const [serviceError, setServiceError] = useState('')
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<InvestigationResult | null>(null)
  const [reply, setReply] = useState<AgentReply | null>(null)
  const request = useRef<AbortController | null>(null)
  const statusRequest = useRef<AbortController | null>(null)

  const checkService = async () => {
    statusRequest.current?.abort()
    const controller = new AbortController(); statusRequest.current = controller
    setServiceError('')
    try {
      const response = await fetch('/api/agent/status', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) })
      if (!response.ok) throw new Error('unavailable')
      const data = await response.json() as ServiceStatus
      if (typeof data.configured !== 'boolean') throw new Error('invalid')
      setService(data)
    } catch { if (!controller.signal.aborted) { setService(null); setServiceError(t('调查服务未启动。启动服务后可重新检查；离线查询仍可使用。')) } }
  }
  useEffect(() => { void checkService(); return () => { statusRequest.current?.abort(); request.current?.abort() } }, [])
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const submit = async (value: string) => {
    if (!value.trim() || request.current) return
    setError(''); setReply(null); setResult(null)
    if (mode === 'rules') { setReply(answerQuery(context, querySource(value))); return }
    if (!service?.configured) { setError(t('调查服务未连接或未配置。')); return }
    const controller = new AbortController(); request.current = controller; setRunning(true)
    try {
      const response = await fetch('/api/agent/investigate', { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: querySource(value) }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '调查请求失败。')
      if (!data.report || !Array.isArray(data.steps) || !Array.isArray(data.evidence)) throw new Error(t('调查返回格式无效。'))
      if (!controller.signal.aborted) setResult(data as InvestigationResult)
    } catch (cause) {
      if (controller.signal.aborted) setError(t('调查已取消。'))
      else setError(cause instanceof Error ? cause.message : t('调查请求失败。'))
    } finally { if (request.current === controller) { request.current = null; setRunning(false) } }
  }
  const open = (command: UiCommand) => { execute(command); onClose() }
  const referenceButton = (ref: string) => {
    const evidence = result?.evidence.find(item => item.eventRef === ref)
    return evidence ? <button key={ref} type="button" onClick={() => open({ type: 'open_evidence', eventRef: ref })}>
    {evidence.shopperId} · {t(evidence.action)} · {evidence.seekTime.toFixed(2)}s →
    </button> : null
  }

  return <div className="agent-scrim" onMouseDown={onClose}>
    <section className="agent-dialog" role="dialog" aria-modal="true" aria-labelledby="agent-title" onMouseDown={event => event.stopPropagation()}>
    <div className="agent-dialog-head"><div><span>✦</span><strong id="agent-title">{t("ShelfTwin 调查助手")}</strong><small>{t("标注查询 → 证据定位 → 调查报告")}</small></div><button aria-label={t("关闭调查")} onClick={onClose}>×</button></div>
    <div className="agent-mode"><button disabled={running} className={mode === 'investigation' ? 'selected' : ''} onClick={() => { setMode('investigation'); setReply(null); setResult(null); setError('') }}>{service?.provider === 'openai' ? t('模型调查') : t('开发调查')}</button>
    <button disabled={running} className={mode === 'rules' ? 'selected' : ''} onClick={() => { setMode('rules'); setReply(null); setResult(null); setError('') }}>{t("离线查询")}</button></div>
    {mode === 'investigation' && <div className="agent-service" role="status">
    <span>{(serviceError ? t(serviceError) : '') || (!service ? t('正在连接调查服务…') : !service.configured ? t('模型尚未配置，请设置服务端密钥和模型。') : service.dataStatus !== 'ready' ? `${t('服务端数据未完整加载：')}${service.errors.join(', ')}` : service.provider === 'mock' ? t('本地固定流程已就绪，不调用模型。') : t('模型调查服务已就绪。'))}</span>
    <button disabled={running} onClick={() => void checkService()}>{t("重新检查")}</button>
    </div>}
    <form onSubmit={event => { event.preventDefault(); void submit(question) }}><input autoFocus maxLength={2000} disabled={running} value={question} onChange={event => setQuestion(event.target.value)} placeholder={t("描述希望调查的问题…")} />
    <button disabled={running || !question.trim() || (mode === 'investigation' && (!service?.configured || service.dataStatus !== 'ready'))} type="submit">{mode === 'investigation' ? t('开始调查') : t('查询')}</button></form>
    <div className="agent-suggestions">{[t('调查饮料区放回行为，列出证据与待验证假设'), t('比较饮料与零食货架的交互，并定位代表性证据'), t('这些数据能否判断某个商品销量下降的原因？')].map(value =>
        <button disabled={running} key={value} onClick={() => setQuestion(value)}>{value}</button>)}</div>
    {running && <div className="agent-progress" role="status"><span>{service?.provider === 'mock' ? t('正在执行本地固定调查流程…') : t('正在收集证据并整理报告，最多约两分钟…')}</span><button onClick={() => request.current?.abort()}>{t("取消调查")}</button></div>}
    {error && <p className="agent-error" role="alert">{t(error)}</p>}
    {reply && <div className="agent-answer"><p className="eyebrow">{t("离线规则查询")}</p><h2>{reply.title}</h2><p>{reply.body}</p><small>{reply.evidence}</small><div>{reply.actions.map(action => <button key={action.label} onClick={() => open(action.command)}>{action.label} →</button>)}</div></div>}
    {result && <div className="agent-answer agent-report">
    <p className="eyebrow">{t(statusLabels[result.status])}</p><small>{t("调查内容保留原文")}</small><h2>{result.report.title}</h2><p>{result.report.summary}</p>
    <h3>{t("事实与证据")}</h3>{result.report.findings.length ? result.report.findings.map((finding, index) => <article key={index}><p>{finding.statement}</p><div className="agent-citations">{finding.evidenceRefs.map(referenceButton)}</div></article>) : <p>{t("尚未形成可引用的事实结论。")}</p>}
    {!!result.report.hypotheses.length && <><h3>{t("待验证假设")}</h3>{result.report.hypotheses.map((hypothesis, index) => <article key={index}><p>{hypothesis.explanation}</p><small>{t("需要补充：")}{hypothesis.missingEvidence}</small>
    <p>{t("支持证据")}</p><div className="agent-citations">{hypothesis.supportRefs.length ? hypothesis.supportRefs.map(referenceButton) : <small>{t("尚无支持证据。")}</small>}</div>
    <p>{t("反向证据")}</p><div className="agent-citations">{hypothesis.counterEvidenceRefs.length ? hypothesis.counterEvidenceRefs.map(referenceButton) : <small>{t("尚未找到反向证据，不代表假设成立。")}</small>}</div></article>)}</>}
    <h3>{t("限制")}</h3><ul>{result.report.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul>
    <h3>{t("下一步")}</h3><ul>{result.report.nextSteps.map((item, i) => <li key={i}>{item}</li>)}</ul>
    {!result.report.findings.length && !!result.evidence.length && <><h3>{t("已定位的证据")}</h3><div className="agent-citations">{result.evidence.map(item => referenceButton(item.eventRef))}</div></>}
    <details><summary>{t("调查记录（")}{result.steps.length}{t(" 步）")}</summary><ol>{result.steps.map((step, i) => <li key={i}><b>{t(toolLabels[step.tool] ?? step.tool)} · {step.status === 'ok' ? t('成功') : t('失败')}</b><p>{step.detail}</p>{Object.keys(step.arguments).length > 0 && <code>{JSON.stringify(step.arguments)}</code>}</li>)}</ol></details>
    <small>{result.stopReason} · {result.usage.toolCalls}{t(" 次工具调用 · ")}{result.execution === 'mock' ? t('本地执行，无模型请求') : `${result.usage.modelRequests} ${t('次模型请求')} · ${t('输入')} ${result.usage.inputTokens} / ${t('输出')} ${result.usage.outputTokens} tokens`} · {(result.usage.elapsedMs / 1000).toFixed(1)}{t(" 秒")}</small>
    </div>}
    <p className="agent-footnote">{mode === 'rules' ? t('离线查询使用本地事件数据，无模型调用。') : service?.provider === 'openai' ? t('模型读取策展样本的结构化标注，尚未观看视频。每次调查独立，不保存长期 Case。') : t('开发模式固定调查步骤和报告模板，计数与引用读取真实本地数据，不请求外部模型。仅支持预设问题类型。')}</p>
    </section>
    </div>
}
