import { aggregateInteractions, getEventEvidence, queryEvents } from '../src/domain/queries.ts'
import { runTool } from '../src/assistant/tools.ts'
import type { QueryContext } from '../src/domain/types.ts'
import type { Evidence, InvestigationLocale, InvestigationResult, InvestigationStep } from '../src/assistant/investigation-types.ts'

// Deterministic development workflow: real tools and data, no model/network requests.
const text = (locale: InvestigationLocale, zh: string, ja: string, en: string, ko: string) => ({ zh, ja, en, ko })[locale]
export function investigateLocally(context: QueryContext, question: string, signal?: AbortSignal, locale: InvestigationLocale = 'zh'): InvestigationResult {
  const start = Date.now()
  const steps: InvestigationStep[] = []
  const evidence: Evidence[] = []
  const report: InvestigationResult['report'] = { title: text(locale, '固定流程调查', '固定ルールによる調査', 'Rule-based investigation', '규칙 기반 조사'), summary: '', findings: [], hypotheses: [],
    limitations: [text(locale, '开发模式使用固定规则和报告模板，不调用模型。', '開発モードでは固定ルールとレポートテンプレートを使用し、モデルは呼び出しません。', 'Development mode uses fixed rules and report templates; no model is called.', '개발 모드는 고정 규칙과 보고서 템플릿을 사용하며 모델을 호출하지 않습니다.'),
      text(locale, '独立策展样本，不能代表同店经营表现。', '独立サンプルであり、同一店舗の営業実績を代表しません。', 'Curated independent samples do not represent one store’s operating results.', '독립적으로 선별된 샘플이며 한 매장의 운영 실적을 대표하지 않습니다.'),
      text(locale, '货架为演示映射，商品为陈列候选。', '棚の対応付けはデモ用で、商品は候補です。', 'Shelf mappings are for demonstration; products are candidates.', '선반 연결은 데모용이며 상품은 후보입니다.'),
      text(locale, '读取标注并定位视频，尚未观看原始视频。', '注釈を読み、動画位置を特定しましたが、元動画は確認していません。', 'Annotations and video locations were read; source videos were not viewed.', '주석과 영상 위치를 확인했지만 원본 영상은 직접 보지 않았습니다.')], nextSteps: [] }
  const finish = (status: InvestigationResult['status'], reason: string): InvestigationResult => ({ execution: 'mock', status,
    stopReason: reason, report, evidence, steps, usage: { modelRequests: 0, toolCalls: steps.length,
      inputTokens: 0, outputTokens: 0, elapsedMs: Date.now() - start } })
  if (signal?.aborted) return finish('cancelled', '调查已取消。')
  if (context.status !== 'ready') { report.summary = text(locale, '数据未完整加载，暂不生成统计结论。', 'データの読み込みが完了していないため、集計結果を提示できません。', 'Data is still loading; no statistical conclusion is available.', '데이터 로딩이 완료되지 않아 통계 결론을 제공할 수 없습니다.'); return finish('insufficient_evidence', report.summary) }
  const query = question.toLowerCase()
  const aliases = [ ['Beverages', /饮料|beverage|飲料|ドリンク|음료/], ['Snacks', /零食|snack|スナック|간식/], ['Breakfast', /早餐|breakfast|朝食|아침/],
    ['Pantry', /食品储藏|酱料|pantry|調味料|식료품/], ['Produce', /果蔬|水果|produce|青果|과일|채소/], ['Dairy', /乳品|奶制品|dairy|乳製品|유제품/] ] as const
  const categories = aliases.filter(([, pattern]) => pattern.test(query)).map(([category]) => category)
  const puts = /放回|put.?back|return|戻|返却|돌려놓|반납/.test(query)
  const missing = /原因|为什么|为何|销量|销售|异常|转化|购买|配对|同一|拿了又|拿取后|原因|なぜ|売上|異常|転換|購入|同一|왜|매출|이상|전환|구매/.test(query)
  if (!categories.length && !puts && !missing && !/总结|概览|活动|交互|summary|activity|interaction|概要|活動|相互作用|요약|활동/.test(query)) {
    report.summary = text(locale, '固定流程暂不支持这个问题，请选择下方的预设调查示例。', '固定ルールではこの質問に対応していません。下の調査例を選択してください。', 'This fixed workflow does not support that question. Choose a suggested investigation below.', '고정 워크플로는 이 질문을 지원하지 않습니다. 아래 조사 예시를 선택하세요.')
    report.nextSteps = [text(locale, '尝试货架放回、品类交互比较或样本活动概览。', '棚への戻し、カテゴリ別の相互作用比較、またはサンプル活動の概要をお試しください。', 'Try shelf put-back behavior, category interaction comparisons, or a sample activity overview.', '선반 반납 행동, 카테고리 상호작용 비교 또는 샘플 활동 개요를 시도해 보세요.')]
    return finish('insufficient_evidence', text(locale, '问题超出固定规则范围。', '質問が固定ルールの範囲外です。', 'Question is outside the fixed rule set.', '질문이 고정 규칙 범위를 벗어났습니다.'))
  }
  const execute = (name: string, args: Record<string, unknown>) => {
    const result = runTool(context, name, args)
    steps.push({ round: steps.length + 1, tool: name, arguments: args, status: 'ok', detail: text(locale, `${result.evidence_refs.length} 条证据引用`, `証拠参照 ${result.evidence_refs.length} 件`, `${result.evidence_refs.length} evidence references`, `증거 참조 ${result.evidence_refs.length}개`) })
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
    report.findings.push({ statement: text(locale,
      `${cluster.shelf.name}：${cluster.events.length} 次标注交互，${cluster.shoppers} 条样本轨迹；${cluster.picks} 次拿取，${cluster.puts} 次放回。引用为代表性片段；计数来自货架聚合工具。`,
      `${cluster.shelf.name}：注釈付きインタラクション ${cluster.events.length} 件、サンプル軌跡 ${cluster.shoppers} 件、取得 ${cluster.picks} 件、棚戻し ${cluster.puts} 件。引用は代表的なクリップで、件数は棚の集計ツールに基づきます。`,
      `${cluster.shelf.name}: ${cluster.events.length} annotated interactions across ${cluster.shoppers} sample tracks; ${cluster.picks} picks and ${cluster.puts} put-backs. The citation is representative; counts come from shelf aggregation.`,
      `${cluster.shelf.name}: 주석된 상호작용 ${cluster.events.length}건, 샘플 궤적 ${cluster.shoppers}개, 집기 ${cluster.picks}건, 반납 ${cluster.puts}건입니다. 인용은 대표 클립이며 수치는 선반 집계에서 가져왔습니다.`), evidenceRefs: [event.eventRef] })
  }
  report.title = categories.length > 1 ? text(locale, '品类交互比较（固定流程）', 'カテゴリ別インタラクション比較（固定ルール）', 'Category interaction comparison (rule-based)', '카테고리 상호작용 비교(규칙 기반)') : puts ? text(locale, '货架放回调查（固定流程）', '棚戻し調査（固定ルール）', 'Shelf put-back investigation (rule-based)', '선반 반납 조사(규칙 기반)') : text(locale, '样本活动调查（固定流程）', 'サンプル活動調査（固定ルール）', 'Sample activity investigation (rule-based)', '샘플 활동 조사(규칙 기반)')
  if (missing) {
    report.summary = text(locale, '可整理现有标注，但缺少同店连续数据、销售记录或可靠商品配对，不能判断经营原因、异常性或拿取后放回关系。', '既存の注釈は整理できますが、同一店舗の連続データ、売上記録、信頼できる商品対応がないため、経営要因、異常性、取得後に棚へ戻したかは判断できません。', 'Existing annotations can be summarized, but without continuous same-store data, sales records, or reliable product matching, business causes, anomalies, and pick-to-put-back relationships cannot be determined.', '기존 주석은 요약할 수 있지만 동일 매장의 연속 데이터, 매출 기록 또는 신뢰할 수 있는 상품 매칭이 없어 운영 원인, 이상 여부, 집은 뒤 반납했는지는 판단할 수 없습니다.')
    report.nextSteps = [text(locale, '人工查看引用视频，核对可观察动作。', '引用された動画を人が確認し、観察できる動作を照合してください。', 'Have a person review the cited clips and verify observable actions.', '인용된 영상을 사람이 확인하고 관찰 가능한 행동을 검증하세요.'), text(locale, '补充同店基线、POS 或连续轨迹，再验证目标问题。', '同一店舗の基準値、POS、または連続軌跡を追加してから検証してください。', 'Add same-store baselines, POS data, or continuous tracks before validating the question.', '동일 매장 기준값, POS 또는 연속 궤적을 추가한 뒤 검증하세요.')]
  } else {
    report.summary = report.findings.length ? text(locale, '已按固定步骤查询真实本地数据，并定位代表性证据。', '固定手順でローカルデータを検索し、代表的な証拠を特定しました。', 'Local data was queried using fixed steps and representative evidence was located.', '고정 절차로 로컬 데이터를 조회하고 대표 증거를 찾았습니다.') : text(locale, '当前样本没有匹配的标注事件；这不能证明真实门店没有发生该行为。', '現在のサンプルに一致する注釈付きイベントはありません。実店舗でその行動がなかったことを意味するものではありません。', 'No matching annotated event was found in these samples; this does not prove the behavior did not occur in a real store.', '현재 샘플에서 일치하는 주석 이벤트를 찾지 못했습니다. 실제 매장에서 해당 행동이 없었다는 뜻은 아닙니다.')
    report.nextSteps = [text(locale, '人工查看引用视频；候选商品和行为解释需要额外证据。', '引用動画を人が確認してください。商品候補と行動の解釈には追加の証拠が必要です。', 'Review cited clips manually; product candidates and behavioral interpretations need additional evidence.', '인용된 영상을 직접 확인하세요. 상품 후보와 행동 해석에는 추가 증거가 필요합니다.')]
  }
  steps.push({ round: steps.length + 1, tool: 'finish_investigation', arguments: {}, status: 'ok', detail: text(locale, '固定模板报告，计数和引用均来自本地工具。', '固定テンプレートによるレポートです。件数と引用はローカルツールに基づきます。', 'Fixed-template report; counts and citations come from local tools.', '고정 템플릿 보고서이며 수치와 인용은 로컬 도구에서 가져왔습니다.') })
  return finish(missing || report.findings.length < selectedCategories.length ? 'insufficient_evidence' : 'completed', text(locale, '固定流程已结束；无外部模型请求。', '固定ルールによる処理が完了しました。外部モデルへのリクエストはありません。', 'Rule-based workflow finished; no external model request was made.', '규칙 기반 워크플로가 완료되었습니다. 외부 모델 요청은 없었습니다.'))
}
