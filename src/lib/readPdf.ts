import { getDocument, GlobalWorkerOptions, PasswordResponses } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { extractPaper, isPaperHeading } from '../../shared/paper.mjs'

GlobalWorkerOptions.workerSrc = workerUrl

export async function readPdf(file: File, progress: (done: number, pages: number) => void) {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true })
  task.onPassword = (reply: (value: string | Error) => void, reason: number) => {
    reply(new Error(reason === PasswordResponses.NEED_PASSWORD ? '这份 PDF 有密码，请先在本机解锁。' : '无法打开加密 PDF。'))
  }
  try {
    const doc = await task.promise
    const pages = []
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number)
      const text = await page.getTextContent()
      const blocks: { type: 'title' | 'text'; content: string }[] = []
      let line = ''
      let paragraph = ''
      const title: string[] = []
      let y: number | undefined
      let font = 0
      function endParagraph() {
        if (paragraph.trim()) blocks.push({ type: 'text', content: paragraph.trim() })
        paragraph = ''
      }
      function endLine() {
        const value = line.trim()
        line = ''
        if (!value || /^\d{1,3}$/.test(value)) return
        if (isPaperHeading(value)) {
          endParagraph()
          blocks.push({ type: 'title', content: value })
          return
        }
        if (number === 1 && blocks.length === 0 && !paragraph && font >= 16 && value.length >= 8) {
          title.push(value)
          return
        }
        paragraph += (paragraph ? ' ' : '') + value
        if (paragraph.length > 420) endParagraph()
      }
      for (const item of text.items) {
        if (!('str' in item)) continue
        const nextY = item.transform[5]
        const nextFont = Math.abs(item.transform[3])
        if (y !== undefined && Math.abs(nextY - y) > 2) {
          endLine()
          if (Math.abs(nextY - y) > Math.max(16, font * 1.7)) endParagraph()
        }
        y = nextY
        font = nextFont
        line += item.str
        if (item.hasEOL) endLine()
      }
      endLine()
      endParagraph()
      if (title.length) {
        const firstHeading = blocks.findIndex((block) => block.type === 'title' || /^(?:abstract\b|摘要)\s*[:：.—–-]/i.test(block.content))
        const content = firstHeading >= 0 ? blocks.slice(firstHeading) : blocks
        pages.push({ page: number - 1, blocks: [{ type: 'title', content: title.join(' ') }, ...content] })
      } else {
        pages.push({ page: number - 1, blocks })
      }
      page.cleanup()
      progress(number, doc.numPages)
    }
    return extractPaper({ pages })
  } finally {
    await task.destroy()
  }
}
