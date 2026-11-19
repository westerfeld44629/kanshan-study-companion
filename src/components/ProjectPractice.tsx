import { useId, useRef, useState } from 'react'
import { curriculumFor, isAgentTrainingGoal } from '../../shared/curriculum.mjs'
import type { StudyPlan } from '../../shared/learning.mjs'

type PracticeRecord = {
  notes: string
  checked: string[]
  confirmed: boolean
}

const NOTES_LIMIT = 2000
const storageKey = (planId: string) => `kanshan.project-practice.v1:${planId}`

export function forgetProjectPractice(planId: string) {
  localStorage.removeItem(storageKey(planId))
}
const TRAINING_CHECKS = [
  { id: 'data', label: '已保存去重后的训练集和固定留出集，留出样本没有用于调参。' },
  { id: 'artifacts', label: '已保存训练脚本、配置、模型版本和可重新加载的 LoRA 适配器。' },
  { id: 'comparison', label: '已在相同条件下对照原模型和微调模型，记录命中数和具体样本。' },
  { id: 'boundary', label: '已写清 Agent 的操作权限，并记录实验结论和一项局限。' },
]

const TRANSFER_CHECKS = [
  { id: 'output', label: '已用各课产出完成一份能回看的作品或操作记录。' },
  { id: 'new-case', label: '已换一个没练过的案例，按同一标准检查结果。' },
  { id: 'revision', label: '已记录一处局限或失败，以及下一步改法。' },
]

function readRecord(key: string): PracticeRecord {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<PracticeRecord> | null
    return {
      notes: typeof saved?.notes === 'string' ? saved.notes.slice(0, NOTES_LIMIT) : '',
      checked: Array.isArray(saved?.checked) ? saved.checked.filter((id) => typeof id === 'string') : [],
      confirmed: saved?.confirmed === true,
    }
  } catch {
    return { notes: '', checked: [], confirmed: false }
  }
}

function TrainingProject() {
  return <>
    <h4>最小项目 · 用 SFT 和 LoRA 训练一个小任务</h4>
    <p>选一个许可合适、当前设备能运行的小型指令模型。任务可以从「把短问题归入三个固定类别」开始，先写好类别和判分规则。</p>
    <ol className="plan-readings">
      <li><strong>划分数据。</strong> 准备约 30 条训练样本和 10 条留出样本，覆盖各类。用 JSONL 的 <code>messages</code> 记录 <code>user</code> 输入和 <code>assistant</code> 标准回答。近似样本归到同一组后再划分，开跑前固定留出集。要调参就从训练集另拆验证样本。</li>
      <li><strong>运行微调。</strong> 用 <code>SFTTrainer</code> 学习标准回复，配合 PEFT 训练 LoRA 适配器。先用几条样本验证格式、保存和重新加载，再用训练集跑一轮。保存脚本、基础模型版本、数据版本、参数与随机种子、训练日志和适配器。</li>
      <li><strong>做固定对照。</strong> 对留出集用相同提示词、解码设置和判分规则，分别运行原模型和加载适配器的模型。逐条记录输出是否符合指定格式和类别，汇总两边的命中数与总数，并分析一条成功样例和一条错误或无改进样例。</li>
      <li><strong>约定 Agent 权限。</strong> Agent 可以校验数据、准备配置、整理报告。启用编排时，由用户确认数据、命令与预算，再让训练脚本更新参数。记录谁批准了运行、输出存到哪里。</li>
    </ol>
  </>
}

function TransferProject({ plan, outcome }: { plan: StudyPlan; outcome: string }) {
  return <>
    <h4>最小项目 · 把所学用到一个新案例</h4>
    <p>{outcome}</p>
    {plan.steps.length > 0 && <ol className="plan-readings">
      {plan.steps.map((step) => <li key={step.id}><strong>{step.phase}</strong> · {step.outcome}</li>)}
    </ol>}
    <p>把课上做法用到一个没练过的例子。动手前写下预期结果，做完留一条实际证据和一个可改进的地方。</p>
  </>
}

export function ProjectPractice({ plan, onComplete }: { plan: StudyPlan; onComplete: () => void }) {
  return <PracticeCard key={plan.id} plan={plan} onComplete={onComplete} />
}

function PracticeCard({ plan, onComplete }: { plan: StudyPlan; onComplete: () => void }) {
  const id = useId()
  const key = storageKey(plan.id)
  const [record, setRecord] = useState(() => readRecord(key))
  const [storageFailed, setStorageFailed] = useState(false)
  const confirmationSent = useRef(false)
  const { domain, text } = plan.goal
  const training = isAgentTrainingGoal(text) || (record.confirmed && record.checked.includes('artifacts'))
  const curriculum = curriculumFor(domain)
  const legacyChecks = !plan.revision || (record.confirmed && record.checked.includes('output'))
  const checks = training ? TRAINING_CHECKS : legacyChecks ? TRANSFER_CHECKS
    : curriculum.checks.map((label, index) => ({ id: 'curriculum-' + index, label }))
  const checkedCount = checks.filter((item) => record.checked.includes(item.id)).length
  const canConfirm = !record.confirmed && checkedCount === checks.length

  function save(next: PracticeRecord) {
    setRecord(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
      setStorageFailed(false)
    } catch {
      setStorageFailed(true)
    }
  }

  function confirm() {
    if (!canConfirm || confirmationSent.current) return
    confirmationSent.current = true
    save({ ...record, confirmed: true })
    onComplete()
  }

  return <section className="card plan-step" aria-labelledby={`${id}-heading`}>
    <div className="plan-stage">
      <h3 id={`${id}-heading`}>结课实战</h3>
      {record.confirmed && <span className="tag" role="status">已确认完成</span>}
    </div>
    <p><strong>学习目标</strong> {text}</p>
    {training ? <TrainingProject /> : <TransferProject plan={plan} outcome={curriculum.project} />}
    <label htmlFor={`${id}-notes`}><strong>成果记录</strong>（选填）</label>
    <textarea id={`${id}-notes`} className="field" rows={4} maxLength={NOTES_LIMIT} readOnly={record.confirmed}
      value={record.notes} placeholder={training ? '记下产物位置、两组命中数和一条失败样例。' : '记下作品位置、新案例结果和下一步改法。'}
      aria-describedby={`${id}-storage`} onChange={(event) => save({ ...record, notes: event.target.value })} />
    <p id={`${id}-storage`}>成果和勾选进度会保存在当前浏览器。</p>
    {storageFailed && <p role="alert">浏览器无法保存，当前记录仅在本页有效。</p>}
    <fieldset className="assessment-question" disabled={record.confirmed}>
      <legend>验收清单（{checkedCount}/{checks.length}）</legend>
      {checks.map((item) => <label key={item.id}>
        <input type="checkbox" checked={record.checked.includes(item.id)} onChange={(event) => {
          const checked = event.target.checked ? [...record.checked, item.id] : record.checked.filter((value) => value !== item.id)
          save({ ...record, checked })
        }} />
        <span>{item.label}</span>
      </label>)}
    </fieldset>
    {record.confirmed ? <p>{training ? '进阶方向：扩大固定留出集，按任务类别统计错误，再用相同口径比较原模型和不同微调方案。'
      : '进阶方向：换一个更接近实际应用的案例，沿用同一验收标准，把新出现的限制写进成果记录。'}</p> : <>
      <p id={`${id}-hint`}>在自己的环境完成实践，勾完所有验收项后即可确认。</p>
      <div className="chips">
        <button type="button" className="btn primary" disabled={!canConfirm} aria-describedby={`${id}-hint`} onClick={confirm}>
          确认完成实践
        </button>
      </div>
    </>}
  </section>
}
