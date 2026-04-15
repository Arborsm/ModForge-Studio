import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { LauncherNexusDiagnosticsResult } from './lib/desktop'
import { editorCopy, getSettingsMenuCopy, getViewMenuCopy } from './lib/editor-shell'
import { clearNotifications, publishNotification } from './lib/app/notifications'

const mapWorkspaceState = {
  workspaceStatus: { tone: 'ready', message: '' },
  resourcePreloadState: { active: false, message: '', currentLabel: null as string | null, completed: 0, total: 0 },
}

type MockAppUiState = {
  version: number
  shell: {
    appMode: string
    launcherPage: string
    debugEnabled: boolean
    notificationSoundEnabled: boolean
  }
  appearance: {
    locale: string
    accentPresetId: string
    recentGameDirectories: string[]
    playerAppearance: {
      profiles: unknown[]
      activeProfileId: string | null
    }
  }
  workspace: {
    layouts: Record<string, Record<string, unknown>>
  }
  launcher: {
    discoverToolbar: {
      sort: string
      ascending: boolean
      timeRange: string
      pageSize: number
      filtersHidden: boolean
    }
    forceOffline: boolean
  }
}

type MockAppUiStateOverrides = {
  version?: number
  shell?: Partial<MockAppUiState['shell']>
  appearance?: Partial<Omit<MockAppUiState['appearance'], 'playerAppearance'>> & {
    playerAppearance?: Partial<MockAppUiState['appearance']['playerAppearance']>
  }
  workspace?: {
    layouts?: MockAppUiState['workspace']['layouts']
  }
  launcher?: {
    discoverToolbar?: Partial<MockAppUiState['launcher']['discoverToolbar']>
    forceOffline?: boolean
  }
}

type MockAppUiStatePatch = {
  shell?: MockAppUiState['shell']
  appearance?: Partial<MockAppUiState['appearance']> & {
    playerAppearance?: MockAppUiState['appearance']['playerAppearance']
  }
  workspace?: {
    layouts?: Record<string, Record<string, unknown> | null>
  }
  launcher?: {
    discoverToolbar?: MockAppUiState['launcher']['discoverToolbar']
    forceOffline?: boolean
  }
}

function createMockAppUiState(
  overrides: MockAppUiStateOverrides = {},
): MockAppUiState {
  return {
    version: overrides.version ?? 1,
    shell: {
      appMode: overrides.shell?.appMode ?? 'launcher',
      launcherPage: overrides.shell?.launcherPage ?? 'library',
      debugEnabled: overrides.shell?.debugEnabled ?? false,
      notificationSoundEnabled: overrides.shell?.notificationSoundEnabled ?? true,
    },
    appearance: {
      locale: overrides.appearance?.locale ?? 'en-US',
      accentPresetId: overrides.appearance?.accentPresetId ?? 'indigo',
      recentGameDirectories: overrides.appearance?.recentGameDirectories ?? [],
      playerAppearance: {
        profiles: overrides.appearance?.playerAppearance?.profiles ?? [],
        activeProfileId: overrides.appearance?.playerAppearance?.activeProfileId ?? null,
      },
    },
    workspace: {
      layouts: overrides.workspace?.layouts ?? {},
    },
    launcher: {
      discoverToolbar: {
        sort: overrides.launcher?.discoverToolbar?.sort ?? 'newest',
        ascending: overrides.launcher?.discoverToolbar?.ascending ?? false,
        timeRange: overrides.launcher?.discoverToolbar?.timeRange ?? 'all',
        pageSize: overrides.launcher?.discoverToolbar?.pageSize ?? 20,
        filtersHidden: overrides.launcher?.discoverToolbar?.filtersHidden ?? false,
      },
      forceOffline: overrides.launcher?.forceOffline ?? false,
    },
  }
}

function applyMockAppUiStatePatch(patch: MockAppUiStatePatch) {
  const nextLayouts = { ...mockAppUiState.workspace.layouts }

  for (const [storageKey, layout] of Object.entries(patch.workspace?.layouts ?? {})) {
    if (layout === null) {
      delete nextLayouts[storageKey]
      continue
    }

    nextLayouts[storageKey] = layout
  }

  mockAppUiState = {
    ...mockAppUiState,
    ...(patch.shell ? { shell: patch.shell } : null),
    ...(patch.appearance
      ? {
          appearance: {
            ...mockAppUiState.appearance,
            ...patch.appearance,
            playerAppearance: patch.appearance.playerAppearance ?? mockAppUiState.appearance.playerAppearance,
          },
        }
      : null),
    ...(patch.workspace
      ? {
          workspace: {
            ...mockAppUiState.workspace,
            ...(patch.workspace.layouts ? { layouts: nextLayouts } : null),
          },
        }
      : null),
    ...(patch.launcher
      ? {
          launcher: {
            ...mockAppUiState.launcher,
            discoverToolbar: patch.launcher.discoverToolbar ?? mockAppUiState.launcher.discoverToolbar,
            forceOffline: patch.launcher.forceOffline ?? mockAppUiState.launcher.forceOffline,
          },
        }
      : null),
  }

  return mockAppUiState
}

let mockAppUiState = createMockAppUiState()
const initializeAppUiStateMock = vi.fn(async () => mockAppUiState)
const applyAppUiStatePatchMock = vi.fn(async (patch: MockAppUiStatePatch) => applyMockAppUiStatePatch(patch))
const getAppUiStateSnapshotMock = vi.fn(() => mockAppUiState)
const clearLegacyBrowserUiStateMock = vi.fn()
const workspaceLayoutMock = vi.fn((props: Record<string, unknown>) => props)
const canUseDesktopHostMock = vi.fn(() => false)
function createLauncherNexusDiagnosticsResult(
  routes: LauncherNexusDiagnosticsResult['routes'] = [],
): LauncherNexusDiagnosticsResult {
  return { routes }
}

const loadLauncherNexusDiagnosticsMock = vi.fn<() => Promise<LauncherNexusDiagnosticsResult>>(
  async () => createLauncherNexusDiagnosticsResult(),
)
const setLauncherNexusForceOfflineMock = vi.fn<(forceOffline: boolean) => Promise<LauncherNexusDiagnosticsResult>>(
  async () => createLauncherNexusDiagnosticsResult(),
)
const restartLauncherNexusDiagnosticsMock = vi.fn<() => Promise<LauncherNexusDiagnosticsResult>>(
  async () => createLauncherNexusDiagnosticsResult(),
)

function seedAppUiState(overrides: MockAppUiStateOverrides = {}) {
  mockAppUiState = createMockAppUiState(overrides)
}

function createMockWorkspaceLayoutState() {
  return {
    chrome: {
      bottomHeight: 220,
      bottomSplit: 0.5,
      leftSplit: 0.44,
      leftWidth: 0.22,
      rightSplit: 0.34,
      rightWidth: 0.24,
    },
    panels: {
      viewport: {
        dock: 'center',
        height: 420,
        lastMode: 'docked',
        mode: 'docked',
        width: 640,
        x: 56,
        y: 48,
        zIndex: 1,
      },
    },
    presets: {},
    slots: {
      'bottom-left': {
        activePanelId: null,
        expanded: false,
        panelOrder: [],
      },
      'bottom-right': {
        activePanelId: null,
        expanded: false,
        panelOrder: [],
      },
      'left-bottom': {
        activePanelId: null,
        expanded: false,
        panelOrder: [],
      },
      'left-top': {
        activePanelId: null,
        expanded: false,
        panelOrder: [],
      },
      'right-bottom': {
        activePanelId: null,
        expanded: false,
        panelOrder: [],
      },
      'right-top': {
        activePanelId: null,
        expanded: false,
        panelOrder: [],
      },
    },
  }
}

vi.mock('./components/DevDebugOverlay', () => ({
  DevDebugOverlay: () => <div data-testid="dev-debug-overlay" />,
}))

vi.mock('./components/InitializationOverlay', () => ({
  default: () => null,
}))

vi.mock('./components/StatusBar', () => ({
  default: () => null,
}))

vi.mock('./components/WorkspaceLayout', () => ({
  WorkspaceLayout: (props: Record<string, unknown>) => {
    workspaceLayoutMock(props)
    return <div data-testid="workspace-layout" data-storage-key={String(props.storageKey ?? '')} />
  },
}))

vi.mock('./lib/launcher/useLauncherRuntime', () => ({
  useLauncherRuntime: () => ({
    settingsState: {
      settings: {
        gamePath: 'C:/Games/Stardew Valley',
        modsPath: 'C:/Games/Stardew Valley/Mods',
        downloadPath: 'C:/Downloads',
        nexusApiKey: null,
        nexusCookie: null,
        autoInstallDownloads: false,
        keepDownloadedArchives: false,
        autoCheckModUpdates: true,
      },
      state: 'ready',
      error: null,
      saveMessage: null,
      setSettings: vi.fn(),
      updateField: vi.fn(),
      save: vi.fn(async () => null),
      refresh: vi.fn(async () => {}),
      pickDirectory: vi.fn(async () => null),
    },
    downloads: {
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
    },
    credentialsReady: false,
    settingsWarning: true,
    settingsWarningLabel: 'Launcher setup incomplete',
    updatesBadgeCount: 0,
    downloadsBadgeCount: 0,
    downloadsProgressPercent: null,
    downloadsHasFailure: false,
  }),
}))

vi.mock('./lib/desktop', () => ({
  canUseDesktopHost: () => canUseDesktopHostMock(),
  checkLauncherUpdates: vi.fn(async () => ({ modsPath: 'C:/Games/Stardew Valley/Mods', checkedAtMs: 0, updates: [] })),
  clearLauncherLibraryReadCaches: vi.fn(),
  clearDesktopLocaleCache: vi.fn(),
  closeCurrentWindow: vi.fn(),
  isCurrentWindowFullscreen: vi.fn(async () => false),
  loadCachedLauncherUpdates: vi.fn(async () => null),
  loadLauncherNexusDiagnostics: () => loadLauncherNexusDiagnosticsMock(),
  restartLauncherNexusDiagnostics: () => restartLauncherNexusDiagnosticsMock(),
  setLauncherNexusForceOffline: (forceOffline: boolean) => setLauncherNexusForceOfflineMock(forceOffline),
  listenToLauncherUpdateProgress: vi.fn(async () => () => {}),
  listKnownGameDirectories: vi.fn(async () => []),
  launchLauncherGame: vi.fn(async () => ({ target: 'game', executablePath: 'C:/Games/Stardew Valley/Stardew Valley.exe' })),
  minimizeCurrentWindow: vi.fn(),
  subscribeLauncherUpdates: vi.fn(() => () => {}),
  toggleFullscreenCurrentWindow: vi.fn(async () => false),
  toggleMaximizeCurrentWindow: vi.fn(),
}))

vi.mock('./lib/react/defer', () => ({
  scheduleDeferred: (callback: () => void) => {
    callback()
    return () => {}
  },
}))

vi.mock('./lib/app/workspacePanels', () => ({
  buildWorkspacePanels: () => [],
}))

vi.mock('./lib/app/useMapWorkspace', () => ({
  useMapWorkspace: () => ({
    workspaceStatus: mapWorkspaceState.workspaceStatus,
    resourcePreloadState: mapWorkspaceState.resourcePreloadState,
    gameDirectory: '',
    setGameDirectory: vi.fn(),
    directoryInfo: { rootPath: 'C:/StardewValley' },
    mapAssets: [],
    activeAsset: null,
    mapDocument: null,
    worldAtlasDocument: null,
    hoverInfo: null,
    setHoverInfo: vi.fn(),
    showGameWorldAdditions: false,
    setShowGameWorldAdditions: vi.fn(),
  }),
}))

vi.mock('./lib/app/useEventWorkspace', () => ({
  useEventWorkspace: () => ({
    eventAssets: [],
    eventStatusMessage: '',
    selectedEvent: null,
  }),
}))

vi.mock('./lib/app/useCharacterWorkspace', () => ({
  useCharacterWorkspace: () => ({
    characters: [],
    characterStatusMessage: '',
  }),
}))

vi.mock('./lib/app/useBuildingWorkspace', () => ({
  useBuildingWorkspace: () => ({
    constructibleGroups: [],
    worldBuildings: [],
    buildingStatusMessage: '',
  }),
}))

vi.mock('./lib/app/useItemWorkspace', () => ({
  useItemWorkspace: () => ({
    items: [],
    itemStatusMessage: '',
  }),
}))

vi.mock('./lib/app/useModWorkspace', () => ({
  default: () => ({
    modDiagnostics: [],
    modHasUnsavedChanges: false,
    modProjects: [],
    modStatusMessage: '',
    compatibleOnly: true,
    setCompatibleOnly: vi.fn(),
  }),
}))

vi.mock('./lib/app/uiState', () => ({
  initializeAppUiState: () => initializeAppUiStateMock(),
  applyAppUiStatePatch: (patch: MockAppUiStatePatch) => applyAppUiStatePatchMock(patch),
  getAppUiStateSnapshot: () => getAppUiStateSnapshotMock(),
  clearLegacyBrowserUiState: () => clearLegacyBrowserUiStateMock(),
}))

describe('App locale ownership', () => {
  beforeEach(() => {
    seedAppUiState()
    mapWorkspaceState.workspaceStatus = { tone: 'ready', message: '' }
    mapWorkspaceState.resourcePreloadState = { active: false, message: '', currentLabel: null, completed: 0, total: 0 }
    canUseDesktopHostMock.mockReset()
    canUseDesktopHostMock.mockReturnValue(false)
    loadLauncherNexusDiagnosticsMock.mockReset()
    loadLauncherNexusDiagnosticsMock.mockResolvedValue({ routes: [] })
    setLauncherNexusForceOfflineMock.mockReset()
    setLauncherNexusForceOfflineMock.mockResolvedValue({ routes: [] })
    restartLauncherNexusDiagnosticsMock.mockReset()
    restartLauncherNexusDiagnosticsMock.mockResolvedValue({ routes: [] })
    initializeAppUiStateMock.mockClear()
    initializeAppUiStateMock.mockImplementation(async () => mockAppUiState)
    applyAppUiStatePatchMock.mockClear()
    applyAppUiStatePatchMock.mockImplementation(async (patch: MockAppUiStatePatch) => applyMockAppUiStatePatch(patch))
    getAppUiStateSnapshotMock.mockClear()
    getAppUiStateSnapshotMock.mockImplementation(() => mockAppUiState)
    clearLegacyBrowserUiStateMock.mockClear()
    workspaceLayoutMock.mockClear()
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: !query.includes('light'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    cleanup()
    clearNotifications()
    vi.unstubAllGlobals()
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'en-US',
    })
  })

  it('updates downstream shell copy immediately when locale changes through Settings', async () => {
    seedAppUiState({
      appearance: { locale: 'en-US' },
      shell: { appMode: 'workbench' },
    })
    const englishSettingsCopy = getSettingsMenuCopy('en-US')

    render(<App />)

    expect(screen.getByRole('button', { name: editorCopy['en-US'].nav.map })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: englishSettingsCopy.title }))

    const localeGroup = await screen.findByRole('radiogroup', { name: englishSettingsCopy.languageLabel })
    const chineseOption = screen.getByRole('radio', { name: englishSettingsCopy.localeLabels['zh-CN'] })

    expect(localeGroup).toBeTruthy()

    fireEvent.click(chineseOption)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: editorCopy['zh-CN'].nav.map })).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: editorCopy['en-US'].nav.map })).toBeNull()
    expect(mockAppUiState.appearance.locale).toBe('zh-CN')
  })

  it('initializes App locale from a valid stored locale value', async () => {
    seedAppUiState({
      appearance: { locale: 'zh-CN' },
      shell: { appMode: 'workbench' },
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: getSettingsMenuCopy('zh-CN').title })).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: editorCopy['zh-CN'].nav.map })).toBeTruthy()
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('falls back from an invalid stored locale to navigator language heuristics', async () => {
    seedAppUiState({
      appearance: { locale: 'es-ES' },
      shell: { appMode: 'workbench' },
    })
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'zh-CN',
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: editorCopy['zh-CN'].nav.map })).toBeTruthy()
    })
    await waitFor(() => {
      expect(mockAppUiState.appearance.locale).toBe('zh-CN')
    })
  })

  it('shows preload progress inside a bottom-right notification instead of the overlay', async () => {
    mapWorkspaceState.resourcePreloadState = {
      active: true,
      message: 'Loading maps',
      currentLabel: 'Maps/Town.tmx',
      completed: 4,
      total: 10,
    }

    const { container } = render(<App />)

    expect(container.querySelector('.initialization-preload-backdrop')).toBeNull()
    expect(container.querySelector('.initialization-preload-panel')).toBeNull()

    expect(await screen.findByText('Loading maps')).toBeTruthy()
    expect(screen.getByText('Maps/Town.tmx')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Notifications' })).toBeTruthy()
    expect(container.querySelector('.notification-toast-progress')?.getAttribute('style')).toContain('width: 40%')
  })

  it('opens the launcher library when launcher mode is restored from persisted shell state', () => {
    seedAppUiState({
      shell: {
        appMode: 'launcher',
        launcherPage: 'updates',
      },
    })

    render(<App />)

    expect(screen.queryByTestId('workspace-layout')).toBeNull()
    expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.pages.library }).getAttribute('aria-current')).toBe('page')
    expect(
      screen.queryByRole('button', { name: editorCopy['en-US'].launcher.downloads.title })?.getAttribute('aria-current'),
    ).not.toBe('page')
  })

  it('switches app mode to workbench through shell controls and persists it', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: editorCopy['en-US'].shell.workbench }))

    expect(screen.getByTestId('workspace-layout')).toBeTruthy()
    await waitFor(() => {
      expect(mockAppUiState.shell.appMode).toBe('workbench')
    })
  })

  it('renders the launcher downloads button in shell controls and the launch game action on the library page', () => {
    seedAppUiState({
      shell: { appMode: 'launcher' },
    })

    render(<App />)

    expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.downloads.title })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Launch Game' })).toBeTruthy()
  })

  it('persists the active launcher page only when switching back to workbench', async () => {
    seedAppUiState({
      shell: {
        appMode: 'launcher',
        launcherPage: 'library',
      },
    })

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: editorCopy['en-US'].launcher.pages.updates }))
    expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.pages.updates }).getAttribute('aria-current')).toBe('page')
    expect(mockAppUiState.shell.launcherPage).toBe('library')

    fireEvent.click(screen.getByRole('button', { name: editorCopy['en-US'].shell.workbench }))

    await waitFor(() => {
      expect(mockAppUiState.shell.launcherPage).toBe('updates')
      expect(mockAppUiState.shell.appMode).toBe('workbench')
    })
  })

  it('renders launcher settings inside the global settings window', async () => {
    const englishSettingsCopy = getSettingsMenuCopy('en-US')

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(englishSettingsCopy.title) }))
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${englishSettingsCopy.categories.launcher}`) }))

    expect(screen.getByText(editorCopy['en-US'].launcher.fields.gamePath)).toBeTruthy()
    expect(screen.queryByRole('button', { name: editorCopy['en-US'].launcher.actions.saveSettings })).toBeNull()
  })

  it('renders global notifications in both workbench and launcher app modes', () => {
    seedAppUiState({
      shell: { appMode: 'workbench' },
    })
    const { unmount } = render(<App />)

    act(() => {
      publishNotification({
        level: 'success',
        title: 'Workbench notification',
      })
    })

    expect(screen.getByText('Workbench notification')).toBeTruthy()

    unmount()
    clearNotifications()
    seedAppUiState({
      shell: { appMode: 'launcher' },
    })

    render(<App />)

    act(() => {
      publishNotification({
        level: 'warning',
        title: 'Launcher notification',
      })
    })

    expect(screen.getByText('Launcher notification')).toBeTruthy()
  })

  it('publishes a startup warning notification when launcher diagnostics settle with failed routes', async () => {
    seedAppUiState({
      shell: { appMode: 'launcher' },
    })
    canUseDesktopHostMock.mockReturnValue(true)
    loadLauncherNexusDiagnosticsMock.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api-router.nexusmods.com/graphql',
          status: 'warning',
          attempts: 3,
          maxAttempts: 3,
          available: false,
          message: 'Failed after 3 attempts: timeout',
        },
      ],
    })

    render(<App />)

    expect(await screen.findByText(editorCopy['en-US'].launcher.debug.nexusDiagnosticsNotificationTitle)).toBeTruthy()
    expect(
      screen.getByText(
        editorCopy['en-US'].launcher.debug.nexusDiagnosticsNotificationImpact('Discover / automatic updates'),
      ),
    ).toBeTruthy()
    expect(screen.getByText(editorCopy['en-US'].launcher.debug.nexusDiagnosticsNotificationBody(1))).toBeTruthy()
    expect(screen.getByText(editorCopy['en-US'].launcher.debug.nexusDiagnosticsNotificationNote)).toBeTruthy()
    expect(screen.queryByText(/Failed after 3 attempts: timeout/)).toBeNull()
    expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.actions.retry })).toBeTruthy()
    expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.actions.viewDetails })).toBeTruthy()
  })

  it('does not expose a diagnostics retry action while launcher Nexus routes are forced offline', async () => {
    seedAppUiState({
      shell: { appMode: 'launcher' },
      launcher: { forceOffline: true },
    })
    canUseDesktopHostMock.mockReturnValue(true)
    loadLauncherNexusDiagnosticsMock.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api-router.nexusmods.com/graphql',
          status: 'warning',
          attempts: 3,
          maxAttempts: 3,
          available: false,
          message: 'Failed after 3 attempts: timeout',
        },
      ],
    })

    render(<App />)

    expect(await screen.findByText(editorCopy['en-US'].launcher.debug.nexusDiagnosticsNotificationTitle)).toBeTruthy()
    expect(screen.queryByRole('button', { name: editorCopy['en-US'].launcher.actions.retry })).toBeNull()
    expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.actions.viewDetails })).toBeTruthy()
  })

  it('opens the launcher debug page from the diagnostics notification detail button', async () => {
    seedAppUiState({
      shell: { appMode: 'launcher' },
    })
    canUseDesktopHostMock.mockReturnValue(true)
    loadLauncherNexusDiagnosticsMock.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api-router.nexusmods.com/graphql',
          status: 'warning',
          attempts: 3,
          maxAttempts: 3,
          available: false,
          message: 'Failed after 3 attempts: timeout',
        },
      ],
    })

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: editorCopy['en-US'].launcher.actions.viewDetails }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: editorCopy['en-US'].launcher.debug.title })).toBeTruthy()
    })
  })

  it('restarts Nexus diagnostics from the diagnostics notification retry button', async () => {
    seedAppUiState({
      shell: { appMode: 'launcher' },
    })
    canUseDesktopHostMock.mockReturnValue(true)
    loadLauncherNexusDiagnosticsMock.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api-router.nexusmods.com/graphql',
          status: 'warning',
          attempts: 3,
          maxAttempts: 3,
          available: false,
          message: 'Failed after 3 attempts: timeout',
        },
      ],
    })
    restartLauncherNexusDiagnosticsMock.mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api-router.nexusmods.com/graphql',
          status: 'loading',
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Attempt 1 of 3 is in progress.',
        },
      ],
    })

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: editorCopy['en-US'].launcher.actions.retry }))

    await waitFor(() => {
      expect(restartLauncherNexusDiagnosticsMock).toHaveBeenCalledTimes(1)
    })
  })

  it('applies the persisted launcher force-offline override during startup hydration', async () => {
    seedAppUiState({
      shell: { appMode: 'launcher' },
      launcher: { forceOffline: true },
    })
    canUseDesktopHostMock.mockReturnValue(true)

    render(<App />)

    await waitFor(() => {
      expect(setLauncherNexusForceOfflineMock).toHaveBeenCalledWith(true)
    })
  })

  it('shows the debug overlay when debug mode is enabled from persisted shell state', () => {
    seedAppUiState({
      shell: {
        appMode: 'workbench',
        debugEnabled: true,
      },
    })

    render(<App />)

    expect(screen.getByTestId('dev-debug-overlay')).toBeTruthy()
  })

  it('shows the debug overlay in launcher mode when debug mode is enabled', () => {
    seedAppUiState({
      shell: {
        appMode: 'launcher',
        debugEnabled: true,
      },
    })

    render(<App />)

    expect(screen.getByTestId('dev-debug-overlay')).toBeTruthy()
  })

  it('toggles debug mode from Settings and persists the flag', async () => {
    seedAppUiState({
      shell: { appMode: 'workbench' },
    })
    const englishSettingsCopy = getSettingsMenuCopy('en-US')

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(englishSettingsCopy.title) }))
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${englishSettingsCopy.categories.debug}`) }))
    fireEvent.click(screen.getByRole('switch', { name: englishSettingsCopy.debugModeLabel }))

    await waitFor(() => {
      expect(mockAppUiState.shell.debugEnabled).toBe(true)
      expect(screen.getByTestId('dev-debug-overlay')).toBeTruthy()
    })
  })

  it('toggles notification sounds from Settings and persists the flag', async () => {
    seedAppUiState({
      shell: { appMode: 'workbench' },
    })
    const englishSettingsCopy = getSettingsMenuCopy('en-US')

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(englishSettingsCopy.title) }))
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${englishSettingsCopy.categories.interaction}`) }))
    fireEvent.click(screen.getByRole('switch', { name: englishSettingsCopy.notificationSoundLabel }))

    await waitFor(() => {
      expect(mockAppUiState.shell.notificationSoundEnabled).toBe(false)
    })
  })

  it('falls back to the launcher library when the persisted debug page is disabled', () => {
    seedAppUiState({
      shell: {
        appMode: 'launcher',
        launcherPage: 'debug',
        debugEnabled: false,
      },
    })

    render(<App />)

    expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.pages.library }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(screen.queryByRole('button', { name: editorCopy['en-US'].launcher.pages.debug })).toBeNull()
    expect(screen.getByRole('button', { name: 'Launch Game' })).toBeTruthy()
  })

  it('returns from the launcher debug page when debug mode is turned off', async () => {
    seedAppUiState({
      shell: {
        appMode: 'launcher',
        launcherPage: 'debug',
        debugEnabled: true,
      },
    })
    const englishSettingsCopy = getSettingsMenuCopy('en-US')

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: editorCopy['en-US'].launcher.pages.debug }))
    expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.pages.debug }).getAttribute('aria-current')).toBe(
      'page',
    )

    fireEvent.click(screen.getByRole('button', { name: new RegExp(englishSettingsCopy.title) }))
    const sidebar = document.querySelector('.settings-window-sidebar')
    expect(sidebar).toBeTruthy()
    fireEvent.click(within(sidebar as HTMLElement).getByRole('button', { name: /^Debug/ }))
    fireEvent.click(screen.getByRole('switch', { name: englishSettingsCopy.debugModeLabel }))

    await waitFor(() => {
      expect(applyAppUiStatePatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          shell: expect.objectContaining({
            appMode: 'launcher',
            launcherPage: 'library',
            debugEnabled: false,
          }),
        }),
      )
      expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.pages.library }).getAttribute('aria-current')).toBe(
        'page',
      )
    })

    expect(screen.queryByRole('button', { name: editorCopy['en-US'].launcher.pages.debug })).toBeNull()
    expect(screen.getByRole('button', { name: 'Launch Game' })).toBeTruthy()
  })

  it('does not re-render App when the workspace layout reports an in-session persist update', async () => {
    const persistedLayout = createMockWorkspaceLayoutState()

    seedAppUiState({
      shell: {
        appMode: 'workbench',
      },
      workspace: {
        layouts: {
          'modforge:workspace-layout:v11:map': persistedLayout,
        },
      },
    })

    render(<App />)

    await waitFor(() => {
      expect(workspaceLayoutMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    const renderCountBeforePersist = workspaceLayoutMock.mock.calls.length
    const workspaceLayoutProps = workspaceLayoutMock.mock.calls.at(-1)?.[0] as
      | {
          storageKey: string
          onPersistStateChange?: (storageKey: string, state: Record<string, unknown>) => void
        }
      | undefined

    expect(workspaceLayoutProps?.storageKey).toBe('modforge:workspace-layout:v11:map')

    const nextLayout = {
      ...persistedLayout,
      chrome: {
        ...persistedLayout.chrome,
        leftWidth: 0.26,
      },
    }

    act(() => {
      workspaceLayoutProps?.onPersistStateChange?.(workspaceLayoutProps.storageKey, nextLayout)
    })

    expect(workspaceLayoutMock.mock.calls.length).toBe(renderCountBeforePersist)

    await waitFor(() => {
      expect(applyAppUiStatePatchMock).toHaveBeenCalledWith({
        workspace: {
          layouts: {
            [workspaceLayoutProps!.storageKey]: nextLayout,
          },
        },
      })
    })
  })

  it('hides workbench-only menus after switching to launcher', () => {
    const viewMenuCopy = getViewMenuCopy('en-US')

    seedAppUiState({
      shell: {
        appMode: 'workbench',
      },
    })

    render(<App />)

    expect(screen.getByRole('button', { name: editorCopy['en-US'].leftDock.project })).toBeTruthy()
    expect(screen.getByRole('button', { name: viewMenuCopy.title })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: editorCopy['en-US'].shell.launcher }))

    expect(screen.queryByRole('button', { name: editorCopy['en-US'].leftDock.project })).toBeNull()
    expect(screen.queryByRole('button', { name: viewMenuCopy.title })).toBeNull()
  })
})
