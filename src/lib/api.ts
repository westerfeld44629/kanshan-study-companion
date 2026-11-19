import type { Paper, PaperCard } from '../../shared/paper.mjs'
import type { StudyPlan, StudyRoute, Topic } from '../../shared/learning.mjs'
import type { Assessment } from '../../shared/assessment.mjs'

const BASE = import.meta.env.VITE_API_BASE ?? ''

type PaperStatus =
  | { status: 'pending' | 'running'; progress: number }
  | { status: 'failed'; progress: number; error: string }
  | { status: 'succeeded'; progress: number; paper: Paper }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  const text = await res.text()
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(res.status === 413 ? '当前服务没有接受这么大的请求。' : '服务返回了无法解析的内容')
  }
  if (!res.ok || json?.ok === false) {
    const message = typeof json?.error === 'string' && json.error.startsWith('未知接口')
      ? '此地址的后端版本较旧，请重启看山伴学后刷新页面。' : json?.error ?? `请求失败（${res.status}）`
    const err = new Error(message)
    ;(err as any).level = json?.level
    ;(err as any).status = res.status
    throw err
  }
  return json as T
}

export const api = {
  hot: (profile: unknown, limit = 30) =>
    call<any>(`/api/hot?limit=${limit}`, {
      method: 'POST',
      body: JSON.stringify({ profile }),
    }),
  answers: (url: string) => call<any>(`/api/answers?url=${encodeURIComponent(url)}`),
  search: (q: string, mode: 'zhihu' | 'global' = 'zhihu') =>
    call<any>(`/api/search?q=${encodeURIComponent(q)}&mode=${mode}${mode === 'global' ? '&external=1' : ''}`),
  quiz: (domain: string) => call<any>(`/api/quiz?domain=${domain}`),
  coach: (profile: unknown, request: {
    question?: string; plan?: boolean; history?: { role: string; text: string }[];
    topic?: Topic; intent?: 'start' | 'followup' | 'practice';
  }, signal?: AbortSignal) =>
    call<{ content: string; topic?: Topic; route?: StudyRoute; degraded?: boolean; reason?: string }>(
      '/api/coach', { method: 'POST', body: JSON.stringify({ profile, ...request }), signal },
    ),
  recommend: (profile: unknown) =>
    call<any>('/api/recommend', { method: 'POST', body: JSON.stringify({ profile }) }),
  status: () => call<{ contract?: string; localPdfUpload?: boolean; ai: { used: number; budget: number } }>('/api/status'),
  plan: (profile: unknown, signal?: AbortSignal) => call<{ plan: StudyPlan }>('/api/study', {
    method: 'POST', body: JSON.stringify({ action: 'plan', profile }), signal,
  }),
  assessment: (profile: unknown, topic: Topic, lesson: string, signal?: AbortSignal) => call<{ assessment: Assessment }>('/api/study', {
    method: 'POST', body: JSON.stringify({ action: 'assessment', profile, topic, lesson }), signal,
  }),
  submitPaper: (name: string, file: string) =>
    call<{ token: string }>('/api/pdf', { method: 'POST', body: JSON.stringify({ name, file }) }),
  submitLargePaper: (file: File) =>
    call<{ token: string }>(`/api/pdf?name=${encodeURIComponent(file.name)}`, {
      method: 'POST', body: file, headers: { 'content-type': 'application/pdf' },
    }),
  paperStatus: (token: string, signal: AbortSignal) =>
    call<PaperStatus>(`/api/pdf?token=${encodeURIComponent(token)}`, { signal }),
  explainPaper: (title: string, level: string, profile: unknown, cards: PaperCard[], domain: string) =>
    call<{ content?: string; degraded?: boolean; reason?: string }>('/api/pdf', {
      method: 'POST',
      body: JSON.stringify({ action: 'explain', title, level, profile, cards, domain }),
    }),
}

