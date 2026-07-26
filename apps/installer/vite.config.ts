import { defineConfig, type Plugin } from 'vite-plus'
import react from '@vitejs/plugin-react'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react()] as unknown as Plugin[],

  clearScreen: false,

  server: {
    port: 1530,
    strictPort: true,
    host: host || 'localhost',
    hmr: {
      protocol: 'ws',
      host: host || 'localhost',
      port: 1531,
    },
    watch: {
      ignored: ['**/src-tauri/target/**', '**/src-tauri/payload/**'],
    },
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },

  // Pre-bundle React for the rolldown-based Vite+ toolchain
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  },
})
