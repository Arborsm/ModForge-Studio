import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolveDevServerHost, resolveDevServerPorts } from './scripts/tauriDevRuntime.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const host = resolveDevServerHost()
const { port, hmrPort } = resolveDevServerPorts()

function resolveViteCacheDir(env = process.env) {
  const systemCacheRoot =
    env.LOCALAPPDATA?.trim() ||
    env.XDG_CACHE_HOME?.trim() ||
    env.USERPROFILE?.trim() ||
    path.join(os.homedir(), '.cache')

  return path.join(systemCacheRoot, 'ModForge Studio', 'vite')
}

export default defineConfig({
  clearScreen: false,
  plugins: [react()],
  cacheDir: resolveViteCacheDir(),
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'src/app'),
      '@pages': path.resolve(__dirname, 'src/pages'),
      '@widgets': path.resolve(__dirname, 'src/widgets'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@entities': path.resolve(__dirname, 'src/entities'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@platform': path.resolve(__dirname, 'src/platform'),
      '@locales': path.resolve(__dirname, 'src/locales'),
    },
  },
  build: {
    rolldownOptions: {
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
            normalizedId.includes('/src/app/app-shell/PlayerAppearanceWindow') ||
            normalizedId.includes('/src/entities/event/model/stage/playerAppearance') ||
            normalizedId.includes('/src/entities/event/model/stage/farmerAppearanceRenderer') ||
            normalizedId.includes('/src/shared/lib/clothingSprites')
          ) {
            return 'player-appearance'
          }

          if (
            normalizedId.includes('/src/entities/event/model/preconditionSemantics') ||
            normalizedId.includes('/src/entities/event/model/gameStateQueryCatalog') ||
            normalizedId.includes('/src/entities/event/model/gameStateQuerySemantics')
          ) {
            return 'event-condition-model'
          }

          if (
            normalizedId.includes('/src/entities/event/model/parser') ||
            normalizedId.includes('/src/entities/event/model/commandCatalog') ||
            normalizedId.includes('/src/entities/event/model/patchHub')
          ) {
            return 'event-authoring-model'
          }

          if (
            normalizedId.includes('/src/pages/workbench/workspaces/event-stage/') ||
            normalizedId.includes('/src/entities/event/model/stage/eventStageShared') ||
            normalizedId.includes('/src/entities/event/model/stage/eventStageAssets') ||
            normalizedId.includes('/src/entities/event/model/stage/eventStagePlayback') ||
            normalizedId.includes('/src/entities/event/model/stage/eventStageTemporarySprites') ||
            normalizedId.includes('/src/entities/event/model/stage/eventStageFarmerState') ||
            normalizedId.includes('/src/entities/event/model/stage/farmerEventAnimationData')
          ) {
            return 'event-stage-runtime'
          }

          if (normalizedId.includes('/src/pages/workbench/workspaces/item/')) {
            return 'item-workspace'
          }

          if (normalizedId.includes('/src/pages/workbench/workspaces/character/')) {
            return 'character-workspace'
          }

          if (normalizedId.includes('/src/pages/workbench/workspaces/building/')) {
            return 'building-workspace'
          }

          if (normalizedId.includes('/src/pages/workbench/workspaces/mod/')) {
            return 'mod-workspace'
          }

          if (
            normalizedId.includes('/src/entities/map/ui/MapViewport') ||
            normalizedId.includes('/src/entities/map/') ||
            normalizedId.includes('/src/pages/workbench/workspaces/map/')
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
