import type { ReactElement, ReactNode } from 'react'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InspectLauncherArchiveResult, LauncherLibraryModSummary, LauncherSettings } from '../../../lib/desktop'
import {
  chooseArchiveFile,
  chooseImageFile,
  getLauncherBackupDirectory,
  inspectLauncherArchive,
  openLauncherPath,
  setLauncherLibraryCover,
} from '../../../lib/desktop'
import { useLauncherLibrary } from '../../../lib/launcher/useLauncherLibrary'
import { renderWithLocale } from '../../../test/renderWithLocale'
import { LauncherLibraryPage } from './LauncherLibraryPage'

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

vi.mock('../../../lib/desktop', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/desktop')>('../../../lib/desktop')
  return {
    ...actual,
    chooseArchiveFile: vi.fn(),
    chooseImageFile: vi.fn(),
    getLauncherBackupDirectory: vi.fn(),
    inspectLauncherArchive: vi.fn(),
    openLauncherPath: vi.fn(),
    setLauncherLibraryCover: vi.fn(),
  }
})

vi.mock('../../../lib/launcher/useLauncherLibrary', () => ({
  useLauncherLibrary: vi.fn(),
}))

type MockLibraryState = ReturnType<typeof useLauncherLibrary> & {
  activeStorageFolderId?: string | null
  setActiveStorageFolderId?: (folderId: string) => void
}

const chooseArchiveFileMock = vi.mocked(chooseArchiveFile)
const chooseImageFileMock = vi.mocked(chooseImageFile)
const getLauncherBackupDirectoryMock = vi.mocked(getLauncherBackupDirectory)
const inspectLauncherArchiveMock = vi.mocked(inspectLauncherArchive)
const openLauncherPathMock = vi.mocked(openLauncherPath)
const setLauncherLibraryCoverMock = vi.mocked(setLauncherLibraryCover)
const useLauncherLibraryMock = vi.mocked(useLauncherLibrary)

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

function createLibraryState(): MockLibraryState {
  const primaryMod = createLibraryMod()
  return {
    mods: [primaryMod],
    filteredMods: [primaryMod],
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
      {
        id: 'staging',
        name: 'Staging',
        modKeys: [],
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
    ],
    activeStorageFolderId: 'primary',
    setActiveStorageFolderId: vi.fn(),
    setSelectedModId: vi.fn(),
    setFilterText: vi.fn(),
    setEnabledOnly: vi.fn(),
    refresh: vi.fn(async () => {}),
    toggleEnabled: vi.fn(async () => {}),
    installArchive: vi.fn(async () => {}),
    toggleModSelection: vi.fn(),
    clearSelection: vi.fn(),
    selectAllFiltered: vi.fn(),
    assignSelectionToFolder: vi.fn(async () => {}),
    createStorageFolder: vi.fn(async () => {}),
    renameStorageFolder: vi.fn(async () => {}),
    deleteStorageFolder: vi.fn(async () => {}),
    addSelectionToPack: vi.fn(async () => {}),
    createPackPreset: vi.fn(async () => {}),
    renamePackPreset: vi.fn(async () => {}),
    deletePackPreset: vi.fn(async () => {}),
    setCurrentPackId: vi.fn(async () => {}),
    applyCurrentPack: vi.fn(async () => {}),
    setSelectionEnabled: vi.fn(async () => {}),
    selectNextSearchMatch: vi.fn(),
    selectPreviousSearchMatch: vi.fn(),
  } as unknown as MockLibraryState
}

function renderLibraryPage(overrides: Partial<Parameters<typeof LauncherLibraryPage>[0]> = {}) {
  const onLaunchGame = vi.fn()
  const view = renderWithLocale(
    <LauncherLibraryPage
      settings={createSettings()}
      launchGameLabel="Launch Game"
      launchGameDisabled={false}
      launchGameBusy={false}
      onLaunchGame={onLaunchGame}
      {...overrides}
    />,
    'en-US',
  )

  return {
    ...view,
    onLaunchGame,
  }
}

describe('LauncherLibraryPage', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders the pack-first controls without checkbox selection affordances', () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    expect(screen.queryByRole('checkbox')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Current Pack' }))
    fireEvent.click(screen.getByRole('button', { name: /pack preset story pack/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply Pack' }))

    expect(library.setScopeMode).toHaveBeenCalledWith('current-pack')
    expect(library.setCurrentPackId).toHaveBeenCalledWith('story-pack')
    expect(library.applyCurrentPack).toHaveBeenCalled()
  })

  it('renders a dense cover tile with a text placeholder when no image is available', () => {
    const disabledMod = createLibraryMod({
      id: 'mod-2',
      name: 'No Cover Pack',
      enabled: false,
      imageUrl: null,
    })
    const library = createLibraryState()
    library.mods = [disabledMod]
    library.filteredMods = [disabledMod]
    library.selectedMod = disabledMod
    library.selectedModId = 'mod-2'
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    const card = screen.getByRole('article', { name: /no cover pack/i })
    expect(within(card).queryByText('No Cover')).toBeNull()
    expect(within(card).getAllByText('No Cover Pack').length).toBe(1)
    expect(within(card).getByText('COVER')).not.toBeNull()
    expect(within(card).getByText('ModForge')).not.toBeNull()
    expect(within(card).getByText('Story Pack')).not.toBeNull()
    expect(card.className).toContain('launcher-mod-card-disabled')
    expect(within(card).queryByText('Primary Mods')).toBeNull()
  })

  it('supports dragging a card onto a pack preset', () => {
    const library = createLibraryState()
    library.packPresets = [
      {
        id: 'story-pack',
        name: 'Story Pack',
        modKeys: ['ModForge.NpcAdventures'],
      },
      {
        id: 'challenge-pack',
        name: 'Challenge Pack',
        modKeys: [],
      },
    ]
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.dragStart(screen.getByRole('article', { name: /npc adventures/i }))
    fireEvent.drop(screen.getByRole('button', { name: /pack preset challenge pack/i }))

    expect(library.setSelectedModId).toHaveBeenCalledWith('mod-1')
    expect(library.setSelectedModIds).toHaveBeenCalledWith(['mod-1'])
    expect(library.addSelectionToPack).toHaveBeenCalledWith('challenge-pack')
  })

  it('opens mod details from the card context menu and allows closing the centered float panel', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)
    chooseImageFileMock.mockResolvedValue('E:\\Covers\\npc-adventures.png')
    setLauncherLibraryCoverMock.mockResolvedValue({ covers: [] })

    renderLibraryPage()

    expect(screen.queryByRole('dialog', { name: 'NPC Adventures' })).toBeNull()
    fireEvent.contextMenu(screen.getByRole('article', { name: /npc adventures/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'View Details' }))

    const dialog = await screen.findByRole('dialog', { name: 'NPC Adventures' })
    expect(within(dialog).getByText('NPC Adventures')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Set Cover' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(setLauncherLibraryCoverMock).toHaveBeenCalledWith({
        labelKey: 'ModForge.NpcAdventures',
        imagePath: 'E:\\Covers\\npc-adventures.png',
      })
    })
    expect(library.refresh).toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'NPC Adventures' })).toBeNull()
  })

  it('does not show mod details until the context menu action is used', () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    expect(screen.queryByRole('dialog', { name: 'NPC Adventures' })).toBeNull()
  })

  it('opens the library root and backup directory from the page header', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)
    getLauncherBackupDirectoryMock.mockResolvedValue('E:\\Backups\\Launcher')

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Open Storage Folder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Backups' }))

    await waitFor(() => {
      expect(openLauncherPathMock).toHaveBeenCalledWith({ path: 'E:\\Games\\Stardew Valley\\Mods' })
      expect(openLauncherPathMock).toHaveBeenCalledWith({ path: 'E:\\Backups\\Launcher' })
    })
  })

  it('inspects an archive before confirming installation', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)
    chooseArchiveFileMock.mockResolvedValue('E:\\Downloads\\preview.zip')
    inspectLauncherArchiveMock.mockResolvedValue(createArchivePreview())

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: /install archive/i }))

    await waitFor(() => {
      expect(inspectLauncherArchiveMock).toHaveBeenCalledWith({ archivePath: 'E:\\Downloads\\preview.zip' })
    })
    expect((await screen.findAllByText('preview.zip')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('ExamplePack').length).toBeGreaterThan(0)
  })

  it('installs the inspected archive after confirmation', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)
    chooseArchiveFileMock.mockResolvedValue('E:\\Downloads\\preview.zip')
    inspectLauncherArchiveMock.mockResolvedValue(createArchivePreview())

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: /install archive/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^install$/i }))

    expect(library.installArchive).toHaveBeenCalledWith('E:\\Downloads\\preview.zip')
  })

  it('renders the launch game action as a floating button on the library page', () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)
    const { onLaunchGame } = renderLibraryPage()

    const launchButton = screen.getByRole('button', { name: 'Launch Game' })
    expect(launchButton.className).toContain('launcher-library-launch-fab')

    fireEvent.click(launchButton)

    expect(onLaunchGame).toHaveBeenCalled()
  })
})
