import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  canUseDesktopHost,
  forceCloseCurrentWindow,
  isCurrentWindowMaximized,
  isCurrentWindowFullscreen,
  listenToWindowCloseRequest,
  loadAppUiState,
  minimizeCurrentWindow,
  minimizeCurrentWindowToTray,
  patchAppUiState,
  toggleMaximizeCurrentWindow,
  toggleFullscreenCurrentWindow,
  setDesktopDebugLoggingEnabled,
  writeFrontendLog,
} from '@platform/host'
import { clearGameAssetLocaleCache, loadImageDataUrl } from '@entities/game/api'
import { editorCopy, type AppMode, type LauncherPage, type LocaleCode } from '@locales/api'
import { normalizeAppShellState } from '@shared/lib/app-state/appShellState'
import { LoadingMotionFallback, LoadingMotionProvider } from '@shared/ui/loading-motion'
import { clearLocalizedStageMetadataCache } from '@entities/event/model/stage/stageMetadataCache'
import { LocaleProvider } from '@locales/provider'
import { NotificationProvider, publishNotification, setNotificationSoundEnabled } from '@shared/ui/notifications'
import { configureObservability, reportAppEvent, setNotificationDispatcher, syncDebugDiagnosticsEnabled } from '@platform/observability'
import {
  applyAppUiStatePatch,
  configureAppUiStatePersistence,
  getAppUiStateSnapshot,
  initializeAppUiState,
} from '@shared/lib/app-state/appUiState'
import {
  startPreferencesRuntime,
  stopPreferencesRuntime,
  syncPreferencesStoreFromAppUiState,
  configurePreferencesHostAdapter,
  usePreferencesStore,
} from '@shared/lib/app-state/preferencesStore'
import { syncEditorModeStoreFromAppUiState } from '@shared/lib/app-state/editorModeStore'
import { clearImageMetricsLocaleCache, configureImageDataUrlLoader } from '@shared/lib/assets'
import type { LauncherNexusDiagnosticsResult } from '@features/launcher/model/launcherContracts'
import {
  getLauncherNexusWarningRoutes,
  loadSettledLauncherNexusDiagnostics,
  mergeLauncherNexusDiagnostics,
} from '@features/launcher/model/nexusDiagnostics'
import { syncLauncherDiagnosticsNotification } from '@features/launcher/model/nexusDiagnosticsNotifications'
import { useLauncherPort } from '@features/launcher/model/launcherPortContext'
import { clearMapViewportLocaleCache } from '@shared/lib/maps'
import { createAppEventBus } from '../providers/appEventBus'
import { createAppCommandHandler } from '../providers/appCommandRouting'
import { createWorkbenchOrchestration } from '../providers/workbenchOrchestration'
import { LauncherPage as LauncherPageView } from '@pages/launcher'
import { DevDebugOverlay } from '@pages/workbench/ui/DevDebugOverlay'
import type { AiSettingsTab, PendingWorkbenchCommandIntent, SettingsWindowCategory, SettingsWindowTarget } from '@shared/contracts'
import { listenForAppSettingsRequests } from '@shared/lib/app-settings-events'
import { QuitDialog } from '@widgets/quit-dialog'
import { GuideTourOverlay } from '@widgets/guide-tour'
import { useGuideEngineStore } from '@features/guide'
import { appGuideDefinitions, resolveGuideSurfaceNavigation } from '../guide-setup'
import { WorkbenchShellSkeleton } from '@shared/ui/WorkbenchShellSkeleton'
import { deferToTimeout } from '@shared/lib/react'

let settingsWindowPromise: ReturnType<typeof importSettingsWindow> | null = null
let workbenchPagePromise: ReturnType<typeof importWorkbenchPage> | null = null
let workbenchStylesPromise: Promise<unknown> | null = null

function importSettingsWindow() {
  return import('./SettingsWindow')
}

function preloadSettingsWindow() {
  settingsWindowPromise ??= importSettingsWindow()
  return settingsWindowPromise
}

function preloadWorkbenchStyles() {
  workbenchStylesPromise ??= import('../../styles/workbench.css')
  return workbenchStylesPromise
}

async function importWorkbenchPage() {
  const [workbenchModule, registrySetupModule, registryModule, cpMakerProviderModule] = await Promise.all([
    import('@pages/workbench'),
    import('@app/registry-setup'),
    import('@app/registry'),
    import('../providers/CpMakerPlatformProvider'),
    preloadWorkbenchStyles(),
  ])
  await workbenchModule.preloadWorkbenchExperience()

  return {
    default: function WorkbenchPageWithRegistry(
      props: Omit<Parameters<typeof workbenchModule.WorkbenchPage>[0], 'getWorkbenchModuleRegistration' | 'workbenchModules'>,
    ) {
      const CpMakerPlatformProvider = cpMakerProviderModule.CpMakerPlatformProvider

      return (
        <CpMakerPlatformProvider>
          <workbenchModule.WorkbenchPage
            {...props}
            getWorkbenchModuleRegistration={(moduleId) =>
              registryModule.getWorkbenchModuleRegistration(registrySetupModule.appRegistry, moduleId)
            }
            workbenchModules={registrySetupModule.appRegistry.workbenchModules}
          />
        </CpMakerPlatformProvider>
      )
    },
  }
}

function preloadWorkbenchPage() {
  workbenchPagePromise ??= importWorkbenchPage()
  return workbenchPagePromise
}

const SettingsWindow = lazy(preloadSettingsWindow)
const WorkbenchPage = lazy(preloadWorkbenchPage)

configureImageDataUrlLoader(loadImageDataUrl)
configureAppUiStatePersistence({
  canPersist: canUseDesktopHost,
  load: loadAppUiState,
  patch: patchAppUiState,
})
configurePreferencesHostAdapter({
  canUseDesktopHost,
  isCurrentWindowFullscreen,
  toggleFullscreenCurrentWindow,
})
configureObservability({
  setDebugLoggingEnabled: setDesktopDebugLoggingEnabled,
  writeFrontendLog,
})
setNotificationDispatcher(publishNotification)
useGuideEngineStore.getState().registerGuideDefinitions(appGuideDefinitions)

export default function App() {
  const [initialAppUiState] = useState(() => getAppUiStateSnapshot())
  const initialShellState = normalizeAppShellState(initialAppUiState.shell)

  const theme = usePreferencesStore((state) => state.theme)
  const locale = usePreferencesStore((state) => state.locale)
  const windowBorderTone = usePreferencesStore((state) => state.windowBorderTone)
  const windowBorderWeight = usePreferencesStore((state) => state.windowBorderWeight)
  const desktopHost = usePreferencesStore((state) => state.desktopHost)
  const hostAvailable = desktopHost || canUseDesktopHost()
  const debugEnabled = usePreferencesStore((state) => state.debugEnabled)
  const notificationSoundEnabled = usePreferencesStore((state) => state.notificationSoundEnabled)
  const loadingMotionPreference = usePreferencesStore((state) => state.loadingMotionPreference)
  const windowIsFullscreen = usePreferencesStore((state) => state.windowIsFullscreen)
  const setTheme = usePreferencesStore((state) => state.setTheme)
  const setDebugEnabled = usePreferencesStore((state) => state.setDebugEnabled)
  const [appMode, setAppMode] = useState<AppMode>(initialShellState.appMode)
  const [launcherPage, setLauncherPage] = useState<LauncherPage>(initialShellState.launcherPage)
  const [workbenchHomeActive, setWorkbenchHomeActive] = useState(initialShellState.appMode === 'workbench')
  const [appUiStateReady, setAppUiStateReady] = useState(!canUseDesktopHost())
  const [settingsWindowOpen, setSettingsWindowOpen] = useState(false)
  const [settingsShellPrepared, setSettingsShellPrepared] = useState(false)
  const [settingsWindowCategory, setSettingsWindowCategory] = useState<SettingsWindowCategory>('appearance')
  const [settingsWindowAiTab, setSettingsWindowAiTab] = useState<AiSettingsTab | null>(null)
  const [quitDialogOpen, setQuitDialogOpen] = useState(false)
  const [quitDialogRemember, setQuitDialogRemember] = useState(false)
  const [windowIsMaximized, setWindowIsMaximized] = useState(false)
  const [workbenchHasOpened, setWorkbenchHasOpened] = useState(initialShellState.appMode === 'workbench')
  const [workbenchActivationKey, setWorkbenchActivationKey] = useState(0)
  const previousLocaleRef = useRef<LocaleCode>(locale)
  const launcherPageRef = useRef<LauncherPage>(launcherPage)
  const launcherDiagnosticsRetryRef = useRef<(() => Promise<void>) | null>(null)
  const latestLauncherDiagnosticsRef = useRef<LauncherNexusDiagnosticsResult | null>(null)
  const appMountedRef = useRef(true)
  const windowCloseRequestRef = useRef<() => boolean | Promise<boolean>>(() => false)

  const copy = editorCopy[locale]
  const launcherPort = useLauncherPort()
  const eventBus = useMemo(() => createAppEventBus(), [])
  const [pendingWorkbenchIntent, setPendingWorkbenchIntent] = useState<PendingWorkbenchCommandIntent | null>(null)
  const appCommandHandler = useMemo(
    () =>
      createAppCommandHandler({
        setAppMode: (nextMode) => {
          if (nextMode === 'workbench') {
            setWorkbenchHasOpened(true)
            setWorkbenchActivationKey((current) => current + 1)
          }
          setAppMode(nextMode)
        },
        onPendingIntent: setPendingWorkbenchIntent,
      }),
    [],
  )
  const workbenchOrchestration = useMemo(
    () => createWorkbenchOrchestration({ dispatch: (command) => appCommandHandler.handleCommand(command) }),
    [appCommandHandler],
  )

  useEffect(() => {
    appMountedRef.current = true
    startPreferencesRuntime(canUseDesktopHost())

    return () => {
      appMountedRef.current = false
      stopPreferencesRuntime()
    }
  }, [])

  useEffect(() => {
    launcherPageRef.current = launcherPage
  }, [launcherPage])

  useEffect(() => eventBus.subscribe(workbenchOrchestration.handleEvent), [eventBus, workbenchOrchestration])

  const confirmAndCloseCurrentWindow = useCallback(async () => {
    const { windowCloseBehavior, rememberCloseChoice } = usePreferencesStore.getState()

    if (rememberCloseChoice) {
      if (windowCloseBehavior === 'minimizeToTray') {
        await minimizeCurrentWindowToTray()
      } else {
        await forceCloseCurrentWindow()
      }

      return windowCloseBehavior === 'quit'
    }

    setQuitDialogOpen(true)
    setQuitDialogRemember(false)
    return false
  }, [])

  const handleQuitConfirm = useCallback(async () => {
    setQuitDialogOpen(false)

    if (quitDialogRemember) {
      usePreferencesStore.getState().setWindowCloseBehavior('quit')
      usePreferencesStore.getState().setRememberCloseChoice(true)
    }

    await forceCloseCurrentWindow()
  }, [quitDialogRemember])

  const handleMinimizeToTray = useCallback(async () => {
    setQuitDialogOpen(false)

    if (quitDialogRemember) {
      usePreferencesStore.getState().setWindowCloseBehavior('minimizeToTray')
      usePreferencesStore.getState().setRememberCloseChoice(true)
    }

    await minimizeCurrentWindowToTray()
  }, [quitDialogRemember])

  const handleQuitDialogClose = useCallback(() => {
    setQuitDialogOpen(false)
  }, [])

  useEffect(() => {
    windowCloseRequestRef.current = confirmAndCloseCurrentWindow
  }, [confirmAndCloseCurrentWindow])

  useEffect(() => {
    if (!hostAvailable) {
      return
    }

    let disposed = false

    void initializeAppUiState()
      .then((state) => {
        if (disposed) {
          return
        }

        const nextShellState = normalizeAppShellState(state.shell)
        syncPreferencesStoreFromAppUiState(state, canUseDesktopHost())
        syncEditorModeStoreFromAppUiState(state.workspace.expertMode)
        if (nextShellState.appMode === 'workbench') {
          setWorkbenchHasOpened(true)
          setWorkbenchActivationKey((current) => current + 1)
        }
        setAppMode(nextShellState.appMode)
        setLauncherPage(nextShellState.launcherPage)
        setAppUiStateReady(true)
      })
      .catch(() => {
        if (!disposed) {
          setAppUiStateReady(true)
        }
      })

    return () => {
      disposed = true
    }
  }, [hostAvailable])

  const handleViewLauncherDiagnostics = useCallback(() => {
    setAppMode('launcher')
    setDebugEnabled(true)
    setLauncherPage('configuration')
  }, [])

  const handleLauncherDiagnosticsUpdate = useCallback(
    (diagnostics: LauncherNexusDiagnosticsResult | null | undefined) => {
      latestLauncherDiagnosticsRef.current = diagnostics ?? null
      syncLauncherDiagnosticsNotification(copy.launcher, diagnostics, {
        onRetry: getAppUiStateSnapshot().launcher.forceOffline ? null : () => launcherDiagnosticsRetryRef.current?.(),
        onViewDetails: handleViewLauncherDiagnostics,
      })
    },
    [copy.launcher, handleViewLauncherDiagnostics],
  )

  const refreshLauncherDiagnostics = useCallback(async () => {
    if (!hostAvailable) {
      return
    }

    const loadDiagnostics = () => launcherPort.loadNexusDiagnostics()
    await launcherPort.restartNexusDiagnostics()
    handleLauncherDiagnosticsUpdate(
      await loadSettledLauncherNexusDiagnostics({
        loadDiagnostics,
      }),
    )
  }, [hostAvailable, handleLauncherDiagnosticsUpdate, launcherPort])

  useEffect(() => {
    launcherDiagnosticsRetryRef.current = async () => {
      if (getAppUiStateSnapshot().launcher.forceOffline) {
        return
      }

      const warningRoutes = getLauncherNexusWarningRoutes(latestLauncherDiagnosticsRef.current)
      if (!warningRoutes.length) {
        await refreshLauncherDiagnostics()
        return
      }

      let latestDiagnostics: LauncherNexusDiagnosticsResult | null = latestLauncherDiagnosticsRef.current
      for (const route of warningRoutes) {
        const diagnostics = await launcherPort.retryNexusDiagnosticsRoute(route.routeId)
        latestDiagnostics = {
          routes: mergeLauncherNexusDiagnostics(latestDiagnostics?.routes ?? [], diagnostics.routes),
        }
      }
      if (latestDiagnostics) {
        handleLauncherDiagnosticsUpdate(latestDiagnostics)
      }
    }

    return () => {
      launcherDiagnosticsRetryRef.current = null
    }
  }, [handleLauncherDiagnosticsUpdate, launcherPort, refreshLauncherDiagnostics])

  useEffect(() => {
    if (!hostAvailable || !appUiStateReady) {
      return
    }

    let disposed = false

    const loadDiagnostics = () => launcherPort.loadNexusDiagnostics()

    void loadSettledLauncherNexusDiagnostics({
      loadDiagnostics,
    })
      .then((diagnostics) => {
        if (!disposed) {
          handleLauncherDiagnosticsUpdate(diagnostics)
        }
      })
      .catch(() => {})

    return () => {
      disposed = true
    }
  }, [appUiStateReady, hostAvailable, handleLauncherDiagnosticsUpdate, launcherPort])

  useEffect(() => {
    if (!hostAvailable || !appUiStateReady) {
      return
    }

    void launcherPort.setNexusForceOffline(getAppUiStateSnapshot().launcher.forceOffline).catch(() => {})
  }, [appUiStateReady, hostAvailable, launcherPort])

  useEffect(() => {
    if (appMode !== 'workbench') {
      return
    }

    void preloadWorkbenchStyles()
  }, [appMode])

  useEffect(() => {
    if (!appUiStateReady || appMode !== 'launcher') return
    let cancelled = false
    let cancelWorkbenchPreload: (() => void) | null = null
    const cancelSettingsPreload = deferToTimeout(() => {
      void preloadSettingsWindow().then(() => {
        if (cancelled) return
        setSettingsShellPrepared(true)
        cancelWorkbenchPreload = deferToTimeout(() => {
          void preloadWorkbenchPage()
        }, 0)
      })
    }, 0)
    return () => {
      cancelled = true
      cancelSettingsPreload()
      cancelWorkbenchPreload?.()
    }
  }, [appMode, appUiStateReady])

  useEffect(() => {
    if (!appUiStateReady) {
      return
    }

    void applyAppUiStatePatch({
      shell: {
        appMode,
        launcherPage: launcherPageRef.current,
        debugEnabled,
        notificationSoundEnabled,
        windowCloseBehavior: usePreferencesStore.getState().windowCloseBehavior,
        rememberCloseChoice: usePreferencesStore.getState().rememberCloseChoice,
      },
    }).catch((error) => {
      reportAppEvent({
        level: 'error',
        title: 'Failed to save app shell state',
        description: error instanceof Error ? error.message : String(error),
        notify: false,
      })
    })
  }, [appMode, appUiStateReady, debugEnabled, notificationSoundEnabled])

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

    clearGameAssetLocaleCache(previousLocale)
    clearLocalizedStageMetadataCache(previousLocale)
    clearImageMetricsLocaleCache(previousLocale)
    clearMapViewportLocaleCache(previousLocale)
    previousLocaleRef.current = locale
  }, [locale])

  const workbenchLoaded = workbenchHasOpened || appMode === 'workbench'

  useEffect(() => {
    if (!hostAvailable) {
      return
    }

    let disposed = false
    let frameId: number | null = null

    const syncWindowFrameState = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null

        void isCurrentWindowMaximized()
          .then((maximized) => {
            if (!disposed) {
              setWindowIsMaximized(maximized)
            }
          })
          .catch(() => {
            if (!disposed) {
              setWindowIsMaximized(false)
            }
          })
      })
    }

    syncWindowFrameState()
    window.addEventListener('resize', syncWindowFrameState)

    return () => {
      disposed = true
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      window.removeEventListener('resize', syncWindowFrameState)
    }
  }, [hostAvailable, settingsWindowOpen])

  const handleToggleMaximizeWindow = useCallback(async () => {
    const nextMaximized = await toggleMaximizeCurrentWindow()
    if (!appMountedRef.current) {
      return
    }

    setWindowIsMaximized(nextMaximized)
    window.requestAnimationFrame(() => {
      void isCurrentWindowMaximized().then((maximized) => {
        if (!appMountedRef.current) {
          return
        }

        setWindowIsMaximized(maximized)
      })
    })
  }, [])

  const requestGuardedWindowClose = useCallback(() => {
    return windowCloseRequestRef.current()
  }, [])
  const handleWindowCloseRequestChange = useCallback(
    (handler: (() => boolean | Promise<boolean>) | null) => {
      windowCloseRequestRef.current = handler ?? confirmAndCloseCurrentWindow
    },
    [confirmAndCloseCurrentWindow],
  )

  useEffect(() => {
    if (!hostAvailable) {
      return
    }

    let disposed = false
    let unlisten: (() => void) | null = null

    void listenToWindowCloseRequest(requestGuardedWindowClose)
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten()
          return
        }
        unlisten = nextUnlisten
      })
      .catch(() => {})

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [hostAvailable, requestGuardedWindowClose])

  const handleAppModeChange = useCallback((nextMode: AppMode) => {
    if (nextMode === 'workbench') {
      setWorkbenchHasOpened(true)
      setWorkbenchActivationKey((current) => current + 1)
    }
    setAppMode(nextMode)
  }, [])

  const handleSwitchToLauncher = useCallback(() => {
    setAppMode('launcher')
  }, [])

  const handleLauncherPageChange = useCallback((nextPage: LauncherPage) => {
    setLauncherPage(nextPage)
  }, [])

  const openSettingsWindow = useCallback((category: SettingsWindowCategory = 'appearance') => {
    if (category === 'launcher') {
      setAppMode('launcher')
      setLauncherPage('configuration')
      setSettingsWindowOpen(false)
      return
    }

    setSettingsWindowAiTab(null)
    setSettingsWindowCategory(category)
    setSettingsWindowOpen(true)
  }, [])

  const openSettingsTarget = useCallback((target: SettingsWindowTarget) => {
    if (target.category === 'launcher') {
      setAppMode('launcher')
      setLauncherPage('configuration')
      setSettingsWindowOpen(false)
      return
    }
    setSettingsWindowAiTab(target.category === 'ai' ? (target.aiTab ?? null) : null)
    setSettingsWindowCategory(target.category)
    setSettingsWindowOpen(true)
  }, [])

  useEffect(() => listenForAppSettingsRequests(openSettingsTarget), [openSettingsTarget])

  useEffect(() => {
    if (appUiStateReady) {
      useGuideEngineStore.getState().markGuideStateReady()
    }
  }, [appUiStateReady])

  const guideReplayRequest = useGuideEngineStore((state) => state.replayRequest)
  useEffect(() => {
    if (!guideReplayRequest) {
      return
    }

    const navigation = resolveGuideSurfaceNavigation(guideReplayRequest.surface)
    if (navigation?.appMode === 'workbench') {
      setWorkbenchHasOpened(true)
      setWorkbenchActivationKey((current) => current + 1)
      setAppMode('workbench')
    } else if (navigation?.appMode === 'launcher') {
      setAppMode('launcher')
      if (navigation.launcherPage) {
        setLauncherPage(navigation.launcherPage)
      }
    }

    setSettingsWindowOpen(false)
    useGuideEngineStore.getState().acknowledgeGuideReplay(guideReplayRequest.nonce)
  }, [guideReplayRequest])

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('mfSettingsMock') !== '1' && params.get('mfLauncherMock') !== '1') return
    const category = params.get('mfOpenSettings')
    if (!category) return
    const allowed: SettingsWindowCategory[] = ['appearance', 'loading', 'view', 'interaction', 'ai', 'debug']
    if (!allowed.includes(category as SettingsWindowCategory)) return
    openSettingsWindow(category as SettingsWindowCategory)
  }, [openSettingsWindow])

  return (
    <LocaleProvider locale={locale}>
      <NotificationProvider>
        <LoadingMotionProvider preference={loadingMotionPreference}>
          <div
            className="app-window-frame"
            data-window-border-tone={windowBorderTone}
            data-window-border-weight={windowBorderWeight}
            data-window-edge-to-edge={windowIsFullscreen || windowIsMaximized ? 'true' : undefined}
          >
            {appMode === 'launcher' ? (
              <LauncherPageView
                page={launcherPage}
                debugEnabled={debugEnabled}
                desktopHost={hostAvailable}
                theme={theme}
                locale={locale}
                onToggleTheme={() => {
                  const currentTheme = usePreferencesStore.getState().theme
                  setTheme(currentTheme === 'dark' ? 'light' : 'dark')
                }}
                onAppModeChange={handleAppModeChange}
                onLauncherPageChange={handleLauncherPageChange}
                onMinimizeWindow={() => void minimizeCurrentWindow()}
                onToggleMaximizeWindow={() => void handleToggleMaximizeWindow()}
                onCloseWindow={() => void requestGuardedWindowClose()}
                onOpenSettings={openSettingsWindow}
                onToggleDebugMode={() => {
                  setDebugEnabled(!usePreferencesStore.getState().debugEnabled)
                }}
                onNavigateToDiagnostics={handleViewLauncherDiagnostics}
                onRetryDiagnostics={
                  getAppUiStateSnapshot().launcher.forceOffline ? null : async () => launcherDiagnosticsRetryRef.current?.()
                }
                onLauncherDiagnosticsUpdate={handleLauncherDiagnosticsUpdate}
              />
            ) : null}

            {workbenchLoaded ? (
              <Suspense fallback={<WorkbenchShellSkeleton />}>
                <WorkbenchPage
                  active={appMode === 'workbench'}
                  appUiStateReady={appUiStateReady}
                  desktopHost={hostAvailable}
                  onToggleTheme={() => {
                    const currentTheme = usePreferencesStore.getState().theme
                    setTheme(currentTheme === 'dark' ? 'light' : 'dark')
                  }}
                  onSwitchToLauncher={handleSwitchToLauncher}
                  onOpenSettings={openSettingsWindow}
                  onMinimizeWindow={() => void minimizeCurrentWindow()}
                  onToggleMaximizeWindow={() => void handleToggleMaximizeWindow()}
                  onCloseWindow={confirmAndCloseCurrentWindow}
                  onWindowCloseRequestChange={handleWindowCloseRequestChange}
                  onHomeRouteActiveChange={setWorkbenchHomeActive}
                  onWorkbenchEvent={eventBus.emit}
                  pendingWorkbenchIntent={pendingWorkbenchIntent}
                  onClearPendingIntent={() => appCommandHandler.clearPendingIntent()}
                  workbenchActivationKey={workbenchActivationKey}
                />
              </Suspense>
            ) : null}

            {debugEnabled && !(appMode === 'workbench' && workbenchHomeActive) ? (
              <DevDebugOverlay
                contextId={appMode}
                mapName={null}
                eventName={null}
                currentEventCommandId={null}
                actorCount={0}
                contextSectionLabel={appMode === 'launcher' ? 'Launcher' : 'App'}
                contextMetrics={
                  appMode === 'launcher'
                    ? [
                        ['Page', launcherPage],
                        ['Desktop Host', hostAvailable ? 'yes' : 'no'],
                      ]
                    : [
                        ['Mode', appMode],
                        ['Desktop Host', hostAvailable ? 'yes' : 'no'],
                      ]
                }
              />
            ) : null}

            {settingsWindowOpen || settingsShellPrepared
              ? createPortal(
                  <Suspense fallback={<LoadingMotionFallback />}>
                    <SettingsWindow
                      open={settingsWindowOpen}
                      activeCategory={settingsWindowCategory}
                      initialAiTab={settingsWindowAiTab ?? undefined}
                      onActiveCategoryChange={setSettingsWindowCategory}
                      onClose={() => setSettingsWindowOpen(false)}
                    />
                  </Suspense>,
                  document.body,
                )
              : null}

            <QuitDialog
              open={quitDialogOpen}
              onClose={handleQuitDialogClose}
              onQuit={handleQuitConfirm}
              onMinimizeToTray={handleMinimizeToTray}
              rememberChoice={quitDialogRemember}
              onRememberChoiceChange={setQuitDialogRemember}
            />
            {/* The settings window portals to document.body above the guide
                overlay (dialog layer outranks the guide), so it can no longer
                be covered; keep the guide suspended while settings is open so
                the tour does not fight the modal (engine keeps the run). */}
            {settingsWindowOpen ? null : <GuideTourOverlay />}
            <div className="app-window-titlebar-divider" aria-hidden="true" />
          </div>
        </LoadingMotionProvider>
      </NotificationProvider>
    </LocaleProvider>
  )
}
