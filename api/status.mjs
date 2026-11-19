import { handle } from './_lib/router.mjs'

export default async function handler(req, res) {
  const out = await handle('status', {})
  res.status(out.status).setHeader('content-type', 'application/json; charset=utf-8')
  res.send(out.body)
}

