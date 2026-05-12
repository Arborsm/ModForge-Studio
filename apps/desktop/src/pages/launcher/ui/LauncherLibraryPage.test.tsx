import type { ReactElement, ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import { LocaleProvider } from '@locales/localeContext'
import type {
  InspectLauncherArchiveResult,
  InstallLauncherArchiveResult,
  LauncherInstallBackupSummary,
  LauncherLibraryModSummary,
  LauncherSettings,
} from '@platform/desktop'
import {
  chooseArchiveFile,
  chooseImageFile,
  inspectLauncherArchive,
  listenToLauncherArchiveDragDrop,
  listLauncherInstallBackups,
  loadLauncherRemoteModDetail,
  openLauncherUrl,
  openLauncherPath,
  resolveLauncherImage,
  restoreLauncherInstallBackup,
  setLauncherLibraryCover,
} from '@platform/desktop'
import { useLauncherLibrary } from '@features/launcher'
import { createMockLauncherPort } from '@test/launcherTestPort.ts'
import { LauncherTestWrapper } from '@test/launcherTestWrapper.tsx'
import { LauncherLibraryPage } from './LauncherLibraryPage'
import type { LauncherPort } from '@features/launcher/model/launcherPort'

const archiveDragDropListeners: Array<
  (payload: { type: string; paths?: string[]; position?: { x: number; y: number } }) => void | Promise<void>
> = []

vi.mock('@radix-ui/react-context-menu', async () => {
  function Root({ children }: { children: ReactNode }) {
    return <>{children}</>
  }

  function Trigger({ asChild, children }: { asChild?: boolean; children: ReactElement }) {
    return asChild ? children : <div>{children}</div>
  }

  function Portal({ children }: { children: ReactNode }) {
    return <>{children}</>
  }

  function Content({ children }: { children: ReactNode }) {
    return <div role="menu">{children}</div>
  }

  function Item({
    children,
    onSelect,
    className,
  }: {
    children: ReactNode
    onSelect?: () => void
    className?: string
  }) {
    return (
      <button type="button" role="menuitem" className={className} onClick={onSelect}>
        {children}
      </button>
    )
  }

  return {
    Root,
    Trigger,
    Portal,
    Content,
    Item,
  }
})

vi.mock('@platform/desktop', async () => {
  const actual = await vi.importActual<typeof import('@platform/desktop')>('@platform/desktop')
  return {
    ...actual,
    chooseArchiveFile: vi.fn(),
    chooseImageFile: vi.fn(),
    inspectLauncherArchive: vi.fn(),
    listenToLauncherArchiveDragDrop: vi.fn(async (listener) => {
      archiveDragDropListeners.push(listener)
      return () => {
        const index = archiveDragDropListeners.indexOf(listener)
        if (index >= 0) {
          archiveDragDropListeners.splice(index, 1)
        }
      }
    }),
    listLauncherInstallBackups: vi.fn(),
    loadLauncherRemoteModDetail: vi.fn(),
    openLauncherUrl: vi.fn(),
    openLauncherPath: vi.fn(),
    resolveLauncherImage: vi.fn(),
    restoreLauncherInstallBackup: vi.fn(),
    setLauncherLibraryCover: vi.fn(),
  }
})

vi.mock('@features/launcher', async () => {
  const actual = await vi.importActual<typeof import('@features/launcher')>('@features/launcher')
  return {
    ...actual,
    useLauncherLibrary: vi.fn(),
  }
})

vi.mock('@shared/ui/notifications', () => ({
  publishNotification: vi.fn(),
  dismissNotification: vi.fn(),
}))

type MockLibraryState = ReturnType<typeof useLauncherLibrary>

const chooseArchiveFileMock = vi.mocked(chooseArchiveFile)
const chooseImageFileMock = vi.mocked(chooseImageFile)
const inspectLauncherArchiveMock = vi.mocked(inspectLauncherArchive)
const listenToLauncherArchiveDragDropMock = vi.mocked(listenToLauncherArchiveDragDrop)
const listLauncherInstallBackupsMock = vi.mocked(listLauncherInstallBackups)
const loadLauncherRemoteModDetailMock = vi.mocked(loadLauncherRemoteModDetail)
const openLauncherUrlMock = vi.mocked(openLauncherUrl)
const openLauncherPathMock = vi.mocked(openLauncherPath)
const resolveLauncherImageMock = vi.mocked(resolveLauncherImage)
const restoreLauncherInstallBackupMock = vi.mocked(restoreLauncherInstallBackup)
const setLauncherLibraryCoverMock = vi.mocked(setLauncherLibraryCover)
const useLauncherLibraryMock = vi.mocked(useLauncherLibrary)
const dismissNotificationMock = vi.mocked(dismissNotification)
const publishNotificationMock = vi.mocked(publishNotification)
let launcherPort: LauncherPort

function createLauncherDiagnosticsResult() {
  return {
    routes: [
      {
        routeId: 'publicGraphql',
        label: 'Nexus Public GraphQL',
        endpoint: 'https://api.nexusmods.com/v2/graphql',
        status: 'success' as const,
        available: true,
        message: 'Connected after 1 attempt.',
        attempts: 1,
        maxAttempts: 3,
      },
    ],
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

async function emitArchiveDragDrop(payload: {
  type: string
  paths?: string[]
  position?: { x: number; y: number }
}) {
  for (const listener of archiveDragDropListeners) {
    await listener(payload)
  }
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
  }
}

function createLibraryMod(
  overrides: Partial<LauncherLibraryModSummary> = {},
): LauncherLibraryModSummary {
  return {
    id: 'mod-1',
    labelKey: 'ModForge.NpcAdventures',
    name: 'NPC Adventures',
    author: 'ModForge',
    version: '1.0.0',
    description: 'Example mod.',
    uniqueId: 'ModForge.NpcAdventures',
    folderName: 'NPC Adventures',
    absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\NPC Adventures',
    enabled: true,
    nexusModId: 101,
    updateKeys: ['Nexus:101'],
    modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
    imageUrl: null,
    missingRequiredDependencies: [],
    ...overrides,
  }
}

function createArchivePreview(overrides: Partial<InspectLauncherArchiveResult> = {}): InspectLauncherArchiveResult {
  return {
    archivePath: 'E:\\Downloads\\preview.zip',
    archiveFileName: 'preview.zip',
    totalEntries: 4,
    totalFiles: 3,
    modRoots: ['ExamplePack'],
    tree: [
      {
        name: 'ExamplePack',
        path: 'ExamplePack',
        isDirectory: true,
        sizeBytes: null,
        children: [
          {
            name: 'manifest.json',
            path: 'ExamplePack/manifest.json',
            isDirectory: false,
            sizeBytes: 128,
            children: [],
          },
        ],
      },
    ],
    ...overrides,
  }
}

function createInstallArchiveResult(
  overrides: Partial<InstallLauncherArchiveResult> = {},
): InstallLauncherArchiveResult {
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
      {
        modName: 'Example Pack Chinese',
        uniqueId: 'ModForge.ExamplePack.zh',
        version: '1.0.0',
        targetPath: 'E:\\Games\\Stardew Valley\\Mods\\[CP] Example Pack [zh]',
        preservedConfig: false,
        preservedI18nFiles: 1,
      },
    ],
    backupId: 'install-123',
    backupPath: 'E:\\Games\\Stardew Valley\\Backups\\install-123',
    ...overrides,
  }
}

function createInstallBackupSummary(
  overrides: Partial<LauncherInstallBackupSummary> = {},
): LauncherInstallBackupSummary {
  return {
    backupId: 'install-123',
    backupPath: 'E:\\Games\\Stardew Valley\\Backups\\install-123',
    ...overrides,
  }
}

function createLibraryState(): MockLibraryState {
  const primaryMod = createLibraryMod()
  const secondaryMod = createLibraryMod({
    id: 'mod-2',
    labelKey: 'ModForge.VintageInterface',
    name: 'Vintage Interface Redux',
    author: 'Willow Works',
    version: '3.8.1',
    uniqueId: 'ModForge.VintageInterface',
    absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Vintage Interface Redux',
    enabled: false,
  })

  return {
    mods: [primaryMod, secondaryMod],
    filteredMods: [primaryMod, secondaryMod],
    hiddenModKeys: [],
    selectedMod: primaryMod,
    selectedModId: 'mod-1',
    selectedModIds: [],
    setSelectedModIds: vi.fn(),
    filterText: '',
    enabledOnly: false,
    state: 'ready' as const,
    error: null,
    selectionCount: 0,
    scopeMode: 'all',
    setScopeMode: vi.fn(async () => {}),
    currentPackId: 'story-pack',
    currentPack: {
      id: 'story-pack',
      name: 'Story Pack',
      modKeys: ['ModForge.NpcAdventures'],
    },
    storageFolders: [
      {
        id: 'primary',
        name: 'Primary Mods',
        modKeys: ['ModForge.NpcAdventures'],
      },
    ],
    activeStorageFolder: {
      id: 'primary',
      name: 'Primary Mods',
      modKeys: ['ModForge.NpcAdventures'],
    },
    packPresets: [
      {
        id: 'story-pack',
        name: 'Story Pack',
        modKeys: ['ModForge.NpcAdventures'],
      },
      {
        id: 'challenge-pack',
        name: 'Challenge Pack',
        modKeys: ['ModForge.VintageInterface'],
      },
    ],
    setSelectedModId: vi.fn(),
    setFilterText: vi.fn(),
    setEnabledOnly: vi.fn(),
    refresh: vi.fn(async () => {}),
    toggleEnabled: vi.fn(async () => {}),
    installArchive: vi.fn(async () => createInstallArchiveResult()),
    toggleModSelection: vi.fn(),
    clearSelection: vi.fn(),
    selectAllFiltered: vi.fn(),
    assignSelectionToFolder: vi.fn(async () => {}),
    createStorageFolder: vi.fn(async () => {}),
    renameStorageFolder: vi.fn(async () => {}),
    deleteStorageFolder: vi.fn(async () => {}),
    addSelectionToPack: vi.fn(async () => {}),
    addModsToPack: vi.fn(async () => {}),
    createPackPreset: vi.fn(async () => {}),
    renamePackPreset: vi.fn(async () => {}),
    deletePackPreset: vi.fn(async () => {}),
    replacePackMods: vi.fn(async () => {}),
    hideMods: vi.fn(async () => {}),
    showMods: vi.fn(async () => {}),
    setCurrentPackId: vi.fn(async () => {}),
    applyCurrentPack: vi.fn(async () => {}),
    setSelectionEnabled: vi.fn(async () => {}),
    selectNextSearchMatch: vi.fn(),
    selectPreviousSearchMatch: vi.fn(),
  } as unknown as MockLibraryState
}

function createLargeLibraryState(count = 80): MockLibraryState {
  const library = createLibraryState()
  const mods = Array.from({ length: count }, (_, index) =>
    createLibraryMod({
      id: `mod-${index + 1}`,
      labelKey: `ModForge.Mod${index + 1}`,
      name: `Large Library Mod ${index + 1}`,
      author: `Author ${index + 1}`,
      version: `1.${index}.0`,
      uniqueId: `ModForge.Mod${index + 1}`,
      absolutePath: `E:\\Games\\Stardew Valley\\Mods\\Large Library Mod ${index + 1}`,
      enabled: index % 3 !== 0,
    }),
  )

  return {
    ...library,
    mods,
    filteredMods: mods,
    selectedMod: mods[0],
    selectedModId: mods[0]?.id ?? null,
    currentPack: null,
    currentPackId: null,
    packPresets: [],
  } as MockLibraryState
}

function renderLibraryPage(overrides: Partial<Parameters<typeof LauncherLibraryPage>[0]> = {}) {
  const onLaunchGame = vi.fn()
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <LauncherTestWrapper port={launcherPort}>
        <LocaleProvider locale="en-US">{children}</LocaleProvider>
      </LauncherTestWrapper>
    )
  }

  const view = render(
    <LauncherLibraryPage
      settings={createSettings()}
      launchGameLabel="Launch Game"
      launchGameDisabled={false}
      launchGameBusy={false}
      onLaunchGame={onLaunchGame}
      {...overrides}
    />,
    { wrapper: Wrapper },
  )

  return {
    ...view,
    onLaunchGame,
  }
}

describe('LauncherLibraryPage', () => {
  afterEach(() => {
    archiveDragDropListeners.length = 0
    cleanup()
    vi.clearAllMocks()
  })

  beforeEach(() => {
    launcherPort = createMockLauncherPort({
      chooseArchiveFile: chooseArchiveFileMock,
      chooseImageFile: chooseImageFileMock,
      inspectArchive: inspectLauncherArchiveMock,
      listInstallBackups: listLauncherInstallBackupsMock,
      loadRemoteModDetail: loadLauncherRemoteModDetailMock,
      openPath: openLauncherPathMock,
      openUrl: openLauncherUrlMock,
      resolveImage: resolveLauncherImageMock,
      restoreInstallBackup: restoreLauncherInstallBackupMock,
      setLibraryCover: setLauncherLibraryCoverMock,
      subscribeUpdates: vi.fn().mockReturnValue(() => {}),
      loadCachedUpdates: vi.fn().mockResolvedValue(null),
      checkUpdates: vi.fn().mockResolvedValue({
        modsPath: 'E:\\Games\\Stardew Valley\\Mods',
        checkedAtMs: 0,
        updates: [],
      }),
      loadNexusDiagnostics: vi.fn().mockResolvedValue(createLauncherDiagnosticsResult()),
    })
  })

  it('does not refresh on mount when the library content is already ready for the current mods path', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage({
      settings: createSettings({
        modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      }),
    })

    await waitFor(() => {
      expect(screen.getByText('NPC Adventures')).toBeTruthy()
    })

    expect(library.refresh).not.toHaveBeenCalled()
  })

  it('renders the refreshed console card with inline launch and pack controls', () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    const { container } = renderLibraryPage()

    expect(screen.getByRole('button', { name: 'Pack Management' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Story Pack' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Refresh' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Open Storage Folder' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Install Archive' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Launch Game' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Apply Pack' })).toBeNull()
    expect(container.querySelector('.launcher-library-page > .launcher-library-console')).not.toBeNull()
    expect(container.querySelector('.launcher-library-shell > .launcher-library-sidebar')).not.toBeNull()
    expect(container.querySelector('.launcher-library-shell > .launcher-library-content')).not.toBeNull()
    expect(container.querySelector('.launcher-library-shell .launcher-library-console')).toBeNull()
  })

  it('shows an install overlay for multiple supported external archives and hides it on leave', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    expect(listenToLauncherArchiveDragDropMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Release to Preview Archives')).toBeNull()

    await act(async () => {
      await emitArchiveDragDrop({
        type: 'enter',
        paths: ['E:\\Downloads\\example.7z', 'E:\\Downloads\\second.zip'],
        position: { x: 160, y: 240 },
      })
    })

    expect(screen.getByText('Release to Preview Archives')).not.toBeNull()
    expect(screen.getByText('Drop one or more archives to install. Supported formats: .zip, .7z, .rar, .tar.gz, .tgz, .tar')).not.toBeNull()

    await act(async () => {
      await emitArchiveDragDrop({ type: 'leave' })
    })

    expect(screen.queryByText('Release to Preview Archives')).toBeNull()
  })

  it('inspects a supported archive dropped on the library page', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)
    inspectLauncherArchiveMock.mockResolvedValue(
      createArchivePreview({
        archivePath: 'E:\\Downloads\\preview.7z',
        archiveFileName: 'preview.7z',
      }),
    )

    renderLibraryPage()

    await act(async () => {
      await emitArchiveDragDrop({
        type: 'drop',
        paths: ['E:\\Downloads\\preview.7z'],
        position: { x: 180, y: 260 },
      })
    })

    await waitFor(() => {
      expect(inspectLauncherArchiveMock).toHaveBeenCalledWith({ archivePath: 'E:\\Downloads\\preview.7z' })
    })

    expect(await screen.findByRole('dialog', { name: 'Archive Preview' })).not.toBeNull()
  })

  it('previews multiple supported archives, lets the user switch previews, and installs them after confirmation', async () => {
    const library = createLibraryState()
    const installArchiveMock = vi.mocked(library.installArchive)
    inspectLauncherArchiveMock
      .mockResolvedValueOnce(
        createArchivePreview({
          archivePath: 'E:\\Downloads\\a.zip',
          archiveFileName: 'a.zip',
          modRoots: ['First Pack'],
          tree: [
            {
              name: 'First Pack',
              path: 'First Pack',
              isDirectory: true,
              sizeBytes: null,
              children: [
                {
                  name: 'manifest.json',
                  path: 'First Pack/manifest.json',
                  isDirectory: false,
                  sizeBytes: 128,
                  children: [],
                },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createArchivePreview({
          archivePath: 'E:\\Downloads\\b.zip',
          archiveFileName: 'b.zip',
          modRoots: ['Second Pack'],
          tree: [
            {
              name: 'Second Pack',
              path: 'Second Pack',
              isDirectory: true,
              sizeBytes: null,
              children: [
                {
                  name: 'manifest.json',
                  path: 'Second Pack/manifest.json',
                  isDirectory: false,
                  sizeBytes: 128,
                  children: [],
                },
              ],
            },
          ],
        }),
      )
    installArchiveMock
      .mockResolvedValueOnce(
        createInstallArchiveResult({
          modName: 'First Pack',
          uniqueId: 'ModForge.FirstPack',
          installedMods: [
            {
              modName: 'First Pack',
              uniqueId: 'ModForge.FirstPack',
              version: '1.0.0',
              targetPath: 'E:\\Games\\Stardew Valley\\Mods\\[CP] First Pack',
              preservedConfig: false,
              preservedI18nFiles: 0,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createInstallArchiveResult({
          modName: 'Second Pack',
          uniqueId: 'ModForge.SecondPack',
          installedMods: [
            {
              modName: 'Second Pack',
              uniqueId: 'ModForge.SecondPack',
              version: '1.0.0',
              targetPath: 'E:\\Games\\Stardew Valley\\Mods\\[CP] Second Pack',
              preservedConfig: false,
              preservedI18nFiles: 0,
            },
          ],
        }),
      )
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    await act(async () => {
      await emitArchiveDragDrop({
        type: 'drop',
        paths: ['E:\\Downloads\\a.zip', 'E:\\Downloads\\b.zip'],
        position: { x: 180, y: 260 },
      })
    })

    await waitFor(() => {
      expect(inspectLauncherArchiveMock).toHaveBeenNthCalledWith(1, { archivePath: 'E:\\Downloads\\a.zip' })
      expect(inspectLauncherArchiveMock).toHaveBeenNthCalledWith(2, { archivePath: 'E:\\Downloads\\b.zip' })
    })

    expect(installArchiveMock).not.toHaveBeenCalled()
    expect(await screen.findByRole('dialog', { name: 'Archive Preview' })).not.toBeNull()
    expect(screen.getAllByText('First Pack').length).toBeGreaterThan(0)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /b\.zip/i }))
    })

    expect(screen.queryByText('First Pack')).toBeNull()
    expect(screen.getAllByText('Second Pack').length).toBeGreaterThan(0)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    })

    await waitFor(() => {
      expect(installArchiveMock).toHaveBeenNthCalledWith(1, 'E:\\Downloads\\a.zip')
      expect(installArchiveMock).toHaveBeenNthCalledWith(2, 'E:\\Downloads\\b.zip')
    })

    expect(library.refresh).toHaveBeenCalledTimes(1)
    expect(publishNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'success',
        title: 'Install Summary',
        summary: 'First Pack',
      }),
    )
    expect(publishNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'success',
        title: 'Install Summary',
        summary: 'Second Pack',
      }),
    )
  })

  it('skips unsupported dropped files while previewing the supported archives', async () => {
    const library = createLibraryState()
    inspectLauncherArchiveMock.mockResolvedValue(
      createArchivePreview({
        archivePath: 'E:\\Downloads\\a.zip',
        archiveFileName: 'a.zip',
      }),
    )
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    await act(async () => {
      await emitArchiveDragDrop({
        type: 'drop',
        paths: ['E:\\Downloads\\a.zip', 'E:\\Downloads\\notes.txt'],
        position: { x: 180, y: 260 },
      })
    })

    await waitFor(() => {
      expect(inspectLauncherArchiveMock).toHaveBeenCalledWith({ archivePath: 'E:\\Downloads\\a.zip' })
    })

    expect(publishNotificationMock).toHaveBeenCalledWith({
      level: 'error',
      title: 'Install Archive',
      description: 'Skipped 1 unsupported file. Supported formats: .zip, .7z, .rar, .tar.gz, .tgz, .tar',
    })
    expect(library.installArchive).not.toHaveBeenCalled()
    expect(await screen.findByRole('dialog', { name: 'Archive Preview' })).not.toBeNull()
  })

  it('publishes an error notification when an unsupported file is dropped', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    await act(async () => {
      await emitArchiveDragDrop({
        type: 'drop',
        paths: ['E:\\Downloads\\notes.txt'],
        position: { x: 180, y: 260 },
      })
    })

    await waitFor(() => {
      expect(publishNotificationMock).toHaveBeenCalledWith({
        level: 'error',
        title: 'Install Archive',
        description: 'Only these archive formats are supported: .zip, .7z, .rar, .tar.gz, .tgz, .tar',
      })
    })

    expect(inspectLauncherArchiveMock).not.toHaveBeenCalled()
  })

  it('publishes an error notification when archive preview inspection fails', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)
    inspectLauncherArchiveMock.mockRejectedValue(new Error('Inspection failed'))

    renderLibraryPage()

    await act(async () => {
      await emitArchiveDragDrop({
        type: 'drop',
        paths: ['E:\\Downloads\\broken.zip'],
        position: { x: 180, y: 260 },
      })
    })

    await waitFor(() => {
      expect(publishNotificationMock).toHaveBeenCalledWith({
        level: 'error',
        title: 'Archive Preview',
        description: 'Inspection failed',
      })
    })

    expect(screen.queryByRole('dialog', { name: 'Archive Preview' })).toBeNull()
  })

  it('refreshes the library when the toolbar refresh button is clicked', () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(library.refresh).toHaveBeenCalledWith()
  })

  it('clears action errors after a successful manual refresh', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage({
      settings: createSettings({
        modsPath: null,
      }),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Open Storage Folder' }))
    expect(await screen.findByText('Configure the Mods path in Settings before scanning the library.')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => {
      expect(library.refresh).toHaveBeenCalled()
      expect(screen.queryByText('Configure the Mods path in Settings before scanning the library.')).toBeNull()
    })
  })

  it('renders the hook-filtered library list instead of recomputing visibility from raw mods', () => {
    const library = createLibraryState()
    library.currentPack = null
    library.currentPackId = null
    library.filteredMods = [library.mods[0]!]
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    expect(screen.getByRole('article', { name: /npc adventures/i })).not.toBeNull()
    expect(screen.queryByRole('article', { name: /vintage interface redux/i })).toBeNull()
  })

  it('uses a custom enabled-only switch and custom sort menu', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    const enabledSwitch = screen.getByRole('switch', { name: 'Enabled Only' })
    fireEvent.click(enabledSwitch)
    expect(library.setEnabledOnly).toHaveBeenCalledWith(true)

    const sortTrigger = screen.getByRole('button', { name: 'Quick Sort' })
    fireEvent.click(sortTrigger)
    expect(screen.queryByRole('combobox', { name: 'Quick Sort' })).toBeNull()
    expect(screen.getByRole('menu', { name: 'Quick Sort' })).not.toBeNull()

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Pack' }))
    expect(screen.getByRole('button', { name: 'Quick Sort' }).textContent).toContain('Pack')
  })

  it('opens the left drawer and switches packs from the pack list', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Pack Management' }))
    fireEvent.click(await screen.findByRole('button', { name: 'All Installed Mods' }))
    await waitFor(() => {
      expect(library.setCurrentPackId).toHaveBeenCalledWith(null)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Challenge Pack' }))

    await waitFor(() => {
      expect(library.setCurrentPackId).toHaveBeenCalledWith('challenge-pack')
    })
  })

  it('shows a page warning when switching packs fails', async () => {
    const library = createLibraryState()
    library.setCurrentPackId = vi.fn(async () => {
      throw new Error('Pack switch failed')
    })
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Pack Management' }))
    fireEvent.click(screen.getByRole('button', { name: 'Challenge Pack' }))

    await waitFor(() => {
      expect(library.setCurrentPackId).toHaveBeenCalledWith('challenge-pack')
      expect(screen.getByText('Pack switch failed')).not.toBeNull()
    })
  })

  it('uses the title popup for quick switching when the drawer is hidden', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Story Pack' }))
    fireEvent.click(await screen.findByRole('button', { name: 'All Installed Mods' }))
    await waitFor(() => {
      expect(library.setCurrentPackId).toHaveBeenCalledWith(null)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Story Pack' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Challenge Pack' }))

    await waitFor(() => {
      expect(library.setCurrentPackId).toHaveBeenCalledWith('challenge-pack')
    })
  })

  it('shows create, edit, rename and delete actions in the drawer pack menu', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Pack Management' }))
    fireEvent.click(screen.getByRole('button', { name: /create pack/i }))
    const createDialog = await screen.findByRole('dialog', { name: 'Create Pack' })
    fireEvent.change(within(createDialog).getByRole('textbox'), { target: { value: 'New Pack' } })
    fireEvent.click(within(createDialog).getByRole('button', { name: 'Create Pack' }))
    await waitFor(() => {
      expect(library.createPackPreset).toHaveBeenCalledWith('New Pack')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Manage Current Pack Story Pack' }))
    fireEvent.click(await screen.findByRole('button', { name: /rename current pack/i }))
    const renameDialog = await screen.findByRole('dialog', { name: 'Rename Current Pack' })
    fireEvent.change(within(renameDialog).getByRole('textbox'), { target: { value: 'Renamed Pack' } })
    fireEvent.click(within(renameDialog).getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => {
      expect(library.renamePackPreset).toHaveBeenCalledWith('story-pack', 'Renamed Pack')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Manage Current Pack Story Pack' }))
    fireEvent.click(await screen.findByRole('button', { name: /delete current pack/i }))
    const deleteDialog = await screen.findByRole('dialog', { name: 'Delete Current Pack' })
    fireEvent.click(within(deleteDialog).getByRole('button', { name: 'Delete Current Pack' }))
    await waitFor(() => {
      expect(library.deletePackPreset).toHaveBeenCalledWith('story-pack')
    })
  })

  it('keeps the pack dialog open when creating a pack fails', async () => {
    const library = createLibraryState()
    library.createPackPreset = vi.fn(async () => {
      throw new Error('Pack creation failed')
    })
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Pack Management' }))
    fireEvent.click(screen.getByRole('button', { name: /create pack/i }))

    const dialog = await screen.findByRole('dialog', { name: 'Create Pack' })
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Broken Pack' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Pack' }))

    await waitFor(() => {
      expect(library.createPackPreset).toHaveBeenCalledWith('Broken Pack')
      expect(screen.getByRole('dialog', { name: 'Create Pack' })).not.toBeNull()
      expect(screen.getByText('Pack creation failed')).not.toBeNull()
    })
  })

  it('enters inline edit mode and saves the selected cards back into the current pack', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Pack Management' }))
    fireEvent.click(screen.getByRole('button', { name: 'Manage Current Pack Story Pack' }))
    fireEvent.click(screen.getByRole('button', { name: /edit pack contents/i }))
    expect(screen.getByText(/editing pack/i)).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Save Changes' })).not.toBeNull()

    fireEvent.click(screen.getByRole('article', { name: /vintage interface redux/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(library.replacePackMods).toHaveBeenCalledWith('story-pack', ['mod-1', 'mod-2'])
    })
  })

  it('keeps in-progress edit selections when mod cards rerender during background cover updates', async () => {
    let library = createLibraryState()
    useLauncherLibraryMock.mockImplementation(() => library)

    const view = renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Pack Management' }))
    fireEvent.click(screen.getByRole('button', { name: 'Manage Current Pack Story Pack' }))
    fireEvent.click(screen.getByRole('button', { name: /edit pack contents/i }))
    fireEvent.click(screen.getByRole('article', { name: /vintage interface redux/i }))

    library = {
      ...library,
      mods: library.mods.map((mod) =>
        mod.id === 'mod-1'
          ? { ...mod, imageUrl: 'E:\\Covers\\npc-adventures.png' }
          : mod,
      ),
      filteredMods: library.filteredMods.map((mod) =>
        mod.id === 'mod-1'
          ? { ...mod, imageUrl: 'E:\\Covers\\npc-adventures.png' }
          : mod,
      ),
    } as MockLibraryState

    view.rerender(
      <LauncherLibraryPage
        settings={createSettings()}
        launchGameLabel="Launch Game"
        launchGameDisabled={false}
        launchGameBusy={false}
        onLaunchGame={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(library.replacePackMods).toHaveBeenCalledWith('story-pack', ['mod-1', 'mod-2'])
    })
  })

  it('keeps edit-mode search aligned with the hook filter fields', async () => {
    const primaryMod = createLibraryMod({
      description: 'Immersive story events and dialogue.',
    })
    const secondaryMod = createLibraryMod({
      id: 'mod-2',
      labelKey: 'ModForge.VintageInterface',
      name: 'Vintage Interface Redux',
      author: 'Willow Works',
      version: '3.8.1',
      description: 'Retro menus and fonts.',
      uniqueId: 'ModForge.VintageInterface',
      folderName: 'Vintage Interface Redux',
      absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Vintage Interface Redux',
      enabled: false,
    })
    const library = {
      ...createLibraryState(),
      mods: [primaryMod, secondaryMod],
      filteredMods: [primaryMod],
      filterText: 'story events',
    } as MockLibraryState
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Pack Management' }))
    fireEvent.click(screen.getByRole('button', { name: 'Manage Current Pack Story Pack' }))
    fireEvent.click(screen.getByRole('button', { name: /edit pack contents/i }))

    await waitFor(() => {
      expect(screen.getByRole('article', { name: /npc adventures/i })).not.toBeNull()
      expect(screen.queryByRole('article', { name: /vintage interface redux/i })).toBeNull()
    })
  })

  it('drops a dragged card onto a drawer pack row to add it to that pack', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Pack Management' }))

    const dataTransfer = {
      effectAllowed: 'all',
      dropEffect: 'move',
      setData: vi.fn(),
      getData: vi.fn(),
      clearData: vi.fn(),
    }

    fireEvent.dragStart(screen.getByRole('article', { name: /npc adventures/i }), { dataTransfer })
    fireEvent.dragOver(screen.getByRole('button', { name: 'Challenge Pack' }), { dataTransfer })
    fireEvent.drop(screen.getByRole('button', { name: 'Challenge Pack' }), { dataTransfer })

    await waitFor(() => {
      expect(library.addModsToPack).toHaveBeenCalledWith('challenge-pack', ['mod-1'])
    })
  })

  it('opens mod details and keeps direct actions in the card context menu', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)
    chooseImageFileMock.mockResolvedValue('E:\\Covers\\npc-adventures.png')
    setLauncherLibraryCoverMock.mockResolvedValue({ covers: [] })

    renderLibraryPage()

    fireEvent.contextMenu(screen.getByRole('article', { name: /npc adventures/i }))

    expect(screen.getAllByRole('menuitem', { name: 'View Details' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('menuitem', { name: 'Open Folder' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('menuitem', { name: 'Disable' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('menuitem', { name: 'Set Cover' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('menuitem', { name: 'Choose Gallery Cover' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('menuitem', { name: 'Clear Cover' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('menuitem', { name: 'Hide Mod' }).length).toBeGreaterThan(0)

    fireEvent.click(screen.getAllByRole('menuitem', { name: 'View Details' })[0]!)
    const dialog = await screen.findByRole('dialog', { name: 'NPC Adventures' })
    expect(within(dialog).getByText('NPC Adventures')).not.toBeNull()

    fireEvent.contextMenu(screen.getByRole('article', { name: /npc adventures/i }))
    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Open Folder' })[0]!)
    fireEvent.contextMenu(screen.getByRole('article', { name: /npc adventures/i }))
    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Disable' })[0]!)
    fireEvent.contextMenu(screen.getByRole('article', { name: /npc adventures/i }))
    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Set Cover' })[0]!)
    fireEvent.click(within(dialog).getByRole('link', { name: 'Open Mod Page' }))

    await waitFor(() => {
      expect(openLauncherUrlMock).toHaveBeenCalledWith({ url: 'https://www.nexusmods.com/stardewvalley/mods/101' })
      expect(openLauncherPathMock).toHaveBeenCalledWith({ path: 'E:\\Games\\Stardew Valley\\Mods\\NPC Adventures' })
      expect(library.toggleEnabled).toHaveBeenCalled()
      expect(setLauncherLibraryCoverMock).toHaveBeenCalledWith({
        labelKey: '101',
        imagePath: 'E:\\Covers\\npc-adventures.png',
      })
    })
  })

  it('shows a hidden mods bucket in the drawer and routes the context action through hideMods', async () => {
    const primaryMod = createLibraryMod()
    const hiddenMod = createLibraryMod({
      id: 'mod-hidden',
      labelKey: 'ModForge.Hidden',
      name: 'Hidden Mod',
      uniqueId: 'ModForge.Hidden',
      absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Hidden Mod',
    })
    const library = {
      ...createLibraryState(),
      mods: [primaryMod, hiddenMod],
      filteredMods: [primaryMod],
      hiddenModKeys: ['ModForge.Hidden'],
    } as MockLibraryState
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Pack Management' }))
    expect(await screen.findByRole('button', { name: 'Hidden Mods' })).not.toBeNull()

    fireEvent.contextMenu(screen.getByRole('article', { name: /npc adventures/i }))
    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Hide Mod' })[0]!)

    await waitFor(() => {
      expect((library as MockLibraryState & { hideMods: ReturnType<typeof vi.fn> }).hideMods).toHaveBeenCalledWith(['mod-1'])
    })
  })

  it('keeps the sidebar open when switching to the hidden mods bucket', async () => {
    const library = {
      ...createLibraryState(),
      hiddenModKeys: ['ModForge.Hidden'],
    } as MockLibraryState
    useLauncherLibraryMock.mockReturnValue(library)

    const { container } = renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Pack Management' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hidden Mods' }))

    expect(container.querySelector('.launcher-library-sidebar-open')).not.toBeNull()
    expect(screen.getAllByRole('button', { name: 'Hidden Mods' }).length).toBeGreaterThan(0)
  })

  it('loads gallery images from the context menu and replaces the current cover with the selected image', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)
    loadLauncherRemoteModDetailMock.mockResolvedValue({
      modId: 101,
      title: 'NPC Adventures',
      summary: 'Example mod.',
      author: 'ModForge',
      version: '1.0.0',
      modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
      imageUrl: null,
      galleryImages: [
        'https://staticdelivery.nexusmods.com/mods/1303/images/101/101-gallery-1.png',
        'https://staticdelivery.nexusmods.com/mods/1303/images/101/101-gallery-2.png',
      ],
    })
    resolveLauncherImageMock.mockResolvedValue({
      sourceUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/101/101-gallery-2.png',
      localPath: 'E:\\Covers\\101-gallery-2.png',
      mimeType: 'image/png',
    })
    setLauncherLibraryCoverMock.mockResolvedValue({ covers: [] })

    renderLibraryPage()

    fireEvent.contextMenu(screen.getByRole('article', { name: /npc adventures/i }))
    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Choose Gallery Cover' })[0]!)

    expect(publishNotificationMock).toHaveBeenCalledWith({
      id: 'launcher-library-gallery-loading',
      level: 'info',
      title: 'Choose Gallery Cover',
      description: 'Fetching gallery images...',
      autoDismissMs: null,
    })

    const dialog = await screen.findByRole('dialog', { name: 'Gallery Images' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gallery image 2' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Set Cover' }))

    await waitFor(() => {
      expect(loadLauncherRemoteModDetailMock).toHaveBeenCalledWith({ modId: 101 })
      expect(resolveLauncherImageMock).toHaveBeenCalledWith({
        url: 'https://staticdelivery.nexusmods.com/mods/1303/images/101/101-gallery-2.png',
      })
      expect(setLauncherLibraryCoverMock).toHaveBeenCalledWith({
        labelKey: '101',
        imagePath: 'E:\\Covers\\101-gallery-2.png',
      })
    })

    expect(publishNotificationMock).toHaveBeenCalledWith({
      level: 'success',
      title: 'Set Cover',
      description: 'NPC Adventures',
    })
    expect(dismissNotificationMock).toHaveBeenCalledWith('launcher-library-gallery-loading')
  })

  it('keeps the gallery dialog open when cover persistence succeeds but refresh fails', async () => {
    const library = createLibraryState()
    library.refresh = vi.fn(async () => {
      throw new Error('Refresh failed')
    })
    useLauncherLibraryMock.mockReturnValue(library)
    loadLauncherRemoteModDetailMock.mockResolvedValue({
      modId: 101,
      title: 'NPC Adventures',
      summary: 'Example mod.',
      author: 'ModForge',
      version: '1.0.0',
      modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
      imageUrl: null,
      galleryImages: ['https://staticdelivery.nexusmods.com/mods/1303/images/101/101-gallery-1.png'],
    })
    resolveLauncherImageMock.mockResolvedValue({
      sourceUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/101/101-gallery-1.png',
      localPath: 'E:\\Covers\\101-gallery-1.png',
      mimeType: 'image/png',
    })
    setLauncherLibraryCoverMock.mockResolvedValue({ covers: [] })

    renderLibraryPage()

    fireEvent.contextMenu(screen.getByRole('article', { name: /npc adventures/i }))
    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Choose Gallery Cover' })[0]!)

    const dialog = await screen.findByRole('dialog', { name: 'Gallery Images' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Set Cover' }))

    await waitFor(() => {
      expect(setLauncherLibraryCoverMock).toHaveBeenCalled()
      expect(library.refresh).toHaveBeenCalled()
      expect(screen.getByRole('dialog', { name: 'Gallery Images' })).not.toBeNull()
      expect(publishNotificationMock).toHaveBeenCalledWith({
        level: 'error',
        title: 'Set Cover',
        description: 'Refresh failed',
      })
    })
  })

  it('publishes a warning notification instead of showing a page error when a mod has no gallery images', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)
    loadLauncherRemoteModDetailMock.mockResolvedValue({
      modId: 101,
      title: 'NPC Adventures',
      summary: 'Example mod.',
      author: 'ModForge',
      version: '1.0.0',
      modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
      imageUrl: null,
      galleryImages: [],
    })

    renderLibraryPage()

    fireEvent.contextMenu(screen.getByRole('article', { name: /npc adventures/i }))
    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Choose Gallery Cover' })[0]!)

    await waitFor(() => {
      expect(publishNotificationMock).toHaveBeenCalledWith({
        level: 'warning',
        title: 'Choose Gallery Cover',
        description: 'This mod does not expose any gallery images that can be used as a cover.',
      })
    })

    expect(screen.queryByRole('dialog', { name: 'Gallery Images' })).toBeNull()
  })

  it('inspects and installs an archive from the install mod action', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)
    chooseArchiveFileMock.mockResolvedValue('E:\\Downloads\\preview.zip')
    inspectLauncherArchiveMock.mockResolvedValue(createArchivePreview())

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: /install archive/i }))

    await waitFor(() => {
      expect(inspectLauncherArchiveMock).toHaveBeenCalledWith({ archivePath: 'E:\\Downloads\\preview.zip' })
    })

    fireEvent.click(await screen.findByRole('button', { name: /^install$/i }))

    await waitFor(() => {
      expect(library.installArchive).toHaveBeenCalledWith('E:\\Downloads\\preview.zip')
      expect(publishNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'success',
          title: 'Install Summary',
          summary: 'Example Pack',
          description: '2 installed targets',
        }),
      )
    })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Archive Preview' })).toBeNull()
    })
  })

  it('publishes an install result notification after archive installation and opens the summary dialog from the notification action', async () => {
    const library = createLibraryState()
    library.installArchive = vi.fn(async () => createInstallArchiveResult())
    useLauncherLibraryMock.mockReturnValue(library)
    chooseArchiveFileMock.mockResolvedValue('E:\\Downloads\\preview.zip')
    inspectLauncherArchiveMock.mockResolvedValue(createArchivePreview())
    listLauncherInstallBackupsMock.mockResolvedValue([createInstallBackupSummary()])

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: /install archive/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^install$/i }))

    expect(screen.queryByRole('dialog', { name: 'Install Summary' })).toBeNull()

    await waitFor(() => {
      expect(publishNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'success',
          title: 'Install Summary',
          summary: 'Example Pack',
          description: '2 installed targets',
          autoDismissMs: 15_000,
          action: expect.objectContaining({
            label: 'View Details',
            tone: 'primary',
            callback: expect.any(Function),
          }),
        }),
      )
    })

    const notificationRequest = publishNotificationMock.mock.calls.at(-1)?.[0]
    expect(notificationRequest?.action).toBeDefined()

    await act(async () => {
      await notificationRequest?.action?.callback()
    })

    const summaryDialog = await screen.findByRole('dialog', { name: 'Install Summary' })
    expect(within(summaryDialog).getAllByText('Example Pack').length).toBeGreaterThan(0)
    expect(within(summaryDialog).getByText('install-123')).not.toBeNull()

    fireEvent.click(within(summaryDialog).getByRole('button', { name: 'Manage Install Backups' }))

    await waitFor(() => {
      expect(listLauncherInstallBackupsMock).toHaveBeenCalledWith({
        modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      })
    })
    expect(await screen.findByRole('dialog', { name: 'Install Backups' })).not.toBeNull()
  })

  it('keeps the install summary visible when opening install backups from the summary fails', async () => {
    const library = createLibraryState()
    library.installArchive = vi.fn(async () => createInstallArchiveResult())
    useLauncherLibraryMock.mockReturnValue(library)
    chooseArchiveFileMock.mockResolvedValue('E:\\Downloads\\preview.zip')
    inspectLauncherArchiveMock.mockResolvedValue(createArchivePreview())
    listLauncherInstallBackupsMock.mockRejectedValue(new Error('Backups unavailable'))

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: /install archive/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^install$/i }))

    await waitFor(() => {
      expect(publishNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Install Summary',
          action: expect.objectContaining({
            callback: expect.any(Function),
          }),
        }),
      )
    })

    const notificationRequest = publishNotificationMock.mock.calls.at(-1)?.[0]

    await act(async () => {
      await notificationRequest?.action?.callback()
    })

    const summaryDialog = await screen.findByRole('dialog', { name: 'Install Summary' })
    fireEvent.click(within(summaryDialog).getByRole('button', { name: 'Manage Install Backups' }))

    await waitFor(() => {
      expect(listLauncherInstallBackupsMock).toHaveBeenCalledWith({
        modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      })
    })

    expect(await screen.findByRole('dialog', { name: 'Install Summary' })).not.toBeNull()
    const backupsDialog = await screen.findByRole('dialog', { name: 'Install Backups' })
    expect(within(backupsDialog).getByText('Backups unavailable')).not.toBeNull()
  })

  it('keeps the install summary visible when the backup dialog is closed before backup loading finishes', async () => {
    const library = createLibraryState()
    library.installArchive = vi.fn(async () => createInstallArchiveResult())
    useLauncherLibraryMock.mockReturnValue(library)
    chooseArchiveFileMock.mockResolvedValue('E:\\Downloads\\preview.zip')
    inspectLauncherArchiveMock.mockResolvedValue(createArchivePreview())
    const backupsDeferred = createDeferred<LauncherInstallBackupSummary[]>()
    listLauncherInstallBackupsMock.mockReturnValue(backupsDeferred.promise)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: /install archive/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^install$/i }))

    await waitFor(() => {
      expect(publishNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Install Summary',
          action: expect.objectContaining({
            callback: expect.any(Function),
          }),
        }),
      )
    })

    const notificationRequest = publishNotificationMock.mock.calls.at(-1)?.[0]

    await act(async () => {
      await notificationRequest?.action?.callback()
    })

    const summaryDialog = await screen.findByRole('dialog', { name: 'Install Summary' })
    fireEvent.click(within(summaryDialog).getByRole('button', { name: 'Manage Install Backups' }))

    const backupsDialog = await screen.findByRole('dialog', { name: 'Install Backups' })
    fireEvent.click(within(backupsDialog).getByRole('button', { name: 'Close' }))

    await act(async () => {
      backupsDeferred.resolve([createInstallBackupSummary()])
      await Promise.resolve()
    })

    expect(screen.queryByRole('dialog', { name: 'Install Backups' })).toBeNull()
    expect(await screen.findByRole('dialog', { name: 'Install Summary' })).not.toBeNull()
  })

  it('restores an install backup from the backup manager dialog and refreshes the library', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)
    listLauncherInstallBackupsMock.mockResolvedValue([createInstallBackupSummary()])
    restoreLauncherInstallBackupMock.mockResolvedValue({
      backupId: 'install-123',
      backupPath: 'E:\\Games\\Stardew Valley\\Backups\\install-123',
      restoredPaths: ['E:\\Games\\Stardew Valley\\Mods\\[CP] Example Pack'],
    })

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Install Backups' }))

    const backupsDialog = await screen.findByRole('dialog', { name: 'Install Backups' })
    expect(within(backupsDialog).getByText('install-123')).not.toBeNull()

    fireEvent.click(within(backupsDialog).getByRole('button', { name: 'Restore Backup' }))

    await waitFor(() => {
      expect(restoreLauncherInstallBackupMock).toHaveBeenCalledWith({
        backupId: 'install-123',
        modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      })
      expect(library.refresh).toHaveBeenCalled()
    })
  })

  it('keeps backup restore successful when the follow-up refresh fails', async () => {
    const library = createLibraryState()
    library.refresh = vi.fn(async () => {
      throw new Error('Refresh failed')
    })
    useLauncherLibraryMock.mockReturnValue(library)
    listLauncherInstallBackupsMock.mockResolvedValue([createInstallBackupSummary()])
    restoreLauncherInstallBackupMock.mockResolvedValue({
      backupId: 'install-123',
      backupPath: 'E:\\Games\\Stardew Valley\\Backups\\install-123',
      restoredPaths: ['E:\\Games\\Stardew Valley\\Mods\\[CP] Example Pack'],
    })

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Install Backups' }))

    const backupsDialog = await screen.findByRole('dialog', { name: 'Install Backups' })
    fireEvent.click(within(backupsDialog).getByRole('button', { name: 'Restore Backup' }))

    await waitFor(() => {
      expect(restoreLauncherInstallBackupMock).toHaveBeenCalledWith({
        backupId: 'install-123',
        modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      })
    })

    await waitFor(() => {
      expect(publishNotificationMock).toHaveBeenCalledWith({
        level: 'success',
        title: 'Restore Backup',
        description: 'install-123',
      })
    })

    expect(screen.queryByRole('dialog', { name: 'Install Backups' })).toBeNull()
    expect(await screen.findByText('Refresh failed')).not.toBeNull()
  })

  it('renders the full large-library grid directly without virtualization', async () => {
    const library = createLargeLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    expect(screen.getByRole('article', { name: /^large library mod 1$/i })).not.toBeNull()
    expect(screen.getByRole('article', { name: /^large library mod 80$/i })).not.toBeNull()
    expect(screen.getAllByRole('article')).toHaveLength(library.mods.length)

    fireEvent.contextMenu(screen.getByRole('article', { name: /^large library mod 1$/i }))
    expect((await screen.findAllByRole('menuitem', { name: 'View Details' })).length).toBeGreaterThan(0)
  })

  it('shows the real empty-library message when no installed mods were found', () => {
    const library = createLibraryState()
    library.mods = []
    library.filteredMods = []
    library.selectedMod = null
    library.selectedModId = null
    library.currentPack = null
    library.currentPackId = null
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    expect(screen.getByText('No installed mods were found in the configured Mods folder.')).not.toBeNull()
  })
})
