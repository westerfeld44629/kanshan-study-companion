import assert from 'node:assert/strict'
import { applyEvent, clearChatFromProfile, clearLongMemory, clearPlanFromProfile, emptyProfile, getLongMemory, migrateProfile, profileBrief, saveLearningMemory } from '../shared/profile.mjs'
import { DOMAINS } from '../shared/domain.mjs'
import { curriculumFor } from '../shared/curriculum.mjs'
import { collectEvidence, fallbackQuestions, scoreQuestions, validateQuestions } from '../shared/assessment.mjs'
import { learningStages, parseQuestions } from '../api/_lib/study.mjs'
import { lessonScope, stageDepthAt } from '../shared/learning.mjs'
import { buildSourcePrompt } from '../api/_lib/prompts.mjs'
import { handle } from '../api/_lib/router.mjs'

const profile = applyEvent(emptyProfile(), { kind: 'intake', domain: 'llm', goal: '怎么使用 Agent 训练模型', level: 1, minutes: 30 })
const plan = learningStages(profile)
assert.deepEqual(plan.map((stage) => stage[0]), ['概念与分工', '跟做一个最小流程', '检查训练结果'])
assert.match(plan[1][1], /SFT Trainer/)
assert.match(plan[2][2], /留出样本/)
assert.equal(new Set(DOMAINS.map(({ id }) => curriculumFor(id).project)).size, DOMAINS.length)
for (const { id, name } of DOMAINS) {
  const { outcomes, checks } = curriculumFor(id)
  const stages = learningStages(applyEvent(emptyProfile(), { kind: 'intake', domain: id, goal: '掌握' + name + '的起步方法', level: 0, minutes: 5 }))
  assert.deepEqual(stages.map((stage) => stage[2]), outcomes, name)
  assert.ok(checks.length >= 2, name)
}
const materials = [{ source: 'global', title: '训练集与评估集', url: 'https://example.com/read',
  excerpt: '训练集用于更新模型，训练结果应该在未参与更新的评估集检查。保持训练和评估的样本独立，才能区分记住样本与学到可泛化的规律。比较训练前后表现时，应该使用相同口径和相同的留出样本。' }]
const evidence = collectEvidence(materials)
const question = { prompt: '应如何对比训练前后？', options: ['同一留出样本', '同一训练集', '更换指标', '不同的样本集'],
  answer: 'A', evidence: 'E3', concept: '评估口径', explanation: '保持指标和留出样本一致。' }
assert.equal(validateQuestions([question], evidence)[0].evidence.quote, evidence[2].quote)
assert.equal(validateQuestions([{ ...question, evidence: 'E99' }], evidence).length, 0)
assert.equal(validateQuestions([{ ...question, explanation: 1 }], evidence).length, 0)
assert.equal(validateQuestions([{ ...question, options: [1, 2, 3, 4] }], evidence).length, 0)
const parsed = parseQuestions('### 1. **题干：** 应如何对比前后？\nA：相同留出样本\nB：训练数据\nC：不同指标\nD：不同样本\n答案：A\n知识点：评估口径\n解析：保持比较条件。\n证据：E3')
assert.equal(validateQuestions(parsed, evidence)[0].evidence.quote, evidence[2].quote)
assert.equal(fallbackQuestions(materials).length, 3)
assert.deepEqual([0, 1, 2].map((index) => stageDepthAt('entry', index)), ['entry', 'intermediate', 'advanced'])
assert.equal(stageDepthAt('advanced', 0), 'advanced')
const extended = [{ ...materials[0], excerpt: materials[0].excerpt.repeat(24) }]
assert.equal(lessonScope([], 'entry', 60).questions, 0)
assert.equal(lessonScope(materials, 'entry', 60).questions, 4)
assert.equal(lessonScope(extended, 'advanced', 60).questions, 5)
assert.equal(lessonScope(extended, 'advanced', 5).questions, 5)
assert.equal(lessonScope([{ ...materials[0], source: 'paper' }], 'entry', 60).questions, 10)
assert.equal(lessonScope([{ ...extended[0], source: 'paper' }], 'advanced', 60).questions, 12)
assert.deepEqual(lessonScope([...materials, ...materials], 'entry', 60), lessonScope(materials, 'entry', 60))
assert.equal(collectEvidence([...materials, ...materials]).length, evidence.length)
const prompt = (content, depth) => buildSourcePrompt(profile, { title: '训练导读', materials: content },
  { name: '大模型', title: '验证证据', depth, minutes: 60 }, '', [], 'start').at(-1).content
assert.match(prompt(materials, 'entry'), /250–480 汉字/)
assert.match(prompt(extended, 'advanced'), /1250–2260 汉字/)
const questions = validateQuestions([question], evidence)
assert.equal(scoreQuestions(questions, { 1: 2 }).correct, 0)
assert.equal(scoreQuestions(questions, { 1: 0 }).correct, 1)

const graded = applyEvent(profile, { kind: 'assessment', domain: 'llm', title: '训练导读', correct: 2, total: 3, lesson: 'lesson-one',
  review: [{ question: '1', concept: '评估口径' }] })
assert.match(profileBrief(graded), /待订正：评估口径/)
const repaired = applyEvent(graded, { kind: 'correction', domain: 'llm', title: '训练导读', lesson: 'lesson-one',
  question: '1', concept: '评估口径' })
assert.doesNotMatch(profileBrief(repaired), /待订正：评估口径/)
assert.equal(repaired.domains.llm.level, profile.domains.llm.level)
let withHistory = applyEvent(repaired, { kind: 'ask', thread: 'lesson-one', text: '计划对话：SFT' })
withHistory = applyEvent(withHistory, { kind: 'ask', text: '搜索 RAG' })
withHistory = applyEvent(withHistory, { kind: 'project', domain: 'llm', title: '训练实战', plan: 'active-plan' })
withHistory = saveLearningMemory(withHistory, { id: 'preference', kind: 'preference', text: '喜欢先看例子' })
assert.doesNotMatch(profileBrief(withHistory, 5, '怎样训练 LoRA？'), /喜欢先看例子/)
let remembered = applyEvent(withHistory, { kind: 'ask', thread: 'old-chat', text: '以后每次希望先给一个具体例子，再讲原理。' })
remembered = applyEvent(remembered, { kind: 'ask', thread: 'old-chat', text: '我卡在 LoRA 的留出集评估。' })
remembered = migrateProfile(JSON.parse(JSON.stringify(remembered)))
const newChat = profileBrief(remembered, 5, '怎样训练 LoRA？')
assert.match(newChat, /先给一个具体例子，再讲原理/)
assert.match(newChat, /LoRA 的留出集评估/)
assert.doesNotMatch(profileBrief(remembered, 5, '相机快门如何影响曝光？'), /LoRA 的留出集评估/)
assert.equal(getLongMemory(migrateProfile(clearLongMemory(remembered))).length, 0)
assert.doesNotMatch(profileBrief(clearChatFromProfile(remembered, ['old-chat'])), /先给一个具体例子/)
const cleaned = clearPlanFromProfile(clearChatFromProfile(withHistory, ['lesson-one']), { id: 'active-plan', steps: [{ id: 'lesson-one' }] })
assert.equal(cleaned.goal, null)
assert.deepEqual(cleaned.events.map((event) => event.text), ['搜索 RAG'])
assert.deepEqual(cleaned.memories, withHistory.memories)
assert.deepEqual(cleaned.domains, withHistory.domains)
assert.equal((await handle('study', { method: 'POST', body: { action: 'plan' } })).status, 400)
assert.equal((await handle('study', { method: 'POST', body: { action: 'assessment', topic: { title: '资料', materials: [] } } })).status, 422)
console.log('PASS 目标阶段、证据约束、测评分数与错题订正、资料不足')
