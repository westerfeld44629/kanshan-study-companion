import { useEffect, useRef, useState } from 'react'
import { loadProfile, record, saveProfile, type Profile } from './lib/profile'
import { api } from './lib/api'
import { HotView } from './views/HotView'
import { ProfileView } from './views/ProfileView'
import { CoachView, type CoachControls } from './views/CoachView'
import { ExploreView } from './views/ExploreView'
import { PaperView } from './views/PaperView'
import { ColdStart, type Intake } from './components/ColdStart'
import type { LessonSeed, StudyPlan, Topic } from '../shared/learning.mjs'
import { API_CONTRACT } from '../shared/api-contract.mjs'
import { scoreQuestions } from '../shared/assessment.mjs'
import { PlanView } from './views/PlanView'
import { ReviewView } from './views/ReviewView'
import { planProgress, planTopic, readAttempts, persistAttempts, type Attempt, type NextLesson } from './lib/studyProgress'
import { useStudyPlan } from './lib/useStudyPlan'
import { forgetProjectPractice } from './components/ProjectPractice'
import { clearChatFromProfile, clearPlanFromProfile } from '../shared/profile.mjs'

type Tab = 'plan' | 'hot' | 'explore' | 'paper' | 'coach' | 'review' | 'profile'

const NAV: { label: string; items: { id: Tab; label: string; icon: string }[] }[] = [
  { label: '学习', items: [
    { id: 'plan', label: '学习计划', icon: '▦' },
    { id: 'coach', label: '和看山聊', icon: '☰' },
    { id: 'review', label: '错题本', icon: '↺' },
  ] },
  { label: '探索', items: [
    { id: 'hot', label: '今日热榜', icon: '◇' },
    { id: 'explore', label: '找资料', icon: '⌕' },
    { id: 'paper', label: '论文学习', icon: '▤' },
  ] },
  { label: '个人', items: [
    { id: 'profile', label: '我的画像', icon: '◎' },
  ] },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('plan')
  const [profile, setProfile] = useState<Profile>(() => loadProfile())
  const [online, setOnline] = useState<boolean | null>(null)
  const [stale, setStale] = useState(false)
  const [attempts, setAttempts] = useState(readAttempts)
  const latestAttempts = useRef(attempts)
  const [saveError, setSaveError] = useState(false)
  const [cleanupNotice, setCleanupNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [showCold, setShowCold] = useState(() => !profile.goal && !localStorage.getItem('kanshan.intake.skipped'))
  const [study, setStudy] = useState<{ id: number; topic: Topic; seed?: LessonSeed } | null>(null)
  const sequence = useRef(0)
  const coach = useRef<CoachControls>(null)
  const planState = useStudyPlan(profile, !showCold)

  useEffect(() => {
    api
      .status()
      .then((status) => { setOnline(true); setStale(status.contract !== API_CONTRACT) })
      .catch(() => setOnline(false))
  }, [])

  function update(p: Profile) {
    saveProfile(p)
    setProfile(p)
  }

  function onColdDone(intake: Intake) {
    setCleanupNotice(null)
    setProfile(record({ kind: 'intake', ...intake }))
    setShowCold(false)
    setTab('plan')
  }

  function saveAttempt(attempt: Attempt) {
    const next = { ...latestAttempts.current, [attempt.key]: attempt }
    latestAttempts.current = next
    setAttempts(next)
    try { persistAttempts(next); setSaveError(false) }
    catch { setSaveError(true) }
  }

  function submitAttempt(attempt: Attempt) {
    if (attempt.answers || latestAttempts.current[attempt.key]?.answers ||
        !attempt.assessment.questions.every((question) => attempt.draft[question.id] !== undefined)) return
    const answers = { ...attempt.draft }
    const score = scoreQuestions(attempt.assessment.questions, answers)
    saveAttempt({ ...attempt, answers })
    update(record({
      kind: 'assessment', domain: attempt.domain, title: attempt.title, lesson: attempt.key,
      correct: score.correct, total: score.total, review: score.wrong.map((question) => ({ question: question.id, concept: question.concept })),
    }))
  }

  function learn(topic: Topic, seed?: LessonSeed) {
    const text = [topic.title, ...topic.materials.map((material) => material.title)].join(' ')
    setProfile(record({ kind: 'react', topic: text, signal: 'deeper' }))
    setStudy({ id: ++sequence.current, topic, seed })
    setTab('coach')
  }

  function nextLesson(key: string): NextLesson | undefined {
    const plan = planState.plan
    if (!plan) return
    const progress = planProgress(plan, attempts)
    if (!progress.steps.some((item) => item.step.id === key && item.complete)) return
    if (progress.readyForProject) return { label: '打开结课实战', open: () => setTab('plan') }
    const next = progress.next
    if (next?.step.materials.length && !next.remaining) return {
      label: '继续学习 · ' + next.step.phase, open: () => learn(planTopic(plan, next.step, profile)),
    }
    return { label: '返回计划查看下一步', open: () => setTab('plan') }
  }

  function completeProject(plan: StudyPlan) {
    const stored = loadProfile()
    if (stored.events.some((event) => event.kind === 'project' && event.plan === plan.id)) return
    update(record({ kind: 'project', domain: plan.goal.domain, title: plan.goal.text, plan: plan.id }))
  }

  function clearPlan() {
    const stored = loadProfile()
    if (!stored.goal) return
    const plan = planState.currentPlanForCleanup()
    const lessons = new Set(plan?.steps.map((step) => step.id))
    const nextAttempts = Object.fromEntries(Object.entries(latestAttempts.current).filter(([key]) =>
      !lessons.has(key) && !lessons.has(key.replace(/:expanded$/, ''))))
    try {
      localStorage.setItem('kanshan.intake.skipped', '1')
      const threadIds = lessons.size ? coach.current?.forgetLessons(lessons) ?? [] : []
      if (lessons.size) {
        persistAttempts(nextAttempts)
        latestAttempts.current = nextAttempts
        setAttempts(nextAttempts)
      }
      if (plan) forgetProjectPractice(plan.id)
      planState.forget()
      const next = clearPlanFromProfile(clearChatFromProfile(stored, threadIds), plan)
      if (!saveProfile(next)) throw new Error('profile storage')
      setProfile(next)
      setStudy((pending) => pending?.topic.lessonId && lessons.has(pending.topic.lessonId) ? null : pending)
      setCleanupNotice({ text: '已清理当前学习计划。可以填写新的学习目标。' })
    } catch {
      setCleanupNotice({ text: '浏览器未能完成清理，请重试。', error: true })
    }
  }

  const domainCount = Object.keys(profile.domains).length

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <img src="/kanshan/待机_5秒_320x320_20fps_透明.gif" alt="" />
          <div>
            <h1>看山伴学</h1>
            <p>知乎知识探索</p>
          </div>
        </div>

        <nav className="nav" aria-label="主导航">
          {NAV.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label" aria-hidden="true">{group.label}</span>
              {group.items.map((item) => (
                <button key={item.id} aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}>
                  <span className="ico" aria-hidden="true">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <div>
            <span className={'dot ' + (online === null ? '' : online ? 'on' : 'off')} />
            {online === null ? '连接中' : online ? '学习服务已连接' : '学习服务离线'}
          </div>
          <div>
            {domainCount > 0 ? `已知 ${domainCount} 个关注领域` : '画像未建立'}
          </div>
          <div className="side-note">画像保存在本浏览器，用于个性化推荐和讲解。</div>
        </div>
      </aside>

      <main className={tab === 'coach' ? 'main coach-main' : 'main'}>
        {stale && <p className="banner warn version-notice" role="alert">此地址的网页与后端版本不同。请重启看山伴学后刷新页面。</p>}
        {saveError && <p className="banner warn version-notice" role="alert">浏览器无法保存测评进度，刷新可能丢失本次记录。</p>}
        {tab === 'plan' && <PlanView profile={profile} attempts={attempts} state={planState}
          onGoal={() => setShowCold(true)} onLearn={learn} onReview={() => setTab('review')} onProject={completeProject}
          onClear={clearPlan} cleanupNotice={cleanupNotice} />}
        {tab === 'hot' && !showCold && <HotView profile={profile} onProfile={update} onLearn={learn} />}
        <div hidden={tab !== 'explore'}><ExploreView profile={profile} onProfile={update} onLearn={learn} /></div>
        <div hidden={tab !== 'paper'}><PaperView profile={profile} onProfile={update} onLearn={learn} /></div>
        <div hidden={tab !== 'coach'}><CoachView ref={coach} profile={profile} onProfile={update} request={study} active={tab === 'coach'}
          attempts={attempts} onSaveAttempt={saveAttempt} onSubmitAttempt={submitAttempt} onPlan={() => setTab('plan')} onReview={() => setTab('review')}
          nextLesson={nextLesson}
          onForgetChats={(ids, all) => update(clearChatFromProfile(loadProfile(), ids, all))} /></div>
        {tab === 'review' && <ReviewView attempts={attempts} nextLesson={nextLesson} onCorrect={(attempt, question, concept) => {
          if (attempt.corrected.includes(question)) return
          saveAttempt({ ...attempt, corrected: [...attempt.corrected, question] })
          update(record({ kind: 'correction', domain: attempt.domain, title: attempt.title, lesson: attempt.key, question, concept }))
        }} />}
        {tab === 'profile' && <ProfileView profile={profile} onProfile={update} onIntake={() => setShowCold(true)} onExplore={() => setTab('explore')} />}
      </main>

      {showCold && (
        <ColdStart
          profile={profile}
          onDone={onColdDone}
          onSkip={() => {
            setShowCold(false)
            if (!profile.goal) localStorage.setItem('kanshan.intake.skipped', '1')
          }}
        />
      )}
    </div>
  )
}

