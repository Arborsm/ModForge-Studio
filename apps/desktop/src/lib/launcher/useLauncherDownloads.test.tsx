import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LauncherSettings } from '../desktop'
import { loadLauncherDownloadQueue, saveLauncherDownloadQueue } from '../desktop'
import { useLauncherDownloads } from './useLauncherDownloads'

vi.mock('../desktop', async () => {
  const actual = await vi.importActual<typeof import('../desktop')>('../desktop')
  return {
    ...actual,
    loadLauncherDownloadQueue: vi.fn(),
    saveLauncherDownloadQueue: vi.fn(),
    downloadLauncherMod: vi.fn(),
    installLauncherArchive: vi.fn(),
  }
})

const loadLauncherDownloadQueueMock = vi.mocked(loadLauncherDownloadQueue)
const saveLauncherDownloadQueueMock = vi.mocked(saveLauncherDownloadQueue)

function createSettings(overrides: Partial<LauncherSettings> = {}): LauncherSettings {
  return {
    gamePath: 'E:\\Games\\Stardew Valley',
    modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    downloadPath: 'E:\\Downloads\\Mods',
    nexusApiKey: null,
    nexusCookie: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
    ...overrides,
  }
}

describe('useLauncherDownloads', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('loads the persisted launcher queue from desktop storage', async () => {
    loadLauncherDownloadQueueMock.mockResolvedValue({
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
    })
    saveLauncherDownloadQueueMock.mockResolvedValue({ items: [] })

    const { result } = renderHook(() => useLauncherDownloads(createSettings()))

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1)
    })
    expect(result.current.items[0]?.id).toBe('persisted-job')
  })

  it('persists queue changes through the desktop bridge instead of localStorage', async () => {
    loadLauncherDownloadQueueMock.mockResolvedValue({ items: [] })
    saveLauncherDownloadQueueMock.mockResolvedValue({ items: [] })

    const { result } = renderHook(() => useLauncherDownloads(createSettings()))

    await waitFor(() => {
      expect(loadLauncherDownloadQueueMock).toHaveBeenCalledTimes(1)
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
      expect(saveLauncherDownloadQueueMock).toHaveBeenCalled()
    })
    expect(saveLauncherDownloadQueueMock).toHaveBeenLastCalledWith({
      items: [
        expect.objectContaining({
          modId: 101,
          title: 'NPC Adventures',
          source: 'discover',
          status: 'queued',
        }),
      ],
    })
  })
})
