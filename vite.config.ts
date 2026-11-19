import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

declare const process: { env: Record<string, string | undefined> }

// 开发时把 /api 代理到本地 node 服务，线上由 Vercel Functions 接管同一路径
const API_TARGET = process.env.API_TARGET ?? 'http://127.0.0.1:7300'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  envDir: mode === 'package' ? false : undefined,
  define: mode === 'package' ? { 'import.meta.env.VITE_API_BASE': '""' } : undefined,
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
}))

