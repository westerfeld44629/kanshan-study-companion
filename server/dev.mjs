/**
 * 本地开发服务。Vite 代理 /api 请求到此进程。
 * 启动：node --env-file=.env.local server/dev.mjs
 */
import { createServer } from 'node:http'
import { handleApiRequest, jsonError } from './http-api.mjs'

const PORT = Number(process.argv[2] ?? process.env.API_PORT ?? 7300)
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-headers', 'content-type')
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  if (req.method === 'OPTIONS') return res.writeHead(204).end()
  if (!url.pathname.startsWith('/api/')) return jsonError(res, 404, 'not found')

  try {
    await handleApiRequest(req, res, url)
  } catch (error) {
    if (!res.destroyed && !res.headersSent) jsonError(res, 500, String(error?.message ?? error))
  }
})

server.listen(PORT, '127.0.0.1', () => {
  const { port } = server.address()
  console.log(`[api] http://127.0.0.1:${port}`)
  console.log(`[api] 知乎凭证: ${process.env.ZHIHU_ACCESS_SECRET ? '已配置' : '缺失'}`)
  console.log(`[api] 直答日预算: ${process.env.ZHIDA_DAILY_BUDGET ?? 60}`)
  process.send?.({ port })
})

process.once('disconnect', () => {
  server.close()
  server.closeAllConnections()
})
