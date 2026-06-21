import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceLayoutHandle, WorkspacePanelMeta } from '@shared/contracts'
import { editorCopy, type AppMode, type LocaleCode, type ThemeMode, type WorkspaceMode } from '@locales/api'
import { useModWorkspaceCopy } from '@locales/provider'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import { WorkspaceDecisionDialog } from '../workspaces/mod'
import type { ModI18nStatusFilter } from '../workspaces/mod-i18n'
import { useCpMaker, getEditModeRoute, buildStudioDeskModel } from '@features/cp-maker'
import StatusBar from '@widgets/status-bar'
import TopMenuBar from '@widgets/top-navigation'
import '../model/builtInWorkspaces'
import { scheduleDeferred } from '@shared/lib/react'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'
import { reportAppEvent } from '@platform/observability'
import type { SettingsWindowCategory } from '@shared/contracts'
import type { AppEvent, PendingWorkbenchCommandIntent, WorkbenchViewRegistration } from '@shared/contracts'
import InitializationOverlay from './InitializationOverlay'
import { WorkbenchMapPreviewRuntime, type MapPreviewStatusSnapshot } from './WorkbenchMapPreviewRuntime'
import { WorkbenchPreviewRuntime, type PreviewStatusSnapshot } from './WorkbenchPreviewRuntime'
import { WorkbenchModPreviewRuntime, type ModPreviewStatusSnapshot, type ModWorkspaceGuardHandle } from './WorkbenchModPreviewRuntime'
import WorkbenchLaunchpadNavigation from './WorkbenchLaunchpadNavigation'
import { WorkbenchViewHost } from './WorkbenchViewHost'
import { useEditModeNavigation } from '../model/useEditModeNavigation'
import { usePlayerAppearanceState } from '../model/usePlayerAppearanceState'
import { useWorkspaceLayoutPersistence } from '../model/useWorkspaceLayoutPersistence'
import { useWorkbenchModeTransitions } from '../model/useWorkbenchModeTransitions'
import { useWorkbenchCommandIntent } from '../model/workbenchCommandIntent'
import { useWorkbenchStatus } from '../model/useWorkbenchStatus'
import { useWorkbenchGameDirectory } from '../model/useWorkbenchGameDirectory'
import { LoadingMotionFallback, LoadingMotionReveal } from '@shared/ui/loading-motion'
import type { ResourcePreloadState, WorkspaceStatus } from '@entities/map'

const PlayerAppearanceWindow = lazy(() => import('./PlayerAppearanceWindow'))
const RESOURCE_PRELOAD_NOTIFICATION_ID = 'app-resource-preload'
const EMPTY_RESOURCE_PRELOAD_STATE: ResourcePreloadState = {
  active: false,
  message: '',
  completed: 0,
  total: 0,
  currentLabel: '',
}
const EMPTY_WORKSPACE_STATUS: WorkspaceStatus = {
  tone: 'idle',
  message: '',
}

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
  onCloseWindow: () => boolean | Promise<boolean>
  onWindowCloseRequestChange?: (handler: (() => boolean | Promise<boolean>) | null) => void
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
  onWindowCloseRequestChange,
  onWorkbenchEvent,
  getWorkbenchViewRegistration,
  workbenchViews = [],
  workbenchActivationKey = 0,
}: WorkbenchExperienceProps) {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('mods')
  const [workspaceViewMode, setWorkspaceViewMode] = useState<'edit' | 'preview'>('edit')
  const [deferredHeavyWorkspaceMode, setDeferredHeavyWorkspaceMode] = useState<WorkspaceMode | null>(null)
  const [projectOverlayOpen, setProjectOverlayOpen] = useState(false)
  const [closedWorkbenchLaunchpadKey, setClosedWorkbenchLaunchpadKey] = useState<number | null>(null)
  const [registeredWorkbenchViewId, setRegisteredWorkbenchViewId] = useState<string | null>(null)
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
  const [pendingCpMakerUnsavedAction, setPendingCpMakerUnsavedAction] = useState<(() => void | Promise<void>) | null>(null)
  const [cpMakerUnsavedSaving, setCpMakerUnsavedSaving] = useState(false)
  const [cpMakerUnsavedError, setCpMakerUnsavedError] = useState<string | null>(null)

  const storedRecentGameDirectories = getAppUiStateSnapshot()?.appearance.recentGameDirectories ?? []
  const [viewMenuPanelItems, setViewMenuPanelItems] = useState<WorkspacePanelMeta[]>([])
  const [viewMenuPresetNames, setViewMenuPresetNames] = useState<string[]>([])
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
  const mapAssets = workspaceMode === 'map' ? mapPreviewSnapshot.mapAssets : []
  const activeAsset = workspaceMode === 'map' ? mapPreviewSnapshot.activeAsset : null
  const mapDocument = workspaceMode === 'map' ? mapPreviewSnapshot.mapDocument : null
  const worldAtlasDocument = workspaceMode === 'map' ? mapPreviewSnapshot.worldAtlasDocument : null
  const hoverInfo = workspaceMode === 'map' ? mapPreviewSnapshot.hoverInfo : null
  const [modGuardHandle, setModGuardHandle] = useState<ModWorkspaceGuardHandle | null>(null)
  const [modPreviewStatusSnapshot, setModPreviewStatusSnapshot] = useState<ModPreviewStatusSnapshot>({
    diagnostics: [],
    hasUnsavedChanges: false,
    projectsCount: 0,
    activeProjectDetail: null,
    statusMessage: '',
  })
  const modWorkspaceCopy = useModWorkspaceCopy()

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
        })
      })
    },
    [handleWorkspaceViewModeChange, runWithCpMakerUnsavedGuard, runWithModUnsavedGuard, workspaceViewMode],
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
  const devWorkbenchViews = useMemo(
    () =>
      import.meta.env.DEV
        ? workbenchViews
            .filter((view) => view.devOnly)
            .map((view) => ({
              ...view,
              active: view.viewId === registeredWorkbenchViewId,
            }))
            .slice()
            .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
        : [],
    [registeredWorkbenchViewId, workbenchViews],
  )

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
  const showProjectOverlay = !registeredWorkbenchViewId && (needsInitialization || projectOverlayOpen)
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
        void runWithModUnsavedGuard(() => {
          void runWithCpMakerUnsavedGuard(() => {
            setWorkbenchLaunchpadOpen(false)
            onSwitchToLauncher()
          })
        })
      }
    },
    [onSwitchToLauncher, runWithCpMakerUnsavedGuard, runWithModUnsavedGuard, setWorkbenchLaunchpadOpen],
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

  const handleOpenRootWorkspace = useCallback(
    (mode: WorkspaceMode) => {
      if (mode === 'mods') {
        setRegisteredWorkbenchViewId(null)
        handleWorkspaceChange(mode)
        return
      }

      void runWithModUnsavedGuard(() => {
        setRegisteredWorkbenchViewId(null)
        setWorkspaceViewMode('preview')
        setWorkspaceMode(mode)
      })
    },
    [handleWorkspaceChange, runWithModUnsavedGuard],
  )

  const handleOpenProjectWorkspace = useCallback(
    (mode: WorkspaceMode) => {
      void runWithModUnsavedGuard(() => {
        setRegisteredWorkbenchViewId(null)
        setWorkspaceViewMode('edit')
        setWorkspaceMode(mode)
        resetNavigation()
      })
    },
    [resetNavigation, runWithModUnsavedGuard],
  )

  const handleOpenProjectPage = useCallback(() => {
    void runWithModUnsavedGuard(() => {
      void runWithCpMakerUnsavedGuard(() => {
        setRegisteredWorkbenchViewId(null)
        setWorkspaceMode('mods')
        setWorkspaceViewMode('edit')
        setStudioDeskGalleryOpen(false)
        resetNavigation()
      })
    })
  }, [resetNavigation, runWithCpMakerUnsavedGuard, runWithModUnsavedGuard])

  const handleOpenProjectManagement = useCallback(() => {
    void runWithModUnsavedGuard(() => {
      void runWithCpMakerUnsavedGuard(() => {
        setRegisteredWorkbenchViewId(null)
        setWorkspaceMode('mods')
        setWorkspaceViewMode('edit')
        setStudioDeskGalleryOpen(true)
        resetNavigation()
      })
    })
  }, [resetNavigation, runWithCpMakerUnsavedGuard, runWithModUnsavedGuard])

  const handleOpenProjectCreate = useCallback(() => {
    void runWithModUnsavedGuard(() => {
      void runWithCpMakerUnsavedGuard(() => {
        setRegisteredWorkbenchViewId(null)
        setWorkspaceMode('mods')
        setWorkspaceViewMode('edit')
        setStudioDeskGalleryOpen(true)
        setStudioDeskCreateDialogOpenSignal((current) => current + 1)
        resetNavigation()
      })
    })
  }, [resetNavigation, runWithCpMakerUnsavedGuard, runWithModUnsavedGuard])

  const handleSelectProjectForLaunchpad = useCallback(
    (draftStorageKey: string) => {
      void runWithModUnsavedGuard(async () => {
        await runWithCpMakerUnsavedGuard(async () => {
          await cpMaker.loadDraft(draftStorageKey)
          onWorkbenchEvent({
            type: 'cp-maker/draft-selected',
            draftKey: draftStorageKey,
          })
        })
      })
    },
    [cpMaker, onWorkbenchEvent, runWithCpMakerUnsavedGuard, runWithModUnsavedGuard],
  )

  const handleChooseGameDirectory = useCallback(() => {
    void chooseDirectory()
  }, [chooseDirectory])

  const handleValidateGameDirectory = useCallback(async () => {
    void runWithModUnsavedGuard(() => {
      void runWithCpMakerUnsavedGuard(async () => {
        const info = await validateCurrentDirectory()
        if (!info) {
          return
        }

        setProjectOverlayOpen(false)
        setWorkspaceMode('map')
        setWorkspaceViewMode('preview')
      })
    })
  }, [runWithCpMakerUnsavedGuard, runWithModUnsavedGuard, validateCurrentDirectory])

  const projectManagementActive = editModeView?.viewId === 'studio-desk' && workspaceViewMode === 'edit' && studioDeskGalleryOpen
  const workbenchQuickDock = (
    <WorkbenchLaunchpadNavigation
      open={workbenchLaunchpadOpen}
      workspaceMode={workspaceMode}
      workspaceViewMode={workspaceViewMode}
      dockPlacement="titlebar"
      hasActiveProject={Boolean(cpMaker.activeDraft)}
      projectManagementActive={projectManagementActive}
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
        void runWithModUnsavedGuard(() => {
          void runWithCpMakerUnsavedGuard(() => {
            setRegisteredWorkbenchViewId(viewId)
            setWorkspaceViewMode('edit')
            setWorkbenchLaunchpadOpen(false)
            resetNavigation()
          })
        })
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

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <WorkbenchMapPreviewRuntime
          copy={copy}
          locale={locale}
          theme={theme}
          accentColor={accentColor}
          desktopHost={desktopHost}
          active={active}
          visible={workspaceViewMode === 'preview' && workspaceMode === 'map'}
          directoryInfo={directoryInfo}
          heavyWorkspaceReady={deferredHeavyWorkspaceMode === 'map'}
          workspaceLayoutRef={workspaceLayoutRef}
          workspaceLayoutStorageKey={workspaceLayoutStorageKey}
          workspaceLayouts={workspaceLayouts}
          onPersistStateChange={handleWorkspacePersistStateChange}
          onLayoutMetaChange={handleLayoutMetaChange}
          onDirectoryInvalid={handleDirectoryInvalid}
          onStatusSnapshotChange={setMapPreviewSnapshot}
        />
        {workspaceViewMode === 'preview' && workspaceMode === 'map' ? null : (
          <div className="absolute inset-0 min-h-0 overflow-hidden">
            {workspaceViewMode === 'preview' ? (
              <LoadingMotionReveal itemId="workbench-preview-mode" index={0} className="h-full min-h-0">
                {workspaceMode === 'mods' || workspaceMode === 'mod-i18n' ? (
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
                    onLayoutMetaChange={handleLayoutMetaChange}
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
                    onLayoutMetaChange={handleLayoutMetaChange}
                    onDirectoryInvalid={handleDirectoryInvalid}
                    onMapStatusSnapshotChange={setMapPreviewSnapshot}
                    onStatusSnapshotChange={setPreviewStatusSnapshot}
                    playerAppearanceProfile={activePlayerAppearanceProfile}
                    onOpenPlayerAppearanceWindow={openAppearanceWindow}
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
                  studioDeskModel={studioDeskModel}
                  onWorkbenchEvent={onWorkbenchEvent}
                  navigateToPatch={navigateToPatch}
                  onSetWorkspaceMode={setWorkspaceMode}
                  onRunWithModUnsavedGuard={runWithModUnsavedGuard}
                  onRunWithCpMakerUnsavedGuard={runWithCpMakerUnsavedGuard}
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
        )}
      </div>

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
          eventName={previewStatusSnapshot.selectedEvent?.eventId ?? null}
          eventPreconditions={previewStatusSnapshot.selectedEvent?.preconditions}
          eventCommandCount={previewStatusSnapshot.selectedEvent?.commands.length ?? 0}
          eventActorCount={previewStatusSnapshot.selectedEvent?.scene.actors.length ?? 0}
          currentEventCommandId={previewStatusSnapshot.currentEventCommandId}
          patchName={activeEditPatchId ?? null}
          scriptLength={previewStatusSnapshot.selectedEvent?.rawScript.length}
          isModified={
            previewStatusSnapshot.selectedEvent
              ? previewStatusSnapshot.selectedEvent.rawScript !==
                (previewStatusSnapshot.parsedEventAsset?.events.find((event) => event.key === previewStatusSnapshot.selectedEvent?.key)
                  ?.rawScript ?? previewStatusSnapshot.selectedEvent.rawScript)
              : false
          }
        />
      ) : null}
    </div>
  )
}
