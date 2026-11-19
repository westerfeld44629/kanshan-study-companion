import { emptyProfile, applyEvent, topDomains, overallLevel, zpdScore, profileBrief } from '../shared/profile.mjs'
import { detectDomains, prerequisitesOf } from '../shared/domain.mjs'

const ok = []
const fail = []
function t(name, cond, extra) {
  ;(cond ? ok : fail).push(name + (cond ? '' : ' :: ' + (extra ?? '')))
}

// 1. 领域识别
t('识别 python', detectDomains('想学 python 的 pandas').some(d => d.id === 'python'))
t('识别机器学习', detectDomains('机器学习怎么入门').some(d => d.id === 'ml'))
t('短词边界: cv 不应命中 cvs', !detectDomains('cvs update').some(d => d.id === 'cv'))
t('空文本不崩', detectDomains('').length === 0)
t('多领域排序', detectDomains('python 机器学习 深度学习')[0].id === 'python')

// 2. 前置链
t('ml 的前置含 python', prerequisitesOf('ml').includes('python'))
t('llm 的前置链', JSON.stringify(prerequisitesOf('llm')) === JSON.stringify(['dl','ml','python','programming']))

// 3. 空画像
let p = emptyProfile(0)
t('空画像无领域', Object.keys(p.domains).length === 0)
t('空画像 overallLevel 为 null', overallLevel(p) === null)
t('空画像 brief', profileBrief(p).includes('第一次'))

// 4. 热榜交互
p = applyEvent(p, { kind: 'react', topic: '如何学习 Python 数据分析', signal: 'deeper' }, 1000)
t('deeper 建立领域', !!p.domains.python || !!p.domains.data)
const py = p.domains.python
t('deeper 抬权重', py && py.weight > 0.5, JSON.stringify(py))
t('deeper 记录 wantsDepth', py && py.wantsDepth === 1)

// 5. 重复加深 vs 无关
for (let i = 0; i < 5; i++) p = applyEvent(p, { kind: 'react', topic: 'Python 进阶', signal: 'deeper' }, 2000 + i)
t('多次加深权重上限 3', p.domains.python.weight <= 3.0001, p.domains.python.weight)
const beforeW = p.domains.python.weight
p = applyEvent(p, { kind: 'react', topic: 'Python 好难', signal: 'irrelevant' }, 3000)
t('irrelevant 降权', p.domains.python.weight < beforeW)

// 6. 层级不越界
let q = emptyProfile(0)
for (let i = 0; i < 40; i++) q = applyEvent(q, { kind: 'quiz', domain: 'python', correct: 3, total: 3 }, i)
t('层级上限 4', q.domains.python.level <= 4.0001, q.domains.python.level)
for (let i = 0; i < 40; i++) q = applyEvent(q, { kind: 'quiz', domain: 'python', correct: 0, total: 3 }, 100 + i)
t('层级下限 1', q.domains.python.level >= 0.9999, q.domains.python.level)

// 7. 缺口推断
let g = emptyProfile(0)
g = applyEvent(g, { kind: 'react', topic: '大模型 Agent 开发', signal: 'deeper' }, 1)
for (let i = 0; i < 4; i++) g = applyEvent(g, { kind: 'react', topic: 'LLM 微调', signal: 'deeper' }, 2 + i)
// 只点过 llm、从没聊过前置 → 不应臆断“缺前置”
t('未提及前置不算缺口', g.gaps.length === 0, JSON.stringify(g.gaps))
// 明确测出前置偏弱 → 才进缺口
let g2 = g
g2 = applyEvent(g2, { kind: 'quiz', domain: 'dl', correct: 0, total: 2 }, 900)
t('测出前置弱则记缺口', g2.gaps.some(x => x.missing === 'dl' || x.missing === 'ml' || x.missing === 'python'), JSON.stringify(g2.gaps))

// 8. 用户纠正优先
let c = emptyProfile(0)
c = applyEvent(c, { kind: 'correct', domain: 'python', level: 4 }, 1)
t('纠正生效', c.domains.python.level === 4)
t('自述有明确来源', c.domains.python.assessment === 'self' && c.domains.python.confidence === 0)

// 9. ZPD
let z = emptyProfile(0)
z = applyEvent(z, { kind: 'correct', domain: 'python', level: 1 }, 1)
const easy = zpdScore(z, 'python')
z = applyEvent(z, { kind: 'correct', domain: 'python', level: 3.5 }, 2)
const hard = zpdScore(z, 'python')
t('新手学 python 分数高', easy.score > hard.score, JSON.stringify({ easy, hard }))

// 10. brief 长度
let b = emptyProfile(0)
for (const d of ['python','ml','llm','data','career']) b = applyEvent(b, { kind: 'react', topic: d, signal: 'deeper' }, 1)
const brief = profileBrief(b)
t('brief 不超过 5 个领域', brief.split('\n').filter(l => l.startsWith('- ')).length <= 8, brief)
t('topDomains 有 levelLabel', topDomains(b).every(d => d.levelLabel))
t('events 有上限', (() => { let e = emptyProfile(0); for (let i=0;i<400;i++) e = applyEvent(e,{kind:'react',topic:'python',signal:'known'},i); return e.events.length <= 300 })())

// 11. 不可变性
const orig = emptyProfile(0)
const copy = applyEvent(orig, { kind: 'react', topic: 'python', signal: 'deeper' }, 1)
t('applyEvent 不修改入参', Object.keys(orig.domains).length === 0)

console.log('PASS ' + ok.length + ' / FAIL ' + fail.length)
if (fail.length) { console.log('FAILED:'); fail.forEach(f => console.log('  - ' + f)); process.exitCode = 1 }

