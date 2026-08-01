import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CodeSplittingGroup } from 'rolldown'
import { defineConfig, type Plugin } from 'vite-plus'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { resolveDevServerHost, resolveDevServerPorts } from './scripts/tauriDevRuntime.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const host = resolveDevServerHost()
const { port, hmrPort } = resolveDevServerPorts()
const reactCompilerRuntimeInteropId = '\0modforge/react-compiler-runtime-interop'
export const REACT_DEVTOOLS_STANDALONE_SCRIPT_URL = 'http://localhost:8097'

function resolveViteCacheDir(env = process.env) {
  const systemCacheRoot =
    env.LOCALAPPDATA?.trim() || env.XDG_CACHE_HOME?.trim() || env.USERPROFILE?.trim() || path.join(os.homedir(), '.cache')

  return path.join(systemCacheRoot, 'ModForge Studio', 'vite')
}

type NamedChunkGroup = {
  name: string
  priority: number
  test: (normalizedId: string) => boolean
}

function normalizeModuleId(id: string) {
  return id.replaceAll('\\', '/')
}

export function shouldInjectReactDevtoolsStandalone(env = process.env) {
  return ['1', 'true', 'yes', 'on'].includes(
    String(env.MODFORGE_REACT_DEVTOOLS ?? '')
      .trim()
      .toLowerCase(),
  )
}

export function reactDevtoolsStandaloneHtmlPlugin(env = process.env): Plugin {
  return {
    name: 'modforge:react-devtools-standalone-html',
    apply: 'serve',
    transformIndexHtml() {
      if (!shouldInjectReactDevtoolsStandalone(env)) {
        return []
      }

      return [
        {
          tag: 'script',
          attrs: {
            src: REACT_DEVTOOLS_STANDALONE_SCRIPT_URL,
          },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

function reactCompilerRuntimeInteropPlugin() {
  return {
    name: 'modforge:react-compiler-runtime-interop',
    enforce: 'pre' as const,
    resolveId(source: string) {
      if (source === 'react/compiler-runtime') {
        return reactCompilerRuntimeInteropId
      }

      return null
    },
    load(id: string) {
      if (id !== reactCompilerRuntimeInteropId) {
        return null
      }

      return `
import React from 'react'

const ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE

export function c(size) {
  const dispatcher = ReactSharedInternals.H
  if (dispatcher === null && import.meta.env.DEV) {
    console.error(
      'Invalid hook call. Hooks can only be called inside of the body of a function component. See https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.',
    )
  }

  return dispatcher.useMemoCache(size)
}

export default { c }
`
    },
  }
}

const namedChunkGroups: NamedChunkGroup[] = [
  {
    name: 'react-vendor',
    priority: 100,
    test: (id) => id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/'),
  },
  {
    name: 'desktop-host-vendor',
    priority: 90,
    test: (id) => id.includes('/node_modules/@tauri-apps/'),
  },
  {
    name: 'ui-vendor',
    priority: 80,
    test: (id) => id.includes('/node_modules/lucide-react/') || id.includes('/node_modules/@radix-ui/'),
  },
  {
    name: 'player-appearance',
    priority: 70,
    test: (id) =>
      id.includes('/src/app/app-shell/PlayerAppearanceWindow') ||
      id.includes('/src/entities/event/model/stage/playerAppearance') ||
      id.includes('/src/entities/event/model/stage/farmerAppearanceRenderer') ||
      id.includes('/src/entities/character/lib/clothingSprites'),
  },
  {
    name: 'event-condition-model',
    priority: 60,
    test: (id) =>
      id.includes('/src/entities/event/model/preconditionSemantics') ||
      id.includes('/src/entities/event/model/gameStateQueryCatalog') ||
      id.includes('/src/entities/event/model/gameStateQuerySemantics'),
  },
  {
    name: 'event-authoring-model',
    priority: 60,
    test: (id) =>
      id.includes('/src/entities/event/model/parser') ||
      id.includes('/src/entities/event/model/commandCatalog') ||
      id.includes('/src/entities/event/model/patchHub'),
  },
  {
    name: 'event-stage-effects',
    priority: 70,
    test: (id) => id.includes('/src/entities/event/model/stage/eventStageSpecificSprite'),
  },
  {
    name: 'event-stage-workflow-schemas',
    priority: 70,
    test: (id) => id.includes('/src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-model/command-schemas/'),
  },
  {
    name: 'event-stage-workflow-model',
    priority: 69,
    test: (id) => id.includes('/src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-model/'),
  },
  {
    name: 'resource-browser',
    priority: 69,
    test: (id) => id.includes('/src/features/resource-browser/'),
  },
  {
    name: 'event-stage-script-editor',
    priority: 69,
    test: (id) =>
      id.includes('/src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/CommandPalette') ||
      id.includes('/src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/ParamPill') ||
      id.includes('/src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/ScriptCard') ||
      id.includes('/src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/ScriptEditor') ||
      id.includes('/src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/ScriptTimeline'),
  },
  {
    name: 'event-stage-preview',
    priority: 69,
    test: (id) =>
      id.includes('/src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/ActorSprite') ||
      id.includes('/src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/EventStagePreview') ||
      id.includes('/src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/StagePathOverlay'),
  },
  {
    name: 'event-stage-workflow-view',
    priority: 68,
    test: (id) => id.includes('/src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/'),
  },
  {
    name: 'event-stage-authoring',
    priority: 65,
    test: (id) => id.includes('/src/pages/workbench/workspaces/event-stage/editors/'),
  },
  {
    name: 'event-stage-runtime',
    priority: 60,
    test: (id) =>
      id.includes('/src/pages/workbench/workspaces/event-stage/') ||
      id.includes('/src/entities/event/model/stage/eventStageShared') ||
      id.includes('/src/entities/event/model/stage/eventStageAssets') ||
      id.includes('/src/entities/event/model/stage/eventStagePlayback') ||
      id.includes('/src/entities/event/model/stage/eventStageTemporarySprites') ||
      id.includes('/src/entities/event/model/stage/eventStageFarmerState') ||
      id.includes('/src/entities/event/model/stage/farmerEventAnimationData'),
  },
  {
    name: 'building-workspace-state',
    priority: 50,
    test: (id) =>
      id.includes('/src/pages/workbench/workspaces/building/state/') ||
      id.includes('/src/pages/workbench/workspaces/building/entities/building/'),
  },
  {
    name: 'building-workspace-view',
    priority: 50,
    test: (id) => id.includes('/src/pages/workbench/workspaces/building/view/'),
  },
  {
    name: 'building-workspace-panels',
    priority: 50,
    test: (id) => id.includes('/src/pages/workbench/ui/workspace-panels/building/'),
  },
  {
    name: 'building-workspace',
    priority: 40,
    test: (id) => id.includes('/src/pages/workbench/workspaces/building/'),
  },
  {
    name: 'item-workspace',
    priority: 40,
    test: (id) => id.includes('/src/pages/workbench/workspaces/item/'),
  },
  {
    name: 'character-workspace',
    priority: 40,
    test: (id) => id.includes('/src/pages/workbench/workspaces/character/'),
  },
  {
    name: 'mod-workspace',
    priority: 40,
    test: (id) => id.includes('/src/pages/workbench/workspaces/mod/'),
  },
  {
    name: 'character-data-workspace',
    priority: 40,
    test: (id) => id.includes('/src/pages/workbench/workspaces/character-data/'),
  },
  {
    name: 'dialogue-workspace',
    priority: 40,
    test: (id) => id.includes('/src/pages/workbench/workspaces/dialogue/'),
  },
  {
    name: 'schedule-workspace',
    priority: 40,
    test: (id) => id.includes('/src/pages/workbench/workspaces/schedule/'),
  },
  {
    name: 'mail-workspace',
    priority: 40,
    test: (id) => id.includes('/src/pages/workbench/workspaces/mail/'),
  },
  {
    name: 'debugger-workspace',
    priority: 40,
    test: (id) => id.includes('/src/pages/workbench/workspaces/debugger/'),
  },
  {
    name: 'map-workspace',
    priority: 40,
    test: (id) =>
      id.includes('/src/entities/map/ui/MapViewport') ||
      id.includes('/src/entities/map/') ||
      id.includes('/src/pages/workbench/workspaces/map/'),
  },
]

export function resolveRolldownChunkGroup(moduleId: string) {
  const normalizedId = normalizeModuleId(moduleId)

  return namedChunkGroups.find((group) => group.test(normalizedId))?.name ?? null
}

const rolldownChunkGroups: CodeSplittingGroup[] = namedChunkGroups.map(({ name, priority, test }) => ({
  name,
  priority,
  test: (id) => test(normalizeModuleId(id)),
}))

export default defineConfig({
  base: './',
  clearScreen: false,
  plugins: [
    reactDevtoolsStandaloneHtmlPlugin(),
    reactCompilerRuntimeInteropPlugin(),
    react(),
    babel({ presets: [reactCompilerPreset()] }) as unknown as Plugin,
  ] as unknown as Plugin[],
  cacheDir: resolveViteCacheDir(),
  resolve: {
    alias: [
      { find: '@app', replacement: path.resolve(__dirname, 'src/app') },
      { find: '@pages', replacement: path.resolve(__dirname, 'src/pages') },
      { find: '@widgets', replacement: path.resolve(__dirname, 'src/widgets') },
      { find: '@features', replacement: path.resolve(__dirname, 'src/features') },
      { find: '@entities', replacement: path.resolve(__dirname, 'src/entities') },
      { find: '@shared', replacement: path.resolve(__dirname, 'src/shared') },
      { find: '@platform', replacement: path.resolve(__dirname, 'src/platform') },
      { find: '@test', replacement: path.resolve(__dirname, 'src/tests/support') },
      { find: /^@locales$/, replacement: path.resolve(__dirname, 'src/locales/index.ts') },
      { find: /^@locales\/(.*)$/, replacement: path.resolve(__dirname, 'src/locales/$1') },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/support/setup.ts'],
    include: ['src/tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'src/dev/**'],
  },
  build: {
    manifest: true,
    rolldownOptions: {
      checks: {
        pluginTimings: false,
      },
      output: {
        codeSplitting: {
          groups: rolldownChunkGroups,
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host,
    watch: {
      ignored: ['**/src-tauri/target/**'],
    },
    hmr: {
      protocol: 'ws',
      host,
      port: hmrPort,
    },
  },
})
