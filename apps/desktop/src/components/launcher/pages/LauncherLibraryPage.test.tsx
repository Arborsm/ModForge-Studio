import type { ReactElement, ReactNode } from 'react'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InspectLauncherArchiveResult, LauncherLibraryModSummary, LauncherSettings } from '../../../lib/desktop'
import {
  chooseArchiveFile,
  chooseImageFile,
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
    inspectLauncherArchive: vi.fn(),
    openLauncherPath: vi.fn(),
    setLauncherLibraryCover: vi.fn(),
  }
})

vi.mock('../../../lib/launcher/useLauncherLibrary', () => ({
  useLauncherLibrary: vi.fn(),
}))

type MockLibraryState = ReturnType<typeof useLauncherLibrary>

const chooseArchiveFileMock = vi.mocked(chooseArchiveFile)
const chooseImageFileMock = vi.mocked(chooseImageFile)
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
    replacePackMods: vi.fn(async () => {}),
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

  it('renders the refreshed console card with inline launch and pack controls', () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    expect(screen.getByRole('heading', { name: 'Installed Library' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Refresh' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Open Storage Folder' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Install Archive' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Launch Game' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Current Pack' })).toBeNull()
    expect(screen.getByRole('button', { name: /story pack/i })).not.toBeNull()
    expect(screen.queryByRole('button', { name: /edit pack contents/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Apply Pack' })).toBeNull()
  })

  it('switches packs from the compact pack menu', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: /story pack/i }))
    fireEvent.click(screen.getByRole('button', { name: 'All Packs' }))
    fireEvent.click(screen.getByRole('button', { name: /story pack/i }))
    fireEvent.click(screen.getByRole('button', { name: /pack preset challenge pack/i }))

    await waitFor(() => {
      expect(library.setCurrentPackId).toHaveBeenCalledWith(null)
      expect(library.setCurrentPackId).toHaveBeenCalledWith('challenge-pack')
    })
  })

  it('shows create, edit, rename and delete actions for the current pack in the settings bubble', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)
    const promptSpy = vi.spyOn(window, 'prompt')
    promptSpy.mockReturnValueOnce('New Pack')
    promptSpy.mockReturnValueOnce('Renamed Pack')
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: /manage current pack/i }))
    fireEvent.click(screen.getByRole('button', { name: /create pack/i }))
    fireEvent.click(screen.getByRole('button', { name: /manage current pack/i }))
    fireEvent.click(screen.getByRole('button', { name: /edit pack contents/i }))
    expect(screen.getByText(/editing pack/i)).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: /manage current pack/i }))
    fireEvent.click(screen.getByRole('button', { name: /rename current pack/i }))
    fireEvent.click(screen.getByRole('button', { name: /manage current pack/i }))
    fireEvent.click(screen.getByRole('button', { name: /delete current pack/i }))

    await waitFor(() => {
      expect(library.createPackPreset).toHaveBeenCalledWith('New Pack')
      expect(library.renamePackPreset).toHaveBeenCalledWith('story-pack', 'Renamed Pack')
      expect(library.deletePackPreset).toHaveBeenCalledWith('story-pack')
    })

    promptSpy.mockRestore()
    confirmSpy.mockRestore()
  })

  it('enters inline edit mode and saves the selected cards back into the current pack', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: /manage current pack/i }))
    fireEvent.click(screen.getByRole('button', { name: /edit pack contents/i }))
    expect(screen.getByText(/editing pack/i)).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Save Changes' })).not.toBeNull()

    fireEvent.click(screen.getByRole('article', { name: /vintage interface redux/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(library.replacePackMods).toHaveBeenCalledWith('story-pack', ['mod-1', 'mod-2'])
    })
  })

  it('opens mod details and keeps direct actions in the card context menu', async () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)
    chooseImageFileMock.mockResolvedValue('E:\\Covers\\npc-adventures.png')
    setLauncherLibraryCoverMock.mockResolvedValue({ covers: [] })

    renderLibraryPage()

    fireEvent.contextMenu(screen.getByRole('article', { name: /npc adventures/i }))

    expect(screen.getByRole('menuitem', { name: 'View Details' })).not.toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Open Folder' })).not.toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Disable' })).not.toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Set Cover' })).not.toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Clear Cover' })).not.toBeNull()

    fireEvent.click(screen.getByRole('menuitem', { name: 'View Details' }))
    const dialog = await screen.findByRole('dialog', { name: 'NPC Adventures' })
    expect(within(dialog).getByText('NPC Adventures')).not.toBeNull()

    fireEvent.contextMenu(screen.getByRole('article', { name: /npc adventures/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open Folder' }))
    fireEvent.contextMenu(screen.getByRole('article', { name: /npc adventures/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Disable' }))
    fireEvent.contextMenu(screen.getByRole('article', { name: /npc adventures/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Set Cover' }))

    await waitFor(() => {
      expect(openLauncherPathMock).toHaveBeenCalledWith({ path: 'E:\\Games\\Stardew Valley\\Mods\\NPC Adventures' })
      expect(library.toggleEnabled).toHaveBeenCalled()
      expect(setLauncherLibraryCoverMock).toHaveBeenCalledWith({
        labelKey: 'ModForge.NpcAdventures',
        imagePath: 'E:\\Covers\\npc-adventures.png',
      })
    })
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
    expect(library.installArchive).toHaveBeenCalledWith('E:\\Downloads\\preview.zip')
  })
})
