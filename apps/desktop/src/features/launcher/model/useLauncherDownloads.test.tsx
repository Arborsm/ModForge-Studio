import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LauncherSettings } from '@platform/desktop'
import { useLauncherDownloads } from '@features/launcher'
import { LauncherTestWrapper } from '@test/launcherTestWrapper.tsx'
import { createMockLauncherPort } from '@test/launcherTestPort'
import type { LauncherPort } from './launcherPort'

function createSettings(overrides: Partial<LauncherSettings> = {}): LauncherSettings {
  return {
    gamePath: 'E:\\Games\\Stardew Valley',
    modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    downloadPath: 'E:\\Downloads\\Mods',
    nexusApiKey: null,
    nexusCookie: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
    autoCheckModUpdates: true,
    ...overrides,
  }
}

function createWrapper(port: LauncherPort) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <LauncherTestWrapper port={port}>{children}</LauncherTestWrapper>
  }
}

describe('useLauncherDownloads', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('loads the persisted launcher queue from desktop storage', async () => {
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockResolvedValue({
      items: [
        {
          id: 'persisted-job',
          modId: 101,
          title: 'NPC Adventures',
          version: '1.0.0',
          imageUrl: null,
          source: 'discover',
          status: 'queued',
          archivePath: null,
          installedTargetPath: null,
          error: null,
          addedAt: 1,
          completedAt: null,
        },
      ],
      }),
      saveDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
    })

    const { result } = renderHook(() => useLauncherDownloads(createSettings()), { wrapper: createWrapper(port) })
    await waitFor(() => {
      expect(result.current.items).toHaveLength(1)
    })
    expect(result.current.items[0]?.id).toBe('persisted-job')
  })

  it('persists queue changes through the desktop bridge instead of browser storage', async () => {
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      saveDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
    })

    const { result } = renderHook(() => useLauncherDownloads(createSettings()), { wrapper: createWrapper(port) })
    await waitFor(() => {
      expect(port.loadDownloadQueue).toHaveBeenCalledTimes(1)
    })

    act(() => {
      result.current.queueDownload({
        modId: 101,
        title: 'NPC Adventures',
        imageUrl: null,
        source: 'discover',
      })
    })

    await waitFor(() => {
      expect(port.saveDownloadQueue).toHaveBeenCalled()
    })
    expect(port.saveDownloadQueue).toHaveBeenLastCalledWith({
      items: [
        expect.objectContaining({
          modId: 101,
          title: 'NPC Adventures',
          source: 'discover',
          status: 'failed',
          error: 'Nexus API key is required to download mods.',
        }),
      ],
    })
  })

  it('simulates a 10 second debug download at 2 MB/s and exposes aggregate progress', async () => {
    vi.useFakeTimers()
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      saveDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
    })

    const { result } = renderHook(() => useLauncherDownloads(createSettings()), { wrapper: createWrapper(port) })
    await act(async () => {
      await Promise.resolve()
    })

    expect(port.loadDownloadQueue).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.startDebugSimulation()
    })

    expect(result.current.activeItems).toHaveLength(1)
    expect(result.current.activeItems[0]).toEqual(
      expect.objectContaining({
        source: 'debug',
        status: 'downloading',
        totalBytes: 20 * 1024 * 1024,
        downloadedBytes: 0,
        bytesPerSecond: 2 * 1024 * 1024,
      }),
    )
    expect(result.current.downloadProgressPercent).toBe(0)

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(result.current.activeItems[0]).toEqual(
      expect.objectContaining({
        downloadedBytes: 10 * 1024 * 1024,
      }),
    )
    expect(result.current.downloadProgressPercent).toBe(50)

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(result.current.activeItems).toHaveLength(0)
    expect(result.current.readyToInstall).toHaveLength(1)

    expect(result.current.readyToInstall[0]).toEqual(
      expect.objectContaining({
        source: 'debug',
        status: 'completed',
        downloadedBytes: 20 * 1024 * 1024,
        archivePath: expect.stringContaining('debug-download'),
      }),
    )
    expect(result.current.downloadProgressPercent).toBeNull()
  })

  it('does not reinstall downloads already auto-installed by the desktop bridge', async () => {
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      saveDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      downloadMod: vi.fn().mockResolvedValue({
      modId: 101,
      title: 'NPC Adventures',
      version: '1.2.0',
      fileName: 'npc-adventures.zip',
      archivePath: 'E:\\Downloads\\Mods\\npc-adventures.zip',
      installed: true,
      installedTargetPath: 'E:\\Games\\Stardew Valley\\Mods\\NPC Adventures',
      }),
      checkUpdates: vi.fn().mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 1,
      updates: [],
      }),
    })

    const { result } = renderHook(() =>
      useLauncherDownloads(
        createSettings({
          nexusApiKey: 'api-key',
          autoInstallDownloads: true,
        }),
      ),
      { wrapper: createWrapper(port) },
    )

    await waitFor(() => {
      expect(port.loadDownloadQueue).toHaveBeenCalledTimes(1)
    })

    act(() => {
      result.current.queueDownload({
        modId: 101,
        title: 'NPC Adventures',
        imageUrl: null,
        version: '1.2.0',
        source: 'updates',
      })
    })

    await waitFor(() => {
      expect(result.current.installedItems).toHaveLength(1)
    })

    expect(port.installArchive).not.toHaveBeenCalled()
    expect(result.current.installedItems[0]).toEqual(
      expect.objectContaining({
        status: 'installed',
        installedTargetPath: 'E:\\Games\\Stardew Valley\\Mods\\NPC Adventures',
      }),
    )
    expect(port.checkUpdates).toHaveBeenCalledWith({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      forceRefresh: false,
    })
  })

  it('marks cookie-only downloads as failed before calling the backend', async () => {
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      saveDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
    })

    const { result } = renderHook(() =>
      useLauncherDownloads(
        createSettings({
          nexusCookie: 'sid=abc123',
        }),
      ),
      { wrapper: createWrapper(port) },
    )

    await waitFor(() => {
      expect(port.loadDownloadQueue).toHaveBeenCalledTimes(1)
    })

    act(() => {
      result.current.queueDownload({
        modId: 101,
        title: 'NPC Adventures',
        imageUrl: null,
        version: '1.2.0',
        source: 'updates',
      })
    })

    await waitFor(() => {
      expect(result.current.failedItems).toHaveLength(1)
    })

    expect(port.downloadMod).not.toHaveBeenCalled()
    expect(result.current.failedItems[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        error: 'Nexus API key is required to download mods.',
      }),
    )
  })

  it('captures install failures in queue state and preserves the archive for retrying install', async () => {
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockResolvedValue({
      items: [
        {
          id: 'persisted-job',
          modId: 101,
          title: 'NPC Adventures',
          version: '1.2.0',
          imageUrl: null,
          source: 'updates',
          status: 'completed',
          archivePath: 'E:\\Downloads\\Mods\\npc-adventures.zip',
          installedTargetPath: null,
          error: null,
          addedAt: 1,
          completedAt: 2,
        },
      ],
      }),
      saveDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      installArchive: vi.fn().mockRejectedValue(new Error('Archive missing')),
    })

    const { result } = renderHook(() =>
      useLauncherDownloads(
        createSettings({
          nexusApiKey: 'api-key',
        }),
      ),
      { wrapper: createWrapper(port) },
    )

    await waitFor(() => {
      expect(result.current.readyToInstall).toHaveLength(1)
    })

    await act(async () => {
      await result.current.installItem('persisted-job')
    })

    await waitFor(() => {
      expect(result.current.failedItems).toHaveLength(1)
    })

    expect(result.current.failedItems[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        archivePath: 'E:\\Downloads\\Mods\\npc-adventures.zip',
        error: 'Archive missing',
      }),
    )
    expect(port.checkUpdates).not.toHaveBeenCalled()
  })
})
