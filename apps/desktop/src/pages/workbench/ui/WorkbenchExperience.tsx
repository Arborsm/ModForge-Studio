import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceLayoutHandle, WorkspacePanelMeta } from '@shared/contracts'
import {
  editorCopy,
  getWorldAtlasViewLabel,
  type AppMode,
  type LocaleCode,
  type ThemeMode,
  type WorkspaceMode,
} from '@locales/editor-shell'
import { localeBundles } from '@locales'
import { useEventWorkspace } from '../workspaces/event-stage'
import { useMapWorkspace } from '../workspaces/map'
import { useCharacterWorkspace } from '../workspaces/character'
import { useBuildingWorkspace } from '../workspaces/building/state/useBuildingWorkspace'
import { useItemWorkspace } from '../workspaces/item'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import { useModWorkspace } from '../workspaces/mod'
import type { ModI18nStatusFilter } from '../workspaces/mod-i18n'
import { useCpMaker, getEditModeRoute, buildStudioDeskModel } from '@features/cp-maker'
import { buildWorkspacePanels } from '../model/workspace-panels/buildWorkspacePanels'
import StatusBar from '@widgets/status-bar'
import TopMenuBar from '@widgets/top-navigation'
import '../model/builtInWorkspaces'
import { scheduleDeferred } from '@shared/lib/react'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'
import type { SettingsWindowCategory } from '@shared/contracts'
import { listKnownGameDirectories } from '@entities/game/api'
import type { AppEvent, PendingWorkbenchCommandIntent, WorkbenchViewRegistration } from '@shared/contracts'
import InitializationOverlay from './InitializationOverlay'
import { WorkbenchLayoutHost } from './WorkbenchLayoutHost'
import WorkbenchLaunchpadNavigation from './WorkbenchLaunchpadNavigation'
import { WorkbenchViewHost } from './WorkbenchViewHost'
import { useEditModeNavigation } from '../model/useEditModeNavigation'
import { usePlayerAppearanceState } from '../model/usePlayerAppearanceState'
import { useWorkspaceLayoutPersistence } from '../model/useWorkspaceLayoutPersistence'
import { useWorkbenchModeTransitions } from '../model/useWorkbenchModeTransitions'
import { useWorkbenchCommandIntent } from '../model/workbenchCommandIntent'
import { useWorkbenchStatus } from '../model/useWorkbenchStatus'
import { LoadingMotionFallback, LoadingMotionReveal } from '@shared/ui/loading-motion'

const PlayerAppearanceWindow = lazy(() => import('./PlayerAppearanceWindow'))
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
  pendingWorkbenchIntent: PendingWorkbenchCommandIntent | null
  onClearPendingIntent: () => void
  active: boolean
  appUiStateReady: boolean
  theme: ThemeMode
  locale: LocaleCode
  accentColor: string
  desktopHost: boolean
  onToggleTheme: () => void
  onSwitchToLauncher: () => void
  onOpenSettings: (category?: SettingsWindowCategory) => void
  onMinimizeWindow: () => void
  onToggleMaximizeWindow: () => void
  onCloseWindow: () => void
  onWorkbenchEvent: (event: AppEvent) => void
  getWorkbenchViewRegistration: (viewId: string) => WorkbenchViewRegistration | null
  workbenchViews?: readonly WorkbenchViewRegistration[]
  workbenchActivationKey?: number
}

export default function WorkbenchExperience({
  pendingWorkbenchIntent,
  onClearPendingIntent,
  active,
  appUiStateReady,
  theme,
  locale,
  accentColor,
  desktopHost,
  onToggleTheme,
  onSwitchToLauncher,
  onOpenSettings,
  onMinimizeWindow,
  onToggleMaximizeWindow,
  onCloseWindow,
  onWorkbenchEvent,
  getWorkbenchViewRegistration,
  workbenchViews = [],
  workbenchActivationKey = 0,
}: WorkbenchExperienceProps) {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('mods')
  const [workspaceViewMode, setWorkspaceViewMode] = useState<'edit' | 'preview'>('edit')
  const [deferredHeavyWorkspaceMode, setDeferredHeavyWorkspaceMode] = useState<WorkspaceMode | null>(null)
  const [knownGameDirectories, setKnownGameDirectories] = useState<string[]>([])
  const [projectOverlayOpen, setProjectOverlayOpen] = useState(false)
  const [closedWorkbenchLaunchpadKey, setClosedWorkbenchLaunchpadKey] = useState<number | null>(null)
  const [devWorkbenchViewId, setDevWorkbenchViewId] = useState<string | null>(null)
  const [modI18nSourceLocale, setModI18nSourceLocale] = useState('default')
  const [modI18nTargetLocale, setModI18nTargetLocale] = useState('zh-CN')
  const [modI18nQuery, setModI18nQuery] = useState('')
  const [modI18nStatusFilter, setModI18nStatusFilter] = useState<ModI18nStatusFilter>('all')
  const lastSelectedDraftKeyRef = useRef<string | null>(null)
  const { activeEditPatchId, navigateToPatch, goBack, goForward, resetNavigation, canGoBack, canGoForward } = useEditModeNavigation(
    workspaceViewMode === 'edit',
  )

  const { handleWorkspaceChange, handleWorkspaceViewModeChange } = useWorkbenchModeTransitions({
    workspaceViewMode,
    setWorkspaceMode,
    setWorkspaceViewMode,
    resetNavigation,
  })
  const [studioDeskGalleryOpen, setStudioDeskGalleryOpen] = useState(true)
  const [studioDeskCreateDialogOpenSignal, setStudioDeskCreateDialogOpenSignal] = useState(0)

  const storedRecentGameDirectories = getAppUiStateSnapshot()?.appearance.recentGameDirectories ?? []
  const [viewMenuPanelItems, setViewMenuPanelItems] = useState<WorkspacePanelMeta[]>([])
  const [viewMenuPresetNames, setViewMenuPresetNames] = useState<string[]>([])
  const [currentEventCommandId, setCurrentEventCommandId] = useState<string | null>(null)
  const [playerAppearanceWindowOpen, setPlayerAppearanceWindowOpen] = useState(false)
  const [playerAppearanceWindowNonce, setPlayerAppearanceWindowNonce] = useState(0)
  const workspaceLayoutRef = useRef<WorkspaceLayoutHandle | null>(null)
  const {
    playerAppearanceProfiles,
    activePlayerAppearanceProfileId,
    activePlayerAppearanceProfile,
    setActivePlayerAppearanceProfileId,
    handleCreatePlayerAppearanceProfile,
    handleDuplicatePlayerAppearanceProfile,
    handleDeletePlayerAppearanceProfile,
    handleImportPlayerAppearanceProfile,
    handleChangePlayerAppearanceProfile,
  } = usePlayerAppearanceState(appUiStateReady, locale)

  const copy = editorCopy[locale]
  const workbenchLaunchpadOpen = closedWorkbenchLaunchpadKey !== workbenchActivationKey
  const setWorkbenchLaunchpadOpen = useCallback(
    (open: boolean) => {
      setClosedWorkbenchLaunchpadKey(open ? null : workbenchActivationKey)
    },
    [workbenchActivationKey],
  )

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

  const { workspaceLayouts, workspaceLayoutStorageKey, handleWorkspacePersistStateChange } = useWorkspaceLayoutPersistence(
    appUiStateReady,
    workspaceMode,
  )

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
    i18nFiles: modI18nFiles,
    setI18nFiles: setModI18nFiles,
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

  const cpMaker = useCpMaker()
  const modI18nCopy = localeBundles[locale].modI18n
  useWorkbenchCommandIntent({
    pendingIntent: pendingWorkbenchIntent,
    cpMaker,
    setWorkspaceMode: (mode: string) => (setWorkspaceMode as (value: string) => void)(mode),
    setWorkspaceViewMode,
    navigateToPatch,
    clearPendingIntent: onClearPendingIntent,
  })

  const studioDeskModel = useMemo(
    () =>
      buildStudioDeskModel({
        activeDraft: cpMaker.activeDraft,
        drafts: cpMaker.drafts,
        patchCountByWorkspace: cpMaker.patchCountByWorkspace,
        dirtyPatchIds: cpMaker.dirtyPatchIds,
        isDirty: cpMaker.isDirty,
      }),
    [cpMaker.activeDraft, cpMaker.drafts, cpMaker.patchCountByWorkspace, cpMaker.dirtyPatchIds, cpMaker.isDirty],
  )
  const editModeRoute = devWorkbenchViewId ?? getEditModeRoute(workspaceMode, Boolean(cpMaker.activeDraft))
  const editModeView = getWorkbenchViewRegistration(editModeRoute)
  const devWorkbenchViews = useMemo(
    () =>
      import.meta.env.DEV
        ? workbenchViews
            .filter((view) => view.devOnly)
            .map((view) => ({
              ...view,
              active: view.viewId === devWorkbenchViewId,
            }))
            .slice()
            .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
        : [],
    [devWorkbenchViewId, workbenchViews],
  )

  const moduleBlueprint =
    workspaceMode === 'map' || workspaceMode === 'events' || workspaceMode === 'mods' || workspaceMode === 'mod-i18n'
      ? undefined
      : copy.moduleBlueprints[workspaceMode]
  const activeAssetName = mapDocument?.name ?? activeAsset?.name
  const needsInitialization = !directoryInfo
  const interactionLocked = resourcePreloadState.active
  const showProjectOverlay = !devWorkbenchViewId && (needsInitialization || projectOverlayOpen) && !interactionLocked

  const { currentWorkspaceStatus, recentGameDirectories, resourcePreloadProgress } = useWorkbenchStatus({
    workspaceMode,
    directoryInfoPresent: Boolean(directoryInfo),
    workspaceStatus,
    eventCount: eventAssets.length,
    eventStatusMessage,
    characterCount: characters.length,
    characterStatusMessage,
    buildingBrowserCount: constructibleGroups.length + worldBuildings.length,
    buildingStatusMessage,
    itemCount: items.length,
    itemStatusMessage,
    modDiagnostics,
    modHasUnsavedChanges,
    modProjectsCount: modProjects.length,
    activeModProjectDetail,
    modStatusMessage,
    resourcePreloadState,
    storedRecentGameDirectories,
    currentRootPath: directoryInfo?.rootPath ?? null,
  })

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
      progress: resourcePreloadProgress,
    })
  }, [copy.messages.preloadingResources, resourcePreloadProgress, resourcePreloadState])

  useEffect(() => () => dismissNotification(RESOURCE_PRELOAD_NOTIFICATION_ID), [])

  useEffect(() => {
    const draftKey = cpMaker.activeDraft?.draftStorageKey ?? null
    if (!draftKey) {
      lastSelectedDraftKeyRef.current = null
      return
    }

    if (lastSelectedDraftKeyRef.current === draftKey) {
      return
    }

    lastSelectedDraftKeyRef.current = draftKey
    onWorkbenchEvent({
      type: 'cp-maker/draft-selected',
      draftKey,
    })
  }, [cpMaker.activeDraft?.draftStorageKey, onWorkbenchEvent])

  useEffect(() => {
    if (workspaceMode !== 'events' || !currentEventCommandId) {
      return
    }

    workspaceLayoutRef.current?.setPanelVisibility('diagnostics', true)
  }, [currentEventCommandId, workspaceMode])

  useEffect(() => {
    resetNavigation()
  }, [resetNavigation, workspaceMode])

  const modI18nLocales = useMemo(() => modI18nFiles.map((file) => file.locale), [modI18nFiles])
  const normalizedModI18nSourceLocale = modI18nLocales.includes(modI18nSourceLocale)
    ? modI18nSourceLocale
    : modI18nLocales.includes('default')
      ? 'default'
      : (modI18nLocales[0] ?? 'default')
  const normalizedModI18nTargetLocale = modI18nLocales.includes(modI18nTargetLocale)
    ? modI18nTargetLocale
    : (modI18nLocales.find((candidate) => candidate !== normalizedModI18nSourceLocale) ?? normalizedModI18nSourceLocale)

  const handleModI18nSourceLocaleChange = useCallback((nextLocale: string) => {
    setModI18nSourceLocale(nextLocale)
  }, [])
  const handleModI18nTargetLocaleChange = useCallback((nextLocale: string) => {
    setModI18nTargetLocale(nextLocale)
  }, [])

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
  const [stageSeek, setStageSeek] = useState<((entryId: string) => void) | null>(null)
  const registerStageSeek = useCallback((seekTimelineEntry: (entryId: string) => void) => {
    setStageSeek(() => seekTimelineEntry)
    return () => setStageSeek(null)
  }, [])
  const handleActivateTimelineEntry = useCallback(
    (entryId: string) => {
      stageSeek?.(entryId)
    },
    [stageSeek],
  )

  const workspacePanels = buildWorkspacePanels({
    copy,
    locale,
    workspaceMode,
    gameRootPath: directoryInfo?.rootPath ?? null,
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
    onOpenAsset: (asset) => void openMap(asset),
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
    currentEventCommandId,
    eventStatusMessage,
    onSelectEvent: handleSelectEvent,
    onSelectTimelineEntry: setSelectedTimelineEntryId,
    onActivateTimelineEntry: handleActivateTimelineEntry,
    onPlaybackCommandChange: setCurrentEventCommandId,
    onStageSeekReady: registerStageSeek,
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
    modI18nCopy,
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
    modI18nFiles,
    modI18nSourceLocale: normalizedModI18nSourceLocale,
    modI18nTargetLocale: normalizedModI18nTargetLocale,
    modI18nQuery,
    modI18nStatusFilter,
    onModI18nSourceLocaleChange: handleModI18nSourceLocaleChange,
    onModI18nTargetLocaleChange: handleModI18nTargetLocaleChange,
    onModI18nQueryChange: setModI18nQuery,
    onModI18nStatusFilterChange: setModI18nStatusFilter,
    onModI18nFilesChange: setModI18nFiles,
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

  const handleLayoutMetaChange = useCallback(({ panelItems, presetNames }: { panelItems: WorkspacePanelMeta[]; presetNames: string[] }) => {
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
  }, [])

  const handleAppModeChange = useCallback(
    (nextMode: AppMode) => {
      if (nextMode === 'launcher') {
        onSwitchToLauncher()
      }
    },
    [onSwitchToLauncher],
  )

  const handleOpenRootWorkspace = useCallback(
    (mode: WorkspaceMode) => {
      setDevWorkbenchViewId(null)
      if (mode === 'mods') {
        handleWorkspaceChange(mode)
        return
      }

      setWorkspaceViewMode('preview')
      setWorkspaceMode(mode)
    },
    [handleWorkspaceChange],
  )

  const handleOpenProjectWorkspace = useCallback(
    (mode: WorkspaceMode) => {
      setDevWorkbenchViewId(null)
      setWorkspaceViewMode('edit')
      setWorkspaceMode(mode)
      resetNavigation()
    },
    [resetNavigation],
  )

  const handleOpenProjectPage = useCallback(() => {
    setDevWorkbenchViewId(null)
    setWorkspaceMode('mods')
    setWorkspaceViewMode('edit')
    setStudioDeskGalleryOpen(false)
    resetNavigation()
  }, [resetNavigation])

  const handleOpenProjectManagement = useCallback(() => {
    setDevWorkbenchViewId(null)
    setWorkspaceMode('mods')
    setWorkspaceViewMode('edit')
    setStudioDeskGalleryOpen(true)
    resetNavigation()
  }, [resetNavigation])

  const handleOpenProjectCreate = useCallback(() => {
    handleOpenProjectManagement()
    setStudioDeskCreateDialogOpenSignal((current) => current + 1)
  }, [handleOpenProjectManagement])

  const handleSelectProjectForLaunchpad = useCallback(
    (draftStorageKey: string) => {
      void cpMaker.loadDraft(draftStorageKey)
      onWorkbenchEvent({
        type: 'cp-maker/draft-selected',
        draftKey: draftStorageKey,
      })
    },
    [cpMaker, onWorkbenchEvent],
  )

  const workbenchQuickDock = (
    <WorkbenchLaunchpadNavigation
      open={workbenchLaunchpadOpen}
      workspaceMode={workspaceMode}
      workspaceViewMode={workspaceViewMode}
      dockPlacement="titlebar"
      hasActiveProject={Boolean(cpMaker.activeDraft)}
      projectSummaries={cpMaker.drafts}
      devViews={devWorkbenchViews}
      onOpenChange={setWorkbenchLaunchpadOpen}
      onRootWorkspaceOpen={handleOpenRootWorkspace}
      onProjectWorkspaceOpen={(mode) => {
        if (mode === 'mods') {
          handleOpenProjectPage()
          return
        }

        handleOpenProjectWorkspace(mode)
      }}
      onDevViewOpen={(viewId) => {
        setDevWorkbenchViewId(viewId)
        setWorkspaceViewMode('edit')
        setWorkbenchLaunchpadOpen(false)
        resetNavigation()
      }}
      onProjectManagementOpen={handleOpenProjectManagement}
      onProjectCreateOpen={handleOpenProjectCreate}
      onProjectSelect={handleSelectProjectForLaunchpad}
    />
  )

  return (
    <div className={active ? 'flex h-full flex-col' : 'hidden'} aria-busy={interactionLocked} aria-hidden={!active}>
      <TopMenuBar
        appMode="workbench"
        onAppModeChange={handleAppModeChange}
        workspaceMode={workspaceMode}
        onWorkspaceChange={handleWorkspaceChange}
        workspaceNavigationDisabled={workspaceViewMode === 'edit' && !cpMaker.activeDraft}
        workspaceViewMode={workspaceViewMode}
        onWorkspaceViewModeChange={handleWorkspaceViewModeChange}
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
        workbenchQuickDock={workbenchQuickDock}
      />

      {playerAppearanceWindowOpen ? (
        <Suspense fallback={<LoadingMotionFallback />}>
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

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-0 min-h-0 overflow-hidden">
          {workspaceViewMode === 'preview' ? (
            <LoadingMotionReveal itemId="workbench-preview-mode" index={0} className="h-full min-h-0">
              <WorkbenchLayoutHost
                workspaceLayoutRef={workspaceLayoutRef}
                workspaceLayoutStorageKey={workspaceLayoutStorageKey}
                workspaceLayouts={workspaceLayouts}
                workspacePanels={workspacePanels}
                onPersistStateChange={handleWorkspacePersistStateChange}
                onLayoutMetaChange={handleLayoutMetaChange}
              />
            </LoadingMotionReveal>
          ) : (
            <LoadingMotionReveal itemId="workbench-project-mode" index={0} className="h-full min-h-0">
              <WorkbenchViewHost
                editModeView={editModeView}
                workspaceMode={workspaceMode}
                copy={copy}
                locale={locale}
                theme={theme}
                accentColor={accentColor}
                directoryInfo={directoryInfo}
                canGoBack={canGoBack}
                canGoForward={canGoForward}
                onGoBack={goBack}
                onGoForward={goForward}
                cpMaker={cpMaker}
                studioDeskModel={studioDeskModel}
                onWorkbenchEvent={onWorkbenchEvent}
                navigateToPatch={navigateToPatch}
                onSetWorkspaceMode={setWorkspaceMode}
                onSetWorkspaceViewMode={setWorkspaceViewMode}
                studioDeskGalleryOpen={studioDeskGalleryOpen}
                onStudioDeskGalleryOpenChange={setStudioDeskGalleryOpen}
                studioDeskCreateDialogOpenSignal={studioDeskCreateDialogOpenSignal}
                activeEditPatchId={activeEditPatchId}
                playerAppearanceProfile={activePlayerAppearanceProfile}
                onOpenPlayerAppearanceWindow={openAppearanceWindow}
              />
            </LoadingMotionReveal>
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
          isModified={
            selectedEvent
              ? selectedEvent.rawScript !==
                (parsedEventAsset?.events.find((e) => e.key === selectedEvent.key)?.rawScript ?? selectedEvent.rawScript)
              : false
          }
        />
      ) : null}
    </div>
  )
}
