import { handle } from './_lib/router.mjs'

export default async function handler(req, res) {
  const out = await handle('pdf', { method: req.method, query: req.query, body: req.body ?? {} })
  res.writeHead(out.status, out.headers)
  res.end(out.body)
}
