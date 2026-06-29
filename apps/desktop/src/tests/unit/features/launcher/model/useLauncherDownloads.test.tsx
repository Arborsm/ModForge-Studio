import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import type { LauncherSettings } from '@features/launcher/api'
import { useLauncherDownloads } from '@features/launcher'
import { LocaleProvider } from '@locales/provider'
import { clearNotifications, publishNotification } from '@shared/ui/notifications'
import { LauncherTestWrapper } from '@test/launcherTestWrapper.tsx'
import { createMockLauncherPort } from '@test/launcherTestPort'
import type { LauncherPort } from '@features/launcher/model/launcherPort'
import type { LauncherDownloadQueueItem } from '@features/launcher/model/types'

vi.mock('@shared/ui/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/ui/notifications')>()
  return {
    ...actual,
    publishNotification: vi.fn(actual.publishNotification),
  }
})

const publishNotificationMock = vi.mocked(publishNotification)

function createSettings(overrides: Partial<LauncherSettings> = {}): LauncherSettings {
  return {
    gamePath: 'E:\\Games\\Stardew Valley',
    modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    downloadPath: 'E:\\Downloads\\Mods',
    nexusApiKey: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
    autoCheckModUpdates: true,
    ...overrides,
  }
}

function createWrapper(port: LauncherPort) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <LocaleProvider locale="en-US">
        <LauncherTestWrapper port={port}>{children}</LauncherTestWrapper>
      </LocaleProvider>
    )
  }
}

describe('useLauncherDownloads', () => {
  afterEach(() => {
    vi.clearAllMocks()
    clearNotifications()
    vi.useRealTimers()
  })

  it('loads the persisted launcher queue from desktop storage', async () => {
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'persisted-job',
            modId: 101,
            fileId: null,
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

  it('merges persisted hydration with downloads queued before storage returns', async () => {
    let resolveLoadQueue: (value: { items: LauncherDownloadQueueItem[] }) => void = () => {}
    const loadQueuePromise = new Promise<{ items: LauncherDownloadQueueItem[] }>((resolve) => {
      resolveLoadQueue = resolve
    })
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockReturnValue(loadQueuePromise),
      saveDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
    })

    const { result } = renderHook(() => useLauncherDownloads(createSettings()), { wrapper: createWrapper(port) })

    act(() => {
      result.current.queueDownload({
        modId: 202,
        title: 'Queued During Hydration',
        imageUrl: null,
        source: 'discover',
      })
    })

    expect(result.current.items).toEqual([expect.objectContaining({ modId: 202, title: 'Queued During Hydration' })])

    await act(async () => {
      resolveLoadQueue({
        items: [
          {
            id: 'persisted-job',
            modId: 101,
            fileId: null,
            title: 'Persisted Download',
            version: '1.0.0',
            imageUrl: null,
            source: 'discover',
            status: 'queued',
            archivePath: null,
            installedTargetPath: null,
            error: null,
            addedAt: 1,
            completedAt: null,
            totalBytes: null,
            downloadedBytes: null,
            bytesPerSecond: null,
          },
        ],
      })
      await loadQueuePromise
    })

    expect(result.current.items).toHaveLength(2)
    expect(result.current.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'persisted-job', modId: 101 }),
        expect.objectContaining({ modId: 202, title: 'Queued During Hydration' }),
      ]),
    )
  })

  it('normalizes stale persisted downloading items back to queued', async () => {
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'stale-download',
            modId: 101,
            fileId: null,
            title: 'NPC Adventures',
            version: '1.0.0',
            imageUrl: null,
            source: 'discover',
            status: 'downloading',
            archivePath: null,
            installedTargetPath: null,
            error: null,
            addedAt: 1,
            completedAt: null,
            totalBytes: 100,
            downloadedBytes: 42,
            bytesPerSecond: 7,
          },
        ],
      }),
      saveDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
    })

    const { result } = renderHook(() => useLauncherDownloads(createSettings()), { wrapper: createWrapper(port) })
    await waitFor(() => {
      expect(result.current.items).toHaveLength(1)
    })

    expect(result.current.items[0]).toEqual(
      expect.objectContaining({
        id: 'stale-download',
        status: 'queued',
        downloadedBytes: null,
        bytesPerSecond: null,
      }),
    )
  })

  it('persists queue changes through the desktop bridge instead of browser storage', async () => {
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
      result.current.queueDownload({
        modId: 101,
        title: 'NPC Adventures',
        imageUrl: null,
        source: 'discover',
      })
    })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    await act(async () => {
      await Promise.resolve()
    })
    expect(port.saveDownloadQueue).toHaveBeenCalled()
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

  it('flushes the pending queue save when the hook unmounts before the debounce fires', async () => {
    vi.useFakeTimers()
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      saveDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
    })

    const { result, unmount } = renderHook(() => useLauncherDownloads(createSettings()), { wrapper: createWrapper(port) })
    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.queueDownload({
        modId: 101,
        title: 'NPC Adventures',
        imageUrl: null,
        source: 'discover',
      })
    })

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(port.saveDownloadQueue).not.toHaveBeenCalled()

    unmount()

    expect(port.saveDownloadQueue).toHaveBeenCalledTimes(1)
    expect(port.saveDownloadQueue).toHaveBeenLastCalledWith({
      items: [expect.objectContaining({ modId: 101, status: 'failed' })],
    })
  })

  it('queues update batches with one state transition and debounced persistence', async () => {
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
      result.current.queueDownloads([
        {
          modId: 101,
          title: 'NPC Adventures',
          imageUrl: null,
          version: '1.2.0',
          source: 'updates',
        },
        {
          modId: 202,
          title: 'Horse Overhaul',
          imageUrl: null,
          version: '3.1.0',
          source: 'updates',
        },
      ])
    })

    expect(result.current.failedItems).toHaveLength(2)
    expect(port.saveDownloadQueue).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(port.saveDownloadQueue).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    await act(async () => {
      await Promise.resolve()
    })
    expect(port.saveDownloadQueue).toHaveBeenCalledTimes(1)
    expect(port.saveDownloadQueue).toHaveBeenLastCalledWith({
      items: [expect.objectContaining({ modId: 101, status: 'failed' }), expect.objectContaining({ modId: 202, status: 'failed' })],
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
        manualDownloadPageOpened: false,
      }),
      checkUpdates: vi.fn().mockResolvedValue({
        modsPath: 'E:\\Games\\Stardew Valley\\Mods',
        checkedAtMs: 1,
        updates: [],
      }),
    })

    const { result } = renderHook(
      () =>
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

  it('passes the selected Nexus file id through to the desktop download request', async () => {
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      saveDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      downloadMod: vi.fn().mockResolvedValue({
        modId: 1915,
        title: 'Content Patcher',
        version: '2.9.1',
        fileName: 'ContentPatcher.zip',
        archivePath: 'E:\\Downloads\\Mods\\ContentPatcher.zip',
        installed: false,
        installedTargetPath: null,
        manualDownloadPageOpened: false,
      }),
    })

    const { result } = renderHook(
      () =>
        useLauncherDownloads(
          createSettings({
            nexusApiKey: 'api-key',
          }),
        ),
      { wrapper: createWrapper(port) },
    )

    await waitFor(() => {
      expect(port.loadDownloadQueue).toHaveBeenCalledTimes(1)
    })

    act(() => {
      result.current.queueDownload({
        modId: 1915,
        fileId: 160463,
        title: 'Content Patcher',
        imageUrl: null,
        version: '2.9.1',
        source: 'updates',
      })
    })

    await waitFor(() => {
      expect(port.downloadMod).toHaveBeenCalled()
    })
    expect(port.downloadMod).toHaveBeenCalledWith(
      expect.objectContaining({
        downloadId: expect.stringContaining('1915:160463:2.9.1'),
        modId: 1915,
        fileId: 160463,
        version: '2.9.1',
        title: 'Content Patcher',
      }),
    )
  })

  it('updates the active download row from backend progress events', async () => {
    let progressListener:
      | ((payload: { downloadId: string; downloadedBytes: number; totalBytes?: number | null; bytesPerSecond?: number | null }) => void)
      | null = null
    const pendingDownload = new Promise<never>(() => {})
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      saveDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      listenToDownloadProgress: vi.fn(async (listener) => {
        progressListener = listener
        return () => {
          progressListener = null
        }
      }),
      downloadMod: vi.fn().mockReturnValue(pendingDownload),
    })

    const { result } = renderHook(
      () =>
        useLauncherDownloads(
          createSettings({
            nexusApiKey: 'api-key',
          }),
        ),
      { wrapper: createWrapper(port) },
    )

    await waitFor(() => {
      expect(port.loadDownloadQueue).toHaveBeenCalledTimes(1)
    })

    act(() => {
      result.current.queueDownload({
        modId: 1915,
        fileId: 160463,
        title: 'Content Patcher',
        imageUrl: null,
        version: '2.9.1',
        source: 'updates',
      })
    })

    await waitFor(() => {
      expect(result.current.activeItems).toHaveLength(1)
    })
    const downloadId = result.current.activeItems[0]?.id ?? ''

    act(() => {
      progressListener?.({
        downloadId,
        downloadedBytes: 512,
        totalBytes: 1024,
        bytesPerSecond: 256,
      })
    })

    expect(result.current.activeItems[0]).toEqual(
      expect.objectContaining({
        downloadedBytes: null,
        totalBytes: null,
        bytesPerSecond: null,
      }),
    )

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 160))
    })

    expect(result.current.activeItems[0]).toEqual(
      expect.objectContaining({
        downloadedBytes: 512,
        totalBytes: 1024,
        bytesPerSecond: 256,
      }),
    )
    expect(result.current.downloadProgressPercent).toBe(50)
  })

  it('cancels active downloads and persists them as resumable queued items when unmounted', async () => {
    const pendingDownload = new Promise<never>(() => {})
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      saveDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      downloadMod: vi.fn().mockReturnValue(pendingDownload),
      cancelDownload: vi.fn().mockResolvedValue(undefined),
    })

    const { result, unmount } = renderHook(
      () =>
        useLauncherDownloads(
          createSettings({
            nexusApiKey: 'api-key',
          }),
        ),
      { wrapper: createWrapper(port) },
    )

    await waitFor(() => {
      expect(port.loadDownloadQueue).toHaveBeenCalledTimes(1)
    })

    act(() => {
      result.current.queueDownload({
        modId: 1915,
        fileId: 160463,
        title: 'Content Patcher',
        imageUrl: null,
        version: '2.9.1',
        source: 'updates',
      })
    })

    await waitFor(() => {
      expect(result.current.activeItems).toHaveLength(1)
    })
    const downloadId = result.current.activeItems[0]?.id ?? ''

    unmount()

    expect(port.cancelDownload).toHaveBeenCalledWith(downloadId)
    expect(port.saveDownloadQueue).toHaveBeenLastCalledWith({
      items: [
        expect.objectContaining({
          id: downloadId,
          status: 'queued',
          downloadedBytes: null,
          bytesPerSecond: null,
        }),
      ],
    })
  })

  it('cancels backend downloads when an active queue item is removed', async () => {
    const pendingDownload = new Promise<never>(() => {})
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      saveDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      downloadMod: vi.fn().mockReturnValue(pendingDownload),
      cancelDownload: vi.fn().mockResolvedValue(undefined),
    })

    const { result } = renderHook(
      () =>
        useLauncherDownloads(
          createSettings({
            nexusApiKey: 'api-key',
          }),
        ),
      { wrapper: createWrapper(port) },
    )

    await waitFor(() => {
      expect(port.loadDownloadQueue).toHaveBeenCalledTimes(1)
    })

    act(() => {
      result.current.queueDownload({
        modId: 1915,
        fileId: 160463,
        title: 'Content Patcher',
        imageUrl: null,
        version: '2.9.1',
        source: 'updates',
      })
    })

    await waitFor(() => {
      expect(result.current.activeItems).toHaveLength(1)
    })
    const downloadId = result.current.activeItems[0]?.id ?? ''

    act(() => {
      result.current.removeItem(downloadId)
    })

    expect(port.cancelDownload).toHaveBeenCalledWith(downloadId)
    expect(result.current.items).toHaveLength(0)
  })

  it('removes manual browser downloads from the queue and publishes one visible info notification', async () => {
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      saveDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      downloadMod: vi.fn().mockResolvedValue({
        modId: 1915,
        title: 'Content Patcher',
        version: '2.9.1',
        fileName: 'ContentPatcher.zip',
        archivePath: '',
        installed: false,
        installedTargetPath: null,
        manualDownloadPageOpened: true,
      }),
    })

    const { result } = renderHook(
      () =>
        useLauncherDownloads(
          createSettings({
            nexusApiKey: 'api-key',
          }),
        ),
      { wrapper: createWrapper(port) },
    )

    await waitFor(() => {
      expect(port.loadDownloadQueue).toHaveBeenCalledTimes(1)
    })

    act(() => {
      result.current.queueDownload({
        modId: 1915,
        fileId: 160463,
        title: 'Content Patcher',
        imageUrl: null,
        version: '2.9.1',
        source: 'updates',
      })
    })

    await waitFor(() => {
      expect(result.current.items).toHaveLength(0)
    })
    expect(result.current.failedItems).toHaveLength(0)
    expect(publishNotificationMock).toHaveBeenCalledTimes(2)
    expect(publishNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'launcher-download-background-queued',
        level: 'info',
        title: 'Download queued',
        summary: 'Content Patcher',
      }),
    )
    expect(publishNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'launcher-manual-download-page-opened',
        level: 'info',
        title: 'Manual download page opened',
      }),
    )

    act(() => {
      result.current.queueDownload({
        modId: 1915,
        fileId: 160463,
        title: 'Content Patcher',
        imageUrl: null,
        version: '2.9.1',
        source: 'updates',
      })
    })

    await waitFor(() => {
      expect(port.downloadMod).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(result.current.items).toHaveLength(0)
    })
    expect(publishNotificationMock).toHaveBeenCalledTimes(3)
  })

  it('keeps processing queued items when a batch falls back to manual browser downloads', async () => {
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      saveDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      downloadMod: vi
        .fn()
        .mockResolvedValueOnce({
          modId: 1915,
          title: 'Content Patcher',
          version: '2.9.1',
          fileName: 'ContentPatcher.zip',
          archivePath: '',
          installed: false,
          installedTargetPath: null,
          manualDownloadPageOpened: true,
        })
        .mockResolvedValueOnce({
          modId: 2400,
          title: 'Lookup Anything',
          version: '1.45.0',
          fileName: 'LookupAnything.zip',
          archivePath: '',
          installed: false,
          installedTargetPath: null,
          manualDownloadPageOpened: true,
        }),
    })

    const { result } = renderHook(
      () =>
        useLauncherDownloads(
          createSettings({
            nexusApiKey: 'api-key',
          }),
        ),
      { wrapper: createWrapper(port) },
    )

    await waitFor(() => {
      expect(port.loadDownloadQueue).toHaveBeenCalledTimes(1)
    })

    act(() => {
      result.current.queueDownloads([
        {
          modId: 1915,
          fileId: 160463,
          title: 'Content Patcher',
          imageUrl: null,
          version: '2.9.1',
          source: 'updates',
        },
        {
          modId: 2400,
          fileId: 170000,
          title: 'Lookup Anything',
          imageUrl: null,
          version: '1.45.0',
          source: 'updates',
        },
      ])
    })

    await waitFor(() => {
      expect(result.current.items).toHaveLength(0)
    })
    expect(port.downloadMod).toHaveBeenCalledTimes(2)
    expect(port.downloadMod).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        modId: 1915,
      }),
    )
    expect(port.downloadMod).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        modId: 2400,
      }),
    )
    expect(publishNotificationMock).toHaveBeenCalledTimes(2)
    expect(publishNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'launcher-download-background-queued',
        summary: '2 downloads queued',
      }),
    )
  })

  it('marks downloads without a Nexus API key as failed before calling the backend', async () => {
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      saveDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
    })

    const { result } = renderHook(() => useLauncherDownloads(createSettings({})), { wrapper: createWrapper(port) })

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

  it('requeues credential failures when a Nexus API key becomes available without restarting', async () => {
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'auth-failed-job',
            modId: 101,
            fileId: null,
            title: 'NPC Adventures',
            version: '1.2.0',
            imageUrl: null,
            source: 'updates',
            status: 'failed',
            archivePath: null,
            installedTargetPath: null,
            error: 'Nexus API key is required to download mods.',
            addedAt: 1,
            completedAt: 2,
          },
        ],
      }),
      saveDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
      downloadMod: vi.fn().mockResolvedValue({
        archivePath: 'E:\\Downloads\\Mods\\npc-adventures.zip',
        installed: false,
        installedTargetPath: null,
        manualDownloadPageOpened: false,
        version: '1.2.0',
      }),
    })

    const { result, rerender } = renderHook(({ settings }) => useLauncherDownloads(settings), {
      wrapper: createWrapper(port),
      initialProps: { settings: createSettings({ nexusApiKey: null }) },
    })

    await waitFor(() => {
      expect(result.current.failedItems).toHaveLength(1)
    })
    expect(port.downloadMod).not.toHaveBeenCalled()

    rerender({ settings: createSettings({ nexusApiKey: 'api-key' }) })

    await waitFor(() => {
      expect(port.downloadMod).toHaveBeenCalledWith(
        expect.objectContaining({
          modId: 101,
          title: 'NPC Adventures',
        }),
      )
    })
    await waitFor(() => {
      expect(result.current.readyToInstall).toHaveLength(1)
    })
  })

  it('marks downloaded archives as installed after the shared archive installer succeeds', async () => {
    const port = createMockLauncherPort({
      loadDownloadQueue: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'persisted-job',
            modId: 101,
            fileId: null,
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
    })

    const { result } = renderHook(
      () =>
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

    act(() => {
      result.current.markArchivesInstalled(['E:\\Downloads\\Mods\\npc-adventures.zip'])
    })

    await waitFor(() => {
      expect(result.current.installedItems).toHaveLength(1)
    })

    expect(result.current.installedItems[0]).toEqual(
      expect.objectContaining({
        status: 'installed',
        archivePath: 'E:\\Downloads\\Mods\\npc-adventures.zip',
        error: null,
      }),
    )
  })
})
