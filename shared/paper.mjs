import { detectDomains } from './domain.mjs'
import { zpdScore } from './profile.mjs'

export const MAX_PDF_BYTES = 100_000_000
export const CLOUD_JSON_PDF_BYTES = 3 * 1024 * 1024
const EXCERPT_LIMIT = 950

const SECTIONS = [
  ['abstract', '研究问题', /^(abstract|摘要|introduction|引言|背景)(?:\b|[：:\s]|$)/i],
  ['method', '研究方法', /^(methods?|methodolog(?:y|ies)|approach|framework|(?:rag\s+)?fundamentals|方法|研究方法|模型)(?:\b|[：:\s]|$)/i],
  ['result', '实验与结论', /^(experiments?|evaluation|benchmarks?|results?|conclusion|实验|实验结果|结果|结论)(?:\b|[：:\s]|$)/i],
  ['limit', '局限与边界', /^(limitations?|discussion|challenges|future (?:work|directions)|局限性?|讨论|展望)(?:\b|[：:\s]|$)/i],
]

function stripHeadingNumber(line) {
  return line.trim().replace(/^(?:\d+(?:\.\d+)*[.)]?|[IVXLCDM]+[.)])\s+/i, '')
}

export function isPaperHeading(line) {
  const heading = stripHeadingNumber(line)
  if (heading.length > 70) return false
  if (heading !== line.trim()) return true
  return /^(?:abstract|introduction|methods?|methodology|methodologies|approach|framework|experiments?|evaluation|benchmarks?|results?|conclusion|limitations?|discussion|challenges|future (?:work|directions)|references|bibliography|摘要|引言|研究方法|方法|实验|结果|结论|讨论|局限性?|展望|参考文献)\s*[:：.]?$/i.test(heading)
}

const TASKS = {
  entry: {
    label: '入门导读',
    order: ['abstract', 'reading', 'method', 'result', 'limit'],
    actions: {
      abstract: '用一句话说出作者想解决的问题，再圈出一个需要先弄懂的概念。',
      method: '找出方法的输入和输出，试着给各自举一个具体例子。',
      result: '找出作者比较了什么，用自己的话复述这项结果。',
      limit: '圈出一个作者说暂时做不到的场景，想想这个条件会影响哪个结论。',
      reading: '找出这一段的主张，摘出一句能支持它的原文。',
    },
  },
  intermediate: {
    label: '方法与实践',
    order: ['method', 'result', 'abstract', 'limit', 'reading'],
    actions: {
      abstract: '把问题改写成可验证的假设，写出一项可量化的指标。',
      method: '写出复现所需的输入、关键步骤和一个最小对照实验。',
      result: '核对数据、基线和指标，再决定先复现哪一个对照。',
      limit: '从作者承认的一项局限出发，设计一个低成本补充实验。',
      reading: '记录一项可以复现的细节，并在原文里找验证条件。',
    },
  },
  advanced: {
    label: '证据与局限',
    order: ['limit', 'result', 'method', 'abstract', 'reading'],
    actions: {
      abstract: '找出最强主张及其适用条件，写一个可能令它失效的场景。',
      method: '找出一个隐含假设，设计消融或替代基线来验证它。',
      result: '评估基线是否公平、指标是否支持主张，并找出还缺的证据。',
      limit: '把一项局限转写成可证伪的问题，给出验证方案。',
      reading: '定位一个可质疑的主张，指出原文支持和仍缺的证据。',
    },
  },
}

export function extractPaper(result, summary = '') {
  const pages = Array.isArray(result?.pages) ? result.pages : []
  const excerpts = new Map()
  const priorities = new Map()
  const fallback = []
  let title = ''
  let section = null
  let priority = 0
  for (const [index, page] of pages.entries()) {
    const number = Number.isInteger(page?.page) && page.page >= 0 ? page.page + 1 : index + 1
    for (const block of Array.isArray(page?.blocks) ? page.blocks : []) {
      if (typeof block?.content !== 'string' || block.type === 'figure') continue
      const raw = block.content.trim()
      const text = raw.replace(/\s+/g, ' ')
      if (!text) continue
      const firstLine = stripHeadingNumber(raw.split(/\r?\n/, 1)[0])
      if (/^(references|bibliography|参考文献)\s*$/i.test(firstLine)) return finish()
      const match = SECTIONS.find(([, , pattern]) => pattern.test(firstLine))
      if (!title && !match && block.type === 'title' && number === 1) title = text.slice(0, 180)
      if (match && (block.type === 'title' || isPaperHeading(raw.split(/\r?\n/, 1)[0]) || /^(abstract\b|摘要)\s*[:：.—–-]/i.test(firstLine))) {
        section = match
        priority = /^(abstract\b|摘要|benchmark\b|benchmarks\b|limitations?\b|局限)/i.test(firstLine) ? 3
          : /^\s*[IVXLCDM]+\.\s+/i.test(raw) ? 2 : 1
        if (raw !== firstLine && raw.includes('\n')) {
          keep(raw.split(/\r?\n/).slice(1).join(' ').replace(/\s+/g, ' '), number)
        } else if (/^(abstract\b|摘要)\s*[:：.—–-]/i.test(firstLine)) {
          keep(text.replace(/^(abstract\b|摘要)[\s:：.—–-]*/i, ''), number)
        }
      } else if (block.type === 'title') {
        section = null
      } else {
        keep(text, number)
      }
    }
  }
  return finish()

  function keep(text, page) {
    if (text.trim().length < 32) return
    const passage = limitExcerpt(text)
    if (section && (!excerpts.has(section[0]) || priority > priorities.get(section[0]))) {
      excerpts.set(section[0], { id: section[0], kind: section[0], label: section[1], page, text: passage })
      priorities.set(section[0], priority)
    } else if (section && excerpts.get(section[0])?.page === page && excerpts.get(section[0]).text.length < EXCERPT_LIMIT) {
      const previous = excerpts.get(section[0])
      previous.text = limitExcerpt(previous.text + ' ' + passage)
    } else if (fallback.length < 4 && !fallback.some((item) => item.page === page)) {
      fallback.push({ id: 'page-' + page, kind: 'reading', label: '原文线索', page, text: passage })
    }
  }

  function limitExcerpt(text) {
    if (text.length <= EXCERPT_LIMIT) return text
    return text.slice(0, EXCERPT_LIMIT).trimEnd() + '…'
  }

  function finish() {
    const cards = [...excerpts.values()]
    if (cards.length < 3) cards.push(...fallback.slice(0, 3 - cards.length))
    return { title, summary: typeof summary === 'string' ? summary.slice(0, 650) : '', pageCount: pages.length, cards }
  }
}

export function paperStudy(paper, profile) {
  const topic = ['论文', paper.title, paper.summary, ...paper.cards.slice(0, 2).map((card) => card.text)].join(' ')
  const domains = detectDomains(topic, 4)
  const matched = domains.find((domain) => domain.id === profile.goal?.domain) ?? domains.find((domain) => profile.domains[domain.id])
  const focus = matched ?? domains[0] ?? { id: 'research', name: '科研与论文' }
  const { depth, reason } = zpdScore(profile, focus.id)
  const { label, order, actions } = TASKS[depth]
  const cards = [...paper.cards].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
    .filter((card) => order.includes(card.kind))
    .map((card) => ({ ...card, action: actions[card.kind] }))
  return { focus, depth, label, reason, cards }
}
