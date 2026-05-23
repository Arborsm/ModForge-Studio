import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LauncherShell from './LauncherShell'
import { renderWithLocale } from '@test/renderWithLocale.tsx'

const configurationPageSpy = vi.fn()
let libraryPageInstanceCounter = 0

vi.mock('./LauncherLibraryPage', () => ({
  LauncherLibraryPageContent: ({ launchGameLabel }: { launchGameLabel: string }) => {
    const instanceId = useRef(++libraryPageInstanceCounter)
    return <div data-loading-section="launcher-library-test">{`library-page:${launchGameLabel}:${instanceId.current}`}</div>
  },
}))

vi.mock('@features/launcher/model/useLauncherLibrary', () => ({
  useLauncherLibrary: vi.fn(() => ({
    mods: [],
    storageFolders: [],
    activeStorageFolder: null,
    activeStorageFolderId: null,
    hiddenModKeys: [],
    packPresets: [],
    scopeMode: 'all',
    currentPackId: null,
    currentPack: null,
    filteredMods: [],
    selectedMod: null,
    selectedModId: null,
    selectedModIds: [],
    selection: [],
    state: 'ready',
    error: null,
    filterText: '',
    enabledOnly: false,
    refresh: vi.fn(async () => {}),
    setSelectedModId: vi.fn(),
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
    hideMods: vi.fn(async () => {}),
    showMods: vi.fn(async () => {}),
    createPackPreset: vi.fn(async () => {}),
    renamePackPreset: vi.fn(async () => {}),
    deletePackPreset: vi.fn(async () => {}),
    setCurrentPackId: vi.fn(async () => {}),
    replacePackMods: vi.fn(async () => {}),
    setScopeMode: vi.fn(async () => {}),
    applyCurrentPack: vi.fn(async () => {}),
    setSelectionEnabled: vi.fn(async () => {}),
    setFilterText: vi.fn(),
    setEnabledOnly: vi.fn(),
    selectNextSearchMatch: vi.fn(),
    selectPreviousSearchMatch: vi.fn(),
    setActiveStorageFolderId: vi.fn(),
  })),
}))

vi.mock('./LauncherDiscoverPage', () => ({
  LauncherDiscoverPage: () => <div>discover-page</div>,
}))

vi.mock('./LauncherUpdatesPage', () => ({
  LauncherUpdatesPage: () => <div>updates-page</div>,
}))

vi.mock('./LauncherConfigurationPage', () => ({
  LauncherConfigurationPage: (props: {
    debugEnabled: boolean
    onToggleDebugMode: () => void
    downloads: unknown
    settingsState: unknown
  }) => {
    configurationPageSpy(props)
    return <div>configuration-page</div>
  },
}))

const settingsState = {
  settings: {
    gamePath: null,
    modsPath: null,
    downloadPath: null,
    nexusApiKey: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
    autoCheckModUpdates: true,
  },
  state: 'ready' as const,
  error: null,
  saveMessage: null,
  setSettings: vi.fn(),
  updateField: vi.fn(),
  save: vi.fn(async () => null),
  refresh: vi.fn(async () => {}),
  pickDirectory: vi.fn(async () => null),
}

const downloads = {
  items: [],
  queuedItems: [],
  activeItems: [],
  readyToInstall: [],
  installedItems: [],
  failedItems: [],
  removableItems: [],
  counts: {
    queued: 0,
    downloading: 0,
    completed: 0,
    failed: 0,
    readyToInstall: 0,
  },
  downloadProgressPercent: null,
  queueDownload: vi.fn(),
  startDebugSimulation: vi.fn(),
  retryItem: vi.fn(),
  retryFailed: vi.fn(),
  removeItem: vi.fn(),
  removeCompleted: vi.fn(),
  installItem: vi.fn(),
  installAllReady: vi.fn(),
  clearAll: vi.fn(),
}

describe('LauncherShell', () => {
  afterEach(() => {
    cleanup()
    configurationPageSpy.mockReset()
    libraryPageInstanceCounter = 0
  })

  it('routes the library page without rendering an in-page launcher navigation rail', () => {
    const { container } = renderWithLocale(
      <LauncherShell
        page="library"
        debugEnabled={false}
        settingsState={settingsState as never}
        downloads={downloads as never}
        onToggleDebugMode={vi.fn()}
        onNavigateToSettings={vi.fn()}
        launchGameLabel="Launch Game"
        launchGameDisabled={false}
        launchGameBusy={false}
        onLaunchGame={vi.fn()}
      />,
    )

    expect(screen.getByText('library-page:Launch Game:1')).toBeTruthy()
    expect(container.querySelector('.launcher-shell-page-nav')).toBeNull()
  })

  it('routes the discover page', async () => {
    const { container } = renderWithLocale(
      <LauncherShell
        page="discover"
        debugEnabled={false}
        settingsState={settingsState as never}
        downloads={downloads as never}
        onToggleDebugMode={vi.fn()}
        onNavigateToSettings={vi.fn()}
        launchGameLabel="Launch Game"
        launchGameDisabled={false}
        launchGameBusy={false}
        onLaunchGame={vi.fn()}
      />,
    )

    expect(await screen.findByText('discover-page')).toBeTruthy()
    const activeRoute = container.querySelector('.launcher-shell-route.launcher-shell-route-active')
    expect(activeRoute).toBeTruthy()
    expect(activeRoute?.textContent).toContain('discover-page')
  })

  it('keeps the library page content rendered when switching away from it', async () => {
    const { rerender } = renderWithLocale(
      <LauncherShell
        page="library"
        debugEnabled={false}
        settingsState={settingsState as never}
        downloads={downloads as never}
        onToggleDebugMode={vi.fn()}
        onNavigateToSettings={vi.fn()}
        launchGameLabel="Launch Game"
        launchGameDisabled={false}
        launchGameBusy={false}
        onLaunchGame={vi.fn()}
      />,
    )

    expect(screen.getByText(/^library-page:Launch Game:/)).toBeTruthy()

    rerender(
      <LauncherShell
        page="discover"
        debugEnabled={false}
        settingsState={settingsState as never}
        downloads={downloads as never}
        onToggleDebugMode={vi.fn()}
        onNavigateToSettings={vi.fn()}
        launchGameLabel="Launch Game"
        launchGameDisabled={false}
        launchGameBusy={false}
        onLaunchGame={vi.fn()}
      />,
    )

    expect(await screen.findByText('discover-page')).toBeTruthy()
    expect(screen.getByText(/^library-page:Launch Game:/)).toBeTruthy()
  })

  it('routes the updates page', async () => {
    renderWithLocale(
      <LauncherShell
        page="updates"
        debugEnabled={false}
        settingsState={settingsState as never}
        downloads={downloads as never}
        onToggleDebugMode={vi.fn()}
        onNavigateToSettings={vi.fn()}
        launchGameLabel="Launch Game"
        launchGameDisabled={false}
        launchGameBusy={false}
        onLaunchGame={vi.fn()}
      />,
    )

    expect(await screen.findByText('updates-page')).toBeTruthy()
  })

  it('routes the configuration page', async () => {
    const onToggleDebugMode = vi.fn()

    renderWithLocale(
      <LauncherShell
        page="configuration"
        debugEnabled={true}
        settingsState={settingsState as never}
        downloads={downloads as never}
        onToggleDebugMode={onToggleDebugMode}
        onNavigateToSettings={vi.fn()}
        launchGameLabel="Launch Game"
        launchGameDisabled={false}
        launchGameBusy={false}
        onLaunchGame={vi.fn()}
      />,
    )

    expect(await screen.findByText('configuration-page')).toBeTruthy()
    await waitFor(() => {
      expect(configurationPageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          debugEnabled: true,
          downloads,
          onToggleDebugMode,
          settingsState,
        }),
      )
    })
  })

  it('routes the configuration page even when debug mode is disabled', async () => {
    renderWithLocale(
      <LauncherShell
        page="configuration"
        debugEnabled={false}
        settingsState={settingsState as never}
        downloads={downloads as never}
        onToggleDebugMode={vi.fn()}
        onNavigateToSettings={vi.fn()}
        launchGameLabel="Launch Game"
        launchGameDisabled={false}
        launchGameBusy={false}
        onLaunchGame={vi.fn()}
      />,
    )

    expect(await screen.findByText('configuration-page')).toBeTruthy()
    expect(screen.queryByText('library-page:Launch Game:1')).toBeTruthy()
  })

  it('does not render a downloads page entry inside the shell', () => {
    renderWithLocale(
      <LauncherShell
        page="library"
        debugEnabled={false}
        settingsState={settingsState as never}
        downloads={downloads as never}
        onToggleDebugMode={vi.fn()}
        onNavigateToSettings={vi.fn()}
        launchGameLabel="Launch Game"
        launchGameDisabled={false}
        launchGameBusy={false}
        onLaunchGame={vi.fn()}
      />,
    )

    expect(within(document.body).queryByText('downloads-page')).toBeNull()
  })
})
