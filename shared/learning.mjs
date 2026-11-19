import { detectDomains, domainById } from './domain.mjs'
import { zpdScore } from './profile.mjs'

export const SOURCE_NAMES = {
  hot: '知乎热榜',
  zhihu: '知乎社区',
  global: '站外资料',
  paper: '论文原文',
}

export function sourceHost(url) {
  const parsed = URL.parse(String(url ?? ''))
  return parsed?.protocol === 'https:' || parsed?.protocol === 'http:' ? parsed.hostname.toLowerCase() : ''
}

export function isZhihu(url) {
  const host = sourceHost(url)
  return host === 'zhihu.com' || host.endsWith('.zhihu.com')
}

export function cleanMaterials(materials) {
  if (!Array.isArray(materials)) return []
  const seen = new Set()
  return materials.flatMap((item) => {
    if (typeof item?.title !== 'string' || !Object.hasOwn(SOURCE_NAMES, item.source)) return []
    const title = item.title.trim().slice(0, 180)
    const excerpt = typeof item.excerpt === 'string' ? item.excerpt.trim().slice(0, 4500) : ''
    const url = sourceHost(item.url) ? String(item.url).slice(0, 1600) : ''
    const key = url || title
    if (!title || seen.has(key)) return []
    seen.add(key)
    return [{ title, excerpt, url, source: item.source }]
  }).slice(0, 6)
}

const TASK = {
  entry: ['复述与举例', '合上资料，用自己的话解释这里最重要的概念，再举一个资料里没有的例子。', '说明它解决什么问题、怎么起作用，以及你的例子为什么符合这个概念。'],
  intermediate: ['把方法用一遍', '选一个小场景，用资料里的方法给出步骤，再写出会改变你选择的一个条件。', '写清输入、做法、怎样检查结果，以及何时该换方案。'],
  advanced: ['检验一条主张', '从资料中挑一个关键结论，写出支持证据、一个反例或混淆因素，以及验证它的最小实验。', '把观察和解释分开；明确基线、指标和什么结果会让你改变判断。'],
}

export function studyRoute(profile, title, materials = [], domain, stageDepth) {
  const candidates = detectDomains([title, ...materials.map((item) => item.title)].join(' '), 5)
  const goalMatches = candidates.find((item) => item.id === profile.goal?.domain)
  const focus = domainById(domain) ?? goalMatches ?? candidates.find((item) => profile.domains[item.id]?.assessment)
    ?? candidates[0]
  const id = focus?.id ?? 'research'
  const depth = Object.hasOwn(TASK, stageDepth) ? stageDepth : zpdScore(profile, id).depth
  const [titleText, question, rubric] = TASK[depth]
  return { domain: id, name: focus?.name ?? '资料阅读', depth, title: titleText, question, rubric, minutes: profile.goal?.minutes ?? 15 }
}

export function lessonScope(materials, depth, minutes) {
  const unique = new Set()
  let units = 0
  for (const { excerpt } of materials) {
    const content = String(excerpt ?? '').normalize('NFKC')
    const key = content.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
    if (!key || unique.has(key)) continue
    unique.add(key)
    units += (content.match(/\p{Script=Han}/gu)?.length ?? 0) + (content.match(/[A-Za-z0-9]+/g)?.length ?? 0) * 2
  }
  const size = units < 180 ? 0 : units < 600 ? 1 : units < 1250 ? 2 : 3
  const extra = depth === 'advanced' ? 2 : depth === 'intermediate' ? 1 : 0
  const paper = materials.some((item) => item.source === 'paper')
  const questions = !units ? 0 : paper ? 10 + (size >= 2 ? extra : 0) : size >= 2 || (size > 0 && extra > 0) ? 5 : 4
  const minQuestions = units ? (paper ? 10 : 4) : 0
  const maxChars = Math.min(minutes <= 5 ? 740 : 2400, [480, 850, 1300, 1800][size] + (size > 0 ? extra * 230 : 0))
  const minChars = Math.round(maxChars * 0.55 / 50) * 50
  return { questions, minQuestions, minChars, maxChars, units }
}

export function depthInstruction(depth) {
  if (depth === 'advanced') return '重点比较方法的适用边界、证据强弱和可验证的反例。'
  if (depth === 'intermediate') return '重点考怎样使用方法、比较做法和排查失败。'
  return '重点讲清核心概念、输入输出，并用具体例子检查理解。'
}

export function stageDepthAt(start, index) {
  const sequence = ['entry', 'intermediate', 'advanced']
  return sequence[Math.min(sequence.length - 1, Math.max(index, sequence.indexOf(start)))]
}

export function sourceLearningSheet(title, materials, profile, route) {
  const shortSession = route.minutes <= 5
  const readable = materials.filter((item) => item.excerpt)
  const excerpts = (shortSession ? readable.slice(0, 1) : readable).map((item) => {
    const limit = 530
    const excerpt = shortSession && item.excerpt.length > limit
      ? item.excerpt.slice(0, limit).trimEnd() + '…（完整内容见上方原文）'
      : item.excerpt
    return `### ${item.title}\n${SOURCE_NAMES[item.source]}提供的摘录：\n\n${excerpt}`
  })
  return [
    `## ${title}`,
    `### 本次学习目标`,
    profile.goal ? `沿着你填写的目标「${profile.goal.text}」学习。如果原资料和目标距离较远，先抓住资料本身要回答的问题。`
      : '先把这次探索收敛成一个可回答的问题，学完后再检查自己能否回答。',
    `用 ${route.minutes} 分钟完成「${route.title}」。`,
    '## 可核对的阅读材料',
    ...(excerpts.length ? excerpts : ['目前只取得了标题或链接。先打开来源找原文，再判断核心结论及其证据。']),
    '## 怎么读',
    route.depth === 'entry' ? '先圈出关键词，逐个写下它在原文指什么。找一处例子核对自己的理解，再用自己的话讲一遍过程。'
      : route.depth === 'intermediate' ? '先提取资料的做法、适用条件和产出。挑一处可执行的步骤，把它用于自己的问题，并记录失败时你会先检查什么。'
      : '抽出作者的主张、证据和适用范围。对照来源的样本、指标、基线和作者身份，找出解释不同结果的条件。',
    '社区经历适合找具体做法。对于数字、因果和普遍结论，先找站外原文，逐条核对它实际支持到哪一步。有分歧就保留分歧。',
    '## 合上资料试一试',
    route.question,
    `自检时看这几项：${route.rubric}`,
  ].join('\n\n')
}
