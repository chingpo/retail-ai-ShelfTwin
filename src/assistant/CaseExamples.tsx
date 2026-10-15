import { useState } from 'react'
import { t } from '../i18n'

export type CaseExample = { id: string; icon: string; title: string; category: string; question: string; signal: string; check: string; intervention: string; metric: string; tone: string }
const examples: CaseExample[] = [
  { id: 'putback', icon: '↩', title: '饮料区放回调查', category: '顾客行为', question: '调查饮料区的放回行为，列出证据和需要补充的信息', signal: '顾客拿起饮料后又放回，值得进一步核对。', check: '回看拿取与放回片段，现场核对价签与促销信息。', intervention: '调整饮料区价签（模拟演练）', metric: '放回事件比例 · 7 天观察', tone: 'teal' },
  { id: 'sales-cause', icon: '?', title: '销量变化的原因能否判断？', category: '证据边界', question: '这些顾客交互视频能否证明某个商品销量下降的原因？列出能确认的事实和缺失证据。', signal: '视频可显示可观察到的拿取、放回与停留事件。', check: '补充 POS 销售、库存、价格和促销数据，再核对时间范围。', intervention: '先补齐销售与库存数据，再决定是否干预', metric: '当前视频样本不能单独证明销量因果', tone: 'blue' },
]

export function CaseExamples({ onUse }: { onUse: (example: CaseExample) => void }) {
  const [activeId, setActiveId] = useState(examples[0].id)
  const active = examples.find(example => example.id === activeId)!
  return <section className="case-examples" aria-labelledby="case-examples-title">
    <div className="case-examples-heading"><div><span className="case-demo-label">{t('可运行场景')}</span><h2 id="case-examples-title">{t('从一个门店问题开始')}</h2><p>{t('选择当前样本支持的调查，或查看视频证据的能力边界。')}</p></div><span className="case-example-count">{String(examples.length).padStart(2, '0')}</span></div>
    <div className="case-example-grid">{examples.map(example => <button type="button" key={example.id} aria-pressed={activeId === example.id} className={`case-example-card ${example.tone} ${activeId === example.id ? 'selected' : ''}`} onClick={() => setActiveId(example.id)}>
      <span className="case-example-top"><span className="case-example-icon" aria-hidden="true">{example.icon}</span><span>{t(example.category)}</span><span className="case-example-arrow" aria-hidden="true">↗</span></span>
      <strong>{t(example.title)}</strong><p>{t(example.signal)}</p><small>{t('查看调查路径')} →</small>
    </button>)}</div>
    <div className={`case-example-preview ${active.tone}`}>
      <div className="case-example-preview-head"><div><span className="case-demo-label">{t('演示预览 · 未执行调查')}</span><h3>{t(active.title)}</h3></div><button type="button" className="case-example-use" onClick={() => onUse(active)}>{t('使用此模板')} →</button></div>
      <div className="case-example-path">{[{ label: '发现线索', text: active.signal }, { label: '补充证据', text: active.check }, { label: '尝试干预', text: active.intervention }, { label: '持续复查', text: active.metric }].map((step, index) => <div key={step.label}><span className="case-example-step">0{index + 1}</span><strong>{t(step.label)}</strong><p>{t(step.text)}</p></div>)}</div>
      <p className="case-example-disclaimer">{t('运行后会查询当前样本；现场检查、干预和后续指标需要人工录入。演示数据与模拟结果不代表真实经营结果。')}</p>
    </div>
  </section>
}
