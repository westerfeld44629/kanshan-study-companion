import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { api } from '../lib/api'
import { record, type Profile } from '../lib/profile'
import { SOURCE_NAMES, sourceHost, studyRoute, type LessonSeed, type Topic } from '../../shared/learning.mjs'
import { Markdown } from '../components/Markdown'
import { LessonAssessment } from '../components/LessonAssessment'
import { ASSESSMENT_EDITION } from '../../shared/assessment.mjs'
import type { Attempt, Attempts, NextLesson } from '../lib/studyProgress'
import { loadNotebook, saveNotebook, withoutThreads, type Message, type Notebook, type Thread } from '../lib/notebook'

export type CoachControls = {
  forgetLessons: (lessons: ReadonlySet<string>) => string[]
}

export function CoachView({ ref, profile, onProfile, request, active, attempts, onSaveAttempt, onSubmitAttempt, onPlan, onReview, nextLesson, onForgetChats }: {
  ref: Ref<CoachControls>
  profile: Profile
  onProfile: (p: Profile) => void
  request: { id: number; topic: Topic; seed?: LessonSeed } | null
  active: boolean
  attempts: Attempts
  onSaveAttempt: (attempt: Attempt) => void
  onSubmitAttempt: (attempt: Attempt) => void
  onPlan: () => void
  onReview: () => void
  nextLesson: (key: string) => NextLesson | undefined
  onForgetChats: (ids: string[], all: boolean) => void
}) {
  const [notebook, setNotebook] = useState(loadNotebook)
  const current = useRef(notebook)
  const pending = useRef(new Map<string, AbortController>())
  const pendingAssessment = useRef<{ thread: string; controller: AbortController } | null>(null)
  const latestRequest = useRef(0)
  const [waiting, setWaiting] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [assessmentBusy, setAssessmentBusy] = useState('')
  const [assessmentError, setAssessmentError] = useState<{ key: string; reason: string } | null>(null)
  const [storageError, setStorageError] = useState(false)
  const [notice, setNotice] = useState('')
  const scroll = useRef<HTMLDivElement>(null)
  const thread = notebook.threads.find((item) => item.id === notebook.active)
  const busy = Boolean(thread && waiting.includes(thread.id))
  const assessmentKey = thread?.topic?.lessonId || thread?.id || ''
  const updatedKey = assessmentKey + ':expanded'
  const attempt = attempts[updatedKey] ?? attempts[assessmentKey]
  const paper = thread?.topic?.materials.some((material) => material.source === 'paper')
  const canExpand = !thread?.topic?.lessonId && attempt && attempt.assessment.edition !== ASSESSMENT_EDITION &&
    attempt.assessment.questions.length < (paper ? 10 : 4)

  function publish(next: Notebook) {
    current.current = next
    setNotebook(next)
    try { saveNotebook(next); setStorageError(false) }
    catch { setStorageError(true) }
  }

  function save(item: Thread, select = false) {
    const previous = current.current
    const threads = [item, ...previous.threads.filter((candidate) => candidate.id !== item.id)].slice(0, 12)
    publish({ active: select ? item.id : previous.active, threads })
  }

  function select(id: string) {
    publish({ ...current.current, active: id })
    setDraft('')
    setNotice('')
  }

  function forget(ids: ReadonlySet<string>) {
    const wasActive = ids.has(current.current.active)
    const next = withoutThreads(current.current, ids)
    saveNotebook(next)
    for (const id of ids) {
      pending.current.get(id)?.abort()
      pending.current.delete(id)
    }
    const exam = pendingAssessment.current
    if (exam && ids.has(exam.thread)) {
      exam.controller.abort()
      pendingAssessment.current = null
      setAssessmentBusy('')
    }
    setWaiting([...pending.current.keys()])
    current.current = next
    setNotebook(next)
    if (wasActive) setDraft('')
    setAssessmentError(null)
    setStorageError(false)
    setNotice('')
  }

  useImperativeHandle(ref, () => ({
    forgetLessons(lessons) {
      const ids = new Set(lessons)
      for (const thread of current.current.threads) if (thread.topic?.lessonId && lessons.has(thread.topic.lessonId)) ids.add(thread.id)
      forget(ids)
      return [...ids]
    },
  }))

  useEffect(() => () => {
    for (const controller of pending.current.values()) controller.abort()
    pending.current.clear()
    pendingAssessment.current?.controller.abort()
    pendingAssessment.current = null
  }, [])

  function clearChats(all: boolean) {
    if (!all && !thread) return false
    const message = all ? '清空此浏览器的全部对话？这会移除聊天记录。'
      : `删除对话「${thread!.title}」？这会移除这条对话的聊天记录。`
    if (!confirm(message + ' 也会删除从这些对话提炼的自动记忆。')) return false
    const ids = all ? new Set([...current.current.threads.map((item) => item.id), ...pending.current.keys(), current.current.active])
      : new Set([thread!.id])
    if (all && pendingAssessment.current) ids.add(pendingAssessment.current.thread)
    try {
      forget(ids)
      onForgetChats([...ids], all)
      if (all) setDraft('')
      setNotice(all ? '已清空全部对话。' : '已删除这条对话。')
      return true
    } catch {
      setNotice('浏览器未能清理对话存储，请重试。')
      return false
    }
  }

  async function reply(base: Thread, intent: 'start' | 'followup', text = '', retry = false) {
    if (pending.current.has(base.id)) return
    const previous = retry ? base.messages.slice(0, -1) : base.messages
    const question = text || (intent === 'start' ? `请带我系统学习「${base.topic?.title ?? base.title}」。` : '')
    if (!question) return
    const messages: Message[] = [...previous, { role: 'user', text: question }]
    const working = { ...base, messages, error: undefined, failedIntent: undefined }
    save(working, true)
    const controller = new AbortController()
    pending.current.set(base.id, controller)
    setWaiting([...pending.current.keys()])

    let next = profile
    if (intent === 'followup' && !retry) {
      next = record({ kind: 'ask', text: question, thread: base.id })
      onProfile(next)
    }
    try {
      const response = await api.coach(next, {
        question, topic: base.topic, history: previous.slice(-6), intent,
      }, controller.signal)
      if (controller.signal.aborted) return
      save({
        ...working,
        topic: response.topic ?? base.topic,
        route: response.route ?? base.route,
        messages: [...messages, { role: 'assistant', text: response.content, degraded: response.degraded, reason: response.reason }],
      })
    } catch (e) {
      if (!controller.signal.aborted) save({ ...working, failedIntent: intent, error: e instanceof Error ? e.message : '讲解暂时无法生成' })
    } finally {
      if (pending.current.get(base.id) === controller) {
        pending.current.delete(base.id)
        setWaiting([...pending.current.keys()])
      }
    }
  }

  useEffect(() => {
    if (!request || latestRequest.current === request.id) return
    latestRequest.current = request.id
    const { topic } = request
    const id = topic.lessonId || JSON.stringify([topic.title, topic.materials.map((item) => item.url || item.title)])
    const existing = current.current.threads.find((item) => item.id === id)
    select(id)
    if (!existing || (!existing.messages.some((message) => message.role === 'assistant') && !pending.current.has(id))) {
      const item = existing ?? { id, title: topic.title, topic,
        route: studyRoute(profile, topic.title, topic.materials, topic.domain, topic.stageDepth), messages: [] }
      if (request.seed) {
        save({ ...item, error: undefined, failedIntent: undefined, messages: [
          { role: 'user', text: `继续学习「${topic.title}」。` }, { role: 'assistant', ...request.seed },
        ] }, true)
        return
      }
      void reply(item,
        'start', '', Boolean(existing?.messages.at(-1)?.role === 'user'))
    } else if (existing && topic.stageDepth && existing.topic?.stageDepth !== topic.stageDepth) {
      const updated = { ...topic, materials: existing.topic?.materials ?? topic.materials }
      save({ ...existing, topic: updated, route: studyRoute(profile, updated.title, updated.materials, updated.domain, updated.stageDepth) })
    }
  }, [request])

  useEffect(() => {
    if (!active || !scroll.current) return
    const view = scroll.current
    const last = view.querySelector<HTMLElement>('.coach-message:last-of-type')
    if (last) view.scrollTop = Math.max(0, last.offsetTop - 12)
  }, [active, thread?.id, thread?.messages.length])

  function send() {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    const base = thread ?? { id: crypto.randomUUID(), title: text.slice(0, 44), messages: [] }
    void reply(base, 'followup', text)
  }

  function retryReply(item: Thread) {
    const intent = item.failedIntent ?? (item.topic && !item.messages.some((message) => message.role === 'assistant') ? 'start' : 'followup')
    const last = item.messages.at(-1)
    void reply(item, intent, intent === 'followup' ? last?.text : '', last?.role === 'user')
  }

  async function assess(expand = false) {
    if (!thread?.topic || !thread.route || pendingAssessment.current || (attempt && !expand)) return
    const lesson = thread.messages.find((message) => message.role === 'assistant')?.text
    if (!lesson) return
    setAssessmentBusy(assessmentKey)
    setAssessmentError(null)
    const controller = new AbortController()
    pendingAssessment.current = { thread: thread.id, controller }
    try {
      const { assessment } = await api.assessment(profile, thread.topic, lesson, controller.signal)
      if (controller.signal.aborted) return
      onSaveAttempt({ key: expand ? updatedKey : assessmentKey, title: thread.title, domain: thread.route.domain, assessment, draft: {}, corrected: [] })
    } catch (error) {
      if (!controller.signal.aborted) setAssessmentError({ key: assessmentKey, reason: error instanceof Error ? error.message : '题目准备失败，请再试一次。' })
    } finally {
      if (pendingAssessment.current?.controller === controller) {
        pendingAssessment.current = null
        setAssessmentBusy('')
      }
    }
  }

  const sources = thread?.topic?.materials ?? []
  const route = thread?.route

  return (
    <div className="coach-screen">
      <header className="coach-head">
        <img src="/kanshan/待机_5秒_320x320_20fps_透明.gif" alt="" />
        <div>
          <h2>和看山聊</h2>
          <p>{profile.goal ? `学习目标 · ${profile.goal.text}` : '从一个想弄懂的问题开始'}</p>
        </div>
        <button className="btn ghost" onClick={() => select('')} disabled={!thread}>新对话</button>
      </header>

      <div className="coach-history">
        <label htmlFor="study-history">最近学习</label>
        <select id="study-history" className="field" value={notebook.active} onChange={(event) => select(event.target.value)}>
          <option value="">新对话</option>
          {notebook.threads.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        {notebook.threads.length > 0 && <details className="coach-cleanup">
          <summary>清理对话</summary>
          <div>
            <button type="button" className="btn ghost" disabled={!thread} onClick={(event) => {
              if (clearChats(false)) event.currentTarget.closest('details')?.removeAttribute('open')
            }}>删除当前对话</button>
            <button type="button" className="btn ghost" onClick={(event) => {
              if (clearChats(true)) event.currentTarget.closest('details')?.removeAttribute('open')
            }}>清空全部对话</button>
          </div>
        </details>}
      </div>

      <div className="coach-transcript" ref={scroll}>
        <div className="coach-column">
          {notice && <p role="status" className="coach-note">{notice}</p>}
          {!thread && (
            <div className="coach-welcome">
              <h3>今天想弄明白什么？</h3>
              <p>从热榜或资料带来一个主题，或在下面直接提问。</p>
              {profile.goal && <button className="btn" onClick={onPlan}>打开学习计划</button>}
            </div>
          )}
          {thread?.topic && (
            <section className="coach-source" aria-label="本次学习资料">
              <h3>{thread.topic.title}</h3>
              {route && <p>{route.name} · 约 {route.minutes} 分钟</p>}
              {thread.topic.objective && <p>阅读目标 · {thread.topic.objective}</p>}
              <details open>
                <summary>查看本次引用资料（{sources.length}）</summary>
                <ul>{sources.map((item, index) => (
                  <li key={item.url || item.title}>
                    <span>资料 {index + 1} · {SOURCE_NAMES[item.source]}</span>
                    {sourceHost(item.url) ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a> : <span>{item.title}</span>}
                  </li>
                ))}</ul>
              </details>
            </section>
          )}
          <div aria-live="polite" className="coach-messages">
            {thread?.messages.map((message, i) => (
              <article key={i} className={'coach-message ' + (message.role === 'user' ? 'coach-user' : 'coach-assistant')}>
                <span className="coach-author">{message.role === 'user' ? '你' : '看山'}</span>
                <div className="coach-text">
                  {message.degraded && <p className="coach-note">当前提供资料导读和自查步骤。{message.reason}</p>}
                  {message.role === 'user' ? <p className="coach-user-text">{message.text}</p> : <Markdown text={message.text} />}
                </div>
              </article>
            ))}
          </div>
          {busy && <p className="coach-note" role="status">看山正在整理完整讲解…</p>}
          {thread?.error && <div className="coach-note" role="alert">{thread.error}
            <button className="btn" onClick={() => retryReply(thread)}>重试这次请求</button>
          </div>}
          {route && !busy && thread?.messages.some((message) => message.role === 'assistant') && (
            attempt ? <>
              {canExpand && <section className="coach-task">
                <p>这份旧卷有 {attempt.assessment.questions.length} 道题。可以用同一材料另做新版测评，已有成绩和错题保留。</p>
                <button className="btn" onClick={() => void assess(true)} disabled={Boolean(assessmentBusy)}>
                  {assessmentBusy === assessmentKey ? '正在准备题目…' : '开始新版测评'}
                </button>
                {assessmentError?.key === assessmentKey && <p role="alert">{assessmentError.reason}</p>}
              </section>}
              <LessonAssessment attempt={attempt} onDraft={(draft) => onSaveAttempt({ ...attempt, draft })}
                onSubmit={() => onSubmitAttempt(attempt)} onReview={onReview} next={nextLesson(attempt.key)} />
            </>
            : <section className="coach-task" aria-label="学后测评">
              <h3>学后测评</h3>
              <p>{paper ? '根据原文生成至少 10 道论文题。' : '根据正文和本课深度生成约 4–5 道题。'} 交卷后查看解析和出处。</p>
              <button className="btn" disabled={Boolean(assessmentBusy)} onClick={() => void assess()}>
                {assessmentBusy === assessmentKey ? '正在准备题目…' : '完成阅读，开始测评'}
              </button>
              {assessmentError?.key === assessmentKey && <p role="alert">{assessmentError.reason}</p>}
            </section>
          )}
        </div>
      </div>

      <form className="coach-composer" onSubmit={(event) => { event.preventDefault(); send() }}>
        <div className="coach-input-row">
          <label className="visually-hidden" htmlFor="coach-input">想问看山什么</label>
          <textarea className="field" id="coach-input" rows={2} value={draft} maxLength={4000}
            placeholder="输入你的问题，或追问当前材料…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                event.preventDefault()
                send()
              }
            }} />
          <button className="btn primary" disabled={busy || !draft.trim()}>发送</button>
        </div>
        <p>{storageError ? '浏览器空间不足，本次对话可能无法在刷新后恢复。' : 'Enter 发送 · Shift+Enter 换行'}</p>
      </form>
    </div>
  )
}
