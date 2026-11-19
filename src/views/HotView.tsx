import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { record, type Profile } from '../lib/profile'
import { Mate, type MateMood } from '../components/Mate'
import { MateMini } from '../components/Mate'
import { ForYou } from '../components/ForYou'
import type { Topic } from '../../shared/learning.mjs'

type Item = {
  Title: string
  Url: string
  Summary: string
  ThumbnailUrl: string
  _affinity?: number
  _reason?: string
  _domains?: string[]
}

export function HotView({
  profile,
  onProfile,
  onLearn,
}: {
  profile: Profile
  onProfile: (p: Profile) => void
  onLearn: (topic: Topic) => void
}) {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [detail, setDetail] = useState<Item | null>(null)
  const [mood, setMood] = useState<MateMood>('idle')

  async function load(p: Profile) {
    setLoading(true)
    setErr(null)
    try {
      const r = await api.hot(p)
      setItems(r.items ?? [])
      setMood('hello')
      setTimeout(() => setMood('idle'), 4200)
    } catch (e: any) {
      setErr(e.message ?? '加载热榜失败')
      setMood('sleepy')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(profile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function learn(item: Item) {
    onLearn({ title: item.Title, materials: [{ title: item.Title, source: 'hot', url: item.Url, excerpt: item.Summary }] })
  }

  function openDetail(item: Item) {
    setDetail(item)
    setMood('thinking')
  }

  const hasProfile = Object.keys(profile.domains).length > 0

  return (
    <>
      <div className="topbar">
        <div>
          <h2>今日热榜</h2>
          <p>
            {hasProfile
              ? '优先展示与你的学习兴趣相关的话题。选一条带去学习。'
              : '从一个热点出发，沿着相关概念、例子和证据往下学。'}
          </p>
        </div>
        <button className="btn" onClick={() => load(profile)} disabled={loading}>
          刷新
        </button>
      </div>

      {err && <div className="banner err">{err}</div>}

      <div className="content-grid">
        <div>
          {loading && items.length === 0 && (
            <div className="empty">
              <MateMini mood="thinking" />
              <div className="loading">
                <i />
                <i />
                <i />
              </div>
              <p>正在取热榜</p>
            </div>
          )}

          {!loading && items.length === 0 && !err && (
            <div className="empty">
              <MateMini mood="wander" />
              <p>热榜暂时是空的</p>
            </div>
          )}

          <div className="hot-grid">
            {items.map((it, i) => {
              const showAff = hasProfile && (it._affinity ?? 0) > 0.05
              return (
                <article key={it.Url} className={'hot-item' + (i < 3 ? ' top3' : '') + (showAff ? ' fresh' : '')}>
                  <div className="hot-rank">{i + 1}</div>
                  <div>
                    <h3 className="hot-title">
                      <button className="text-button" onClick={() => openDetail(it)}>
                        {it.Title}
                      </button>
                    </h3>
                    {it.Summary && <p className="hot-sum">{it.Summary}</p>}
                    <div className="hot-meta">
                      {showAff && <span className="tag aff">贴合度 {Math.round((it._affinity ?? 0) * 100)}</span>}
                      {it._domains?.slice(0, 2).map((d) => (
                        <span key={d} className="tag dom">
                          {d}
                        </span>
                      ))}
                      <div className="react">
                        <button onClick={() => learn(it)}>
                          想深入
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>

        <Mate
          mood={mood}
          say={
            loading
              ? '稍等，我去看看今天有什么。'
              : '点「想深入」，我们在聊天里一起梳理知识、证据和练习。'
          }
        />
      </div>

      <ForYou profile={profile} onLearn={onLearn} />

      {detail && <DetailDrawer item={detail} onClose={() => setDetail(null)} onProfile={onProfile} onLearn={() => learn(detail)} />}
    </>
  )
}

function DetailDrawer({
  item,
  onClose,
  onProfile,
  onLearn,
}: {
  item: Item
  onClose: () => void
  onProfile: (p: Profile) => void
  onLearn: () => void
}) {
  const [answers, setAnswers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [started] = useState(Date.now)

  useEffect(() => {
    let alive = true
    api
      .answers(item.Url)
      .then((r) => {
        if (alive) setAnswers(r.items ?? [])
      })
      .catch((e) => alive && setErr(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [item.Url])

  function close() {
    const dwell = Date.now() - started
    onProfile(record({ kind: 'open', topic: item.Title, dwellMs: dwell }))
    onClose()
  }

  return (
    <div className="drawer-mask" onClick={close}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="detail-title">{item.Title}</h3>
        <div className="sub">
          {item._domains?.length ? item._domains.join(' · ') + ' · ' : ''}
          <a href={item.Url} target="_blank" rel="noreferrer">
            去知乎看原问题
          </a>
        </div>

        {loading && (
          <div className="loading">
            <i />
            <i />
            <i />
            <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--dim)' }}>正在取回答</span>
          </div>
        )}
        {err && <div className="banner err">{err}</div>}

        {!loading && answers.length === 0 && !err && (
          <p style={{ color: 'var(--dim)', fontSize: 13.5 }}>这个问题下暂时没有可读的回答摘要，可以直接去原页看。</p>
        )}

        {answers.map((a, i) => (
          <div className="answer" key={a.ContentToken ?? i}>
            <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 4 }}>回答 {i + 1}</div>
            {a.Summary}
            <div style={{ marginTop: 6 }}>
              <a href={a.Url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                读原文
              </a>
            </div>
          </div>
        ))}

        <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
          <button className="btn primary" onClick={close}>
            看完了
          </button>
          <button
            className="btn"
            onClick={() => { close(); onLearn() }}
          >
            想深入这个
          </button>
        </div>
      </div>
    </div>
  )
}

