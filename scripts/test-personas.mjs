import { applyEvent, emptyProfile, topDomains, overallLevel, zpdScore, profileBrief } from '../shared/profile.mjs'
import { buildQueries } from '../api/_lib/recommend.mjs'
import { detectDomains } from '../shared/domain.mjs'

const ok = [], fail = []
const t = (n, c, x) => (c ? ok : fail).push(n + (c ? '' : ' :: ' + (x ?? '')))

// ============ 六种学习者画像 ============
const PERSONAS = {
  'A 考研党': {
    events: [
      { kind: 'correct', domain: 'exam', level: 2.8 },
      { kind: 'react', topic: '考研数学 线性代数', signal: 'deeper' },
      { kind: 'react', topic: '英语六级 背单词', signal: 'deeper' },
    ],
    expect: ['exam'],
  },
  'B 转行算法': {
    events: [
      { kind: 'react', topic: '机器学习 特征工程 交叉验证', signal: 'deeper' },
      { kind: 'react', topic: '深度学习 梯度下降', signal: 'deeper' },
      { kind: 'ask', text: 'pytorch 训练不收敛 loss 震荡' },
    ],
    expect: ['ml', 'dl'],
  },
  'C 前端转AI': {
    events: [
      { kind: 'react', topic: 'javascript react 前端性能', signal: 'deeper' },
      { kind: 'react', topic: '大模型 agent rag', signal: 'deeper' },
    ],
    expect: ['javascript', 'llm'],
  },
  'D 产品经理': {
    events: [
      { kind: 'react', topic: '产品 需求 prd 用户画像', signal: 'deeper' },
      { kind: 'react', topic: '数据分析 指标 ab测试', signal: 'deeper' },
    ],
    expect: ['product', 'data'],
  },
  'E 科研新手': {
    events: [
      { kind: 'react', topic: '科研 论文 文献 综述', signal: 'deeper' },
      { kind: 'quiz', domain: 'ml', correct: 0, total: 2 },
    ],
    expect: ['research'],
  },
  'F 纯新手': {
    events: [{ kind: 'react', topic: 'python 零基础', signal: 'deeper' }],
    expect: ['python'],
  },
}

for (const [name, cfg] of Object.entries(PERSONAS)) {
  let p = emptyProfile(1)
  for (const e of cfg.events) p = applyEvent(p, e, Date.now())

  const tops = Object.keys(p.domains)
  for (const need of cfg.expect) t(`${name}: 识别 ${need}`, tops.includes(need), JSON.stringify(tops))

  const lv = overallLevel(p)
  const assessed = cfg.events.some((e) => e.kind === 'correct' || e.kind === 'quiz')
  t(`${name}: 只从明确证据产生校准`, assessed ? lv !== null && lv >= 1 && lv <= 4 : lv === null, String(lv))

  const qs = buildQueries(p)
  t(`${name}: 有推荐检索式`, qs.length > 0, JSON.stringify(qs))
  t(`${name}: 检索式不含空领域名`, qs.every(q => q.query && q.query.length > 4), JSON.stringify(qs.map(q=>q.query)))

  const brief = profileBrief(p)
  t(`${name}: 画像摘要非空`, brief.length > 10, brief)
  t(`${name}: 摘要长度可控(<800)`, brief.length < 800, String(brief.length))
}

// ============ 层级边界 ============
let hi = emptyProfile(1)
for (let i = 0; i < 30; i++) hi = applyEvent(hi, { kind: 'quiz', domain: 'ml', correct: 2, total: 2 }, i)
t('层级不超 4', hi.domains.ml.level <= 4.0001, hi.domains.ml.level)

let lo = emptyProfile(1)
for (let i = 0; i < 30; i++) lo = applyEvent(lo, { kind: 'quiz', domain: 'ml', correct: 0, total: 2 }, i)
t('层级不低于 1', lo.domains.ml.level >= 0.9999, lo.domains.ml.level)

// ============ ZPD 语义 ============
let z1 = emptyProfile(1)
z1 = applyEvent(z1, { kind: 'correct', domain: 'ml', level: 1 }, 1)
t('新手看 ml 给 entry', zpdScore(z1, 'ml').depth === 'entry', JSON.stringify(zpdScore(z1, 'ml')))

let z2 = applyEvent(z1, { kind: 'correct', domain: 'ml', level: 3.6 }, 2)
t('高阶看 ml 给 advanced', zpdScore(z2, 'ml').depth === 'advanced', JSON.stringify(zpdScore(z2, 'ml')))

let z3 = emptyProfile(1)
t('无画像也能给建议', zpdScore(z3, 'ml').score > 0.3, JSON.stringify(zpdScore(z3, 'ml')))

// 高分异构：反复关注应显著高于单次
let once = applyEvent(emptyProfile(1), { kind: 'react', topic: '机器学习', signal: 'deeper' }, 1)
let many = emptyProfile(1)
for (let i = 0; i < 5; i++) many = applyEvent(many, { kind: 'react', topic: '机器学习', signal: 'deeper' }, i)
t('关注越多分越高', zpdScore(many, 'ml').score > zpdScore(once, 'ml').score * 1.5,
  JSON.stringify({ once: zpdScore(once, 'ml').score, many: zpdScore(many, 'ml').score }))

// ============ 无关降权 ============
let w = emptyProfile(1)
w = applyEvent(w, { kind: 'react', topic: '机器学习', signal: 'deeper' }, 1)
const w1 = w.domains.ml.weight
w = applyEvent(w, { kind: 'react', topic: '机器学习 太卷了', signal: 'irrelevant' }, 2)
t('点无关会降权', w.domains.ml.weight < w1, `${w1} -> ${w.domains.ml.weight}`)

// ============ 缺口：不臆断 ============
let gap1 = applyEvent(emptyProfile(1), { kind: 'react', topic: '大模型 微调', signal: 'deeper' }, 1)
t('没提过前置不算缺口', gap1.gaps.length === 0, JSON.stringify(gap1.gaps))

let gap2 = applyEvent(gap1, { kind: 'quiz', domain: 'dl', correct: 0, total: 2 }, 2)
t('测弱前置才记缺口', gap2.gaps.length > 0, JSON.stringify(gap2.gaps.map(g=>g.missing)))

// ============ 空画像安全 ============
const e = emptyProfile(1)
t('空画像 topDomains 为空', topDomains(e).length === 0)
t('空画像 overall 为 null', overallLevel(e) === null)
t('空画像 gaps 为空', e.gaps.length === 0)
t('空画像 brief 有提示', profileBrief(e).includes('第一次'))

console.log('PASS ' + ok.length + ' / FAIL ' + fail.length)
if (fail.length) { console.log('\n未通过：'); fail.forEach(f => console.log('  - ' + f)); process.exitCode = 1 }

