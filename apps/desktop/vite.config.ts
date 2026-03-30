import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolveDevServerPorts } from './devServerPorts'

const host = process.env.TAURI_DEV_HOST ?? '127.0.0.1'
const { port, hmrPort } = resolveDevServerPorts()

export default defineConfig({
  clearScreen: false,
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/')

          if (normalizedId.includes('/node_modules/react/') || normalizedId.includes('/node_modules/react-dom/')) {
            return 'react-vendor'
          }

          if (normalizedId.includes('/node_modules/@tauri-apps/')) {
            return 'tauri-vendor'
          }

          if (
            normalizedId.includes('/node_modules/lucide-react/') ||
            normalizedId.includes('/node_modules/@radix-ui/')
          ) {
            return 'ui-vendor'
          }

          if (
            normalizedId.includes('/src/components/PlayerAppearanceWindow') ||
            normalizedId.includes('/src/lib/app/playerAppearance') ||
            normalizedId.includes('/src/lib/app/farmerAppearanceRenderer')
          ) {
            return 'player-appearance'
          }

          if (
            normalizedId.includes('/src/components/EventWorkspace') ||
            normalizedId.includes('/src/components/EventStageWorkspace') ||
            normalizedId.includes('/src/lib/events/') ||
            normalizedId.includes('/src/lib/app/eventStage')
          ) {
            return 'event-workspace'
          }

          if (
            normalizedId.includes('/src/components/MapViewport') ||
            normalizedId.includes('/src/lib/maps/') ||
            normalizedId.includes('/src/lib/app/mapWorkspace') ||
            normalizedId.includes('/src/lib/app/useMapWorkspace')
          ) {
            return 'map-workspace'
          }
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host,
    hmr: {
      protocol: 'ws',
      host,
      port: hmrPort,
    },
  },
})
