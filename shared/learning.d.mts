import type { Profile } from './profile.mjs'
export type Material = { title: string; source: 'hot' | 'zhihu' | 'global' | 'paper'; url?: string; excerpt?: string }
export type Depth = 'entry' | 'intermediate' | 'advanced'
export type Topic = { title: string; materials: Material[]; lessonId?: string; domain?: string; objective?: string; stageDepth?: Depth }
export type LessonSeed = { text: string; degraded?: boolean; reason?: string }
export type PlanStep = { id: string; phase: string; query: string; outcome: string; materials: Material[]; failed: boolean; reused?: boolean; minutes: number; depth?: Depth }
export type StudyPlan = { id: string; goal: NonNullable<Profile['goal']>; steps: PlanStep[]; revision?: number }
export type StudyRoute = { domain: string; name: string; depth: Depth; title: string; question: string; rubric: string; minutes: number }
export const SOURCE_NAMES: Record<Material['source'], string>
export function sourceHost(url?: string): string
export function isZhihu(url?: string): boolean
export function cleanMaterials(materials: unknown): Material[]
export function studyRoute(profile: Profile, title: string, materials?: Material[], domain?: string, stageDepth?: Depth): StudyRoute
export function lessonScope(materials: Material[], depth: Depth, minutes: number): { questions: number; minQuestions: number; minChars: number; maxChars: number; units: number }
export function depthInstruction(depth: Depth): string
export function stageDepthAt(start: Depth, index: number): Depth
export function sourceLearningSheet(title: string, materials: Material[], profile: Profile, route: StudyRoute): string
