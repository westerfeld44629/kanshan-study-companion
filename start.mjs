import { fork } from 'node:child_process'
import { existsSync, readFileSync, watch } from 'node:fs'
import { once } from 'node:events'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const root = fileURLToPath(new URL('.', import.meta.url))
const envFile = join(root, '.env.local')
let api
let web
let closing = false
const watchers = []
let timer
let restarting = false
let pendingRestart = false

async function close(code = 0) {
  if (closing) return
  closing = true
  process.exitCode = code
  clearTimeout(timer)
  for (const watcher of watchers) watcher.close()
  if (api && api.exitCode === null) api.kill()
  await web?.close()
}

function runApi(port, hasEnvFile) {
  const child = fork(join(root, 'server', 'dev.mjs'), [String(port)], {
    cwd: root,
    execArgv: hasEnvFile ? ['--env-file=.env.local'] : [],
  })
  api = child
  child.once('exit', () => {
    if (api === child && !closing && !restarting) {
      console.error('后端已退出，本地预览将关闭。')
      void close(1)
    }
  })
  return waitForApi(child)
}

function watchApi(port, hasEnvFile) {
  async function restart() {
    if (closing) return
    if (restarting) { pendingRestart = true; return }
    restarting = true
    try {
      if (api && api.exitCode === null && api.signalCode === null) {
        const stopped = once(api, 'exit')
        api.kill()
        await stopped
      }
      if (!closing) {
        await runApi(port, hasEnvFile)
        console.log('[api] 后端代码已重新加载')
      }
    } catch (error) {
      console.error('[api] 重新加载失败：' + error.message)
      await close(1)
    } finally {
      restarting = false
      if (pendingRestart && !closing) { pendingRestart = false; schedule() }
    }
  }
  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(() => void restart(), 350)
  }
  for (const directory of ['api', 'shared', 'server']) {
    const watcher = watch(join(root, directory), { recursive: true }, (_event, filename) => {
      if (!filename || /\.(?:mjs|js)$/.test(filename)) schedule()
    })
    watcher.on('error', (error) => console.error('[api] 文件监听失败：' + error.message))
    watchers.push(watcher)
  }
}

function waitForApi(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('后端启动超时')), 10000)
    child.once('message', ({ port }) => {
      clearTimeout(timeout)
      resolve(port)
    })
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', () => {
      clearTimeout(timeout)
      reject(new Error('后端在就绪前退出，请查看上面的报错'))
    })
  })
}

try {
  if (Number(process.versions.node.split('.')[0]) < 22) {
    throw new Error('请使用 Node.js 22 或以上版本')
  }
  if (!existsSync(join(root, 'node_modules', 'vite', 'package.json'))) {
    throw new Error('请先在项目目录运行 npm ci 安装依赖')
  }
  const hasEnvFile = existsSync(envFile)
  const config = hasEnvFile ? parseEnv(readFileSync(envFile, 'utf8')) : {}
  if (!(process.env.ZHIHU_ACCESS_SECRET ?? config.ZHIHU_ACCESS_SECRET)?.trim()) {
    throw new Error('请在项目的 .env.local 中配置知乎 Access Secret')
  }

  process.once('SIGINT', () => void close())
  process.once('SIGTERM', () => void close())

  const { createServer } = await import('vite')
  if (!closing) {
    const apiPort = await runApi(0, hasEnvFile)
    if (!closing) {
      web = await createServer({
        root,
        server: {
          host: 'localhost',
          proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true } },
        },
      })
      if (closing) await web.close()
      else {
        await web.listen()
        watchApi(apiPort, hasEnvFile)
        const url = web.resolvedUrls.local[0]
        console.log(`看山伴学已启动 ${url}`)
        console.log('按 Ctrl+C 停止前端和后端。')
        if (process.argv.includes('--open')) web.openBrowser()
      }
    }
  }
} catch (error) {
  if (!closing) {
    console.error(`[启动失败] ${error.message}`)
    await close(1)
  }
}
