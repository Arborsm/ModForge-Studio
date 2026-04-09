import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { editorCopy, getSettingsMenuCopy } from './lib/editor-shell'
import { APP_MODE_STORAGE_KEY, DEBUG_ENABLED_STORAGE_KEY, LAUNCHER_PAGE_STORAGE_KEY } from './lib/app/appShell'
import { clearNotifications, publishNotification } from './lib/app/notifications'

const LOCALE_STORAGE_KEY = 'modforge:locale'
const mapWorkspaceState = {
  workspaceStatus: { tone: 'ready', message: '' },
  resourcePreloadState: { active: false, message: '', currentLabel: null as string | null, completed: 0, total: 0 },
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
  WorkspaceLayout: () => <div data-testid="workspace-layout" />,
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
      queueDownload: vi.fn(),
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
    downloadsBadgeCount: 0,
    downloadsHasFailure: false,
  }),
}))

vi.mock('./lib/desktop', () => ({
  canUseDesktopHost: () => false,
  checkLauncherUpdates: vi.fn(async () => ({ modsPath: 'C:/Games/Stardew Valley/Mods', checkedAtMs: 0, updates: [] })),
  clearDesktopLocaleCache: vi.fn(),
  closeCurrentWindow: vi.fn(),
  isCurrentWindowFullscreen: vi.fn(async () => false),
  listenToLauncherUpdateProgress: vi.fn(async () => () => {}),
  listKnownGameDirectories: vi.fn(async () => []),
  launchLauncherGame: vi.fn(async () => ({ target: 'game', executablePath: 'C:/Games/Stardew Valley/Stardew Valley.exe' })),
  minimizeCurrentWindow: vi.fn(),
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

describe('App locale ownership', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mapWorkspaceState.workspaceStatus = { tone: 'ready', message: '' }
    mapWorkspaceState.resourcePreloadState = { active: false, message: '', currentLabel: null, completed: 0, total: 0 }
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
    window.localStorage.clear()
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'en-US',
    })
  })

  it('updates downstream shell copy immediately when locale changes through Settings', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en-US')
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'workbench')
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
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-CN')
  })

  it('initializes App locale from a valid stored locale value', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'zh-CN')
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'workbench')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: getSettingsMenuCopy('zh-CN').title })).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: editorCopy['zh-CN'].nav.map })).toBeTruthy()
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('falls back from an invalid stored locale to navigator language heuristics', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'es-ES')
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'workbench')
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'zh-CN',
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: editorCopy['zh-CN'].nav.map })).toBeTruthy()
    })
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-CN')
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

  it('renders launcher shell and hides workspace layout when the stored app mode is launcher', () => {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'launcher')
    window.localStorage.setItem(LAUNCHER_PAGE_STORAGE_KEY, 'updates')

    render(<App />)

    expect(screen.queryByTestId('workspace-layout')).toBeNull()
    expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.pages.updates }).getAttribute('aria-current')).toBe('page')
    expect(
      screen.queryByRole('button', { name: editorCopy['en-US'].launcher.downloads.title })?.getAttribute('aria-current'),
    ).not.toBe('page')
  })

  it('switches app mode to workbench through shell controls and persists it', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: editorCopy['en-US'].shell.workbench }))

    expect(screen.getByTestId('workspace-layout')).toBeTruthy()
    expect(window.localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('workbench')
  })

  it('renders the launcher downloads button in shell controls and the launch game action on the library page', () => {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'launcher')

    render(<App />)

    expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.downloads.title })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Launch Game' })).toBeTruthy()
  })

  it('renders launcher settings inside the global settings window', async () => {
    const englishSettingsCopy = getSettingsMenuCopy('en-US')

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(englishSettingsCopy.title) }))
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${englishSettingsCopy.categories.launcher}`) }))

    expect(screen.getByText(editorCopy['en-US'].launcher.fields.gamePath)).toBeTruthy()
    expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.actions.saveSettings })).toBeTruthy()
  })

  it('renders global notifications in both workbench and launcher app modes', () => {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'workbench')
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
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'launcher')

    render(<App />)

    act(() => {
      publishNotification({
        level: 'warning',
        title: 'Launcher notification',
      })
    })

    expect(screen.getByText('Launcher notification')).toBeTruthy()
  })

  it('shows the debug overlay when debug mode is enabled from persisted shell state', () => {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'workbench')
    window.localStorage.setItem(DEBUG_ENABLED_STORAGE_KEY, 'true')

    render(<App />)

    expect(screen.getByTestId('dev-debug-overlay')).toBeTruthy()
  })

  it('toggles debug mode from Settings and persists the flag', async () => {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'workbench')
    const englishSettingsCopy = getSettingsMenuCopy('en-US')

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(englishSettingsCopy.title) }))
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${englishSettingsCopy.categories.debug}`) }))
    fireEvent.click(screen.getByRole('switch', { name: englishSettingsCopy.debugModeLabel }))

    await waitFor(() => {
      expect(window.localStorage.getItem(DEBUG_ENABLED_STORAGE_KEY)).toBe('true')
      expect(screen.getByTestId('dev-debug-overlay')).toBeTruthy()
    })
  })

  it('falls back to the launcher library when the persisted debug page is disabled', () => {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'launcher')
    window.localStorage.setItem(LAUNCHER_PAGE_STORAGE_KEY, 'settings')
    window.localStorage.setItem(DEBUG_ENABLED_STORAGE_KEY, 'false')

    render(<App />)

    expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.pages.library }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(screen.queryByRole('button', { name: editorCopy['en-US'].launcher.pages.settings })).toBeNull()
    expect(screen.getByRole('button', { name: 'Launch Game' })).toBeTruthy()
  })

  it('returns from the launcher debug page when debug mode is turned off', async () => {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'launcher')
    window.localStorage.setItem(LAUNCHER_PAGE_STORAGE_KEY, 'settings')
    window.localStorage.setItem(DEBUG_ENABLED_STORAGE_KEY, 'true')
    const englishSettingsCopy = getSettingsMenuCopy('en-US')

    render(<App />)

    expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.pages.settings }).getAttribute('aria-current')).toBe(
      'page',
    )

    fireEvent.click(screen.getByRole('button', { name: new RegExp(englishSettingsCopy.title) }))
    const sidebar = document.querySelector('.settings-window-sidebar')
    expect(sidebar).toBeTruthy()
    fireEvent.click(within(sidebar as HTMLElement).getByRole('button', { name: /^Debug/ }))
    fireEvent.click(screen.getByRole('switch', { name: englishSettingsCopy.debugModeLabel }))

    await waitFor(() => {
      expect(window.localStorage.getItem(DEBUG_ENABLED_STORAGE_KEY)).toBe('false')
      expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.pages.library }).getAttribute('aria-current')).toBe(
        'page',
      )
    })

    expect(screen.queryByRole('button', { name: editorCopy['en-US'].launcher.pages.settings })).toBeNull()
    expect(screen.getByRole('button', { name: 'Launch Game' })).toBeTruthy()
  })
})
