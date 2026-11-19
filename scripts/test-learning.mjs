import assert from 'node:assert/strict'
import { applyEvent, emptyProfile, migrateProfile, profileBrief, topDomains } from '../shared/profile.mjs'
import { cleanMaterials, sourceLearningSheet, studyRoute } from '../shared/learning.mjs'
import { buildSourcePrompt } from '../api/_lib/prompts.mjs'

const title = 'RAG 引用为什么会给错原文'
const materials = cleanMaterials([
  { source: 'hot', title, url: 'https://www.zhihu.com/question/123', excerpt: '一次失败案例里，召回段落只有标题和正文摘要。' },
  { source: 'global', title: 'RAG 检索基线记录', url: 'https://example.com/paper', excerpt: '对照实验固定数据，分别比较召回和答案支持率。' },
])

let unknown = emptyProfile()
for (let i = 0; i < 120; i++) unknown = applyEvent(unknown, { kind: 'ask', text: `第${i}次查 RAG 大模型 Agent` })
assert.equal(unknown.domains.llm.level, 1)
assert.equal(unknown.domains.llm.evidence, 120)
assert.equal(topDomains(unknown)[0].levelLabel, '待了解基础')

const starter = applyEvent(unknown, { kind: 'intake', domain: 'llm', level: 1, goal: '自己解释检索、引用和生成的区别', minutes: 15 })
const expert = applyEvent(emptyProfile(), { kind: 'intake', domain: 'llm', level: 4, goal: '设计一个企业知识库的引用验证实验', minutes: 30 })
const first = studyRoute(starter, title, materials)
const second = studyRoute(expert, title, materials)
assert.equal(first.title, '复述与举例')
assert.equal(second.title, '检验一条主张')
assert.equal(second.minutes, 30)
assert.match(buildSourcePrompt(expert, { title, materials }, second, '', [], 'start').at(-1).content, /企业知识库的引用验证实验[\s\S]*证据边界[\s\S]*答案支持率/)
assert.match(sourceLearningSheet(title, materials, starter, first), /阅读材料[\s\S]*合上资料试一试/)
const longMaterials = [{ ...materials[0], excerpt: '先核对正文里的关键结论。'.repeat(90) + '末尾只在完整原文里。' }, materials[1]]
const quickSheet = sourceLearningSheet(title, longMaterials, starter, { ...first, minutes: 5 })
assert.match(quickSheet, /完整内容见上方原文/)
assert.doesNotMatch(quickSheet, /末尾只在完整原文里|RAG 检索基线记录/)
const tried = applyEvent(starter, { kind: 'practice', domain: 'llm', title, text: '模型取出的内容需要核对。' })
assert.equal(tried.domains.llm.level, 1)
assert.match(profileBrief(tried), /自己解释检索/)

let quiz = emptyProfile()
for (let i = 0; i < 15; i++) quiz = applyEvent(quiz, { kind: 'quiz', domain: 'llm', correct: 2, total: 2 })
assert.equal(quiz.domains.llm.level, 2)
assert.equal(topDomains(quiz)[0].levelLabel, '基础自测 2/2')
const retest = applyEvent(expert, { kind: 'quiz', domain: 'llm', correct: 0, total: 2 })
assert.equal(retest.corrected.llm, 4)
assert.equal(studyRoute(retest, title).depth, 'entry')

const old = migrateProfile({ ...unknown, version: 1, domains: { llm: { ...unknown.domains.llm, level: 3.2 } } })
assert.equal(old.domains.llm.level, 1)
assert.equal(old.domains.llm.evidence, 120)
console.log('PASS 目标、兴趣与基础分离，双源讲解提示、分档练习、复测和旧画像迁移')
