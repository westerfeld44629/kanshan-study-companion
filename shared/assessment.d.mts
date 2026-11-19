export type Question = {
  id: string; prompt: string; options: string[]; answer: number; concept: string; explanation: string
  evidence: { title: string; url?: string; quote: string }
}
export const ASSESSMENT_EDITION: string
export type Assessment = { id: string; questions: Question[]; format: string; notice?: string; edition?: string }
export function scoreQuestions(questions: Question[], answers: Record<string, number>): { correct: number; total: number; wrong: Question[] }
