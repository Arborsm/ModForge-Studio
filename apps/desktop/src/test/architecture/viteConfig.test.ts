import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import path from 'node:path'

const ORIGINAL_ENV = { ...process.env }

async function loadViteConfig() {
  vi.resetModules()
  const module = await import('../../../vite.config.ts')
  return module.default
}

async function loadChunkGroupResolver() {
  vi.resetModules()
  const module = await import('../../../vite.config.ts')
  return module.resolveRolldownChunkGroup
}

async function loadReactDevtoolsHtmlPluginFactory() {
  vi.resetModules()
  const module = await import('../../../vite.config.ts')
  return module.reactDevtoolsStandaloneHtmlPlugin
}

type VitePluginProbe = {
  name?: string
  resolveId?: (source: string) => string | null
  load?: (id: string) => string | null
  transformIndexHtml?: unknown
}

function flattenPluginProbes(value: unknown): VitePluginProbe[] {
  if (!Array.isArray(value)) {
    return [value as VitePluginProbe]
  }

  return value.flatMap((entry) => flattenPluginProbes(entry))
}

function runTransformIndexHtml(plugin: { transformIndexHtml?: unknown }) {
  if (typeof plugin.transformIndexHtml !== 'function') {
    throw new Error('Expected plugin transformIndexHtml hook to be a function')
  }

  return plugin.transformIndexHtml()
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

  it('serves React Compiler runtime through a named export interop module', async () => {
    const config = await loadViteConfig()
    const plugins = flattenPluginProbes(config.plugins ?? [])
    const interopPlugin = plugins.find((plugin) => plugin.name === 'modforge:react-compiler-runtime-interop')

    expect(interopPlugin).toBeDefined()

    const interopId = interopPlugin?.resolveId?.('react/compiler-runtime')

    expect(interopId).toBe('\0modforge/react-compiler-runtime-interop')
    expect(interopPlugin?.load?.(interopId ?? '')).toContain('export function c(size)')
  })

  it('does not inject standalone React DevTools into default dev html', async () => {
    const createPlugin = await loadReactDevtoolsHtmlPluginFactory()
    const plugin = createPlugin({})

    expect(runTransformIndexHtml(plugin)).toEqual([])
  })

  it('injects standalone React DevTools before React only when explicitly enabled', async () => {
    const createPlugin = await loadReactDevtoolsHtmlPluginFactory()
    const plugin = createPlugin({ MODFORGE_REACT_DEVTOOLS: '1' })

    expect(runTransformIndexHtml(plugin)).toEqual([
      {
        tag: 'script',
        attrs: {
          src: 'http://localhost:8097',
        },
        injectTo: 'head-prepend',
      },
    ])
  })

  it('splits event and building workspace code into focused Rolldown groups', async () => {
    const resolveChunkGroup = await loadChunkGroupResolver()

    expect(resolveChunkGroup('E:/repo/apps/desktop/node_modules/@tauri-apps/api/core.js')).toBe('desktop-host-vendor')
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/entities/event/model/stage/eventStageTemporarySprites.ts')).toBe(
      'event-stage-runtime',
    )
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/entities/event/model/stage/eventStageSpecificSpriteEffectCases.ts')).toBe(
      'event-stage-effects',
    )
    expect(
      resolveChunkGroup(
        'E:/repo/apps/desktop/src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/EventPatchEditor.tsx',
      ),
    ).toBe('event-stage-workflow-view')
    expect(
      resolveChunkGroup(
        'E:/repo/apps/desktop/src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-model/commandSchema.ts',
      ),
    ).toBe('event-stage-workflow-model')
    expect(
      resolveChunkGroup(
        'E:/repo/apps/desktop/src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-model/command-schemas/visual.ts',
      ),
    ).toBe('event-stage-workflow-schemas')
    expect(
      resolveChunkGroup(
        'E:/repo/apps/desktop/src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/EventResourcePicker.tsx',
      ),
    ).toBe('event-stage-resource-picker')
    expect(
      resolveChunkGroup(
        'E:/repo/apps/desktop/src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/ScriptCard.tsx',
      ),
    ).toBe('event-stage-script-editor')
    expect(
      resolveChunkGroup(
        'E:/repo/apps/desktop/src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/EventStagePreview.tsx',
      ),
    ).toBe('event-stage-preview')
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/pages/workbench/workspaces/event-stage/editors/EventPatchEditor.tsx')).toBe(
      'event-stage-authoring',
    )
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/entities/event/model/stage/eventStagePlayback.ts')).toBe('event-stage-runtime')
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/pages/workbench/workspaces/event-stage/ui/EventStageWorkspace.tsx')).toBe(
      'event-stage-runtime',
    )
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/entities/event/model/parser.ts')).toBe('event-authoring-model')
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/entities/event/model/commandCatalog.ts')).toBe('event-authoring-model')
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/entities/event/model/preconditionSemantics.ts')).toBe('event-condition-model')
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/entities/event/model/gameStateQueryCatalog.ts')).toBe('event-condition-model')
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/entities/event/model/gameStateQuerySemantics.ts')).toBe('event-condition-model')
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/entities/event/model/patchHub.ts')).toBe('event-authoring-model')
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/pages/workbench/workspaces/item/ui/ItemWorkspace.tsx')).toBe('item-workspace')
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/pages/workbench/workspaces/character/ui/CharacterWorkspace.tsx')).toBe(
      'character-workspace',
    )
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/pages/workbench/workspaces/building/state/useBuildingWorkspace.ts')).toBe(
      'building-workspace-state',
    )
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/pages/workbench/workspaces/building/state/buildingWorldEntries.ts')).toBe(
      'building-workspace-state',
    )
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/pages/workbench/workspaces/building/view/BuildingWorkspace.tsx')).toBe(
      'building-workspace-view',
    )
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/pages/workbench/workspaces/building/view/buildingViewHelpers.ts')).toBe(
      'building-workspace-view',
    )
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/pages/workbench/ui/workspace-panels/building/BuildingBrowserPanel.tsx')).toBe(
      'building-workspace-panels',
    )
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/pages/workbench/ui/workspace-panels/building/BuildingInspectorPanel.tsx')).toBe(
      'building-workspace-panels',
    )
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/pages/workbench/ui/workspace-panels/building/BuildingDetailsPanel.tsx')).toBe(
      'building-workspace-panels',
    )
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/pages/workbench/workspaces/building/index.ts')).toBe('building-workspace')
    expect(
      resolveChunkGroup(
        'E:/repo/apps/desktop/src/pages/workbench/workspaces/mod/mods/content-patcher/content-view/ContentPatcherWorkspace.tsx',
      ),
    ).toBe('mod-workspace')
    expect(resolveChunkGroup('E:/repo/apps/desktop/src/pages/workbench/workspaces/map/model/useMapWorkspace.ts')).toBe('map-workspace')
  })
})
