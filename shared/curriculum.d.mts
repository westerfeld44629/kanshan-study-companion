/** 根据领域 ID 返回基础、应用、验证三课和结课实践。未知领域使用通用课程。 */
export function curriculumFor(domain: string): {
  search: [string, string, string]
  outcomes: [string, string, string]
  project: string
  checks: string[]
}
export function isAgentTrainingGoal(text: string): boolean
