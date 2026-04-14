import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadCachedLauncherUpdates,
  subscribeLauncherUpdates,
  type LauncherSettings,
  type LauncherUpdateSummary,
  type LauncherUpdatesResult,
} from '../desktop'
import { useLauncherUpdatesBadgeCount } from './useLauncherUpdatesBadgeCount'

vi.mock('../desktop', async () => {
  const actual = await vi.importActual<typeof import('../desktop')>('../desktop')
  return {
    ...actual,
    loadCachedLauncherUpdates: vi.fn(),
    subscribeLauncherUpdates: vi.fn(),
  }
})

const loadCachedLauncherUpdatesMock = vi.mocked(loadCachedLauncherUpdates)
const subscribeLauncherUpdatesMock = vi.mocked(subscribeLauncherUpdates)

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

function createSettings(overrides: Partial<LauncherSettings> = {}): LauncherSettings {
  return {
    gamePath: null,
    modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    downloadPath: null,
    nexusApiKey: null,
    nexusCookie: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
    autoCheckModUpdates: true,
    ...overrides,
  }
}

function createUpdate(index: number): LauncherUpdateSummary {
  return {
    modId: 100 + index,
    name: `Update ${index}`,
    currentVersion: '1.0.0',
    latestVersion: '1.1.0',
    absolutePath: `E:\\Games\\Stardew Valley\\Mods\\Update ${index}`,
    modUrl: `https://www.nexusmods.com/stardewvalley/mods/${100 + index}`,
    imageUrl: null,
    author: null,
    updatedAt: null,
    fileSize: null,
  }
}

function createResult(count: number): LauncherUpdatesResult {
  return {
    modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    checkedAtMs: 123,
    updates: Array.from({ length: count }, (_, index) => createUpdate(index + 1)),
  }
}

describe('useLauncherUpdatesBadgeCount', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('loads the cached updates count and subscribes to future updates', async () => {
    let subscriptionListener: ((result: LauncherUpdatesResult) => void) | null = null
    loadCachedLauncherUpdatesMock.mockResolvedValue(createResult(2))
    subscribeLauncherUpdatesMock.mockImplementation((_modsPath, listener) => {
      subscriptionListener = listener
      return () => {}
    })

    const { result } = renderHook(() => useLauncherUpdatesBadgeCount(createSettings()))

    await waitFor(() => {
      expect(result.current).toBe(2)
    })

    await act(async () => {
      subscriptionListener?.(createResult(5))
    })

    expect(result.current).toBe(5)
    expect(loadCachedLauncherUpdatesMock).toHaveBeenCalledWith({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    })
    expect(subscribeLauncherUpdatesMock).toHaveBeenCalledWith(
      'E:\\Games\\Stardew Valley\\Mods',
      expect.any(Function),
    )
  })

  it('does not let a slower cached response overwrite a live replayed snapshot', async () => {
    const deferred = createDeferred<LauncherUpdatesResult | null>()
    loadCachedLauncherUpdatesMock.mockReturnValue(deferred.promise)
    subscribeLauncherUpdatesMock.mockImplementation((_modsPath, listener) => {
      listener(createResult(4))
      return () => {}
    })

    const { result } = renderHook(() => useLauncherUpdatesBadgeCount(createSettings()))

    await waitFor(() => {
      expect(result.current).toBe(4)
    })

    await act(async () => {
      deferred.resolve(createResult(1))
      await deferred.promise
    })

    expect(result.current).toBe(4)
  })

  it('returns zero and skips loading when no mods path is configured', () => {
    const { result } = renderHook(() => useLauncherUpdatesBadgeCount(createSettings({ modsPath: null })))

    expect(result.current).toBe(0)
    expect(loadCachedLauncherUpdatesMock).not.toHaveBeenCalled()
    expect(subscribeLauncherUpdatesMock).not.toHaveBeenCalled()
  })
})
