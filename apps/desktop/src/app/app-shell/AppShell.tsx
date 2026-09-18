/**
 * @file App shell root component: manages app mode switching, window controls, settings window, guide tour, and workbench lazy loading.
 */
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  canUseDesktopHost,
  forceCloseCurrentWindow,
  isCurrentWindowMaximized,
  isCurrentWindowFullscreen,
  listenToAndroidBackRequest,
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
import { isAndroidHost, notifyAndroidBackHandled } from '@platform/android'
import { clearGameAssetLocaleCache, loadImageDataUrl } from '@entities/game/api'
import { editorCopy, type AppMode, type LauncherPage, type LocaleCode } from '@locales/api'
import { canEnterWorkbench, normalizeAppShellState, resolveStartupAppMode } from '@shared/lib/app-state/appShellState'
import { LoadingMotionFallback, LoadingMotionProvider } from '@shared/ui/loading-motion'
import { clearLocalizedStageMetadataCache } from '@entities/event/model/stage/stageMetadataCache'
import { LocaleProvider } from '@locales/provider'
import { NotificationProvider, publishNotification, setNotificationSoundEnabled } from '@shared/ui/notifications'
import {
  configureObservability,
  appEvent,
  setNotificationDispatcher,
  syncDebugDiagnosticsEnabled,
  ignoreError,
} from '@platform/observability'

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
import { createAppCommandHandler } from '../providers/appCommandRouting'
import { registerAppCommandHandler } from '@shared/lib/app-runtime/appCommands'
import { LauncherPage as LauncherPageView } from '@pages/launcher'
import { useMobilePageStore } from '@pages/launcher/ui/mobile/mobilePageStore'
import { DevDebugOverlay } from '@pages/workbench/ui/DevDebugOverlay'
import type { AiSettingsTab, SettingsWindowCategory, SettingsWindowTarget } from '@shared/contracts'
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
  const [workbenchModule, pageWithRegistryModule, buildModule] = await Promise.all([
    import('@pages/workbench'),
    import('./WorkbenchPageWithRegistry'),
    import('../buildWorkbenchRegistry'),
    preloadWorkbenchStyles(),
  ])
  await workbenchModule.preloadWorkbenchExperience()
  // Build the initial workbench registry (static modules + compat plugins) and
  // publish it to the workbench registry store before the page renders. On
  // failure fall back to a static-only registry so the workbench — including
  // the plugin manager that surfaces the failure — stays reachable instead of
  // being stuck on the skeleton screen. The compat plugin error remains
  // available via the compat plugin store for the plugin manager to display.
  await buildModule.buildWorkbenchRegistry(false).catch((error) => {
    appEvent('error', 'Initial workbench registry build failed')
      .error(error)
      .context({ source: 'app-shell', operation: 'build-workbench-registry' })
      .emit({ notify: false })
    buildModule.buildStaticFallbackRegistry()
  })
  return { default: pageWithRegistryModule.WorkbenchPageWithRegistry }
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

/**
 * App shell component: coordinates launcher/workbench mode switching, window frame controls, settings window, and guide tour lifecycle.
 */
export default function App() {
  const [initialAppUiState] = useState(() => getAppUiStateSnapshot())
  const initialShellState = normalizeAppShellState(initialAppUiState.shell)

  const theme = usePreferencesStore((state) => state.theme)
  const locale = usePreferencesStore((state) => state.locale)
  const windowBorderTone = usePreferencesStore((state) => state.windowBorderTone)
  const windowBorderWeight = usePreferencesStore((state) => state.windowBorderWeight)
  const desktopHost = usePreferencesStore((state) => state.desktopHost)
  const hostAvailable = desktopHost || canUseDesktopHost()
  // Mobile launcher host: no desktop window chrome and no .NET GMCM probe; the
  // launcher trims those surfaces instead of branching on user-agent strings.
  const androidHost = isAndroidHost()
  const debugEnabled = usePreferencesStore((state) => state.debugEnabled)
  const notificationSoundEnabled = usePreferencesStore((state) => state.notificationSoundEnabled)
  const loadingMotionPreference = usePreferencesStore((state) => state.loadingMotionPreference)
  const windowIsFullscreen = usePreferencesStore((state) => state.windowIsFullscreen)
  const setTheme = usePreferencesStore((state) => state.setTheme)
  const setDebugEnabled = usePreferencesStore((state) => state.setDebugEnabled)
  const [appMode, setAppMode] = useState<AppMode>(resolveStartupAppMode(androidHost, initialShellState.appMode))
  const [launcherPage, setLauncherPage] = useState<LauncherPage>(initialShellState.launcherPage)
  const [workbenchHomeActive, setWorkbenchHomeActive] = useState(
    canEnterWorkbench(androidHost) && initialShellState.appMode === 'workbench',
  )
  const [appUiStateReady, setAppUiStateReady] = useState(!canUseDesktopHost())
  const [settingsWindowOpen, setSettingsWindowOpen] = useState(false)
  const [settingsShellPrepared, setSettingsShellPrepared] = useState(false)
  const [settingsWindowCategory, setSettingsWindowCategory] = useState<SettingsWindowCategory>('appearance')
  const [settingsWindowAiTab, setSettingsWindowAiTab] = useState<AiSettingsTab | null>(null)
  const [quitDialogOpen, setQuitDialogOpen] = useState(false)
  const [quitDialogRemember, setQuitDialogRemember] = useState(false)
  const [windowIsMaximized, setWindowIsMaximized] = useState(false)
  const [workbenchHasOpened, setWorkbenchHasOpened] = useState(canEnterWorkbench(androidHost) && initialShellState.appMode === 'workbench')
  const [workbenchActivationKey, setWorkbenchActivationKey] = useState(0)
  const previousLocaleRef = useRef<LocaleCode>(locale)
  const launcherPageRef = useRef<LauncherPage>(launcherPage)
  const launcherDiagnosticsRetryRef = useRef<(() => Promise<void>) | null>(null)
  const latestLauncherDiagnosticsRef = useRef<LauncherNexusDiagnosticsResult | null>(null)
  const appMountedRef = useRef(true)
  const windowCloseRequestRef = useRef<() => boolean | Promise<boolean>>(() => false)
  const compatReloadStateRef = useRef<{ inFlight: Promise<void> | null; pending: boolean }>({
    inFlight: null,
    pending: false,
  })

  const copy = editorCopy[locale]
  const launcherPort = useLauncherPort()
  const compatReloadDrainRef = useRef<(() => void) | null>(null)

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
        if (canEnterWorkbench(androidHost) && nextShellState.appMode === 'workbench') {
          setWorkbenchHasOpened(true)
          setWorkbenchActivationKey((current) => current + 1)
        }
        setAppMode(resolveStartupAppMode(androidHost, nextShellState.appMode))
        setLauncherPage(nextShellState.launcherPage)
        setAppUiStateReady(true)
      })
      .catch((error) => {
        appEvent('error', 'Failed to initialize app UI state')
          .error(error)
          .context({ source: 'app-shell', operation: 'initialize-app-ui-state' })
          .emit({ notify: false })
        if (!disposed) {
          setAppUiStateReady(true)
        }
      })

    return () => {
      disposed = true
    }
  }, [androidHost, hostAvailable])

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

    void ignoreError(
      loadSettledLauncherNexusDiagnostics({
        loadDiagnostics,
      }).then((diagnostics) => {
        if (!disposed) {
          handleLauncherDiagnosticsUpdate(diagnostics)
        }
      }),
      'appShell.loadDiagnostics',
    )

    return () => {
      disposed = true
    }
  }, [appUiStateReady, hostAvailable, handleLauncherDiagnosticsUpdate, launcherPort])

  useEffect(() => {
    if (!hostAvailable || !appUiStateReady) {
      return
    }

    void ignoreError(launcherPort.setNexusForceOffline(getAppUiStateSnapshot().launcher.forceOffline), 'appShell.setNexusForceOffline')
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
        // Android never downloads the workbench chunks: it is a launcher-only host.
        cancelWorkbenchPreload = canEnterWorkbench(androidHost)
          ? deferToTimeout(() => {
              void preloadWorkbenchPage()
            }, 0)
          : null
      })
    }, 0)
    return () => {
      cancelled = true
      cancelSettingsPreload()
      cancelWorkbenchPreload?.()
    }
  }, [androidHost, appMode, appUiStateReady])

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
      appEvent('error', 'Failed to save app shell state')
        .error(error)
        .context({ source: 'app-shell', operation: 'save-shell-state' })
        .emit({ notify: false })
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

  const workbenchLoaded = canEnterWorkbench(androidHost) && (workbenchHasOpened || appMode === 'workbench')

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

    void ignoreError(
      listenToWindowCloseRequest(requestGuardedWindowClose).then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten()
          return
        }
        unlisten = nextUnlisten
      }),
      'appShell.listenWindowClose',
    )

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [hostAvailable, requestGuardedWindowClose])

  const handleAppModeChange = useCallback(
    (nextMode: AppMode) => {
      if (!canEnterWorkbench(androidHost) && nextMode === 'workbench') {
        return
      }
      if (nextMode === 'workbench') {
        setWorkbenchHasOpened(true)
        setWorkbenchActivationKey((current) => current + 1)
      }
      setAppMode(nextMode)
    },
    [androidHost],
  )

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
    if (canEnterWorkbench(androidHost) && navigation?.appMode === 'workbench') {
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
  }, [androidHost, guideReplayRequest])

  useEffect(() => {
    // Suppress the native browser context menu app-wide. Interactive surfaces
    // opt into a custom Radix context menu instead; everywhere else the native
    // menu is meaningless inside the desktop shell and leaks web-platform UX.
    const handler = (event: MouseEvent) => event.preventDefault()
    document.addEventListener('contextmenu', handler)
    return () => document.removeEventListener('contextmenu', handler)
  }, [])

  useEffect(() => {
    // Android system back: close the topmost launcher utility page and claim the
    // press; with nothing to close the activity moves the task to the background.
    if (!androidHost) {
      return
    }

    let disposed = false
    let unlisten: (() => void) | null = null

    void ignoreError(
      listenToAndroidBackRequest(() => {
        // Overlay priority: settings window > bottom sheet > mod detail drawer.
        // Each layer owns an Escape handler, so synthesize the keydown on the
        // React root and let the topmost layer consume it.
        const overlayRoot = ['.settings-window-backdrop', '.mobile-sheet-root', '.launcher-library-drawer-open']
          .map((selector) => document.querySelector(selector))
          .find((node): node is Element => Boolean(node))
        if (overlayRoot) {
          document.getElementById('root')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          notifyAndroidBackHandled()
          return
        }
        const { page, closePage } = useMobilePageStore.getState()
        if (page) {
          closePage()
          notifyAndroidBackHandled()
        }
      }).then((nextUnlisten: () => void) => {
        if (disposed) {
          nextUnlisten()
          return
        }

        unlisten = nextUnlisten
      }),
      'appShell.listenAndroidBack',
    )

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [androidHost])

  useEffect(() => {
    // Lower FSD layers (plugin manager) request compat-plugin hot-reload via
    // the typed app command channel; the app shell owns the registry store and
    // rebuilds it here. On failure the previous registry is preserved and the
    // error surfaces through the compat plugin store.
    //
    // Concurrent requests (e.g. toggle and delete both firing reload, or a
    // reload button click landing while a toggle-induced reload is in flight)
    // are serialized: while one reload is running, additional requests set a
    // `pending` flag and a single trailing reload runs after the in-flight one
    // settles. This prevents epoch/double-increment races, dispose-hook
    // interleaving and last-writer-wins registry overwrites.
    const reloadStateRef = compatReloadStateRef
    const runReload = (): Promise<void> =>
      import('../buildWorkbenchRegistry')
        .then((module) => module.buildWorkbenchRegistry(true))
        .catch((error) => {
          appEvent('error', 'Compat plugin reload failed')
            .error(error)
            .context({ source: 'app-shell', operation: 'reload-compat-plugins' })
            .emit({ notify: false })
        })
        .then(() => undefined)
    const drainReload = () => {
      const state = reloadStateRef.current
      if (state.inFlight) {
        state.pending = true
        return
      }
      state.inFlight = runReload().finally(() => {
        const s = reloadStateRef.current
        s.inFlight = null
        if (s.pending) {
          s.pending = false
          drainReload()
        }
      })
    }
    compatReloadDrainRef.current = drainReload
    return () => {
      compatReloadDrainRef.current = null
    }
  }, [])

  useEffect(() => {
    const handler = createAppCommandHandler({
      openSettings: openSettingsTarget,
      reloadCompatPlugins: () => compatReloadDrainRef.current?.(),
    })
    return registerAppCommandHandler(handler.handleCommand)
  }, [openSettingsTarget])

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
            data-window-edge-to-edge={windowIsFullscreen || windowIsMaximized || androidHost ? 'true' : undefined}
          >
            {appMode === 'launcher' ? (
              <LauncherPageView
                page={launcherPage}
                debugEnabled={debugEnabled}
                desktopHost={hostAvailable}
                androidHost={androidHost}
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
            {/*The desktop coach-mark tour references desktop anchors; phones skip it.*/}
            {settingsWindowOpen || androidHost ? null : <GuideTourOverlay />}
            <div className="app-window-titlebar-divider" aria-hidden="true" />
          </div>
        </LoadingMotionProvider>
      </NotificationProvider>
    </LocaleProvider>
  )
}
