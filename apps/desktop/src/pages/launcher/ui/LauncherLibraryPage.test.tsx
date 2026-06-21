import type { ReactElement, ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import { LocaleProvider } from '@locales/provider'
import type {
  InspectLauncherArchiveResult,
  InstallLauncherArchiveResult,
  LauncherInstallBackupSummary,
  LauncherLibraryModSummary,
  LauncherSettings,
} from '@features/launcher/api'
import {
  inspectLauncherArchive,
  listLauncherInstallBackups,
  loadLauncherRemoteModDetail,
  openLauncherUrl,
  openLauncherPath,
  resolveLauncherImage,
  restoreLauncherInstallBackup,
  setLauncherLibraryCover,
} from '@features/launcher/api'
import { chooseArchiveFiles, chooseImageFile, listenToLauncherArchiveDragDrop } from '@platform/host'
import { useLauncherLibrary } from '@features/launcher/model/useLauncherLibrary'
import { createMockLauncherPort } from '@test/launcherTestPort.ts'
import { LauncherTestWrapper } from '@test/launcherTestWrapper.tsx'
import { LauncherLibraryPage } from './LauncherLibraryPage'
import type { LauncherPort } from '@features/launcher/model/launcherPort'

const archiveDragDropListeners: Array<
  (payload: { type: string; paths?: string[]; position?: { x: number; y: number } }) => void | Promise<void>
> = []
const measureVirtualGridRowMock = vi.fn()
const measureVirtualGridRowFactoryMock = vi.fn()

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
    asChild,
    children,
    onSelect,
    className,
  }: {
    asChild?: boolean
    children: ReactNode
    onSelect?: () => void
    className?: string
  }) {
    if (asChild) {
      return children
    }
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

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize,
    measureElement,
  }: {
    count: number
    estimateSize: () => number
    measureElement?: (element: Element) => number
  }) => {
    const rowSize = estimateSize()
    const visibleRowCount = Math.min(count, 8)
    measureVirtualGridRowFactoryMock(measureElement)
    return {
      getTotalSize: () => count * rowSize,
      getVirtualItems: () =>
        Array.from({ length: visibleRowCount }, (_, index) => ({
          index,
          key: index,
          start: index * rowSize,
          size: rowSize,
          end: (index + 1) * rowSize,
          lane: 0,
        })),
      measureElement: measureVirtualGridRowMock,
    }
  },
}))

vi.mock('@features/launcher/api', async () => {
  const actual = await vi.importActual<typeof import('@features/launcher/api')>('@features/launcher/api')
  return {
    ...actual,
    inspectLauncherArchive: vi.fn(),
    isLauncherRemoteModIdInvalid: vi.fn(() => false),
    listLauncherInstallBackups: vi.fn(),
    loadLauncherRemoteModDetail: vi.fn(),
    openLauncherUrl: vi.fn(),
    openLauncherPath: vi.fn(),
    resolveLauncherImage: vi.fn(),
    restoreLauncherInstallBackup: vi.fn(),
    setLauncherLibraryCover: vi.fn(),
  }
})

vi.mock('@platform/host', async () => {
  const actual = await vi.importActual<typeof import('@platform/host')>('@platform/host')
  return {
    ...actual,
    chooseArchiveFiles: vi.fn(),
    chooseImageFile: vi.fn(),
    listenToLauncherArchiveDragDrop: vi.fn(async (listener) => {
      archiveDragDropListeners.push(listener)
      return () => {
        const index = archiveDragDropListeners.indexOf(listener)
        if (index >= 0) {
          archiveDragDropListeners.splice(index, 1)
        }
      }
    }),
  }
})

vi.mock('@features/launcher/model/useLauncherLibrary', async () => {
  const actual = await vi.importActual<typeof import('@features/launcher/model/useLauncherLibrary')>(
    '@features/launcher/model/useLauncherLibrary',
  )
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

const chooseArchiveFilesMock = vi.mocked(chooseArchiveFiles)
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

async function emitArchiveDragDrop(payload: { type: string; paths?: string[]; position?: { x: number; y: number } }) {
  for (const listener of archiveDragDropListeners) {
    await listener(payload)
  }
}

function pointerDragDown(target: Element | Document | Window, clientX: number, clientY: number, pointerId = 1) {
  fireEvent.pointerDown(target, { button: 0, buttons: 1, clientX, clientY, isPrimary: true, pointerId })
}

function pointerDragMove(target: Element | Document | Window, clientX: number, clientY: number, pointerId = 1) {
  fireEvent.pointerMove(target, { button: 0, buttons: 1, clientX, clientY, isPrimary: true, pointerId })
}

function pointerDragUp(target: Element | Document | Window, clientX: number, clientY: number, pointerId = 1) {
  fireEvent.pointerUp(target, { button: 0, buttons: 0, clientX, clientY, isPrimary: true, pointerId })
}

function clickAfterPress(target: Element) {
  fireEvent.click(target)
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

function createLibraryMod(overrides: Partial<LauncherLibraryModSummary> = {}): LauncherLibraryModSummary {
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
    requiredDependencies: [],
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

function createInstallBackupSummary(overrides: Partial<LauncherInstallBackupSummary> = {}): LauncherInstallBackupSummary {
  return {
    backupId: 'install-123',
    backupPath: 'E:\\Games\\Stardew Valley\\Backups\\install-123',
    deleteCount: 3,
    overwriteCount: 2,
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
    nexusModId: 202,
  })

  return {
    mods: [primaryMod, secondaryMod],
    filteredMods: [primaryMod, secondaryMod],
    latestVersionByModId: {},
    childModGroups: [],
    libraryFolders: [],
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
      folderClassificationMode: 'global',
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
        folderClassificationMode: 'global',
      },
      {
        id: 'challenge-pack',
        name: 'Challenge Pack',
        modKeys: ['ModForge.VintageInterface'],
        folderClassificationMode: 'global',
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
    updatePackPreset: vi.fn(async () => {}),
    deletePackPreset: vi.fn(async () => {}),
    replacePackMods: vi.fn(async () => {}),
    hideMods: vi.fn(async () => {}),
    showMods: vi.fn(async () => {}),
    setChildMods: vi.fn(async () => {}),
    removeChildMods: vi.fn(async () => {}),
    replaceChildMods: vi.fn(async () => {}),
    createLibraryFolder: vi.fn(async () => 'new-folder'),
    renameLibraryFolder: vi.fn(async () => {}),
    hideLibraryFolder: vi.fn(async () => {}),
    showLibraryFolder: vi.fn(async () => {}),
    addModsToLibraryFolder: vi.fn(async () => {}),
    removeModsFromLibraryFolders: vi.fn(async () => {}),
    moveLibraryFolderToFolder: vi.fn(async () => {}),
    setModsEnabled: vi.fn(async () => {}),
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

function getLibraryMoreActionsMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
  return screen.getByRole('menu', { name: 'More actions' })
}

function clickInstallArchiveAction() {
  fireEvent.click(within(getLibraryMoreActionsMenu()).getByRole('menuitem', { name: 'Install Archive' }))
}

function renderHiddenLibraryPage(overrides: Partial<Parameters<typeof LauncherLibraryPage>[0]> = {}) {
  const onLaunchGame = vi.fn()
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <LauncherTestWrapper port={launcherPort}>
        <LocaleProvider locale="en-US">{children}</LocaleProvider>
      </LauncherTestWrapper>
    )
  }

  const view = render(
    <div hidden>
      <LauncherLibraryPage
        settings={createSettings()}
        launchGameLabel="Launch Game"
        launchGameDisabled={false}
        launchGameBusy={false}
        onLaunchGame={onLaunchGame}
        {...overrides}
      />
    </div>,
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
    fireEvent.pointerUp(document, { clientX: 0, clientY: 0, pointerId: 0 })
    fireEvent.mouseUp(document, { button: 0, buttons: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerUp(window, { clientX: 0, clientY: 0, pointerId: 0 })
    fireEvent.mouseUp(window, { button: 0, buttons: 0, clientX: 0, clientY: 0 })
    cleanup()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  beforeEach(() => {
    launcherPort = createMockLauncherPort({
      chooseImageFile: chooseImageFileMock,
      inspectArchive: inspectLauncherArchiveMock,
      listInstallBackups: listLauncherInstallBackupsMock,
      loadRemoteModDetail: loadLauncherRemoteModDetailMock.mockResolvedValue({
        modId: 101,
        title: 'NPC Adventures',
        summary: 'Remote details for NPC Adventures.',
        author: 'ModForge',
        version: '1.0.0',
        modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
        imageUrl: null,
        galleryImages: [],
      }),
      openPath: openLauncherPathMock,
      openUrl: openLauncherUrlMock,
      loadImageFailures: vi.fn().mockResolvedValue({ entries: [] }),
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
    const moreActionsMenu = getLibraryMoreActionsMenu()
    expect(within(moreActionsMenu).getByRole('menuitem', { name: 'Open Storage Folder' })).not.toBeNull()
    expect(within(moreActionsMenu).getByRole('menuitem', { name: 'Install Archive' })).not.toBeNull()
    expect(within(moreActionsMenu).getByRole('menuitem', { name: 'Install Backups' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Launch Game' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Apply Pack' })).toBeNull()
    expect(container.querySelector('.launcher-library-console-bottom')).toBeNull()
    expect(container.querySelector('.launcher-library-page > .launcher-library-console')).not.toBeNull()
    expect(container.querySelector('.launcher-library-shell > .launcher-library-sidebar')).not.toBeNull()
    expect(container.querySelector('.launcher-library-shell > .launcher-library-content')).not.toBeNull()
    expect(container.querySelector('.launcher-library-shell .launcher-library-console')).toBeNull()
  })

  it('creates a virtual library folder from the header without auto-expanding it', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Create folder' }))

    await waitFor(() => {
      expect(library.createLibraryFolder).toHaveBeenCalledWith(undefined, { packId: 'story-pack' })
    })
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('creates a global virtual library folder from the header outside a pack view', async () => {
    const library = {
      ...createLibraryState(),
      currentPack: null,
      currentPackId: null,
    } as MockLibraryState
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Create folder' }))

    await waitFor(() => {
      expect(library.createLibraryFolder).toHaveBeenCalledWith(undefined, { packId: null })
    })
  })

  it('uses pack-scoped folders before global folders in global pack classification mode', async () => {
    const library = createLibraryState()
    const packMembers = library.mods
    useLauncherLibraryMock.mockReturnValue({
      ...library,
      filteredMods: packMembers,
      currentPack: {
        id: 'story-pack',
        name: 'Story Pack',
        modKeys: ['ModForge.NpcAdventures', 'ModForge.VintageInterface'],
        folderClassificationMode: 'global',
      },
      packPresets: [
        {
          id: 'story-pack',
          name: 'Story Pack',
          modKeys: ['ModForge.NpcAdventures', 'ModForge.VintageInterface'],
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
          modKeys: ['ModForge.NpcAdventures', 'ModForge.VintageInterface'],
          coverModKeys: [],
        },
        {
          id: 'pack-visuals',
          name: 'Pack Visuals',
          packId: 'story-pack',
          hidden: false,
          parentFolderId: null,
          modKeys: ['ModForge.NpcAdventures'],
          coverModKeys: [],
        },
      ],
    } as MockLibraryState)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Open folder Pack Visuals' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open folder Global Visuals' }))

    const packFolder = screen.getByRole('region', { name: 'Pack Visuals' })
    const globalFolder = screen.getByRole('region', { name: 'Global Visuals' })
    expect(within(packFolder).getByRole('article', { name: /npc adventures/i })).not.toBeNull()
    expect(within(packFolder).queryByRole('article', { name: /vintage interface redux/i })).toBeNull()
    expect(within(globalFolder).queryByRole('article', { name: /npc adventures/i })).toBeNull()
    expect(within(globalFolder).getByRole('article', { name: /vintage interface redux/i })).not.toBeNull()
    expect(screen.queryAllByRole('article', { name: /npc adventures/i })).toHaveLength(1)

    fireEvent.contextMenu(globalFolder)
    await waitFor(() => {
      expect(screen.getAllByRole('menuitem', { name: 'Rename folder' }).length).toBeGreaterThan(0)
    })
    expect(screen.queryByRole('menuitem', { name: 'Hide folder' })).toBeNull()
  })

  it('uses only pack-scoped folders in independent pack classification mode', () => {
    const library = createLibraryState()
    const packMembers = library.mods
    useLauncherLibraryMock.mockReturnValue({
      ...library,
      filteredMods: packMembers,
      currentPack: {
        id: 'story-pack',
        name: 'Story Pack',
        modKeys: ['ModForge.NpcAdventures', 'ModForge.VintageInterface'],
        folderClassificationMode: 'independent',
      },
      packPresets: [
        {
          id: 'story-pack',
          name: 'Story Pack',
          modKeys: ['ModForge.NpcAdventures', 'ModForge.VintageInterface'],
          folderClassificationMode: 'independent',
        },
      ],
      libraryFolders: [
        {
          id: 'global-visuals',
          name: 'Global Visuals',
          packId: null,
          hidden: false,
          parentFolderId: null,
          modKeys: ['ModForge.VintageInterface'],
          coverModKeys: [],
        },
        {
          id: 'pack-visuals',
          name: 'Pack Visuals',
          packId: 'story-pack',
          hidden: false,
          parentFolderId: null,
          modKeys: ['ModForge.NpcAdventures'],
          coverModKeys: [],
        },
      ],
    } as MockLibraryState)

    renderLibraryPage()

    expect(screen.getByRole('button', { name: 'Open folder Pack Visuals' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Open folder Global Visuals' })).toBeNull()
    expect(screen.getByRole('article', { name: /vintage interface redux/i })).not.toBeNull()
    expect(screen.queryByRole('article', { name: /npc adventures/i })).toBeNull()
  })

  it('renders virtual folders as expandable folder tiles and hides contained mods from the top level', async () => {
    const library = {
      ...createLibraryState(),
      currentPack: null,
      currentPackId: null,
      libraryFolders: [
        {
          id: 'visuals',
          name: 'Visuals',
          packId: null,
          hidden: false,
          parentFolderId: null,
          modKeys: ['ModForge.NpcAdventures'],
          coverModKeys: [],
        },
      ],
    } as MockLibraryState
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    const folderButton = screen.getByRole('button', { name: 'Open folder Visuals' })
    expect(folderButton).not.toBeNull()
    expect(Array.from(folderButton.children).map((child) => child.className)).toEqual([
      'launcher-library-folder-visual',
      'launcher-library-folder-card-copy',
    ])
    expect(folderButton.querySelector('.launcher-library-folder-card-copy')?.children).toHaveLength(2)
    const folderTone = (folderButton as HTMLElement).style.getPropertyValue('--launcher-folder-accent')
    expect(folderTone).not.toBe('')
    expect(screen.queryByRole('article', { name: /npc adventures/i })).toBeNull()

    clickAfterPress(folderButton)

    const folderRegion = screen.getByRole('region', { name: 'Visuals' })
    expect((folderRegion as HTMLElement).style.getPropertyValue('--launcher-folder-accent')).toBe(folderTone)
    expect(within(folderRegion).getByRole('article', { name: /npc adventures/i })).not.toBeNull()
  })

  it('does not refresh the library when expanding a virtual folder', () => {
    const library = {
      ...createLibraryState(),
      currentPack: null,
      currentPackId: null,
      libraryFolders: [
        {
          id: 'visuals',
          name: 'Visuals',
          packId: null,
          hidden: false,
          parentFolderId: null,
          modKeys: ['ModForge.NpcAdventures'],
          coverModKeys: [],
        },
      ],
    } as MockLibraryState
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    clickAfterPress(screen.getByRole('button', { name: 'Open folder Visuals' }))

    expect(screen.getByRole('region', { name: 'Visuals' })).not.toBeNull()
    expect(library.refresh).not.toHaveBeenCalled()
  })

  it('does not replay reveal loading motion for existing mods when expanding a virtual folder', async () => {
    vi.useFakeTimers()
    const baseLibrary = createLibraryState()
    const belowMod = createLibraryMod({
      id: 'mod-below',
      labelKey: 'ModForge.Below',
      name: 'Below Folder Mod',
      uniqueId: 'ModForge.Below',
      absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Below Folder Mod',
    })
    const library = {
      ...baseLibrary,
      filteredMods: [...baseLibrary.filteredMods, belowMod],
      mods: [...baseLibrary.mods, belowMod],
      libraryFolders: [
        {
          id: 'visuals',
          name: 'Visuals',
          packId: null,
          hidden: false,
          parentFolderId: null,
          modKeys: ['ModForge.NpcAdventures'],
          coverModKeys: [],
        },
      ],
    } as MockLibraryState
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    await act(async () => {
      vi.advanceTimersByTime(950)
    })

    clickAfterPress(screen.getByRole('button', { name: 'Open folder Visuals' }))

    const belowCard = screen.getByRole('article', { name: /below folder mod/i })
    expect(belowCard.closest('.loading-motion-child-reveal')).toBeNull()
  })

  it('keeps mod cards full size inside expanded virtual folders', async () => {
    const library = {
      ...createLibraryState(),
      libraryFolders: [
        {
          id: 'visuals',
          name: 'Visuals',
          packId: null,
          hidden: false,
          parentFolderId: null,
          modKeys: ['ModForge.NpcAdventures'],
          coverModKeys: [],
        },
      ],
    } as MockLibraryState
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    clickAfterPress(screen.getByRole('button', { name: 'Open folder Visuals' }))

    const folderRegion = screen.getByRole('region', { name: 'Visuals' })
    expect(within(folderRegion).getByRole('article', { name: /npc adventures/i })).not.toBeNull()
    const folderGrid = folderRegion.querySelector<HTMLElement>('.launcher-library-folder-panel-grid')
    expect(folderGrid?.style.gridTemplateColumns).toContain('260px')
    expect(folderGrid?.style.gridAutoRows).toContain('260px')
  })

  it('opens empty virtual folders without repeating the empty-library auto refresh', () => {
    const library = {
      ...createLibraryState(),
      mods: [],
      filteredMods: [],
      selectedMod: null,
      selectedModId: null,
      currentPack: null,
      currentPackId: null,
      packPresets: [],
      state: 'idle',
      libraryFolders: [
        { id: 'visuals', name: 'Visuals', packId: null, hidden: false, parentFolderId: null, modKeys: [], coverModKeys: [] },
      ],
    } as MockLibraryState
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    expect(library.refresh).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Open folder Visuals' }))

    const folderRegion = screen.getByRole('region', { name: 'Visuals' })
    expect(within(folderRegion).getByText('This folder is empty.')).toBeTruthy()
    expect(library.refresh).toHaveBeenCalledTimes(1)
  })

  it('closes an expanded virtual folder with a single click', async () => {
    const library = {
      ...createLibraryState(),
      libraryFolders: [
        {
          id: 'visuals',
          name: 'Visuals',
          packId: null,
          hidden: false,
          parentFolderId: null,
          modKeys: ['ModForge.NpcAdventures'],
          coverModKeys: [],
        },
      ],
    } as MockLibraryState
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    clickAfterPress(screen.getByRole('button', { name: 'Open folder Visuals' }))
    expect(screen.getByRole('region', { name: 'Visuals' })).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Close folder' }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Visuals' })).toBeNull()
    })
    expect(screen.getByRole('button', { name: 'Open folder Visuals' })).not.toBeNull()
  })

  it('keeps multiple virtual folders expanded and shows folder context actions', async () => {
    const library = {
      ...createLibraryState(),
      currentPack: null,
      currentPackId: null,
      libraryFolders: [
        {
          id: 'visuals',
          name: 'Visuals',
          packId: null,
          hidden: false,
          parentFolderId: null,
          modKeys: ['ModForge.NpcAdventures'],
          coverModKeys: [],
        },
        {
          id: 'gameplay',
          name: 'Gameplay',
          packId: null,
          hidden: false,
          parentFolderId: null,
          modKeys: ['ModForge.VintageInterface'],
          coverModKeys: [],
        },
      ],
    } as MockLibraryState
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    const visualsFolderButton = screen.getByRole('button', { name: 'Open folder Visuals' })
    fireEvent.contextMenu(visualsFolderButton)

    await waitFor(() => {
      expect(screen.getAllByRole('menuitem', { name: 'Open folder Visuals' }).length).toBeGreaterThan(0)
      expect(screen.getAllByRole('menuitem', { name: 'Rename folder' }).length).toBeGreaterThan(0)
      expect(screen.getAllByRole('menuitem', { name: 'Hide folder' }).length).toBeGreaterThan(0)
      expect(screen.getAllByRole('menuitem', { name: 'Enable folder mods' }).length).toBeGreaterThan(0)
      expect(screen.getAllByRole('menuitem', { name: 'Disable folder mods' }).length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Hide folder' })[0]!)
    await waitFor(() => {
      expect(library.hideLibraryFolder).toHaveBeenCalledWith('visuals')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Open folder Visuals' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open folder Gameplay' }))

    expect(screen.getByRole('region', { name: 'Visuals' })).not.toBeNull()
    expect(screen.getByRole('region', { name: 'Gameplay' })).not.toBeNull()

    fireEvent.contextMenu(screen.getByRole('region', { name: 'Gameplay' }))

    await waitFor(() => {
      expect(screen.getAllByRole('menuitem', { name: 'Close folder' }).length).toBeGreaterThan(0)
    })

    fireEvent.click(within(screen.getByRole('region', { name: 'Gameplay' })).getByRole('button', { name: 'Close folder' }))

    expect(screen.getByRole('region', { name: 'Visuals' })).not.toBeNull()
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Gameplay' })).toBeNull()
    })
  })

  it('marks library card versions when a cached update is available', () => {
    useLauncherLibraryMock.mockReturnValue({
      ...createLibraryState(),
      latestVersionByModId: {
        101: '1.1.0',
      },
    })

    renderLibraryPage()

    const updateBadge = screen.getByLabelText('New version v1.1.0 available')
    expect(updateBadge).toHaveClass('launcher-mod-card-version-update')
    expect(updateBadge.textContent).toContain('v1.0.0')
    expect(updateBadge.querySelector('svg')).toBeTruthy()
  })

  it('folds child mods under their parent by default and opens them in a floating module panel', async () => {
    const library = {
      ...createLibraryState(),
      childModGroups: [{ parentModKey: 'ModForge.NpcAdventures', childModKeys: ['ModForge.VintageInterface'] }],
    }
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    expect(screen.getByText('NPC Adventures')).toBeTruthy()
    expect(screen.queryByText('Vintage Interface Redux')).toBeNull()

    const moduleButton = screen.getByRole('button', { name: 'Expand child mods for NPC Adventures' })
    expect(moduleButton).toHaveClass('launcher-mod-card-child-count')
    expect(moduleButton.textContent).toContain('1 child mod')

    fireEvent.click(moduleButton)

    const panel = screen.getByRole('dialog', { name: 'NPC Adventures modules' })
    expect(within(panel).getByText('Vintage Interface Redux')).toBeTruthy()
    expect(document.querySelector('.launcher-library-modules-floating-panel')).toBeTruthy()
    expect(panel.querySelector('.launcher-mod-card')).toBeNull()
    expect(panel.querySelector('.launcher-library-module-tile')).toBeTruthy()

    fireEvent.click(moduleButton)
    expect(screen.queryByRole('dialog', { name: 'NPC Adventures modules' })).toBeNull()
  })

  it('enters inline child-mod selection from a parent card and confirms selected children', () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.contextMenu(screen.getByRole('article', { name: /npc adventures/i }))
    fireEvent.click(screen.getAllByText('Choose child mods')[0]!)
    expect(screen.getByText('Choosing child mods for NPC Adventures')).toBeTruthy()
    expect(screen.getByText('0 child mods selected')).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Choose child mods' })).toBeNull()

    fireEvent.click(screen.getByRole('article', { name: /vintage interface redux/i }))
    expect(screen.getByText('1 child mod selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm child mods' }))

    expect(library.replaceChildMods).toHaveBeenCalledWith('mod-1', ['mod-2'])
  })

  it('removes child mods from their parent through the child context action', async () => {
    const library = {
      ...createLibraryState(),
      childModGroups: [{ parentModKey: 'ModForge.NpcAdventures', childModKeys: ['ModForge.VintageInterface'] }],
    }
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Expand child mods for NPC Adventures' }))
    const panel = screen.getByRole('dialog', { name: 'NPC Adventures modules' })
    fireEvent.contextMenu(within(panel).getByRole('article', { name: /vintage interface redux/i }))
    fireEvent.click(screen.getByText('Remove from parent'))

    expect(library.removeChildMods).toHaveBeenCalledWith(['mod-2'])
  })

  it('opens child mod folders from floating module tiles', async () => {
    const library = {
      ...createLibraryState(),
      childModGroups: [{ parentModKey: 'ModForge.NpcAdventures', childModKeys: ['ModForge.VintageInterface'] }],
    }
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Expand child mods for NPC Adventures' }))
    const panel = screen.getByRole('dialog', { name: 'NPC Adventures modules' })
    fireEvent.doubleClick(within(panel).getByRole('article', { name: /vintage interface redux/i }))

    await waitFor(() => {
      expect(openLauncherPathMock).toHaveBeenCalledWith({ path: 'E:\\Games\\Stardew Valley\\Mods\\Vintage Interface Redux' })
    })
  })

  it('closes the floating module panel when the parent no longer has children', async () => {
    let library = {
      ...createLibraryState(),
      childModGroups: [{ parentModKey: 'ModForge.NpcAdventures', childModKeys: ['ModForge.VintageInterface'] }],
    }
    useLauncherLibraryMock.mockImplementation(() => library)

    const view = renderLibraryPage()
    fireEvent.click(screen.getByRole('button', { name: 'Expand child mods for NPC Adventures' }))
    expect(screen.getByRole('dialog', { name: 'NPC Adventures modules' })).toBeTruthy()

    library = { ...library, childModGroups: [] }
    view.rerender(
      <LauncherLibraryPage
        settings={createSettings()}
        launchGameLabel="Launch Game"
        launchGameDisabled={false}
        launchGameBusy={false}
        onLaunchGame={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'NPC Adventures modules' })).toBeNull()
    })
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

  it('shows the archive install dialog from the portal when the library route is hidden', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)
    inspectLauncherArchiveMock.mockResolvedValue(
      createArchivePreview({
        archivePath: 'E:\\Downloads\\preview.7z',
        archiveFileName: 'preview.7z',
      }),
    )

    renderHiddenLibraryPage({
      downloadInstallRequest: {
        id: 1,
        archivePaths: ['E:\\Downloads\\preview.7z'],
      },
    })

    await waitFor(() => {
      expect(inspectLauncherArchiveMock).toHaveBeenCalledWith({ archivePath: 'E:\\Downloads\\preview.7z' })
    })

    expect(await screen.findByRole('dialog', { name: 'Archive Preview' })).toBeTruthy()
    // The Dialog primitive portals the overlay to document.body so the dialog
    // stays outside the launcher route scroll container even when the route is hidden.
    expect(document.body.querySelector('.app-dialog-overlay')).toBeTruthy()
    expect(document.body.querySelector('.app-dialog-overlay [role="dialog"]')).toBeTruthy()
  })

  it('keeps archive inspection in a progress notification until the preview is ready', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)
    const inspection = createDeferred<InspectLauncherArchiveResult>()
    inspectLauncherArchiveMock.mockReturnValue(inspection.promise)

    renderLibraryPage()

    await act(async () => {
      await emitArchiveDragDrop({
        type: 'drop',
        paths: ['E:\\Downloads\\preview.7z'],
        position: { x: 180, y: 260 },
      })
    })

    expect(screen.queryByRole('dialog', { name: 'Archive Preview' })).toBeNull()
    expect(publishNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'launcher-library-archive-preview',
        level: 'info',
        title: 'Inspecting archive contents...',
        description: 'Inspecting preview.7z (0/1)',
        progress: 0,
      }),
    )

    inspection.resolve(
      createArchivePreview({
        archivePath: 'E:\\Downloads\\preview.7z',
        archiveFileName: 'preview.7z',
      }),
    )

    expect(await screen.findByRole('dialog', { name: 'Archive Preview' })).not.toBeNull()
    expect(dismissNotificationMock).toHaveBeenCalledWith('launcher-library-archive-preview')
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
        summary: '2 archives succeeded',
        description: '2 archives succeeded\n- First Pack\n- Second Pack',
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

    fireEvent.click(within(getLibraryMoreActionsMenu()).getByRole('menuitem', { name: 'Open Storage Folder' }))
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

    const enabledSwitch = screen.getByRole('button', { name: 'Enabled Only' })
    fireEvent.click(enabledSwitch)
    expect(library.setEnabledOnly).toHaveBeenCalledWith(true)

    const sortTrigger = screen.getByRole('button', { name: 'Quick Sort' })
    fireEvent.click(sortTrigger)
    expect(screen.queryByRole('combobox', { name: 'Quick Sort' })).toBeNull()
    expect(screen.getByRole('menu', { name: 'Quick Sort' })).not.toBeNull()

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Enabled First' }))
    // Selecting a sort mode closes the menu; reopen to verify the Enabled First option is checked.
    expect(screen.queryByRole('menu', { name: 'Quick Sort' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Quick Sort' }))
    expect(screen.getByRole('menuitemradio', { name: 'Enabled First' })).toHaveAttribute('aria-checked', 'true')
  })

  it('opens the left drawer and switches packs from the pack list', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Pack Management' }))
    fireEvent.click(await screen.findByRole('button', { name: 'All Installed Mods' }))
    await waitFor(() => {
      expect(library.setCurrentPackId).toHaveBeenCalledWith(null)
      expect(library.setScopeMode).toHaveBeenCalledWith('all')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Challenge Pack' }))

    await waitFor(() => {
      expect(library.setCurrentPackId).toHaveBeenCalledWith('challenge-pack')
      expect(library.setScopeMode).toHaveBeenCalledWith('current-pack')
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
      // setCurrentPackId throws inside runLibraryAction, so the scope switch
      // never runs and the UI stays on the previous scope.
      expect(library.setScopeMode).not.toHaveBeenCalled()
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
      expect(library.setScopeMode).toHaveBeenCalledWith('all')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Story Pack' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Challenge Pack' }))

    await waitFor(() => {
      expect(library.setCurrentPackId).toHaveBeenCalledWith('challenge-pack')
      expect(library.setScopeMode).toHaveBeenCalledWith('current-pack')
    })
  })

  it('resets the scope to all when entering the hidden mods view from a pack', async () => {
    const library = createLibraryState()
    library.scopeMode = 'current-pack'
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Pack Management' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hidden Mods' }))

    await waitFor(() => {
      expect(library.setScopeMode).toHaveBeenCalledWith('all')
    })
  })

  it('shows create, edit info and delete actions in the drawer pack menu', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Pack Management' }))
    fireEvent.click(screen.getByRole('button', { name: /create pack/i }))
    const createDialog = await screen.findByRole('dialog', { name: 'Create Pack' })
    fireEvent.change(within(createDialog).getByRole('textbox'), { target: { value: 'New Pack' } })
    expect(within(createDialog).getByRole('checkbox', { name: /sync global folder classification/i })).toBeChecked()
    fireEvent.click(within(createDialog).getByRole('button', { name: 'Create Pack' }))
    await waitFor(() => {
      expect(library.createPackPreset).toHaveBeenCalledWith('New Pack', { folderClassificationMode: 'global' })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Manage Current Pack Story Pack' }))
    expect(screen.queryByRole('button', { name: /rename current pack/i })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Pack Info' }))
    const editInfoDialog = await screen.findByRole('dialog', { name: 'Edit Pack Info' })
    fireEvent.change(within(editInfoDialog).getByRole('textbox'), { target: { value: 'Renamed Pack' } })
    fireEvent.click(within(editInfoDialog).getByRole('checkbox', { name: /sync global folder classification/i }))
    fireEvent.click(within(editInfoDialog).getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => {
      expect(library.updatePackPreset).toHaveBeenCalledWith('story-pack', {
        name: 'Renamed Pack',
        folderClassificationMode: 'independent',
      })
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
      expect(library.createPackPreset).toHaveBeenCalledWith('Broken Pack', { folderClassificationMode: 'global' })
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
      mods: library.mods.map((mod) => (mod.id === 'mod-1' ? { ...mod, imageUrl: 'E:\\Covers\\npc-adventures.png' } : mod)),
      filteredMods: library.filteredMods.map((mod) => (mod.id === 'mod-1' ? { ...mod, imageUrl: 'E:\\Covers\\npc-adventures.png' } : mod)),
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

  it('keeps click presses quiet and only shows the pointer drag preview after movement starts', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    const card = screen.getByRole('article', { name: /npc adventures/i })
    fireEvent.pointerDown(card, { button: 0, buttons: 1, clientX: 160, clientY: 160, isPrimary: true, pointerId: 71 })

    expect(screen.queryByTestId('launcher-library-drag-preview')).toBeNull()

    act(() => {
      fireEvent.pointerMove(window, { button: 0, buttons: 1, clientX: 168, clientY: 160, isPrimary: true, pointerId: 71 })
    })

    const preview = await screen.findByTestId('launcher-library-drag-preview')
    expect(preview).toHaveClass('launcher-library-pointer-drag-preview-pending')

    act(() => {
      fireEvent.pointerUp(document, { clientX: 168, clientY: 160, pointerId: 71 })
    })

    await waitFor(() => {
      expect(screen.queryByTestId('launcher-library-drag-preview')).toBeNull()
    })
    expect(library.addModsToPack).not.toHaveBeenCalled()
    expect(library.addModsToLibraryFolder).not.toHaveBeenCalled()
  })

  it('suppresses the click emitted after a threshold drag even if dnd-kit never starts an active drag', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    const card = screen.getByRole('article', { name: /npc adventures/i })
    const releaseTarget = screen.getByRole('article', { name: /vintage interface redux/i })
    const releaseTargetButton = within(releaseTarget).getByRole('button', { name: /vintage interface redux/i })

    pointerDragDown(card, 160, 160)
    act(() => {
      pointerDragMove(window, 168, 160)
    })
    await screen.findByTestId('launcher-library-drag-preview')

    act(() => {
      pointerDragUp(window, 168, 160)
    })
    fireEvent.click(releaseTargetButton)

    expect(loadLauncherRemoteModDetailMock).not.toHaveBeenCalled()

    fireEvent.click(releaseTargetButton)

    await waitFor(() => {
      expect(loadLauncherRemoteModDetailMock).toHaveBeenCalledWith({ modId: 202 })
    })
  })

  it('suppresses the release click even when a drag ends over controls outside the library grid', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    const card = screen.getByRole('article', { name: /npc adventures/i })
    const refreshButton = screen.getByRole('button', { name: 'Refresh' })

    pointerDragDown(card, 160, 160)
    act(() => {
      pointerDragMove(window, 168, 160)
    })
    await screen.findByTestId('launcher-library-drag-preview')

    act(() => {
      pointerDragUp(window, 168, 160)
    })
    fireEvent.click(refreshButton)

    expect(library.refresh).not.toHaveBeenCalled()

    fireEvent.click(refreshButton)

    expect(library.refresh).toHaveBeenCalledWith()
  })

  it('uses the resolved desktop cover image in the pointer drag preview', async () => {
    const library = createLibraryState()
    const coveredMod = { ...library.mods[0]!, imageUrl: 'https://example.test/npc-cover.png' }
    useLauncherLibraryMock.mockReturnValue({
      ...library,
      mods: [coveredMod, ...library.mods.slice(1)],
      filteredMods: [coveredMod, ...library.filteredMods.slice(1)],
    } as MockLibraryState)
    resolveLauncherImageMock.mockResolvedValue({
      sourceUrl: 'https://example.test/npc-cover.png',
      localPath: 'E:\\Covers\\npc-cover.png',
      mimeType: 'image/png',
    })
    launcherPort.toDesktopAssetUrl = vi.fn((path) => `asset://${path}`)

    renderLibraryPage()

    await waitFor(() => {
      expect(resolveLauncherImageMock).toHaveBeenCalledWith({
        url: 'https://example.test/npc-cover.png',
        refresh: false,
        modKey: '101',
      })
    })

    const card = screen.getByRole('article', { name: /npc adventures/i })
    pointerDragDown(card, 160, 160)
    act(() => {
      pointerDragMove(window, 220, 220)
    })

    const previewImage = screen.getByTestId('launcher-library-drag-preview').querySelector('img')
    expect(previewImage?.getAttribute('src')).toBe('asset://E:\\Covers\\npc-cover.png')

    act(() => {
      pointerDragUp(window, 220, 220)
    })
  })

  it('shows a locally cached launcher library cover without entering the network resolver', async () => {
    const library = createLibraryState()
    const coveredMod = { ...library.mods[0]!, imageUrl: 'https://example.test/cached-npc-cover.png' }
    useLauncherLibraryMock.mockReturnValue({
      ...library,
      mods: [coveredMod, ...library.mods.slice(1)],
      filteredMods: [coveredMod, ...library.filteredMods.slice(1)],
    } as MockLibraryState)
    launcherPort.resolveCachedImage = vi.fn().mockResolvedValue({
      sourceUrl: 'https://example.test/cached-npc-cover.png',
      localPath: 'E:\\Covers\\cached-npc-cover.png',
      mimeType: 'image/png',
    })
    launcherPort.toDesktopAssetUrl = vi.fn((path) => `asset://${path}`)

    renderLibraryPage()

    await waitFor(() => {
      expect(
        screen
          .getByRole('article', { name: /npc adventures/i })
          .querySelector('img')
          ?.getAttribute('src'),
      ).toBe('asset://E:\\Covers\\cached-npc-cover.png')
    })
    expect(launcherPort.resolveCachedImage).toHaveBeenCalledWith({
      url: 'https://example.test/cached-npc-cover.png',
      refresh: false,
      modKey: '101',
    })
    expect(resolveLauncherImageMock).not.toHaveBeenCalled()
  })

  it('uses the drag-to-select package to show a selection rectangle and mark partially intersecting cards', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    const card = screen.getByRole('article', { name: /npc adventures/i })
    const wrapper = card.closest('[data-launcher-mod-card-id]') as HTMLElement
    const viewport = card.closest('.launcher-library-grid-viewport') as HTMLElement
    const boundsSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === viewport || this.getAttribute('data-launcher-blank-drop-id') === 'launcher-library-blank') {
        return { width: 900, height: 640, top: 80, left: 80, bottom: 720, right: 980, x: 80, y: 80, toJSON: () => ({}) }
      }
      if (this === wrapper || this === card) {
        return { width: 220, height: 180, top: 120, left: 120, bottom: 300, right: 340, x: 120, y: 120, toJSON: () => ({}) }
      }
      return { width: 1, height: 1, top: 0, left: 0, bottom: 1, right: 1, x: 0, y: 0, toJSON: () => ({}) }
    })

    try {
      fireEvent.mouseDown(viewport, { button: 0, buttons: 1, clientX: 100, clientY: 100 })
      act(() => {
        fireEvent.mouseMove(viewport, { button: 0, buttons: 1, clientX: 150, clientY: 150 })
      })

      const selectionBox = await screen.findByTestId('launcher-library-box-select')
      expect(selectionBox).not.toBeNull()
      await waitFor(() => {
        expect(wrapper).toHaveClass('launcher-library-draggable-card-box-selected')
      })

      act(() => {
        fireEvent.mouseUp(window, { button: 0, clientX: 150, clientY: 150 })
      })

      await waitFor(() => {
        expect(selectionBox.style.width).toBe('0px')
        expect(wrapper).toHaveClass('launcher-library-draggable-card-box-selected')
      })

      fireEvent.click(viewport, { clientX: 620, clientY: 620 })
      expect(library.clearSelection).not.toHaveBeenCalled()

      fireEvent.click(viewport, { clientX: 620, clientY: 620 })

      expect(library.clearSelection).toHaveBeenCalled()
    } finally {
      boundsSpy.mockRestore()
    }
  })

  it('keeps drag-to-select selected styling on cards inside expanded virtual folders', async () => {
    const library = {
      ...createLibraryState(),
      currentPack: null,
      currentPackId: null,
      libraryFolders: [
        {
          id: 'visuals',
          name: 'Visuals',
          packId: null,
          hidden: false,
          parentFolderId: null,
          modKeys: ['ModForge.NpcAdventures'],
          coverModKeys: [],
        },
      ],
    } as MockLibraryState
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    clickAfterPress(screen.getByRole('button', { name: 'Open folder Visuals' }))

    const folderRegion = screen.getByRole('region', { name: 'Visuals' })
    const card = within(folderRegion).getByRole('article', { name: /npc adventures/i })
    const wrapper = card.closest('[data-launcher-mod-card-id]') as HTMLElement
    const viewport = card.closest('.launcher-library-grid-viewport') as HTMLElement
    const folderGrid = card.closest('[data-launcher-blank-drop-id]') as HTMLElement
    const boundsSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === viewport || this === folderGrid) {
        return { width: 900, height: 640, top: 80, left: 80, bottom: 720, right: 980, x: 80, y: 80, toJSON: () => ({}) }
      }
      if (this === wrapper || this === card) {
        return { width: 220, height: 180, top: 120, left: 120, bottom: 300, right: 340, x: 120, y: 120, toJSON: () => ({}) }
      }
      return { width: 1, height: 1, top: 0, left: 0, bottom: 1, right: 1, x: 0, y: 0, toJSON: () => ({}) }
    })

    try {
      fireEvent.mouseDown(viewport, { button: 0, buttons: 1, clientX: 100, clientY: 100 })
      act(() => {
        fireEvent.mouseMove(viewport, { button: 0, buttons: 1, clientX: 150, clientY: 150 })
      })

      await screen.findByTestId('launcher-library-box-select')
      await waitFor(() => {
        expect(wrapper).toHaveClass('launcher-library-draggable-card-box-selected')
      })
    } finally {
      boundsSpy.mockRestore()
      act(() => {
        fireEvent.mouseUp(window, { button: 0, clientX: 150, clientY: 150 })
      })
    }
  })

  it('does not select cards that do not intersect the drag-to-select rectangle', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    const card = screen.getByRole('article', { name: /npc adventures/i })
    const wrapper = card.closest('[data-launcher-mod-card-id]') as HTMLElement
    const viewport = card.closest('.launcher-library-grid-viewport') as HTMLElement
    const boundsSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === viewport || this.getAttribute('data-launcher-blank-drop-id') === 'launcher-library-blank') {
        return { width: 900, height: 640, top: 80, left: 80, bottom: 720, right: 980, x: 80, y: 80, toJSON: () => ({}) }
      }
      if (this === wrapper || this === card) {
        return { width: 220, height: 180, top: 120, left: 120, bottom: 300, right: 340, x: 120, y: 120, toJSON: () => ({}) }
      }
      return { width: 1, height: 1, top: 0, left: 0, bottom: 1, right: 1, x: 0, y: 0, toJSON: () => ({}) }
    })

    try {
      fireEvent.mouseDown(viewport, { button: 0, buttons: 1, clientX: 100, clientY: 100 })
      act(() => {
        fireEvent.mouseMove(viewport, { button: 0, buttons: 1, clientX: 80, clientY: 80 })
      })

      await screen.findByTestId('launcher-library-box-select')
      await waitFor(() => {
        expect(wrapper).not.toHaveClass('launcher-library-draggable-card-box-selected')
      })

      act(() => {
        fireEvent.mouseUp(window, { button: 0, clientX: 80, clientY: 80 })
      })
    } finally {
      boundsSpy.mockRestore()
    }
  })

  it('keeps drag-to-select hit testing aligned with visible cards after the grid scrolls', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    const card = screen.getByRole('article', { name: /npc adventures/i })
    const wrapper = card.closest('[data-launcher-mod-card-id]') as HTMLElement
    const viewport = card.closest('.launcher-library-grid-viewport') as HTMLElement
    Object.defineProperty(viewport, 'scrollTop', { configurable: true, value: 160 })
    Object.defineProperty(viewport, 'scrollLeft', { configurable: true, value: 0 })
    const boundsSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === viewport || this.getAttribute('data-launcher-blank-drop-id') === 'launcher-library-blank') {
        return { width: 900, height: 640, top: 80, left: 80, bottom: 720, right: 980, x: 80, y: 80, toJSON: () => ({}) }
      }
      if (this === wrapper || this === card) {
        return { width: 220, height: 180, top: 120, left: 120, bottom: 300, right: 340, x: 120, y: 120, toJSON: () => ({}) }
      }
      return { width: 1, height: 1, top: 0, left: 0, bottom: 1, right: 1, x: 0, y: 0, toJSON: () => ({}) }
    })

    try {
      fireEvent.mouseDown(viewport, { button: 0, buttons: 1, clientX: 100, clientY: 100 })
      act(() => {
        fireEvent.mouseMove(viewport, { button: 0, buttons: 1, clientX: 150, clientY: 150 })
      })

      await screen.findByTestId('launcher-library-box-select')
      const selectionLayer = document.querySelector<HTMLElement>('[data-launcher-box-select-layer="viewport"]')
      expect(selectionLayer).not.toBeNull()
      expect(selectionLayer?.style.transform).toBe('')
      await waitFor(() => {
        expect(wrapper).toHaveClass('launcher-library-draggable-card-box-selected')
      })

      act(() => {
        fireEvent.mouseUp(window, { button: 0, clientX: 150, clientY: 150 })
      })
    } finally {
      boundsSpy.mockRestore()
    }
  })

  it('replays library grid reveal when the cached route is activated again', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    const { rerender } = renderLibraryPage({ routeEnterSequence: 1 })

    const firstCardWrapper = (await screen.findByRole('article', { name: /npc adventures/i })).closest(
      '[data-launcher-mod-card-id]',
    ) as HTMLElement
    const initialRevealWrapper = firstCardWrapper.closest('.launcher-library-grid-reveal') as HTMLElement
    expect(initialRevealWrapper).toHaveClass('loading-motion-child-reveal')

    rerender(
      <LauncherTestWrapper port={launcherPort}>
        <LocaleProvider locale="en-US">
          <LauncherLibraryPage
            settings={createSettings()}
            launchGameLabel="Launch Game"
            launchGameDisabled={false}
            launchGameBusy={false}
            routeEnterSequence={2}
            onLaunchGame={vi.fn()}
          />
        </LocaleProvider>
      </LauncherTestWrapper>,
    )

    const replayedCardWrapper = screen
      .getByRole('article', { name: /npc adventures/i })
      .closest('[data-launcher-mod-card-id]') as HTMLElement
    const replayedRevealWrapper = replayedCardWrapper.closest('.launcher-library-grid-reveal') as HTMLElement
    expect(replayedRevealWrapper).toHaveClass('loading-motion-child-reveal')
    expect(replayedRevealWrapper).not.toBe(initialRevealWrapper)
    expect(document.querySelector('.launcher-library-virtual-grid')).toBeTruthy()
  })

  it('shows a lifted drag preview while a library card is being dragged', () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    const card = screen.getByRole('article', { name: /npc adventures/i })

    pointerDragDown(card, 160, 220)
    act(() => {
      pointerDragMove(document, 168, 228)
    })

    const preview = screen.getByTestId('launcher-library-drag-preview')
    expect(preview.textContent).toContain('NPC Adventures')

    act(() => {
      pointerDragMove(document, 520, 360)
    })

    expect(screen.getByTestId('launcher-library-drag-preview').textContent).toContain('NPC Adventures')

    act(() => {
      pointerDragUp(document, 520, 360)
    })

    return waitFor(() => expect(screen.queryByTestId('launcher-library-drag-preview')).toBeNull())
  })

  it('keeps the active drag preview outside the launcher route scroll container', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    const card = screen.getByRole('article', { name: /npc adventures/i })

    pointerDragDown(card, 160, 220)
    act(() => {
      pointerDragMove(document, 168, 228)
    })

    const preview = await screen.findByTestId('launcher-library-drag-preview')
    // The drag preview portals to its own scope on document.body, outside the
    // launcher route scroll container, so shell transforms cannot offset it.
    expect(preview.closest('.launcher-shell-route-active')).toBeNull()
    expect(preview.closest('.launcher-library-drag-portal-scope')).not.toBeNull()
    expect(document.body.contains(preview)).toBe(true)

    act(() => {
      pointerDragUp(document, 168, 228)
    })
  })

  it('highlights folder and blank drop targets without activating parent-mod targets', async () => {
    const library = {
      ...createLibraryState(),
      currentPackId: null,
      currentPack: null,
      libraryFolders: [
        { id: 'visuals', name: 'Visuals', packId: null, hidden: false, parentFolderId: null, modKeys: [], coverModKeys: [] },
      ],
    } as MockLibraryState
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    const card = screen.getByRole('article', { name: /npc adventures/i })
    const sourceMod = card.closest('[data-launcher-mod-card-id]') as HTMLElement
    const folder = screen.getByRole('button', { name: 'Open folder Visuals' }).closest('[data-launcher-folder-drop-id]') as HTMLElement
    const targetMod = screen
      .getByRole('article', { name: /vintage interface redux/i })
      .closest('[data-launcher-mod-card-id]') as HTMLElement
    expect(targetMod.getAttribute('data-launcher-parent-drop-id')).toBe('mod-2')
    const blank = card.closest('[data-launcher-blank-drop-id]') as HTMLElement
    const boundsSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === blank) {
        return { width: 760, height: 540, top: 80, left: 80, bottom: 620, right: 840, x: 80, y: 80, toJSON: () => ({}) }
      }
      if (this === folder) {
        return { width: 220, height: 180, top: 120, left: 120, bottom: 300, right: 340, x: 120, y: 120, toJSON: () => ({}) }
      }
      if (this === targetMod) {
        return { width: 220, height: 180, top: 120, left: 380, bottom: 300, right: 600, x: 380, y: 120, toJSON: () => ({}) }
      }
      if (this === sourceMod || this === card) {
        return { width: 220, height: 180, top: 340, left: 120, bottom: 520, right: 340, x: 120, y: 340, toJSON: () => ({}) }
      }
      return { width: 1, height: 1, top: 0, left: 0, bottom: 1, right: 1, x: 0, y: 0, toJSON: () => ({}) }
    })

    try {
      pointerDragDown(card, 160, 380)
      act(() => {
        pointerDragMove(window, 190, 410)
      })
      await screen.findByTestId('launcher-library-drag-preview')

      act(() => {
        pointerDragMove(window, 200, 180)
      })
      await waitFor(() => {
        expect(document.querySelector('[data-launcher-dnd-target-id="launcher-folder:visuals"]')).toHaveClass(
          'launcher-library-dnd-target-box-active',
        )
      })

      act(() => {
        pointerDragMove(window, 440, 180)
      })
      await waitFor(() => {
        expect(document.querySelector('[data-launcher-dnd-target-id^="launcher-parent:"]')).not.toBeNull()
        expect(
          document.querySelector('[data-launcher-dnd-target-id^="launcher-parent:"].launcher-library-dnd-target-box-active'),
        ).toBeNull()
        expect(document.querySelector('[data-launcher-dnd-target-id="launcher-library-blank"]')).toHaveClass(
          'launcher-library-dnd-target-box-active',
        )
      })

      act(() => {
        pointerDragMove(window, 720, 160)
      })
      await waitFor(() => {
        expect(document.querySelector('[data-launcher-dnd-target-id="launcher-library-blank"]')).toHaveClass(
          'launcher-library-dnd-target-box-active',
        )
      })

      act(() => {
        pointerDragUp(window, 720, 160)
      })
      await waitFor(() => {
        expect(document.querySelector('.launcher-library-dnd-target-box-active')).toBeNull()
      })
    } finally {
      boundsSpy.mockRestore()
    }
  })

  it('renders drag target boxes in the body viewport layer so shell transforms cannot offset them', async () => {
    const library = {
      ...createLibraryState(),
      currentPackId: null,
      currentPack: null,
      libraryFolders: [
        { id: 'visuals', name: 'Visuals', packId: null, hidden: false, parentFolderId: null, modKeys: [], coverModKeys: [] },
      ],
    } as MockLibraryState
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    const card = screen.getByRole('article', { name: /npc adventures/i })
    const sourceMod = card.closest('[data-launcher-mod-card-id]') as HTMLElement
    const folder = screen.getByRole('button', { name: 'Open folder Visuals' }).closest('[data-launcher-folder-drop-id]') as HTMLElement
    const blank = card.closest('[data-launcher-blank-drop-id]') as HTMLElement
    const boundsSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === blank) {
        return { width: 760, height: 540, top: 80, left: 80, bottom: 620, right: 840, x: 80, y: 80, toJSON: () => ({}) }
      }
      if (this === folder) {
        return { width: 220, height: 180, top: 120, left: 120, bottom: 300, right: 340, x: 120, y: 120, toJSON: () => ({}) }
      }
      if (this === sourceMod || this === card) {
        return { width: 220, height: 180, top: 340, left: 120, bottom: 520, right: 340, x: 120, y: 340, toJSON: () => ({}) }
      }
      return { width: 1, height: 1, top: 0, left: 0, bottom: 1, right: 1, x: 0, y: 0, toJSON: () => ({}) }
    })

    try {
      pointerDragDown(card, 160, 380)
      act(() => {
        pointerDragMove(window, 168, 388)
      })
      await screen.findByTestId('launcher-library-drag-preview')

      const targetLayer = document.body.querySelector<HTMLElement>('.launcher-library-dnd-target-layer')
      expect(targetLayer).not.toBeNull()
      expect(targetLayer?.parentElement).toBe(document.body)
      const folderTarget = await waitFor(() => {
        const target = document.body.querySelector<HTMLElement>('[data-launcher-dnd-target-id="launcher-folder:visuals"]')
        expect(target).not.toBeNull()
        return target
      })
      expect(folderTarget).not.toBeNull()
      expect(folderTarget?.style.left).toBe('120px')
      expect(folderTarget?.style.top).toBe('120px')
      expect(folderTarget?.style.width).toBe('220px')
      expect(folderTarget?.style.height).toBe('180px')

      const previewLayer = document.body.querySelector<HTMLElement>('.launcher-library-pending-drag-preview-layer')
      expect(previewLayer?.parentElement).toBe(document.body)
      expect(previewLayer?.style.transform).toBe('translate3d(128px, 348px, 0)')
    } finally {
      boundsSpy.mockRestore()
      act(() => {
        pointerDragUp(window, 190, 410)
      })
    }
  })

  it('does not open a folder from the click event emitted after dragging it', async () => {
    const library = {
      ...createLibraryState(),
      currentPackId: null,
      currentPack: null,
      libraryFolders: [
        { id: 'visuals', name: 'Visuals', packId: null, hidden: false, parentFolderId: null, modKeys: [], coverModKeys: [] },
      ],
    } as MockLibraryState
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    const folder = screen.getByRole('button', { name: 'Open folder Visuals' })

    pointerDragDown(folder, 160, 160)
    act(() => {
      pointerDragMove(window, 220, 220)
    })
    await screen.findByTestId('launcher-library-drag-preview')
    act(() => {
      pointerDragUp(window, 220, 220)
    })
    fireEvent.click(folder)

    expect(screen.queryByRole('dialog', { name: 'Visuals' })).toBeNull()
  })

  it('does not show grab feedback until the pointer moves beyond the drag threshold', () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    const card = screen.getByRole('article', { name: /npc adventures/i })
    const draggableCard = card.closest('.launcher-library-draggable-card')

    expect(draggableCard?.classList.contains('launcher-library-card-grab-pending')).toBe(false)

    fireEvent.pointerDown(card, { button: 0, buttons: 1, clientX: 160, clientY: 220, isPrimary: true, pointerId: 19 })

    expect(draggableCard?.classList.contains('launcher-library-card-grab-pending')).toBe(false)

    fireEvent.pointerMove(window, { button: 0, buttons: 1, clientX: 164, clientY: 220, isPrimary: true, pointerId: 19 })

    expect(draggableCard?.classList.contains('launcher-library-card-grab-pending')).toBe(false)

    fireEvent.pointerMove(window, { button: 0, buttons: 1, clientX: 168, clientY: 220, isPrimary: true, pointerId: 19 })

    expect(draggableCard?.classList.contains('launcher-library-card-grab-pending')).toBe(true)

    fireEvent.pointerUp(window, { button: 0, clientX: 168, clientY: 220, pointerId: 19 })

    expect(draggableCard?.classList.contains('launcher-library-card-grab-pending')).toBe(false)
  })

  it('opens mod details from the context menu and keeps direct card actions', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)
    chooseImageFileMock.mockResolvedValue('E:\\Covers\\npc-adventures.png')
    setLauncherLibraryCoverMock.mockResolvedValue({ covers: [] })

    renderLibraryPage()

    fireEvent.doubleClick(screen.getByRole('button', { name: /npc adventures/i }))
    await waitFor(() => {
      expect(openLauncherPathMock).toHaveBeenCalledWith({ path: 'E:\\Games\\Stardew Valley\\Mods\\NPC Adventures' })
    })

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
    expect(within(dialog).getByRole('heading', { name: 'NPC Adventures' })).not.toBeNull()

    fireEvent.contextMenu(screen.getByRole('article', { name: /npc adventures/i }))
    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Open Folder' })[0]!)
    fireEvent.contextMenu(screen.getByRole('article', { name: /npc adventures/i }))
    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Disable' })[0]!)
    fireEvent.contextMenu(screen.getByRole('article', { name: /npc adventures/i }))
    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Set Cover' })[0]!)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open Mod Page' }))

    await waitFor(() => {
      expect(openLauncherUrlMock).toHaveBeenCalledWith({ url: 'https://www.nexusmods.com/stardewvalley/mods/101' })
      expect(openLauncherPathMock).toHaveBeenCalledTimes(2)
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

  it('filters hidden global folders into the hidden bucket and restores them from the folder menu', async () => {
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
      currentPack: null,
      currentPackId: null,
      mods: [primaryMod, hiddenMod],
      filteredMods: [primaryMod],
      hiddenModKeys: ['ModForge.Hidden'],
      libraryFolders: [
        {
          id: 'hidden-visuals',
          name: 'Hidden Visuals',
          packId: null,
          hidden: true,
          parentFolderId: null,
          modKeys: ['ModForge.NpcAdventures'],
          coverModKeys: [],
        },
        {
          id: 'visible-visuals',
          name: 'Visible Visuals',
          packId: null,
          hidden: false,
          parentFolderId: null,
          modKeys: [],
          coverModKeys: [],
        },
        {
          id: 'pack-visuals',
          name: 'Pack Visuals',
          packId: 'story-pack',
          hidden: true,
          parentFolderId: null,
          modKeys: ['ModForge.NpcAdventures'],
          coverModKeys: [],
        },
      ],
    } as MockLibraryState
    useLauncherLibraryMock.mockReturnValue(library)

    const { container } = renderLibraryPage()

    expect(screen.queryByRole('button', { name: 'Open folder Hidden Visuals' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open folder Pack Visuals' })).toBeNull()
    expect(screen.queryByRole('article', { name: /npc adventures/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Pack Management' }))
    await waitFor(() => {
      const hiddenRow = Array.from(container.querySelectorAll<HTMLElement>('.launcher-library-pack-row')).find(
        (row) => row.getAttribute('aria-label') === 'Hidden Mods',
      )
      expect(hiddenRow?.querySelector('.launcher-library-pack-row-count-badge')?.textContent).toBe('2')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Hidden Mods' }))

    const hiddenFolderButton = screen.getByRole('button', { name: 'Open folder Hidden Visuals' })
    expect(hiddenFolderButton).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Open folder Pack Visuals' })).toBeNull()
    fireEvent.click(hiddenFolderButton)
    expect(within(screen.getByRole('region', { name: 'Hidden Visuals' })).getByRole('article', { name: /npc adventures/i })).not.toBeNull()

    fireEvent.contextMenu(screen.getByRole('region', { name: 'Hidden Visuals' }))
    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Show folder' })[0]!)
    await waitFor(() => {
      expect(library.showLibraryFolder).toHaveBeenCalledWith('hidden-visuals')
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
        refresh: true,
        modKey: '101',
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
    const installDeferred = createDeferred<InstallLauncherArchiveResult>()
    library.installArchive = vi.fn(() => installDeferred.promise)
    useLauncherLibraryMock.mockReturnValue(library)
    chooseArchiveFilesMock.mockResolvedValue(['E:\\Downloads\\preview.zip'])
    inspectLauncherArchiveMock.mockResolvedValue(createArchivePreview())

    renderLibraryPage()

    clickInstallArchiveAction()

    await waitFor(() => {
      expect(inspectLauncherArchiveMock).toHaveBeenCalledWith({ archivePath: 'E:\\Downloads\\preview.zip' })
    })

    fireEvent.click(await screen.findByRole('button', { name: /^install$/i }))

    await waitFor(() => {
      expect(library.installArchive).toHaveBeenCalledWith('E:\\Downloads\\preview.zip')
      expect(screen.queryByRole('dialog', { name: 'Archive Preview' })).toBeNull()
      expect(publishNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'launcher-library-archive-install',
          level: 'info',
          title: 'Installing archive...',
          description: 'Installing preview.zip (0/1)\nYou can keep using the launcher while installation continues.',
          autoDismissMs: null,
          progress: 0,
        }),
      )
    })

    await act(async () => {
      installDeferred.resolve(createInstallArchiveResult())
      await installDeferred.promise
    })

    await waitFor(() => {
      expect(publishNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'success',
          title: 'Install Summary',
          summary: '1 archives succeeded',
          description: '1 archives succeeded\n- Example Pack',
        }),
      )
    })
  })

  it('publishes an install result notification after archive installation and opens the summary dialog from the notification action', async () => {
    const library = createLibraryState()
    library.installArchive = vi.fn(async () => createInstallArchiveResult())
    useLauncherLibraryMock.mockReturnValue(library)
    chooseArchiveFilesMock.mockResolvedValue(['E:\\Downloads\\preview.zip'])
    inspectLauncherArchiveMock.mockResolvedValue(createArchivePreview())
    listLauncherInstallBackupsMock.mockResolvedValue([createInstallBackupSummary()])

    renderLibraryPage()

    clickInstallArchiveAction()
    fireEvent.click(await screen.findByRole('button', { name: /^install$/i }))

    expect(screen.queryByRole('dialog', { name: 'Install Summary' })).toBeNull()

    await waitFor(() => {
      expect(publishNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'success',
          title: 'Install Summary',
          summary: '1 archives succeeded',
          description: '1 archives succeeded\n- Example Pack',
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
    expect(screen.queryByRole('dialog', { name: 'Install Summary' })).toBeNull()

    await waitFor(() => {
      expect(listLauncherInstallBackupsMock).toHaveBeenCalledWith({
        modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      })
    })
    expect(screen.queryAllByRole('dialog')).toHaveLength(1)
    expect(await screen.findByRole('dialog', { name: 'Install Backups' })).not.toBeNull()
  })

  it('keeps install backups mutually exclusive with the install summary when loading from the summary fails', async () => {
    const library = createLibraryState()
    library.installArchive = vi.fn(async () => createInstallArchiveResult())
    useLauncherLibraryMock.mockReturnValue(library)
    chooseArchiveFilesMock.mockResolvedValue(['E:\\Downloads\\preview.zip'])
    inspectLauncherArchiveMock.mockResolvedValue(createArchivePreview())
    listLauncherInstallBackupsMock.mockRejectedValue(new Error('Backups unavailable'))

    renderLibraryPage()

    clickInstallArchiveAction()
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
    expect(screen.queryByRole('dialog', { name: 'Install Summary' })).toBeNull()

    await waitFor(() => {
      expect(listLauncherInstallBackupsMock).toHaveBeenCalledWith({
        modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      })
    })

    const backupsDialog = await screen.findByRole('dialog', { name: 'Install Backups' })
    expect(screen.queryAllByRole('dialog')).toHaveLength(1)
    expect(within(backupsDialog).getByText('Backups unavailable')).not.toBeNull()
  })

  it('does not restore the install summary when backup loading is closed before it finishes', async () => {
    const library = createLibraryState()
    library.installArchive = vi.fn(async () => createInstallArchiveResult())
    useLauncherLibraryMock.mockReturnValue(library)
    chooseArchiveFilesMock.mockResolvedValue(['E:\\Downloads\\preview.zip'])
    inspectLauncherArchiveMock.mockResolvedValue(createArchivePreview())
    const backupsDeferred = createDeferred<LauncherInstallBackupSummary[]>()
    listLauncherInstallBackupsMock.mockReturnValue(backupsDeferred.promise)

    renderLibraryPage()

    clickInstallArchiveAction()
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
    expect(screen.queryByRole('dialog', { name: 'Install Summary' })).toBeNull()

    const backupsDialog = await screen.findByRole('dialog', { name: 'Install Backups' })
    fireEvent.click(within(backupsDialog).getByRole('button', { name: 'Close' }))

    await act(async () => {
      backupsDeferred.resolve([createInstallBackupSummary()])
      await Promise.resolve()
    })

    expect(screen.queryByRole('dialog', { name: 'Install Backups' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Install Summary' })).toBeNull()
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

    fireEvent.click(within(getLibraryMoreActionsMenu()).getByRole('menuitem', { name: 'Install Backups' }))

    const backupsDialog = await screen.findByRole('dialog', { name: 'Install Backups' })
    expect(within(backupsDialog).getByText('install-123')).not.toBeNull()

    fireEvent.click(within(backupsDialog).getByRole('button', { name: 'Restore Backup' }))
    expect(within(backupsDialog).getByText('Confirm Backup Restore')).not.toBeNull()
    expect(within(backupsDialog).getByText(/E:\\Games\\Stardew Valley\\Mods/)).not.toBeNull()
    expect(within(backupsDialog).getByText(/delete 3 files or folders/)).not.toBeNull()
    expect(within(backupsDialog).getByText(/overwrite 2 backed-up files/)).not.toBeNull()
    fireEvent.click(within(backupsDialog).getByRole('button', { name: 'Confirm Restore' }))

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

    fireEvent.click(within(getLibraryMoreActionsMenu()).getByRole('menuitem', { name: 'Install Backups' }))

    const backupsDialog = await screen.findByRole('dialog', { name: 'Install Backups' })
    fireEvent.click(within(backupsDialog).getByRole('button', { name: 'Restore Backup' }))
    fireEvent.click(within(backupsDialog).getByRole('button', { name: 'Confirm Restore' }))

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

  it('shows backup restore failures inside the backup manager dialog', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)
    listLauncherInstallBackupsMock.mockResolvedValue([createInstallBackupSummary()])
    restoreLauncherInstallBackupMock.mockRejectedValue(new Error('Restore failed'))

    renderLibraryPage()

    fireEvent.click(within(getLibraryMoreActionsMenu()).getByRole('menuitem', { name: 'Install Backups' }))

    const backupsDialog = await screen.findByRole('dialog', { name: 'Install Backups' })
    fireEvent.click(within(backupsDialog).getByRole('button', { name: 'Restore Backup' }))
    fireEvent.click(within(backupsDialog).getByRole('button', { name: 'Confirm Restore' }))

    expect(await within(backupsDialog).findByText('Restore failed')).not.toBeNull()
  })

  it('virtualizes the large-library grid instead of rendering every card', async () => {
    const library = createLargeLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    expect(screen.getByRole('article', { name: /^large library mod 1$/i })).not.toBeNull()
    expect(screen.queryByRole('article', { name: /^large library mod 80$/i })).toBeNull()
    expect(screen.getAllByRole('article').length).toBeLessThan(library.mods.length)
    expect(document.querySelector('.launcher-library-virtual-grid')).toBeTruthy()

    fireEvent.contextMenu(screen.getByRole('article', { name: /^large library mod 1$/i }))
    expect((await screen.findAllByRole('menuitem', { name: 'View Details' })).length).toBeGreaterThan(0)
  })

  it('renders only virtual rows near the viewport', () => {
    const library = createLargeLibraryState(12)
    const boundsSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('launcher-library-grid-viewport')) {
        return { width: 560, height: 420, top: 0, left: 0, bottom: 420, right: 560, x: 0, y: 0, toJSON: () => ({}) }
      }
      if (this.classList.contains('launcher-library-virtual-row') || this.classList.contains('launcher-library-grid-reveal')) {
        return { width: 260, height: 210, top: 0, left: 0, bottom: 210, right: 260, x: 0, y: 0, toJSON: () => ({}) }
      }
      return { width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0, toJSON: () => ({}) }
    })
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    const virtualRows = Array.from(document.querySelectorAll<HTMLElement>('.launcher-library-virtual-row'))
    expect(virtualRows.length).toBeGreaterThan(0)
    expect(measureVirtualGridRowFactoryMock).toHaveBeenCalledWith(expect.any(Function))
    expect(measureVirtualGridRowMock).toHaveBeenCalled()
    expect(virtualRows[0]?.style.paddingBottom).toBe('')
    const measureVirtualRow = measureVirtualGridRowFactoryMock.mock.calls.at(-1)?.[0]
    expect(measureVirtualRow?.(virtualRows[0]!)).toBe(230)
    expect(screen.getAllByRole('article').length).toBeLessThanOrEqual(library.mods.length)

    boundsSpy.mockRestore()
  })

  it('uses multiple columns for a large-screen virtualized library grid', async () => {
    const library = createLargeLibraryState(16)
    const boundsSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('launcher-library-grid-viewport')) {
        return { width: 1120, height: 840, top: 0, left: 0, bottom: 840, right: 1120, x: 0, y: 0, toJSON: () => ({}) }
      }
      if (this.classList.contains('launcher-library-grid-reveal')) {
        return { width: 260, height: 210, top: 0, left: 0, bottom: 210, right: 260, x: 0, y: 0, toJSON: () => ({}) }
      }
      return { width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0, toJSON: () => ({}) }
    })
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    await waitFor(() => {
      const firstRow = document.querySelector<HTMLElement>('.launcher-library-virtual-row')
      expect(firstRow?.style.gridTemplateColumns).toContain('repeat(4')
    })

    boundsSpy.mockRestore()
  })

  it('recalculates virtualized grid columns when the window is maximized after reveal motion', async () => {
    const library = createLargeLibraryState(16)
    let viewportWidth = 1120
    const activeResizeCallbacks = new Set<ResizeObserverCallback>()
    const OriginalResizeObserver = globalThis.ResizeObserver
    class TestResizeObserver implements ResizeObserver {
      private readonly callback: ResizeObserverCallback

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }

      observe() {
        activeResizeCallbacks.add(this.callback)
      }

      unobserve() {}

      disconnect() {
        activeResizeCallbacks.delete(this.callback)
      }
    }
    globalThis.ResizeObserver = TestResizeObserver
    const boundsSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('launcher-library-grid-viewport')) {
        return {
          width: viewportWidth,
          height: 840,
          top: 0,
          left: 0,
          bottom: 840,
          right: viewportWidth,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }
      }
      if (this.classList.contains('launcher-library-grid-reveal')) {
        return { width: 260, height: 210, top: 0, left: 0, bottom: 210, right: 260, x: 0, y: 0, toJSON: () => ({}) }
      }
      return { width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0, toJSON: () => ({}) }
    })
    try {
      useLauncherLibraryMock.mockReturnValue(library)

      renderLibraryPage()

      await waitFor(() => {
        expect(document.querySelector<HTMLElement>('.launcher-library-virtual-row')?.style.gridTemplateColumns).toContain('repeat(4')
      })

      await new Promise((resolve) => window.setTimeout(resolve, 950))
      viewportWidth = 1840
      act(() => {
        for (const callback of activeResizeCallbacks) {
          callback([], {} as ResizeObserver)
        }
      })

      await waitFor(() => {
        expect(document.querySelector<HTMLElement>('.launcher-library-virtual-row')?.style.gridTemplateColumns).toContain('repeat(6')
      })
    } finally {
      boundsSpy.mockRestore()
      globalThis.ResizeObserver = OriginalResizeObserver
    }
  }, 10_000)

  it('recalculates virtualized grid columns from window resize events', async () => {
    const library = createLargeLibraryState(16)
    let viewportWidth = 1120
    const OriginalResizeObserver = globalThis.ResizeObserver
    class TestResizeObserver implements ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = TestResizeObserver
    const boundsSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('launcher-library-grid-viewport')) {
        return {
          width: viewportWidth,
          height: 840,
          top: 0,
          left: 0,
          bottom: 840,
          right: viewportWidth,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }
      }
      if (this.classList.contains('launcher-library-grid-reveal')) {
        return { width: 260, height: 210, top: 0, left: 0, bottom: 210, right: 260, x: 0, y: 0, toJSON: () => ({}) }
      }
      return { width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0, toJSON: () => ({}) }
    })
    try {
      useLauncherLibraryMock.mockReturnValue(library)

      renderLibraryPage()

      await waitFor(() => {
        expect(document.querySelector<HTMLElement>('.launcher-library-virtual-row')?.style.gridTemplateColumns).toContain('repeat(4')
      })

      viewportWidth = 1840
      act(() => {
        window.dispatchEvent(new Event('resize'))
      })

      await waitFor(() => {
        expect(document.querySelector<HTMLElement>('.launcher-library-virtual-row')?.style.gridTemplateColumns).toContain('repeat(6')
      })
    } finally {
      boundsSpy.mockRestore()
      globalThis.ResizeObserver = OriginalResizeObserver
    }
  }, 10_000)

  it('observes the library grid viewport for virtual column recalculation', () => {
    const library = createLargeLibraryState(16)
    const observedElements: Element[] = []
    const OriginalResizeObserver = globalThis.ResizeObserver
    class TestResizeObserver implements ResizeObserver {
      observe(target: Element) {
        observedElements.push(target)
      }

      unobserve() {}

      disconnect() {}
    }
    globalThis.ResizeObserver = TestResizeObserver
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    expect(observedElements.some((element) => element.classList.contains('launcher-library-grid-viewport'))).toBe(true)

    globalThis.ResizeObserver = OriginalResizeObserver
  })

  it('keeps virtual rows mounted while the library grid is during route switches', async () => {
    const library = createLargeLibraryState(16)
    let hidden = false
    const resizeCallbacks: ResizeObserverCallback[] = []
    const OriginalResizeObserver = globalThis.ResizeObserver
    class TestResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallbacks.push(callback)
      }

      observe() {}

      unobserve() {}

      disconnect() {}
    }
    globalThis.ResizeObserver = TestResizeObserver
    const boundsSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('launcher-library-grid-viewport')) {
        if (hidden) {
          return { width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0, toJSON: () => ({}) }
        }
        return { width: 1120, height: 840, top: 0, left: 0, bottom: 840, right: 1120, x: 0, y: 0, toJSON: () => ({}) }
      }
      if (this.classList.contains('launcher-library-grid-reveal')) {
        return { width: 260, height: 210, top: 0, left: 0, bottom: 210, right: 260, x: 0, y: 0, toJSON: () => ({}) }
      }
      return { width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0, toJSON: () => ({}) }
    })
    useLauncherLibraryMock.mockReturnValue(library)

    const { container } = renderLibraryPage()

    await waitFor(() => {
      expect(container.querySelectorAll('.launcher-library-virtual-row').length).toBeGreaterThan(0)
    })

    hidden = true
    act(() => {
      for (const callback of resizeCallbacks) {
        callback([], {} as ResizeObserver)
      }
    })

    expect(container.querySelectorAll('.launcher-library-virtual-row').length).toBeGreaterThan(0)

    boundsSpy.mockRestore()
    globalThis.ResizeObserver = OriginalResizeObserver
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

    expect(screen.getByText('Your Library Is Empty')).not.toBeNull()
    expect(
      screen.getByText(
        'No installed mods were found in the configured Mods folder. Check that the Mods path points to the right folder, or refresh after adding mods.',
      ),
    ).not.toBeNull()
  })

  it('renders an empty card with an open-settings action when the mods path is not set', () => {
    const library = createLibraryState()
    library.mods = []
    library.filteredMods = []
    library.selectedMod = null
    library.selectedModId = null
    library.currentPack = null
    library.currentPackId = null
    useLauncherLibraryMock.mockReturnValue(library)
    const onNavigateToSettings = vi.fn()

    const { container } = renderLibraryPage({
      settings: createSettings({ modsPath: null }),
      onNavigateToSettings,
    })

    expect(container.querySelector('.launcher-library-empty-host')).not.toBeNull()
    expect(container.querySelector('.launcher-empty-card')).not.toBeNull()
    expect(screen.getByText('Mods Path Not Set')).not.toBeNull()
    expect(screen.getByText('Configure the Mods path in Settings before scanning the local library.')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
    expect(onNavigateToSettings).toHaveBeenCalledTimes(1)
  })

  it('renders an empty card with open-settings and refresh actions when the library has no mods', () => {
    const library = createLibraryState()
    library.mods = []
    library.filteredMods = []
    library.selectedMod = null
    library.selectedModId = null
    library.currentPack = null
    library.currentPackId = null
    useLauncherLibraryMock.mockReturnValue(library)
    const onNavigateToSettings = vi.fn()

    const { container } = renderLibraryPage({ onNavigateToSettings })

    expect(container.querySelector('.launcher-empty-card')).not.toBeNull()
    expect(screen.getByText('Your Library Is Empty')).not.toBeNull()

    const refreshButton = screen.getByRole('button', { name: 'Refresh Library' })
    expect(refreshButton).not.toBeNull()
    fireEvent.click(refreshButton)
    expect(library.refresh).toHaveBeenCalled()

    const settingsButton = screen.getByRole('button', { name: 'Open Settings' })
    expect(settingsButton).not.toBeNull()
    fireEvent.click(settingsButton)
    expect(onNavigateToSettings).toHaveBeenCalledTimes(1)
  })

  it('renders an empty card without actions when filters hide all mods', () => {
    const library = createLibraryState()
    library.filteredMods = []
    library.filterText = 'zzzznomatch'
    useLauncherLibraryMock.mockReturnValue(library)

    const { container } = renderLibraryPage()

    expect(container.querySelector('.launcher-empty-card')).not.toBeNull()
    expect(screen.getByText('No Matching Mods')).not.toBeNull()
    expect(container.querySelector('.launcher-empty-card-actions')).toBeNull()
  })
})
