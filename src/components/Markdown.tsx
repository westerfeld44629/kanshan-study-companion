import React from 'react'

/**
 * 极简 Markdown 渲染：只支持标题、列表、粗体、行内代码、段落。
 * 不引入额外依赖，也不使用 dangerouslySetInnerHTML 以外的注入点。
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const out: React.ReactNode[] = []
  let list: string[] = []
  let code: string[] | null = null
  let key = 0

  const flush = () => {
    if (!list.length) return
    out.push(
      <ul key={'ul' + key++}>
        {list.map((li, i) => (
          <li key={i}>{inline(li)}</li>
        ))}
      </ul>,
    )
    list = []
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^\s*```/.test(line)) {
      flush()
      if (code) {
        out.push(<pre key={key++}><code>{code.join('\n')}</code></pre>)
        code = null
      } else {
        code = []
      }
      continue
    }
    if (code) { code.push(raw); continue }
    if (/^\s*[-*]\s+/.test(line)) {
      list.push(line.replace(/^\s*[-*]\s+/, ''))
      continue
    }
    flush()
    if (!line.trim()) continue
    if (/^###\s+/.test(line)) out.push(<h3 key={key++}>{inline(line.replace(/^###\s+/, ''))}</h3>)
    else if (/^##\s+/.test(line)) out.push(<h3 key={key++}>{inline(line.replace(/^##\s+/, ''))}</h3>)
    else if (/^#\s+/.test(line)) out.push(<h3 key={key++}>{inline(line.replace(/^#\s+/, ''))}</h3>)
    else out.push(<p key={key++}>{inline(line)}</p>)
  }
  flush()
  if (code) out.push(<pre key={key++}><code>{code.join('\n')}</code></pre>)
  return <>{out}</>
}

function inline(s: string): React.ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>
    return <React.Fragment key={i}>{p}</React.Fragment>
  })
}

