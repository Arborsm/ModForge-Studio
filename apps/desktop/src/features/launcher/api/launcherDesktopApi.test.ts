import type { PlatformPorts } from '@shared/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const LAUNCHER_UPDATE_PROGRESS_EVENT = 'launcher://update-check-progress'

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

async function loadConfiguredLauncherDesktop() {
  vi.resetModules()

  const eventListeners = new Map<string, (payload: unknown) => void>()
  const invokeCommand = vi.fn()
  const ports: PlatformPorts = {
    fileSystem: {
      invokeCommand: invokeCommand as PlatformPorts['fileSystem']['invokeCommand'],
      toAssetUrl: vi.fn((filePath: string, protocol?: string) => `${protocol ?? 'asset'}://${filePath}`),
    },
    desktopWindow: {
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
      close: vi.fn(),
      forceClose: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      isMaximized: vi.fn(),
      isFullscreen: vi.fn(),
      setFullscreen: vi.fn(),
      toggleFullscreen: vi.fn(),
    },
    storage: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
    dialog: {
      open: vi.fn(),
      chooseDirectory: vi.fn(),
      chooseFile: vi.fn(),
    },
    hostEvents: {
      canUseHost: vi.fn(() => true),
      listen: vi.fn(async (event, listener) => {
        eventListeners.set(event, listener as (payload: unknown) => void)
        return () => {
          eventListeners.delete(event)
        }
      }),
      listenWindowCloseRequest: vi.fn(async () => () => undefined),
      listenWindowDragDrop: vi.fn(async () => () => undefined),
    },
  }

  const sharedDesktopRuntime = await import('@platform/host/runtime')
  const launcherDesktop = await import('./index')
  sharedDesktopRuntime.configureDesktopPlatformPorts(ports)

  return {
    launcherDesktop,
    invokeCommand,
    eventListeners,
  }
}

describe('launcher desktop API', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('routes launcher commands through the configured file system port', async () => {
    const { launcherDesktop, invokeCommand } = await loadConfiguredLauncherDesktop()
    const settings = {
      gamePath: 'C:\\Games\\Stardew Valley',
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      autoCheckModUpdates: true,
    }
    const diagnostics = { routes: [] }
    invokeCommand.mockResolvedValueOnce(settings).mockResolvedValueOnce(diagnostics)

    await expect(launcherDesktop.loadLauncherSettings()).resolves.toEqual(settings)
    await expect(launcherDesktop.retryLauncherNexusDiagnosticsRoute('publicGraphql')).resolves.toEqual(diagnostics)

    expect(invokeCommand).toHaveBeenNthCalledWith(1, 'load_launcher_settings', undefined)
    expect(invokeCommand).toHaveBeenNthCalledWith(2, 'retry_launcher_nexus_diagnostics_route', {
      routeId: 'publicGraphql',
    })
  })

  it('clears stuck launcher library reads before retrying', async () => {
    const { launcherDesktop, invokeCommand } = await loadConfiguredLauncherDesktop()
    const pendingState = createDeferred<{
      storageFolders: { id: string; name: string; modKeys: string[] }[]
      hiddenModKeys: string[]
      packPresets: never[]
      currentPackId: null
      scopeMode: 'all'
    }>()
    const recoveredState = {
      storageFolders: [{ id: 'unsorted', name: 'Unsorted', modKeys: ['ModForge.NPCAdventures'] }],
      hiddenModKeys: [],
      packPresets: [],
      currentPackId: null,
      scopeMode: 'all' as const,
    }
    invokeCommand.mockReturnValueOnce(pendingState.promise).mockResolvedValueOnce(recoveredState)

    void launcherDesktop.loadLauncherLibraryState()
    launcherDesktop.clearLauncherLibraryReadCaches('C:\\Games\\Stardew Valley\\Mods')

    await expect(launcherDesktop.loadLauncherLibraryState()).resolves.toEqual(recoveredState)

    pendingState.resolve(recoveredState)
    expect(invokeCommand).toHaveBeenNthCalledWith(1, 'load_launcher_library_state', undefined)
    expect(invokeCommand).toHaveBeenNthCalledWith(2, 'load_launcher_library_state', undefined)
  })

  it('reuses pending launcher update checks unless a force refresh is requested', async () => {
    const { launcherDesktop, invokeCommand } = await loadConfiguredLauncherDesktop()
    const pending = createDeferred<{
      modsPath: string
      checkedAtMs: number
      updates: never[]
    }>()
    const refreshed = {
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 456,
      updates: [],
    }
    invokeCommand.mockReturnValueOnce(pending.promise)

    const first = launcherDesktop.checkLauncherUpdates({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      forceRefresh: false,
    })
    const second = launcherDesktop.checkLauncherUpdates({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      forceRefresh: false,
    })

    expect(first).toBe(second)
    expect(invokeCommand).toHaveBeenCalledTimes(1)

    invokeCommand.mockResolvedValueOnce(refreshed)
    await expect(
      launcherDesktop.checkLauncherUpdates({
        modsPath: 'C:\\Games\\Stardew Valley\\Mods',
        forceRefresh: true,
      }),
    ).resolves.toEqual(refreshed)

    expect(invokeCommand).toHaveBeenNthCalledWith(1, 'check_launcher_updates', {
      request: {
        modsPath: 'C:\\Games\\Stardew Valley\\Mods',
        forceRefresh: false,
        sessionId: expect.any(String),
      },
    })
    expect(invokeCommand).toHaveBeenNthCalledWith(2, 'check_launcher_updates', {
      request: {
        modsPath: 'C:\\Games\\Stardew Valley\\Mods',
        forceRefresh: true,
        sessionId: expect.any(String),
      },
    })

    pending.resolve(refreshed)
  })

  it('keeps complete launcher update snapshots fresh for thirty minutes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-12T00:00:00Z'))

    const { launcherDesktop, invokeCommand } = await loadConfiguredLauncherDesktop()
    const cached = {
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: Date.now(),
      updates: [],
    }
    invokeCommand.mockResolvedValueOnce(cached)

    await expect(
      launcherDesktop.checkLauncherUpdates({
        modsPath: 'C:\\Games\\Stardew Valley\\Mods',
        forceRefresh: true,
      }),
    ).resolves.toEqual(cached)

    invokeCommand.mockReset()
    vi.setSystemTime(new Date('2026-04-12T00:29:59Z'))

    await expect(
      launcherDesktop.loadCachedLauncherUpdates({
        modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      }),
    ).resolves.toEqual(cached)
    expect(invokeCommand).not.toHaveBeenCalled()

    invokeCommand.mockResolvedValueOnce(null)
    vi.setSystemTime(new Date('2026-04-12T00:30:01Z'))

    await expect(
      launcherDesktop.loadCachedLauncherUpdates({
        modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      }),
    ).resolves.toBeNull()
    expect(invokeCommand).toHaveBeenCalledWith('load_cached_launcher_updates', {
      request: { modsPath: 'C:\\Games\\Stardew Valley\\Mods' },
    })
  })

  it('publishes current launcher update progress and filters stale sessions', async () => {
    const { launcherDesktop, eventListeners, invokeCommand } = await loadConfiguredLauncherDesktop()
    const firstPending = createDeferred<{
      modsPath: string
      checkedAtMs: number
      updates: never[]
    }>()
    const secondPending = createDeferred<{
      modsPath: string
      checkedAtMs: number
      updates: never[]
    }>()
    invokeCommand.mockReturnValueOnce(firstPending.promise).mockReturnValueOnce(secondPending.promise)
    const listener = vi.fn()

    const unsubscribe = launcherDesktop.subscribeLauncherUpdates('C:\\Games\\Stardew Valley\\Mods', listener)
    await Promise.resolve()

    const firstCheck = launcherDesktop.checkLauncherUpdates({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      forceRefresh: false,
    })
    const secondCheck = launcherDesktop.checkLauncherUpdates({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      forceRefresh: true,
    })
    const firstRequest = invokeCommand.mock.calls[0]?.[1] as { request: { sessionId: string } }
    const secondRequest = invokeCommand.mock.calls[1]?.[1] as { request: { sessionId: string } }

    eventListeners.get(LAUNCHER_UPDATE_PROGRESS_EVENT)?.({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      sessionId: firstRequest.request.sessionId,
      checked: 1,
      total: 2,
      currentModName: 'Old Session',
      updates: [],
    })

    expect(listener).not.toHaveBeenCalled()

    eventListeners.get(LAUNCHER_UPDATE_PROGRESS_EVENT)?.({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      sessionId: secondRequest.request.sessionId,
      checked: 1,
      total: 2,
      currentModName: 'Current Session',
      updates: [
        {
          modId: 202,
          name: 'Current Session',
          currentVersion: '2.0.0',
          latestVersion: '2.1.0',
          absolutePath: 'C:\\Games\\Stardew Valley\\Mods\\Current Session',
          modUrl: 'https://www.nexusmods.com/stardewvalley/mods/202',
          imageUrl: null,
        },
      ],
    })

    expect(listener).toHaveBeenCalledWith({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 0,
      isComplete: false,
      updates: [
        {
          modId: 202,
          name: 'Current Session',
          currentVersion: '2.0.0',
          latestVersion: '2.1.0',
          absolutePath: 'C:\\Games\\Stardew Valley\\Mods\\Current Session',
          modUrl: 'https://www.nexusmods.com/stardewvalley/mods/202',
          imageUrl: null,
        },
      ],
    })

    secondPending.resolve({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 222,
      updates: [],
    })
    firstPending.resolve({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 111,
      updates: [],
    })
    await expect(secondCheck).resolves.toEqual({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 222,
      updates: [],
    })
    await expect(firstCheck).resolves.toEqual({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 111,
      updates: [],
    })

    unsubscribe()
  })

  it('filters stale launcher progress events for direct progress listeners', async () => {
    const { launcherDesktop, eventListeners, invokeCommand } = await loadConfiguredLauncherDesktop()
    const firstPending = createDeferred<{
      modsPath: string
      checkedAtMs: number
      updates: never[]
    }>()
    const secondPending = createDeferred<{
      modsPath: string
      checkedAtMs: number
      updates: never[]
    }>()
    invokeCommand.mockReturnValueOnce(firstPending.promise).mockReturnValueOnce(secondPending.promise)

    const firstCheck = launcherDesktop.checkLauncherUpdates({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      forceRefresh: false,
    })
    const secondCheck = launcherDesktop.checkLauncherUpdates({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      forceRefresh: true,
    })
    const firstRequest = invokeCommand.mock.calls[0]?.[1] as { request: { sessionId: string } }
    const secondRequest = invokeCommand.mock.calls[1]?.[1] as { request: { sessionId: string } }
    const listener = vi.fn()
    const unlisten = await launcherDesktop.listenToLauncherUpdateProgress(listener)

    eventListeners.get(LAUNCHER_UPDATE_PROGRESS_EVENT)?.({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      sessionId: firstRequest.request.sessionId,
      checked: 1,
      total: 2,
      currentModName: 'Old Session',
      updates: [],
    })

    expect(listener).not.toHaveBeenCalled()

    const currentPayload = {
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      sessionId: secondRequest.request.sessionId,
      checked: 2,
      total: 2,
      currentModName: 'Current Session',
      updates: [],
    }
    eventListeners.get(LAUNCHER_UPDATE_PROGRESS_EVENT)?.(currentPayload)

    expect(listener).toHaveBeenCalledWith(currentPayload)

    secondPending.resolve({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 222,
      updates: [],
    })
    firstPending.resolve({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 111,
      updates: [],
    })
    await expect(secondCheck).resolves.toEqual({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 222,
      updates: [],
    })
    await expect(firstCheck).resolves.toEqual({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 111,
      updates: [],
    })

    unlisten()
  })

  it('invalidates launcher cover and scan caches when clearing launcher image cache', async () => {
    const { launcherDesktop, invokeCommand } = await loadConfiguredLauncherDesktop()
    const firstCovers = { covers: [{ labelKey: '20599', imagePath: 'C:\\cache\\cover-1.webp' }] }
    const firstFailures = { entries: [{ modKey: '20599', failureCount: 3, blocked: true, lastError: 'HTTP 404', lastFailedAtMs: 1 }] }
    const firstScan = { modsPath: 'C:\\Games\\Stardew Valley\\Mods', mods: [{ id: 'mod-20599' }] }
    const secondCovers = { covers: [] }
    const secondFailures = { entries: [] }
    const secondScan = { modsPath: 'C:\\Games\\Stardew Valley\\Mods', mods: [] }
    invokeCommand
      .mockResolvedValueOnce(firstCovers)
      .mockResolvedValueOnce(firstFailures)
      .mockResolvedValueOnce(firstScan)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(secondCovers)
      .mockResolvedValueOnce(secondFailures)
      .mockResolvedValueOnce(secondScan)

    await expect(launcherDesktop.loadLauncherLibraryCovers()).resolves.toEqual(firstCovers)
    await expect(launcherDesktop.loadLauncherImageFailures()).resolves.toEqual(firstFailures)
    await expect(launcherDesktop.scanLauncherLibrary({ modsPath: 'C:\\Games\\Stardew Valley\\Mods' })).resolves.toEqual(firstScan)
    await expect(launcherDesktop.clearLauncherImageCache()).resolves.toBeUndefined()
    await expect(launcherDesktop.loadLauncherLibraryCovers()).resolves.toEqual(secondCovers)
    await expect(launcherDesktop.loadLauncherImageFailures()).resolves.toEqual(secondFailures)
    await expect(launcherDesktop.scanLauncherLibrary({ modsPath: 'C:\\Games\\Stardew Valley\\Mods' })).resolves.toEqual(secondScan)

    expect(invokeCommand).toHaveBeenNthCalledWith(1, 'load_launcher_library_covers', undefined)
    expect(invokeCommand).toHaveBeenNthCalledWith(2, 'load_launcher_image_failures', undefined)
    expect(invokeCommand).toHaveBeenNthCalledWith(3, 'scan_launcher_library', {
      request: { modsPath: 'C:\\Games\\Stardew Valley\\Mods' },
    })
    expect(invokeCommand).toHaveBeenNthCalledWith(4, 'clear_launcher_image_cache', undefined)
    expect(invokeCommand).toHaveBeenNthCalledWith(5, 'load_launcher_library_covers', undefined)
    expect(invokeCommand).toHaveBeenNthCalledWith(6, 'load_launcher_image_failures', undefined)
    expect(invokeCommand).toHaveBeenNthCalledWith(7, 'scan_launcher_library', {
      request: { modsPath: 'C:\\Games\\Stardew Valley\\Mods' },
    })
  })

  it('passes launcher image mod keys through to the host command', async () => {
    const { launcherDesktop, invokeCommand } = await loadConfiguredLauncherDesktop()
    const result = {
      sourceUrl: 'https://example.test/cover.png',
      localPath: 'C:\\cache\\cover.png',
      mimeType: 'image/png',
    }
    invokeCommand.mockResolvedValueOnce(result)

    await expect(
      launcherDesktop.resolveLauncherImage({
        url: 'https://example.test/cover.png',
        refresh: true,
        modKey: '20599',
      }),
    ).resolves.toEqual(result)

    expect(invokeCommand).toHaveBeenCalledWith('resolve_launcher_image', {
      request: {
        url: 'https://example.test/cover.png',
        refresh: true,
        modKey: '20599',
      },
    })
  })

  it('short-circuits remote detail requests after Nexus marks a mod unavailable', async () => {
    const { launcherDesktop, invokeCommand } = await loadConfiguredLauncherDesktop()
    invokeCommand.mockResolvedValueOnce({
      modId: 23651,
      title: 'Nexus #23651',
      unavailable: true,
      unavailableReason: 'Nexus mod unavailable: mod_id=Some(23651), status=Some("hidden"), available=Some(false)',
      summary: null,
      author: null,
      version: null,
      modUrl: 'https://www.nexusmods.com/stardewvalley/mods/23651',
      imageUrl: null,
      galleryImages: [],
    })

    await expect(launcherDesktop.loadLauncherRemoteModDetail({ modId: 23651 })).rejects.toThrow('Nexus mod 23651 is unavailable.')
    await expect(launcherDesktop.loadLauncherRemoteModDetail({ modId: 23651, includeFiles: false })).rejects.toThrow(
      'Nexus mod 23651 is unavailable.',
    )

    expect(launcherDesktop.isLauncherRemoteModIdInvalid(23651)).toBe(true)
    expect(invokeCommand).toHaveBeenCalledTimes(1)
    expect(invokeCommand).toHaveBeenCalledWith('load_launcher_remote_mod_detail', {
      request: { modId: 23651 },
    })
  })

  it('uses the cached launcher image host command for local-first cover resolution', async () => {
    const { launcherDesktop, invokeCommand } = await loadConfiguredLauncherDesktop()
    const result = {
      sourceUrl: 'https://example.test/cover.png',
      localPath: 'C:\\cache\\cover.png',
      mimeType: 'image/png',
    }
    invokeCommand.mockResolvedValueOnce(result)

    await expect(
      launcherDesktop.resolveCachedLauncherImage({
        url: 'https://example.test/cover.png',
        refresh: false,
        modKey: '20599',
      }),
    ).resolves.toEqual(result)

    expect(invokeCommand).toHaveBeenCalledWith('resolve_cached_launcher_image', {
      request: {
        url: 'https://example.test/cover.png',
        refresh: false,
        modKey: '20599',
      },
    })
  })
})
