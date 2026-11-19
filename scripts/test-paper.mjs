import assert from 'node:assert/strict'
import { applyEvent, emptyProfile } from '../shared/profile.mjs'
import { extractPaper, paperStudy } from '../shared/paper.mjs'

const paper = extractPaper({
  schema_version: 'v1',
  pages: [
    { page: 0, blocks: [
      { type: 'title', content: '论⽂样例 RAG 检索评估' },
      { type: 'text', content: '摘要：我们研究如何稳定评估 RAG 检索对不同长度查询的支持，并比较统一条件下的两种方法。' },
    ] },
    { page: 1, blocks: [
      { type: 'title', content: '2. Methods' },
      { type: 'text', content: 'We evaluate two retrievers using the same set of documents and annotated queries.' },
      { type: 'figure', content: '', image: { data: 'not included' } },
    ] },
    { page: 2, blocks: [
      { type: 'title', content: '3. Results' },
      { type: 'text', content: 'Dense retrieval matched short queries at a different rate from sparse retrieval.' },
    ] },
    { page: 3, blocks: [
      { type: 'title', content: '4. Limitations' },
      { type: 'text', content: 'We did not evaluate multilingual transfer or retrieval outside the test corpus.' },
      { type: 'title', content: 'References' },
      { type: 'text', content: 'This references passage must not be included in the learner materials.' },
    ] },
  ],
})

assert.deepEqual(paper.cards.map((card) => [card.kind, card.page]), [
  ['abstract', 1], ['method', 2], ['result', 3], ['limit', 4],
])
assert.match(paper.cards[0].text, /^我们研究/)
assert.doesNotMatch(JSON.stringify(paper), /bibliography|references passage|not included/)
assert.deepEqual(extractPaper({ pages: [{ blocks: [{ type: 'figure', content: '' }] }] }).cards, [])
assert.equal(extractPaper({ pages: [{ blocks: [{ type: 'text', content: 'A plain passage that has no heading but contains usable content.' }] }] }).cards[0].kind, 'reading')

for (const [level, expected, firstPage, action] of [
  [1, 'entry', 1, '一句话'],
  [2.2, 'intermediate', 2, '复现'],
  [4, 'advanced', 4, '可证伪'],
]) {
  const profile = applyEvent(emptyProfile(), { kind: 'correct', domain: 'llm', level })
  const study = paperStudy(paper, profile)
  assert.equal(study.focus.id, 'llm')
  assert.equal(study.depth, expected)
  assert.equal(study.cards[0].page, firstPage)
  assert.ok(study.cards[0].action.includes(action))
}

const manual = applyEvent(emptyProfile(), { kind: 'correct', domain: 'llm', level: 3 })
const withQuestion = applyEvent(manual, { kind: 'ask', text: 'RAG 大模型怎么做检索评估' })
const withStudy = applyEvent(withQuestion, { kind: 'study', domain: 'llm', title: paper.title })
assert.equal(withStudy.domains.llm.level, 3)
assert.equal(withStudy.domains.llm.assessment, 'self')
assert.ok(withStudy.domains.llm.weight > withQuestion.domains.llm.weight)
assert.equal(withStudy.events.at(-1).kind, 'study')
console.log('PASS 论文分节、页码、无正文、三级导读和学习信号')
