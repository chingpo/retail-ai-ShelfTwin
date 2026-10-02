import { aggregateInteractions, queryEvents } from '../domain/queries.ts'
import type { QueryContext } from '../domain/types'
import type { AgentReply } from './commands'

export function answerQuery(context: QueryContext, raw: string): AgentReply {
  if (context.status !== 'ready') return { title: context.status === 'loading' ? '数据加载中' : '数据未完整加载',
    body: context.status === 'loading' ? '请等待事件索引加载后重新查询。' : `部分数据加载失败，暂不提供全样本排名。失败项：${context.errors.join('、')}`,
    evidence: '加载失败不等于零事件。', actions: [] }
  const query = raw.trim().toLowerCase()
  const category = /饮料|beverage/.test(query) ? 'Beverages' : /零食|snack/.test(query) ? 'Snacks' : undefined
  const puts = /放回|put back|return/.test(query)
  const leader = aggregateInteractions(context, { category, sortBy: puts ? 'puts' : 'interactions', limit: 1 }).result.clusters[0]
  if (!leader || !leader.events.length || (puts && !leader.puts)) return { title: '没有匹配事件', body: '当前样本中没有符合条件的标注事件。', evidence: '这不证明真实门店没有发生该行为。', actions: [] }
  const first = queryEvents(context, { shelfId: leader.shelf.id, action: puts ? 'PUT BACK' : undefined, limit: 1 }).result.events[0]
  return { title: puts ? '货架放回事件' : category ? `${category} 货架概览` : '样本活动概览',
    body: `${leader.shelf.name}：${leader.events.length} 次交互，来自 ${leader.shoppers} 条样本轨迹；${leader.picks} 次拿取，${leader.puts} 次放回。${puts ? '放回次数不能直接解释为同一商品拿取后放回，也不能据此确定经营原因。' : '这是货架关联统计，不能直接归到某个候选 SKU。'}`,
    evidence: '跨独立样本汇总 · 动作来自标注 · 货架为演示映射 · 商品为陈列候选',
    actions: [{ label: '查看货架', command: { type: 'focus_shelf', shelfId: leader.shelf.id } },
      ...(first ? [{ label: '查看视频证据', command: { type: 'open_evidence' as const, eventRef: first.eventRef } }] : [])] }
}
