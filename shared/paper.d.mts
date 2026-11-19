import type { Profile } from './profile.mjs'

export const MAX_PDF_BYTES: number
export const CLOUD_JSON_PDF_BYTES: number

export type PaperCard = {
  id: string
  kind: 'abstract' | 'method' | 'result' | 'limit' | 'reading'
  label: string
  page: number
  text: string
}

export type Paper = { title: string; summary: string; pageCount: number; cards: PaperCard[] }
export function extractPaper(result: unknown, summary?: string): Paper
export function isPaperHeading(line: string): boolean

export function paperStudy(paper: Paper, profile: Profile): {
  focus: { id: string; name: string }
  depth: string
  label: string
  reason: string
  cards: (PaperCard & { action: string })[]
}
