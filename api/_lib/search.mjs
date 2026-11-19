import { globalSearch, zhihuSearch } from './zhihu.mjs'
import { isZhihu, sourceHost } from '../../shared/learning.mjs'

const cache = new Map()
const HOUR = 3_600_000

export function materialKey(url) {
  const parsed = URL.parse(url ?? '')
  if (!parsed || !sourceHost(url)) return ''
  for (const name of [...parsed.searchParams.keys()]) if (name.startsWith('utm_')) parsed.searchParams.delete(name)
  parsed.hash = ''
  return parsed.href
}

export function searchCached(query, mode, beforeRequest) {
  const key = mode + ':' + query
  const previous = cache.get(key)
  if (previous?.expires > Date.now()) return previous.promise
  const promise = Promise.resolve().then(beforeRequest)
    .then(() => (mode === 'global' ? globalSearch : zhihuSearch)(query, { count: 10 })).catch((error) => {
    if (cache.get(key)?.promise === promise) cache.delete(key)
    throw error
  })
  cache.set(key, { expires: Date.now() + HOUR, promise })
  if (cache.size > 350) cache.delete(cache.keys().next().value)
  return promise
}

export function isPrimaryCandidate(url) {
  const host = sourceHost(url)
  return ['openai.com', 'platform.openai.com', 'developers.openai.com', 'help.openai.com', 'arxiv.org',
    'huggingface.co', 'pytorch.org', 'scikit-learn.org', 'docs.python.org', 'doi.org', 'openreview.net'].includes(host) ||
    host.startsWith('docs.') || host.endsWith('.gov') || host.endsWith('.gov.cn')
}

function externalQuery(text) {
  const model = text.match(/\bgpt[\s‑–-]*(\d+(?:\.\d+)?)(?:\b|$)/i)
  if (model) return 'GPT-' + model[1] + ' OpenAI official release notes'
  return text + ' 官方文档 原始来源'
}

export async function searchExternal(query) {
  const initial = await searchCached(query, 'global')
  const original = initial.items ?? []
  const rawExternal = original.filter((hit) => sourceHost(hit.Url) && !isZhihu(hit.Url))
  const reformulated = externalQuery(query)
  const exactProduct = /\bgpt[\s‑–-]*\d/i.test(query)
  if (rawExternal.length && (!exactProduct || rawExternal.some((hit) => isPrimaryCandidate(hit.Url)))) {
    return { items: original, tried: [query] }
  }
  try {
    const secondary = await searchCached(reformulated, 'global')
    const keys = new Set()
    const items = [...original, ...(secondary.items ?? [])].filter((hit) => {
      const key = materialKey(hit.Url)
      if (!key || keys.has(key)) return false
      keys.add(key)
      return true
    })
    const exactPublisher = items.some((hit) => ['openai.com', 'platform.openai.com', 'developers.openai.com', 'help.openai.com'].includes(sourceHost(hit.Url)))
    return { items, tried: [query, reformulated], caveat: exactProduct && !exactPublisher ? '本次站外结果包含第三方报道，未检索到发布者官方页面。' : undefined }
  } catch {
    return { items: original, tried: [query, reformulated], caveat: '补查站外原始来源暂未成功。' }
  }
}
