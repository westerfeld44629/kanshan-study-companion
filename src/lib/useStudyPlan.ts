import { useEffect, useRef, useState } from 'react'
import type { StudyPlan } from '../../shared/learning.mjs'
import { api } from './api'
import type { Profile } from './profile'

const STORE = 'kanshan.plan.v2'
const pending = new Map<string, { request: Promise<{ plan: StudyPlan }>; controller: AbortController }>()

function loadPlan() {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? 'null') as { key: string; plan: StudyPlan } | null
  } catch { return null }
}

function savedPlan(key: string) {
  const saved = loadPlan()
  return saved?.key === key ? saved.plan : null
}

export function useStudyPlan(profile: Profile, enabled: boolean) {
  const goal = profile.goal
  const key = JSON.stringify([goal, goal && profile.domains[goal.domain]?.level])
  const [result, setResult] = useState<{ key: string; plan: StudyPlan | null; error?: string }>(() => ({ key, plan: savedPlan(key) }))
  const [retry, setRetry] = useState(0)
  const revision = useRef(0)

  useEffect(() => {
    if (!goal || !enabled) return
    const cached = savedPlan(key)
    setResult({ key, plan: cached })
    if (cached && !retry) return
    let active = true
    const currentRevision = revision.current
    let job = pending.get(key)
    if (!job) {
      const controller = new AbortController()
      const request = api.plan(profile, controller.signal).finally(() => {
        if (pending.get(key)?.controller === controller) pending.delete(key)
      })
      job = { request, controller }
      pending.set(key, job)
    }
    job.request.then(({ plan }) => {
      if (!active || currentRevision !== revision.current) return
      setResult({ key, plan })
      try { localStorage.setItem(STORE, JSON.stringify({ key, plan })) } catch { /* 本次仍可学习 */ }
    }).catch((error: Error) => { if (active && currentRevision === revision.current) setResult({ key, plan: cached, error: error.message }) })
    return () => { active = false }
  }, [enabled, key, retry])

  const plan = result.key === key ? result.plan : null
  function forget() {
    localStorage.removeItem(STORE)
    revision.current++
    pending.get(key)?.controller.abort()
    pending.delete(key)
    setResult({ key, plan: null })
    setRetry(0)
  }

  function currentPlanForCleanup() {
    const saved = loadPlan()?.plan
    return plan ?? (saved && saved.goal.text === goal?.text && saved.goal.domain === goal?.domain ? saved : null)
  }

  return { plan, error: result.key === key ? result.error : undefined,
    retry: () => setRetry((n) => n + 1), forget, currentPlanForCleanup }
}
