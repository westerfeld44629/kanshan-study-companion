import { handle } from './_lib/router.mjs'

export default async function handler(req, res) {
  const out = await handle('study', { method: req.method, body: req.body ?? {} })
  res.writeHead(out.status, out.headers)
  res.end(out.body)
}
