import { once } from 'node:events'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { handleApiRequest, jsonError } from './http-api.mjs'

const HOST = '127.0.0.1'
export const DEFAULT_PORT = 5173
const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
}

async function serveFile(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return jsonError(res, 405, '此资源只支持读取。')
  }
  let name
  try { name = decodeURIComponent(pathname) }
  catch { return jsonError(res, 400, '网址编码无效。') }
  const filename = resolve(dist, name === '/' ? 'index.html' : '.' + name)
  const path = relative(dist, filename)
  if (isAbsolute(path) || name.includes('\\') || name.includes('\0') || path.split(sep).some((part) => part.startsWith('.'))) {
    return jsonError(res, 404, '资源不存在。')
  }
  const info = await stat(filename).catch((error) => {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
  })
  if (!info?.isFile()) return jsonError(res, 404, '资源不存在。')
  res.writeHead(200, {
    'Content-Type': mimeTypes[extname(filename)] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': path.startsWith('assets' + sep) ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  if (req.method === 'HEAD') res.end()
  else await pipeline(createReadStream(filename), res)
}

export async function startLocalServer(port) {
  const index = await stat(resolve(dist, 'index.html')).catch((error) => {
    if (error.code !== 'ENOENT') throw error
  })
  if (!index?.isFile()) throw new Error('缺少网页构建产物。请安装 npm 安装包，或在源码目录先运行 npm run build。')

  const server = createServer(async (req, res) => {
    const origin = URL.parse('http://' + req.headers.host)
    if (!origin || ![HOST, 'localhost'].includes(origin.hostname) ||
        Number(origin.port || 80) !== req.socket.localPort) {
      return jsonError(res, 403, '请使用终端显示的本机地址。')
    }
    const url = URL.parse(req.url, origin)
    if (!url || url.origin !== origin.origin) return jsonError(res, 400, '网址无效。')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      if (url.pathname.startsWith('/api/')) {
        if ((req.headers.origin && req.headers.origin !== origin.origin) || req.headers['sec-fetch-site'] === 'cross-site') {
          return jsonError(res, 403, '本地接口仅供看山伴学页面使用。')
        }
        await handleApiRequest(req, res, url)
      } else {
        await serveFile(req, res, url.pathname)
      }
    } catch {
      if (!res.destroyed && !res.headersSent) jsonError(res, 500, '本地服务处理失败。')
      else res.destroy()
    }
  })

  const ports = port === undefined ? [DEFAULT_PORT, DEFAULT_PORT + 1, DEFAULT_PORT + 2, 0] : [port]
  for (const candidate of ports) {
    try {
      server.listen(candidate, HOST)
      await once(server, 'listening')
      return server
    } catch (error) {
      if (port !== undefined && ['EADDRINUSE', 'EACCES'].includes(error.code)) {
        throw new Error(`端口 ${port} 已被占用或不可用。请换一个端口。`)
      }
      if (candidate === 0 || !['EADDRINUSE', 'EACCES'].includes(error.code)) throw error
    }
  }
}
