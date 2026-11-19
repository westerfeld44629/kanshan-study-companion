export function collectEvidence(materials) {
  const groups = materials.map((material) => {
    const excerpt = material.excerpt?.trim() ?? ''
    if (!excerpt) return []
    const sentences = excerpt.match(/[^。！？!?\n]+[。！？!?]?/gu) ?? []
    const passages = sentences.flatMap((sentence) => sentence.split(/(?<=\.)\s+/u))
      .map((part) => part.trim()).filter((part) => part.length >= 20)
    return (passages.length ? passages : [excerpt]).slice(0, 8)
      .map((quote) => ({ title: material.title, url: material.url, quote: quote.slice(0, 420) }))
  })
  const evidence = []
  const seen = new Set()
  for (let i = 0; i < 8 && evidence.length < 20; i++) {
    for (const group of groups) {
      const item = group[i]
      if (!item || evidence.length >= 20) continue
      const key = item.quote.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
      if (key.length < 12 || seen.has(key)) continue
      seen.add(key)
      evidence.push({ ...item, ref: 'E' + (evidence.length + 1) })
    }
  }
  return evidence
}

export function validateQuestions(input, evidence, limit = 12) {
  if (!Array.isArray(input)) return []
  const seen = new Set()
  return input.flatMap((item) => {
    const prompt = typeof item?.prompt === 'string' ? item.prompt.trim().slice(0, 300) : ''
    const source = evidence.find((entry) => entry.ref === String(item?.evidence ?? '').trim().toUpperCase())
    const options = Array.isArray(item?.options) ? Array.from(item.options, (value) => typeof value === 'string' ? value.trim().slice(0, 230) : '') : []
    const answer = typeof item?.answer === 'string' ? ['A', 'B', 'C', 'D'].indexOf(item.answer.trim().toUpperCase()) : item?.answer
    const key = prompt.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '')
    if (!key || seen.has(key) || options.length !== 4 || new Set(options).size !== 4 || options.some((value) => !value) ||
        !Number.isInteger(answer) || answer < 0 || answer > 3 || !source ||
        typeof item.explanation !== 'string' || !item.explanation.trim()) return []
    seen.add(key)
    return [{
      id: String(seen.size), prompt, options, answer,
      concept: String(item.concept || source.title).slice(0, 100),
      explanation: item.explanation.trim().slice(0, 480),
      evidence: { title: source.title, url: source.url, quote: source.quote },
    }]
  }).slice(0, limit)
}

export function fallbackQuestions(materials, limit = 4) {
  const passages = collectEvidence(materials).filter((item) => item.quote.length >= 22)
  return passages.slice(0, limit).map((item, i) => {
    const sentence = item.quote
    const words = sentence.match(/\S+/g) ?? []
    const midpoint = Math.floor(sentence.length / 2)
    const boundary = [...sentence.matchAll(/[，、,：:]/gu)].map((match) => match.index + 1)
      .filter((position) => position > sentence.length / 4 && position < sentence.length * 0.7)
      .sort((a, b) => Math.abs(a - midpoint) - Math.abs(b - midpoint))[0]
    const half = boundary ? sentence.slice(0, boundary) : words.length >= 8 ? words.slice(0, Math.ceil(words.length / 2)).join(' ') : sentence.slice(0, midpoint)
    const tail = sentence.slice(half.length).trim()
    const answer = i % 4
    const options = ['原文只描述了研究背景，未给出相关细节。', '原文给出的是另一个没有写出的结论。', '原文没有提供这一段的后续表述。']
    options.splice(answer, 0, tail)
    return { id: String(i + 1), prompt: `结合课文，原文在「${half}」之后如何表述？`, options, answer,
      concept: item.title, explanation: '注意前半句的条件，以及后半句实际说了什么。可以打开原文定位整句。',
      evidence: { title: item.title, url: item.url, quote: sentence } }
  })
}

export function scoreQuestions(questions, answers) {
  const wrong = questions.filter((question) => answers[question.id] !== question.answer)
  return { correct: questions.length - wrong.length, total: questions.length, wrong }
}
export const ASSESSMENT_EDITION = 'materials-2026-11-18'

