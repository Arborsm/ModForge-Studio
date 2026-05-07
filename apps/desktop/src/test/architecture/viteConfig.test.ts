import { afterEach, describe, expect, it, vi } from 'vitest'
import path from 'node:path'

const ORIGINAL_ENV = { ...process.env }

async function loadViteConfig() {
  vi.resetModules()
  const module = await import('../../../vite.config.ts')
  return module.default
}

async function loadManualChunks() {
  const config = await loadViteConfig()
  const output = config.build?.rolldownOptions?.output

  if (!output || Array.isArray(output) || typeof output.manualChunks !== 'function') {
    throw new Error('Expected vite config to expose build.rolldownOptions.output.manualChunks')
  }

  return output.manualChunks
}

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key]
    }
  }

  Object.assign(process.env, ORIGINAL_ENV)
})

describe('vite config', () => {
  it('uses trimmed shared dev runtime host and explicit ports', { timeout: 15_000 }, async () => {
    process.env.TAURI_DEV_HOST = ' 0.0.0.0 '
    process.env.MODFORGE_DEV_PORT = '6200'
    process.env.MODFORGE_DEV_HMR_PORT = '6201'

    const config = await loadViteConfig()
    const { server } = config

    if (!server || server.hmr === false || server.hmr === true || !server.hmr) {
      throw new Error('Expected vite server config with HMR settings')
    }

    expect(server.host).toBe('0.0.0.0')
    expect(server.port).toBe(6200)
    expect(server.hmr.port).toBe(6201)
  })

  it('stores vite cache in the system cache directory when LOCALAPPDATA is available', async () => {
    process.env.LOCALAPPDATA = '/tmp/modforge-localappdata'

    const config = await loadViteConfig()

    expect(config.cacheDir).toBe(path.join('/tmp/modforge-localappdata', 'ModForge Studio', 'vite'))
  })

  it('does not block the first html response with startup warmup work', async () => {
    const config = await loadViteConfig()

    expect(config.server?.warmup).toBeUndefined()
  })

  it('splits event workspace runtime and authoring models into focused manual chunks', async () => {
    const manualChunks = await loadManualChunks()
    const context: Parameters<typeof manualChunks>[1] = { getModuleInfo: () => null }

    expect(manualChunks('E:/repo/apps/desktop/src/entities/event/model/stage/eventStageTemporarySprites.ts', context)).toBe('event-stage-runtime')
    expect(manualChunks('E:/repo/apps/desktop/src/entities/event/model/stage/eventStagePlayback.ts', context)).toBe('event-stage-runtime')
    expect(manualChunks('E:/repo/apps/desktop/src/pages/workbench/workspaces/event-stage/ui/EventStageWorkspace.tsx', context)).toBe('event-stage-runtime')
    expect(manualChunks('E:/repo/apps/desktop/src/entities/event/model/parser.ts', context)).toBe('event-authoring-model')
    expect(manualChunks('E:/repo/apps/desktop/src/entities/event/model/commandCatalog.ts', context)).toBe('event-authoring-model')
    expect(manualChunks('E:/repo/apps/desktop/src/entities/event/model/preconditionSemantics.ts', context)).toBe('event-condition-model')
    expect(manualChunks('E:/repo/apps/desktop/src/entities/event/model/gameStateQueryCatalog.ts', context)).toBe('event-condition-model')
    expect(manualChunks('E:/repo/apps/desktop/src/entities/event/model/gameStateQuerySemantics.ts', context)).toBe('event-condition-model')
    expect(manualChunks('E:/repo/apps/desktop/src/entities/event/model/patchHub.ts', context)).toBe('event-authoring-model')
    expect(manualChunks('E:/repo/apps/desktop/src/pages/workbench/workspaces/item/ui/ItemWorkspace.tsx', context)).toBe('item-workspace')
    expect(manualChunks('E:/repo/apps/desktop/src/pages/workbench/workspaces/character/ui/CharacterWorkspace.tsx', context)).toBe('character-workspace')
    expect(manualChunks('E:/repo/apps/desktop/src/pages/workbench/workspaces/building/ui/BuildingWorkspace.tsx', context)).toBe('building-workspace')
    expect(manualChunks('E:/repo/apps/desktop/src/pages/workbench/workspaces/mod/mods/content-patcher/content-view/ContentPatcherWorkspace.tsx', context)).toBe('mod-workspace')
    expect(manualChunks('E:/repo/apps/desktop/src/pages/workbench/workspaces/map/model/useMapWorkspace.ts', context)).toBe('map-workspace')
  })
})
