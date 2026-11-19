#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { parseArgs, parseEnv } from 'node:util'
import { configureLocalSettings, readSetting } from '../api/_lib/settings.mjs'
import { DEFAULT_PORT, startLocalServer } from '../server/local.mjs'

const help = `用法
  kanshan start [--port <端口>] [--config <.env.local 路径>]
  kanshan --version

在本机启动看山伴学，按 Ctrl+C 停止。
默认从当前目录或用户目录下的 .kanshan/.env.local 查找配置。`

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
    const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    console.log(version)
    return
  }
  if (!args.length || (args.length === 1 && ['--help', '-h', 'help'].includes(args[0]))) {
    console.log(help)
    return
  }
  if (args[0] !== 'start') throw new Error('请使用 kanshan start 或 kanshan --help。')
  const { values } = parseArgs({
    args: args.slice(1),
    options: { port: { type: 'string' }, config: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
  })
  if (values.help) {
    console.log(help)
    return
  }
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 22 || (major === 22 && minor < 13)) throw new Error('请使用 Node.js 22.13 或以上版本。')
  const port = values.port === undefined ? undefined : Number(values.port)
  if (port !== undefined && (!/^\d+$/.test(values.port) || port > 65535)) {
    throw new Error('端口须为 0 到 65535 的整数。使用 0 由系统分配。')
  }
  const config = values.config === undefined
    ? [resolve('.env.local'), resolve(homedir(), '.kanshan', '.env.local')].find(existsSync)
    : resolve(values.config)
  if (config) configureLocalSettings(parseEnv(readFileSync(config, 'utf8')))

  const server = await startLocalServer(port)
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      server.close(() => process.exit(0))
      server.closeAllConnections()
    })
  }
  const actualPort = server.address().port
  console.log(`看山伴学已启动 http://localhost:${actualPort}/`)
  if (!readSetting('ZHIHU_ACCESS_SECRET')?.trim()) {
    console.log('未找到知乎 Access Secret。界面和本地功能可以使用，知乎联网功能需要 .env.local。')
  }
  if (actualPort !== DEFAULT_PORT) console.log('此地址有独立的浏览器学习记录。要继续原来的记录，请使用原端口。')
  console.log('按 Ctrl+C 停止。')
}

try {
  await main()
} catch (error) {
  console.error(`启动失败：${error.message}`)
  process.exitCode = 1
}
