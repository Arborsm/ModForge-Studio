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
import { useEventWorkspace } from '../workspaces/event-stage'
import { useMapWorkspace } from '../workspaces/map'
import { useCharacterWorkspace } from '../workspaces/character'
import { useBuildingWorkspace } from '../workspaces/building'
import { useItemWorkspace } from '../workspaces/item'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import { useModWorkspace } from '../workspaces/mod'
import { useGeneratedProject, getEditModeRoute, buildStudioDeskModel } from '@features/generated-project'
import { buildWorkspacePanels } from '../model/workspace-panels/buildWorkspacePanels'
import StatusBar from '@widgets/status-bar'
import TopMenuBar from '@widgets/top-navigation'
import '../model/builtInWorkspaces'
import { scheduleDeferred } from '@shared/lib/react'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'
import type { SettingsWindowCategory } from '@shared/contracts'
import { listKnownGameDirectories } from '@platform/desktop'
import type { AppEvent, PendingWorkbenchCommandIntent, WorkbenchViewRegistration } from '@shared/contracts'
import { DevDebugOverlay } from './DevDebugOverlay'
import InitializationOverlay from './InitializationOverlay'
import { WorkbenchLayoutHost } from './WorkbenchLayoutHost'
import { WorkbenchViewHost } from './WorkbenchViewHost'
import { useEditModeNavigation } from '../model/useEditModeNavigation'
import { usePlayerAppearanceState } from '../model/usePlayerAppearanceState'
import { useWorkspaceLayoutPersistence } from '../model/useWorkspaceLayoutPersistence'
import { useWorkbenchModeTransitions } from '../model/useWorkbenchModeTransitions'
import { useWorkbenchCommandIntent } from '../model/workbenchCommandIntent'
import { useWorkbenchStatus } from '../model/useWorkbenchStatus'

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
  debugEnabled: boolean
  desktopHost: boolean
  onToggleTheme: () => void
  onSwitchToLauncher: () => void
  onOpenSettings: (category?: SettingsWindowCategory) => void
  onMinimizeWindow: () => void
  onToggleMaximizeWindow: () => void
  onCloseWindow: () => void
  onWorkbenchEvent: (event: AppEvent) => void
  getWorkbenchViewRegistration: (viewId: string) => WorkbenchViewRegistration | null
}

export default function WorkbenchExperience({
  pendingWorkbenchIntent,
  onClearPendingIntent,
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
  onWorkbenchEvent,
  getWorkbenchViewRegistration,
}: WorkbenchExperienceProps) {  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('mods')
  const [workspaceViewMode, setWorkspaceViewMode] = useState<'edit' | 'preview'>(() => {
    const saved = getAppUiStateSnapshot()?.workspace?.workspaceViewMode
    return saved === 'edit' || saved === 'preview' ? saved : 'edit'
  })
  const [deferredHeavyWorkspaceMode, setDeferredHeavyWorkspaceMode] = useState<WorkspaceMode | null>(null)
  const [knownGameDirectories, setKnownGameDirectories] = useState<string[]>([])
  const [projectOverlayOpen, setProjectOverlayOpen] = useState(false)
  const {
    activeEditPatchId,
    navigateToPatch,
    goBack,
    goForward,
    resetNavigation,
    canGoBack,
    canGoForward,
  } = useEditModeNavigation(workspaceViewMode === 'edit')

  const {
    handleWorkspaceChange,
    handleWorkspaceViewModeChange,
  } = useWorkbenchModeTransitions({
    workspaceViewMode,
    setWorkspaceMode,
    setWorkspaceViewMode,
    resetNavigation,
  })
  const [studioDeskGalleryOpen, setStudioDeskGalleryOpen] = useState(true)

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

  const {
    workspaceLayouts,
    workspaceLayoutStorageKey,
    handleWorkspacePersistStateChange,
  } = useWorkspaceLayoutPersistence(appUiStateReady, workspaceMode)

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
  useWorkbenchCommandIntent({
    pendingIntent: pendingWorkbenchIntent,
    generatedProject,
    setWorkspaceMode: (mode: string) => (setWorkspaceMode as (value: string) => void)(mode),
    setWorkspaceViewMode,
    navigateToPatch,
    clearPendingIntent: onClearPendingIntent,
  })

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
  const editModeView = getWorkbenchViewRegistration(editModeRoute)

  const moduleBlueprint =
    workspaceMode === 'map' || workspaceMode === 'events' || workspaceMode === 'mods'
      ? undefined
      : copy.moduleBlueprints[workspaceMode]
  const activeAssetName = mapDocument?.name ?? activeAsset?.name
  const needsInitialization = !directoryInfo
  const interactionLocked = resourcePreloadState.active
  const showProjectOverlay = (needsInitialization || projectOverlayOpen) && !interactionLocked

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
    if (generatedProject.activeDraft) {
      onWorkbenchEvent({
        type: 'generated-project/draft-selected',
        draftKey: generatedProject.activeDraft.draftStorageKey,
      })
    }
  }, [generatedProject.activeDraft, onWorkbenchEvent])

  useEffect(() => {
    if (workspaceMode !== 'events' || !currentEventCommandId) {
      return
    }

    workspaceLayoutRef.current?.setPanelVisibility('diagnostics', true)
  }, [currentEventCommandId, workspaceMode])

  useEffect(() => {
    resetNavigation()
  }, [resetNavigation, workspaceMode])

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
          onWorkspaceChange={handleWorkspaceChange}
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
            <WorkbenchLayoutHost
              workspaceLayoutRef={workspaceLayoutRef}
              workspaceLayoutStorageKey={workspaceLayoutStorageKey}
              workspaceLayouts={workspaceLayouts}
              workspacePanels={workspacePanels}
              onPersistStateChange={handleWorkspacePersistStateChange}
              onLayoutMetaChange={handleLayoutMetaChange}
            />
          ) : (
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
              generatedProject={generatedProject}
              studioDeskModel={studioDeskModel}
              onWorkbenchEvent={onWorkbenchEvent}
              navigateToPatch={navigateToPatch}
              onSetWorkspaceMode={setWorkspaceMode}
              onSetWorkspaceViewMode={setWorkspaceViewMode}
              studioDeskGalleryOpen={studioDeskGalleryOpen}
              onStudioDeskGalleryOpenChange={setStudioDeskGalleryOpen}
              activeEditPatchId={activeEditPatchId}
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
