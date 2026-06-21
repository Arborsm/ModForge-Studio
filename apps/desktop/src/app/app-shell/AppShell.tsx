import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  canUseDesktopHost,
  forceCloseCurrentWindow,
  isCurrentWindowMaximized,
  isCurrentWindowFullscreen,
  listenToWindowCloseRequest,
  loadAppUiState,
  minimizeCurrentWindow,
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
import { THEME_PRESETS } from '@shared/lib/theme/presets'
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
import type { PendingWorkbenchCommandIntent, SettingsWindowCategory } from '@shared/contracts'
import { WorkbenchShellSkeleton } from '@shared/ui/WorkbenchShellSkeleton'

const SettingsWindow = lazy(() => import('./SettingsWindow'))
const WorkbenchPage = lazy(async () => {
  const [workbenchModule, registryModule, cpMakerProviderModule] = await Promise.all([
    import('@pages/workbench'),
    import('@app/registry-setup'),
    import('../providers/CpMakerPlatformProvider'),
  ])

  return {
    default: function WorkbenchPageWithRegistry(
      props: Omit<Parameters<typeof workbenchModule.WorkbenchPage>[0], 'getWorkbenchViewRegistration' | 'workbenchViews'>,
    ) {
      const CpMakerPlatformProvider = cpMakerProviderModule.CpMakerPlatformProvider

      return (
        <CpMakerPlatformProvider>
          <workbenchModule.WorkbenchPage
            {...props}
            getWorkbenchViewRegistration={registryModule.getWorkbenchViewRegistration}
            workbenchViews={registryModule.appRegistry.workbenchViews}
          />
        </CpMakerPlatformProvider>
      )
    },
  }
})

let workbenchStylesPromise: Promise<unknown> | null = null

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

export default function App() {
  const [initialAppUiState] = useState(() => getAppUiStateSnapshot())
  const initialShellState = normalizeAppShellState(initialAppUiState.shell)

  const theme = usePreferencesStore((state) => state.theme)
  const locale = usePreferencesStore((state) => state.locale)
  const themeId = usePreferencesStore((state) => state.themeId)
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
  const [appUiStateReady, setAppUiStateReady] = useState(!canUseDesktopHost())
  const [settingsWindowOpen, setSettingsWindowOpen] = useState(false)
  const [settingsWindowCategory, setSettingsWindowCategory] = useState<SettingsWindowCategory>('appearance')
  const [windowIsMaximized, setWindowIsMaximized] = useState(false)
  const [workbenchHasOpened, setWorkbenchHasOpened] = useState(initialShellState.appMode === 'workbench')
  const [workbenchActivationKey, setWorkbenchActivationKey] = useState(0)
  const previousLocaleRef = useRef<LocaleCode>(locale)
  const launcherPageRef = useRef<LauncherPage>(launcherPage)
  const launcherDiagnosticsRetryRef = useRef<(() => Promise<void>) | null>(null)
  const latestLauncherDiagnosticsRef = useRef<LauncherNexusDiagnosticsResult | null>(null)
  const appMountedRef = useRef(true)
  const windowCloseRequestRef = useRef<() => void>(() => {
    void forceCloseCurrentWindow()
  })

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

  useEffect(() => {
    windowCloseRequestRef.current = () => {
      void forceCloseCurrentWindow()
    }
  }, [])

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

    workbenchStylesPromise ??= import('../../styles/workbench.css')
    void workbenchStylesPromise
  }, [appMode])

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

  const activeTheme = THEME_PRESETS.find((preset) => preset.id === themeId) ?? THEME_PRESETS[0]
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
    windowCloseRequestRef.current()
  }, [])
  const handleWindowCloseRequestChange = useCallback((handler: (() => void) | null) => {
    windowCloseRequestRef.current = handler ?? (() => void forceCloseCurrentWindow())
  }, [])

  useEffect(() => {
    if (!hostAvailable) {
      return
    }

    let disposed = false
    let unlisten: (() => void) | null = null

    void listenToWindowCloseRequest(() => {
      requestGuardedWindowClose()
    })
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

    setSettingsWindowCategory(category)
    setSettingsWindowOpen(true)
  }, [])

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
                onWorkspaceChange={() => {}}
                onLauncherPageChange={handleLauncherPageChange}
                onMinimizeWindow={() => void minimizeCurrentWindow()}
                onToggleMaximizeWindow={() => void handleToggleMaximizeWindow()}
                onCloseWindow={() => void forceCloseCurrentWindow()}
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
                  theme={theme}
                  locale={locale}
                  accentColor={activeTheme.accent}
                  desktopHost={hostAvailable}
                  onToggleTheme={() => {
                    const currentTheme = usePreferencesStore.getState().theme
                    setTheme(currentTheme === 'dark' ? 'light' : 'dark')
                  }}
                  onSwitchToLauncher={handleSwitchToLauncher}
                  onOpenSettings={openSettingsWindow}
                  onMinimizeWindow={() => void minimizeCurrentWindow()}
                  onToggleMaximizeWindow={() => void handleToggleMaximizeWindow()}
                  onCloseWindow={() => void forceCloseCurrentWindow()}
                  onWindowCloseRequestChange={handleWindowCloseRequestChange}
                  onWorkbenchEvent={eventBus.emit}
                  pendingWorkbenchIntent={pendingWorkbenchIntent}
                  onClearPendingIntent={() => appCommandHandler.clearPendingIntent()}
                  workbenchActivationKey={workbenchActivationKey}
                />
              </Suspense>
            ) : null}

            {debugEnabled ? (
              <DevDebugOverlay
                workspaceMode={appMode === 'launcher' ? 'launcher' : 'map'}
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

            {settingsWindowOpen ? (
              <Suspense fallback={<LoadingMotionFallback />}>
                <SettingsWindow
                  open={settingsWindowOpen}
                  activeCategory={settingsWindowCategory}
                  onActiveCategoryChange={setSettingsWindowCategory}
                  onClose={() => setSettingsWindowOpen(false)}
                />
              </Suspense>
            ) : null}
            <div className="app-window-titlebar-divider" aria-hidden="true" />
          </div>
        </LoadingMotionProvider>
      </NotificationProvider>
    </LocaleProvider>
  )
}
