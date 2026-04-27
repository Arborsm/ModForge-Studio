import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DevDebugOverlay } from '../DevDebugOverlay'
import InitializationOverlay from '../InitializationOverlay'
import StatusBar from '../StatusBar'
import TopMenuBar from '../TopMenuBar'
import { WorkspaceLayout, type WorkspaceLayoutHandle, type WorkspacePanelMeta } from '../WorkspaceLayout'
import { listKnownGameDirectories } from '../../lib/desktop'
import {
  editorCopy,
  getWorldAtlasViewLabel,
  type AppMode,
  type LocaleCode,
  type ThemeMode,
  type ViewportLabels,
  type WorkspaceMode,
} from '../../lib/editor-shell'
import { WORKSPACE_LAYOUT_VERSION } from '../../lib/app/constants'
import type { PlayerAppearanceProfile } from '../../lib/app/playerAppearance'
import { useEventWorkspace } from '../../lib/app/useEventWorkspace'
import { useMapWorkspace } from '../../lib/app/useMapWorkspace'
import { useCharacterWorkspace } from '../../lib/app/useCharacterWorkspace'
import { useBuildingWorkspace } from '../../lib/app/useBuildingWorkspace'
import { useItemWorkspace } from '../../lib/app/useItemWorkspace'
import { dismissNotification, publishNotification } from '../../lib/app/notifications'
import useModWorkspace from '../../lib/app/useModWorkspace'
import { useGeneratedProject } from '../../lib/app/useGeneratedProject'
import { EditModeShell } from '../generated-project/EditModeShell'
import { StudioDesk } from '../generated-project/StudioDesk'
import { getEditModeRoute } from '../../lib/app/editModeRoute'
import { buildStudioDeskModel } from '../../lib/app/studioDeskModel'
import { buildWorkspacePanels } from '../../lib/app/workspacePanels'
import '../../lib/plugins/builtInWorkspaces'
import { scheduleDeferred } from '../../lib/react/defer'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '../../lib/app/uiState'
import type { SettingsWindowCategory } from '../SettingsWindow'
import type { ResourcePreloadState } from '../../lib/app/types'
import type { WorkspaceStoredState } from '../workspace/layoutTypes'

const PlayerAppearanceWindow = lazy(() => import('../PlayerAppearanceWindow'))
const WORKSPACE_LAYOUT_PERSIST_DEBOUNCE_MS = 180
const RESOURCE_PRELOAD_NOTIFICATION_ID = 'app-resource-preload'

type IdleDeadlineLike = {
  didTimeout: boolean
  timeRemaining: () => number
}

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: (deadline: IdleDeadlineLike) => void, options?: { timeout?: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

type WorkbenchExperienceProps = {
  active: boolean
  appUiStateReady: boolean
  theme: ThemeMode
  locale: LocaleCode
  accentColor: string
  debugEnabled: boolean
  desktopHost: boolean
  onToggleTheme: () => void
  onSwitchToLauncher: () => void
  onOpenSettings: (category?: SettingsWindowCategory) => void
  onMinimizeWindow: () => void
  onToggleMaximizeWindow: () => void
  onCloseWindow: () => void
  playerAppearanceProfiles: PlayerAppearanceProfile[]
  activePlayerAppearanceProfileId: string | null
  onSelectPlayerAppearanceProfile: (profileId: string | null) => void
  onCreatePlayerAppearanceProfile: () => void
  onDuplicatePlayerAppearanceProfile: () => void
  onDeletePlayerAppearanceProfile: () => void
  onImportPlayerAppearanceProfile: (profile: PlayerAppearanceProfile) => void
  onChangePlayerAppearanceProfile: (profile: PlayerAppearanceProfile) => void
}

function getResourcePreloadProgress(state: ResourcePreloadState) {
  if (state.total <= 0) {
    return 18
  }

  return Math.max(0, Math.min(100, (state.completed / state.total) * 100))
}

function normalizeWorkspaceLayouts(
  layouts: Record<string, Record<string, unknown>> | null | undefined,
): Record<string, WorkspaceStoredState> {
  const entries = Object.entries(layouts ?? {}).filter(
    ([key, value]) => key.trim().length > 0 && typeof value === 'object' && value !== null && !Array.isArray(value),
  )

  return Object.fromEntries(entries) as Record<string, WorkspaceStoredState>
}

function areWorkspaceStoredStatesEqual(
  left: WorkspaceStoredState | null | undefined,
  right: WorkspaceStoredState | null | undefined,
) {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return JSON.stringify(left) === JSON.stringify(right)
}

export default function WorkbenchExperience({
  active,
  appUiStateReady,
  theme,
  locale,
  accentColor,
  debugEnabled,
  desktopHost,
  onToggleTheme,
  onSwitchToLauncher,
  onOpenSettings,
  onMinimizeWindow,
  onToggleMaximizeWindow,
  onCloseWindow,
  playerAppearanceProfiles,
  activePlayerAppearanceProfileId,
  onSelectPlayerAppearanceProfile,
  onCreatePlayerAppearanceProfile,
  onDuplicatePlayerAppearanceProfile,
  onDeletePlayerAppearanceProfile,
  onImportPlayerAppearanceProfile,
  onChangePlayerAppearanceProfile,
}: WorkbenchExperienceProps) {
  const [initialAppUiState] = useState(() => getAppUiStateSnapshot())
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('mods')
  const [workspaceViewMode, setWorkspaceViewMode] = useState<'edit' | 'preview'>(() => {
    const saved = getAppUiStateSnapshot()?.workspace?.workspaceViewMode
    return saved === 'edit' || saved === 'preview' ? saved : 'edit'
  })
  const [deferredHeavyWorkspaceMode, setDeferredHeavyWorkspaceMode] = useState<WorkspaceMode | null>(null)
  const [knownGameDirectories, setKnownGameDirectories] = useState<string[]>([])
  const [projectOverlayOpen, setProjectOverlayOpen] = useState(false)
  const [activeEditPatchId, setActiveEditPatchId] = useState<string | null>(null)
  const [studioDeskGalleryOpen, setStudioDeskGalleryOpen] = useState(true)

  // ─── Edit Mode 导航历史栈 ───────────────────────────────────────────
  const [editNavHistory, setEditNavHistory] = useState<(string | '__LIST__')[]>(['__LIST__'])
  const [editNavIndex, setEditNavIndex] = useState(0)

  const navigateToPatch = useCallback((patchId: string | null) => {
    const entry = patchId ?? '__LIST__'
    setEditNavHistory((prev) => {
      const truncated = prev.slice(0, editNavIndex + 1)
      if (truncated.length >= 50) truncated.shift()
      return [...truncated, entry]
    })
    setEditNavIndex((prev) => Math.min(prev + 1, 49))
    setActiveEditPatchId(patchId)
  }, [editNavIndex])

  const goBack = useCallback(() => {
    setEditNavIndex((prev) => {
      if (prev <= 0) return prev
      const nextIndex = prev - 1
      const target = editNavHistory[nextIndex]
      setActiveEditPatchId(target === '__LIST__' ? null : target)
      return nextIndex
    })
  }, [editNavHistory])

  const goForward = useCallback(() => {
    setEditNavIndex((prev) => {
      if (prev >= editNavHistory.length - 1) return prev
      const nextIndex = prev + 1
      const target = editNavHistory[nextIndex]
      setActiveEditPatchId(target === '__LIST__' ? null : target)
      return nextIndex
    })
  }, [editNavHistory])

  const openStudioDeskRoute = useCallback(() => {
    setWorkspaceMode('mods')
    setWorkspaceViewMode('edit')
    setActiveEditPatchId(null)
    setEditNavHistory(['__LIST__'])
    setEditNavIndex(0)
  }, [])

  // 鼠标侧键导航（button 3=后退, 4=前进）
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (workspaceViewMode !== 'edit') return
      if (e.button === 3) {
        e.preventDefault()
        goBack()
      } else if (e.button === 4) {
        e.preventDefault()
        goForward()
      }
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [goBack, goForward, workspaceViewMode])

  // 切换 workspace 时重置 patch 选择和导航栈
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setActiveEditPatchId(null)
      setEditNavHistory(['__LIST__'])
      setEditNavIndex(0)
    })
    return () => {
      cancelled = true
    }
  }, [workspaceMode])

  const [storedRecentGameDirectories, setStoredRecentGameDirectories] = useState<string[]>(
    () => initialAppUiState?.appearance.recentGameDirectories ?? [],
  )
  const [viewMenuPanelItems, setViewMenuPanelItems] = useState<WorkspacePanelMeta[]>([])
  const [viewMenuPresetNames, setViewMenuPresetNames] = useState<string[]>([])
  const [currentEventCommandId, setCurrentEventCommandId] = useState<string | null>(null)
  const [playerAppearanceWindowOpen, setPlayerAppearanceWindowOpen] = useState(false)
  const [playerAppearanceWindowNonce, setPlayerAppearanceWindowNonce] = useState(0)
  const workspaceLayoutRef = useRef<WorkspaceLayoutHandle | null>(null)
  const [workspaceLayouts, setWorkspaceLayouts] = useState<Record<string, WorkspaceStoredState>>(
    () => normalizeWorkspaceLayouts(initialAppUiState?.workspace.layouts),
  )
  const workspaceLayoutsRef = useRef<Record<string, WorkspaceStoredState>>(workspaceLayouts)
  const pendingWorkspaceLayoutPatchesRef = useRef<Record<string, WorkspaceStoredState>>({})
  const workspaceLayoutPersistTimeoutRef = useRef<number | null>(null)
  const hydratedWorkspaceStateRef = useRef(false)

  const copy = editorCopy[locale]

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

  useEffect(() => {
    if (!appUiStateReady || hydratedWorkspaceStateRef.current) {
      return
    }

    const state = getAppUiStateSnapshot()
    const nextLayouts = normalizeWorkspaceLayouts(state.workspace.layouts)
    workspaceLayoutsRef.current = nextLayouts
    queueMicrotask(() => {
      setWorkspaceLayouts(nextLayouts)
      setStoredRecentGameDirectories(state.appearance.recentGameDirectories)
    })
    hydratedWorkspaceStateRef.current = true
  }, [appUiStateReady])

  const activePlayerAppearanceProfile =
    playerAppearanceProfiles.find((profile) => profile.id === activePlayerAppearanceProfileId) ?? playerAppearanceProfiles[0] ?? null

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

  const generatedProject = useGeneratedProject()
  const studioDeskModel = useMemo(
    () => buildStudioDeskModel({
      activeDraft: generatedProject.activeDraft,
      drafts: generatedProject.drafts,
      patchCountByWorkspace: generatedProject.patchCountByWorkspace,
      dirtyPatchIds: generatedProject.dirtyPatchIds,
      isDirty: generatedProject.isDirty,
    }),
    [
      generatedProject.activeDraft,
      generatedProject.drafts,
      generatedProject.patchCountByWorkspace,
      generatedProject.dirtyPatchIds,
      generatedProject.isDirty,
    ],
  )
  const editModeRoute = getEditModeRoute(workspaceMode, Boolean(generatedProject.activeDraft))

  const moduleBlueprint =
    workspaceMode === 'map' || workspaceMode === 'events' || workspaceMode === 'mods'
      ? undefined
      : copy.moduleBlueprints[workspaceMode]
  const activeAssetName = mapDocument?.name ?? activeAsset?.name
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
    activeModProjectDetail,
    buildingStatusMessage,
    characterStatusMessage,
    characters.length,
    constructibleGroups.length,
    directoryInfo,
    eventAssets.length,
    eventStatusMessage,
    itemStatusMessage,
    items.length,
    modDiagnostics,
    modHasUnsavedChanges,
    modProjects.length,
    modStatusMessage,
    workspaceMode,
    workspaceStatus,
    worldBuildings.length,
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
  }, [copy.messages.preloadingResources, resourcePreloadState])

  useEffect(() => () => dismissNotification(RESOURCE_PRELOAD_NOTIFICATION_ID), [])

  const recentGameDirectories = useMemo(() => {
    const currentRoot = directoryInfo?.rootPath
    if (!currentRoot) {
      return storedRecentGameDirectories
    }

    return [currentRoot, ...storedRecentGameDirectories.filter((path) => path !== currentRoot)].slice(0, 6)
  }, [directoryInfo?.rootPath, storedRecentGameDirectories])

  useEffect(() => {
    if (workspaceMode !== 'events' || !currentEventCommandId) {
      return
    }

    workspaceLayoutRef.current?.setPanelVisibility('diagnostics', true)
  }, [currentEventCommandId, workspaceMode])

  useEffect(() => {
    if (!appUiStateReady) {
      return
    }

    void applyAppUiStatePatch({
      appearance: {
        recentGameDirectories,
      },
    })
  }, [appUiStateReady, recentGameDirectories])

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

  const openAppearanceWindow = useCallback(() => {
    setPlayerAppearanceWindowNonce((current) => current + 1)
    setPlayerAppearanceWindowOpen(true)
  }, [])

  const workspaceLayoutStorageKey = useMemo(
    () => `modforge:workspace-layout:${WORKSPACE_LAYOUT_VERSION}:${workspaceMode}`,
    [workspaceMode],
  )

  const flushPendingWorkspaceLayoutPatches = useCallback(() => {
    if (workspaceLayoutPersistTimeoutRef.current !== null) {
      window.clearTimeout(workspaceLayoutPersistTimeoutRef.current)
      workspaceLayoutPersistTimeoutRef.current = null
    }

    if (!appUiStateReady) {
      return
    }

    const entries = Object.entries(pendingWorkspaceLayoutPatchesRef.current)
    if (!entries.length) {
      return
    }

    pendingWorkspaceLayoutPatchesRef.current = {}

    void applyAppUiStatePatch({
      workspace: {
        layouts: Object.fromEntries(
          entries.map(([storageKey, state]) => [storageKey, state as Record<string, unknown>]),
        ),
      },
    })
  }, [appUiStateReady])

  const scheduleWorkspaceLayoutPersist = useCallback(() => {
    if (!appUiStateReady) {
      return
    }

    if (workspaceLayoutPersistTimeoutRef.current !== null) {
      window.clearTimeout(workspaceLayoutPersistTimeoutRef.current)
    }

    workspaceLayoutPersistTimeoutRef.current = window.setTimeout(() => {
      flushPendingWorkspaceLayoutPatches()
    }, WORKSPACE_LAYOUT_PERSIST_DEBOUNCE_MS)
  }, [appUiStateReady, flushPendingWorkspaceLayoutPatches])

  useEffect(() => {
    if (!appUiStateReady || !Object.keys(pendingWorkspaceLayoutPatchesRef.current).length) {
      return
    }

    scheduleWorkspaceLayoutPersist()
  }, [appUiStateReady, scheduleWorkspaceLayoutPersist])

  useEffect(() => () => flushPendingWorkspaceLayoutPatches(), [flushPendingWorkspaceLayoutPatches])

  const handleWorkspacePersistStateChange = useCallback(
    (storageKey: string, nextState: WorkspaceStoredState) => {
      if (areWorkspaceStoredStatesEqual(workspaceLayoutsRef.current[storageKey], nextState)) {
        return
      }

      workspaceLayoutsRef.current[storageKey] = nextState
      setWorkspaceLayouts((current) => ({ ...current, [storageKey]: nextState }))
      pendingWorkspaceLayoutPatchesRef.current[storageKey] = nextState
      scheduleWorkspaceLayoutPersist()
    },
    [scheduleWorkspaceLayoutPersist],
  )

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
    accentColor,
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
    ({ panelItems, presetNames }: { panelItems: WorkspacePanelMeta[]; presetNames: string[] }) => {
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

  const handleAppModeChange = useCallback(
    (nextMode: AppMode) => {
      if (nextMode === 'launcher') {
        onSwitchToLauncher()
      }
    },
    [onSwitchToLauncher],
  )

  return (
    <div className={active ? 'flex h-full flex-col' : 'hidden'} aria-busy={interactionLocked} aria-hidden={!active}>
      <TopMenuBar
          appMode="workbench"
          onAppModeChange={handleAppModeChange}
          workspaceMode={workspaceMode}
          onWorkspaceChange={(mode) => {
            if (mode === 'mods') {
              openStudioDeskRoute()
              return
            }
            setWorkspaceMode(mode)
          }}
          workspaceViewMode={workspaceViewMode}
          onWorkspaceViewModeChange={(mode) => {
            if (mode === 'edit') {
              openStudioDeskRoute()
              void applyAppUiStatePatch({
                workspace: { workspaceViewMode: mode },
              })
              return
            }
            setWorkspaceViewMode(mode)
            void applyAppUiStatePatch({
              workspace: { workspaceViewMode: mode },
            })
          }}
          theme={theme}
          onToggleTheme={onToggleTheme}
          statusTone={currentWorkspaceStatus.tone}
          desktopHost={desktopHost}
          onMinimizeWindow={onMinimizeWindow}
          onToggleMaximizeWindow={onToggleMaximizeWindow}
          onCloseWindow={onCloseWindow}
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
            onOpen: () => onOpenSettings('appearance'),
          }}
          projectMenu={{
            highlighted: showProjectOverlay,
            onOpen: () => {
              setProjectOverlayOpen(true)
            },
          }}
        />

      {playerAppearanceWindowOpen ? (
        <Suspense fallback={null}>
          <PlayerAppearanceWindow
            key={`player-appearance:${playerAppearanceWindowNonce}`}
            open={playerAppearanceWindowOpen}
            locale={locale}
            rootPath={directoryInfo?.rootPath ?? null}
            profiles={playerAppearanceProfiles}
            activeProfileId={activePlayerAppearanceProfileId}
            onSelectProfile={onSelectPlayerAppearanceProfile}
            onCreateProfile={onCreatePlayerAppearanceProfile}
            onDuplicateProfile={onDuplicatePlayerAppearanceProfile}
            onDeleteProfile={onDeletePlayerAppearanceProfile}
            onImportProfile={onImportPlayerAppearanceProfile}
            onChangeProfile={onChangePlayerAppearanceProfile}
            onClose={() => setPlayerAppearanceWindowOpen(false)}
          />
        </Suspense>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-0 min-h-0 overflow-hidden">
          {workspaceViewMode === 'preview' ? (
            <WorkspaceLayout
              ref={workspaceLayoutRef}
              storageKey={workspaceLayoutStorageKey}
              panels={workspacePanels}
              persistedState={workspaceLayouts[workspaceLayoutStorageKey] ?? null}
              onPersistStateChange={handleWorkspacePersistStateChange}
              onLayoutMetaChange={handleLayoutMetaChange}
            />
          ) : editModeRoute === 'studio-desk' ? (
            <StudioDesk
              model={studioDeskModel}
              copy={copy}
              onCreateDraft={(metadata) => {
                void generatedProject.createDraft({
                  ...metadata,
                  gameRootPath: directoryInfo?.rootPath ?? null,
                })
              }}
              onCreatePatch={(action, nextWorkspace) => {
                if (!generatedProject.activeDraft) {
                  return
                }
                setWorkspaceMode(nextWorkspace)
                setWorkspaceViewMode('edit')
                const id = generatedProject.addPatch(nextWorkspace, '', action)
                navigateToPatch(id)
              }}
              onOpenWorkspace={(nextWorkspace) => {
                setWorkspaceMode(nextWorkspace)
                setWorkspaceViewMode('edit')
                navigateToPatch(null)
              }}
              onOpenPatch={(patchId) => {
                const patch = generatedProject.activeDraft?.patches.find((candidate) => candidate.id === patchId)
                if (!patch) {
                  return
                }
                setWorkspaceMode(patch.workspace)
                setWorkspaceViewMode('edit')
                navigateToPatch(patchId)
              }}
              onOpenDraft={(draftStorageKey) => {
                void generatedProject.loadDraft(draftStorageKey)
                setWorkspaceMode('mods')
                setWorkspaceViewMode('edit')
                navigateToPatch(null)
              }}
              onCopyDraft={(draftStorageKey) => {
                void generatedProject.copyDraft(draftStorageKey)
              }}
              onDeleteDraft={(draftStorageKey) => {
                void generatedProject.deleteDraft(draftStorageKey)
              }}
              onExportPack={async (outputPath) => {
                try {
                  const result = await generatedProject.exportPack(outputPath)
                  publishNotification({
                    id: 'studio-desk-export-success',
                    level: 'success',
                    title: copy.studioDesk.exportCenter,
                    description: result.output_path,
                    autoDismissMs: 5000,
                  })
                } catch (error) {
                  publishNotification({
                    id: 'studio-desk-export-error',
                    level: 'error',
                    title: copy.studioDesk.exportCenter,
                    description: error instanceof Error ? error.message : String(error),
                    autoDismissMs: 8000,
                  })
                  throw error
                }
              }}
              isLoading={generatedProject.draftLoading}
              galleryOpen={studioDeskGalleryOpen}
              onGalleryOpenChange={setStudioDeskGalleryOpen}
            />
          ) : (
            <EditWorkspaceContent
              workspaceMode={workspaceMode}
              generatedProject={generatedProject}
              activeEditPatchId={activeEditPatchId}
              onSelectPatch={navigateToPatch}
              locale={locale}
              theme={theme}
              accentColor={accentColor}
              viewportLabels={copy.viewportLabels}
              directoryInfo={directoryInfo}
              canGoBack={editNavIndex > 0}
              canGoForward={editNavIndex < editNavHistory.length - 1}
              onGoBack={goBack}
              onGoForward={goForward}
            />
          )}
        </div>
      </div>

      {showProjectOverlay ? (
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
          workspaceMode={workspaceMode}
          mapName={activeAssetName ?? worldAtlasDocument?.name ?? null}
          eventName={selectedEvent?.eventId ?? null}
          currentEventCommandId={currentEventCommandId}
          actorCount={selectedEvent?.scene.actors.length ?? 0}
          contextSectionLabel="Workspace"
          contextMetrics={[
            ['Draft', generatedProject.activeDraft?.projectMetadata.projectName ?? 'none'],
            ['Patches', String(generatedProject.activeDraft?.patches.length ?? 0)],
            ['View', workspaceViewMode],
          ]}
        />
      ) : null}

      {workspaceViewMode !== 'edit' ? (
        <StatusBar
          appMode="workbench"
          launcherPage="library"
          workspaceMode={workspaceMode}
          workspaceViewMode={workspaceViewMode}
          workspaceStatus={currentWorkspaceStatus}
          directoryInfo={directoryInfo}
          mapAssets={mapAssets}
          activeAsset={activeAsset}
          mapDocument={mapDocument}
          pathLabel={mapDocument?.relativePath ?? activeAsset?.relativePath ?? worldAtlasDocument?.relativePath ?? copy.common.none}
          hoverInfo={hoverInfo}
          eventName={selectedEvent?.eventId ?? null}
          eventPreconditions={selectedEvent?.preconditions}
          eventCommandCount={selectedEvent?.commands.length ?? 0}
          eventActorCount={selectedEvent?.scene.actors.length ?? 0}
          currentEventCommandId={currentEventCommandId}
          patchName={activeEditPatchId ?? null}
          scriptLength={selectedEvent?.rawScript.length}
          isModified={selectedEvent ? selectedEvent.rawScript !== (parsedEventAsset?.events.find((e) => e.key === selectedEvent.key)?.rawScript ?? selectedEvent.rawScript) : false}
        />
      ) : null}
    </div>
  )
}

// ─── Edit Workspace Content ────────────────────────────────────────────

import type { WorkspaceId } from '../../lib/plugins/workspaceRegistry'
import type { UseGeneratedProjectReturn } from '../../lib/app/useGeneratedProject'
import type { GameDirectoryInfo } from '../../lib/desktop'

type EditWorkspaceContentProps = {
  workspaceMode: WorkspaceId
  generatedProject: UseGeneratedProjectReturn
  activeEditPatchId: string | null
  onSelectPatch: (patchId: string | null) => void
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  viewportLabels: ViewportLabels
  directoryInfo?: GameDirectoryInfo | null
  canGoBack: boolean
  canGoForward: boolean
  onGoBack: () => void
  onGoForward: () => void
}

function EditWorkspaceContent({ workspaceMode, generatedProject, activeEditPatchId, onSelectPatch, locale, theme, accentColor, viewportLabels, directoryInfo, canGoBack, canGoForward, onGoBack, onGoForward }: EditWorkspaceContentProps) {
  const workspacePatches = generatedProject.getPatchesForWorkspace(workspaceMode)

  return (
    <EditModeShell
      workspaceId={workspaceMode}
      draft={generatedProject.activeDraft}
      patches={workspacePatches}
      activePatchId={activeEditPatchId}
      onSelectPatch={onSelectPatch}
      onPatchAdd={(action, target, fromFile) => {
        const id = generatedProject.addPatch(workspaceMode, target, action, fromFile)
        onSelectPatch(id)
      }}
      onPatchRemove={(id) => {
        generatedProject.removePatch(id)
        if (activeEditPatchId === id) {
          onSelectPatch(null)
        }
      }}
      onPatchUpdate={generatedProject.updatePatch}
      onConfigSchemaChange={(entries) => {
        for (const entry of generatedProject.configSchema) {
          generatedProject.removeConfigEntry(entry.key)
        }
        for (const entry of entries) {
          generatedProject.addConfigEntry(entry)
        }
      }}
      onSaveDraft={generatedProject.saveDraft}
      isDirty={generatedProject.isDirty}
      onAddVirtualAsset={generatedProject.addVirtualAsset}
      onRemoveVirtualAsset={generatedProject.removeVirtualAsset}
      gameRootPath={directoryInfo?.rootPath ?? null}
      directoryInfo={directoryInfo}
      locale={locale}
      theme={theme}
      accentColor={accentColor}
      viewportLabels={viewportLabels}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      onGoBack={onGoBack}
      onGoForward={onGoForward}
    />
  )
}
