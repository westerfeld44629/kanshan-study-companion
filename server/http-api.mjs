import { handle } from '../api/_lib/router.mjs'
import { MAX_PDF_BYTES } from '../shared/paper.mjs'

export function jsonError(res, status, error) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify({ ok: false, error }))
}

export async function handleApiRequest(req, res, url) {
  const route = url.pathname.slice('/api/'.length).replace(/\/$/, '')
  const query = Object.fromEntries(url.searchParams)
  let body = {}
  if (req.method === 'POST') {
    const binary = route === 'pdf' && req.headers['content-type'] === 'application/pdf'
    const limit = binary ? MAX_PDF_BYTES : 4_400_000
    const chunks = []
    let size = 0
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      size += chunk.length
      if (size > limit) {
        req.resume()
        return jsonError(res, 413, binary ? 'PDF 超过 100 MB。' : '请求内容过大。')
      }
      chunks.push(chunk)
    }
    const payload = Buffer.concat(chunks, size)
    if (binary) body = { name: query.name, bytes: payload }
    else if (size) {
      try { body = JSON.parse(payload.toString('utf8')) }
      catch { return jsonError(res, 400, '请求体不是合法 JSON') }
    }
  }

  const out = await handle(route, { query, body, method: req.method, localPdfUpload: true })
  res.writeHead(out.status, out.headers)
  res.end(out.body)
}
