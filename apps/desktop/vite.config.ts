import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const host = process.env.TAURI_DEV_HOST ?? '127.0.0.1'

export default defineConfig({
  clearScreen: false,
  plugins: [react()],
  server: {
    port: 4510,
    strictPort: true,
    host,
    hmr: {
      protocol: 'ws',
      host,
      port: 4511,
    },
  },
})
