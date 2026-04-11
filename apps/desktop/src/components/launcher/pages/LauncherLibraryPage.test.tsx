import type { ReactElement, ReactNode } from 'react'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../../../lib/app/localeContext'
import { dismissNotification, publishNotification } from '../../../lib/app/notifications'
import type { InspectLauncherArchiveResult, LauncherLibraryModSummary, LauncherSettings } from '../../../lib/desktop'
import {
  chooseArchiveFile,
  chooseImageFile,
  inspectLauncherArchive,
  loadLauncherRemoteModDetail,
  openLauncherUrl,
  openLauncherPath,
  resolveLauncherImage,
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
    loadLauncherRemoteModDetail: vi.fn(),
    openLauncherUrl: vi.fn(),
    openLauncherPath: vi.fn(),
    resolveLauncherImage: vi.fn(),
    setLauncherLibraryCover: vi.fn(),
  }
})

vi.mock('../../../lib/launcher/useLauncherLibrary', () => ({
  useLauncherLibrary: vi.fn(),
}))

vi.mock('../../../lib/app/notifications', () => ({
  publishNotification: vi.fn(),
  dismissNotification: vi.fn(),
}))

type MockLibraryState = ReturnType<typeof useLauncherLibrary>

const chooseArchiveFileMock = vi.mocked(chooseArchiveFile)
const chooseImageFileMock = vi.mocked(chooseImageFile)
const inspectLauncherArchiveMock = vi.mocked(inspectLauncherArchive)
const loadLauncherRemoteModDetailMock = vi.mocked(loadLauncherRemoteModDetail)
const openLauncherUrlMock = vi.mocked(openLauncherUrl)
const openLauncherPathMock = vi.mocked(openLauncherPath)
const resolveLauncherImageMock = vi.mocked(resolveLauncherImage)
const setLauncherLibraryCoverMock = vi.mocked(setLauncherLibraryCover)
const useLauncherLibraryMock = vi.mocked(useLauncherLibrary)
const dismissNotificationMock = vi.mocked(dismissNotification)
const publishNotificationMock = vi.mocked(publishNotification)

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

  it('refreshes the library when the toolbar refresh button is clicked', () => {
    const library = createLibraryState()
    useLauncherLibraryMock.mockReturnValue(library)

    renderLibraryPage()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(library.refresh).toHaveBeenCalledWith()
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
      <LocaleProvider locale="en-US">
        <LauncherLibraryPage
          settings={createSettings()}
          launchGameLabel="Launch Game"
          launchGameDisabled={false}
          launchGameBusy={false}
          onLaunchGame={vi.fn()}
        />
      </LocaleProvider>,
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
