import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceLayoutHandle } from '@shared/contracts'
import { editorCopy, type AppMode, type WorkspaceMode } from '@locales/api'
import { useModWorkspaceCopy } from '@locales/provider'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import { WorkspaceDecisionDialog } from '../workspaces/mod'
import type { ModI18nStatusFilter } from '../workspaces/mod-i18n'
import {
  useCpMaker,
  getEditModeRoute,
  buildStudioDeskModel,
  CreateDraftDialog,
  ExportDialog,
  ProjectPropertiesDialog,
} from '@features/cp-maker'
import TopMenuBar from '@widgets/top-navigation'
import { WorkbenchSideNav, WorkbenchWorkspaceToolbar, WorkbenchEditGate } from '@widgets/workbench-shell'
import '../model/builtInWorkspaces'
import { scheduleDeferred } from '@shared/lib/react'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'
import { reportAppEvent } from '@platform/observability'
import InitializationOverlay from './InitializationOverlay'
import { WorkbenchMapPreviewRuntime, type MapPreviewStatusSnapshot } from './WorkbenchMapPreviewRuntime'
import { WorkbenchPreviewRuntime, type PreviewStatusSnapshot } from './WorkbenchPreviewRuntime'
import { WorkbenchModPreviewRuntime, type ModPreviewStatusSnapshot, type ModWorkspaceGuardHandle } from './WorkbenchModPreviewRuntime'
import { WorkbenchHomePage } from './WorkbenchHomePage'
import { WorkbenchViewHost } from './WorkbenchViewHost'
import { useEditModeNavigation } from '../model/useEditModeNavigation'
import { usePlayerAppearanceState } from '../model/usePlayerAppearanceState'
import { useWorkspaceLayoutPersistence } from '../model/useWorkspaceLayoutPersistence'
import { useWorkbenchNavigation } from '../model/useWorkbenchNavigation'
import { createShellLocation, useWorkbenchProjectNavigation, type MakerWorkspaceMode } from '../model/useWorkbenchProjectNavigation'
import { useWorkbenchLaunchpadRecentPages } from '../model/useWorkbenchLaunchpadRecentPages'
import { useWorkbenchModeTransitions } from '../model/useWorkbenchModeTransitions'
import { useWorkbenchCommandIntent } from '../model/workbenchCommandIntent'
import { useWorkbenchStatus } from '../model/useWorkbenchStatus'
import { useWorkbenchGameDirectory } from '../model/useWorkbenchGameDirectory'
import { useWorkbenchShellHistory, type WorkbenchShellLocation } from '../model/useWorkbenchShellHistory'
import { LoadingMotionFallback, LoadingMotionReveal } from '@shared/ui/loading-motion'
import {
  arePathListsEqual,
  EMPTY_RESOURCE_PRELOAD_STATE,
  EMPTY_WORKSPACE_STATUS,
  getPathListKey,
  RESOURCE_PRELOAD_NOTIFICATION_ID,
  resolveInitialWorkbenchLocation,
  type WindowWithIdleCallback,
  type WorkbenchExperienceProps,
} from './workbenchExperienceSupport'

const PlayerAppearanceWindow = lazy(() => import('./PlayerAppearanceWindow'))
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
  onWindowCloseRequestChange,
  onHomeRouteActiveChange,
  onWorkbenchEvent,
  getWorkbenchViewRegistration,
  workbenchViews = [],
}: WorkbenchExperienceProps) {
  const persistedWorkspace = getAppUiStateSnapshot().workspace
  const persistedLocation = persistedWorkspace.lastLocation
  const navigation = useWorkbenchNavigation(
    resolveInitialWorkbenchLocation(persistedLocation, workbenchViews, getWorkbenchViewRegistration),
  )
  const { workbenchRoute, workspaceMode, workspaceViewMode, registeredWorkbenchViewId } = navigation.location
  const {
    state: navigationState,
    restore: restoreNavigation,
    setWorkbenchRoute,
    setWorkspaceMode,
    setWorkspaceViewMode,
    setRegisteredWorkbenchViewId,
  } = navigation
  const [deferredHeavyWorkspaceMode, setDeferredHeavyWorkspaceMode] = useState<WorkspaceMode | null>(null)
  const [projectOverlayOpen, setProjectOverlayOpen] = useState(false)
  const [sideNavCollapsed, setSideNavCollapsed] = useState(persistedWorkspace.sideNav?.collapsed ?? true)
  const [sideNavSections, setSideNavSections] = useState({
    browseOpen: persistedWorkspace.sideNav?.browseOpen ?? true,
    toolsOpen: persistedWorkspace.sideNav?.toolsOpen ?? false,
    devOpen: persistedWorkspace.sideNav?.devOpen ?? false,
  })
  const shellWorkspaceHydratedRef = useRef(false)
  const persistedShellWorkspaceKeyRef = useRef<string | null>(null)
  const getWorkbenchViewRegistrationRef = useRef(getWorkbenchViewRegistration)
  const [modI18nSourceLocale, setModI18nSourceLocale] = useState('default')
  const [modI18nTargetLocale, setModI18nTargetLocale] = useState('zh-CN')
  const [modI18nQuery, setModI18nQuery] = useState('')
  const [modI18nStatusFilter, setModI18nStatusFilter] = useState<ModI18nStatusFilter>('all')
  const lastSelectedDraftKeyRef = useRef<string | null>(null)
  const draftRestoreAttemptedRef = useRef(false)
  const shellRootRef = useRef<HTMLDivElement | null>(null)
  const { activeEditPatchId, navigateToPatch, goBack, goForward, resetNavigation, canGoBack, canGoForward } = useEditModeNavigation(
    workspaceViewMode === 'edit',
  )

  const { handleWorkspaceChange, handleWorkspaceViewModeChange } = useWorkbenchModeTransitions({
    setWorkspaceMode,
    setWorkspaceViewMode,
    resetNavigation,
  })
  const [makerPending, setMakerPending] = useState<MakerWorkspaceMode | null>(null)
  const [projectLibraryFocusKey, setProjectLibraryFocusKey] = useState(0)
  const [createDraftDialogOpen, setCreateDraftDialogOpen] = useState(false)
  const [projectPropertiesDialogOpen, setProjectPropertiesDialogOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [pendingCpMakerUnsavedAction, setPendingCpMakerUnsavedAction] = useState<(() => void | Promise<void>) | null>(null)
  const [cpMakerUnsavedSaving, setCpMakerUnsavedSaving] = useState(false)
  const [cpMakerUnsavedError, setCpMakerUnsavedError] = useState<string | null>(null)

  const storedRecentGameDirectories = getAppUiStateSnapshot()?.appearance.recentGameDirectories ?? []
  const [playerAppearanceWindowOpen, setPlayerAppearanceWindowOpen] = useState(false)
  const [playerAppearanceWindowNonce, setPlayerAppearanceWindowNonce] = useState(0)
  const workspaceLayoutRef = useRef<WorkspaceLayoutHandle | null>(null)
  const closeGuardArmedRef = useRef(false)
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
  } = usePlayerAppearanceState(appUiStateReady)

  const copy = editorCopy[locale]
  const {
    gameDirectory,
    setGameDirectory,
    directoryInfo,
    knownGameDirectories,
    directoryStatus,
    handleDirectoryInvalid,
    validateCurrentDirectory,
    chooseDirectory,
  } = useWorkbenchGameDirectory({
    active,
    desktopHost,
    copy,
  })
  const workbenchHomeActive = workbenchRoute === 'home'
  useEffect(() => {
    onHomeRouteActiveChange?.(active && workbenchHomeActive)
    return () => onHomeRouteActiveChange?.(false)
  }, [active, onHomeRouteActiveChange, workbenchHomeActive])
  const setWorkbenchRouteToWorkspace = useCallback(() => setWorkbenchRoute('workspace'), [])

  useEffect(() => {
    getWorkbenchViewRegistrationRef.current = getWorkbenchViewRegistration
  }, [getWorkbenchViewRegistration])

  const applyShellLocation = useCallback(
    (location: WorkbenchShellLocation) => {
      const workspaceRegistration = workbenchViews.find(
        (view) => view.activation.kind === 'workspace' && view.activation.workspaceMode === location.workspaceMode,
      )
      const restoredLocation =
        workspaceRegistration?.activation.kind === 'workspace' && workspaceRegistration.activation.presentation === 'browser'
          ? { ...location, workspaceViewMode: 'preview' as const }
          : location
      restoreNavigation(restoredLocation)
      if (restoredLocation.workbenchRoute === 'workspace' && restoredLocation.workspaceViewMode === 'edit') {
        resetNavigation()
      }
    },
    [resetNavigation, restoreNavigation, workbenchViews],
  )

  const shellHistory = useWorkbenchShellHistory({
    rootRef: shellRootRef,
    enabled: active,
    location: navigation.location,
    onRestoreLocation: applyShellLocation,
  })
  const {
    push: pushShellLocation,
    resetTo: resetShellHistory,
    goBack: goShellBack,
    goForward: goShellForward,
    canGoBack: canGoShellBack,
    canGoForward: canGoShellForward,
  } = shellHistory

  useEffect(() => {
    if (!active) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return
      }

      if (event.key === 'Escape' && workbenchRoute === 'home') {
        setWorkbenchRoute('workspace')
        pushShellLocation(
          createShellLocation({
            workbenchRoute: 'workspace',
            workspaceMode,
            workspaceViewMode,
            registeredWorkbenchViewId,
          }),
        )
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (workbenchRoute !== 'home') {
          setWorkbenchRoute('home')
          pushShellLocation(
            createShellLocation({
              workbenchRoute: 'home',
              workspaceMode,
              workspaceViewMode,
              registeredWorkbenchViewId,
            }),
          )
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [active, pushShellLocation, registeredWorkbenchViewId, workbenchRoute, workspaceMode, workspaceViewMode])

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

  const [mapPreviewSnapshot, setMapPreviewSnapshot] = useState<MapPreviewStatusSnapshot>({
    workspaceStatus: EMPTY_WORKSPACE_STATUS,
    resourcePreloadState: EMPTY_RESOURCE_PRELOAD_STATE,
    mapAssets: [],
    activeAsset: null,
    mapDocument: null,
    worldAtlasDocument: null,
    hoverInfo: null,
  })
  const [previewStatusSnapshot, setPreviewStatusSnapshot] = useState<PreviewStatusSnapshot>({
    workspaceStatus: EMPTY_WORKSPACE_STATUS,
    resourcePreloadState: EMPTY_RESOURCE_PRELOAD_STATE,
    eventCount: 0,
    eventStatusMessage: '',
    characterCount: 0,
    characterStatusMessage: '',
    buildingBrowserCount: 0,
    buildingStatusMessage: '',
    itemCount: 0,
    itemStatusMessage: '',
    selectedEvent: null,
    parsedEventAsset: null,
    selectedTimelineEntryId: '',
    currentEventCommandId: null,
  })
  const workspaceStatus = workspaceMode === 'map' ? mapPreviewSnapshot.workspaceStatus : previewStatusSnapshot.workspaceStatus
  const currentModeResourcePreloadState =
    workspaceMode === 'map' ? mapPreviewSnapshot.resourcePreloadState : previewStatusSnapshot.resourcePreloadState
  const resourcePreloadState = mapPreviewSnapshot.resourcePreloadState.active
    ? mapPreviewSnapshot.resourcePreloadState
    : currentModeResourcePreloadState
  const [modGuardHandle, setModGuardHandle] = useState<ModWorkspaceGuardHandle | null>(null)
  const [modPreviewStatusSnapshot, setModPreviewStatusSnapshot] = useState<ModPreviewStatusSnapshot>({
    diagnostics: [],
    hasUnsavedChanges: false,
    projectsCount: 0,
    activeProjectDetail: null,
    statusMessage: '',
  })
  const modWorkspaceCopy = useModWorkspaceCopy()
  const recentGameDirectoriesPatchKeyRef = useRef<string | null>(null)

  const runWithModUnsavedGuard = useCallback(
    async (action: () => void | Promise<void>) => {
      if (!modGuardHandle) {
        await action()
        return true
      }

      return modGuardHandle.requestUnsavedChangeDecision(action)
    },
    [modGuardHandle],
  )
  const handleWorkspaceChangeWithModGuard = useCallback(
    (mode: WorkspaceMode) => {
      if (mode === workspaceMode) {
        handleWorkspaceChange(mode)
        return
      }

      void runWithModUnsavedGuard(() => handleWorkspaceChange(mode))
    },
    [handleWorkspaceChange, runWithModUnsavedGuard, workspaceMode],
  )
  const cpMaker = useCpMaker()
  useEffect(() => {
    if (!appUiStateReady || draftRestoreAttemptedRef.current) return
    const savedKey = getAppUiStateSnapshot().workspace.cpMaker?.activeDraftKey ?? null
    if (!savedKey) {
      draftRestoreAttemptedRef.current = true
      return
    }
    if (!cpMaker.drafts.length) return
    draftRestoreAttemptedRef.current = true
    if (cpMaker.drafts.some((draft) => draft.draftStorageKey === savedKey)) {
      void cpMaker.loadDraft(savedKey)
    } else {
      void applyAppUiStatePatch({ workspace: { cpMaker: { activeDraftKey: null } } })
    }
  }, [appUiStateReady, cpMaker.drafts, cpMaker.loadDraft])

  useEffect(() => {
    if (!appUiStateReady) {
      return
    }

    if (!shellWorkspaceHydratedRef.current) {
      const workspace = getAppUiStateSnapshot().workspace
      const location = workspace.lastLocation
      const nextWorkspaceMode = ['map', 'events', 'characters', 'buildings', 'items', 'mod-browser', 'mod-i18n'].includes(
        location?.workspaceMode ?? '',
      )
        ? (location!.workspaceMode as WorkspaceMode)
        : 'map'
      const nextRegisteredViewId =
        location?.registeredWorkbenchViewId && getWorkbenchViewRegistrationRef.current(location.registeredWorkbenchViewId)
          ? location.registeredWorkbenchViewId
          : null

      const nextWorkbenchRoute = location?.workbenchRoute ?? 'home'
      const nextWorkspaceViewMode = location?.workspaceViewMode ?? workspace.workspaceViewMode ?? 'preview'
      const nextWorkspaceRegistration = workbenchViews.find(
        (view) => view.activation.kind === 'workspace' && view.activation.workspaceMode === nextWorkspaceMode,
      )
      const normalizedWorkspaceViewMode =
        nextWorkspaceRegistration?.activation.kind === 'workspace' && nextWorkspaceRegistration.activation.presentation === 'browser'
          ? 'preview'
          : nextWorkspaceViewMode
      const nextSideNav = {
        collapsed: workspace.sideNav?.collapsed ?? true,
        browseOpen: workspace.sideNav?.browseOpen ?? true,
        toolsOpen: workspace.sideNav?.toolsOpen ?? false,
        devOpen: workspace.sideNav?.devOpen ?? false,
      }

      restoreNavigation({
        workbenchRoute: nextWorkbenchRoute,
        workspaceMode: nextWorkspaceMode,
        workspaceViewMode: normalizedWorkspaceViewMode,
        registeredWorkbenchViewId: nextRegisteredViewId,
      })
      setSideNavCollapsed(nextSideNav.collapsed)
      setSideNavSections({
        browseOpen: nextSideNav.browseOpen,
        toolsOpen: nextSideNav.toolsOpen,
        devOpen: nextSideNav.devOpen,
      })
      persistedShellWorkspaceKeyRef.current = JSON.stringify({
        workspaceViewMode: normalizedWorkspaceViewMode,
        lastLocation: {
          workbenchRoute: nextWorkbenchRoute,
          workspaceMode: nextWorkspaceMode,
          workspaceViewMode: normalizedWorkspaceViewMode,
          registeredWorkbenchViewId: nextRegisteredViewId,
        },
        sideNav: nextSideNav,
      })
      shellWorkspaceHydratedRef.current = true
      return
    }

    const nextWorkspaceShellState = {
      workspaceViewMode,
      lastLocation: { workbenchRoute, workspaceMode, workspaceViewMode, registeredWorkbenchViewId },
      sideNav: { collapsed: sideNavCollapsed, ...sideNavSections },
    }
    const nextWorkspaceShellKey = JSON.stringify(nextWorkspaceShellState)
    if (persistedShellWorkspaceKeyRef.current === nextWorkspaceShellKey) {
      return
    }
    persistedShellWorkspaceKeyRef.current = nextWorkspaceShellKey

    void applyAppUiStatePatch({
      workspace: nextWorkspaceShellState,
    })
  }, [
    appUiStateReady,
    registeredWorkbenchViewId,
    restoreNavigation,
    sideNavCollapsed,
    sideNavSections,
    workbenchRoute,
    workspaceMode,
    workspaceViewMode,
    workbenchViews,
  ])

  useEffect(() => {
    if (!appUiStateReady || !draftRestoreAttemptedRef.current) return
    const activeDraftKey = cpMaker.activeDraft?.draftStorageKey ?? null
    const persisted = getAppUiStateSnapshot().workspace.cpMaker
    if (persisted?.activeDraftKey === activeDraftKey) return
    void applyAppUiStatePatch({
      workspace: {
        cpMaker: { activeGeneratedDraftKey: persisted?.activeGeneratedDraftKey ?? null, activeDraftKey },
      },
    })
  }, [appUiStateReady, cpMaker.activeDraft?.draftStorageKey])
  const runWithCpMakerUnsavedGuard = useCallback(
    async (action: () => void | Promise<void>) => {
      if (!cpMaker.isDirty) {
        await action()
        return true
      }

      setCpMakerUnsavedError(null)
      setPendingCpMakerUnsavedAction(() => action)
      return false
    },
    [cpMaker.isDirty],
  )
  const handleWorkspaceViewModeChangeWithGuards = useCallback(
    (mode: 'edit' | 'preview') => {
      if (mode === workspaceViewMode) {
        handleWorkspaceViewModeChange(mode)
        return
      }

      void runWithModUnsavedGuard(() => {
        void runWithCpMakerUnsavedGuard(() => {
          handleWorkspaceViewModeChange(mode)
          pushShellLocation(
            createShellLocation({
              workbenchRoute,
              workspaceMode,
              workspaceViewMode: mode,
              registeredWorkbenchViewId,
            }),
          )
        })
      })
    },
    [
      handleWorkspaceViewModeChange,
      pushShellLocation,
      registeredWorkbenchViewId,
      runWithCpMakerUnsavedGuard,
      runWithModUnsavedGuard,
      workbenchRoute,
      workspaceMode,
      workspaceViewMode,
    ],
  )
  const confirmCpMakerUnsavedSaveAndContinue = useCallback(async () => {
    if (!pendingCpMakerUnsavedAction) {
      return
    }

    setCpMakerUnsavedSaving(true)
    setCpMakerUnsavedError(null)
    try {
      const saved = await cpMaker.saveDraft()
      if (!saved) {
        setCpMakerUnsavedError(cpMaker.draftError ?? modWorkspaceCopy.saveFailed)
        return
      }

      const action = pendingCpMakerUnsavedAction
      setPendingCpMakerUnsavedAction(null)
      await action()
    } catch (error) {
      setCpMakerUnsavedError(error instanceof Error ? error.message : String(error))
    } finally {
      setCpMakerUnsavedSaving(false)
    }
  }, [cpMaker, modWorkspaceCopy.saveFailed, pendingCpMakerUnsavedAction])
  const confirmCpMakerUnsavedDiscardAndContinue = useCallback(async () => {
    if (!pendingCpMakerUnsavedAction) {
      return
    }

    const action = pendingCpMakerUnsavedAction
    setPendingCpMakerUnsavedAction(null)
    setCpMakerUnsavedError(null)
    await action()
  }, [pendingCpMakerUnsavedAction])
  const cancelCpMakerUnsavedDecision = useCallback(() => {
    if (cpMakerUnsavedSaving) {
      return
    }
    setPendingCpMakerUnsavedAction(null)
    setCpMakerUnsavedError(null)
  }, [cpMakerUnsavedSaving])

  useEffect(() => {
    if (!modGuardHandle?.hasPendingUnsavedDecision && !pendingCpMakerUnsavedAction) {
      closeGuardArmedRef.current = false
    }
  }, [modGuardHandle?.hasPendingUnsavedDecision, pendingCpMakerUnsavedAction])
  useWorkbenchCommandIntent({
    pendingIntent: pendingWorkbenchIntent,
    cpMaker,
    setWorkspaceMode: (mode: string) => setWorkspaceMode(mode as WorkspaceMode),
    runWithModUnsavedGuard,
    runWithCpMakerUnsavedGuard,
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
  const editModeRoute = registeredWorkbenchViewId ?? getEditModeRoute(workspaceMode, Boolean(cpMaker.activeDraft))
  const editModeView = getWorkbenchViewRegistration(editModeRoute)
  const registeredViewRequiresProject = registeredWorkbenchViewId
    ? getWorkbenchViewRegistration(registeredWorkbenchViewId)?.requiresProject === true
    : true
  const devWorkbenchViews = useMemo(
    () =>
      import.meta.env.DEV
        ? workbenchViews
            .filter((view) => view.category === 'dev')
            .map((view) => ({
              ...view,
              active: view.viewId === registeredWorkbenchViewId,
            }))
            .slice()
            .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
        : [],
    [registeredWorkbenchViewId, workbenchViews],
  )
  const toolWorkbenchViews = useMemo(
    () =>
      workbenchViews
        .filter((view) => view.category === 'tool')
        .map((view) => ({
          ...view,
          active:
            view.activation.kind === 'workspace'
              ? navigationState.kind === 'workspace' && view.activation.workspaceMode === workspaceMode
              : view.viewId === registeredWorkbenchViewId,
        }))
        .slice()
        .sort((left, right) => (left.order ?? 0) - (right.order ?? 0)),
    [navigationState.kind, registeredWorkbenchViewId, workbenchViews, workspaceMode],
  )
  const activeWorkspaceRegistration = workbenchViews.find(
    (view) => view.activation.kind === 'workspace' && view.activation.workspaceMode === workspaceMode,
  )
  const workspaceUsesAuthoringChrome =
    activeWorkspaceRegistration?.activation.kind !== 'workspace' || activeWorkspaceRegistration.activation.presentation === 'authoring'
  const { rememberRecentPage } = useWorkbenchLaunchpadRecentPages({
    workspaceMode,
    workspaceViewMode,
    hasActiveProject: Boolean(cpMaker.activeDraft),
    devViews: devWorkbenchViews,
  })

  const needsInitialization = !directoryInfo

  const { currentWorkspaceStatus, recentGameDirectories, resourcePreloadProgress } = useWorkbenchStatus({
    workspaceMode,
    directoryInfoPresent: Boolean(directoryInfo),
    workspaceStatus,
    eventCount: previewStatusSnapshot.eventCount,
    eventStatusMessage: previewStatusSnapshot.eventStatusMessage,
    characterCount: previewStatusSnapshot.characterCount,
    characterStatusMessage: previewStatusSnapshot.characterStatusMessage,
    buildingBrowserCount: previewStatusSnapshot.buildingBrowserCount,
    buildingStatusMessage: previewStatusSnapshot.buildingStatusMessage,
    itemCount: previewStatusSnapshot.itemCount,
    itemStatusMessage: previewStatusSnapshot.itemStatusMessage,
    modDiagnostics: modPreviewStatusSnapshot.diagnostics,
    modHasUnsavedChanges: modPreviewStatusSnapshot.hasUnsavedChanges,
    modProjectsCount: modPreviewStatusSnapshot.projectsCount,
    activeModProjectDetail: modPreviewStatusSnapshot.activeProjectDetail,
    modStatusMessage: modPreviewStatusSnapshot.statusMessage,
    resourcePreloadState,
    storedRecentGameDirectories,
    currentRootPath: directoryInfo?.rootPath ?? null,
  })
  const interactionLocked = resourcePreloadState.active || directoryStatus.tone === 'working'
  const showProjectOverlay = !registeredWorkbenchViewId && (projectOverlayOpen || (workbenchRoute !== 'home' && needsInitialization))
  const editLocked = workspaceViewMode === 'edit' && registeredViewRequiresProject && !cpMaker.activeDraft
  const workspaceShowsPreview = workbenchRoute === 'workspace' && (workspaceViewMode === 'preview' || editLocked)
  const overlayStatus = directoryStatus.message || (currentWorkspaceStatus.tone === 'error' ? null : currentWorkspaceStatus.message)
  const overlayError =
    directoryStatus.tone === 'error'
      ? directoryStatus.message
      : currentWorkspaceStatus.tone === 'error'
        ? currentWorkspaceStatus.message
        : null

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
    resetNavigation()
  }, [resetNavigation, workspaceMode])

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

    const nextKey = getPathListKey(recentGameDirectories)
    const persistedRecentGameDirectories = getAppUiStateSnapshot().appearance.recentGameDirectories ?? []
    if (arePathListsEqual(persistedRecentGameDirectories, recentGameDirectories)) {
      recentGameDirectoriesPatchKeyRef.current = nextKey
      return
    }

    if (recentGameDirectoriesPatchKeyRef.current === nextKey) {
      return
    }

    recentGameDirectoriesPatchKeyRef.current = nextKey
    void applyAppUiStatePatch({
      appearance: {
        recentGameDirectories,
      },
    }).catch((error) => {
      reportAppEvent({
        level: 'error',
        title: 'Failed to save recent game directories',
        description: error instanceof Error ? error.message : String(error),
        notify: false,
      })
    })
  }, [appUiStateReady, recentGameDirectories])

  const openAppearanceWindow = useCallback(() => {
    setPlayerAppearanceWindowNonce((current) => current + 1)
    setPlayerAppearanceWindowOpen(true)
  }, [])

  const ignoreLayoutMetaChange = useCallback(() => {}, [])

  const handleAppModeChange = useCallback(
    (nextMode: AppMode) => {
      if (nextMode === 'launcher') {
        void runWithModUnsavedGuard(() => {
          void runWithCpMakerUnsavedGuard(() => {
            setWorkbenchRouteToWorkspace()
            onSwitchToLauncher()
          })
        })
      }
    },
    [onSwitchToLauncher, runWithCpMakerUnsavedGuard, runWithModUnsavedGuard, setWorkbenchRouteToWorkspace],
  )

  const handleCloseWindow = useCallback(async () => {
    if (closeGuardArmedRef.current) {
      return false
    }

    const hasUnsavedCloseGuard = Boolean(modGuardHandle?.hasUnsavedChanges || cpMaker.isDirty)
    let closeAccepted = false
    closeGuardArmedRef.current = true
    await runWithModUnsavedGuard(async () => {
      await runWithCpMakerUnsavedGuard(async () => {
        closeAccepted = await onCloseWindow()
      })
    })
    if (!closeAccepted && !hasUnsavedCloseGuard) {
      closeGuardArmedRef.current = false
    }
    return closeAccepted
  }, [cpMaker.isDirty, modGuardHandle?.hasUnsavedChanges, onCloseWindow, runWithCpMakerUnsavedGuard, runWithModUnsavedGuard])

  useEffect(() => {
    if (!active) {
      return
    }

    onWindowCloseRequestChange?.(handleCloseWindow)
    return () => onWindowCloseRequestChange?.(null)
  }, [active, handleCloseWindow, onWindowCloseRequestChange])

  useEffect(() => {
    if (!modGuardHandle?.hasUnsavedChanges && !cpMaker.isDirty) {
      return
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [cpMaker.isDirty, modGuardHandle?.hasUnsavedChanges])

  const handleChooseGameDirectory = useCallback(() => {
    void chooseDirectory()
  }, [chooseDirectory])

  const handleValidateGameDirectory = useCallback(async () => {
    void runWithModUnsavedGuard(() => {
      void runWithCpMakerUnsavedGuard(async () => {
        const info = await validateCurrentDirectory()
        if (!info) return
        setProjectOverlayOpen(false)
        setWorkspaceMode('map')
        setWorkspaceViewMode('preview')
      })
    })
  }, [runWithCpMakerUnsavedGuard, runWithModUnsavedGuard, setWorkspaceMode, setWorkspaceViewMode, validateCurrentDirectory])

  const {
    handleCloseProject,
    handleCopyProject,
    handleCreateDraft,
    handleDeleteProject,
    handleExportPack,
    handleImportDraft,
    handleOpenDevView,
    handleOpenHome,
    handleOpenProjectCreate,
    handleOpenProjectLibrary,
    handleOpenProjectWorkspace,
    handleOpenRegisteredWorkbenchView,
    handleOpenRootWorkspace,
    handleSelectProjectFromHome,
    handleUpdateDraftMetadata,
  } = useWorkbenchProjectNavigation({
    cpMaker,
    directoryRootPath: directoryInfo?.rootPath ?? null,
    importDraftLabel: copy.studioDesk.importDraft,
    makerPending,
    setMakerPending,
    workbenchRoute,
    workspaceMode,
    workspaceViewMode,
    registeredWorkbenchViewId,
    setWorkbenchRoute,
    setWorkbenchRouteToWorkspace,
    setWorkspaceMode,
    setWorkspaceViewMode,
    setRegisteredWorkbenchViewId,
    setProjectLibraryFocusKey,
    setCreateDraftDialogOpen,
    setProjectPropertiesDialogOpen,
    navigateToPatch,
    resetNavigation,
    pushShellLocation,
    resetShellHistory,
    rememberRecentPage,
    runWithModUnsavedGuard,
    runWithCpMakerUnsavedGuard,
    onWorkbenchEvent,
    getWorkbenchViewRegistration,
  })
  const projectMenuRecentProjects = useMemo(
    () =>
      studioDeskModel.gallery.projects.slice(0, 8).map((project) => ({
        draftStorageKey: project.draftStorageKey,
        title: project.title,
        uniqueId: project.uniqueId,
        isCurrent: project.isCurrent,
      })),
    [studioDeskModel.gallery.projects],
  )

  return (
    <div ref={shellRootRef} className={active ? 'flex h-full flex-col' : 'hidden'} aria-busy={interactionLocked} aria-hidden={!active}>
      <TopMenuBar
        appMode="workbench"
        onAppModeChange={handleAppModeChange}
        workspaceMode={workspaceMode}
        onWorkspaceChange={handleWorkspaceChangeWithModGuard}
        workspaceNavigationDisabled={workspaceViewMode === 'edit' && !cpMaker.activeDraft}
        workspaceViewMode={workspaceViewMode}
        onWorkspaceViewModeChange={handleWorkspaceViewModeChangeWithGuards}
        theme={theme}
        onToggleTheme={onToggleTheme}
        statusTone={currentWorkspaceStatus.tone}
        desktopHost={desktopHost}
        onMinimizeWindow={onMinimizeWindow}
        onToggleMaximizeWindow={onToggleMaximizeWindow}
        onCloseWindow={handleCloseWindow}
        settingsMenu={{
          onOpen: () => onOpenSettings('appearance'),
        }}
        projectMenu={{
          title: studioDeskModel.hasActiveDraft ? studioDeskModel.projectName || null : null,
          version: studioDeskModel.hasActiveDraft ? studioDeskModel.projectVersion || null : null,
          uniqueId: studioDeskModel.hasActiveDraft ? studioDeskModel.projectUniqueId || null : null,
          recentProjects: projectMenuRecentProjects,
          hasActiveProject: studioDeskModel.hasActiveDraft,
          onSelectProject: (draftStorageKey) => handleSelectProjectFromHome(draftStorageKey),
          onCreateProject: handleOpenProjectCreate,
          onOpenProject: handleOpenProjectLibrary,
          onImportProject: () => {
            void handleImportDraft()
          },
          onProjectSettings: () => setProjectPropertiesDialogOpen(true),
          onExportProject: () => setExportDialogOpen(true),
          onCloseProject: handleCloseProject,
        }}
      />

      {playerAppearanceWindowOpen ? (
        <Suspense fallback={<LoadingMotionFallback className="workbench-loading-motion-fallback" />}>
          <PlayerAppearanceWindow
            key={`player-appearance:${playerAppearanceWindowNonce}`}
            open={playerAppearanceWindowOpen}
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

      <WorkspaceDecisionDialog
        open={Boolean(pendingCpMakerUnsavedAction)}
        title={modWorkspaceCopy.unsavedChangesTitle}
        message={copy.studioDesk.unsavedChangesMessage}
        error={cpMakerUnsavedError}
        saving={cpMakerUnsavedSaving}
        cancelLabel={modWorkspaceCopy.unsavedCancel}
        secondaryLabel={modWorkspaceCopy.unsavedDiscardAndContinue}
        primaryLabel={modWorkspaceCopy.unsavedSaveAndContinue}
        cancelDisabled={cpMakerUnsavedSaving}
        onCancel={cancelCpMakerUnsavedDecision}
        onSecondary={() => void confirmCpMakerUnsavedDiscardAndContinue()}
        onPrimary={() => void confirmCpMakerUnsavedSaveAndContinue()}
      />

      <div className="workbench-shell-body" data-nav={sideNavCollapsed ? 'collapsed' : 'expanded'}>
        <WorkbenchSideNav
          collapsed={sideNavCollapsed}
          onCollapsedChange={setSideNavCollapsed}
          canGoBack={canGoShellBack}
          canGoForward={canGoShellForward}
          onGoBack={goShellBack}
          onGoForward={goShellForward}
          onResetLayout={() => workspaceLayoutRef.current?.resetLayout()}
          workbenchRoute={workbenchRoute}
          workspaceMode={workspaceMode}
          workspaceViewMode={workspaceViewMode}
          registeredWorkbenchViewId={registeredWorkbenchViewId}
          devViews={devWorkbenchViews}
          toolViews={toolWorkbenchViews}
          onHomeOpen={handleOpenHome}
          onBrowseOpen={handleOpenRootWorkspace}
          onDevViewOpen={handleOpenRegisteredWorkbenchView}
          sectionState={sideNavSections}
          onSectionStateChange={setSideNavSections}
        />

        <div className="workbench-shell-main">
          {workbenchRoute === 'workspace' && !registeredWorkbenchViewId && workspaceUsesAuthoringChrome ? (
            <WorkbenchWorkspaceToolbar
              workspaceMode={workspaceMode}
              workspaceViewMode={workspaceViewMode}
              registeredWorkbenchViewId={registeredWorkbenchViewId}
              registeredWorkbenchViewTitle={
                registeredWorkbenchViewId
                  ? (getWorkbenchViewRegistration(registeredWorkbenchViewId)?.title ?? registeredWorkbenchViewId)
                  : null
              }
              hasActiveProject={Boolean(cpMaker.activeDraft)}
              onWorkspaceViewModeChange={handleWorkspaceViewModeChangeWithGuards}
            />
          ) : null}
          {workbenchRoute === 'workspace' && workspaceUsesAuthoringChrome && editLocked ? (
            <WorkbenchEditGate onSelectProject={handleOpenHome} onStayBrowse={() => handleWorkspaceViewModeChangeWithGuards('preview')} />
          ) : null}
          <div className="relative h-full min-h-0 flex-1 overflow-hidden">
            <WorkbenchMapPreviewRuntime
              copy={copy}
              locale={locale}
              theme={theme}
              accentColor={accentColor}
              desktopHost={desktopHost}
              active={active}
              visible={workspaceShowsPreview && workspaceMode === 'map'}
              directoryInfo={directoryInfo}
              heavyWorkspaceReady={deferredHeavyWorkspaceMode === 'map'}
              workspaceLayoutRef={workspaceLayoutRef}
              workspaceLayoutStorageKey={workspaceLayoutStorageKey}
              workspaceLayouts={workspaceLayouts}
              onPersistStateChange={handleWorkspacePersistStateChange}
              onDirectoryInvalid={handleDirectoryInvalid}
              onStatusSnapshotChange={setMapPreviewSnapshot}
              onLayoutMetaChange={ignoreLayoutMetaChange}
            />
            {workspaceShowsPreview && workspaceMode === 'map' ? null : (
              <div className="absolute inset-0 min-h-0 overflow-hidden">
                {workspaceShowsPreview ? (
                  <LoadingMotionReveal itemId="workbench-preview-mode" index={0} className="h-full min-h-0">
                    {workspaceMode === 'mod-browser' || workspaceMode === 'mod-i18n' ? (
                      <WorkbenchModPreviewRuntime
                        copy={copy}
                        locale={locale}
                        theme={theme}
                        accentColor={accentColor}
                        workspaceMode={workspaceMode}
                        directoryInfo={directoryInfo}
                        heavyWorkspaceReady={deferredHeavyWorkspaceMode === workspaceMode}
                        workspaceLayoutRef={workspaceLayoutRef}
                        workspaceLayoutStorageKey={workspaceLayoutStorageKey}
                        workspaceLayouts={workspaceLayouts}
                        modI18nSourceLocale={modI18nSourceLocale}
                        modI18nTargetLocale={modI18nTargetLocale}
                        modI18nQuery={modI18nQuery}
                        modI18nStatusFilter={modI18nStatusFilter}
                        onModI18nSourceLocaleChange={handleModI18nSourceLocaleChange}
                        onModI18nTargetLocaleChange={handleModI18nTargetLocaleChange}
                        onModI18nQueryChange={setModI18nQuery}
                        onModI18nStatusFilterChange={setModI18nStatusFilter}
                        onGuardHandleChange={setModGuardHandle}
                        onStatusSnapshotChange={setModPreviewStatusSnapshot}
                        onPersistStateChange={handleWorkspacePersistStateChange}
                        onLayoutMetaChange={ignoreLayoutMetaChange}
                      />
                    ) : (
                      <WorkbenchPreviewRuntime
                        copy={copy}
                        locale={locale}
                        theme={theme}
                        accentColor={accentColor}
                        desktopHost={desktopHost}
                        workspaceMode={workspaceMode}
                        directoryInfo={directoryInfo}
                        heavyWorkspaceReady={deferredHeavyWorkspaceMode === workspaceMode}
                        workspaceLayoutRef={workspaceLayoutRef}
                        workspaceLayoutStorageKey={workspaceLayoutStorageKey}
                        workspaceLayouts={workspaceLayouts}
                        onPersistStateChange={handleWorkspacePersistStateChange}
                        onDirectoryInvalid={handleDirectoryInvalid}
                        onMapStatusSnapshotChange={setMapPreviewSnapshot}
                        onStatusSnapshotChange={setPreviewStatusSnapshot}
                        playerAppearanceProfile={activePlayerAppearanceProfile}
                        onOpenPlayerAppearanceWindow={openAppearanceWindow}
                        onLayoutMetaChange={ignoreLayoutMetaChange}
                      />
                    )}
                  </LoadingMotionReveal>
                ) : (
                  <LoadingMotionReveal itemId="workbench-project-mode" index={0} className="h-full min-h-0">
                    <WorkbenchViewHost
                      editModeView={editModeView}
                      workspaceMode={workspaceMode}
                      locale={locale}
                      theme={theme}
                      accentColor={accentColor}
                      directoryInfo={directoryInfo}
                      canGoBack={canGoBack}
                      canGoForward={canGoForward}
                      onGoBack={goBack}
                      onGoForward={goForward}
                      cpMaker={cpMaker}
                      onWorkbenchEvent={onWorkbenchEvent}
                      navigateToPatch={navigateToPatch}
                      onRunWithModUnsavedGuard={runWithModUnsavedGuard}
                      onRunWithCpMakerUnsavedGuard={runWithCpMakerUnsavedGuard}
                      onSetWorkspaceViewMode={setWorkspaceViewMode}
                      activeEditPatchId={activeEditPatchId}
                      playerAppearanceProfile={activePlayerAppearanceProfile}
                      onOpenPlayerAppearanceWindow={openAppearanceWindow}
                    />
                  </LoadingMotionReveal>
                )}
              </div>
            )}

            {workbenchRoute === 'home' ? (
              <WorkbenchHomePage
                workspaceMode={workspaceMode}
                workspaceViewMode={workspaceViewMode}
                hasActiveProject={Boolean(cpMaker.activeDraft)}
                gameDirectoryReady={Boolean(directoryInfo)}
                gameDirectoryStatus={directoryStatus}
                studioDeskModel={studioDeskModel}
                makerPending={makerPending}
                projectLibraryFocusKey={projectLibraryFocusKey}
                taskSummary={{
                  exportCount: studioDeskModel.gallery.projects.filter((project) => project.statuses.includes('export')).length,
                  conflictCount: studioDeskModel.stats.conflictCount,
                  directoryStatus,
                }}
                devViews={devWorkbenchViews}
                onBackToWorkspace={setWorkbenchRouteToWorkspace}
                onRootWorkspaceOpen={handleOpenRootWorkspace}
                onProjectWorkspaceOpen={handleOpenProjectWorkspace}
                onDevViewOpen={handleOpenDevView}
                onProjectCreateOpen={handleOpenProjectCreate}
                onProjectImport={handleImportDraft}
                onProjectSelect={handleSelectProjectFromHome}
                onProjectCopy={handleCopyProject}
                onProjectDelete={handleDeleteProject}
                onProjectPropertiesOpen={() => setProjectPropertiesDialogOpen(true)}
                onExportProject={() => setExportDialogOpen(true)}
                onMakerPendingChange={setMakerPending}
                onGameDirectoryAction={() => setProjectOverlayOpen(true)}
                onCloseProject={handleCloseProject}
              />
            ) : null}
          </div>
        </div>
      </div>

      <CreateDraftDialog open={createDraftDialogOpen} onClose={() => setCreateDraftDialogOpen(false)} onCreate={handleCreateDraft} />
      <ProjectPropertiesDialog
        open={projectPropertiesDialogOpen}
        metadata={{
          projectName: studioDeskModel.projectName,
          projectDescription: studioDeskModel.projectDescription,
          projectAuthor: studioDeskModel.projectAuthor,
          projectVersion: studioDeskModel.projectVersion,
          projectUniqueId: studioDeskModel.projectUniqueId,
        }}
        onClose={() => setProjectPropertiesDialogOpen(false)}
        onSave={handleUpdateDraftMetadata}
      />
      {exportDialogOpen ? (
        <ExportDialog
          open
          draftName={studioDeskModel.projectName || copy.studioDesk.noActiveDraftTitle}
          fileList={studioDeskModel.exportSummary.fileList}
          onClose={() => setExportDialogOpen(false)}
          onExport={handleExportPack}
        />
      ) : null}

      {showProjectOverlay ? (
        <InitializationOverlay
          desktopHost={desktopHost}
          gameDirectory={gameDirectory}
          detectedDirectories={knownGameDirectories}
          loading={interactionLocked}
          status={overlayError ? null : overlayStatus}
          error={overlayError}
          onGameDirectoryChange={setGameDirectory}
          onSelectDirectory={setGameDirectory}
          onChooseDirectory={handleChooseGameDirectory}
          onScanAndOpenTown={() => void handleValidateGameDirectory()}
          onRetry={() => void handleValidateGameDirectory()}
          onChooseDirectoryAction={handleChooseGameDirectory}
          onClose={needsInitialization ? undefined : () => setProjectOverlayOpen(false)}
        />
      ) : null}
    </div>
  )
}
