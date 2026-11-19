import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Profile } from '../lib/profile'
import type { Topic } from '../../shared/learning.mjs'
import { topDomains } from '../../shared/profile.mjs'

type Rec = {
  Title: string
  Url: string
  ContentText: string
  AuthorName: string
  VoteUpCount: number
  ContentType: string
  _domain: string
  _domainName: string
  _depth: string
  _reason: string
}

const DEPTH_LABEL: Record<string, string> = {
  entry: '入门',
  intermediate: '进阶',
  advanced: '深水区',
}

/**
 * 「为你找的」——热榜匹配不上时的主要供给线。
 * 用画像去知乎搜索，而不是等热榜碰运气。
 */
export function ForYou({ profile, onLearn }: { profile: Profile; onLearn: (topic: Topic) => void }) {
  const [items, setItems] = useState<Rec[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const tops = topDomains(profile, 2)

  useEffect(() => {
    if (!tops.length) return
    let alive = true
    setLoading(true)
    setErr(null)
    api
      .recommend(profile)
      .then((r) => {
        if (!alive) return
        setItems((r.items ?? []).filter((x: Rec) => !(x as any)._error))
        setTasks(r.tasks ?? [])
      })
      .catch((e) => alive && setErr(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(tops.map((t) => t.id + t.level.toFixed(1)))])

  if (!tops.length) return null

  const grouped = new Map<string, Rec[]>()
  for (const it of items) {
    const k = it._domainName
    if (!grouped.has(k)) grouped.set(k, [])
    grouped.get(k)!.push(it)
  }

  return (
    <section>
      <div className="route-heading">
        <h3>为你找的</h3>
        <p>根据你关注的 {tops.map((t) => t.name).join('、')} 推荐</p>
      </div>

      {loading && (
        <div className="loading" style={{ padding: '20px 0' }}>
          <i />
          <i />
          <i />
          <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--dim)' }}>正在按你的水平检索</span>
        </div>
      )}
      {err && <div className="banner err">{err}</div>}

      {[...grouped.entries()].map(([name, list]) => {
        const t = tasks.find((x) => x.domainName === name)
        return (
          <div className="recommend-group" key={name}>
            <div className="recommend-meta">
              <span className="tag dom">{name}</span>
              {t && <span className="tag">{DEPTH_LABEL[t.depth] ?? t.depth}</span>}
              {t && <span style={{ fontSize: 12, color: 'var(--dim)' }}>{t.reason}</span>}
            </div>
            <div className="result-list">
              {list.slice(0, 4).map((it, i) => (
                <article className="card search-hit" key={it.Url + i}>
                  <h4>
                    <a href={it.Url} target="_blank" rel="noreferrer">
                      {it.Title}
                    </a>
                  </h4>
                  {it.ContentText && <p className="hot-sum">{it.ContentText}</p>}
                  <div className="recommend-meta">
                    {it.AuthorName && <span className="tag">{it.AuthorName}</span>}
                    {typeof it.VoteUpCount === 'number' && <span className="tag">{it.VoteUpCount} 赞</span>}
                    <button className="btn ghost" onClick={() => onLearn({
                      title: it.Title, materials: [{title: it.Title, source: 'zhihu', url: it.Url, excerpt: it.ContentText}],
                    })}>带去学习</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}

