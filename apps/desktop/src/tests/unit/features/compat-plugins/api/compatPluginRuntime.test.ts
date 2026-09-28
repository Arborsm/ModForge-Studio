import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import {
  __resetCompatPluginRuntimeForTests,
  loadCompatPlugins,
  reloadCompatPlugins,
} from '@features/compat-plugins/api/compatPluginRuntime'
import { useCompatPluginStore } from '@features/compat-plugins/model/compatPluginStore'
import { usePluginLocaleStore } from '@features/compat-plugins/model/pluginLocaleStore'
import { usePageDescriptorStore } from '@features/compat-plugins/model/pageDescriptorStore'
import { usePluginConditionSyntaxStore } from '@entities/content-patcher'
import { getAssetSchema, unregisterAssetSchema } from '@entities/asset-schema'
import type { CompatPluginSummary } from '@features/compat-plugins'
import type { CodePluginLoadResult } from '@features/compat-plugins/runtime/codePluginLoader'

const listCompatPluginsMock = vi.fn<() => Promise<CompatPluginSummary[]>>()
const reloadCompatPluginsFromBackendMock = vi.fn<() => Promise<CompatPluginSummary[]>>()

vi.mock('@features/compat-plugins/api/listCompatPlugins', () => ({
  listCompatPlugins: () => listCompatPluginsMock(),
  reloadCompatPluginsFromBackend: () => reloadCompatPluginsFromBackendMock(),
  getCompatPluginRoots: vi.fn(),
}))

vi.mock('@features/compat-plugins/runtime/codePluginLoader', () => ({
  loadCodePlugins: vi.fn(),
  disposeCodePlugins: vi.fn(),
  HOST_SDK_MAJOR_VERSION: 1,
}))

const { loadCodePlugins, disposeCodePlugins } = await import('@features/compat-plugins/runtime/codePluginLoader')

function makePlugin(overrides: Partial<CompatPluginSummary> = {}): CompatPluginSummary {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    format: 1,
    hasCodeEntry: false,
    entry: null,
    sdkVersion: null,
    targets: [],
    pageIds: [],
    pages: [],
    i18n: {},
    loadError: null,
    assetSchemas: [],
    conditionSyntax: [],
    capabilities: [],
    ...overrides,
  }
}

function emptyCodeResult(overrides: Partial<CodePluginLoadResult> = {}): CodePluginLoadResult {
  return { registrations: [], diagnostics: [], disposeHooks: [], ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  listCompatPluginsMock.mockResolvedValue([])
  reloadCompatPluginsFromBackendMock.mockResolvedValue([])
  vi.mocked(loadCodePlugins).mockResolvedValue(emptyCodeResult())
  __resetCompatPluginRuntimeForTests()
  useCompatPluginStore.setState({ plugins: [], status: 'idle', error: null, diagnostics: [] })
  usePluginLocaleStore.getState().setBundles({})
  usePageDescriptorStore.getState().clearPages()
  usePluginConditionSyntaxStore.getState().clear()
  for (const id of ['plugin-a/Data', 'plugin-b/Data', 'plugin-a/Textures/*']) {
    unregisterAssetSchema(id)
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('loadCompatPlugins (initial)', () => {
  test('lists plugins, builds runtime, and populates the compat store at epoch 0', async () => {
    const plugins = [makePlugin({ id: 'plugin-a' })]
    listCompatPluginsMock.mockResolvedValue(plugins)

    const result = await loadCompatPlugins()

    expect(listCompatPluginsMock).toHaveBeenCalledTimes(1)
    expect(result.epoch).toBe(0)
    expect(result.summaries).toEqual(plugins)
    expect(useCompatPluginStore.getState().status).toBe('loaded')
    expect(useCompatPluginStore.getState().plugins).toEqual(plugins)
  })

  test('does not dispose on initial load', async () => {
    await loadCompatPlugins()
    expect(disposeCodePlugins).not.toHaveBeenCalled()
  })
})

describe('reloadCompatPlugins (hot-reload)', () => {
  test('rescans backend, disposes previous, increments epoch, and rebuilds', async () => {
    reloadCompatPluginsFromBackendMock.mockResolvedValue([makePlugin({ id: 'plugin-a' })])

    await loadCompatPlugins()
    const firstEpoch = (await reloadCompatPlugins()).epoch

    expect(reloadCompatPluginsFromBackendMock).toHaveBeenCalledTimes(1)
    expect(firstEpoch).toBe(1)
    expect(disposeCodePlugins).toHaveBeenCalledTimes(1)
  })

  test('passes the incremented epoch to loadCodePlugins for cache busting', async () => {
    await loadCompatPlugins()
    await reloadCompatPlugins()
    await reloadCompatPlugins()

    const epochArgs = vi.mocked(loadCodePlugins).mock.calls.map((call) => call[1])
    // initial load → undefined (cold cache, no version prefix); reload 1 → 1; reload 2 → 2
    expect(epochArgs).toEqual([undefined, 1, 2])
  })

  test('per-plugin code load failures are captured in diagnostics without aborting', async () => {
    listCompatPluginsMock.mockResolvedValue([makePlugin({ id: 'plugin-a' })])
    vi.mocked(loadCodePlugins).mockResolvedValue(
      emptyCodeResult({
        diagnostics: [{ pluginId: 'plugin-a', reason: 'boom', phase: 'import' }],
      }),
    )

    const result = await loadCompatPlugins()

    expect(result.diagnostics).toHaveLength(1)
    expect(useCompatPluginStore.getState().status).toBe('loaded')
    expect(useCompatPluginStore.getState().diagnostics).toHaveLength(1)
  })

  test('overall backend failure marks the store errored and rethrows', async () => {
    reloadCompatPluginsFromBackendMock.mockRejectedValue(new Error('backend down'))

    await expect(reloadCompatPlugins()).rejects.toThrow('backend down')
    expect(useCompatPluginStore.getState().status).toBe('error')
  })

  test('empty plugin list reload succeeds with empty registrations', async () => {
    const result = await reloadCompatPlugins()

    expect(result.registrations).toEqual([])
    expect(result.codeRegistrations).toEqual([])
    expect(result.diagnostics).toEqual([])
  })
})

describe('replace semantics across reload', () => {
  test('i18n bundles are replaced, not merged', async () => {
    listCompatPluginsMock.mockResolvedValue([makePlugin({ id: 'plugin-a', i18n: { 'en-US': { greeting: 'hi' } } })])
    await loadCompatPlugins()
    expect(usePluginLocaleStore.getState().bundles['plugin-a']).toBeDefined()
    expect(usePluginLocaleStore.getState().bundles['plugin-b']).toBeUndefined()

    reloadCompatPluginsFromBackendMock.mockResolvedValue([makePlugin({ id: 'plugin-b', i18n: { 'en-US': { greeting: 'hello' } } })])
    await reloadCompatPlugins()

    const bundles = usePluginLocaleStore.getState().bundles
    expect(bundles['plugin-a']).toBeUndefined()
    expect(bundles['plugin-b']).toBeDefined()
  })

  test('page descriptors are replaced, not merged', async () => {
    listCompatPluginsMock.mockResolvedValue([
      makePlugin({
        id: 'plugin-a',
        pages: [
          {
            id: 'page-a',
            section: 'tools',
            order: 1,
            icon: 'images',
            titleKey: 'a',
            presentation: 'standalone',
            projectAccess: 'none',
            source: null,
            layout: null,
            sections: [],
            validations: [],
          },
        ],
      }),
    ])
    await loadCompatPlugins()
    expect(usePageDescriptorStore.getState().getPage('plugin-a', 'page-a')).not.toBeNull()

    reloadCompatPluginsFromBackendMock.mockResolvedValue([])
    await reloadCompatPlugins()

    expect(usePageDescriptorStore.getState().getPage('plugin-a', 'page-a')).toBeNull()
  })

  test('plugin asset schemas are replaced, not merged', async () => {
    listCompatPluginsMock.mockResolvedValue([makePlugin({ id: 'plugin-a', assetSchemas: [{ assetPath: 'plugin-a/Data', fields: [] }] })])
    await loadCompatPlugins()
    expect(getAssetSchema('plugin-a/Data')).toBeDefined()

    reloadCompatPluginsFromBackendMock.mockResolvedValue([
      makePlugin({ id: 'plugin-b', assetSchemas: [{ assetPath: 'plugin-b/Data', fields: [] }] }),
    ])
    await reloadCompatPlugins()

    expect(getAssetSchema('plugin-a/Data')).toBeUndefined()
    expect(getAssetSchema('plugin-b/Data')).toBeDefined()
  })

  test('condition syntax contributions are replaced, not merged', async () => {
    listCompatPluginsMock.mockResolvedValue([
      makePlugin({ id: 'plugin-a', conditionSyntax: [{ namespace: 'A', keys: [{ key: 'KeyA' }] }] }),
    ])
    await loadCompatPlugins()
    expect(usePluginConditionSyntaxStore.getState().contributions).toHaveLength(1)

    reloadCompatPluginsFromBackendMock.mockResolvedValue([
      makePlugin({ id: 'plugin-b', conditionSyntax: [{ namespace: 'B', keys: [{ key: 'KeyB' }] }] }),
    ])
    await reloadCompatPlugins()

    const contributions = usePluginConditionSyntaxStore.getState().contributions
    expect(contributions).toHaveLength(1)
    expect(contributions[0].key).toBe('KeyB')
  })
})

describe('disabled plugins are listed but not registered', () => {
  // A disabled plugin contributes pages, i18n, asset schemas and condition
  // syntax. None of these should be registered, but the compat plugin store
  // must still list the plugin so the manager can show and re-enable it.
  function disabledDataPlugin(): CompatPluginSummary {
    return makePlugin({
      id: 'plugin-disabled',
      disabled: true,
      i18n: { 'en-US': { greeting: 'hi' } },
      assetSchemas: [{ assetPath: 'plugin-disabled/Data', fields: [] }],
      conditionSyntax: [{ namespace: 'D', keys: [{ key: 'KeyD' }] }],
      pages: [
        {
          id: 'page-d',
          section: 'tools',
          order: 1,
          icon: 'images',
          titleKey: 'd',
          presentation: 'standalone',
          projectAccess: 'none',
          source: null,
          layout: null,
          sections: [],
          validations: [],
        },
      ],
    })
  }

  test('disabled data-pack pages are not registered but the plugin stays listed', async () => {
    listCompatPluginsMock.mockResolvedValue([disabledDataPlugin()])
    const result = await loadCompatPlugins()

    expect(usePageDescriptorStore.getState().getPage('plugin-disabled', 'page-d')).toBeNull()
    expect(result.registrations).toEqual([])
    // Store keeps the full tree so the manager can show/re-enable it.
    expect(useCompatPluginStore.getState().plugins).toHaveLength(1)
    expect(useCompatPluginStore.getState().plugins[0].id).toBe('plugin-disabled')
  })

  test('disabled plugin i18n bundles are not registered', async () => {
    listCompatPluginsMock.mockResolvedValue([disabledDataPlugin()])
    await loadCompatPlugins()

    expect(usePluginLocaleStore.getState().bundles['plugin-disabled']).toBeUndefined()
  })

  test('disabled plugin asset schemas are not registered', async () => {
    listCompatPluginsMock.mockResolvedValue([disabledDataPlugin()])
    await loadCompatPlugins()

    expect(getAssetSchema('plugin-disabled/Data')).toBeUndefined()
  })

  test('disabled plugin condition syntax is not registered', async () => {
    listCompatPluginsMock.mockResolvedValue([disabledDataPlugin()])
    await loadCompatPlugins()

    expect(usePluginConditionSyntaxStore.getState().contributions).toHaveLength(0)
  })

  test('disabled code-package plugins are not passed to loadCodePlugins', async () => {
    listCompatPluginsMock.mockResolvedValue([
      makePlugin({ id: 'plugin-code-disabled', disabled: true, hasCodeEntry: true, entry: 'index.js', sdkVersion: '1.0.0' }),
      makePlugin({ id: 'plugin-code-enabled', hasCodeEntry: true, entry: 'index.js', sdkVersion: '1.0.0' }),
    ])
    await loadCompatPlugins()

    expect(loadCodePlugins).toHaveBeenCalledTimes(1)
    const passedPlugins = vi.mocked(loadCodePlugins).mock.calls[0][0]
    expect(passedPlugins.map((p) => p.id)).toEqual(['plugin-code-enabled'])
  })

  test('re-enabling a previously disabled plugin registers its contributions after reload', async () => {
    listCompatPluginsMock.mockResolvedValue([disabledDataPlugin()])
    await loadCompatPlugins()
    expect(usePageDescriptorStore.getState().getPage('plugin-disabled', 'page-d')).toBeNull()

    reloadCompatPluginsFromBackendMock.mockResolvedValue([makePlugin({ ...disabledDataPlugin(), disabled: false })])
    await reloadCompatPlugins()

    expect(usePageDescriptorStore.getState().getPage('plugin-disabled', 'page-d')).not.toBeNull()
  })
})

describe('concurrent initial load and reload', () => {
  test('stale build disposes its own hooks and does not overwrite the active set', async () => {
    // Simulate a slow initial load (loadCodePlugins awaits) that is superseded
    // by a faster reload. The stale initial build must dispose its own hooks
    // (via disposeCodePlugins) and must not overwrite activeDisposeHooks, so
    // no hooks leak and the reload's hooks remain the active set.
    const initialHooks = [vi.fn()]
    const reloadHooks = [vi.fn()]
    let resolveInitial!: (result: CodePluginLoadResult) => void
    let resolveReload!: (result: CodePluginLoadResult) => void
    // Use a single mockImplementation with a call counter instead of
    // mockImplementationOnce — vi.clearAllMocks() in beforeEach can leave the
    // once-queue in a state where the second once-impl is not consumed, causing
    // resolveReload to stay undefined. A counted implementation is robust to
    // mock reset semantics.
    let loadCallCount = 0
    vi.mocked(loadCodePlugins).mockImplementation(() => {
      loadCallCount += 1
      if (loadCallCount === 1) {
        return new Promise<CodePluginLoadResult>((resolve) => {
          resolveInitial = resolve
        })
      }
      return new Promise<CodePluginLoadResult>((resolve) => {
        resolveReload = resolve
      })
    })

    listCompatPluginsMock.mockResolvedValue([makePlugin({ id: 'plugin-a' })])
    reloadCompatPluginsFromBackendMock.mockResolvedValue([makePlugin({ id: 'plugin-b' })])

    const initialPromise = loadCompatPlugins()
    // Start reload while initial is still awaiting loadCodePlugins.
    const reloadPromise = reloadCompatPlugins()
    // Flush the microtask queue so both async functions advance past their
    // initial await (listCompatPlugins / reloadCompatPluginsFromBackend) and
    // reach loadCodePlugins, where they park on the pending promises.
    await new Promise((r) => setTimeout(r, 0))

    // Resolve the reload first (it is the newer build), then the stale initial.
    resolveReload(emptyCodeResult({ disposeHooks: reloadHooks }))
    await reloadPromise
    resolveInitial(emptyCodeResult({ disposeHooks: initialHooks }))
    await initialPromise

    // disposeCodePlugins is called: once by the reload (disposing the prior
    // empty active set) and once by the stale initial build (disposing its own
    // freshly-loaded hooks so they do not leak). The last call must carry the
    // stale initial hooks.
    const disposeCalls = vi.mocked(disposeCodePlugins).mock.calls
    expect(disposeCalls.length).toBeGreaterThanOrEqual(2)
    expect(disposeCalls[disposeCalls.length - 1][0]).toBe(initialHooks)
  })
})
