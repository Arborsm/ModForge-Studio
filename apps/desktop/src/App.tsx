import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DevDebugOverlay } from './components/DevDebugOverlay'
import InitializationOverlay from './components/InitializationOverlay'
import StatusBar from './components/StatusBar'
import TopMenuBar from './components/TopMenuBar'
import LauncherShell from './components/launcher/LauncherShell'
import { LauncherSettingsForm } from './components/launcher/shared/LauncherSettingsForm'
import { LauncherDownloadsPopover } from './components/launcher/shared/LauncherDownloadsPopover'
import { WorkspaceLayout, type WorkspaceLayoutHandle, type WorkspacePanelMeta } from './components/WorkspaceLayout'
import {
  canUseDesktopHost,
  clearDesktopLocaleCache,
  closeCurrentWindow,
  isCurrentWindowFullscreen,
  launchLauncherGame,
  listKnownGameDirectories,
  minimizeCurrentWindow,
  toggleFullscreenCurrentWindow,
  toggleMaximizeCurrentWindow,
} from './lib/desktop'
import {
  editorCopy,
  getSettingsMenuCopy,
  getWorldAtlasViewLabel,
  launcherPages,
  type AppMode,
  type LauncherPage,
  type LocaleCode,
  type ThemeMode,
  type WorkspaceMode,
} from './lib/editor-shell'
import { persistAppShellState, readStoredAppShellState } from './lib/app/appShell'
import { rgbaFromHex } from './lib/app/color'
import {
  ACCENT_PRESETS,
  ACCENT_STORAGE_KEY,
  PLAYER_APPEARANCE_ACTIVE_PROFILE_STORAGE_KEY,
  PLAYER_APPEARANCE_PROFILES_STORAGE_KEY,
  RECENT_GAME_DIRECTORIES_STORAGE_KEY,
  WORKSPACE_LAYOUT_VERSION,
} from './lib/app/constants'
import {
  clonePlayerAppearanceProfile,
  createDefaultPlayerAppearanceProfile,
  readStoredPlayerAppearanceState,
  sanitizePlayerAppearanceProfile,
  type PlayerAppearanceProfile,
} from './lib/app/playerAppearance'
import { clearLocalizedStageMetadataCache } from './lib/app/eventStageShared'
import { clearImageMetricsLocaleCache } from './lib/imageMetrics'
import { clearMapViewportLocaleCache } from './lib/mapViewportCache'
import { useEventWorkspace } from './lib/app/useEventWorkspace'
import { useMapWorkspace } from './lib/app/useMapWorkspace'
import { useCharacterWorkspace } from './lib/app/useCharacterWorkspace'
import { useBuildingWorkspace } from './lib/app/useBuildingWorkspace'
import { useItemWorkspace } from './lib/app/useItemWorkspace'
import { LocaleProvider } from './lib/app/localeContext'
import { dismissNotification, NotificationProvider, publishNotification } from './lib/app/notifications'
import { syncDebugDiagnosticsEnabled } from './lib/app/observability'
import { setNotificationSoundEnabled } from './lib/app/notificationSounds'
import useModWorkspace from './lib/app/useModWorkspace'
import { useLauncherUpdateProgressNotifications } from './lib/launcher/useLauncherUpdateProgressNotifications'
import { useLauncherRuntime } from './lib/launcher/useLauncherRuntime'
import { buildWorkspacePanels } from './lib/app/workspacePanels'
import { scheduleDeferred } from './lib/react/defer'
import type { SettingsWindowCategory } from './components/SettingsWindow'
import type { ResourcePreloadState } from './lib/app/types'

const SettingsWindow = lazy(() => import('./components/SettingsWindow'))
const PlayerAppearanceWindow = lazy(() => import('./components/PlayerAppearanceWindow'))

type IdleDeadlineLike = {
  didTimeout: boolean
  timeRemaining: () => number
}

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: (deadline: IdleDeadlineLike) => void, options?: { timeout?: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

const LOCALE_STORAGE_KEY = 'modforge:locale'
const RESOURCE_PRELOAD_NOTIFICATION_ID = 'app-resource-preload'

function getResourcePreloadProgress(state: ResourcePreloadState) {
  if (state.total <= 0) {
    return 18
  }

  return Math.max(0, Math.min(100, (state.completed / state.total) * 100))
}

function getInitialLocale(): LocaleCode {
  if (typeof window !== 'undefined') {
    try {
      const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY)
      if (storedLocale === 'zh-CN' || storedLocale === 'en-US') {
        return storedLocale
      }
    } catch {
      // Ignore blocked localStorage access and fall back to navigator heuristics.
    }
  }

  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')) {
    return 'zh-CN'
  }

  return 'en-US'
}

export default function App() {
  const initialShellStateRef = useRef<ReturnType<typeof readStoredAppShellState> | null>(null)
  if (!initialShellStateRef.current) {
    initialShellStateRef.current = readStoredAppShellState()
  }
  const initialShellState = initialShellStateRef.current
  const [theme, setTheme] = useState<ThemeMode>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
  )
  const [locale, setLocale] = useState<LocaleCode>(() => getInitialLocale())
  const [accentPresetId, setAccentPresetId] = useState<string>(() => {
    if (typeof window === 'undefined') {
      return ACCENT_PRESETS[0].id
    }

    return window.localStorage.getItem(ACCENT_STORAGE_KEY) ?? ACCENT_PRESETS[0].id
  })
  const [appMode, setAppMode] = useState<AppMode>(initialShellState.appMode)
  const [launcherPage, setLauncherPage] = useState<LauncherPage>(
    initialShellState.appMode === 'launcher' ? 'library' : initialShellState.launcherPage,
  )
  const [debugEnabled, setDebugEnabled] = useState(initialShellState.debugEnabled)
  const [notificationSoundEnabled, setNotificationSoundEnabledState] = useState(initialShellState.notificationSoundEnabled)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('map')
  const [deferredHeavyWorkspaceMode, setDeferredHeavyWorkspaceMode] = useState<WorkspaceMode | null>(null)
  const [settingsWindowOpen, setSettingsWindowOpen] = useState(false)
  const [settingsWindowCategory, setSettingsWindowCategory] = useState<SettingsWindowCategory>('appearance')
  const [windowIsFullscreen, setWindowIsFullscreen] = useState(false)
  const [projectOverlayOpen, setProjectOverlayOpen] = useState(false)
  const [playerAppearanceWindowOpen, setPlayerAppearanceWindowOpen] = useState(false)
  const [playerAppearanceWindowNonce, setPlayerAppearanceWindowNonce] = useState(0)
  const [launcherLaunchBusy, setLauncherLaunchBusy] = useState(false)
  const [storedRecentGameDirectories] = useState<string[]>(() => {
    if (typeof window === 'undefined') {
      return []
    }

    try {
      const parsed = JSON.parse(window.localStorage.getItem(RECENT_GAME_DIRECTORIES_STORAGE_KEY) ?? '[]')
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
    } catch {
      return []
    }
  })
  const [knownGameDirectories, setKnownGameDirectories] = useState<string[]>([])
  const [viewMenuPanelItems, setViewMenuPanelItems] = useState<WorkspacePanelMeta[]>([])
  const [viewMenuPresetNames, setViewMenuPresetNames] = useState<string[]>([])
  const [currentEventCommandId, setCurrentEventCommandId] = useState<string | null>(null)
  useEffect(() => {
    if (workspaceMode !== 'map') {
      return
    }

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
    }

    document.addEventListener('contextmenu', handleContextMenu)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [workspaceMode])

  useEffect(() => {
    let cancelled = false
    let cancelReset = () => {}
    let cancelRevealFrame = () => {}
    let cancelRevealTimeout = () => {}
    let idleId = 0

    const scheduleMode = (mode: WorkspaceMode | null) => {
      cancelReset = scheduleDeferred(() => {
        if (!cancelled) {
          setDeferredHeavyWorkspaceMode(mode)
        }
      }, 'frame')
    }

    if (workspaceMode !== 'map' && workspaceMode !== 'characters') {
      scheduleMode(workspaceMode)
      return () => {
        cancelled = true
        cancelReset()
      }
    }

    scheduleMode(null)

    const revealHeavyWorkspace = () => {
      if (cancelled) {
        return
      }
      setDeferredHeavyWorkspaceMode(workspaceMode)
    }

    const windowWithIdleCallback = window as WindowWithIdleCallback

    if (typeof windowWithIdleCallback.requestIdleCallback === 'function') {
      idleId = windowWithIdleCallback.requestIdleCallback(
        () => {
          revealHeavyWorkspace()
        },
        { timeout: 300 },
      )
    } else {
      cancelRevealFrame = scheduleDeferred(() => {
        cancelRevealTimeout = scheduleDeferred(revealHeavyWorkspace, 'timeout')
      }, 'frame')
    }

    return () => {
      cancelled = true
      if (idleId && typeof windowWithIdleCallback.cancelIdleCallback === 'function') {
        windowWithIdleCallback.cancelIdleCallback(idleId)
      }
      cancelReset()
      cancelRevealFrame()
      cancelRevealTimeout()
    }
  }, [workspaceMode])

  const [playerAppearanceProfiles, setPlayerAppearanceProfiles] = useState(() => {
    if (typeof window === 'undefined') {
      return [createDefaultPlayerAppearanceProfile()]
    }

    return readStoredPlayerAppearanceState(
      window.localStorage.getItem(PLAYER_APPEARANCE_PROFILES_STORAGE_KEY),
      window.localStorage.getItem(PLAYER_APPEARANCE_ACTIVE_PROFILE_STORAGE_KEY),
    ).profiles
  })
  const [activePlayerAppearanceProfileId, setActivePlayerAppearanceProfileId] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null
    }

    return readStoredPlayerAppearanceState(
      window.localStorage.getItem(PLAYER_APPEARANCE_PROFILES_STORAGE_KEY),
      window.localStorage.getItem(PLAYER_APPEARANCE_ACTIVE_PROFILE_STORAGE_KEY),
    ).activeProfileId
  })
  const workspaceLayoutRef = useRef<WorkspaceLayoutHandle | null>(null)
  const previousLocaleRef = useRef<LocaleCode>(locale)

  const copy = editorCopy[locale]
  const desktopHost = canUseDesktopHost()
  const {
    workspaceStatus,
    resourcePreloadState,
    gameDirectory,
    setGameDirectory,
    directoryInfo,
    mapAssets,
    filteredAssets,
    browserSourceMode: mapBrowserSourceMode,
    setBrowserSourceMode: setMapBrowserSourceMode,
    modMapGroups,
    activeModMapSelectionId,
    activeMapModSources,
    activeMapId,
    activeAsset,
    assetFilter,
    setAssetFilter,
    mapDocument,
    worldAtlasViews,
    activeWorldAtlasViewId,
    workspaceTabs,
    activeTabId,
    hoverInfo,
    setHoverInfo,
    visibleLayerIds,
    visibleObjectGroupIds,
    focusedObjectTarget,
    showGameWorldAdditions,
    setShowGameWorldAdditions,
    worldOverlaySprites,
    worldOverlayTextureAssets,
    worldAtlasDocument,
    openMap,
    handleOpenModMapAsset,
    handleSelectWorldAtlasView,
    handleSelectWorkspaceTab,
    handleCloseWorkspaceTab,
    handleReorderWorkspaceTabs,
    handleOpenAtlasTarget,
    handleScanAndOpenTown,
    handleChooseDirectory,
    toggleLayer,
    toggleObjectGroup,
    setAllLayers,
    setAllObjectGroups,
    focusObject,
  } = useMapWorkspace({
    copy,
    locale,
    desktopHost,
    setWorkspaceMode,
    getWorldAtlasViewLabel,
  })
  const launcherRuntime = useLauncherRuntime(locale)
  useLauncherUpdateProgressNotifications(locale)

  const {
    eventAssets,
    filteredEventAssets,
    browserSourceMode: eventBrowserSourceMode,
    setBrowserSourceMode: setEventBrowserSourceMode,
    modEventGroups,
    activeModEventSelectionId,
    activeEventModSources,
    eventAssetFilter,
    setEventAssetFilter,
    activeEventAssetId,
    parsedEventAsset,
    selectedEventKey,
    selectedEvent,
    selectedTimelineEntryId,
    setSelectedTimelineEntryId,
    timelineJumpRequestId,
    requestTimelineJump,
    clearTimelineJumpRequest,
    eventStatusMessage,
    handleOpenEventAsset,
    handleOpenModEventAsset,
    handleSelectEvent,
  } = useEventWorkspace({
    copy,
    locale,
    directoryInfo,
  })
  const {
    characters,
    filteredCharacters,
    browserSourceMode: characterBrowserSourceMode,
    setBrowserSourceMode: setCharacterBrowserSourceMode,
    modCharacterGroups,
    activeModCharacterSelectionId,
    activeCharacterModSources,
    characterFilter,
    setCharacterFilter,
    activeCharacterId,
    activeCharacter,
    activeVariant: activeCharacterVariant,
    characterStatusMessage,
    assetState: activeCharacterAssetState,
    handleSelectCharacter,
    handleSelectModCharacter,
    handleSelectVariant: handleSelectCharacterVariant,
  } = useCharacterWorkspace({
    directoryInfo,
    locale,
    copy: copy.charactersPanel,
    enableVisualAssets: workspaceMode === 'characters' && deferredHeavyWorkspaceMode === 'characters',
  })
  const {
    constructibleGroups,
    filteredConstructibleGroups,
    worldBuildings,
    filteredWorldBuildings,
    browserSourceMode: buildingBrowserSourceMode,
    setBrowserSourceMode: setBuildingBrowserSourceMode,
    modBuildingGroups,
    activeModBuildingSelectionId,
    activeBuildingModSources,
    buildingFilter,
    setBuildingFilter,
    activeBuildingId,
    activeBuilding,
    activeUpgradeChain,
    buildingStatusMessage,
    activeTextureState: activeBuildingTextureState,
    activeChainTextureStates: activeBuildingChainTextureStates,
    activeIndoorMapDocument: activeBuildingIndoorMapDocument,
    activeIndoorMapPath: activeBuildingIndoorMapPath,
    activeIndoorMapMessage: activeBuildingIndoorMapMessage,
    activeExteriorMapDocument: activeBuildingExteriorMapDocument,
    activeExteriorMapPath: activeBuildingExteriorMapPath,
    activeExteriorMapMessage: activeBuildingExteriorMapMessage,
    activeExteriorFocusPoint: activeBuildingExteriorFocusPoint,
    springObjectsState: buildingSpringObjectsState,
    handleSelectBuilding,
    handleSelectModBuilding,
  } = useBuildingWorkspace({
    directoryInfo,
    locale,
    copy: copy.buildingsPanel,
  })
  const {
    items,
    filteredItems,
    browserSourceMode: itemBrowserSourceMode,
    setBrowserSourceMode: setItemBrowserSourceMode,
    modItemGroups,
    activeModItemSelectionId,
    activeItemModSources,
    itemFilter,
    setItemFilter,
    activeItemId,
    activeItem,
    itemLookup,
    itemStatusMessage,
    textureStatesByAssetName: itemTextureStatesByAssetName,
    ensureTextureAssetStates: ensureItemTextureAssetStates,
    handleSelectItem,
    handleSelectModItem,
  } = useItemWorkspace({
    directoryInfo,
    locale,
    copy: copy.itemsPanel,
  })
  const {
    copy: modWorkspaceCopy,
    pluginDefinition: modPluginDefinition,
    modProjects,
    filteredModProjects,
    modFilter,
    setModFilter,
    contentPatcherOnly,
    setContentPatcherOnly,
    compatibleOnly,
    setCompatibleOnly,
    activeProjectPath,
    activeProject,
    projectDetail: activeModProjectDetail,
    manifestEditor: modManifestEditor,
    contentEditor: modContentEditor,
    contentSummary: modContentSummary,
    diagnostics: modDiagnostics,
    selectedPatchId: activeModPatchId,
    setSelectedPatchId: setActiveModPatchId,
    selectedPatch: activeModPatch,
    patchWhenError: modPatchWhenError,
    statusMessage: modStatusMessage,
    hasUnsavedChanges: modHasUnsavedChanges,
    canPersist: modCanPersist,
    lastSaveResult: modLastSaveResult,
    contentPatcherSnapshot,
    contentPatcherSimulation,
    contentPatcherResultAsset,
    contentPatcherResultLoading,
    contentPatcherResultError,
    simulationContext,
    navigatorMode,
    setNavigatorMode,
    selectedTargetPath,
    setSelectedTargetPath,
    scaleUpEditor,
    handleSelectProject: handleSelectModProject,
    handleImportProject: handleImportModProject,
    handleRefreshProjects: handleRefreshModProjects,
    handleManifestFieldChange: handleModManifestFieldChange,
    handleManifestTextChange: handleModManifestTextChange,
    handleContentTextChange: handleModContentTextChange,
    handleAddPatch: handleAddModPatch,
    handleRemoveSelectedPatch: handleRemoveModPatch,
    handlePatchFieldChange: handleModPatchFieldChange,
    handlePatchWhenChange: handleModPatchWhenChange,
    handleSaveProject: handleSaveModProject,
    handleExportProject: handleExportModProject,
    handleSimulationContextChange,
    handleOpenScaleUpEditor,
    handleCloseScaleUpEditor,
    handleScaleUpContentChange,
  } = useModWorkspace({
    directoryInfo,
    locale,
  })

  const moduleBlueprint = workspaceMode === 'map' || workspaceMode === 'events' || workspaceMode === 'mods' ? undefined : copy.moduleBlueprints[workspaceMode]
  const settingsMenuCopy = getSettingsMenuCopy(locale)
  const localeOptions =
    locale === 'en-US'
      ? [
          { id: 'en-US' as const, label: settingsMenuCopy.localeLabels['en-US'] },
          { id: 'zh-CN' as const, label: settingsMenuCopy.localeLabels['zh-CN'] },
        ]
      : [
          { id: 'zh-CN' as const, label: settingsMenuCopy.localeLabels['zh-CN'] },
          { id: 'en-US' as const, label: settingsMenuCopy.localeLabels['en-US'] },
        ]
  const activeAccentPreset = ACCENT_PRESETS.find((preset) => preset.id === accentPresetId) ?? ACCENT_PRESETS[0]
  const activeAssetName = mapDocument?.name ?? activeAsset?.name
  const launcherSettingsWarningLabel = copy.launcher.states.settingsIncomplete
  const availableLauncherPages: LauncherPage[] = debugEnabled
    ? launcherPages
    : launcherPages.filter((page): page is Exclude<LauncherPage, 'debug'> => page !== 'debug')
  const activeLauncherPage: LauncherPage = !debugEnabled && launcherPage === 'debug' ? 'library' : launcherPage
  const activePlayerAppearanceProfile =
    playerAppearanceProfiles.find((profile) => profile.id === activePlayerAppearanceProfileId) ?? playerAppearanceProfiles[0] ?? null
  const needsInitialization = !directoryInfo
  const interactionLocked = resourcePreloadState.active
  const showProjectOverlay = (needsInitialization || projectOverlayOpen) && !interactionLocked
  const currentWorkspaceStatus = useMemo(() => {
    if (workspaceMode === 'events') {
      return {
        tone: directoryInfo ? (eventAssets.length ? 'ready' : eventStatusMessage ? 'error' : 'idle') : 'idle',
        message: eventStatusMessage,
      } as const
    }

    if (workspaceMode === 'characters') {
      return {
        tone: directoryInfo ? (characters.length ? 'ready' : characterStatusMessage ? 'error' : 'idle') : 'idle',
        message: characterStatusMessage,
      } as const
    }

    if (workspaceMode === 'buildings') {
      const buildingBrowserCount = constructibleGroups.length + worldBuildings.length
      return {
        tone: directoryInfo ? (buildingBrowserCount ? 'ready' : buildingStatusMessage ? 'error' : 'idle') : 'idle',
        message: buildingStatusMessage,
      } as const
    }

    if (workspaceMode === 'items') {
      return {
        tone: directoryInfo ? (items.length ? 'ready' : itemStatusMessage ? 'error' : 'idle') : 'idle',
        message: itemStatusMessage,
      } as const
    }

    if (workspaceMode === 'mods') {
      const hasModErrors = modDiagnostics.some((diagnostic) => diagnostic.severity === 'error')
      return {
        tone: directoryInfo
          ? hasModErrors
            ? 'error'
            : modHasUnsavedChanges
              ? 'working'
              : modProjects.length || activeModProjectDetail
                ? 'ready'
                : 'idle'
          : 'idle',
        message: modStatusMessage,
      } as const
    }

    return workspaceStatus
  }, [
    buildingStatusMessage,
    constructibleGroups.length,
    characterStatusMessage,
    characters.length,
    directoryInfo,
    eventAssets.length,
    eventStatusMessage,
    itemStatusMessage,
    items.length,
    modDiagnostics,
    modHasUnsavedChanges,
    modProjects.length,
    modStatusMessage,
    activeModProjectDetail,
    worldBuildings.length,
    workspaceMode,
    workspaceStatus,
  ])

  useEffect(() => {
    if (!resourcePreloadState.active) {
      dismissNotification(RESOURCE_PRELOAD_NOTIFICATION_ID)
      return
    }

    publishNotification({
      id: RESOURCE_PRELOAD_NOTIFICATION_ID,
      level: 'info',
      title: resourcePreloadState.message || copy.messages.preloadingResources,
      description: resourcePreloadState.currentLabel || null,
      autoDismissMs: null,
      progress: getResourcePreloadProgress(resourcePreloadState),
    })
  }, [
    copy.messages.preloadingResources,
    resourcePreloadState,
  ])

  useEffect(() => () => dismissNotification(RESOURCE_PRELOAD_NOTIFICATION_ID), [])

  const recentGameDirectories = useMemo(() => {
    const currentRoot = directoryInfo?.rootPath
    if (!currentRoot) {
      return storedRecentGameDirectories
    }

    return [currentRoot, ...storedRecentGameDirectories.filter((path) => path !== currentRoot)].slice(0, 6)
  }, [directoryInfo?.rootPath, storedRecentGameDirectories])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.lang = locale
  }, [locale, theme])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
      // Ignore blocked localStorage writes to keep locale changes functional in-memory.
    }
  }, [locale])

  useEffect(() => {
    persistAppShellState({
      appMode,
      launcherPage: appMode === 'workbench' ? launcherPage : 'library',
      debugEnabled,
      notificationSoundEnabled,
    })
  }, [appMode, debugEnabled, launcherPage, notificationSoundEnabled])

  useEffect(() => {
    if (!debugEnabled && launcherPage === 'debug') {
      setLauncherPage('library')
    }
  }, [debugEnabled, launcherPage])

  useEffect(() => {
    void syncDebugDiagnosticsEnabled(debugEnabled)
  }, [debugEnabled])

  useEffect(() => {
    setNotificationSoundEnabled(notificationSoundEnabled)
  }, [notificationSoundEnabled])

  useEffect(() => {
    const previousLocale = previousLocaleRef.current
    if (previousLocale === locale) {
      return
    }

    clearDesktopLocaleCache(previousLocale)
    clearLocalizedStageMetadataCache(previousLocale)
    clearImageMetricsLocaleCache(previousLocale)
    clearMapViewportLocaleCache(previousLocale)
    previousLocaleRef.current = locale
  }, [locale])

  useEffect(() => {
    if (workspaceMode !== 'events' || !currentEventCommandId) {
      return
    }

    workspaceLayoutRef.current?.setPanelVisibility('diagnostics', true)
  }, [currentEventCommandId, workspaceMode])

  useEffect(() => {
    const root = document.documentElement
    const accent = activeAccentPreset.color
    const accentSoft = rgbaFromHex(accent, theme === 'dark' ? 0.18 : 0.14)
    const activeSurface = theme === 'dark' ? rgbaFromHex(accent, 0.22) : rgbaFromHex(accent, 0.12)

    root.style.setProperty('--color-accent', accent)
    root.style.setProperty('--accent', accent)
    root.style.setProperty('--accent-soft', accentSoft)
    root.style.setProperty('--surface-active', activeSurface)
    root.style.setProperty('--bg-active', activeSurface)
    window.localStorage.setItem(ACCENT_STORAGE_KEY, activeAccentPreset.id)
  }, [activeAccentPreset.color, activeAccentPreset.id, theme])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(RECENT_GAME_DIRECTORIES_STORAGE_KEY, JSON.stringify(recentGameDirectories))
  }, [recentGameDirectories])

  useEffect(() => {
    if (!desktopHost) {
      return
    }

    let disposed = false

    void listKnownGameDirectories()
      .then((paths) => {
        if (!disposed) {
          setKnownGameDirectories(paths)
        }
      })
      .catch(() => {
        if (!disposed) {
          setKnownGameDirectories([])
        }
      })

    return () => {
      disposed = true
    }
  }, [desktopHost])

  useEffect(() => {
    if (!desktopHost) {
      return
    }

    let disposed = false

    void isCurrentWindowFullscreen()
      .then((fullscreen) => {
        if (!disposed) {
          setWindowIsFullscreen(fullscreen)
        }
      })
      .catch(() => {
        if (!disposed) {
          setWindowIsFullscreen(false)
        }
      })

    return () => {
      disposed = true
    }
  }, [desktopHost, settingsWindowOpen])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(PLAYER_APPEARANCE_PROFILES_STORAGE_KEY, JSON.stringify(playerAppearanceProfiles))
    if (activePlayerAppearanceProfileId) {
      window.localStorage.setItem(PLAYER_APPEARANCE_ACTIVE_PROFILE_STORAGE_KEY, activePlayerAppearanceProfileId)
    } else {
      window.localStorage.removeItem(PLAYER_APPEARANCE_ACTIVE_PROFILE_STORAGE_KEY)
    }
  }, [activePlayerAppearanceProfileId, playerAppearanceProfiles])

  const openAppearanceWindow = useCallback(() => {
    setPlayerAppearanceWindowNonce((current) => current + 1)
    setPlayerAppearanceWindowOpen(true)
  }, [])

  const handleCreatePlayerAppearanceProfile = useCallback(() => {
    const nextProfile = createDefaultPlayerAppearanceProfile(locale === 'zh-CN' ? `鐜╁ ${playerAppearanceProfiles.length + 1}` : `Player ${playerAppearanceProfiles.length + 1}`)
    setPlayerAppearanceProfiles((current) => [...current, nextProfile])
    setActivePlayerAppearanceProfileId(nextProfile.id)
    openAppearanceWindow()
  }, [locale, openAppearanceWindow, playerAppearanceProfiles.length])

  const handleDuplicatePlayerAppearanceProfile = useCallback(() => {
    if (!activePlayerAppearanceProfile) {
      return
    }

    const nextProfile = clonePlayerAppearanceProfile(activePlayerAppearanceProfile)
    setPlayerAppearanceProfiles((current) => [...current, nextProfile])
    setActivePlayerAppearanceProfileId(nextProfile.id)
  }, [activePlayerAppearanceProfile])

  const handleDeletePlayerAppearanceProfile = useCallback(() => {
    if (!activePlayerAppearanceProfile) {
      return
    }

    const remainingProfiles = playerAppearanceProfiles.filter((profile) => profile.id !== activePlayerAppearanceProfile.id)
    if (remainingProfiles.length === 0) {
      const fallback = createDefaultPlayerAppearanceProfile(locale === 'zh-CN' ? '榛樿鐜╁' : 'Default Player')
      setPlayerAppearanceProfiles([fallback])
      setActivePlayerAppearanceProfileId(fallback.id)
      return
    }

    setPlayerAppearanceProfiles(remainingProfiles)
    setActivePlayerAppearanceProfileId(remainingProfiles[0]?.id ?? null)
  }, [activePlayerAppearanceProfile, locale, playerAppearanceProfiles])

  const handleChangePlayerAppearanceProfile = useCallback((nextProfile: Parameters<typeof sanitizePlayerAppearanceProfile>[0]) => {
    const sanitized = sanitizePlayerAppearanceProfile(nextProfile)
    setPlayerAppearanceProfiles((current) => current.map((profile) => (profile.id === sanitized.id ? sanitized : profile)))
  }, [])

  const handleImportPlayerAppearanceProfile = useCallback(
    (nextProfile: PlayerAppearanceProfile) => {
      const sanitized = sanitizePlayerAppearanceProfile(nextProfile)
      setPlayerAppearanceProfiles((current) => [...current, sanitized])
      setActivePlayerAppearanceProfileId(sanitized.id)
      openAppearanceWindow()
    },
    [openAppearanceWindow],
  )

  const handleToggleBorderlessFullscreen = useCallback(async () => {
    const nextFullscreen = await toggleFullscreenCurrentWindow()
    setWindowIsFullscreen(nextFullscreen)
  }, [])

  const workspacePanels = buildWorkspacePanels({
    copy,
    locale,
    workspaceMode,
    directoryInfo,
    mapAssets,
    filteredAssets,
    mapBrowserSourceMode,
    onMapBrowserSourceModeChange: setMapBrowserSourceMode,
    modMapGroups,
    activeModMapSelectionId,
    activeMapModSources,
    activeMapId,
    activeAssetName,
    assetFilter,
    onAssetFilterChange: setAssetFilter,
    onOpenAsset: (asset) => {
      void openMap(asset)
    },
    onOpenModAsset: handleOpenModMapAsset,
    workspaceTabs,
    activeTabId,
    onSelectWorkspaceTab: handleSelectWorkspaceTab,
    onCloseWorkspaceTab: handleCloseWorkspaceTab,
    onReorderWorkspaceTabs: handleReorderWorkspaceTabs,
    mapDocument,
    worldAtlasViews,
    activeWorldAtlasViewId,
    onSelectWorldAtlasView: handleSelectWorldAtlasView,
    onOpenAtlasTarget: handleOpenAtlasTarget,
    theme,
    accentColor: activeAccentPreset.color,
    visibleLayerIds,
    onToggleLayer: toggleLayer,
    onShowAllLayers: () => setAllLayers(true),
    onHideAllLayers: () => setAllLayers(false),
    visibleObjectGroupIds,
    onToggleObjectGroup: toggleObjectGroup,
    onShowAllObjectGroups: () => setAllObjectGroups(true),
    onHideAllObjectGroups: () => setAllObjectGroups(false),
    focusedObjectTarget,
    showGameWorldAdditions,
    onToggleGameWorldAdditions: () => setShowGameWorldAdditions((current) => !current),
    worldOverlaySprites,
    worldOverlayTextureAssets,
    onFocusObject: focusObject,
    onHoverChange: setHoverInfo,
    workspaceStatus: currentWorkspaceStatus,
    moduleBlueprint,
    eventAssets,
    filteredEventAssets,
    eventBrowserSourceMode,
    onEventBrowserSourceModeChange: setEventBrowserSourceMode,
    modEventGroups,
    activeModEventSelectionId,
    activeEventModSources,
    activeEventAssetId,
    eventAssetFilter,
    onEventAssetFilterChange: setEventAssetFilter,
    onOpenEventAsset: handleOpenEventAsset,
    onOpenModEventAsset: handleOpenModEventAsset,
    parsedEventAsset,
    selectedEventKey,
    selectedEvent,
    selectedTimelineEntryId,
    timelineJumpRequestId,
    currentEventCommandId,
    eventStatusMessage,
    onSelectEvent: handleSelectEvent,
    onSelectTimelineEntry: setSelectedTimelineEntryId,
    onActivateTimelineEntry: requestTimelineJump,
    onTimelineJumpHandled: clearTimelineJumpRequest,
    onPlaybackCommandChange: setCurrentEventCommandId,
    activePlayerAppearanceProfile,
    onOpenPlayerAppearanceWindow: openAppearanceWindow,
    characters,
    filteredCharacters,
    characterBrowserSourceMode,
    onCharacterBrowserSourceModeChange: setCharacterBrowserSourceMode,
    modCharacterGroups,
    activeModCharacterSelectionId,
    activeCharacterModSources,
    activeCharacterId,
    activeCharacter,
    activeCharacterVariant,
    characterFilter,
    characterStatusMessage,
    activeCharacterAssetState,
    onCharacterFilterChange: setCharacterFilter,
    onSelectCharacter: handleSelectCharacter,
    onSelectModCharacter: handleSelectModCharacter,
    onSelectCharacterVariant: handleSelectCharacterVariant,
    constructibleGroups,
    filteredConstructibleGroups,
    worldBuildings,
    filteredWorldBuildings,
    buildingBrowserSourceMode,
    onBuildingBrowserSourceModeChange: setBuildingBrowserSourceMode,
    modBuildingGroups,
    activeModBuildingSelectionId,
    activeBuildingModSources,
    activeBuildingId,
    activeBuilding,
    activeUpgradeChain,
    buildingFilter,
    buildingStatusMessage,
    activeBuildingTextureState,
    activeBuildingChainTextureStates,
    activeBuildingIndoorMapDocument,
    activeBuildingIndoorMapPath,
    activeBuildingIndoorMapMessage,
    activeBuildingExteriorMapDocument,
    activeBuildingExteriorMapPath,
    activeBuildingExteriorMapMessage,
    activeBuildingExteriorFocusPoint,
    buildingSpringObjectsState,
    onBuildingFilterChange: setBuildingFilter,
    onSelectBuilding: handleSelectBuilding,
    onSelectModBuilding: handleSelectModBuilding,
    items,
    filteredItems,
    itemBrowserSourceMode,
    onItemBrowserSourceModeChange: setItemBrowserSourceMode,
    modItemGroups,
    activeModItemSelectionId,
    activeItemModSources,
    activeItemId,
    activeItem,
    itemLookup,
    itemFilter,
    itemStatusMessage,
    itemTextureStatesByAssetName,
    ensureItemTextureAssetStates,
    onItemFilterChange: setItemFilter,
    onSelectItem: handleSelectItem,
    onSelectModItem: handleSelectModItem,
    modWorkspaceCopy,
    modPluginDefinition,
    modProjects,
    filteredModProjects,
    activeProjectPath,
    activeProject: activeProject ?? null,
    modFilter,
    contentPatcherOnly,
    compatibleOnly,
    onModFilterChange: setModFilter,
    onContentPatcherOnlyChange: setContentPatcherOnly,
    onCompatibleOnlyChange: setCompatibleOnly,
    onSelectModProject: handleSelectModProject,
    onImportModProject: () => void handleImportModProject(),
    onRefreshModProjects: () => void handleRefreshModProjects(),
    activeModProjectDetail,
    modManifestEditor,
    modContentEditor,
    modContentSummary,
    modDiagnostics,
    activeModPatchId,
    onSelectModPatch: setActiveModPatchId,
    activeModPatch: activeModPatch ?? null,
    modPatchWhenError,
    modHasUnsavedChanges,
    modCanPersist,
    modStatusMessage,
    modLastSaveResult: modLastSaveResult ?? null,
    contentPatcherSnapshot,
    contentPatcherSimulation,
    contentPatcherResultAsset,
    contentPatcherResultLoading,
    contentPatcherResultError,
    simulationContext,
    navigatorMode,
    selectedTargetPath,
    onNavigatorModeChange: setNavigatorMode,
    scaleUpEditor,
    onModManifestFieldChange: handleModManifestFieldChange,
    onModManifestTextChange: handleModManifestTextChange,
    onModContentTextChange: handleModContentTextChange,
    onAddModPatch: handleAddModPatch,
    onRemoveModPatch: handleRemoveModPatch,
    onModPatchFieldChange: handleModPatchFieldChange,
    onModPatchWhenChange: handleModPatchWhenChange,
    onSaveModProject: () => void handleSaveModProject(),
    onExportModProject: () => void handleExportModProject(),
    onSimulationContextChange: handleSimulationContextChange,
    onSelectTarget: setSelectedTargetPath,
    onOpenScaleUp: handleOpenScaleUpEditor,
    onScaleUpContentChange: handleScaleUpContentChange,
    onCloseScaleUpEditor: handleCloseScaleUpEditor,
    heavyWorkspaceReady: deferredHeavyWorkspaceMode === workspaceMode,
  })

  const handleLayoutMetaChange = useCallback(
    ({ panelItems, presetNames }: { panelItems: typeof viewMenuPanelItems; presetNames: string[] }) => {
      setViewMenuPanelItems((current) => {
        if (
          current.length === panelItems.length &&
          current.every(
            (item, index) =>
              item.id === panelItems[index]?.id &&
              item.title === panelItems[index]?.title &&
              item.visible === panelItems[index]?.visible &&
              item.mode === panelItems[index]?.mode &&
              item.dock === panelItems[index]?.dock,
          )
        ) {
          return current
        }

        return panelItems
      })

      setViewMenuPresetNames((current) => {
        if (current.length === presetNames.length && current.every((name, index) => name === presetNames[index])) {
          return current
        }

        return presetNames
      })
    },
    [],
  )

  const handleAppModeChange = useCallback((nextMode: AppMode) => {
    setAppMode(nextMode)

    if (nextMode === 'launcher') {
      setProjectOverlayOpen(false)
    }
  }, [])

  const handleLauncherPageChange = useCallback((nextPage: LauncherPage) => {
    if (nextPage === 'debug' && !debugEnabled) {
      return
    }

    setLauncherPage(nextPage)
  }, [debugEnabled])

  const openSettingsWindow = useCallback((category: SettingsWindowCategory = 'appearance') => {
    setSettingsWindowCategory(category)
    setSettingsWindowOpen(true)
  }, [])

  const handleLaunchGame = useCallback(async () => {
    if (!desktopHost || launcherLaunchBusy) {
      return
    }

    if (!launcherRuntime.settingsState.settings.gamePath?.trim()) {
      setAppMode('launcher')
      openSettingsWindow('launcher')
      return
    }

    setLauncherLaunchBusy(true)

    try {
      await launchLauncherGame()
    } catch {
      setAppMode('launcher')
      openSettingsWindow('launcher')
    } finally {
      setLauncherLaunchBusy(false)
    }
  }, [desktopHost, launcherLaunchBusy, launcherRuntime.settingsState.settings.gamePath, openSettingsWindow])

  return (
    <LocaleProvider locale={locale}>
      <NotificationProvider>
        <div
          className="relative flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]"
          aria-busy={interactionLocked}
        >
          <TopMenuBar
            appMode={appMode}
            onAppModeChange={handleAppModeChange}
            workspaceMode={workspaceMode}
            onWorkspaceChange={setWorkspaceMode}
            theme={theme}
            onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            statusTone={currentWorkspaceStatus.tone}
            desktopHost={desktopHost}
            onMinimizeWindow={() => void minimizeCurrentWindow()}
            onToggleMaximizeWindow={() => void toggleMaximizeCurrentWindow()}
            onCloseWindow={() => void closeCurrentWindow()}
            viewMenu={{
              panelItems: viewMenuPanelItems,
              presetNames: viewMenuPresetNames,
              onTogglePanel: (id, visible) => workspaceLayoutRef.current?.setPanelVisibility(id, visible),
              onResetLayout: () => workspaceLayoutRef.current?.resetLayout(),
              onSavePreset: (name) => workspaceLayoutRef.current?.savePreset(name),
              onLoadPreset: (name) => workspaceLayoutRef.current?.loadPreset(name),
              onDeletePreset: (name) => workspaceLayoutRef.current?.deletePreset(name),
            }}
            settingsMenu={{
              onOpen: () => openSettingsWindow('appearance'),
            }}
            projectMenu={{
              highlighted: appMode === 'workbench' && showProjectOverlay,
              onOpen: () => {
                setAppMode('workbench')
                setProjectOverlayOpen(true)
              },
            }}
            launcherChrome={{
              page: activeLauncherPage,
              visiblePages: availableLauncherPages,
              onPageChange: handleLauncherPageChange,
              downloadsBadgeCount: launcherRuntime.downloadsBadgeCount,
              downloadsProgressPercent: launcherRuntime.downloadsProgressPercent,
              downloadsHasFailure: launcherRuntime.downloadsHasFailure,
              settingsWarning: launcherRuntime.settingsWarning,
              settingsWarningLabel: launcherSettingsWarningLabel,
              downloadsPopover: <LauncherDownloadsPopover downloads={launcherRuntime.downloads} />,
            }}
          />

          {settingsWindowOpen ? (
            <Suspense fallback={null}>
              <SettingsWindow
                open={settingsWindowOpen}
                title={settingsMenuCopy.title}
                categories={settingsMenuCopy.categories}
                categoryDescriptions={settingsMenuCopy.categoryDescriptions}
                accentLabel={settingsMenuCopy.accentLabel}
                resetAccentLabel={settingsMenuCopy.resetAccentLabel}
                accentDescription={settingsMenuCopy.accentDescription}
                languageLabel={settingsMenuCopy.languageLabel}
                languageDescription={settingsMenuCopy.languageDescription}
                localeOptions={localeOptions}
                activeLocale={locale}
                windowModeLabel={settingsMenuCopy.windowModeLabel}
                borderlessFullscreenLabel={settingsMenuCopy.borderlessFullscreenLabel}
                borderlessFullscreenDescription={settingsMenuCopy.borderlessFullscreenDescription}
                enableBorderlessFullscreenLabel={settingsMenuCopy.enableBorderlessFullscreenLabel}
                disableBorderlessFullscreenLabel={settingsMenuCopy.disableBorderlessFullscreenLabel}
                borderlessFullscreenEnabled={desktopHost ? windowIsFullscreen : false}
                debugModeLabel={settingsMenuCopy.debugModeLabel}
                debugModeDescription={settingsMenuCopy.debugModeDescription}
                enableDebugModeLabel={settingsMenuCopy.enableDebugModeLabel}
                disableDebugModeLabel={settingsMenuCopy.disableDebugModeLabel}
                debugModeEnabled={debugEnabled}
                notificationSoundLabel={settingsMenuCopy.notificationSoundLabel}
                notificationSoundDescription={settingsMenuCopy.notificationSoundDescription}
                enableNotificationSoundLabel={settingsMenuCopy.enableNotificationSoundLabel}
                disableNotificationSoundLabel={settingsMenuCopy.disableNotificationSoundLabel}
                notificationSoundEnabled={notificationSoundEnabled}
                launcherContent={<LauncherSettingsForm settingsState={launcherRuntime.settingsState} />}
                activeCategory={settingsWindowCategory}
                accentOptions={ACCENT_PRESETS}
                activeAccentId={activeAccentPreset.id}
                onSelectAccent={setAccentPresetId}
                onResetAccent={() => setAccentPresetId(ACCENT_PRESETS[0].id)}
                onSelectLocale={setLocale}
                onToggleBorderlessFullscreen={() => void handleToggleBorderlessFullscreen()}
                onToggleNotificationSound={() => setNotificationSoundEnabledState((current) => !current)}
                onToggleDebugMode={() => setDebugEnabled((current) => !current)}
                onActiveCategoryChange={setSettingsWindowCategory}
                onClose={() => setSettingsWindowOpen(false)}
              />
            </Suspense>
          ) : null}

          {playerAppearanceWindowOpen ? (
            <Suspense fallback={null}>
              <PlayerAppearanceWindow
                key={`player-appearance:${playerAppearanceWindowNonce}`}
                open={playerAppearanceWindowOpen}
                locale={locale}
                rootPath={directoryInfo?.rootPath ?? null}
                profiles={playerAppearanceProfiles}
                activeProfileId={activePlayerAppearanceProfileId}
                onSelectProfile={setActivePlayerAppearanceProfileId}
                onCreateProfile={handleCreatePlayerAppearanceProfile}
                onDuplicateProfile={handleDuplicatePlayerAppearanceProfile}
                onDeleteProfile={handleDeletePlayerAppearanceProfile}
                onImportProfile={handleImportPlayerAppearanceProfile}
                onChangeProfile={handleChangePlayerAppearanceProfile}
                onClose={() => setPlayerAppearanceWindowOpen(false)}
              />
            </Suspense>
          ) : null}

          <div className="min-h-0 flex-1 overflow-hidden">
            {appMode === 'workbench' ? (
              <WorkspaceLayout
                ref={workspaceLayoutRef}
                storageKey={`modforge:workspace-layout:${WORKSPACE_LAYOUT_VERSION}:${workspaceMode}`}
                panels={workspacePanels}
                onLayoutMetaChange={handleLayoutMetaChange}
              />
            ) : (
              <LauncherShell
                page={activeLauncherPage}
                debugEnabled={debugEnabled}
                onToggleDebugMode={() => setDebugEnabled((current) => !current)}
                settingsState={launcherRuntime.settingsState}
                downloads={launcherRuntime.downloads}
                onNavigateToSettings={() => openSettingsWindow('launcher')}
                launchGameLabel={copy.launcher.actions.launchGame}
                launchGameDisabled={!desktopHost || launcherLaunchBusy}
                launchGameBusy={launcherLaunchBusy}
                onLaunchGame={() => void handleLaunchGame()}
              />
            )}
          </div>

          {appMode === 'workbench' && showProjectOverlay ? (
            <InitializationOverlay
              desktopHost={desktopHost}
              gameDirectory={gameDirectory}
              detectedDirectories={knownGameDirectories}
              onGameDirectoryChange={setGameDirectory}
              onSelectDirectory={setGameDirectory}
              onChooseDirectory={() => void handleChooseDirectory()}
              onScanAndOpenTown={() => void handleScanAndOpenTown()}
              onClose={needsInitialization ? undefined : () => setProjectOverlayOpen(false)}
            />
          ) : null}

          {debugEnabled ? (
            <DevDebugOverlay
              workspaceMode={appMode === 'workbench' ? workspaceMode : 'launcher'}
              mapName={appMode === 'workbench' ? activeAssetName ?? worldAtlasDocument?.name ?? null : null}
              eventName={appMode === 'workbench' ? selectedEvent?.eventId ?? null : null}
              currentEventCommandId={appMode === 'workbench' ? currentEventCommandId : null}
              actorCount={appMode === 'workbench' ? (selectedEvent?.scene.actors.length ?? 0) : 0}
              contextSectionLabel={appMode === 'workbench' ? 'Workspace' : 'Launcher'}
              contextMetrics={
                appMode === 'launcher'
                  ? [
                      ['Page', copy.launcher.pages[activeLauncherPage]],
                      ['Settings', launcherRuntime.settingsState.state],
                      ['Queue', String(launcherRuntime.downloads.items.length)],
                      ['Active', String(launcherRuntime.downloads.counts.downloading)],
                      ['Ready', String(launcherRuntime.downloads.counts.readyToInstall)],
                    ]
                  : undefined
              }
            />
          ) : null}

            <StatusBar
            appMode={appMode}
            launcherPage={activeLauncherPage}
            workspaceMode={workspaceMode}
            workspaceStatus={currentWorkspaceStatus}
            directoryInfo={directoryInfo}
            mapAssets={mapAssets}
            activeAsset={activeAsset}
            mapDocument={mapDocument}
            pathLabel={mapDocument?.relativePath ?? activeAsset?.relativePath ?? worldAtlasDocument?.relativePath ?? copy.common.none}
            hoverInfo={hoverInfo}
          />

        </div>
      </NotificationProvider>
    </LocaleProvider>
  )
}









