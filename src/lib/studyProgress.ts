import { scoreQuestions, type Assessment } from '../../shared/assessment.mjs'
import { stageDepthAt, studyRoute, type PlanStep, type StudyPlan, type Topic } from '../../shared/learning.mjs'
import type { Profile } from './profile'

export type NextLesson = { label: string; open: () => void }

export type Attempt = {
  key: string
  title: string
  domain: string
  assessment: Assessment
  draft: Record<string, number>
  answers?: Record<string, number>
  corrected: string[]
}
export type Attempts = Record<string, Attempt>
const STORE = 'kanshan.assessment.v1'

export function readAttempts(): Attempts {
  try { return JSON.parse(localStorage.getItem(STORE) ?? '{}') ?? {} }
  catch { return {} }
}

export function persistAttempts(attempts: Attempts) {
  localStorage.setItem(STORE, JSON.stringify(attempts))
}

export function remainingQuestions(attempt: Attempt) {
  if (!attempt.answers) return []
  return scoreQuestions(attempt.assessment.questions, attempt.answers).wrong
    .filter((question) => !attempt.corrected.includes(question.id))
}

export function planProgress(plan: StudyPlan | null, attempts: Attempts) {
  const steps = (plan?.steps ?? []).map((step) => {
    const attempt = attempts[step.id]
    const remaining = attempt ? remainingQuestions(attempt).length : 0
    return { step, attempt, remaining, complete: Boolean(attempt?.answers && !remaining) }
  })
  const completed = steps.filter((item) => item.complete).length
  return { steps, completed, next: steps.find((item) => !item.complete), readyForProject: steps.length > 0 && completed === steps.length }
}

export function planTopic(plan: StudyPlan, step: PlanStep, profile: Profile): Topic {
  const base = studyRoute(profile, plan.goal.text, [], plan.goal.domain).depth
  return {
    title: `${step.phase} · ${step.materials[0].title}`, materials: step.materials,
    lessonId: step.id, objective: step.outcome, domain: plan.goal.domain,
    stageDepth: step.depth ?? stageDepthAt(base, plan.steps.findIndex((item) => item.id === step.id)),
  }
}
