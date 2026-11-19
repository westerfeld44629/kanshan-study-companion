import { handle } from './_lib/router.mjs'

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const query = Object.fromEntries(url.searchParams.entries())
  const out = await handle('search', { query })
  res.status(out.status).setHeader('content-type', 'application/json; charset=utf-8')
  res.send(out.body)
}

