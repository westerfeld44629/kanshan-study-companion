import { getLongMemory, topDomains, LEVELS, type Profile } from '../../shared/profile.mjs'
import { DOMAINS } from '../../shared/domain.mjs'
import { record, resetProfile } from '../lib/profile'
import { LearningMemory } from '../components/LearningMemory'

export function ProfileView({ profile, onProfile, onIntake, onExplore }: {
  profile: Profile
  onProfile: (p: Profile) => void
  onIntake: () => void
  onExplore: () => void
}) {
  const domains = topDomains(profile, 12)
  const goal = profile.goal

  return <>
    <header className="topbar">
      <div><h2>我的学习画像</h2><p>查看学习目标、已有经历和看山自动记住的内容。</p></div>
      <button className="btn ghost" disabled={!profile.events.length && !profile.memories?.length && !getLongMemory(profile).length} onClick={() => {
        if (confirm('清空学习画像？这会删除画像中的目标、自述、学习活动摘要和学习记忆。')) onProfile(resetProfile())
      }}>清空画像</button>
    </header>
    <div className="learning-profile">
      <section className="card learning-profile-card">
        <h3>当前学习目标</h3>
        {goal ? <>
          <p><strong>{goal.text}</strong></p>
          <p>{DOMAINS.find((item) => item.id === goal.domain)?.name} · 每次 {goal.minutes} 分钟</p>
        </> : <p>补一个具体目标，就能用相应的起点来整理资料。</p>}
        <div className="chips">
          <button className="btn" onClick={onIntake}>{goal ? '调整学习目标' : '填写学习问卷'}</button>
          <button className="btn ghost" onClick={onExplore}>找相关资料</button>
        </div>
      </section>
      <section className="card learning-profile-card">
        <h3>我关注的方向和基础</h3>
        <p>浏览、搜索和追问只记录关注。基础取自你填写的经历与可见的自测结果。</p>
        {!domains.length && <p>还没有学习方向。可以填写问卷或先搜索一个想学的问题。</p>}
        {domains.map((domain) => (
          <div className="profile-evidence" key={domain.id}>
            <div><strong>{domain.name}</strong>
              <p>{domain.levelLabel}{domain.assessment === 'quiz' && profile.corrected[domain.id]
                ? ' · 原自述：' + LEVELS[Math.round(profile.corrected[domain.id]) - 1].label : ''}</p>
              {domain.assessment === 'self' && domain.quiz && <p>最近基础自测 {domain.quiz.correct}/{domain.quiz.total}</p>}
              <p>关注互动 {domain.evidence} 次</p>
            </div>
            <select className="field" aria-label={'调整' + domain.name + '经历'} value={profile.corrected[domain.id] ?? ''}
              onChange={(event) => onProfile(record({ kind: 'correct', domain: domain.id, level: Number(event.target.value) }))}>
              <option value="" disabled>补充自述</option>
              {LEVELS.map((level) => <option value={level.value} key={level.value}>{level.label}</option>)}
            </select>
          </div>
        ))}
      </section>
      <LearningMemory profile={profile} onProfile={onProfile} />
      {profile.gaps.length > 0 && <section className="card learning-profile-card">
        <h3>值得回头检查的前置</h3>
        {profile.gaps.map((gap) => <p key={gap.domain + ':' + gap.missing}>{gap.missingName} → {gap.domainName} · {gap.reason}</p>)}
      </section>}
    </div>
  </>
}
