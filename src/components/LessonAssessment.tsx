import { scoreQuestions, type Question } from '../../shared/assessment.mjs'
import { sourceHost } from '../../shared/learning.mjs'
import { remainingQuestions, type Attempt, type NextLesson } from '../lib/studyProgress'

export function Evidence({ question }: { question: Question }) {
  return <div className="assessment-evidence">
    <p>{question.explanation}</p>
    <blockquote>{question.evidence.quote}</blockquote>
    {sourceHost(question.evidence.url) ? <a href={question.evidence.url} target="_blank" rel="noreferrer">回看原文 · {question.evidence.title}</a>
      : <span>原文出处 · {question.evidence.title}</span>}
  </div>
}

export function LessonAssessment({ attempt, onDraft, onSubmit, onReview, next }: {
  attempt: Attempt
  onDraft: (draft: Record<string, number>) => void
  onSubmit: () => void
  onReview: () => void
  next?: NextLesson
}) {
  const { questions, format, notice } = attempt.assessment
  const score = attempt.answers && scoreQuestions(questions, attempt.answers)
  const remaining = score ? remainingQuestions(attempt).length : 0
  return <section className="coach-task assessment" aria-label="本课测评">
    <h3>{format}</h3>
    {notice && <p>{notice}</p>}
    {score ? <>
      <strong role="status">本次得分 {score.correct}/{score.total}</strong>
      {remaining > 0 && <p>有 {remaining} 道错题待订正。</p>}
      {!remaining && score.wrong.length > 0 && <p>本课错题已全部订正。</p>}
      {next ? <button className="btn primary" onClick={next.open}>{next.label}</button>
        : remaining > 0 && <button className="btn" onClick={onReview}>去错题本订正</button>}
    </> : <p>本课 {questions.length} 道题。提交后查看正确答案、解析和出处。</p>}
    {questions.map((question, idx) => {
      const selected = attempt.answers?.[question.id] ?? attempt.draft[question.id]
      return <fieldset className="assessment-question" key={question.id}>
        <legend>{idx + 1}. {question.prompt}</legend>
        {question.options.map((option, i) => <label key={i} data-correct={Boolean(score) && i === question.answer}
          data-wrong={Boolean(score) && i === selected && i !== question.answer}>
          <input type="radio" name={'quiz-' + question.id} checked={selected === i} disabled={Boolean(score)}
            onChange={() => onDraft({ ...attempt.draft, [question.id]: i })} />
          <span>{option}</span>
        </label>)}
        {score && <><p>{selected === question.answer ? '回答正确' : '本题答错'} · {question.concept}</p><Evidence question={question} /></>}
      </fieldset>
    })}
    {!score && <button className="btn primary" disabled={!questions.every((question) => attempt.draft[question.id] !== undefined)} onClick={onSubmit}>交卷并查看解析</button>}
  </section>
}
