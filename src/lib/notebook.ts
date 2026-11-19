import type { StudyRoute, Topic } from '../../shared/learning.mjs'

export type Message = { role: 'user' | 'assistant'; text: string; degraded?: boolean; reason?: string }
export type Thread = { id: string; title: string; topic?: Topic; route?: StudyRoute; messages: Message[]; error?: string; failedIntent?: 'start' | 'followup' }
export type Notebook = { active: string; threads: Thread[] }
const STORAGE = 'kanshan.study.v1'

export function loadNotebook(): Notebook {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE) ?? 'null')
    if (Array.isArray(stored?.threads)) return stored
  } catch { /* 允许在禁用存储的浏览器里学习 */ }
  return { active: '', threads: [] }
}

export function saveNotebook(notebook: Notebook) {
  if (notebook.threads.length) localStorage.setItem(STORAGE, JSON.stringify(notebook))
  else localStorage.removeItem(STORAGE)
}

export function withoutThreads(notebook: Notebook, ids: ReadonlySet<string>): Notebook {
  return {
    active: ids.has(notebook.active) ? '' : notebook.active,
    threads: notebook.threads.filter((item) => !ids.has(item.id)),
  }
}
