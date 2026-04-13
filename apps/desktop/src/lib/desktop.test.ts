import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'

const eventListeners = new Map<string, (event: { payload: unknown }) => void>()

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

const mockWindow = {
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  isFullscreen: vi.fn(),
  setFullscreen: vi.fn(),
}

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (eventName: string, callback: (event: { payload: unknown }) => void) => {
    eventListeners.set(eventName, callback)
    return () => {
      eventListeners.delete(eventName)
    }
  }),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => mockWindow),
}))

describe('desktop window helpers', () => {
  beforeEach(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    mockWindow.isFullscreen.mockReset()
    mockWindow.setFullscreen.mockReset()
  })

  it('reads the current fullscreen state from the desktop host', async () => {
    const { isCurrentWindowFullscreen } = await import('./desktop')
    mockWindow.isFullscreen.mockResolvedValueOnce(true)

    await expect(isCurrentWindowFullscreen()).resolves.toBe(true)
    expect(mockWindow.isFullscreen).toHaveBeenCalledTimes(1)
  })

  it('toggles fullscreen based on the current state', async () => {
    const { toggleFullscreenCurrentWindow } = await import('./desktop')
    mockWindow.isFullscreen.mockResolvedValueOnce(false)
    mockWindow.setFullscreen.mockResolvedValueOnce(undefined)

    await toggleFullscreenCurrentWindow()

    expect(mockWindow.isFullscreen).toHaveBeenCalledTimes(1)
    expect(mockWindow.setFullscreen).toHaveBeenCalledWith(true)
  })
})

describe('launcher bridge helpers', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    eventListeners.clear()
    vi.resetModules()
    vi.mocked(invoke).mockReset()
  })

  it('loads launcher settings from tauri backend', async () => {
    const expected = {
      gamePath: 'C:\\Games\\Stardew Valley',
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
    }
    vi.mocked(invoke).mockResolvedValueOnce(expected)
    const { loadLauncherSettings } = await import('./desktop')

    await expect(loadLauncherSettings()).resolves.toEqual(expected)
    expect(invoke).toHaveBeenCalledWith('load_launcher_settings', undefined)
  })

  it('loads launcher Nexus diagnostics from the tauri backend', async () => {
    const expected = {
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api-router.nexusmods.com/graphql',
          status: 'loading',
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Attempt 1 of 3 is in progress.',
        },
      ],
    }
    vi.mocked(invoke).mockResolvedValueOnce(expected)
    const { loadLauncherNexusDiagnostics } = await import('./desktop')

    await expect(loadLauncherNexusDiagnostics()).resolves.toEqual(expected)
    expect(invoke).toHaveBeenCalledWith('load_launcher_nexus_diagnostics', undefined)
  })

  it('loads app ui state from the tauri backend', async () => {
    const expected = {
      version: 1,
      shell: {
        appMode: 'launcher',
        launcherPage: 'library',
        debugEnabled: false,
        notificationSoundEnabled: true,
      },
      appearance: {
        locale: 'zh-CN',
        accentPresetId: 'indigo',
        recentGameDirectories: [],
        playerAppearance: {
          profiles: [],
          activeProfileId: null,
        },
      },
      workspace: {
        layouts: {},
      },
      launcher: {
        discoverToolbar: {
          sort: 'newest',
          ascending: false,
          timeRange: 'all',
          pageSize: 20,
          filtersHidden: false,
        },
        forceOffline: false,
      },
    }
    vi.mocked(invoke).mockResolvedValueOnce(expected)
    const { loadAppUiState } = await import('./desktop')

    await expect(loadAppUiState()).resolves.toEqual(expected)
    expect(invoke).toHaveBeenCalledWith('load_app_ui_state', undefined)
  })

  it('patches app ui state through the tauri backend', async () => {
    const expected = {
      version: 1,
      shell: {
        appMode: 'workbench',
        launcherPage: 'library',
        debugEnabled: true,
        notificationSoundEnabled: false,
      },
      appearance: {
        locale: 'en-US',
        accentPresetId: 'cyan',
        recentGameDirectories: [],
        playerAppearance: {
          profiles: [],
          activeProfileId: null,
        },
      },
      workspace: {
        layouts: {},
      },
      launcher: {
        discoverToolbar: {
          sort: 'downloads',
          ascending: true,
          timeRange: 'month',
          pageSize: 40,
          filtersHidden: true,
        },
        forceOffline: false,
      },
    }
    vi.mocked(invoke).mockResolvedValueOnce(expected)
    const { patchAppUiState } = await import('./desktop')

    await expect(
      patchAppUiState({
        shell: expected.shell,
      }),
    ).resolves.toEqual(expected)
    expect(invoke).toHaveBeenCalledWith('patch_app_ui_state', {
      request: {
        shell: expected.shell,
      },
    })
  })

  it('sets launcher Nexus force-offline through the tauri backend', async () => {
    const expected = {
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api-router.nexusmods.com/graphql',
          status: 'warning',
          attempts: 3,
          maxAttempts: 3,
          available: false,
          message: 'Forced offline by debug override.',
        },
      ],
    }
    vi.mocked(invoke).mockResolvedValueOnce(expected)
    const { setLauncherNexusForceOffline } = await import('./desktop')

    await expect(setLauncherNexusForceOffline(true)).resolves.toEqual(expected)
    expect(invoke).toHaveBeenCalledWith('set_launcher_nexus_force_offline', {
      forceOffline: true,
    })
  })

  it('reloads launcher library state on repeated requests', async () => {
    const firstState = {
      storageFolders: [{ id: 'unsorted', name: 'Unsorted', modKeys: [] }],
      hiddenModKeys: [],
      packPresets: [],
      currentPackId: null,
      scopeMode: 'all',
    }
    const secondState = {
      storageFolders: [{ id: 'unsorted', name: 'Unsorted', modKeys: ['ModForge.NPCAdventures'] }],
      hiddenModKeys: [],
      packPresets: [],
      currentPackId: null,
      scopeMode: 'all',
    }
    vi.mocked(invoke).mockResolvedValueOnce(firstState).mockResolvedValueOnce(secondState)
    const { loadLauncherLibraryState } = await import('./desktop')

    await expect(loadLauncherLibraryState()).resolves.toEqual(firstState)
    await expect(loadLauncherLibraryState()).resolves.toEqual(secondState)

    expect(invoke).toHaveBeenNthCalledWith(1, 'load_launcher_library_state', undefined)
    expect(invoke).toHaveBeenNthCalledWith(2, 'load_launcher_library_state', undefined)
  })

  it('reloads launcher library covers on repeated requests', async () => {
    const firstCovers = {
      covers: [],
    }
    const secondCovers = {
      covers: [{ labelKey: '20599', imagePath: 'C:\\cache\\cover-20599.webp' }],
    }
    vi.mocked(invoke).mockResolvedValueOnce(firstCovers).mockResolvedValueOnce(secondCovers)
    const { loadLauncherLibraryCovers } = await import('./desktop')

    await expect(loadLauncherLibraryCovers()).resolves.toEqual(firstCovers)
    await expect(loadLauncherLibraryCovers()).resolves.toEqual(secondCovers)

    expect(invoke).toHaveBeenNthCalledWith(1, 'load_launcher_library_covers', undefined)
    expect(invoke).toHaveBeenNthCalledWith(2, 'load_launcher_library_covers', undefined)
  })

  it('clears a stuck launcher library state request before retrying', async () => {
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
    vi.mocked(invoke).mockReturnValueOnce(pendingState.promise).mockResolvedValueOnce(recoveredState)
    const { clearLauncherLibraryReadCaches, loadLauncherLibraryState } = await import('./desktop')

    void loadLauncherLibraryState()
    clearLauncherLibraryReadCaches('C:\\Games\\Stardew Valley\\Mods')

    await expect(loadLauncherLibraryState()).resolves.toEqual(recoveredState)

    pendingState.resolve(recoveredState)
    expect(invoke).toHaveBeenNthCalledWith(1, 'load_launcher_library_state', undefined)
    expect(invoke).toHaveBeenNthCalledWith(2, 'load_launcher_library_state', undefined)
  })

  it('clears a stuck launcher library covers request before retrying', async () => {
    const pendingCovers = createDeferred<{ covers: { labelKey: string; imagePath: string }[] }>()
    const recoveredCovers = {
      covers: [{ labelKey: '20599', imagePath: 'C:\\cache\\cover-20599.webp' }],
    }
    vi.mocked(invoke).mockReturnValueOnce(pendingCovers.promise).mockResolvedValueOnce(recoveredCovers)
    const { clearLauncherLibraryReadCaches, loadLauncherLibraryCovers } = await import('./desktop')

    void loadLauncherLibraryCovers()
    clearLauncherLibraryReadCaches('C:\\Games\\Stardew Valley\\Mods')

    await expect(loadLauncherLibraryCovers()).resolves.toEqual(recoveredCovers)

    pendingCovers.resolve(recoveredCovers)
    expect(invoke).toHaveBeenNthCalledWith(1, 'load_launcher_library_covers', undefined)
    expect(invoke).toHaveBeenNthCalledWith(2, 'load_launcher_library_covers', undefined)
  })

  it('saves launcher settings and scans launcher library with request payload', async () => {
    const saved = {
      gamePath: 'C:\\Games\\Stardew Valley',
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
    }
    const scan = {
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      mods: [],
    }
    vi.mocked(invoke).mockResolvedValueOnce(saved).mockResolvedValueOnce(scan)
    const { saveLauncherSettings, scanLauncherLibrary } = await import('./desktop')

    await expect(saveLauncherSettings(saved)).resolves.toEqual(saved)
    await expect(scanLauncherLibrary({ modsPath: saved.modsPath })).resolves.toEqual(scan)
    expect(invoke).toHaveBeenNthCalledWith(1, 'save_launcher_settings', {
      request: saved,
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'scan_launcher_library', {
      request: { modsPath: saved.modsPath },
    })
  })

  it('launches the game through the launcher bridge', async () => {
    const launched = {
      executablePath: 'C:\\Games\\Stardew Valley\\StardewModdingAPI.exe',
      target: 'smapi',
    }
    vi.mocked(invoke).mockResolvedValueOnce(launched)
    const { launchLauncherGame } = await import('./desktop')

    await expect(launchLauncherGame()).resolves.toEqual(launched)
    expect(invoke).toHaveBeenCalledWith('launch_launcher_game', undefined)
  })

  it('bypasses a pending launcher update request when force refresh is set', async () => {
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
    vi.mocked(invoke).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(refreshed)
    const { checkLauncherUpdates } = await import('./desktop')

    void checkLauncherUpdates({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      forceRefresh: false,
    })

    await expect(
      checkLauncherUpdates({
        modsPath: 'C:\\Games\\Stardew Valley\\Mods',
        forceRefresh: true,
      }),
    ).resolves.toEqual(refreshed)

    expect(invoke).toHaveBeenNthCalledWith(1, 'check_launcher_updates', {
      request: {
        modsPath: 'C:\\Games\\Stardew Valley\\Mods',
        forceRefresh: false,
        sessionId: expect.any(String),
      },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'check_launcher_updates', {
      request: {
        modsPath: 'C:\\Games\\Stardew Valley\\Mods',
        forceRefresh: true,
        sessionId: expect.any(String),
      },
    })

    pending.resolve(refreshed)
  })

  it('reuses a pending launcher update request for repeated non-forced calls', async () => {
    const pending = createDeferred<{
      modsPath: string
      checkedAtMs: number
      updates: never[]
    }>()
    vi.mocked(invoke).mockReturnValueOnce(pending.promise)
    const { checkLauncherUpdates } = await import('./desktop')

    const first = checkLauncherUpdates({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      forceRefresh: false,
    })
    const second = checkLauncherUpdates({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      forceRefresh: false,
    })

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)

    pending.resolve({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 789,
      updates: [],
    })
    await expect(first).resolves.toEqual({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 789,
      updates: [],
    })
  })

  it('loads cached launcher updates before checking again', async () => {
    const cached = {
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 123,
      updates: [],
    }
    vi.mocked(invoke).mockResolvedValueOnce(cached)
    const { loadCachedLauncherUpdates } = await import('./desktop')

    await expect(loadCachedLauncherUpdates({ modsPath: 'C:\\Games\\Stardew Valley\\Mods' })).resolves.toEqual(cached)
    expect(invoke).toHaveBeenCalledWith('load_cached_launcher_updates', {
      request: { modsPath: 'C:\\Games\\Stardew Valley\\Mods' },
    })
  })

  it('does not memoize incomplete cached launcher updates as fresh final snapshots', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-12T00:00:00Z'))

    const partialCached = {
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: Date.now(),
      isComplete: false,
      updates: [],
    }

    vi.mocked(invoke).mockResolvedValueOnce(partialCached).mockResolvedValueOnce(partialCached)
    const { loadCachedLauncherUpdates } = await import('./desktop')

    await expect(loadCachedLauncherUpdates({ modsPath: 'C:\\Games\\Stardew Valley\\Mods' })).resolves.toEqual(
      partialCached,
    )
    await expect(loadCachedLauncherUpdates({ modsPath: 'C:\\Games\\Stardew Valley\\Mods' })).resolves.toEqual(
      partialCached,
    )

    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('keeps successful launcher update snapshots fresh for thirty minutes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-12T00:00:00Z'))

    const cached = {
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: Date.now(),
      updates: [],
    }

    vi.mocked(invoke).mockResolvedValueOnce(cached)
    const { checkLauncherUpdates, loadCachedLauncherUpdates } = await import('./desktop')

    await expect(
      checkLauncherUpdates({
        modsPath: 'C:\\Games\\Stardew Valley\\Mods',
        forceRefresh: true,
      }),
    ).resolves.toEqual(cached)

    vi.mocked(invoke).mockReset()
    vi.setSystemTime(new Date('2026-04-12T00:29:59Z'))

    await expect(
      loadCachedLauncherUpdates({
        modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      }),
    ).resolves.toEqual(cached)
    expect(invoke).not.toHaveBeenCalled()

    vi.mocked(invoke).mockResolvedValueOnce(null)
    vi.setSystemTime(new Date('2026-04-12T00:30:01Z'))

    await expect(
      loadCachedLauncherUpdates({
        modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      }),
    ).resolves.toBeNull()
    expect(invoke).toHaveBeenCalledWith('load_cached_launcher_updates', {
      request: { modsPath: 'C:\\Games\\Stardew Valley\\Mods' },
    })
  })

  it('publishes partial launcher updates from progress events to subscribers', async () => {
    const pending = createDeferred<{
      modsPath: string
      checkedAtMs: number
      updates: never[]
    }>()
    vi.mocked(invoke).mockReturnValueOnce(pending.promise)
    const { checkLauncherUpdates, subscribeLauncherUpdates } = await import('./desktop')
    const listener = vi.fn()

    const unsubscribe = subscribeLauncherUpdates('C:\\Games\\Stardew Valley\\Mods', listener)
    await Promise.resolve()
    const checkPromise = checkLauncherUpdates({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      forceRefresh: false,
    })
    const firstRequest = vi.mocked(invoke).mock.calls[0]?.[1] as { request: { sessionId: string } }

    eventListeners.get('launcher://update-check-progress')?.({
      payload: {
        modsPath: 'C:\\Games\\Stardew Valley\\Mods',
        sessionId: firstRequest.request.sessionId,
        checked: 3,
        total: 10,
        currentModName: 'NPC Adventures',
        updates: [
          {
            modId: 101,
            name: 'NPC Adventures',
            currentVersion: '1.0.0',
            latestVersion: '1.2.0',
            absolutePath: 'C:\\Games\\Stardew Valley\\Mods\\NPC Adventures',
            modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
            imageUrl: null,
          },
        ],
      },
    })

    expect(listener).toHaveBeenCalledWith({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 0,
      isComplete: false,
      updates: [
        {
          modId: 101,
          name: 'NPC Adventures',
          currentVersion: '1.0.0',
          latestVersion: '1.2.0',
          absolutePath: 'C:\\Games\\Stardew Valley\\Mods\\NPC Adventures',
          modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
          imageUrl: null,
        },
      ],
    })

    pending.resolve({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 123,
      updates: [],
    })
    await expect(checkPromise).resolves.toEqual({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 123,
      updates: [],
    })

    unsubscribe()
  })

  it('does not replay stale partial launcher updates to new subscribers after a failed session', async () => {
    const pending = createDeferred<{
      modsPath: string
      checkedAtMs: number
      updates: never[]
    }>()
    vi.mocked(invoke).mockReturnValueOnce(pending.promise)
    const { checkLauncherUpdates, subscribeLauncherUpdates } = await import('./desktop')
    const firstListener = vi.fn()

    const unsubscribeFirst = subscribeLauncherUpdates('C:\\Games\\Stardew Valley\\Mods', firstListener)
    await Promise.resolve()

    const checkPromise = checkLauncherUpdates({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      forceRefresh: false,
    })
    const firstRequest = vi.mocked(invoke).mock.calls[0]?.[1] as { request: { sessionId: string } }
    const sessionId = firstRequest.request.sessionId

    eventListeners.get('launcher://update-check-progress')?.({
      payload: {
        modsPath: 'C:\\Games\\Stardew Valley\\Mods',
        sessionId,
        checked: 1,
        total: 2,
        currentModName: 'NPC Adventures',
        updates: [
          {
            modId: 101,
            name: 'NPC Adventures',
            currentVersion: '1.0.0',
            latestVersion: '1.2.0',
            absolutePath: 'C:\\Games\\Stardew Valley\\Mods\\NPC Adventures',
            modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
            imageUrl: null,
          },
        ],
      },
    })

    expect(firstListener).toHaveBeenCalledTimes(1)

    pending.reject(new Error('Network timeout'))
    await expect(checkPromise).rejects.toThrow('Network timeout')

    unsubscribeFirst()

    const secondListener = vi.fn()
    subscribeLauncherUpdates('C:\\Games\\Stardew Valley\\Mods', secondListener)

    expect(secondListener).not.toHaveBeenCalled()
  })

  it('ignores stale progress events from superseded launcher update sessions', async () => {
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
    vi.mocked(invoke).mockReturnValueOnce(firstPending.promise).mockReturnValueOnce(secondPending.promise)
    const { checkLauncherUpdates, subscribeLauncherUpdates } = await import('./desktop')
    const listener = vi.fn()

    const unsubscribe = subscribeLauncherUpdates('C:\\Games\\Stardew Valley\\Mods', listener)
    await Promise.resolve()

    const firstCheck = checkLauncherUpdates({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      forceRefresh: false,
    })
    const secondCheck = checkLauncherUpdates({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      forceRefresh: true,
    })
    const firstRequest = vi.mocked(invoke).mock.calls[0]?.[1] as { request: { sessionId: string } }
    const secondRequest = vi.mocked(invoke).mock.calls[1]?.[1] as { request: { sessionId: string } }

    eventListeners.get('launcher://update-check-progress')?.({
      payload: {
        modsPath: 'C:\\Games\\Stardew Valley\\Mods',
        sessionId: firstRequest.request.sessionId,
        checked: 1,
        total: 2,
        currentModName: 'Old Session',
        updates: [
          {
            modId: 101,
            name: 'Old Session',
            currentVersion: '1.0.0',
            latestVersion: '1.1.0',
            absolutePath: 'C:\\Games\\Stardew Valley\\Mods\\Old Session',
            modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
            imageUrl: null,
          },
        ],
      },
    })

    expect(listener).not.toHaveBeenCalled()

    eventListeners.get('launcher://update-check-progress')?.({
      payload: {
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
      },
    })

    expect(listener).toHaveBeenCalledTimes(1)
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

  it('does not forward stale progress events to launcher progress listeners', async () => {
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
    vi.mocked(invoke).mockReturnValueOnce(firstPending.promise).mockReturnValueOnce(secondPending.promise)
    const { checkLauncherUpdates, listenToLauncherUpdateProgress } = await import('./desktop')

    const firstCheck = checkLauncherUpdates({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      forceRefresh: false,
    })
    const secondCheck = checkLauncherUpdates({
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      forceRefresh: true,
    })
    const firstRequest = vi.mocked(invoke).mock.calls[0]?.[1] as { request: { sessionId: string } }
    const secondRequest = vi.mocked(invoke).mock.calls[1]?.[1] as { request: { sessionId: string } }
    const listener = vi.fn()
    const unlisten = await listenToLauncherUpdateProgress(listener)

    eventListeners.get('launcher://update-check-progress')?.({
      payload: {
        modsPath: 'C:\\Games\\Stardew Valley\\Mods',
        sessionId: firstRequest.request.sessionId,
        checked: 1,
        total: 2,
        currentModName: 'Old Session',
        updates: [],
      },
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
    eventListeners.get('launcher://update-check-progress')?.({
      payload: currentPayload,
    })

    expect(listener).toHaveBeenCalledTimes(1)
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

  it('clears launcher image cache and invalidates launcher cover and scan caches', async () => {
    const firstCovers = { covers: [{ labelKey: '20599', imagePath: 'C:\\cache\\cover-1.webp' }] }
    const firstScan = { modsPath: 'C:\\Games\\Stardew Valley\\Mods', mods: [{ id: 'mod-20599' }] }
    const secondCovers = { covers: [] }
    const secondScan = { modsPath: 'C:\\Games\\Stardew Valley\\Mods', mods: [] }
    vi.mocked(invoke)
      .mockResolvedValueOnce(firstCovers)
      .mockResolvedValueOnce(firstScan)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(secondCovers)
      .mockResolvedValueOnce(secondScan)
    const { clearLauncherImageCache, loadLauncherLibraryCovers, scanLauncherLibrary } = await import('./desktop')

    await expect(loadLauncherLibraryCovers()).resolves.toEqual(firstCovers)
    await expect(scanLauncherLibrary({ modsPath: 'C:\\Games\\Stardew Valley\\Mods' })).resolves.toEqual(firstScan)
    await expect(clearLauncherImageCache()).resolves.toBeUndefined()
    await expect(loadLauncherLibraryCovers()).resolves.toEqual(secondCovers)
    await expect(scanLauncherLibrary({ modsPath: 'C:\\Games\\Stardew Valley\\Mods' })).resolves.toEqual(secondScan)

    expect(invoke).toHaveBeenNthCalledWith(1, 'load_launcher_library_covers', undefined)
    expect(invoke).toHaveBeenNthCalledWith(2, 'scan_launcher_library', {
      request: { modsPath: 'C:\\Games\\Stardew Valley\\Mods' },
    })
    expect(invoke).toHaveBeenNthCalledWith(3, 'clear_launcher_image_cache', undefined)
    expect(invoke).toHaveBeenNthCalledWith(4, 'load_launcher_library_covers', undefined)
    expect(invoke).toHaveBeenNthCalledWith(5, 'scan_launcher_library', {
      request: { modsPath: 'C:\\Games\\Stardew Valley\\Mods' },
    })
  })

  it('rescans the launcher library on repeated requests for the same mods path', async () => {
    const firstScan = {
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      mods: [],
    }
    const secondScan = {
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      mods: [{ id: 'mod-20599' }],
    }
    vi.mocked(invoke).mockResolvedValueOnce(firstScan).mockResolvedValueOnce(secondScan)
    const { scanLauncherLibrary } = await import('./desktop')

    await expect(scanLauncherLibrary({ modsPath: 'C:\\Games\\Stardew Valley\\Mods' })).resolves.toEqual(firstScan)
    await expect(scanLauncherLibrary({ modsPath: 'C:\\Games\\Stardew Valley\\Mods' })).resolves.toEqual(secondScan)

    expect(invoke).toHaveBeenNthCalledWith(1, 'scan_launcher_library', {
      request: { modsPath: 'C:\\Games\\Stardew Valley\\Mods' },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'scan_launcher_library', {
      request: { modsPath: 'C:\\Games\\Stardew Valley\\Mods' },
    })
  })

  it('toggles backend debug logging through the desktop bridge', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined)
    const { setDesktopDebugLoggingEnabled } = await import('./desktop')

    await expect(setDesktopDebugLoggingEnabled(true)).resolves.toBeUndefined()
    expect(invoke).toHaveBeenCalledWith('set_debug_logging_enabled', {
      enabled: true,
    })
  })

  it('writes frontend log records through the desktop backend logging bridge', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined)
    const { writeFrontendLog } = await import('./desktop')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await expect(
      writeFrontendLog({
        level: 'warning',
        message: 'Launcher settings save failed',
        keyValues: {
          source: 'launcher-settings',
        },
      }),
    ).resolves.toBeUndefined()

    expect(invoke).toHaveBeenCalledWith('write_frontend_log', {
      request: {
        level: 'warning',
        message: 'Launcher settings save failed',
        file: undefined,
        keyValues: {
          source: 'launcher-settings',
        },
        line: undefined,
      },
    })
    expect(warnSpy).toHaveBeenCalledWith('Launcher settings save failed', {
      source: 'launcher-settings',
    })

    warnSpy.mockRestore()
  })
})
