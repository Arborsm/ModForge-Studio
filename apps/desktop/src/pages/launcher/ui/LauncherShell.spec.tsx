import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import LauncherShell from './LauncherShell'
import { renderWithLocale } from '@test/renderWithLocale.tsx'

const configurationPageSpy = vi.fn()
const libraryRefreshMock = vi.fn(async () => {})
let libraryPageInstanceCounter = 0
let discoverPageInstanceCounter = 0

vi.mock('./LauncherLibraryPage', () => ({
  LauncherLibraryPageContent: ({ launchGameLabel, routeEnterSequence }: { launchGameLabel: string; routeEnterSequence?: number }) => {
    const instanceId = useRef(++libraryPageInstanceCounter)
    return (
      <div data-loading-section="launcher-library-test" data-library-route-enter={routeEnterSequence ?? 0}>
        {`library-page:${launchGameLabel}:${instanceId.current}`}
      </div>
    )
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
    refresh: libraryRefreshMock,
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
    updatePackPreset: vi.fn(async () => {}),
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
  LauncherDiscoverPage: () => {
    const instanceId = useRef(++discoverPageInstanceCounter)
    return <div>{`discover-page:${instanceId.current}`}</div>
  },
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
  clearAll: vi.fn(),
  markArchivesInstalled: vi.fn(),
}

describe('LauncherShell', () => {
  afterEach(() => {
    cleanup()
    configurationPageSpy.mockReset()
    libraryRefreshMock.mockClear()
    libraryPageInstanceCounter = 0
    discoverPageInstanceCounter = 0
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

    expect(await screen.findByText(/^discover-page:/)).toBeTruthy()
    const activeRoute = container.querySelector('.launcher-shell-route.launcher-shell-route-active')
    expect(activeRoute).toBeTruthy()
    expect(activeRoute?.textContent).toContain('discover-page:')
    expect(activeRoute?.getAttribute('data-launcher-route')).toBe('discover')
    await waitFor(() => {
      expect(activeRoute?.getAttribute('data-launcher-route-enter')).toBeTruthy()
    })
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

    expect(await screen.findByText(/^discover-page:/)).toBeTruthy()
    expect(screen.getByText(/^library-page:Launch Game:/)).toBeTruthy()
  })

  it('replays the library route enter token without remounting cached content', async () => {
    function LauncherShellHarness() {
      const [page, setPage] = useState<'library' | 'discover'>('library')
      return (
        <>
          <button type="button" onClick={() => setPage('library')}>
            show library
          </button>
          <button type="button" onClick={() => setPage('discover')}>
            show discover
          </button>
          <LauncherShell
            page={page}
            debugEnabled={false}
            settingsState={settingsState as never}
            downloads={downloads as never}
            onToggleDebugMode={vi.fn()}
            onNavigateToSettings={vi.fn()}
            launchGameLabel="Launch Game"
            launchGameDisabled={false}
            launchGameBusy={false}
            onLaunchGame={vi.fn()}
          />
        </>
      )
    }

    renderWithLocale(<LauncherShellHarness />)

    const libraryPage = screen.getByText('library-page:Launch Game:1')
    await waitFor(() => {
      expect(libraryPage.getAttribute('data-library-route-enter')).toBeTruthy()
    })
    const firstEnterToken = libraryPage.getAttribute('data-library-route-enter')

    fireEvent.click(screen.getByRole('button', { name: 'show discover' }))
    expect(await screen.findByText(/^discover-page:/)).toBeTruthy()
    expect(screen.getByText('library-page:Launch Game:1')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'show library' }))

    await waitFor(() => {
      expect(screen.getByText('library-page:Launch Game:1').getAttribute('data-library-route-enter')).not.toBe(firstEnterToken)
    })
    expect(screen.getAllByText(/^library-page:/)).toHaveLength(1)
  })

  it('keeps the discover page mounted after it has been visited', async () => {
    function LauncherShellHarness() {
      const [page, setPage] = useState<'library' | 'discover'>('discover')
      return (
        <>
          <button type="button" onClick={() => setPage('library')}>
            show library
          </button>
          <button type="button" onClick={() => setPage('discover')}>
            show discover
          </button>
          <LauncherShell
            page={page}
            debugEnabled={false}
            settingsState={settingsState as never}
            downloads={downloads as never}
            onToggleDebugMode={vi.fn()}
            onNavigateToSettings={vi.fn()}
            launchGameLabel="Launch Game"
            launchGameDisabled={false}
            launchGameBusy={false}
            onLaunchGame={vi.fn()}
          />
        </>
      )
    }
    const { container } = renderWithLocale(<LauncherShellHarness />)

    const discoverPage = await screen.findByText(/^discover-page:/)
    const discoverPageText = discoverPage.textContent
    await waitFor(() => {
      expect(container.querySelector('[data-launcher-route="discover"]')?.getAttribute('data-launcher-route-enter')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'show library' }))

    expect(screen.getByText(discoverPageText ?? '')).toBeTruthy()
    expect(screen.getByText(/^library-page:Launch Game:/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'show discover' }))

    expect(await screen.findByText(discoverPageText ?? '')).toBeTruthy()
    expect(screen.getAllByText(/^discover-page:/)).toHaveLength(1)
    const discoverRoute = container.querySelector('[data-launcher-route="discover"]')
    expect(discoverRoute).toHaveClass('launcher-shell-route-active')
    await waitFor(() => {
      expect(discoverRoute?.getAttribute('data-launcher-route-enter')).toBeTruthy()
    })
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
