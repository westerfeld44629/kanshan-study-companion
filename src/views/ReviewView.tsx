import { useState } from 'react'
import { scoreQuestions } from '../../shared/assessment.mjs'
import { Evidence } from '../components/LessonAssessment'
import type { Attempt, Attempts, NextLesson } from '../lib/studyProgress'

export function ReviewView({ attempts, onCorrect, nextLesson }: {
  attempts: Attempts
  onCorrect: (attempt: Attempt, questionId: string, concept: string) => void
  nextLesson: (key: string) => NextLesson | undefined
}) {
  const [picks, setPicks] = useState<Record<string, number>>({})
  const [feedback, setFeedback] = useState<Record<string, boolean>>({})
  const groups = Object.values(attempts).filter((item) => item.answers)
    .map((item) => ({ item, questions: scoreQuestions(item.assessment.questions, item.answers!).wrong }))
    .filter((group) => group.questions.length)
  const outstanding = groups.reduce((count, { item, questions }) =>
    count + questions.filter((question) => !item.corrected.includes(question.id)).length, 0)
  return <>
    <header className="topbar"><div><h2>错题本</h2><p>待订正 {outstanding} 道。先看错因和对应原文，再试着重新作答。</p></div></header>
    {!groups.length && <p className="card inline-state">提交一份学后测评后，答错的题会出现在这里。</p>}
    <div className="review-list">
      {groups.map(({ item, questions }) => {
        const next = nextLesson(item.key)
        return <section className="card learning-profile-card" key={item.key}>
        <h3>{item.title}</h3>
        {next && <button className="btn primary" onClick={next.open}>{next.label}</button>}
        {questions.map((question) => {
          const key = item.key + ':' + question.id
          const completed = item.corrected.includes(question.id)
          const choices = question.options.map((option, i) => ({ option, i })).reverse()
          return <div className="review-question" key={key}>
            <strong>{question.prompt}</strong>
            <p>{completed ? '已订正' : '待订正'} · {question.concept} · 上次作答「{question.options[item.answers![question.id]]}」</p>
            <details><summary>回看出处和解析</summary><Evidence question={question} /></details>
            {!completed && <>
              <fieldset className="assessment-question">
                <legend className="visually-hidden">重做 · {question.prompt}</legend>
                {choices.map(({ option, i }) => <label key={i}>
                  <input type="radio" name={key} checked={picks[key] === i}
                    onChange={() => { setPicks({ ...picks, [key]: i }); setFeedback({ ...feedback, [key]: true }) }} />
                  <span>{option}</span>
                </label>)}
              </fieldset>
              <button className="btn" disabled={picks[key] === undefined} onClick={() => {
                if (picks[key] === question.answer) onCorrect(item, question.id, question.concept)
                else setFeedback({ ...feedback, [key]: false })
              }}>提交订正</button>
              {feedback[key] === false && <p role="status">这次还没选对。可以先回看证据再尝试。</p>}
            </>}
          </div>
        })}
      </section>})}
    </div>
  </>
}
