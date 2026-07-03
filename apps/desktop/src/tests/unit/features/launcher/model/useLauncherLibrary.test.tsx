import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { LocaleProvider } from '@locales/provider'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import type {
  InstallLauncherArchiveResult,
  LauncherLibraryCoversState,
  LauncherLibraryModSummary,
  LauncherLibraryState,
  LauncherNexusDiagnosticsResult,
  LauncherRemoteModDetail,
  LauncherSettings,
} from '@features/launcher/api'
import * as desktop from '@features/launcher/api'
import { getLauncherCopy } from '@locales/api'
import { useLauncherLibrary } from '@features/launcher'
import { LauncherTestWrapper } from '@test/launcherTestWrapper'
import { createMockLauncherPort } from '@test/launcherTestPort'
import type { LauncherPort } from '@features/launcher/model/launcherPort'

vi.mock('@features/launcher/api', async () => {
  const actual = await vi.importActual<typeof import('@features/launcher/api')>('@features/launcher/api')
  return {
    ...actual,
    checkLauncherUpdates: vi.fn(),
    loadCachedLauncherUpdates: vi.fn(),
    installLauncherArchive: vi.fn(),
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

vi.mock('@shared/ui/notifications', async () => {
  const actual = await vi.importActual<typeof import('@shared/ui/notifications')>('@shared/ui/notifications')
  return {
    ...actual,
    publishNotification: vi.fn(),
    dismissNotification: vi.fn(),
  }
})

const checkLauncherUpdatesMock = vi.mocked(desktop.checkLauncherUpdates)
const loadCachedLauncherUpdatesMock = vi.mocked(desktop.loadCachedLauncherUpdates)
const installLauncherArchiveMock = vi.mocked(desktop.installLauncherArchive)
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
let launcherPort: LauncherPort

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
    <LauncherTestWrapper port={launcherPort}>
      <LocaleProvider locale="zh-CN">{children}</LocaleProvider>
    </LauncherTestWrapper>
  )
}

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
    childModGroups: [],
    libraryFolders: [],
    customOrders: {},
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
    dependencies: [],
    requiredDependencies: [],
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
      endpoint: 'https://api.nexusmods.com/v2/graphql',
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
      ...overrides[routeId],
    })),
  }
}

function createInstallArchiveResult(overrides: Partial<InstallLauncherArchiveResult> = {}): InstallLauncherArchiveResult {
  return {
    modName: 'Example Pack',
    uniqueId: 'ModForge.ExamplePack',
    version: '2.0.0',
    targetPath: 'E:\\Games\\Stardew Valley\\Mods\\[CP] Example Pack',
    preservedConfig: true,
    preservedI18nFiles: 2,
    installedMods: [
      {
        modName: 'Example Pack',
        uniqueId: 'ModForge.ExamplePack',
        version: '2.0.0',
        targetPath: 'E:\\Games\\Stardew Valley\\Mods\\[CP] Example Pack',
        preservedConfig: true,
        preservedI18nFiles: 2,
      },
    ],
    backupId: 'install-123',
    backupPath: 'E:\\Games\\Stardew Valley\\Backups\\install-123',
    ...overrides,
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
    launcherPort = createMockLauncherPort({
      checkUpdates: checkLauncherUpdatesMock,
      installArchive: installLauncherArchiveMock,
      loadCachedUpdates: loadCachedLauncherUpdatesMock,
      loadLibraryCovers: loadLauncherLibraryCoversMock,
      loadLibraryState: loadLauncherLibraryStateMock,
      loadNexusDiagnostics: loadLauncherNexusDiagnosticsMock,
      loadRemoteModDetail: loadLauncherRemoteModDetailMock,
      persistLibraryRemoteCover: persistLauncherLibraryRemoteCoverMock,
      saveLibraryState: saveLauncherLibraryStateMock,
      scanLibrary: scanLauncherLibraryMock,
      setModEnabled: setLauncherModEnabledMock,
    })
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

  it('skips automatic remote cover fetching for mods suppressed by repeated update failures', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2000-01-01T00:00:00Z'))

    const loadSuppressedUpdateModIdsMock = vi.fn().mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      modIds: [202],
    })

    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-suppressed',
          labelKey: 'ModForge.Suppressed',
          uniqueId: 'ModForge.Suppressed',
          nexusModId: 202,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Suppressed Mod',
        }),
        createMod({
          id: 'mod-eligible',
          labelKey: 'ModForge.Eligible',
          uniqueId: 'ModForge.Eligible',
          nexusModId: 303,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Eligible Mod',
        }),
      ],
    })
    loadLauncherRemoteModDetailMock.mockResolvedValue(
      createRemoteModDetail({
        modId: 303,
        title: 'Eligible Mod',
        imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/303/303-cover.png',
      }),
    )
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    launcherPort = Object.assign(createMockLauncherPort(), {
      loadSuppressedUpdateModIds: loadSuppressedUpdateModIdsMock,
      loadLibraryState: loadLauncherLibraryStateMock,
      loadLibraryCovers: loadLauncherLibraryCoversMock,
      loadNexusDiagnostics: loadLauncherNexusDiagnosticsMock,
      loadRemoteModDetail: loadLauncherRemoteModDetailMock,
      persistLibraryRemoteCover: persistLauncherLibraryRemoteCoverMock,
      scanLibrary: scanLauncherLibraryMock,
    })

    const { result } = renderHook(() => useLauncherLibrary(createSettings({ autoCheckModUpdates: false })), {
      wrapper: Wrapper,
    })

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
    })

    expect(loadSuppressedUpdateModIdsMock).toHaveBeenCalledWith({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    })
    expect(loadLauncherRemoteModDetailMock).toHaveBeenCalledTimes(1)
    expect(loadLauncherRemoteModDetailMock).toHaveBeenCalledWith({ modId: 303 })
    expect(persistLauncherLibraryRemoteCoverMock).toHaveBeenCalledTimes(1)
    expect(persistLauncherLibraryRemoteCoverMock).toHaveBeenCalledWith({
      labelKey: '303',
      imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/303/303-cover.png',
    })
  })

  it('skips automatic remote cover fetching for known invalid Nexus mod ids', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2000-01-01T00:00:00Z'))

    const isRemoteModIdInvalid = vi.fn((modId: number | null | undefined) => modId === 23651)

    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-hidden',
          labelKey: 'ModForge.Hidden',
          uniqueId: 'ModForge.Hidden',
          nexusModId: 23651,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Hidden Mod',
        }),
        createMod({
          id: 'mod-eligible',
          labelKey: 'ModForge.Eligible',
          uniqueId: 'ModForge.Eligible',
          nexusModId: 303,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Eligible Mod',
        }),
      ],
    })
    loadLauncherRemoteModDetailMock.mockResolvedValue(
      createRemoteModDetail({
        modId: 303,
        title: 'Eligible Mod',
        imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/303/303-cover.png',
      }),
    )
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    launcherPort = createMockLauncherPort({
      checkUpdates: checkLauncherUpdatesMock,
      isRemoteModIdInvalid,
      loadCachedUpdates: loadCachedLauncherUpdatesMock,
      loadLibraryCovers: loadLauncherLibraryCoversMock,
      loadLibraryState: loadLauncherLibraryStateMock,
      loadNexusDiagnostics: loadLauncherNexusDiagnosticsMock,
      loadRemoteModDetail: loadLauncherRemoteModDetailMock,
      persistLibraryRemoteCover: persistLauncherLibraryRemoteCoverMock,
      scanLibrary: scanLauncherLibraryMock,
    })

    const { result } = renderHook(() => useLauncherLibrary(createSettings({ autoCheckModUpdates: false })), {
      wrapper: Wrapper,
    })

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
    })

    expect(isRemoteModIdInvalid).toHaveBeenCalledWith(23651)
    expect(loadLauncherRemoteModDetailMock).toHaveBeenCalledTimes(1)
    expect(loadLauncherRemoteModDetailMock).toHaveBeenCalledWith({ modId: 303 })
    expect(persistLauncherLibraryRemoteCoverMock).toHaveBeenCalledTimes(1)
    expect(publishNotificationMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        title: launcherCopy.library.loadingMissingCoversCurrentMod('Hidden Mod'),
      }),
    )
  })

  it('skips automatic remote cover fetching for mods blocked by repeated cover failures', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2000-01-01T00:00:00Z'))

    const loadImageFailuresMock = vi.fn().mockResolvedValue({
      entries: [
        {
          modKey: '202',
          failureCount: 3,
          blocked: true,
          lastError: 'Launcher image loading is disabled for mod 202 after repeated failures.',
          lastFailedAtMs: 1,
        },
      ],
    })

    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-blocked',
          labelKey: 'ModForge.Blocked',
          uniqueId: 'ModForge.Blocked',
          name: 'Blocked Cover',
          nexusModId: 202,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Blocked Cover',
        }),
        createMod({
          id: 'mod-eligible',
          labelKey: 'ModForge.Eligible',
          uniqueId: 'ModForge.Eligible',
          name: 'Eligible Cover',
          nexusModId: 303,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Eligible Cover',
        }),
      ],
    })
    loadLauncherRemoteModDetailMock.mockResolvedValue(
      createRemoteModDetail({
        modId: 303,
        title: 'Eligible Cover',
        imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/303/303-cover.png',
      }),
    )
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    launcherPort = createMockLauncherPort({
      checkUpdates: checkLauncherUpdatesMock,
      loadCachedUpdates: loadCachedLauncherUpdatesMock,
      loadImageFailures: loadImageFailuresMock,
      loadLibraryCovers: loadLauncherLibraryCoversMock,
      loadLibraryState: loadLauncherLibraryStateMock,
      loadNexusDiagnostics: loadLauncherNexusDiagnosticsMock,
      loadRemoteModDetail: loadLauncherRemoteModDetailMock,
      persistLibraryRemoteCover: persistLauncherLibraryRemoteCoverMock,
      scanLibrary: scanLauncherLibraryMock,
    })

    const { result } = renderHook(() => useLauncherLibrary(createSettings({ autoCheckModUpdates: false })), {
      wrapper: Wrapper,
    })

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
    })

    expect(loadImageFailuresMock).toHaveBeenCalledTimes(1)
    expect(loadLauncherRemoteModDetailMock).toHaveBeenCalledTimes(1)
    expect(loadLauncherRemoteModDetailMock).toHaveBeenCalledWith({ modId: 303 })
    expect(persistLauncherLibraryRemoteCoverMock).toHaveBeenCalledTimes(1)
    expect(persistLauncherLibraryRemoteCoverMock).toHaveBeenCalledWith({
      labelKey: '303',
      imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/303/303-cover.png',
    })
    expect(publishNotificationMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        title: launcherCopy.library.loadingMissingCoversCurrentMod('Blocked Cover'),
      }),
    )
    expect(launcherPort.writeDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'launcher.auto-cover.skip-blocked',
        keyValues: expect.objectContaining({
          modName: 'Blocked Cover',
          nexusModId: '202',
          blockedKey: '202',
          matchedCandidate: '202',
        }),
      }),
    )
  })

  it('records automatic cover detail failures into the launcher image failure state', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2000-01-01T00:00:00Z'))

    const recordImageFailureMock = vi.fn().mockResolvedValue({
      entries: [
        {
          modKey: '202',
          failureCount: 3,
          blocked: true,
          lastError: 'Nexus mod 202 is unavailable.',
          lastFailedAtMs: 1,
        },
      ],
    })

    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-hidden',
          labelKey: 'ModForge.Hidden',
          uniqueId: 'ModForge.Hidden',
          name: 'Hidden Cover',
          nexusModId: 202,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Hidden Cover',
        }),
      ],
    })
    loadLauncherRemoteModDetailMock.mockRejectedValue(new Error('Nexus mod 202 is unavailable.'))
    launcherPort = createMockLauncherPort({
      checkUpdates: checkLauncherUpdatesMock,
      loadCachedUpdates: loadCachedLauncherUpdatesMock,
      loadLibraryCovers: loadLauncherLibraryCoversMock,
      loadLibraryState: loadLauncherLibraryStateMock,
      loadNexusDiagnostics: loadLauncherNexusDiagnosticsMock,
      loadRemoteModDetail: loadLauncherRemoteModDetailMock,
      persistLibraryRemoteCover: persistLauncherLibraryRemoteCoverMock,
      recordImageFailure: recordImageFailureMock,
      scanLibrary: scanLauncherLibraryMock,
    })

    const { result } = renderHook(() => useLauncherLibrary(createSettings({ autoCheckModUpdates: false })), {
      wrapper: Wrapper,
    })

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
    })

    expect(loadLauncherRemoteModDetailMock).toHaveBeenCalledWith({ modId: 202 })
    expect(recordImageFailureMock).toHaveBeenCalledWith({
      modKey: '202',
      error: 'Nexus mod 202 is unavailable.',
    })
    expect(persistLauncherLibraryRemoteCoverMock).not.toHaveBeenCalled()
    expect(launcherPort.writeDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'launcher.auto-cover.record-failure',
        keyValues: expect.objectContaining({
          modName: 'Hidden Cover',
          nexusModId: '202',
          coverKey: '202',
          stage: 'apiCover',
          error: 'Nexus mod 202 is unavailable.',
        }),
      }),
    )
  })

  it('records unavailable automatic cover detail responses into the launcher image failure state', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2000-01-01T00:00:00Z'))

    const recordImageFailureMock = vi.fn().mockResolvedValue({
      entries: [
        {
          modKey: '23651',
          failureCount: 3,
          blocked: true,
          lastError: 'Nexus mod 23651 is unavailable.',
          lastFailedAtMs: 1,
        },
      ],
    })
    const markRemoteModIdInvalidMock = vi.fn()

    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-hidden',
          labelKey: 'ModForge.Hidden',
          uniqueId: 'ModForge.Hidden',
          name: 'Hidden Cover',
          nexusModId: 23651,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Hidden Cover',
        }),
      ],
    })
    loadLauncherRemoteModDetailMock.mockResolvedValue(
      createRemoteModDetail({
        modId: 23651,
        title: 'Nexus mod 23651',
        unavailable: true,
        unavailableReason: 'missing field name',
        imageUrl: null,
      }),
    )
    launcherPort = createMockLauncherPort({
      checkUpdates: checkLauncherUpdatesMock,
      loadCachedUpdates: loadCachedLauncherUpdatesMock,
      loadLibraryCovers: loadLauncherLibraryCoversMock,
      loadLibraryState: loadLauncherLibraryStateMock,
      loadNexusDiagnostics: loadLauncherNexusDiagnosticsMock,
      loadRemoteModDetail: loadLauncherRemoteModDetailMock,
      markRemoteModIdInvalid: markRemoteModIdInvalidMock,
      persistLibraryRemoteCover: persistLauncherLibraryRemoteCoverMock,
      recordImageFailure: recordImageFailureMock,
      scanLibrary: scanLauncherLibraryMock,
    })

    const { result } = renderHook(() => useLauncherLibrary(createSettings({ autoCheckModUpdates: false })), {
      wrapper: Wrapper,
    })

    await act(async () => {
      await result.current.refresh()
      await flushAsyncWork()
    })

    expect(loadLauncherRemoteModDetailMock).toHaveBeenCalledWith({ modId: 23651 })
    expect(markRemoteModIdInvalidMock).toHaveBeenCalledWith(23651)
    expect(recordImageFailureMock).toHaveBeenCalledWith({
      modKey: '23651',
      error: 'Nexus mod 23651 is unavailable.',
    })
    expect(persistLauncherLibraryRemoteCoverMock).not.toHaveBeenCalled()
    expect(launcherPort.writeDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'launcher.auto-cover.record-failure',
        keyValues: expect.objectContaining({
          modName: 'Hidden Cover',
          nexusModId: '23651',
          coverKey: '23651',
          stage: 'apiCover',
          error: 'Nexus mod 23651 is unavailable.',
        }),
      }),
    )
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
        nexusImages: {
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

    const { result } = renderHook(() => useLauncherLibrary(createSettings({ autoCheckModUpdates: false })), { wrapper: Wrapper })

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
    loadLauncherLibraryCoversMock.mockResolvedValueOnce(createLibraryCoversState()).mockResolvedValueOnce(
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
    scanLauncherLibraryMock.mockReturnValueOnce(firstScanRequest.promise).mockResolvedValueOnce({
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

  it('does not let a slow refresh overwrite library state saved after it started', async () => {
    const loadStateRequest = createDeferred<LauncherLibraryState>()
    let refreshPromise!: Promise<void>

    loadLauncherLibraryStateMock.mockReturnValue(loadStateRequest.promise)
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [createMod({ id: 'mod-a', labelKey: 'ModForge.A', uniqueId: 'ModForge.A' })],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })

    await act(async () => {
      refreshPromise = result.current.refresh()
      await flushAsyncWork()
    })

    await act(async () => {
      await result.current.createLibraryFolder('Gameplay')
    })

    expect(result.current.libraryFolders).toEqual([
      {
        id: 'gameplay',
        name: 'Gameplay',
        packId: null,
        hidden: false,
        parentFolderId: null,
        modKeys: [],
        coverModKeys: [],
      },
    ])

    await act(async () => {
      loadStateRequest.resolve(
        createLibraryState({
          libraryFolders: [
            {
              id: 'stale',
              name: 'Stale',
              packId: null,
              hidden: false,
              parentFolderId: null,
              modKeys: [],
              coverModKeys: [],
            },
          ],
        }),
      )
      await refreshPromise
      await flushAsyncWork()
    })

    expect(result.current.libraryFolders).toEqual([
      {
        id: 'gameplay',
        name: 'Gameplay',
        packId: null,
        hidden: false,
        parentFolderId: null,
        modKeys: [],
        coverModKeys: [],
      },
    ])
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
      expect(publishNotificationMock).toHaveBeenNthCalledWith(1, createAutoCoverNotification('Missing Cover A', 'local', 0, 1))
      expect(publishNotificationMock).toHaveBeenNthCalledWith(2, createAutoCoverNotification('Missing Cover A', 'apiCover', 0, 1))
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
      expect(publishNotificationMock).toHaveBeenCalledWith(createAutoCoverNotification('Missing Cover A', 'remoteCover', 0, 1))
    })

    await act(async () => {
      persistRequest.resolve(createLibraryCoversState())
      await flushAsyncWork()
    })

    await waitFor(() => {
      expect(publishNotificationMock).toHaveBeenCalledWith(createAutoCoverNotification('Missing Cover A', 'remoteCover', 1, 1))
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
      expect(publishNotificationMock).toHaveBeenCalledWith(createAutoCoverNotification('Gallery Cover A', 'apiGallery', 0, 1))
      expect(publishNotificationMock).toHaveBeenCalledWith(createAutoCoverNotification('Gallery Cover A', 'remoteGallery', 0, 1))
    })

    await act(async () => {
      persistRequest.resolve(createLibraryCoversState())
      await flushAsyncWork()
    })

    expect(persistLauncherLibraryRemoteCoverMock).toHaveBeenCalledWith({
      labelKey: '20599',
      imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/20599/20599-1.png',
    })
    expect(publishNotificationMock).toHaveBeenCalledWith(createAutoCoverNotification('Gallery Cover A', 'remoteGallery', 1, 1))
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
            folderClassificationMode: 'global',
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

  it('resets scopeMode to all when deleting the current pack so the list is not wiped', async () => {
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
            folderClassificationMode: 'global',
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
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    await waitFor(() => {
      expect(result.current.scopeMode).toBe('current-pack')
      expect(result.current.filteredMods.map((item) => item.id)).toEqual(['mod-a'])
    })

    await act(async () => {
      await result.current.deletePackPreset('farm')
    })

    await waitFor(() => {
      expect(result.current.scopeMode).toBe('all')
      expect(result.current.currentPackId).toBeNull()
      // Without the scope reset, filteredMods would be empty because an empty
      // pack member set combined with scopeMode 'current-pack' drops every mod.
      expect(result.current.filteredMods.map((item) => item.id)).toEqual(['mod-a', 'mod-b'])
    })
  })

  it('defaults older pack and folder JSON to global folder classification', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherRemoteModDetailMock.mockResolvedValue(createRemoteModDetail({ imageUrl: null }))
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue({
      ...createLibraryState(),
      packPresets: [{ id: 'farm', name: 'Farm', modKeys: ['ModForge.A'] }],
      libraryFolders: [
        {
          id: 'visuals',
          name: 'Visuals',
          parentFolderId: null,
          modKeys: ['ModForge.A'],
          coverModKeys: ['ModForge.A'],
        },
      ],
    } as LauncherLibraryState)
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [createMod({ id: 'mod-a', labelKey: 'ModForge.A', uniqueId: 'ModForge.A' })],
    })

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.packPresets).toEqual([
      {
        id: 'farm',
        name: 'Farm',
        modKeys: ['ModForge.A'],
        folderClassificationMode: 'global',
      },
    ])
    expect(result.current.libraryFolders).toEqual([
      {
        id: 'visuals',
        name: 'Visuals',
        packId: null,
        hidden: false,
        parentFolderId: null,
        modKeys: ['ModForge.A'],
        coverModKeys: ['ModForge.A'],
      },
    ])
  })

  it('creates and edits pack folder classification mode without changing pack membership', async () => {
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
            folderClassificationMode: 'global',
          },
        ],
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [createMod({ id: 'mod-a', labelKey: 'ModForge.A', uniqueId: 'ModForge.A' })],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    await act(async () => {
      await result.current.createPackPreset('Independent Pack', { folderClassificationMode: 'independent' })
    })
    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        packPresets: [
          {
            id: 'farm',
            name: 'Farm',
            modKeys: ['ModForge.A'],
            folderClassificationMode: 'global',
          },
          {
            id: 'independent-pack',
            name: 'Independent Pack',
            modKeys: [],
            folderClassificationMode: 'independent',
          },
        ],
      }),
    )

    await act(async () => {
      await result.current.updatePackPreset('farm', {
        name: 'Cozy Farm',
        folderClassificationMode: 'independent',
      })
    })
    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        packPresets: [
          {
            id: 'farm',
            name: 'Cozy Farm',
            modKeys: ['ModForge.A'],
            folderClassificationMode: 'independent',
          },
          {
            id: 'independent-pack',
            name: 'Independent Pack',
            modKeys: [],
            folderClassificationMode: 'independent',
          },
        ],
      }),
    )
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

    expect(saveLauncherLibraryStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storageFolders: [
          {
            id: 'unsorted',
            name: 'Unsorted',
            modKeys: [],
          },
        ],
        hiddenModKeys: ['ModForge.Visible'],
        packPresets: [],
        childModGroups: [],
        currentPackId: null,
        scopeMode: 'all',
      }),
    )
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

    expect(saveLauncherLibraryStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
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
        childModGroups: [],
        currentPackId: null,
        scopeMode: 'all',
      }),
    )
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
            folderClassificationMode: 'global',
          },
          {
            id: 'social',
            name: 'Social',
            modKeys: ['ModForge.B'],
            folderClassificationMode: 'global',
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

    expect(saveLauncherLibraryStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
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
            folderClassificationMode: 'global',
          },
          {
            id: 'social',
            name: 'Social',
            modKeys: ['ModForge.B', 'ModForge.A'],
            folderClassificationMode: 'global',
          },
        ],
        childModGroups: [],
        currentPackId: null,
        scopeMode: 'all',
      }),
    )
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
            folderClassificationMode: 'global',
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
            folderClassificationMode: 'global',
          },
          {
            id: 'social',
            name: 'Social',
            modKeys: ['ModForge.B'],
            folderClassificationMode: 'global',
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

    expect(saveLauncherLibraryStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
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
            folderClassificationMode: 'global',
          },
          {
            id: 'social',
            name: 'Social',
            modKeys: ['ModForge.B'],
            folderClassificationMode: 'global',
          },
        ],
        childModGroups: [],
        currentPackId: 'farm',
        scopeMode: 'all',
      }),
    )
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
            folderClassificationMode: 'global',
          },
          {
            id: 'social',
            name: 'Social',
            modKeys: ['ModForge.B'],
            folderClassificationMode: 'global',
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

    expect(saveLauncherLibraryStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
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
            folderClassificationMode: 'global',
          },
          {
            id: 'social',
            name: 'Social',
            modKeys: ['ModForge.B', 'ModForge.A'],
            folderClassificationMode: 'global',
          },
        ],
        childModGroups: [],
        currentPackId: null,
        scopeMode: 'all',
      }),
    )
  })

  it('persists child mod groups and flattens existing children when moving a parent under another parent', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherRemoteModDetailMock.mockResolvedValue(createRemoteModDetail({ imageUrl: null }))
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        childModGroups: [
          {
            parentModKey: 'ModForge.Parent',
            childModKeys: ['ModForge.Child'],
          },
        ],
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({ id: 'mod-new-parent', labelKey: 'ModForge.NewParent', uniqueId: 'ModForge.NewParent' }),
        createMod({ id: 'mod-parent', labelKey: 'ModForge.Parent', uniqueId: 'ModForge.Parent' }),
        createMod({ id: 'mod-child', labelKey: 'ModForge.Child', uniqueId: 'ModForge.Child' }),
      ],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    await act(async () => {
      await result.current.setChildMods('mod-new-parent', ['mod-parent'])
    })

    expect(saveLauncherLibraryStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storageFolders: [
          {
            id: 'unsorted',
            name: 'Unsorted',
            modKeys: [],
          },
        ],
        hiddenModKeys: [],
        packPresets: [],
        childModGroups: [
          {
            parentModKey: 'ModForge.NewParent',
            childModKeys: ['ModForge.Parent', 'ModForge.Child'],
          },
        ],
        currentPackId: null,
        scopeMode: 'all',
      }),
    )
  })

  it('creates virtual library folders and moves mods between them with single membership', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherRemoteModDetailMock.mockResolvedValue(createRemoteModDetail({ imageUrl: null }))
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        libraryFolders: [
          {
            id: 'visuals',
            name: 'Visuals',
            packId: null,
            hidden: false,
            parentFolderId: null,
            modKeys: ['ModForge.A'],
            coverModKeys: ['ModForge.A'],
          },
        ],
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({ id: 'mod-a', labelKey: 'ModForge.A', uniqueId: 'ModForge.A' }),
        createMod({ id: 'mod-b', labelKey: 'ModForge.B', uniqueId: 'ModForge.B' }),
      ],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    await act(async () => {
      await result.current.createLibraryFolder('Gameplay')
    })
    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        libraryFolders: [
          {
            id: 'visuals',
            name: 'Visuals',
            packId: null,
            hidden: false,
            parentFolderId: null,
            modKeys: ['ModForge.A'],
            coverModKeys: ['ModForge.A'],
          },
          {
            id: 'gameplay',
            name: 'Gameplay',
            packId: null,
            hidden: false,
            parentFolderId: null,
            modKeys: [],
            coverModKeys: [],
          },
        ],
      }),
    )

    await act(async () => {
      await result.current.addModsToLibraryFolder('gameplay', ['mod-a', 'mod-b'])
    })
    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        libraryFolders: [
          {
            id: 'visuals',
            name: 'Visuals',
            packId: null,
            hidden: false,
            parentFolderId: null,
            modKeys: [],
            coverModKeys: [],
          },
          {
            id: 'gameplay',
            name: 'Gameplay',
            packId: null,
            hidden: false,
            parentFolderId: null,
            modKeys: ['ModForge.A', 'ModForge.B'],
            coverModKeys: [],
          },
        ],
      }),
    )
  })

  it('keeps global and pack-scoped library folders independent while filtering pack folders to pack members', async () => {
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
            folderClassificationMode: 'global',
          },
        ],
        libraryFolders: [
          {
            id: 'global-visuals',
            name: 'Global Visuals',
            packId: null,
            hidden: false,
            parentFolderId: null,
            modKeys: ['ModForge.A'],
            coverModKeys: ['ModForge.A'],
          },
          {
            id: 'pack-visuals',
            name: 'Pack Visuals',
            packId: 'farm',
            hidden: false,
            parentFolderId: null,
            modKeys: ['ModForge.A', 'ModForge.B'],
            coverModKeys: ['ModForge.A', 'ModForge.B'],
          },
          {
            id: 'pack-gameplay',
            name: 'Pack Gameplay',
            packId: 'farm',
            hidden: false,
            parentFolderId: null,
            modKeys: [],
            coverModKeys: [],
          },
        ],
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({ id: 'mod-a', labelKey: 'ModForge.A', uniqueId: 'ModForge.A' }),
        createMod({ id: 'mod-b', labelKey: 'ModForge.B', uniqueId: 'ModForge.B' }),
      ],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.libraryFolders).toEqual([
      {
        id: 'global-visuals',
        name: 'Global Visuals',
        packId: null,
        hidden: false,
        parentFolderId: null,
        modKeys: ['ModForge.A'],
        coverModKeys: ['ModForge.A'],
      },
      {
        id: 'pack-visuals',
        name: 'Pack Visuals',
        packId: 'farm',
        hidden: false,
        parentFolderId: null,
        modKeys: ['ModForge.A'],
        coverModKeys: ['ModForge.A'],
      },
      {
        id: 'pack-gameplay',
        name: 'Pack Gameplay',
        packId: 'farm',
        hidden: false,
        parentFolderId: null,
        modKeys: [],
        coverModKeys: [],
      },
    ])

    await act(async () => {
      await result.current.addModsToLibraryFolder('pack-gameplay', ['mod-a', 'mod-b'])
    })

    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        libraryFolders: [
          {
            id: 'global-visuals',
            name: 'Global Visuals',
            packId: null,
            hidden: false,
            parentFolderId: null,
            modKeys: ['ModForge.A'],
            coverModKeys: ['ModForge.A'],
          },
          {
            id: 'pack-visuals',
            name: 'Pack Visuals',
            packId: 'farm',
            hidden: false,
            parentFolderId: null,
            modKeys: [],
            coverModKeys: [],
          },
          {
            id: 'pack-gameplay',
            name: 'Pack Gameplay',
            packId: 'farm',
            hidden: false,
            parentFolderId: null,
            modKeys: ['ModForge.A'],
            coverModKeys: [],
          },
        ],
      }),
    )
  })

  it('creates pack-scoped library folders when a pack id is provided', async () => {
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
            folderClassificationMode: 'global',
          },
        ],
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [createMod({ id: 'mod-a', labelKey: 'ModForge.A', uniqueId: 'ModForge.A' })],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    await act(async () => {
      await result.current.createLibraryFolder('Pack Folder', { packId: 'farm' })
    })

    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        libraryFolders: [
          {
            id: 'pack-folder',
            name: 'Pack Folder',
            packId: 'farm',
            hidden: false,
            parentFolderId: null,
            modKeys: [],
            coverModKeys: [],
          },
        ],
      }),
    )
  })

  it('hides and shows only global virtual library folders', async () => {
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
            folderClassificationMode: 'global',
          },
        ],
        libraryFolders: [
          {
            id: 'global-visuals',
            name: 'Global Visuals',
            packId: null,
            hidden: false,
            parentFolderId: null,
            modKeys: ['ModForge.A'],
            coverModKeys: ['ModForge.A'],
          },
          {
            id: 'pack-visuals',
            name: 'Pack Visuals',
            packId: 'farm',
            hidden: true,
            parentFolderId: null,
            modKeys: ['ModForge.A'],
            coverModKeys: ['ModForge.A'],
          },
        ],
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [createMod({ id: 'mod-a', labelKey: 'ModForge.A', uniqueId: 'ModForge.A' })],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.libraryFolders).toEqual([
      {
        id: 'global-visuals',
        name: 'Global Visuals',
        packId: null,
        hidden: false,
        parentFolderId: null,
        modKeys: ['ModForge.A'],
        coverModKeys: ['ModForge.A'],
      },
      {
        id: 'pack-visuals',
        name: 'Pack Visuals',
        packId: 'farm',
        hidden: false,
        parentFolderId: null,
        modKeys: ['ModForge.A'],
        coverModKeys: ['ModForge.A'],
      },
    ])

    await act(async () => {
      await result.current.hideLibraryFolder('global-visuals')
    })
    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hiddenModKeys: [],
        libraryFolders: [
          {
            id: 'global-visuals',
            name: 'Global Visuals',
            packId: null,
            hidden: true,
            parentFolderId: null,
            modKeys: ['ModForge.A'],
            coverModKeys: ['ModForge.A'],
          },
          {
            id: 'pack-visuals',
            name: 'Pack Visuals',
            packId: 'farm',
            hidden: false,
            parentFolderId: null,
            modKeys: ['ModForge.A'],
            coverModKeys: ['ModForge.A'],
          },
        ],
      }),
    )

    await act(async () => {
      await result.current.showLibraryFolder('global-visuals')
    })
    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        libraryFolders: [
          {
            id: 'global-visuals',
            name: 'Global Visuals',
            packId: null,
            hidden: false,
            parentFolderId: null,
            modKeys: ['ModForge.A'],
            coverModKeys: ['ModForge.A'],
          },
          {
            id: 'pack-visuals',
            name: 'Pack Visuals',
            packId: 'farm',
            hidden: false,
            parentFolderId: null,
            modKeys: ['ModForge.A'],
            coverModKeys: ['ModForge.A'],
          },
        ],
      }),
    )

    await act(async () => {
      await result.current.hideLibraryFolder('pack-visuals')
    })
    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        libraryFolders: [
          {
            id: 'global-visuals',
            name: 'Global Visuals',
            packId: null,
            hidden: false,
            parentFolderId: null,
            modKeys: ['ModForge.A'],
            coverModKeys: ['ModForge.A'],
          },
          {
            id: 'pack-visuals',
            name: 'Pack Visuals',
            packId: 'farm',
            hidden: false,
            parentFolderId: null,
            modKeys: ['ModForge.A'],
            coverModKeys: ['ModForge.A'],
          },
        ],
      }),
    )
  })

  it('renames virtual library folders without changing membership', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherRemoteModDetailMock.mockResolvedValue(createRemoteModDetail({ imageUrl: null }))
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        libraryFolders: [
          {
            id: 'gameplay',
            name: 'Gameplay',
            packId: null,
            hidden: false,
            parentFolderId: null,
            modKeys: ['ModForge.A'],
            coverModKeys: ['ModForge.A'],
          },
        ],
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [createMod({ id: 'mod-a', labelKey: 'ModForge.A', uniqueId: 'ModForge.A' })],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    await act(async () => {
      await result.current.renameLibraryFolder('gameplay', 'Core Gameplay')
    })

    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        libraryFolders: [
          {
            id: 'gameplay',
            name: 'Core Gameplay',
            packId: null,
            hidden: false,
            parentFolderId: null,
            modKeys: ['ModForge.A'],
            coverModKeys: ['ModForge.A'],
          },
        ],
      }),
    )
  })

  it('sets explicit mod ids enabled without relying on selection state', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherRemoteModDetailMock.mockResolvedValue(createRemoteModDetail({ imageUrl: null }))
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({ id: 'mod-a', labelKey: 'ModForge.A', uniqueId: 'ModForge.A', enabled: true, absolutePath: 'E:\\Mods\\A' }),
        createMod({ id: 'mod-b', labelKey: 'ModForge.B', uniqueId: 'ModForge.B', enabled: false, absolutePath: 'E:\\Mods\\B' }),
      ],
    })
    setLauncherModEnabledMock.mockResolvedValue({ absolutePath: 'E:\\Mods\\A', enabled: false })

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    await act(async () => {
      await result.current.setModsEnabled(['mod-a', 'mod-b'], false)
    })

    expect(setLauncherModEnabledMock).toHaveBeenCalledTimes(1)
    expect(setLauncherModEnabledMock).toHaveBeenCalledWith({
      modPath: 'E:\\Mods\\A',
      enabled: false,
    })
  })

  it('nests virtual library folders and rejects cycles', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherRemoteModDetailMock.mockResolvedValue(createRemoteModDetail({ imageUrl: null }))
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        libraryFolders: [
          { id: 'root', name: 'Root', packId: null, hidden: false, parentFolderId: null, modKeys: [], coverModKeys: [] },
          { id: 'child', name: 'Child', packId: null, hidden: false, parentFolderId: null, modKeys: [], coverModKeys: [] },
        ],
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [createMod()],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    await act(async () => {
      await result.current.moveLibraryFolderToFolder('child', 'root')
    })
    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        libraryFolders: [
          { id: 'root', name: 'Root', packId: null, hidden: false, parentFolderId: null, modKeys: [], coverModKeys: [] },
          { id: 'child', name: 'Child', packId: null, hidden: false, parentFolderId: 'root', modKeys: [], coverModKeys: [] },
        ],
      }),
    )

    await act(async () => {
      await result.current.moveLibraryFolderToFolder('root', 'child')
    })
    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        libraryFolders: [
          { id: 'root', name: 'Root', packId: null, hidden: false, parentFolderId: null, modKeys: [], coverModKeys: [] },
          { id: 'child', name: 'Child', packId: null, hidden: false, parentFolderId: null, modKeys: [], coverModKeys: [] },
        ],
      }),
    )
  })

  it('cascades parent enable toggles to direct children without cascading child toggles upward', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherRemoteModDetailMock.mockResolvedValue(createRemoteModDetail({ imageUrl: null }))
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        childModGroups: [{ parentModKey: 'ModForge.Parent', childModKeys: ['ModForge.Child'] }],
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-parent',
          labelKey: 'ModForge.Parent',
          uniqueId: 'ModForge.Parent',
          enabled: true,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Parent',
        }),
        createMod({
          id: 'mod-child',
          labelKey: 'ModForge.Child',
          uniqueId: 'ModForge.Child',
          enabled: true,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Child',
        }),
      ],
    })

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    await act(async () => {
      await result.current.toggleEnabled(result.current.mods[0]!)
    })

    expect(setLauncherModEnabledMock).toHaveBeenCalledWith({
      modPath: 'E:\\Games\\Stardew Valley\\Mods\\Parent',
      enabled: false,
    })
    expect(setLauncherModEnabledMock).toHaveBeenCalledWith({
      modPath: 'E:\\Games\\Stardew Valley\\Mods\\Child',
      enabled: false,
    })

    setLauncherModEnabledMock.mockClear()
    await act(async () => {
      await result.current.toggleEnabled(result.current.mods[1]!)
    })

    expect(setLauncherModEnabledMock).toHaveBeenCalledTimes(1)
    expect(setLauncherModEnabledMock).toHaveBeenCalledWith({
      modPath: 'E:\\Games\\Stardew Valley\\Mods\\Child',
      enabled: false,
    })
  })

  it('expands parent mods to children for hide, pack add, pack replace, and pack apply', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherRemoteModDetailMock.mockResolvedValue(createRemoteModDetail({ imageUrl: null }))
    persistLauncherLibraryRemoteCoverMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        packPresets: [{ id: 'farm', name: 'Farm', modKeys: [], folderClassificationMode: 'global' }],
        currentPackId: 'farm',
        childModGroups: [{ parentModKey: 'ModForge.Parent', childModKeys: ['ModForge.Child'] }],
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-parent',
          labelKey: 'ModForge.Parent',
          uniqueId: 'ModForge.Parent',
          enabled: false,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Parent',
        }),
        createMod({
          id: 'mod-child',
          labelKey: 'ModForge.Child',
          uniqueId: 'ModForge.Child',
          enabled: false,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Child',
        }),
      ],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    await act(async () => {
      await result.current.hideMods(['mod-parent'])
    })
    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hiddenModKeys: ['ModForge.Parent', 'ModForge.Child'],
      }),
    )

    await act(async () => {
      await result.current.addModsToPack('farm', ['mod-parent'])
    })
    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        packPresets: [
          {
            id: 'farm',
            name: 'Farm',
            modKeys: ['ModForge.Parent', 'ModForge.Child'],
            folderClassificationMode: 'global',
          },
        ],
      }),
    )

    await act(async () => {
      await result.current.replacePackMods('farm', ['mod-parent'])
    })
    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        packPresets: [
          {
            id: 'farm',
            name: 'Farm',
            modKeys: ['ModForge.Parent', 'ModForge.Child'],
            folderClassificationMode: 'global',
          },
        ],
      }),
    )

    await act(async () => {
      await result.current.applyCurrentPack()
    })
    expect(setLauncherModEnabledMock).toHaveBeenCalledWith({
      modPath: 'E:\\Games\\Stardew Valley\\Mods\\Parent',
      enabled: true,
    })
    expect(setLauncherModEnabledMock).toHaveBeenCalledWith({
      modPath: 'E:\\Games\\Stardew Valley\\Mods\\Child',
      enabled: true,
    })
  })

  it('persists custom container order changes', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        customOrders: {
          'view:all': ['m:Mod.Alpha', 'm:Mod.Beta'],
        },
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({ id: 'mod-a', labelKey: 'Mod.Alpha', uniqueId: 'Mod.Alpha' }),
        createMod({ id: 'mod-b', labelKey: 'Mod.Beta', uniqueId: 'Mod.Beta' }),
      ],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    await act(async () => {
      await result.current.reorderCustomOrder('view:all', 'm:Mod.Beta', '__start__', ['m:Mod.Alpha', 'm:Mod.Beta'])
    })

    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        customOrders: {
          'view:all': ['m:Mod.Beta', 'm:Mod.Alpha'],
        },
      }),
    )
  })

  it('queues custom reorder saves and computes each reorder from the latest persisted state', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        customOrders: {
          'view:all': ['m:Mod.Alpha', 'm:Mod.Beta', 'm:Mod.Core'],
        },
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({ id: 'mod-a', labelKey: 'Mod.Alpha', uniqueId: 'Mod.Alpha' }),
        createMod({ id: 'mod-b', labelKey: 'Mod.Beta', uniqueId: 'Mod.Beta' }),
        createMod({ id: 'mod-c', labelKey: 'Mod.Core', uniqueId: 'Mod.Core' }),
      ],
    })
    const firstSave = createDeferred<LauncherLibraryState>()
    saveLauncherLibraryStateMock.mockImplementationOnce(() => firstSave.promise).mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    let firstReorder!: Promise<void>
    let secondReorder!: Promise<void>
    await act(async () => {
      firstReorder = result.current.reorderCustomOrder('view:all', 'm:Mod.Core', '__start__', ['m:Mod.Alpha', 'm:Mod.Beta', 'm:Mod.Core'])
      secondReorder = result.current.reorderCustomOrder('view:all', 'm:Mod.Beta', 'm:Mod.Core', ['m:Mod.Alpha', 'm:Mod.Beta', 'm:Mod.Core'])
      await Promise.resolve()
    })

    expect(saveLauncherLibraryStateMock).toHaveBeenCalledTimes(1)
    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        customOrders: {
          'view:all': ['m:Mod.Core', 'm:Mod.Alpha', 'm:Mod.Beta'],
        },
      }),
    )

    await act(async () => {
      firstSave.resolve(
        createLibraryState({
          customOrders: {
            'view:all': ['m:Mod.Core', 'm:Mod.Alpha', 'm:Mod.Beta'],
          },
        }),
      )
      await firstReorder
      await secondReorder
    })

    expect(saveLauncherLibraryStateMock).toHaveBeenCalledTimes(2)
    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        customOrders: {
          'view:all': ['m:Mod.Core', 'm:Mod.Beta', 'm:Mod.Alpha'],
        },
      }),
    )
  })

  it('normalizes custom orders to the active root and folder containers', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        packPresets: [{ id: 'farm', name: 'Farm', modKeys: [], folderClassificationMode: 'global' }],
        libraryFolders: [
          {
            id: 'visual',
            name: 'Visual',
            packId: null,
            hidden: false,
            parentFolderId: null,
            modKeys: ['ModForge.A'],
            coverModKeys: [],
          },
          {
            id: 'extras',
            name: 'Extras',
            packId: null,
            hidden: false,
            parentFolderId: 'visual',
            modKeys: ['ModForge.B'],
            coverModKeys: [],
          },
          {
            id: 'orphan',
            name: 'Orphan',
            packId: null,
            hidden: false,
            parentFolderId: null,
            modKeys: ['ModForge.C'],
            coverModKeys: [],
          },
        ],
        customOrders: {
          'view:all': ['f:extras', 'f:visual', 'm:ModForge.A', 'f:missing', 'm:ModForge.A', 'bad'],
          'view:pack:FARM': ['f:extras', 'f:orphan', 'm:ModForge.A'],
          'folder:visual': ['f:orphan', 'f:extras', 'm:ModForge.A', 'm:ModForge.Z'],
          'folder:extras': ['f:visual', 'm:ModForge.B'],
          'folder:missing': ['m:ModForge.A'],
        },
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({ id: 'mod-a', labelKey: 'ModForge.A', uniqueId: 'ModForge.A' }),
        createMod({ id: 'mod-b', labelKey: 'ModForge.B', uniqueId: 'ModForge.B' }),
      ],
    })

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.customOrders).toEqual({
      'folder:extras': ['m:ModForge.B'],
      'folder:visual': ['f:extras', 'm:ModForge.A'],
      'view:all': ['f:visual', 'm:ModForge.A'],
      'view:pack:farm': ['f:orphan', 'm:ModForge.A'],
    })
  })

  it('persists child mod reorder changes on the parent group', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        childModGroups: [{ parentModKey: 'ModForge.Parent', childModKeys: ['ModForge.A', 'ModForge.B'] }],
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({ id: 'mod-parent', labelKey: 'ModForge.Parent', uniqueId: 'ModForge.Parent' }),
        createMod({ id: 'mod-a', labelKey: 'ModForge.A', uniqueId: 'ModForge.A' }),
        createMod({ id: 'mod-b', labelKey: 'ModForge.B', uniqueId: 'ModForge.B' }),
      ],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    await act(async () => {
      await result.current.reorderChildMods('ModForge.Parent', 'm:ModForge.B', '__start__')
    })

    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        childModGroups: [{ parentModKey: 'ModForge.Parent', childModKeys: ['ModForge.B', 'ModForge.A'] }],
      }),
    )
  })

  it('queues child mod reorder saves and computes each reorder from the latest persisted state', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        childModGroups: [{ parentModKey: 'ModForge.Parent', childModKeys: ['ModForge.A', 'ModForge.B', 'ModForge.C'] }],
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({ id: 'mod-parent', labelKey: 'ModForge.Parent', uniqueId: 'ModForge.Parent' }),
        createMod({ id: 'mod-a', labelKey: 'ModForge.A', uniqueId: 'ModForge.A' }),
        createMod({ id: 'mod-b', labelKey: 'ModForge.B', uniqueId: 'ModForge.B' }),
        createMod({ id: 'mod-c', labelKey: 'ModForge.C', uniqueId: 'ModForge.C' }),
      ],
    })
    const firstSave = createDeferred<LauncherLibraryState>()
    saveLauncherLibraryStateMock.mockImplementationOnce(() => firstSave.promise).mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })
    await act(async () => {
      await result.current.refresh()
    })

    let firstReorder!: Promise<void>
    let secondReorder!: Promise<void>
    await act(async () => {
      firstReorder = result.current.reorderChildMods('ModForge.Parent', 'm:ModForge.C', '__start__')
      secondReorder = result.current.reorderChildMods('ModForge.Parent', 'm:ModForge.B', 'm:ModForge.C')
      await Promise.resolve()
    })

    expect(saveLauncherLibraryStateMock).toHaveBeenCalledTimes(1)
    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        childModGroups: [{ parentModKey: 'ModForge.Parent', childModKeys: ['ModForge.C', 'ModForge.A', 'ModForge.B'] }],
      }),
    )

    await act(async () => {
      firstSave.resolve(
        createLibraryState({
          childModGroups: [{ parentModKey: 'ModForge.Parent', childModKeys: ['ModForge.C', 'ModForge.A', 'ModForge.B'] }],
        }),
      )
      await firstReorder
      await secondReorder
    })

    expect(saveLauncherLibraryStateMock).toHaveBeenCalledTimes(2)
    expect(saveLauncherLibraryStateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        childModGroups: [{ parentModKey: 'ModForge.Parent', childModKeys: ['ModForge.C', 'ModForge.B', 'ModForge.A'] }],
      }),
    )
  })

  it('installArchive resolves with the install result even when a follow-up refresh would fail', async () => {
    loadLauncherLibraryCoversMock.mockResolvedValue(createLibraryCoversState())
    loadLauncherLibraryStateMock.mockResolvedValue(createLibraryState())
    installLauncherArchiveMock.mockResolvedValue(createInstallArchiveResult())
    scanLauncherLibraryMock.mockRejectedValue(new Error('Refresh failed'))

    const { result } = renderHook(() => useLauncherLibrary(createSettings()), { wrapper: Wrapper })

    await act(async () => {
      await expect(result.current.installArchive('E:\\Downloads\\example.zip')).resolves.toEqual(createInstallArchiveResult())
    })

    expect(installLauncherArchiveMock).toHaveBeenCalledWith({
      archivePath: 'E:\\Downloads\\example.zip',
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    })
  })
})
