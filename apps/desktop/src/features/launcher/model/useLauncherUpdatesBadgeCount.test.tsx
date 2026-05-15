import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LauncherSettings, LauncherUpdateSummary, LauncherUpdatesResult } from '@features/launcher/api'
import { useLauncherUpdatesBadgeCount } from './useLauncherUpdatesBadgeCount'
import { LauncherTestWrapper } from '@test/launcherTestWrapper.tsx'
import { createMockLauncherPort } from '@test/launcherTestPort'
import type { LauncherPort } from './launcherPort'

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

function createWrapper(port: LauncherPort) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <LauncherTestWrapper port={port}>{children}</LauncherTestWrapper>
  }
}

describe('useLauncherUpdatesBadgeCount', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('loads the cached updates count and subscribes to future updates', async () => {
    let subscriptionListener: ((result: LauncherUpdatesResult) => void) | null = null
    const port = createMockLauncherPort({
      loadCachedUpdates: vi.fn().mockResolvedValue(createResult(2)),
      subscribeUpdates: vi.fn().mockImplementation((_modsPath, listener) => {
        subscriptionListener = listener
        return () => {}
      }),
    })

    const { result } = renderHook(() => useLauncherUpdatesBadgeCount(createSettings()), { wrapper: createWrapper(port) })
    await waitFor(() => {
      expect(result.current).toBe(2)
    })

    await act(async () => {
      subscriptionListener?.(createResult(5))
    })

    expect(result.current).toBe(5)
    expect(port.loadCachedUpdates).toHaveBeenCalledWith({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    })
    expect(port.subscribeUpdates).toHaveBeenCalledWith('E:\\Games\\Stardew Valley\\Mods', expect.any(Function))
  })

  it('does not let a slower cached response overwrite a live replayed snapshot', async () => {
    const deferred = createDeferred<LauncherUpdatesResult | null>()
    const port = createMockLauncherPort({
      loadCachedUpdates: vi.fn().mockReturnValue(deferred.promise),
      subscribeUpdates: vi.fn().mockImplementation((_modsPath, listener) => {
        listener(createResult(4))
        return () => {}
      }),
    })

    const { result } = renderHook(() => useLauncherUpdatesBadgeCount(createSettings()), { wrapper: createWrapper(port) })
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
    const port = createMockLauncherPort()
    const { result } = renderHook(() => useLauncherUpdatesBadgeCount(createSettings({ modsPath: null })), {
      wrapper: createWrapper(port),
    })
    expect(result.current).toBe(0)
    expect(port.loadCachedUpdates).not.toHaveBeenCalled()
    expect(port.subscribeUpdates).not.toHaveBeenCalled()
  })
})
