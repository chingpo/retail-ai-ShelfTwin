import { aggregateInteractions, getEventEvidence, queryEvents } from '../src/domain/queries.ts'
import { runTool } from '../src/assistant/tools.ts'
import type { QueryContext } from '../src/domain/types.ts'
import type { Evidence, InvestigationResult, InvestigationStep } from '../src/assistant/investigation-types.ts'

// Deterministic development workflow: real tools and data, no model/network requests.
export function investigateLocally(context: QueryContext, question: string, signal?: AbortSignal): InvestigationResult {
  const start = Date.now()
  const steps: InvestigationStep[] = []
  const evidence: Evidence[] = []
  const report: InvestigationResult['report'] = { title: '固定流程调查', summary: '', findings: [], hypotheses: [],
    limitations: ['开发模式使用固定规则和报告模板，不调用模型。', '独立策展样本，不能代表同店经营表现。',
      '货架为演示映射，商品为陈列候选。', '读取标注并定位视频，尚未观看原始视频。'], nextSteps: [] }
  const finish = (status: InvestigationResult['status'], reason: string): InvestigationResult => ({ execution: 'mock', status,
    stopReason: reason, report, evidence, steps, usage: { modelRequests: 0, toolCalls: steps.length,
      inputTokens: 0, outputTokens: 0, elapsedMs: Date.now() - start } })
  if (signal?.aborted) return finish('cancelled', '调查已取消。')
  if (context.status !== 'ready') { report.summary = '数据未完整加载，暂不生成统计结论。'; return finish('insufficient_evidence', report.summary) }
  const query = question.toLowerCase()
  const aliases = [ ['Beverages', /饮料|beverage/], ['Snacks', /零食|snack/], ['Breakfast', /早餐|breakfast/],
    ['Pantry', /食品储藏|酱料|pantry/], ['Produce', /果蔬|水果|produce/], ['Dairy', /乳品|奶制品|dairy/] ] as const
  const categories = aliases.filter(([, pattern]) => pattern.test(query)).map(([category]) => category)
  const puts = /放回|put.?back|return/.test(query)
  const missing = /原因|为什么|为何|销量|销售|异常|转化|购买|配对|同一|拿了又|拿取后/.test(query)
  if (!categories.length && !puts && !missing && !/总结|概览|活动|交互|summary|activity|interaction/.test(query)) {
    report.summary = '固定流程暂不支持这个问题，请选择下方的预设调查示例。'
    report.nextSteps = ['尝试货架放回、品类交互比较或样本活动概览。']
    return finish('insufficient_evidence', '问题超出固定规则范围。')
  }
  const execute = (name: string, args: Record<string, unknown>) => {
    const result = runTool(context, name, args)
    steps.push({ round: steps.length + 1, tool: name, arguments: args, status: 'ok', detail: `${result.evidence_refs.length} 条证据引用` })
    return result
  }
  const selectedCategories: (string | undefined)[] = categories.length ? categories.slice(0, 2) : [undefined]
  for (const category of selectedCategories) {
    const aggregate = execute('aggregate_interactions', { ...(category ? { category } : {}), sortBy: puts ? 'puts' : 'interactions', limit: 1 }) as ReturnType<typeof aggregateInteractions>
    const cluster = aggregate.result.clusters[0]
    if (!cluster || !cluster.events.length || (puts && !cluster.puts)) continue
    execute('get_shelf_context', { shelfId: cluster.shelf.id })
    const matches = execute('query_events', { shelfId: cluster.shelf.id, ...(puts ? { action: 'PUT BACK' } : {}), limit: 1 }) as ReturnType<typeof queryEvents>
    const event = matches.result.events[0]
    if (!event) continue
    const resolved = execute('get_event_evidence', { eventRef: event.eventRef }) as ReturnType<typeof getEventEvidence>
    if (!resolved.result) continue
    evidence.push(resolved.result)
    report.findings.push({ statement: `${cluster.shelf.name}：${cluster.events.length} 次标注交互，${cluster.shoppers} 条样本轨迹；${cluster.picks} 次拿取，${cluster.puts} 次放回。引用为代表性片段；计数来自货架聚合工具。`, evidenceRefs: [event.eventRef] })
  }
  report.title = categories.length > 1 ? '品类交互比较（固定流程）' : puts ? '货架放回调查（固定流程）' : '样本活动调查（固定流程）'
  if (missing) {
    report.summary = '可整理现有标注，但缺少同店连续数据、销售记录或可靠商品配对，不能判断经营原因、异常性或拿取后放回关系。'
    report.nextSteps = ['人工查看引用视频，核对可观察动作。', '补充同店基线、POS 或连续轨迹，再验证目标问题。']
  } else {
    report.summary = report.findings.length ? '已按固定步骤查询真实本地数据，并定位代表性证据。' : '当前样本没有匹配的标注事件；这不能证明真实门店没有发生该行为。'
    report.nextSteps = ['人工查看引用视频；候选商品和行为解释需要额外证据。']
  }
  steps.push({ round: steps.length + 1, tool: 'finish_investigation', arguments: {}, status: 'ok', detail: '固定模板报告，计数和引用均来自本地工具。' })
  return finish(missing || report.findings.length < selectedCategories.length ? 'insufficient_evidence' : 'completed', '固定流程已结束；无外部模型请求。')
}
