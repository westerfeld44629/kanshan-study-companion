import { useState } from 'react'
import { DOMAINS } from '../../shared/domain.mjs'
import { LEVELS, type Profile } from '../../shared/profile.mjs'

export type Intake = { domain: string; goal: string; level: number; minutes: number }

export function ColdStart({ profile, onDone, onSkip }: {
  profile: Profile
  onDone: (intake: Intake) => void
  onSkip: () => void
}) {
  const [domain, setDomain] = useState(profile.goal?.domain ?? '')
  const [goal, setGoal] = useState(profile.goal?.text ?? '')
  const [level, setLevel] = useState(profile.goal ? profile.corrected[profile.goal.domain] ?? 0 : 0)
  const [minutes, setMinutes] = useState(profile.goal?.minutes ?? 15)

  return (
    <div className="drawer-mask intake-mask">
      <form className="drawer intake" role="dialog" aria-modal="true" aria-labelledby="intake-title"
        onSubmit={(event) => {
          event.preventDefault()
          if (domain && goal.trim()) onDone({ domain, goal, level, minutes })
        }}>
        <h2 id="intake-title">{profile.goal ? '调整学习目标' : '先定一个学习目标'}</h2>
        <p>用一个具体目标开始。你可以随时调整，之后的练习记录会帮你找到下一步。</p>
        <label htmlFor="intake-domain">学习方向</label>
        <select id="intake-domain" className="field" required value={domain}
          onChange={(event) => { setDomain(event.target.value); setLevel(profile.corrected[event.target.value] ?? 0) }}>
          <option value="">选择一个方向</option>
          {DOMAINS.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
        <label htmlFor="intake-goal">这次想弄懂或做出什么？</label>
        <input id="intake-goal" className="field" required maxLength={180} value={goal}
          placeholder="例如：能解释为什么 RAG 回答有时引用错资料"
          onChange={(event) => setGoal(event.target.value)} />
        <div className="intake-grid">
          <div>
            <label htmlFor="intake-level">已有经历</label>
            <select id="intake-level" className="field" value={level} onChange={(event) => setLevel(Number(event.target.value))}>
              <option value={0}>暂不确定</option>
              {LEVELS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="intake-minutes">一次能学多久</label>
            <select id="intake-minutes" className="field" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
              {[5, 15, 30, 60].map((n) => <option value={n} key={n}>{n} 分钟</option>)}
            </select>
          </div>
        </div>
        <div className="chips">
          <button className="btn primary" disabled={!domain || !goal.trim()}>{profile.goal ? '保存目标' : '保存并开始探索'}</button>
          <button type="button" className="btn ghost" onClick={onSkip}>{profile.goal ? '取消' : '暂不填写'}</button>
        </div>
      </form>
    </div>
  )
}
