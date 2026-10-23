import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.STUHELPER_API_TARGET || 'http://127.0.0.1:8080'
  const proxy = { '/api': { target, changeOrigin: false } }
  return {
    plugins: [vue()],
    server: { host: '127.0.0.1', strictPort: true, proxy },
    preview: { host: '127.0.0.1', strictPort: true, proxy },
  }
})
