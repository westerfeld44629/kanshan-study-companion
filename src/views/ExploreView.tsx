import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { record, type Profile } from '../lib/profile'
import { isZhihu, sourceHost, type Material, type Topic } from '../../shared/learning.mjs'

type Source = 'zhihu' | 'global'
type Mode = Source | 'both'
type Hit = { Title: string; Url: string; ContentText?: string; AuthorName?: string }
type Results = { query: string; mode: Mode; lanes: Record<Source, Material[]>; errors: Partial<Record<Source, string>>; duplicates: number; tried?: string[]; caveat?: string }

const LANES = {
  zhihu: { title: '知乎社区', purpose: '找具体做法、实践经历和不同观点。' },
  global: { title: '站外资料', purpose: '找论文、文档或发布者原文，核对社区里的说法。' },
}

function referenceType(url?: string) {
  if (!sourceHost(url)) return ''
  const parsed = new URL(url!)
  const { hostname, pathname } = parsed
  if (['arxiv.org', 'doi.org', 'pubmed.ncbi.nlm.nih.gov', 'openreview.net'].includes(hostname)) return '论文或索引'
  if (hostname.startsWith('docs.') || hostname === 'scikit-learn.org' || /\/(?:docs|documentation)\//.test(pathname)) return '文档'
  if (hostname.endsWith('.gov') || hostname.endsWith('.gov.cn')) return '政府来源'
  return ''
}

function canonical(url: string) {
  const parsed = new URL(url)
  for (const key of [...parsed.searchParams.keys()]) if (key.startsWith('utm_')) parsed.searchParams.delete(key)
  parsed.hash = ''
  return parsed.href
}

export function ExploreView({ profile, onProfile, onLearn }: {
  profile: Profile
  onProfile: (p: Profile) => void
  onLearn: (topic: Topic) => void
}) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<Mode>('both')
  const [results, setResults] = useState<Results | null>(null)
  const [selected, setSelected] = useState<Material[]>([])
  const [busy, setBusy] = useState(false)

  async function search(event: FormEvent) {
    event.preventDefault()
    const text = query.trim()
    if (!text || busy) return
    setResults(null)
    setSelected([])
    setBusy(true)
    const sources: Source[] = mode === 'both' ? ['zhihu', 'global'] : [mode]
    const fetched = await Promise.allSettled(sources.map((source) => api.search(text, source)))
    const result: Results = { query: text, mode, lanes: { zhihu: [], global: [] }, errors: {}, duplicates: 0 }
    const urls = new Set()
    for (const [index, response] of fetched.entries()) {
      const source = sources[index]
      if (response.status === 'rejected') {
        result.errors[source] = response.reason?.message ?? '这一来源暂时不可用'
        continue
      }
      if (source === 'global') {
        result.tried = response.value.tried
        result.caveat = response.value.caveat
      }
      for (const hit of (response.value.items ?? []) as Hit[]) {
        if (!hit.Title || !sourceHost(hit.Url)) continue
        const key = canonical(hit.Url)
        const lane = isZhihu(hit.Url) ? 'zhihu' : 'global'
        if (source === 'global' && lane === 'zhihu') {
          result.duplicates++
          if ((mode === 'global' || result.errors.zhihu) && !urls.has(key)) {
            urls.add(key)
            result.lanes.zhihu.push({ title: hit.Title, url: hit.Url, excerpt: hit.ContentText, source: 'zhihu' })
          }
          continue
        }
        if (urls.has(key)) continue
        urls.add(key)
        result.lanes[lane].push({ title: hit.Title, url: hit.Url, excerpt: hit.ContentText, source: lane })
      }
    }
    result.lanes.global.sort((a, b) => Number(Boolean(referenceType(b.url))) - Number(Boolean(referenceType(a.url))))
    setResults(result)
    if (fetched.some((response) => response.status === 'fulfilled')) onProfile(record({ kind: 'ask', text }))
    setBusy(false)
  }

  function toggle(material: Material) {
    setSelected((items) => items.some((item) => item.url === material.url)
      ? items.filter((item) => item.url !== material.url)
      : items.length < 4 ? [...items, material] : items)
  }

  return (
    <>
      <header className="topbar">
        <div><h2>找资料</h2><p>从一个问题出发，对照社区经验和原始来源，再挑材料去学习。</p></div>
      </header>
      <form className="card search-form" onSubmit={search}>
        <div className="search-query">
          <label htmlFor="search-query">这次要查清什么？</label>
          <input id="search-query" className="field" type="search" maxLength={160} value={query}
            onChange={(event) => setQuery(event.target.value)} placeholder="例如：交叉验证为什么会数据泄漏" />
        </div>
        <div>
          <label htmlFor="search-source">检索范围</label>
          <select id="search-source" className="field" value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
            <option value="both">两边对照</option><option value="zhihu">知乎社区</option><option value="global">全网</option>
          </select>
        </div>
        <button className="btn primary" disabled={busy || !query.trim()}>{busy ? '正在搜索…' : '搜索'}</button>
      </form>
      {!busy && !results && profile.goal && <button className="btn ghost" onClick={() => setQuery(profile.goal!.text)}>用我的学习目标做查询</button>}
      {busy && <p role="status">正在查找可对照的资料…</p>}
      {results && (
        <>
          <section className="card search-next">
            <div>
              <h3>下一步 · 用资料回答「{results.query}」</h3>
              <p>可选 1–4 份资料，让看山区分作者观点、证据和仍需核对的部分。</p>
              {results.duplicates > 0 && <p>全网结果包含知乎内容；站外栏只显示站外来源。</p>}
            </div>
            <button className="btn primary" disabled={!selected.length} onClick={() =>
              onLearn({ title: results.query, materials: selected })}>带所选资料去学习{selected.length ? `（${selected.length}）` : ''}</button>
          </section>
          <div className="search-lanes">
            {(Object.keys(LANES) as Source[]).map((source) => {
              const materials = results.lanes[source]
              if (results.mode !== 'both' && results.mode !== source && !materials.length) return null
              return (
                <section className="result-list" key={source} aria-label={LANES[source].title}>
                  <header><h3>{LANES[source].title}</h3><p>{LANES[source].purpose}</p></header>
                  {results.errors[source] && <p className="banner err" role="alert">{results.errors[source]}</p>}
                  {source === 'global' && materials.length > 0 && results.caveat &&
                    <p className="card inline-state search-empty" role="status">{results.caveat}</p>}
                  {!results.errors[source] && !materials.length && <div className="card inline-state search-empty" role="status">
                    <strong>{source === 'global' ? '本次没有找到可展示的站外资料' : '本次没有找到知乎资料'}</strong>
                    {source === 'global' && results.tried && results.tried.length > 1 && <p>补查关键词 · {results.tried[1]}</p>}
                    {source === 'global' && results.caveat && <p>{results.caveat}</p>}
                    <p>可添加产品全名、机构名或具体问题，再搜索一次。</p>
                  </div>}
                  {materials.map((material) => {
                    const chosen = selected.some((item) => item.url === material.url)
                    return <article className="card search-hit" key={material.url}>
                      <h4><a href={material.url} target="_blank" rel="noreferrer">{material.title}</a></h4>
                      <span className="tag">{sourceHost(material.url)}</span>
                      {source === 'global' && referenceType(material.url) && <span className="tag dom">{referenceType(material.url)}</span>}
                      {material.excerpt && <p className="hot-sum">{material.excerpt}</p>}
                      <div className="chips">
                        <button className="btn ghost" aria-pressed={chosen} disabled={!chosen && selected.length >= 4}
                          onClick={() => toggle(material)}>{chosen ? '已选入对照' : '选入对照'}</button>
                        <button className="btn" onClick={() => onLearn({ title: material.title, materials: [material] })}>带去学习</button>
                      </div>
                    </article>
                  })}
                </section>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
