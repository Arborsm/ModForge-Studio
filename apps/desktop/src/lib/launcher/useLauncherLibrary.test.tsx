import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../app/localeContext'
import { dismissNotification, publishNotification } from '../app/notifications'
import type {
  LauncherLibraryCoversState,
  LauncherLibraryModSummary,
  LauncherLibraryState,
  LauncherNexusDiagnosticsResult,
  LauncherRemoteModDetail,
  LauncherSettings,
} from '../desktop'
import * as desktop from '../desktop'
import { getLauncherCopy } from '../editor-shell'
import { useLauncherLibrary } from './useLauncherLibrary'

vi.mock('../desktop', async () => {
  const actual = await vi.importActual<typeof import('../desktop')>('../desktop')
  return {
    ...actual,
    checkLauncherUpdates: vi.fn(),
    loadCachedLauncherUpdates: vi.fn(),
    loadLauncherLibraryCovers: vi.fn(),
    loadLauncherNexusDiagnostics: vi.fn(),
    loadLauncherLibraryState: vi.fn(),
    loadLauncherRemoteModDetail: vi.fn(),
    persistLauncherLibraryRemoteCover: vi.fn(),
    saveLauncherLibraryState: vi.fn(),
    scanLauncherLibrary: vi.fn(),
    setLauncherModEnabled: vi.fn(),
  }
})

vi.mock('../app/notifications', async () => {
  const actual = await vi.importActual<typeof import('../app/notifications')>('../app/notifications')
  return {
    ...actual,
    publishNotification: vi.fn(),
    dismissNotification: vi.fn(),
  }
})

const checkLauncherUpdatesMock = vi.mocked(desktop.checkLauncherUpdates)
const loadCachedLauncherUpdatesMock = vi.mocked(desktop.loadCachedLauncherUpdates)
const loadLauncherLibraryCoversMock = vi.mocked(desktop.loadLauncherLibraryCovers)
const loadLauncherNexusDiagnosticsMock = vi.mocked(desktop.loadLauncherNexusDiagnostics)
const loadLauncherLibraryStateMock = vi.mocked(desktop.loadLauncherLibraryState)
const loadLauncherRemoteModDetailMock = vi.mocked(desktop.loadLauncherRemoteModDetail)
const persistLauncherLibraryRemoteCoverMock = vi.mocked(desktop.persistLauncherLibraryRemoteCover)
const saveLauncherLibraryStateMock = vi.mocked(desktop.saveLauncherLibraryState)
const scanLauncherLibraryMock = vi.mocked(desktop.scanLauncherLibrary)
const setLauncherModEnabledMock = vi.mocked(desktop.setLauncherModEnabled)
const publishNotificationMock = vi.mocked(publishNotification)
const dismissNotificationMock = vi.mocked(dismissNotification)
const launcherCopy = getLauncherCopy('zh-CN')
type AutoCoverStageKey = keyof typeof launcherCopy.library.loadingMissingCoversStages

function createAutoCoverNotification(modName: string, stage: AutoCoverStageKey, completed: number, total: number) {
  return {
    id: 'launcher-library-auto-cover-progress',
    level: 'info' as const,
    title: launcherCopy.library.loadingMissingCoversCurrentMod(modName),
    description: launcherCopy.library.loadingMissingCoversStageProgress(
      launcherCopy.library.loadingMissingCoversStages[stage],
      completed,
      total,
    ),
    autoDismissMs: null,
    progress: total > 0 ? (completed / total) * 100 : 0,
  }
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider locale="zh-CN">
      {children}
    </LocaleProvider>
  )
}

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
  } as LauncherSettings
}

function createLibraryState(overrides: Partial<LauncherLibraryState> = {}): LauncherLibraryState {
  return {
    storageFolders: [
      {
        id: 'unsorted',
        name: 'Unsorted',
        modKeys: [],
      },
    ],
    hiddenModKeys: [],
    packPresets: [],
    currentPackId: null,
    scopeMode: 'all',
    ...overrides,
  }
}

function createLibraryCoversState(overrides: Partial<LauncherLibraryCoversState> = {}): LauncherLibraryCoversState {
  return {
    covers: [],
    ...overrides,
  }
}

function createMod(overrides: Partial<LauncherLibraryModSummary> = {}): LauncherLibraryModSummary {
  return {
    id: 'mod-visible',
    labelKey: 'ModForge.Visible',
    name: 'Visible Mod',
    author: 'ModForge',
    version: '1.0.0',
    description: 'Visible mod.',
    uniqueId: 'ModForge.Visible',
    folderName: 'Visible Mod',
    absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Visible Mod',
    enabled: true,
    nexusModId: 101,
    updateKeys: ['Nexus:101'],
    modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
    imageUrl: null,
    missingRequiredDependencies: [],
    ...overrides,
  }
}

function createRemoteModDetail(overrides: Partial<LauncherRemoteModDetail> = {}): LauncherRemoteModDetail {
  return {
    modId: 101,
    title: 'Visible Mod',
    summary: 'Visible mod.',
    author: 'ModForge',
    version: '1.0.0',
    modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
    imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/101/101-cover.png',
    galleryImages: [],
    ...overrides,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

function createLauncherDiagnosticsResult(
  overrides: Partial<Record<string, { status: 'loading' | 'warning' | 'success'; available: boolean; message: string }>> = {},
): LauncherNexusDiagnosticsResult {
  const defaults: Record<
    string,
    { label: string; endpoint: string; status: 'loading' | 'warning' | 'success'; available: boolean; message: string }
  > = {
    publicGraphql: {
      label: 'Nexus Public GraphQL',
      endpoint: 'https://api-router.nexusmods.com/graphql',
      status: 'success',
      available: true,
      message: 'Connected after 1 attempt.',
    },
    publicHtml: {
      label: 'Nexus Public HTML',
      endpoint: 'https://www.nexusmods.com/stardewvalley',
      status: 'success',
      available: true,
      message: 'Connected after 1 attempt.',
    },
    nexusImages: {
      label: 'Nexus Image CDN',
      endpoint: 'https://staticdelivery.nexusmods.com/',
      status: 'success',
      available: true,
      message: 'Connected after 1 attempt.',
    },
    smapi: {
      label: 'SMAPI',
      endpoint: 'https://smapi.io/api/v3.0/mods',
      status: 'success',
      available: true,
      message: 'Connected after 1 attempt.',
    },
  }

  return {
    routes: Object.entries(defaults).map(([routeId, route]) => ({
      routeId,
      attempts: 1,
      maxAttempts: 3,
      ...route,
      ...(overrides[routeId] ?? {}),
    })),
  }
}

async function flushAsyncWork() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('useLauncherLibrary', () => {
  beforeEach(() => {
    checkLauncherUpdatesMock.mockReset()
    loadCachedLauncherUpdatesMock.mockReset()
    loadLauncherLibraryCoversMock.mockReset()
    loadLauncherNexusDiagnosticsMock.mockReset()
    loadLauncherLibraryStateMock.mockReset()
    loadLauncherRemoteModDetailMock.mockReset()
    persistLauncherLibraryRemoteCoverMock.mockReset()
    saveLauncherLibraryStateMock.mockReset()
    scanLauncherLibraryMock.mockReset()
    setLauncherModEnabledMock.mockReset()
    publishNotificationMock.mockReset()
    dismissNotificationMock.mockReset()
    checkLauncherUpdatesMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 0,
      updates: [],
    })
    loadCachedLauncherUpdatesMock.mockResolvedValue(null)
    loadLauncherNexusDiagnosticsMock.mockResolvedValue(createLauncherDiagnosticsResult())
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('auto-fetches covers only for mods without saved covers', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2000-01-01T00:00:00Z'))

    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(
      createLibraryCoversState({
        covers: [
          {
            labelKey: 'ModForge.Visible',
            imagePath: 'E:\\Covers\\visible.png',
          },
        ],
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-visible',
          labelKey: 'ModForge.Visible',
          uniqueId: 'ModForge.Visible',
          nexusModId: 101,
        }),
        createMod({
          id: 'mod-missing',
          labelKey: 'ModForge.Missing',
          uniqueId: 'ModForge.Missing',
          nexusModId: 202,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Missing Cover',
        }),
        createMod({
          id: 'mod-no-nexus',
          labelKey: 'ModForge.LocalOnly',
          uniqueId: 'ModForge.LocalOnly',
          nexusModId: null,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Local Only',
        }),
      ],
    })
    loadLauncherRemoteModDetailMock.mockResolvedValue(
      createRemoteModDetail({
        modId: 202,
        title: 'Missing Cover',
        imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/202/202-cover.png',
      }),
    )
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
    })

    expect(loadLauncherRemoteModDetailMock).toHaveBeenCalledTimes(1)
    expect(loadLauncherRemoteModDetailMock).toHaveBeenCalledWith({ modId: 202 })
    expect(persistLauncherLibraryRemoteCoverMock).toHaveBeenCalledTimes(1)
    expect(persistLauncherLibraryRemoteCoverMock).toHaveBeenCalledWith({
      labelKey: '202',
      imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/202/202-cover.png',
    })
  })

  it('starts a non-forced update check only after the library scan completes', async () => {
    const deferredScan = createDeferred<{
      modsPath: string
      mods: LauncherLibraryModSummary[]
    }>()

    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockReturnValue(deferredScan.promise)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })

    let refreshPromise: Promise<void> | undefined
    await act(async () => {
      refreshPromise = result.current.refresh()
      await flushAsyncWork()
    })

    expect(checkLauncherUpdatesMock).not.toHaveBeenCalled()

    deferredScan.resolve({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          nexusModId: null,
          updateKeys: [],
          modUrl: null,
        }),
      ],
    })

    await act(async () => {
      await refreshPromise
    })

    expect(checkLauncherUpdatesMock).toHaveBeenCalledTimes(1)
    expect(checkLauncherUpdatesMock).toHaveBeenCalledWith({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      forceRefresh: false,
    })
  })

  it('uses cached updates after the library scan and skips a fresh check', async () => {
    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          nexusModId: null,
          updateKeys: [],
          modUrl: null,
        }),
      ],
    })
    loadCachedLauncherUpdatesMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 321,
      updates: [],
    })

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })

    await act(async () => {
      await result.current.refresh()
    })

    expect(loadCachedLauncherUpdatesMock).toHaveBeenCalledWith({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    })
    expect(checkLauncherUpdatesMock).not.toHaveBeenCalled()
  })

  it('continues warming updates when the cached update snapshot is incomplete', async () => {
    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          nexusModId: null,
          updateKeys: [],
          modUrl: null,
        }),
      ],
    })
    loadCachedLauncherUpdatesMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 321,
      updates: [],
      isComplete: false,
    })
    checkLauncherUpdatesMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 654,
      updates: [],
      isComplete: true,
    })

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })

    await act(async () => {
      await result.current.refresh()
    })

    expect(loadCachedLauncherUpdatesMock).toHaveBeenCalledWith({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    })
    expect(checkLauncherUpdatesMock).toHaveBeenCalledWith({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      forceRefresh: false,
    })
  })

  it('skips automatic remote cover fetching when the Nexus image route is unavailable', async () => {
    loadLauncherNexusDiagnosticsMock.mockResolvedValue(
      createLauncherDiagnosticsResult({
        nexusImages: {
          status: 'warning',
          available: false,
          message: 'Failed after 3 attempts: timeout',
        },
      }),
    )
    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-cover',
          labelKey: 'ModForge.Cover',
          uniqueId: 'ModForge.Cover',
          name: 'Cover Mod',
          nexusModId: 303,
        }),
      ],
    })

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
    })

    expect(loadLauncherRemoteModDetailMock).not.toHaveBeenCalled()
    expect(persistLauncherLibraryRemoteCoverMock).not.toHaveBeenCalled()
  })

  it('skips automatic update warming when every update route is unavailable', async () => {
    loadLauncherNexusDiagnosticsMock.mockResolvedValue(
      createLauncherDiagnosticsResult({
        publicGraphql: {
          status: 'warning',
          available: false,
          message: 'Failed after 3 attempts: timeout',
        },
        publicHtml: {
          status: 'warning',
          available: false,
          message: 'Failed after 3 attempts: timeout',
        },
        smapi: {
          status: 'warning',
          available: false,
          message: 'Failed after 3 attempts: timeout',
        },
      }),
    )
    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          nexusModId: null,
          updateKeys: [],
          modUrl: null,
        }),
      ],
    })
    loadCachedLauncherUpdatesMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      checkedAtMs: 321,
      updates: [],
      isComplete: false,
    })

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
    })

    expect(loadCachedLauncherUpdatesMock).not.toHaveBeenCalled()
    expect(checkLauncherUpdatesMock).not.toHaveBeenCalled()
  })

  it('skips automatic update warming when automatic update checking is disabled', async () => {
    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          nexusModId: null,
          updateKeys: [],
          modUrl: null,
        }),
      ],
    })

    const { result } = renderHook(
      () => useLauncherLibrary(createSettings({ autoCheckModUpdates: false })),
      { wrapper: Wrapper },
    )

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
    })

    expect(loadCachedLauncherUpdatesMock).not.toHaveBeenCalled()
    expect(checkLauncherUpdatesMock).not.toHaveBeenCalled()
  })

  it('writes the persisted local cover path back into the current mod state', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2000-01-01T00:05:00Z'))

    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-missing',
          labelKey: 'ModForge.Missing',
          uniqueId: 'ModForge.Missing',
          nexusModId: 202,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Missing Cover',
        }),
      ],
    })
    loadLauncherRemoteModDetailMock.mockResolvedValue(
      createRemoteModDetail({
        modId: 202,
        title: 'Missing Cover',
        imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/202/202-cover.png',
      }),
    )
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(
      createLibraryCoversState({
        covers: [
          {
            labelKey: '202',
            imagePath: 'E:\\Covers\\missing-cover.png',
          },
        ],
      }),
    )

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
      await flushAsyncWork()
    })

    expect(result.current.mods[0]?.imageUrl).toBe('E:\\Covers\\missing-cover.png')
  })

  it('falls back to the first gallery image when the remote detail has no primary imageUrl', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2000-01-01T00:10:00Z'))

    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-gallery-only',
          labelKey: 'ModForge.GalleryOnly',
          uniqueId: 'ModForge.GalleryOnly',
          nexusModId: 20599,
        }),
      ],
    })
    loadLauncherRemoteModDetailMock.mockResolvedValue(
      createRemoteModDetail({
        modId: 20599,
        title: 'Gallery Only',
        imageUrl: null,
        galleryImages: [
          'https://staticdelivery.nexusmods.com/mods/1303/images/20599/20599-1.png',
          'https://staticdelivery.nexusmods.com/mods/1303/images/20599/20599-2.png',
        ],
      }),
    )
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
    })

    expect(persistLauncherLibraryRemoteCoverMock).toHaveBeenCalledTimes(1)
    expect(persistLauncherLibraryRemoteCoverMock).toHaveBeenCalledWith({
      labelKey: '20599',
      imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/20599/20599-1.png',
    })
  })

  it('does not auto-fetch a cover when the scanned mod already has an imageUrl', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2000-01-01T00:15:00Z'))

    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-with-cover',
          labelKey: 'ModForge.WithCover',
          uniqueId: 'ModForge.WithCover',
          nexusModId: 303,
          imageUrl: 'E:\\Covers\\with-cover.png',
        }),
      ],
    })

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
    })

    expect(loadLauncherRemoteModDetailMock).not.toHaveBeenCalled()
    expect(persistLauncherLibraryRemoteCoverMock).not.toHaveBeenCalled()
  })

  it('fetches missing covers again on an immediate refresh when they are still missing', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2000-01-02T00:00:00Z'))

    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-missing',
          labelKey: 'ModForge.Missing',
          uniqueId: 'ModForge.Missing',
          nexusModId: 202,
        }),
      ],
    })
    loadLauncherRemoteModDetailMock.mockResolvedValue(
      createRemoteModDetail({
        modId: 202,
        title: 'Missing Cover',
        imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/202/202-cover.png',
      }),
    )
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())

    const first = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await first.result.current.refresh()
      await flushAsyncWork()
    })
    expect(persistLauncherLibraryRemoteCoverMock).toHaveBeenCalledTimes(1)
    first.unmount()

    const second = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await second.result.current.refresh()
      await flushAsyncWork()
    })

    expect(persistLauncherLibraryRemoteCoverMock).toHaveBeenCalledTimes(2)
  })

  it('fetches newly missing covers on the next refresh without waiting for a cooldown', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2000-01-04T00:00:00Z'))

    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock
      .mockResolvedValueOnce(createLibraryCoversState())
      .mockResolvedValueOnce(
        createLibraryCoversState({
          covers: [
            {
              labelKey: 'ModForge.MissingA',
              imagePath: 'E:\\Covers\\missing-a.png',
            },
          ],
        }),
      )
    scanLauncherLibraryMock
      .mockResolvedValueOnce({
        modsPath: 'E:\\Games\\Stardew Valley\\Mods',
        mods: [
          createMod({
            id: 'mod-missing-a',
            labelKey: 'ModForge.MissingA',
            uniqueId: 'ModForge.MissingA',
            nexusModId: 201,
          }),
        ],
      })
      .mockResolvedValueOnce({
        modsPath: 'E:\\Games\\Stardew Valley\\Mods',
        mods: [
          createMod({
            id: 'mod-missing-a',
            labelKey: 'ModForge.MissingA',
            uniqueId: 'ModForge.MissingA',
            nexusModId: 201,
          }),
          createMod({
            id: 'mod-missing-b',
            labelKey: 'ModForge.MissingB',
            uniqueId: 'ModForge.MissingB',
            nexusModId: 202,
          }),
        ],
      })
    loadLauncherRemoteModDetailMock
      .mockResolvedValueOnce(
        createRemoteModDetail({
          modId: 201,
          title: 'Missing Cover A',
          imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/201/201-cover.png',
        }),
      )
      .mockResolvedValueOnce(
        createRemoteModDetail({
          modId: 202,
          title: 'Missing Cover B',
          imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/202/202-cover.png',
        }),
      )
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
    })

    expect(persistLauncherLibraryRemoteCoverMock).toHaveBeenCalledTimes(1)
    expect(persistLauncherLibraryRemoteCoverMock).toHaveBeenLastCalledWith({
      labelKey: '201',
      imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/201/201-cover.png',
    })

    vi.setSystemTime(new Date('2000-01-04T00:01:00Z'))

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
    })

    expect(persistLauncherLibraryRemoteCoverMock).toHaveBeenCalledTimes(2)
    expect(persistLauncherLibraryRemoteCoverMock).toHaveBeenLastCalledWith({
      labelKey: '202',
      imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/202/202-cover.png',
    })
  })

  it('ignores stale refresh results that finish after a newer refresh', async () => {
    const firstScanRequest = createDeferred<{ modsPath: string; mods: LauncherLibraryModSummary[] }>()
    let firstRefreshPromise!: Promise<void>

    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock
      .mockReturnValueOnce(firstScanRequest.promise)
      .mockResolvedValueOnce({
        modsPath: 'E:\\Games\\Stardew Valley\\Mods',
        mods: [
          createMod({
            id: 'mod-new',
            labelKey: 'ModForge.New',
            uniqueId: 'ModForge.New',
            name: 'New Result',
            nexusModId: null,
          }),
        ],
      })

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })

    await act(async () => {
      firstRefreshPromise = result.current.refresh()
      await flushAsyncWork()
    })

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
    })

    expect(result.current.mods.map((mod) => mod.id)).toEqual(['mod-new'])

    await act(async () => {
      firstScanRequest.resolve({
        modsPath: 'E:\\Games\\Stardew Valley\\Mods',
        mods: [
          createMod({
            id: 'mod-old',
            labelKey: 'ModForge.Old',
            uniqueId: 'ModForge.Old',
            name: 'Old Result',
            nexusModId: null,
          }),
        ],
      })
      await firstRefreshPromise
      await flushAsyncWork()
    })

    expect(result.current.mods.map((mod) => mod.id)).toEqual(['mod-new'])
  })

  it.skip('publishes an auto-cover loading notification while missing covers are being fetched', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2000-01-05T00:00:00Z').getTime())

    const detailRequest = createDeferred<LauncherRemoteModDetail>()
    const persistRequest = createDeferred<LauncherLibraryCoversState>()

    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-missing-a',
          labelKey: 'ModForge.MissingA',
          uniqueId: 'ModForge.MissingA',
          nexusModId: 201,
        }),
        createMod({
          id: 'mod-missing-b',
          labelKey: 'ModForge.MissingB',
          uniqueId: 'ModForge.MissingB',
          nexusModId: 202,
        }),
      ],
    })
    loadLauncherRemoteModDetailMock
      .mockReturnValueOnce(detailRequest.promise)
      .mockResolvedValueOnce(
        createRemoteModDetail({
          modId: 202,
          title: 'Missing Cover B',
          imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/202/202-cover.png',
        }),
      )
    persistLauncherLibraryRemoteCoverMock
      .mockReturnValueOnce(persistRequest.promise)
      .mockResolvedValueOnce(createLibraryCoversState())

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
    })

    expect(publishNotificationMock).toHaveBeenCalledWith({
      id: 'launcher-library-auto-cover-progress',
      level: 'info',
      title: '正在补全缺失封面',
      description: '已处理 0 / 2 个缺失封面。',
      autoDismissMs: null,
      progress: 0,
    })

    await act(async () => {
      persistRequest.resolve(createLibraryCoversState())
      await flushAsyncWork()
    })

    expect(publishNotificationMock).toHaveBeenCalledWith({
      id: 'launcher-library-auto-cover-progress',
      level: 'info',
      title: '正在补全缺失封面',
      description: '已处理 1 / 2 个缺失封面。',
      autoDismissMs: null,
      progress: 50,
    })

    await act(async () => {
      detailRequest.resolve(
        createRemoteModDetail({
          modId: 201,
          title: 'Missing Cover A',
          imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/201/201-cover.png',
        }),
      )
      await flushAsyncWork()
    })

    expect(dismissNotificationMock).toHaveBeenCalledWith('launcher-library-auto-cover-progress')
  })

  it('publishes per-mod stage progress while missing covers are being fetched', async () => {
    const detailRequest = createDeferred<LauncherRemoteModDetail>()
    const persistRequest = createDeferred<LauncherLibraryCoversState>()

    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-missing-a',
          labelKey: 'ModForge.MissingA',
          uniqueId: 'ModForge.MissingA',
          name: 'Missing Cover A',
          nexusModId: 201,
        }),
      ],
    })
    loadLauncherRemoteModDetailMock.mockReturnValueOnce(detailRequest.promise)
    persistLauncherLibraryRemoteCoverMock.mockReturnValueOnce(persistRequest.promise)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
    })

    await waitFor(() => {
      expect(publishNotificationMock).toHaveBeenNthCalledWith(
        1,
        createAutoCoverNotification('Missing Cover A', 'local', 0, 1),
      )
      expect(publishNotificationMock).toHaveBeenNthCalledWith(
        2,
        createAutoCoverNotification('Missing Cover A', 'apiCover', 0, 1),
      )
    })

    await act(async () => {
      detailRequest.resolve(
        createRemoteModDetail({
          modId: 201,
          title: 'Missing Cover A',
          imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/201/201-cover.png',
        }),
      )
      await flushAsyncWork()
    })

    await waitFor(() => {
      expect(publishNotificationMock).toHaveBeenCalledWith(
        createAutoCoverNotification('Missing Cover A', 'remoteCover', 0, 1),
      )
    })

    await act(async () => {
      persistRequest.resolve(createLibraryCoversState())
      await flushAsyncWork()
    })

    await waitFor(() => {
      expect(publishNotificationMock).toHaveBeenCalledWith(
        createAutoCoverNotification('Missing Cover A', 'remoteCover', 1, 1),
      )
      expect(dismissNotificationMock).toHaveBeenCalledWith('launcher-library-auto-cover-progress')
    })
  })

  it('publishes gallery stages when the auto-cover flow falls back to gallery images', async () => {
    const persistRequest = createDeferred<LauncherLibraryCoversState>()

    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-gallery-a',
          labelKey: 'ModForge.GalleryA',
          uniqueId: 'ModForge.GalleryA',
          name: 'Gallery Cover A',
          nexusModId: 20599,
        }),
      ],
    })
    loadLauncherRemoteModDetailMock.mockResolvedValue(
      createRemoteModDetail({
        modId: 20599,
        title: 'Gallery Cover A',
        imageUrl: null,
        galleryImages: ['https://staticdelivery.nexusmods.com/mods/1303/images/20599/20599-1.png'],
      }),
    )
    persistLauncherLibraryRemoteCoverMock.mockReturnValueOnce(persistRequest.promise)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
    })

    await waitFor(() => {
      expect(publishNotificationMock).toHaveBeenCalledWith(
        createAutoCoverNotification('Gallery Cover A', 'apiGallery', 0, 1),
      )
      expect(publishNotificationMock).toHaveBeenCalledWith(
        createAutoCoverNotification('Gallery Cover A', 'remoteGallery', 0, 1),
      )
    })

    await act(async () => {
      persistRequest.resolve(createLibraryCoversState())
      await flushAsyncWork()
    })

    expect(persistLauncherLibraryRemoteCoverMock).toHaveBeenCalledWith({
      labelKey: '20599',
      imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/20599/20599-1.png',
    })
    expect(publishNotificationMock).toHaveBeenCalledWith(
      createAutoCoverNotification('Gallery Cover A', 'remoteGallery', 1, 1),
    )
  })

  it('keeps the auto-cover flow alive across state writes until every eligible mod finishes', async () => {
    const detailRequestA = createDeferred<LauncherRemoteModDetail>()
    const detailRequestB = createDeferred<LauncherRemoteModDetail>()
    const persistRequestA = createDeferred<LauncherLibraryCoversState>()
    const persistRequestB = createDeferred<LauncherLibraryCoversState>()

    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-a',
          labelKey: 'ModForge.A',
          uniqueId: 'ModForge.A',
          name: 'Cover A',
          nexusModId: 201,
        }),
        createMod({
          id: 'mod-b',
          labelKey: 'ModForge.B',
          uniqueId: 'ModForge.B',
          name: 'Cover B',
          nexusModId: 202,
        }),
      ],
    })
    loadLauncherRemoteModDetailMock.mockReturnValueOnce(detailRequestA.promise).mockReturnValueOnce(detailRequestB.promise)
    persistLauncherLibraryRemoteCoverMock.mockReturnValueOnce(persistRequestA.promise).mockReturnValueOnce(persistRequestB.promise)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
    })

    await act(async () => {
      detailRequestA.resolve(
        createRemoteModDetail({
          modId: 201,
          title: 'Cover A',
          imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/201/201-cover.png',
        }),
      )
      await flushAsyncWork()
    })

    await act(async () => {
      persistRequestA.resolve(
        createLibraryCoversState({
          covers: [{ labelKey: '201', imagePath: 'E:\\Covers\\201.png' }],
        }),
      )
      await flushAsyncWork()
    })

    expect(dismissNotificationMock).not.toHaveBeenCalled()
    expect(publishNotificationMock).toHaveBeenCalledWith(createAutoCoverNotification('Cover A', 'remoteCover', 1, 2))

    await act(async () => {
      detailRequestB.resolve(
        createRemoteModDetail({
          modId: 202,
          title: 'Cover B',
          imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/202/202-cover.png',
        }),
      )
      await flushAsyncWork()
    })

    await act(async () => {
      persistRequestB.resolve(
        createLibraryCoversState({
          covers: [{ labelKey: '202', imagePath: 'E:\\Covers\\202.png' }],
        }),
      )
      await flushAsyncWork()
    })

    await waitFor(() => {
      expect(publishNotificationMock).toHaveBeenCalledWith(createAutoCoverNotification('Cover B', 'remoteCover', 2, 2))
      expect(dismissNotificationMock).toHaveBeenCalledTimes(1)
      expect(dismissNotificationMock).toHaveBeenCalledWith('launcher-library-auto-cover-progress')
    })
  })

  it('filters to current pack members when scope mode is current-pack', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherRemoteModDetailMock.mockResolvedValue(createRemoteModDetail({ imageUrl: null }))
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        packPresets: [
          {
            id: 'farm',
            name: 'Farm',
            modKeys: ['ModForge.A'],
          },
        ],
        currentPackId: 'farm',
        scopeMode: 'current-pack',
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-a',
          labelKey: 'ModForge.A',
          name: 'Farm Animals Expanded',
          uniqueId: 'ModForge.A',
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Farm Animals Expanded',
        }),
        createMod({
          id: 'mod-b',
          labelKey: 'ModForge.B',
          name: 'NPC Adventures',
          uniqueId: 'ModForge.B',
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\NPC Adventures',
        }),
      ],
    })

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    await waitFor(() => {
      expect(result.current.scopeMode).toBe('current-pack')
      expect(result.current.filteredMods.map((item) => item.id)).toEqual(['mod-a'])
    })
  })

  it('hides hidden mods from the default filtered library results', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherRemoteModDetailMock.mockResolvedValue(createRemoteModDetail({ imageUrl: null }))
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        hiddenModKeys: ['ModForge.Hidden'],
      } as Partial<LauncherLibraryState>),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-visible',
          labelKey: 'ModForge.Visible',
          uniqueId: 'ModForge.Visible',
        }),
        createMod({
          id: 'mod-hidden',
          labelKey: 'ModForge.Hidden',
          name: 'Hidden Mod',
          uniqueId: 'ModForge.Hidden',
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Hidden Mod',
        }),
      ],
    })

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    await waitFor(() => {
      expect(result.current.filteredMods.map((item) => item.id)).toEqual(['mod-visible'])
    })
  })

  it('persists hidden mod keys when hiding a mod from the library', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherRemoteModDetailMock.mockResolvedValue(createRemoteModDetail({ imageUrl: null }))
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-visible',
          labelKey: 'ModForge.Visible',
          uniqueId: 'ModForge.Visible',
        }),
      ],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    await act(async () => {
      await (result.current as typeof result.current & { hideMods: (modIds: string[]) => Promise<void> }).hideMods(['mod-visible'])
    })

    expect(saveLauncherLibraryStateMock).toHaveBeenCalledWith({
      storageFolders: [
        {
          id: 'unsorted',
          name: 'Unsorted',
          modKeys: [],
        },
      ],
      hiddenModKeys: ['ModForge.Visible'],
      packPresets: [],
      currentPackId: null,
      scopeMode: 'all',
    })
  })

  it('assigns selected mods to one storage folder with single ownership', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherRemoteModDetailMock.mockResolvedValue(createRemoteModDetail({ imageUrl: null }))
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        storageFolders: [
          {
            id: 'core',
            name: 'Core',
            modKeys: ['ModForge.A'],
          },
          {
            id: 'addons',
            name: 'Addons',
            modKeys: [],
          },
          {
            id: 'unsorted',
            name: 'Unsorted',
            modKeys: ['ModForge.B'],
          },
        ],
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-a',
          labelKey: 'ModForge.A',
          uniqueId: 'ModForge.A',
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Farm Animals Expanded',
        }),
        createMod({
          id: 'mod-b',
          labelKey: 'ModForge.B',
          uniqueId: 'ModForge.B',
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\NPC Adventures',
        }),
      ],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    act(() => {
      result.current.toggleModSelection('mod-a')
      result.current.toggleModSelection('mod-b')
    })

    await act(async () => {
      await result.current.assignSelectionToFolder('addons')
    })

    expect(saveLauncherLibraryStateMock).toHaveBeenCalledWith({
      storageFolders: [
        {
          id: 'core',
          name: 'Core',
          modKeys: [],
        },
        {
          id: 'addons',
          name: 'Addons',
          modKeys: ['ModForge.A', 'ModForge.B'],
        },
        {
          id: 'unsorted',
          name: 'Unsorted',
          modKeys: [],
        },
      ],
      hiddenModKeys: [],
      packPresets: [],
      currentPackId: null,
      scopeMode: 'all',
    })
  })

  it('allows pack presets to keep multi-membership', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherRemoteModDetailMock.mockResolvedValue(createRemoteModDetail({ imageUrl: null }))
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        packPresets: [
          {
            id: 'farm',
            name: 'Farm',
            modKeys: ['ModForge.A'],
          },
          {
            id: 'social',
            name: 'Social',
            modKeys: ['ModForge.B'],
          },
        ],
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-a',
          labelKey: 'ModForge.A',
          uniqueId: 'ModForge.A',
        }),
        createMod({
          id: 'mod-b',
          labelKey: 'ModForge.B',
          uniqueId: 'ModForge.B',
        }),
      ],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    act(() => {
      result.current.toggleModSelection('mod-a')
      result.current.toggleModSelection('mod-b')
    })

    await act(async () => {
      await result.current.addSelectionToPack('social')
    })

    expect(saveLauncherLibraryStateMock).toHaveBeenCalledWith({
      storageFolders: [
        {
          id: 'unsorted',
          name: 'Unsorted',
          modKeys: [],
        },
      ],
      hiddenModKeys: [],
      packPresets: [
        {
          id: 'farm',
          name: 'Farm',
          modKeys: ['ModForge.A'],
        },
        {
          id: 'social',
          name: 'Social',
          modKeys: ['ModForge.B', 'ModForge.A'],
        },
      ],
      currentPackId: null,
      scopeMode: 'all',
    })
  })

  it('applyCurrentPack leaves only pack members enabled', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherRemoteModDetailMock.mockResolvedValue(createRemoteModDetail({ imageUrl: null }))
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        packPresets: [
          {
            id: 'farm',
            name: 'Farm',
            modKeys: ['ModForge.A'],
          },
        ],
        currentPackId: 'farm',
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-a',
          labelKey: 'ModForge.A',
          uniqueId: 'ModForge.A',
          enabled: false,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Farm Animals Expanded',
        }),
        createMod({
          id: 'mod-b',
          labelKey: 'ModForge.B',
          uniqueId: 'ModForge.B',
          enabled: true,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\NPC Adventures',
        }),
      ],
    })
    setLauncherModEnabledMock.mockResolvedValue({
      absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Farm Animals Expanded',
      enabled: true,
    })

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    await act(async () => {
      await result.current.applyCurrentPack()
    })

    expect(setLauncherModEnabledMock).toHaveBeenCalledTimes(2)
    expect(setLauncherModEnabledMock).toHaveBeenNthCalledWith(1, {
      modPath: 'E:\\Games\\Stardew Valley\\Mods\\Farm Animals Expanded',
      enabled: true,
    })
    expect(setLauncherModEnabledMock).toHaveBeenNthCalledWith(2, {
      modPath: 'E:\\Games\\Stardew Valley\\Mods\\NPC Adventures',
      enabled: false,
    })
  })

  it('replacePackMods overwrites the current pack membership from selected card ids', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherRemoteModDetailMock.mockResolvedValue(createRemoteModDetail({ imageUrl: null }))
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        packPresets: [
          {
            id: 'farm',
            name: 'Farm',
            modKeys: ['ModForge.A'],
          },
          {
            id: 'social',
            name: 'Social',
            modKeys: ['ModForge.B'],
          },
        ],
        currentPackId: 'farm',
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-a',
          labelKey: 'ModForge.A',
          uniqueId: 'ModForge.A',
        }),
        createMod({
          id: 'mod-b',
          labelKey: 'ModForge.B',
          uniqueId: 'ModForge.B',
        }),
      ],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    await act(async () => {
      await result.current.replacePackMods('farm', ['mod-b'])
    })

    expect(saveLauncherLibraryStateMock).toHaveBeenCalledWith({
      storageFolders: [
        {
          id: 'unsorted',
          name: 'Unsorted',
          modKeys: [],
        },
      ],
      hiddenModKeys: [],
      packPresets: [
        {
          id: 'farm',
          name: 'Farm',
          modKeys: ['ModForge.B'],
        },
        {
          id: 'social',
          name: 'Social',
          modKeys: ['ModForge.B'],
        },
      ],
      currentPackId: 'farm',
      scopeMode: 'all',
    })
  })

  it('addModsToPack appends dragged mods into the target pack without duplicates', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherRemoteModDetailMock.mockResolvedValue(createRemoteModDetail({ imageUrl: null }))
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        packPresets: [
          {
            id: 'farm',
            name: 'Farm',
            modKeys: ['ModForge.A'],
          },
          {
            id: 'social',
            name: 'Social',
            modKeys: ['ModForge.B'],
          },
        ],
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-a',
          labelKey: 'ModForge.A',
          uniqueId: 'ModForge.A',
        }),
        createMod({
          id: 'mod-b',
          labelKey: 'ModForge.B',
          uniqueId: 'ModForge.B',
        }),
      ],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    await act(async () => {
      await result.current.addModsToPack('social', ['mod-a', 'mod-b'])
    })

    expect(saveLauncherLibraryStateMock).toHaveBeenCalledWith({
      storageFolders: [
        {
          id: 'unsorted',
          name: 'Unsorted',
          modKeys: [],
        },
      ],
      hiddenModKeys: [],
      packPresets: [
        {
          id: 'farm',
          name: 'Farm',
          modKeys: ['ModForge.A'],
        },
        {
          id: 'social',
          name: 'Social',
          modKeys: ['ModForge.B', 'ModForge.A'],
        },
      ],
      currentPackId: null,
      scopeMode: 'all',
    })
  })
})
