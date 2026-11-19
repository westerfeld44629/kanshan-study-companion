import { clearLongMemory, forgetLongMemory, getLongMemory, type Profile } from '../../shared/profile.mjs'

export function LearningMemory({ profile, onProfile }: {
  profile: Profile
  onProfile: (profile: Profile) => void
}) {
  const memories = getLongMemory(profile)
  return <section className="card learning-profile-card">
    <h3>自动学习记忆</h3>
    <p>看山会记住你明确说过的偏好、卡点和学习进展。下次开启相关对话时，仍能从这些进度继续。</p>
    <p>记忆保存在此浏览器。讲解和出题会使用与当前主题相关的摘要。</p>
    {memories.length > 0 ? <>
      <details className="long-memory">
        <summary>查看看山记住的内容</summary>
        <ul>{memories.map((entry) => <li key={entry.id}>
          <span>{entry.text}</span>
          <button className="btn ghost" aria-label={'忘记 · ' + entry.text} onClick={() => onProfile(forgetLongMemory(profile, entry.id))}>忘记</button>
        </li>)}</ul>
      </details>
      <button className="btn ghost" onClick={() => {
        if (confirm('清空自动学习记忆？后续讲解将从新的互动重新积累。')) onProfile(clearLongMemory(profile))
      }}>清空自动记忆</button>
    </> : <p>还没有自动记忆。可以在学习中说出你的讲解偏好，或交一份本课测评。</p>}
  </section>
}
