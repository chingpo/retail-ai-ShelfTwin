import { useState } from 'react'
import { t } from '../i18n'

export type CaseExample = { id: string; icon: string; title: string; category: string; question: string; signal: string; check: string; intervention: string; metric: string; tone: string }
const examples: CaseExample[] = [
  { id: 'putback', icon: '↩', title: '饮料区放回调查', category: '顾客行为', question: '调查饮料区的放回行为，列出证据和需要补充的信息', signal: '顾客拿起饮料后又放回，值得进一步核对。', check: '回看拿取与放回片段，现场核对价签与促销信息。', intervention: '调整饮料区价签（模拟演练）', metric: '放回事件比例 · 7 天观察', tone: 'teal' },
  { id: 'stock', icon: '▦', title: '热门商品疑似缺货', category: '库存与补货', question: '调查零食区是否存在疑似缺货，整理线索并列出需要核对的库存信息。', signal: '顾客在目标货架停留，却没有拿取商品。', check: '检查货架空位、库存与补货记录，确认商品是否可购买。', intervention: '补齐零食区陈列与库存（模拟演练）', metric: '货架可用率 · 补货后复查', tone: 'amber' },
  { id: 'price', icon: '¥', title: '价签与促销信息异常', category: '价格与信息', question: '调查饮料区价签或促销说明是否可能引起顾客犹豫，列出核验步骤。', signal: '顾客反复查看商品和价签后离开。', check: '对照价签、收银价格与促销规则，记录不一致之处。', intervention: '统一价签与促销说明（模拟演练）', metric: '价签一致率 · 3 天复查', tone: 'blue' },
  { id: 'layout', icon: '⇄', title: '货架摆放与可见性优化', category: '陈列与空间', question: '比较零食货架不同陈列位置的交互，设计商品可见性优化的验证计划。', signal: '相邻陈列位置的顾客互动表现可能不同。', check: '核对陈列照片、货架高度与位置，比较同时间段的样本。', intervention: '优化零食区陈列位置（模拟演练）', metric: '拿取事件比例 · 7 天对照', tone: 'violet' },
  { id: 'dwell', icon: '◷', title: '长时间停留但未拿取', category: '购物决策', question: '调查早餐食品区长时间停留却未拿取的行为，列出可能解释与待补证据。', signal: '顾客在早餐货架前停留，最终没有拿取。', check: '核对停留轨迹、商品选择与包装信息，补充现场观察。', intervention: '简化早餐区商品指引（模拟演练）', metric: '停留后拿取比例 · 7 天观察', tone: 'rose' },
  { id: 'traffic', icon: '⌁', title: '通道拥堵与动线调查', category: '门店体验', question: '调查生鲜区通道是否存在拥堵或绕行，列出空间布局核验与改善建议。', signal: '多个顾客在通道交汇处停留或绕行。', check: '检查通道宽度、临时堆头与高峰时段的通行情况。', intervention: '调整生鲜区通道与临时堆头（模拟演练）', metric: '通行时间 · 高峰时段对比', tone: 'blue' },
]

export function CaseExamples({ onUse }: { onUse: (example: CaseExample) => void }) {
  const [activeId, setActiveId] = useState(examples[0].id)
  const active = examples.find(example => example.id === activeId)!
  return <section className="case-examples" aria-labelledby="case-examples-title">
    <div className="case-examples-heading"><div><span className="case-demo-label">{t('场景演示')}</span><h2 id="case-examples-title">{t('从一个门店问题开始')}</h2><p>{t('选择场景，预览调查路径，也可以修改后创建自己的 Case。')}</p></div><span className="case-example-count">06</span></div>
    <div className="case-example-grid">{examples.map(example => <button type="button" key={example.id} aria-pressed={activeId === example.id} className={`case-example-card ${example.tone} ${activeId === example.id ? 'selected' : ''}`} onClick={() => setActiveId(example.id)}>
      <span className="case-example-top"><span className="case-example-icon" aria-hidden="true">{example.icon}</span><span>{t(example.category)}</span><span className="case-example-arrow" aria-hidden="true">↗</span></span>
      <strong>{t(example.title)}</strong><p>{t(example.signal)}</p><small>{t('查看调查路径')} →</small>
    </button>)}</div>
    <div className={`case-example-preview ${active.tone}`}>
      <div className="case-example-preview-head"><div><span className="case-demo-label">{t('演示预览 · 未执行调查')}</span><h3>{t(active.title)}</h3></div><button type="button" className="case-example-use" onClick={() => onUse(active)}>{t('使用此模板')} →</button></div>
      <div className="case-example-path">{[{ label: '发现线索', text: active.signal }, { label: '补充证据', text: active.check }, { label: '尝试干预', text: active.intervention }, { label: '持续复查', text: active.metric }].map((step, index) => <div key={step.label}><span className="case-example-step">0{index + 1}</span><strong>{t(step.label)}</strong><p>{t(step.text)}</p></div>)}</div>
      <p className="case-example-disclaimer">{t('以上为场景脚本，不代表当前数据已发现异常。模板只填入表单，具体指标与调查能力待后续实现。')}</p>
    </div>
  </section>
}
