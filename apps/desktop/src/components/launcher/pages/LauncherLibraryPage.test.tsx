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
    addModsToPack: vi.fn(async () => {}),
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

    expect(screen.getByRole('button', { name: 'Pack Management' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Story Pack' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Refresh' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Open Storage Folder' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Install Archive' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Launch Game' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Apply Pack' })).toBeNull()
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
    expect(screen.getByRole('button', { name: 'Quick Sort' })).toHaveTextContent('Pack')
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
})
