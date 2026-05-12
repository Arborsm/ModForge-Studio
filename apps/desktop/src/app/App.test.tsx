import { useEffect, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { LauncherNexusDiagnosticsResult } from '@platform/desktop'
import { editorCopy, getModWorkspaceCopy, getSettingsMenuCopy, getViewMenuCopy } from '@locales/editor-shell'
import { clearNotifications, dismissNotification, publishNotification } from '@shared/ui/notifications'

const mapWorkspaceState = {
  workspaceStatus: { tone: 'ready', message: '' },
  resourcePreloadState: { active: false, message: '', currentLabel: null as string | null, completed: 0, total: 0 },
}
const RESOURCE_PRELOAD_NOTIFICATION_ID = 'app-resource-preload'

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
    loadingMotion: {
      styleId: string
      intensityId: string
      speedMode: 'preset' | 'custom'
      speedId: 'slow' | 'standard' | 'fast'
      speedMultiplier: number
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
  appearance?: Partial<Omit<MockAppUiState['appearance'], 'playerAppearance' | 'loadingMotion'>> & {
    loadingMotion?: MockAppUiState['appearance']['loadingMotion']
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
    loadingMotion?: MockAppUiState['appearance']['loadingMotion']
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
      loadingMotion:
        overrides.appearance?.loadingMotion ?? {
          styleId: 'softFadeIn',
          intensityId: 'standard',
          speedMode: 'preset',
          speedId: 'standard',
          speedMultiplier: 1,
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
const retryLauncherNexusDiagnosticsRouteMock = vi.fn<(routeId: string) => Promise<LauncherNexusDiagnosticsResult>>(
  async () => createLauncherNexusDiagnosticsResult(),
)
const saveLauncherSettingsMock = vi.fn(async () => ({
  gamePath: 'C:/Games/Stardew Valley',
  modsPath: 'C:/Games/Stardew Valley/Mods',
  downloadPath: 'C:/Downloads',
  nexusApiKey: null,
  autoInstallDownloads: false,
  keepDownloadedArchives: false,
  autoCheckModUpdates: true,
}))

const useCpMakerMock = vi.fn(() => ({
  activeDraft: null,
  drafts: [],
  patchCountByWorkspace: {
    map: 0,
    events: 0,
    characters: 0,
    buildings: 0,
    items: 0,
    mods: 0,
  },
  dirtyPatchIds: new Set<string>(),
  isDirty: false,
  draftLoading: false,
  configSchema: [],
  createDraft: vi.fn(async () => undefined),
  addPatch: vi.fn(() => 'patch-1'),
  loadDraft: vi.fn(async () => undefined),
  copyDraft: vi.fn(async () => undefined),
  deleteDraft: vi.fn(async () => undefined),
  exportPack: vi.fn(async () => null),
  getPatchesForWorkspace: vi.fn(() => []),
  removePatch: vi.fn(),
  updatePatch: vi.fn(),
  removeConfigEntry: vi.fn(),
  addConfigEntry: vi.fn(),
  saveDraft: vi.fn(async () => undefined),
  addVirtualAsset: vi.fn(),
  removeVirtualAsset: vi.fn(),
}))

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

vi.mock('@pages/workbench/ui/DevDebugOverlay', () => ({
  DevDebugOverlay: () => <div data-testid="app-debug-overlay" />,
}))

vi.mock('@pages/workbench/ui/InitializationOverlay', () => ({
  default: () => null,
}))

vi.mock('@widgets/status-bar', () => ({
  default: () => null,
}))

vi.mock('@shared/workspace', () => ({
  WorkspaceLayout: (props: Record<string, unknown>) => {
    workspaceLayoutMock(props)
    return <div data-testid="workspace-layout" data-storage-key={String(props.storageKey ?? '')} />
  },
}))

vi.mock('@features/launcher', async () => {
  const actual = await vi.importActual<typeof import('@features/launcher')>('@features/launcher')
  return {
    ...actual,
    useLauncherRuntime: () => ({
    settingsState: {
      settings: {
        gamePath: 'C:/Games/Stardew Valley',
        modsPath: 'C:/Games/Stardew Valley/Mods',
        downloadPath: 'C:/Downloads',
        nexusApiKey: null,
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
  }
})

vi.mock('@platform/desktop', () => ({
  LAUNCHER_ARCHIVE_FILE_SUFFIXES: ['.zip', '.7z', '.rar', '.tar.gz', '.tgz', '.tar'],
  canUseDesktopHost: () => canUseDesktopHostMock(),
  checkLauncherUpdates: vi.fn(async () => ({ modsPath: 'C:/Games/Stardew Valley/Mods', checkedAtMs: 0, updates: [] })),
  clearLauncherLibraryReadCaches: vi.fn(),
  clearDesktopLocaleCache: vi.fn(),
  closeCurrentWindow: vi.fn(),
  chooseArchiveFile: vi.fn(async () => null),
  chooseImageFile: vi.fn(async () => null),
  isCurrentWindowFullscreen: vi.fn(async () => false),
  inspectLauncherArchive: vi.fn(),
  isSupportedLauncherArchivePath: vi.fn(() => false),
  loadCachedLauncherUpdates: vi.fn(async () => null),
  loadAppUiState: vi.fn(async () => mockAppUiState),
  loadImageDataUrl: vi.fn(async () => 'data:image/png;base64,mock'),
  loadLauncherNexusDiagnostics: () => loadLauncherNexusDiagnosticsMock(),
  listenToLauncherArchiveDragDrop: vi.fn(async () => () => {}),
  restartLauncherNexusDiagnostics: () => restartLauncherNexusDiagnosticsMock(),
  retryLauncherNexusDiagnosticsRoute: (routeId: string) => retryLauncherNexusDiagnosticsRouteMock(routeId),
  setLauncherNexusForceOffline: (forceOffline: boolean) => setLauncherNexusForceOfflineMock(forceOffline),
  listenToLauncherUpdateProgress: vi.fn(async () => () => {}),
  listKnownGameDirectories: vi.fn(async () => []),
  listLauncherInstallBackups: vi.fn(async () => []),
  launchLauncherGame: vi.fn(async () => ({ target: 'game', executablePath: 'C:/Games/Stardew Valley/Stardew Valley.exe' })),
  minimizeCurrentWindow: vi.fn(),
  openLauncherUrl: vi.fn(async () => undefined),
  openLauncherPath: vi.fn(async () => {}),
  patchAppUiState: (patch: MockAppUiStatePatch) => applyAppUiStatePatchMock(patch),
  saveLauncherSettings: () => saveLauncherSettingsMock(),
  resolveLauncherImage: vi.fn(async () => null),
  restoreLauncherInstallBackup: vi.fn(async () => undefined),
  setLauncherLibraryCover: vi.fn(async () => undefined),
  setDesktopDebugLoggingEnabled: vi.fn(async () => undefined),
  subscribeLauncherUpdates: vi.fn(() => () => {}),
  toggleFullscreenCurrentWindow: vi.fn(async () => false),
  toggleMaximizeCurrentWindow: vi.fn(),
  toDesktopAssetUrl: vi.fn((value: string) => `asset:${value}`),
  writeFrontendLog: vi.fn(async () => undefined),
}))

vi.mock('@platform/desktop', () => ({
  LAUNCHER_ARCHIVE_FILE_SUFFIXES: ['.zip', '.7z', '.rar', '.tar.gz', '.tgz', '.tar'],
  canUseDesktopHost: () => canUseDesktopHostMock(),
  checkLauncherUpdates: vi.fn(async () => ({ modsPath: 'C:/Games/Stardew Valley/Mods', checkedAtMs: 0, updates: [] })),
  clearLauncherLibraryReadCaches: vi.fn(),
  clearDesktopLocaleCache: vi.fn(),
  closeCurrentWindow: vi.fn(),
  chooseArchiveFile: vi.fn(async () => null),
  chooseImageFile: vi.fn(async () => null),
  isCurrentWindowFullscreen: vi.fn(async () => false),
  inspectLauncherArchive: vi.fn(),
  isSupportedLauncherArchivePath: vi.fn(() => false),
  loadCachedLauncherUpdates: vi.fn(async () => null),
  loadAppUiState: vi.fn(async () => mockAppUiState),
  loadImageDataUrl: vi.fn(async () => 'data:image/png;base64,mock'),
  loadLauncherNexusDiagnostics: () => loadLauncherNexusDiagnosticsMock(),
  listenToLauncherArchiveDragDrop: vi.fn(async () => () => {}),
  restartLauncherNexusDiagnostics: () => restartLauncherNexusDiagnosticsMock(),
  retryLauncherNexusDiagnosticsRoute: (routeId: string) => retryLauncherNexusDiagnosticsRouteMock(routeId),
  setLauncherNexusForceOffline: (forceOffline: boolean) => setLauncherNexusForceOfflineMock(forceOffline),
  listenToLauncherUpdateProgress: vi.fn(async () => () => {}),
  listKnownGameDirectories: vi.fn(async () => []),
  listLauncherInstallBackups: vi.fn(async () => []),
  launchLauncherGame: vi.fn(async () => ({ target: 'game', executablePath: 'C:/Games/Stardew Valley/Stardew Valley.exe' })),
  minimizeCurrentWindow: vi.fn(),
  openLauncherUrl: vi.fn(async () => undefined),
  openLauncherPath: vi.fn(async () => {}),
  patchAppUiState: (patch: MockAppUiStatePatch) => applyAppUiStatePatchMock(patch),
  saveLauncherSettings: () => saveLauncherSettingsMock(),
  resolveLauncherImage: vi.fn(async () => null),
  restoreLauncherInstallBackup: vi.fn(async () => undefined),
  setLauncherLibraryCover: vi.fn(async () => undefined),
  setDesktopDebugLoggingEnabled: vi.fn(async () => undefined),
  subscribeLauncherUpdates: vi.fn(() => () => {}),
  toggleFullscreenCurrentWindow: vi.fn(async () => false),
  toggleMaximizeCurrentWindow: vi.fn(),
  toDesktopAssetUrl: vi.fn((value: string) => `asset:${value}`),
  writeFrontendLog: vi.fn(async () => undefined),
}))

vi.mock('@shared/lib/react', () => ({
  scheduleDeferred: (callback: () => void) => {
    callback()
    return () => {}
  },
}))

vi.mock('@pages/workbench/model/workspace-panels', () => ({
  buildWorkspacePanels: () => [],
}))

vi.mock('@features/cp-maker', () => ({
  CpMakerProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useCpMaker: () => useCpMakerMock(),
  buildStudioDeskModel: () => ({
    heroProject: null,
    recentProjects: [],
    spotlightPatches: [],
    worldBible: [],
    inspirations: [],
    projectStatus: 'idle',
  }),
  getEditModeRoute: () => 'studio-desk',
  StudioDesk: () => <div data-testid="studio-desk" />,
  EditWorkspaceContent: () => <div data-testid="mock-edit-workspace-content" />,
  EditModeShell: () => <div data-testid="edit-mode-shell" />,
}))

vi.mock('@pages/launcher/LauncherPage', () => ({
  LauncherPage: ({
    page,
    locale,
    onAppModeChange,
    onOpenSettings,
    onLauncherPageChange,
    onLauncherDiagnosticsUpdate,
  }: {
    page: 'library' | 'discover' | 'updates' | 'debug'
    debugEnabled: boolean
    locale: 'en-US' | 'zh-CN'
    onAppModeChange: (mode: 'launcher' | 'workbench') => void
    onOpenSettings: (category?: 'appearance' | 'launcher' | 'interaction' | 'debug') => void
    onLauncherPageChange: (page: 'library' | 'discover' | 'updates' | 'debug') => void
    onNavigateToDiagnostics?: () => void
    onRetryDiagnostics?: (() => Promise<void> | void) | null
    onLauncherDiagnosticsUpdate?: (diagnostics: LauncherNexusDiagnosticsResult) => void
  }) => {
    const activePage = page
    const labels =
      locale === 'zh-CN'
        ? {
            debug: '配置',
            discover: '发现',
            downloads: '下载',
            launchGame: '启动游戏',
            library: '库',
            settings: '设置',
            updates: '更新',
            workbench: '工作台',
          }
        : {
            debug: 'Configuration',
            discover: 'Discover',
            downloads: 'Downloads',
            launchGame: 'Launch Game',
            library: 'Library',
            settings: 'Settings',
            updates: 'Updates',
            workbench: 'Workbench',
          }

    useEffect(() => {
      void loadLauncherNexusDiagnosticsMock().then((diagnostics) => {
        onLauncherDiagnosticsUpdate?.(diagnostics)
      })
    }, [onLauncherDiagnosticsUpdate])

    return (
      <div data-testid="mock-launcher-page" data-page={activePage}>
        <button type="button" onClick={() => onOpenSettings('appearance')}>
          {labels.settings}
        </button>
        <button type="button" onClick={() => onAppModeChange('workbench')}>
          {labels.workbench}
        </button>
        <button
          type="button"
          aria-current={activePage === 'library' ? 'page' : undefined}
          onClick={() => onLauncherPageChange('library')}
        >
          {labels.library}
        </button>
        <button
          type="button"
          aria-current={activePage === 'discover' ? 'page' : undefined}
          onClick={() => onLauncherPageChange('discover')}
        >
          {labels.discover}
        </button>
        <button
          type="button"
          aria-current={activePage === 'updates' ? 'page' : undefined}
          onClick={() => onLauncherPageChange('updates')}
        >
          {labels.updates}
        </button>
        <button type="button">{labels.downloads}</button>
        <button
          type="button"
          aria-current={activePage === 'debug' ? 'page' : undefined}
          onClick={() => onLauncherPageChange('debug')}
        >
          {labels.debug}
        </button>
        {activePage === 'library' ? <button type="button">{labels.launchGame}</button> : null}
      </div>
    )
  },
}))

vi.mock('@pages/workbench/model/builtInWorkspaces', () => ({}))

vi.mock('@pages/workbench', () => ({
  WorkbenchPage: function MockWorkbenchPage(props: {
    active: boolean
    locale: 'en-US' | 'zh-CN'
    debugEnabled: boolean
    onOpenSettings: (category?: 'appearance' | 'launcher' | 'interaction' | 'debug') => void
  }) {
    const copy = editorCopy[props.locale]
    const viewMenuCopy = getViewMenuCopy(props.locale)

    useEffect(() => {
      if (!props.active || !mapWorkspaceState.resourcePreloadState.active) {
        dismissNotification(RESOURCE_PRELOAD_NOTIFICATION_ID)
        return
      }

      const preloadState = mapWorkspaceState.resourcePreloadState
      const progress = preloadState.total <= 0 ? 18 : Math.max(0, Math.min(100, (preloadState.completed / preloadState.total) * 100))

      publishNotification({
        id: RESOURCE_PRELOAD_NOTIFICATION_ID,
        level: 'info',
        title: preloadState.message || copy.messages.preloadingResources,
        description: preloadState.currentLabel || null,
        autoDismissMs: null,
        progress,
      })

      return () => {
        dismissNotification(RESOURCE_PRELOAD_NOTIFICATION_ID)
      }
    }, [copy.messages.preloadingResources, props.active, props.locale])

    if (!props.active) {
      return null
    }

    const layoutProps = {
      storageKey: 'modforge:workspace-layout:v11:map',
      onPersistStateChange: (storageKey: string, state: Record<string, unknown>) => {
        void applyAppUiStatePatchMock({
          workspace: {
            layouts: {
              [storageKey]: state,
            },
          },
        })
      },
    }

    workspaceLayoutMock(layoutProps)

    return (
      <div data-testid="mock-workbench-experience">
        <button type="button" onClick={() => props.onOpenSettings('appearance')}>
          {getSettingsMenuCopy(props.locale).title}
        </button>
        <button type="button">{copy.nav.map}</button>
        <button type="button">{copy.leftDock.project}</button>
        <button type="button">{viewMenuCopy.title}</button>
        <div data-testid="workspace-layout" data-storage-key={layoutProps.storageKey} />
        {props.debugEnabled ? (
          <>
            <div data-testid="workbench-debug-overlay" />
            <div data-testid="app-debug-overlay" />
          </>
        ) : null}
      </div>
    )
  },
}))

vi.mock('@entities/event', () => ({
  clearLocalizedStageMetadataCache: vi.fn(),
  getStageMetadataCacheStats: () => ({ hat: 0, hair: 0 }),
}))

vi.mock('@pages/workbench/workspaces/map', () => ({
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

vi.mock('@pages/workbench/workspaces/event-stage', () => ({
  useEventWorkspace: () => ({
    eventAssets: [],
    eventStatusMessage: '',
    selectedEvent: null,
  }),
}))

vi.mock('@pages/workbench/workspaces/character', () => ({
  useCharacterWorkspace: () => ({
    characters: [],
    characterStatusMessage: '',
  }),
}))

vi.mock('@pages/workbench/workspaces/building', () => ({
  useBuildingWorkspace: () => ({
    constructibleGroups: [],
    worldBuildings: [],
    buildingStatusMessage: '',
  }),
}))

vi.mock('@pages/workbench/workspaces/item', () => ({
  useItemWorkspace: () => ({
    items: [],
    itemStatusMessage: '',
  }),
}))

vi.mock('@pages/workbench/workspaces/mod', () => ({
  default: () => ({
    copy: getModWorkspaceCopy('en-US'),
    pluginDefinition: null,
    modProjects: [],
    filteredModProjects: [],
    modFilter: '',
    setModFilter: vi.fn(),
    contentPatcherOnly: false,
    setContentPatcherOnly: vi.fn(),
    compatibleOnly: true,
    setCompatibleOnly: vi.fn(),
    activeProjectPath: null,
    activeProject: null,
    projectDetail: null,
    manifestEditor: { text: '', value: null, error: null },
    contentEditor: { text: '', value: null, error: null },
    contentSummary: {
      format: null,
      changeCount: 0,
      includeCount: 0,
      dynamicTokenCount: 0,
      configKeys: [],
      patches: [],
    },
    diagnostics: [],
    selectedPatchId: null,
    setSelectedPatchId: vi.fn(),
    selectedPatch: null,
    patchWhenError: null,
    statusMessage: '',
    modHasUnsavedChanges: false,
    hasUnsavedChanges: false,
    canPersist: false,
    lastSaveResult: null,
    contentPatcherSnapshot: null,
    contentPatcherSimulation: null,
    contentPatcherResultAsset: null,
    contentPatcherResultLoading: false,
    contentPatcherResultError: null,
    simulationContext: {},
    navigatorMode: 'patches',
    setNavigatorMode: vi.fn(),
    selectedTargetPath: null,
    setSelectedTargetPath: vi.fn(),
    scaleUpEditor: null,
    handleSelectProject: vi.fn(),
    handleImportProject: vi.fn(async () => undefined),
    handleRefreshProjects: vi.fn(async () => undefined),
    handleManifestFieldChange: vi.fn(),
    handleManifestTextChange: vi.fn(),
    handleContentTextChange: vi.fn(),
    handleAddPatch: vi.fn(),
    handleRemoveSelectedPatch: vi.fn(),
    handlePatchFieldChange: vi.fn(),
    handlePatchWhenChange: vi.fn(),
    handleSaveProject: vi.fn(async () => undefined),
    handleExportProject: vi.fn(async () => undefined),
    handleSimulationContextChange: vi.fn(),
    handleOpenScaleUpEditor: vi.fn(),
    handleCloseScaleUpEditor: vi.fn(),
    handleScaleUpContentChange: vi.fn(),
  }),
}))

vi.mock('@shared/lib/app-state', () => ({
  normalizeAppShellState: (input?: Partial<MockAppUiState['shell']> | null) => ({
    appMode: input?.appMode === 'workbench' ? 'workbench' : 'launcher',
    launcherPage:
      input?.launcherPage === 'discover' || input?.launcherPage === 'updates' || input?.launcherPage === 'debug'
        ? input.launcherPage
        : 'library',
    debugEnabled: input?.debugEnabled === true,
    notificationSoundEnabled: input?.notificationSoundEnabled !== false,
  }),
  initializeAppUiState: () => initializeAppUiStateMock(),
  applyAppUiStatePatch: (patch: MockAppUiStatePatch) => applyAppUiStatePatchMock(patch),
  getAppUiStateSnapshot: () => getAppUiStateSnapshotMock(),
  clearLegacyBrowserUiState: () => clearLegacyBrowserUiStateMock(),
  configureAppUiStatePersistence: vi.fn(),
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
    retryLauncherNexusDiagnosticsRouteMock.mockReset()
    retryLauncherNexusDiagnosticsRouteMock.mockResolvedValue({ routes: [] })
    saveLauncherSettingsMock.mockReset()
    saveLauncherSettingsMock.mockImplementation(async () => ({
      gamePath: 'C:/Games/Stardew Valley',
      modsPath: 'C:/Games/Stardew Valley/Mods',
      downloadPath: 'C:/Downloads',
      nexusApiKey: null,
      autoInstallDownloads: false,
      keepDownloadedArchives: false,
      autoCheckModUpdates: true,
    }))
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
    })
    const englishSettingsCopy = getSettingsMenuCopy('en-US')
    const englishSettingsName = new RegExp(`^${englishSettingsCopy.title}(?:\\s+Dialog)?$`)

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: englishSettingsName }))

    const localeGroup = await screen.findByRole('radiogroup', { name: englishSettingsCopy.languageLabel })
    const chineseOption = screen.getByRole('radio', { name: englishSettingsCopy.localeLabels['zh-CN'] })

    expect(localeGroup).toBeTruthy()

    fireEvent.click(chineseOption)

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('zh-CN')
    })
    expect(mockAppUiState.appearance.locale).toBe('zh-CN')
  })

  it('initializes App locale from a valid stored locale value', async () => {
    seedAppUiState({
      appearance: { locale: 'zh-CN' },
    })
    const chineseSettingsCopy = getSettingsMenuCopy('zh-CN')
    const chineseSettingsName = new RegExp(`^${chineseSettingsCopy.title}(?:\\s+Dialog)?$`)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: chineseSettingsName })).toBeTruthy()
    })
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
    seedAppUiState({
      shell: { appMode: 'workbench' },
    })
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
    expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.pages.updates }).getAttribute('aria-current')).toBe('page')
    expect(
      screen.queryByRole('button', { name: editorCopy['en-US'].launcher.downloads.title })?.getAttribute('aria-current'),
    ).not.toBe('page')
  })

  it('switches app mode to workbench through shell controls and persists it', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: editorCopy['en-US'].shell.workbench }))

    expect(await screen.findByTestId('workspace-layout')).toBeTruthy()
    await waitFor(() => {
      expect(mockAppUiState.shell.appMode).toBe('workbench')
    })
  })

  it('renders the launcher downloads button in shell controls and the launch game action on the library page', async () => {
    seedAppUiState({
      shell: { appMode: 'launcher' },
    })

    render(<App />)

    expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.downloads.title })).toBeTruthy()
    expect(await screen.findByRole('button', { name: editorCopy['en-US'].launcher.actions.launchGame })).toBeTruthy()
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
    expect(mockAppUiState.shell.launcherPage).toBe('updates')

    fireEvent.click(screen.getByRole('button', { name: editorCopy['en-US'].shell.workbench }))

    await waitFor(() => {
      expect(mockAppUiState.shell.launcherPage).toBe('updates')
      expect(mockAppUiState.shell.appMode).toBe('workbench')
    })
  })

  it('keeps launcher settings out of the global settings window', async () => {
    const englishSettingsCopy = getSettingsMenuCopy('en-US')

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(englishSettingsCopy.title) }))
    await screen.findByRole('button', { name: new RegExp(`^${englishSettingsCopy.categories.appearance}`) })

    const settingsSidebar = document.querySelector('.settings-window-sidebar')
    expect(settingsSidebar).toBeTruthy()
    expect(within(settingsSidebar as HTMLElement).queryByRole('button', { name: new RegExp(`^${englishSettingsCopy.categories.launcher}`) })).toBeNull()
    expect(document.querySelector('.settings-window-content')?.textContent).not.toContain(englishSettingsCopy.categories.launcher)
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
          endpoint: 'https://api.nexusmods.com/v2/graphql',
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
          endpoint: 'https://api.nexusmods.com/v2/graphql',
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
          endpoint: 'https://api.nexusmods.com/v2/graphql',
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
      expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.pages.debug }).getAttribute('aria-current')).toBe('page')
    })
  })

  it('retries only failed Nexus diagnostics routes from the diagnostics notification retry button', async () => {
    seedAppUiState({
      shell: { appMode: 'launcher' },
    })
    canUseDesktopHostMock.mockReturnValue(true)
    loadLauncherNexusDiagnosticsMock.mockResolvedValue({
      routes: [
        {
          routeId: 'privateGraphql',
          label: 'Nexus Private GraphQL',
          endpoint: 'https://api.nexusmods.com/v2/graphql',
          status: 'warning',
          attempts: 3,
          maxAttempts: 3,
          available: false,
          message: 'Failed after 3 attempts: timeout',
        },
        {
          routeId: 'nexusImages',
          label: 'Nexus Image CDN',
          endpoint: 'https://staticdelivery.nexusmods.com/',
          status: 'success',
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
      ],
    })
    retryLauncherNexusDiagnosticsRouteMock.mockResolvedValue({
      routes: [
        {
          routeId: 'privateGraphql',
          label: 'Nexus Private GraphQL',
          endpoint: 'https://api.nexusmods.com/v2/graphql',
          status: 'success',
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
      ],
    })

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: editorCopy['en-US'].launcher.actions.retry }))

    await waitFor(() => {
      expect(retryLauncherNexusDiagnosticsRouteMock).toHaveBeenCalledWith('privateGraphql')
    })
    expect(restartLauncherNexusDiagnosticsMock).not.toHaveBeenCalled()
    expect(retryLauncherNexusDiagnosticsRouteMock).not.toHaveBeenCalledWith('nexusImages')
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

    return waitFor(() => {
      expect(screen.getByTestId('workbench-debug-overlay')).toBeTruthy()
    })
  })

  it('keeps the workbench debug overlay out of launcher mode when debug mode is enabled', () => {
    seedAppUiState({
      shell: {
        appMode: 'launcher',
        debugEnabled: true,
      },
    })

    render(<App />)

    expect(screen.queryByTestId('workbench-debug-overlay')).toBeNull()
  })

  it('toggles debug mode from Settings and persists the flag', async () => {
    seedAppUiState({
      shell: { appMode: 'workbench' },
    })
    const englishSettingsCopy = getSettingsMenuCopy('en-US')

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: englishSettingsCopy.title }))
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${englishSettingsCopy.categories.debug}`) }))
    fireEvent.click(screen.getByRole('switch', { name: englishSettingsCopy.debugModeLabel }))

    await waitFor(() => {
      expect(mockAppUiState.shell.debugEnabled).toBe(true)
      expect(screen.getByTestId('workbench-debug-overlay')).toBeTruthy()
    })
  })

  it('toggles notification sounds from Settings and persists the flag', async () => {
    seedAppUiState({
      shell: { appMode: 'workbench' },
    })
    const englishSettingsCopy = getSettingsMenuCopy('en-US')

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: englishSettingsCopy.title }))
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${englishSettingsCopy.categories.interaction}`) }))
    fireEvent.click(screen.getByRole('switch', { name: englishSettingsCopy.notificationSoundLabel }))

    await waitFor(() => {
      expect(mockAppUiState.shell.notificationSoundEnabled).toBe(false)
    })
  })

  it('persists loading motion changes immediately from Settings', async () => {
    seedAppUiState({
      shell: { appMode: 'workbench' },
      appearance: {
        loadingMotion: {
          styleId: 'softFadeIn',
          intensityId: 'standard',
          speedMode: 'preset',
          speedId: 'standard',
          speedMultiplier: 1,
        },
      },
    })
    const englishSettingsCopy = getSettingsMenuCopy('en-US')

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: englishSettingsCopy.title }))
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${englishSettingsCopy.categories.loading}`) }))
    fireEvent.click(screen.getByRole('button', { name: 'Bounce In' }))

    await waitFor(() => {
      expect(mockAppUiState.appearance.loadingMotion).toEqual({
        styleId: 'bounceIn',
        intensityId: 'standard',
        speedMode: 'preset',
        speedId: 'standard',
        speedMultiplier: 1,
      })
    })
  })

  it('keeps the launcher tools page available when debug mode is disabled', () => {
    seedAppUiState({
      shell: {
        appMode: 'launcher',
        launcherPage: 'debug',
        debugEnabled: false,
      },
    })

    render(<App />)

    expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.pages.debug }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(screen.queryByRole('button', { name: 'Launch Game' })).toBeNull()
  })

  it('keeps the launcher tools page active when debug mode is turned off', async () => {
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
            launcherPage: 'debug',
            debugEnabled: false,
          }),
        }),
      )
      expect(screen.getByRole('button', { name: editorCopy['en-US'].launcher.pages.debug }).getAttribute('aria-current')).toBe(
        'page',
      )
    })

    expect(screen.queryByRole('button', { name: 'Launch Game' })).toBeNull()
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
      expect(workspaceLayoutMock.mock.calls.length).toBeGreaterThanOrEqual(1)
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

})
