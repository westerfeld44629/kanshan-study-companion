export type DomainState = {
  id: string
  weight: number
  level: number
  confidence: number
  evidence: number
  lastSeen: number
  wantsDepth: number
  correctedByUser?: boolean
  assessment?: 'self' | 'quiz'
  quiz?: { correct: number; total: number }
}

export type LearningMemoryEntry = { id: string; kind: 'preference' | 'note' | 'blocker'; text: string }

export type LongMemorySource =
  | { kind: 'ask'; thread: string; plan?: string; lesson?: string }
  | { kind: 'assessment' | 'correction'; lesson: string; plan?: string; question?: string }
  | { kind: 'project'; plan: string }
  | { kind: 'study' }

export type LongMemoryRecord = {
  id: string
  kind: 'preference' | 'clarification' | 'blocker' | 'assessment' | 'review' | 'correction' | 'project' | 'study'
  text: string
  at: number
  domain?: string
  goal?: string
  source: LongMemorySource
}

export type ProfileEvent =
  | { kind: 'ask'; text: string; thread?: string }
  | { kind: 'react'; topic: string; signal: 'known' | 'deeper' | 'irrelevant' }
  | { kind: 'open'; topic: string; dwellMs: number }
  | { kind: 'quiz'; domain: string; correct: number; total: number }
  | { kind: 'correct'; domain: string; level: number; initial?: boolean }
  | { kind: 'study'; domain: string; title: string }
  | { kind: 'intake'; domain: string; goal: string; minutes: number; level: number }
  | { kind: 'practice'; domain: string; title: string; text: string }
  | { kind: 'assessment'; domain: string; title: string; correct: number; total: number; review: { question: string; concept: string }[]; lesson: string }
  | { kind: 'correction'; domain: string; title: string; concept: string; lesson: string; question: string }
  | { kind: 'project'; domain: string; title: string; plan: string }

export type Profile = {
  version: number
  createdAt: number
  updatedAt: number
  domains: Record<string, DomainState>
  gaps: { domain: string; domainName: string; missing: string; missingName: string; reason: string; priority: number }[]
  events: (ProfileEvent & { at: number })[]
  corrected: Record<string, number>
  goal: { domain: string; text: string; minutes: number } | null
  memories?: LearningMemoryEntry[]
  longMemory?: LongMemoryRecord[]
}

export const LEVELS: { value: number; label: string; hint: string }[]
export const MAX_LEARNING_MEMORIES: number
export const MAX_LEARNING_MEMORY_TEXT: number
export const LEARNING_MEMORY_LABELS: Record<LearningMemoryEntry['kind'], string>
export function emptyProfile(now?: number): Profile
export function migrateProfile(profile: unknown): Profile
export function applyEvent(profile: Profile, event: ProfileEvent, now?: number): Profile
export function saveLearningMemory(profile: Profile, entry: LearningMemoryEntry): Profile
export function removeLearningMemory(profile: Profile, id: string): Profile
export function getLongMemory(profile: Profile): LongMemoryRecord[]
export function clearLongMemory(profile: Profile): Profile
export function forgetLongMemory(profile: Profile, id: string): Profile
export function clearPlanFromProfile(profile: Profile, plan?: { id: string; steps: { id: string }[] } | null): Profile
export function clearChatFromProfile(profile: Profile, threadIds: string[], all?: boolean): Profile
export function topDomains(profile: Profile, limit?: number): (DomainState & { name: string; levelLabel: string })[]
export function overallLevel(profile: Profile): number | null
export function profileBrief(profile: Profile, maxDomains?: number, context?: string): string
