import { SOURCE_NAMES, type StudyPlan, type Topic } from '../../shared/learning.mjs'
import { DOMAINS } from '../../shared/domain.mjs'
import type { Profile } from '../lib/profile'
import { planProgress, planTopic, type Attempts } from '../lib/studyProgress'
import { ProjectPractice } from '../components/ProjectPractice'

export function PlanView({ profile, attempts, state, onGoal, onLearn, onReview, onProject, onClear, cleanupNotice }: {
  profile: Profile
  attempts: Attempts
  state: { plan: StudyPlan | null; error?: string; retry: () => void }
  onGoal: () => void
  onLearn: (topic: Topic) => void
  onReview: () => void
  onProject: (plan: StudyPlan) => void
  onClear: () => void
  cleanupNotice: { text: string; error?: boolean } | null
}) {
  const goal = profile.goal
  const { plan, error, retry } = state
  const { steps, completed, next, readyForProject } = planProgress(plan, attempts)

  return <>
    <header className="topbar"><h2>学习计划</h2>
      {goal && <div className="plan-actions">
        <button className="btn" onClick={onGoal}>调整目标</button>
        <button className="btn subtle" onClick={() => {
          if (confirm('清理当前学习计划？这会删除当前目标及该计划下的课程对话、测评、错题和结课实战记录。')) onClear()
        }}>清理计划</button>
      </div>}
    </header>
    <section className="plan-summary">
      <div className="plan-summary-content">
        {goal ? <>
          <p className="plan-kicker">当前目标</p>
          <h3>{goal.text}</h3>
          <p className="plan-metadata">{DOMAINS.find(({ id }) => id === goal.domain)?.name} · 每次约 {goal.minutes} 分钟</p>
          {plan && <div className="plan-progress">
            <p role="status">已完成 <strong>{completed}/{steps.length}</strong> 课</p>
            <div className="plan-progress-track" aria-hidden="true">
              {steps.map(({ step, complete }) => <span key={step.id} data-complete={complete} />)}
            </div>
          </div>}
        </> : <>
          <h3>从一个想弄懂的问题开始</h3>
          <p className="plan-metadata">告诉看山你想学什么、已经会什么，以及一次能学多久。</p>
          <button className="btn primary" onClick={onGoal}>填写学习目标</button>
        </>}
      </div>
      <div className="plan-illustration" aria-hidden="true">
        <img src="/kanshan/待机_5秒_320x320_20fps_透明.gif" alt="" width="156" height="156" />
      </div>
    </section>
    {cleanupNotice && <p className={cleanupNotice.error ? 'banner warn' : 'card inline-state'} role={cleanupNotice.error ? 'alert' : 'status'}>{cleanupNotice.text}</p>}
    {goal && !plan && !error && <p className="card inline-state" role="status">正在检索知乎和站外材料，安排阅读顺序…</p>}
    {error && <div className="banner warn" role="alert">{error}
      <button className="btn" onClick={retry}>重试检索</button>
    </div>}
    {plan && <>
      {readyForProject && <ProjectPractice key={plan.id} plan={plan} onComplete={() => onProject(plan)} />}
      <div className="route-heading">
        <h3>阅读路线</h3>
        <p>完成测评并订正错题后，解锁下一课。</p>
      </div>
      <ol className="study-plan" role="list" aria-label="阅读路线">
        {steps.map(({ step, attempt, remaining, complete }, index) => {
          const current = next?.step.id === step.id
          const locked = !current && !complete && !attempt
          return <li className="plan-item" data-current={current} data-complete={complete} key={step.id}>
            <span className="route-index" aria-hidden="true">{complete ? '✓' : String(index + 1).padStart(2, '0')}</span>
            <article className="card plan-step" aria-current={current ? 'step' : undefined}>
              <div className="plan-stage">
                <h3>{step.phase}</h3>
                {attempt?.answers ? <span className={remaining ? 'tag attention' : 'tag aff'}>{remaining ? `待订正 ${remaining} 题` : '已完成'}</span>
                  : current ? <span className="tag aff">建议先学</span> : locked && <span className="tag">后续课程</span>}
              </div>
              <p><strong>读完要能做到</strong> {step.outcome}</p>
              {goal?.minutes === 5 && <p>5 分钟先读主读摘录，记下一个要点并试做一步。可以稍后回来做完。</p>}
              {step.materials.length ? <>
                {step.reused && <p>沿用前面课程的资料，按本课任务重新验证。</p>}
                <ul className="lesson-resources">
                  {step.materials.map((item, index) => <li key={item.url}>
                    <span className="tag">{index === 0 ? '主读' : '对照'} · {SOURCE_NAMES[item.source]}</span>
                    <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
                  </li>)}
                </ul>
                <div className="chips">
                  {remaining > 0 && <button className="btn primary" onClick={onReview}>订正后继续</button>}
                  <button className={'btn' + (current && !remaining ? ' primary' : '')} disabled={locked}
                    onClick={() => onLearn(planTopic(plan, step, profile))}>
                    {locked ? '前一课完成后开放' : complete ? '回看这一课' : attempt ? '继续这一课' : '开始这一课'}
                  </button>
                </div>
              </> : <p>这一步暂未检索到可用原文。可以重试或调整目标。</p>}
            </article>
          </li>
        })}
      </ol>
      {plan.steps.some((step) => step.failed || !step.materials.length) &&
        <button className="btn" onClick={retry}>补查未返回的资料</button>}
      {!plan.steps.some((step) => step.failed || !step.materials.length) && (plan.revision ?? 0) < 2 &&
        <button className="btn" onClick={retry}>更新课程资料</button>}
    </>}
  </>
}
