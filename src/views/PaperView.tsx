import { useEffect, useState, type FormEvent } from 'react'
import { CLOUD_JSON_PDF_BYTES, MAX_PDF_BYTES, paperStudy, type Paper } from '../../shared/paper.mjs'
import type { LessonSeed, Topic } from '../../shared/learning.mjs'
import { api } from '../lib/api'
import { record, type Profile } from '../lib/profile'
import { Markdown } from '../components/Markdown'

const KEY = 'kanshan.paper.v1'

type Reading = {
  id?: string
  name: string
  token?: string
  paper?: Paper
  done: string[]
}

type Notebook = { current: Reading | null; papers: Reading[] }

function loadNotebook(): Notebook {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (Array.isArray(saved?.papers)) return saved
    if (saved?.name) return { current: saved, papers: saved.paper ? [saved] : [] }
  } catch {
    // 屏蔽不可访问或损坏的本地缓存
  }
  return { current: null, papers: [] }
}

function base64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '')
    reader.onerror = () => reject(new Error('读取文件失败，请重新选择。'))
    reader.readAsDataURL(file)
  })
}

export function PaperView({ profile, onProfile, onLearn }: { profile: Profile; onProfile: (p: Profile) => void; onLearn: (topic: Topic, seed?: LessonSeed) => void }) {
  const [notebook, setNotebook] = useState(loadNotebook)
  const reading = notebook.current
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [readingPages, setReadingPages] = useState('')
  const [polling, setPolling] = useState(true)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [explaining, setExplaining] = useState(false)
  const [explanation, setExplanation] = useState<(LessonSeed & { path: string; error?: boolean }) | null>(null)
  const token = reading?.token
  const paper = reading?.paper
  const study = paper ? paperStudy(paper, profile) : null

  function save(current: Reading) {
    const papers = current.paper
      ? [current, ...notebook.papers.filter((saved) => (saved.id ?? saved.name) !== (current.id ?? current.name))]
      : notebook.papers
    const next = { current, papers }
    setNotebook(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
      setSaveError('')
    } catch {
      setSaveError('浏览器无法保存进度，当前页面仍可继续学习。')
    }
  }

  useEffect(() => {
    if (!token || !polling) return
    const controller = new AbortController()
    const deadline = Date.now() + 120_000
    let timer: ReturnType<typeof setTimeout>
    async function poll(taskToken: string) {
      try {
        const result = await api.paperStatus(taskToken, controller.signal)
        if (controller.signal.aborted) return
        setProgress(result.progress)
        if (result.status === 'succeeded') {
          save({ id: taskToken.split('.')[0], name: reading!.name, paper: result.paper, done: [] })
        } else if (result.status === 'failed') {
          save({ name: reading!.name, done: [] })
          setError(result.error)
        } else if (Date.now() >= deadline) {
          setPolling(false)
          setError('解析仍在进行。可以稍后继续查询原任务。')
        } else {
          timer = setTimeout(() => poll(taskToken), 2500)
        }
      } catch (e) {
        if (controller.signal.aborted) return
        setPolling(false)
        setError(e instanceof Error ? e.message : '暂时无法查询论文进度。')
      }
    }
    timer = setTimeout(() => poll(token), 400)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [token, polling])

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    if (!file || uploading || token || explaining) return
    if (!/\.pdf$/i.test(file.name) || file.size === 0) {
      setError('请选择有效的 PDF 文件。')
      return
    }
    if (file.size > MAX_PDF_BYTES) {
      setError('PDF 超过 100 MB，请截取需要学习的页。')
      return
    }
    setError('')
    setUploading(true)
    setProgress(0)
    try {
      let current: Reading
      if (file.size > CLOUD_JSON_PDF_BYTES) {
        setReadingPages('正在读取 PDF 文字…')
        const { readPdf } = await import('../lib/readPdf')
        const localPaper = await readPdf(file, (done, total) => setReadingPages(`正在读取第 ${done}/${total} 页…`))
        if (localPaper.cards.length) {
          const id = ['local', file.name, file.size, file.lastModified].join(':')
          current = notebook.papers.find((item) => item.id === id) ?? { id, name: file.name, paper: localPaper, done: [] }
        } else {
          const status = await api.status()
          if (!status.localPdfUpload) throw new Error('这份大文件没有可读取的文字层。可以用本机启动版提交知乎识别，或选已有文字层的版本。')
          setReadingPages('未发现文字层，正在提交知乎解析…')
          const next = await api.submitLargePaper(file)
          current = { name: file.name, token: next.token, done: [] }
        }
      } else {
        const next = await api.submitPaper(file.name, await base64(file))
        current = { name: file.name, token: next.token, done: [] }
      }
      setFile(null)
      form.reset()
      setExplanation(null)
      setPolling(true)
      save(current)
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法上传论文，请稍后再试。')
    } finally {
      setUploading(false)
      setReadingPages('')
    }
  }

  async function explain() {
    if (!study || !paper || explaining) return
    setExplaining(true)
    try {
      const r = await api.explainPaper(paper.title || reading!.name, study.label, profile, study.cards, study.focus.id)
      setExplanation({ text: r.content ?? r.reason ?? '暂时无法生成讲解。', path: study.label,
        error: !r.content, degraded: r.degraded, reason: r.reason })
    } catch (e) {
      setExplanation({ text: e instanceof Error ? e.message : '暂时无法生成讲解。', path: study.label, error: true })
    } finally {
      setExplaining(false)
    }
  }

  function complete(id: string) {
    if (!reading || !study || reading.done.includes(id)) return
    save({ ...reading, done: [...reading.done, id] })
    onProfile(record({ kind: 'study', domain: study.focus.id, title: paper?.title || reading.name }))
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h2>论文学习</h2>
          <p>上传 arXiv 或其他论文 PDF，从原文找到适合当前水平的知识点。</p>
        </div>
      </header>

      <form className="card paper-upload" onSubmit={upload}>
        <div>
          <label htmlFor="paper-pdf">选择论文 PDF</label>
          <p id="pdf-details">支持 100 MB 以内的 PDF。大文件优先在浏览器读取文字，小文件及本机版的扫描件由知乎解析。</p>
        </div>
        <input className="field" id="paper-pdf" type="file" accept=".pdf,application/pdf" aria-describedby="pdf-details"
          disabled={uploading || Boolean(token) || explaining}
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError('') }}
        />
        <button className="btn primary" disabled={!file || uploading || Boolean(token) || explaining}>
          {uploading ? '正在处理…' : '读取并生成学习卡'}
        </button>
      </form>

      {error && <p className="banner err" role="alert">{error}</p>}
      {readingPages && <p role="status">{readingPages}</p>}
      {saveError && <p className="banner warn" role="status">{saveError}</p>}
      {token && (
        <div className="card paper-progress">
          <div role="status">{polling ? '正在解析' : '暂停查询'} · {reading.name}</div>
          <progress aria-label="论文解析进度" max={1} value={progress} />
          {!polling && (
            <div className="chips">
              <button className="btn" onClick={() => { setError(''); setPolling(true) }}>继续查询原任务</button>
              <button className="btn ghost" onClick={() => { setError(''); save({ name: reading.name, done: [] }) }}>放弃查询</button>
            </div>
          )}
        </div>
      )}

      {(notebook.papers.length > 1 || (!paper && notebook.papers.length > 0)) && (
        <section className="card paper-overview paper-shelf" aria-label="已解析的论文">
          <label htmlFor="paper-library">继续以前的论文</label>
          <select className="field" id="paper-library"
            value={paper ? reading?.id ?? reading?.name : ''}
            disabled={uploading || Boolean(token) || explaining}
            onChange={(e) => {
              const selected = notebook.papers.find((item) => (item.id ?? item.name) === e.target.value)
              if (selected) {
                setExplanation(null)
                setError('')
                save(selected)
              }
            }}>
            <option value="" disabled>选择已解析的论文</option>
            {notebook.papers.map((item) => (
              <option value={item.id ?? item.name} key={item.id ?? item.name}>{item.name}</option>
            ))}
          </select>
        </section>
      )}

      {reading && paper && study && (
        <section className="paper-study" aria-label="论文学习卡">
          <div className="card paper-overview">
            <div className="paper-heading">
              <div>
                <h3>{paper.title || reading.name}</h3>
                <p>{paper.pageCount} 页 · {study.focus.name} · <strong>{study.label}</strong></p>
              </div>
              {study.cards.length > 0 && <span className="level-pill">
                已学 {study.cards.filter((card) => reading.done.includes(card.id)).length}/{study.cards.length}
              </span>}
            </div>
            {paper.summary && <p className="paper-summary">{paper.summary}</p>}
            {study.cards.length > 0 && <>
              <p>{study.reason}</p>
              <button className="btn" disabled={explaining || uploading} onClick={explain}>{explaining ? '正在讲解…' : '生成个性化讲解'}</button>
              <button className="btn ghost" onClick={() => onLearn({
                title: paper.title || reading.name,
                materials: study.cards.map((card) => ({ title: `第 ${card.page} 页 · ${card.label}`, source: 'paper', excerpt: card.text })),
                domain: study.focus.id,
              }, explanation && !explanation.error && explanation.path === study.label ? explanation : undefined)}>
                {explanation && !explanation.error && explanation.path === study.label ? '继续学习和测评' : '带这篇论文去学习'}
              </button>
            </>}
            {explanation && explanation.path === study.label && (
              <div className={explanation.error ? 'banner warn paper-explanation' : 'paper-explanation'} role="status">
                {explanation.error ? explanation.text : <>
                  {explanation.degraded && <p className="banner warn">{explanation.reason}</p>}
                  <Markdown text={explanation.text} />
                </>}
              </div>
            )}
          </div>
          {study.cards.length === 0 && <p className="banner warn">解析完成，但没有提取到可用于学习的正文。可以换用包含文字层的 PDF。</p>}
          {study.cards.map((card) => (
            <article className="card paper-card" key={card.id}>
              <div className="paper-heading"><h4>{card.label}</h4><span className="tag">第 {card.page} 页</span></div>
              <blockquote>{card.text}</blockquote>
              <p>{card.action}</p>
              <button className="btn ghost" onClick={() => complete(card.id)} disabled={reading.done.includes(card.id)}>
                {reading.done.includes(card.id) ? '已学完' : '标记学完'}
              </button>
            </article>
          ))}
        </section>
      )}
    </>
  )
}
