import { handle } from './_lib/router.mjs'

export default async function handler(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const out = await handle('recommend', { body })
  res.status(out.status).setHeader('content-type', 'application/json; charset=utf-8')
  res.send(out.body)
}

