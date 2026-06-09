import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  canUseDesktopHost,
  forceCloseCurrentWindow,
  isCurrentWindowFullscreen,
  isCurrentWindowMaximized,
  listenToWindowCloseRequest,
  loadAppUiState,
  minimizeCurrentWindow,
  patchAppUiState,
  toggleFullscreenCurrentWindow,
  toggleMaximizeCurrentWindow,
  setDesktopDebugLoggingEnabled,
  writeFrontendLog,
} from '@shared/lib/desktop'
import { clearGameAssetLocaleCache, loadImageDataUrl } from '@entities/game/api'
import { editorCopy, getSettingsMenuCopy, type AppMode, type LauncherPage, type LocaleCode, type ThemeMode } from '@locales/editor-shell'
import { normalizeAppShellState } from '@shared/lib/app-state'
import { normalizeLoadingMotionPreference } from '@shared/lib/loading-motion'
import {
  LOADING_MOTION_STYLE_LABELS,
  LOADING_MOTION_INTENSITY_LABELS,
  LOADING_MOTION_SPEED_LABELS,
} from '@shared/contracts/types/loadingMotion'
import type {
  LoadingMotionPreference,
  LoadingMotionStyleId,
  LoadingMotionIntensityId,
  LoadingMotionSpeedId,
} from '@shared/contracts/types/loadingMotion'
import { LoadingMotionFallback, LoadingMotionProvider } from '@shared/ui/loading-motion'
import { rgbaFromHex } from '@app/app-shell/color'
import { ACCENT_PRESETS } from './constants'
import { clearLocalizedStageMetadataCache } from '@entities/event/model/stage/stageMetadataCache'
import { LocaleProvider } from '@locales/localeContext'
import { NotificationProvider, setNotificationSoundEnabled } from '@shared/ui/notifications'
import { configureObservability, syncDebugDiagnosticsEnabled } from '@shared/lib/observability'
import { applyAppUiStatePatch, configureAppUiStatePersistence, getAppUiStateSnapshot, initializeAppUiState } from '@shared/lib/app-state'
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
import type { PendingWorkbenchCommandIntent, SettingsWindowCategory, WindowBorderTone, WindowBorderWeight } from '@shared/contracts'
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
configureObservability({
  setDebugLoggingEnabled: setDesktopDebugLoggingEnabled,
  writeFrontendLog,
})

function getNavigatorLocale(): LocaleCode {
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')) {
    return 'zh-CN'
  }

  return 'en-US'
}

function resolveLocale(value: string | null | undefined): LocaleCode {
  if (value === 'zh-CN' || value === 'en-US') {
    return value
  }

  return getNavigatorLocale()
}

function normalizeWindowBorderTone(value: unknown): WindowBorderTone {
  return value === 'neutral' ? 'neutral' : 'accent'
}

function normalizeWindowBorderWeight(value: unknown): WindowBorderWeight {
  return value === 'thin' || value === 'none' ? value : 'standard'
}

export default function App() {
  const [initialAppUiState] = useState(() => getAppUiStateSnapshot())
  const initialShellState = normalizeAppShellState(initialAppUiState.shell)

  const [theme, setTheme] = useState<ThemeMode>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
  )
  const [locale, setLocale] = useState<LocaleCode>(() => resolveLocale(initialAppUiState.appearance.locale))
  const [accentPresetId, setAccentPresetId] = useState<string>(() => initialAppUiState.appearance.accentPresetId || ACCENT_PRESETS[0].id)
  const [windowBorderTone, setWindowBorderTone] = useState<WindowBorderTone>(() =>
    normalizeWindowBorderTone(initialAppUiState.appearance.windowBorderTone),
  )
  const [windowBorderWeight, setWindowBorderWeight] = useState<WindowBorderWeight>(() =>
    normalizeWindowBorderWeight(initialAppUiState.appearance.windowBorderWeight),
  )
  const [appMode, setAppMode] = useState<AppMode>(initialShellState.appMode)
  const [launcherPage, setLauncherPage] = useState<LauncherPage>(initialShellState.launcherPage)
  const [debugEnabled, setDebugEnabled] = useState(initialShellState.debugEnabled)
  const [notificationSoundEnabled, setNotificationSoundEnabledState] = useState(initialShellState.notificationSoundEnabled)
  const [loadingMotionPreference, setLoadingMotionPreference] = useState<LoadingMotionPreference>(() =>
    normalizeLoadingMotionPreference(initialAppUiState.appearance?.loadingMotion),
  )
  const [appUiStateReady, setAppUiStateReady] = useState(!canUseDesktopHost())
  const [settingsWindowOpen, setSettingsWindowOpen] = useState(false)
  const [settingsWindowCategory, setSettingsWindowCategory] = useState<SettingsWindowCategory>('appearance')
  const [windowIsFullscreen, setWindowIsFullscreen] = useState(false)
  const [windowIsMaximized, setWindowIsMaximized] = useState(false)
  const [workbenchHasOpened, setWorkbenchHasOpened] = useState(initialShellState.appMode === 'workbench')
  const [workbenchActivationKey, setWorkbenchActivationKey] = useState(0)
  const previousLocaleRef = useRef<LocaleCode>(locale)
  const launcherPageRef = useRef<LauncherPage>(launcherPage)
  const launcherDiagnosticsRetryRef = useRef<(() => Promise<void>) | null>(null)
  const latestLauncherDiagnosticsRef = useRef<LauncherNexusDiagnosticsResult | null>(null)
  const windowCloseRequestRef = useRef<() => void>(() => {
    void forceCloseCurrentWindow()
  })

  const copy = editorCopy[locale]
  const desktopHost = canUseDesktopHost()
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
    () => createWorkbenchOrchestration({ dispatch: appCommandHandler.handleCommand }),
    [appCommandHandler],
  )

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
    if (!desktopHost) {
      return
    }

    let disposed = false

    void initializeAppUiState()
      .then((state) => {
        if (disposed) {
          return
        }

        const nextShellState = normalizeAppShellState(state.shell)
        const nextLocale = resolveLocale(state.appearance.locale)

        setLocale(nextLocale)
        setAccentPresetId(state.appearance.accentPresetId || ACCENT_PRESETS[0].id)
        setWindowBorderTone(normalizeWindowBorderTone(state.appearance.windowBorderTone))
        setWindowBorderWeight(normalizeWindowBorderWeight(state.appearance.windowBorderWeight))
        if (nextShellState.appMode === 'workbench') {
          setWorkbenchHasOpened(true)
          setWorkbenchActivationKey((current) => current + 1)
        }
        setAppMode(nextShellState.appMode)
        setLauncherPage(nextShellState.launcherPage)
        setDebugEnabled(nextShellState.debugEnabled)
        setNotificationSoundEnabledState(nextShellState.notificationSoundEnabled)
        setLoadingMotionPreference(normalizeLoadingMotionPreference(state.appearance?.loadingMotion))
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
  }, [desktopHost])

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
    if (!desktopHost) {
      return
    }

    await launcherPort.restartNexusDiagnostics()
    handleLauncherDiagnosticsUpdate(
      await loadSettledLauncherNexusDiagnostics({
        loadDiagnostics: launcherPort.loadNexusDiagnostics,
      }),
    )
  }, [desktopHost, handleLauncherDiagnosticsUpdate, launcherPort])

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
    if (!desktopHost || !appUiStateReady) {
      return
    }

    let disposed = false

    void loadSettledLauncherNexusDiagnostics({
      loadDiagnostics: launcherPort.loadNexusDiagnostics,
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
  }, [appUiStateReady, desktopHost, handleLauncherDiagnosticsUpdate, launcherPort])

  useEffect(() => {
    if (!desktopHost || !appUiStateReady) {
      return
    }

    void launcherPort.setNexusForceOffline(getAppUiStateSnapshot().launcher.forceOffline).catch(() => {})
  }, [appUiStateReady, desktopHost, launcherPort])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.lang = locale
  }, [locale, theme])

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

    void applyAppUiStatePatch({ appearance: { locale } })
  }, [appUiStateReady, locale])

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

  const activeAccentPreset = ACCENT_PRESETS.find((preset) => preset.id === accentPresetId) ?? ACCENT_PRESETS[0]
  const workbenchLoaded = workbenchHasOpened || appMode === 'workbench'

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
  }, [activeAccentPreset.color, activeAccentPreset.id, theme])

  useEffect(() => {
    if (!appUiStateReady) {
      return
    }

    void applyAppUiStatePatch({ appearance: { accentPresetId: activeAccentPreset.id } })
  }, [activeAccentPreset.id, appUiStateReady])

  useEffect(() => {
    if (!appUiStateReady) {
      return
    }

    void applyAppUiStatePatch({ appearance: { windowBorderTone, windowBorderWeight } })
  }, [appUiStateReady, windowBorderTone, windowBorderWeight])

  useEffect(() => {
    if (!desktopHost) {
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

        void Promise.all([isCurrentWindowFullscreen(), isCurrentWindowMaximized()])
          .then(([fullscreen, maximized]) => {
            if (!disposed) {
              setWindowIsFullscreen(fullscreen)
              setWindowIsMaximized(maximized)
            }
          })
          .catch(() => {
            if (!disposed) {
              setWindowIsFullscreen(false)
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
  }, [desktopHost, settingsWindowOpen])

  const handleToggleBorderlessFullscreen = useCallback(async () => {
    const nextFullscreen = await toggleFullscreenCurrentWindow()
    setWindowIsFullscreen(nextFullscreen)
    if (nextFullscreen) {
      setWindowIsMaximized(false)
    }
    window.requestAnimationFrame(() => {
      void Promise.all([isCurrentWindowFullscreen(), isCurrentWindowMaximized()]).then(([fullscreen, maximized]) => {
        setWindowIsFullscreen(fullscreen)
        setWindowIsMaximized(maximized)
      })
    })
  }, [])

  const handleToggleMaximizeWindow = useCallback(async () => {
    const nextMaximized = await toggleMaximizeCurrentWindow()
    setWindowIsMaximized(nextMaximized)
    window.requestAnimationFrame(() => {
      void isCurrentWindowMaximized().then(setWindowIsMaximized)
    })
  }, [])

  const requestGuardedWindowClose = useCallback(() => {
    windowCloseRequestRef.current()
  }, [])
  const handleWindowCloseRequestChange = useCallback((handler: (() => void) | null) => {
    windowCloseRequestRef.current = handler ?? (() => void forceCloseCurrentWindow())
  }, [])

  useEffect(() => {
    if (!desktopHost) {
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
  }, [desktopHost, requestGuardedWindowClose])

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

  const handleLoadingMotionChange = useCallback(
    (nextLoadingMotion: LoadingMotionPreference) => {
      setLoadingMotionPreference(nextLoadingMotion)

      if (!appUiStateReady) {
        return
      }

      void applyAppUiStatePatch({
        appearance: {
          loadingMotion: nextLoadingMotion,
        },
      })
    },
    [appUiStateReady],
  )

  const handleSelectLoadingStyle = useCallback(
    (styleId: LoadingMotionStyleId) => {
      handleLoadingMotionChange({
        styleId,
        intensityId: loadingMotionPreference.intensityId,
        speedMode: loadingMotionPreference.speedMode,
        speedId: loadingMotionPreference.speedId,
        speedMultiplier: loadingMotionPreference.speedMultiplier,
      })
    },
    [
      handleLoadingMotionChange,
      loadingMotionPreference.intensityId,
      loadingMotionPreference.speedId,
      loadingMotionPreference.speedMode,
      loadingMotionPreference.speedMultiplier,
    ],
  )

  const handleSelectLoadingIntensity = useCallback(
    (intensityId: LoadingMotionIntensityId) => {
      handleLoadingMotionChange({
        styleId: loadingMotionPreference.styleId,
        intensityId,
        speedMode: loadingMotionPreference.speedMode,
        speedId: loadingMotionPreference.speedId,
        speedMultiplier: loadingMotionPreference.speedMultiplier,
      })
    },
    [
      handleLoadingMotionChange,
      loadingMotionPreference.speedId,
      loadingMotionPreference.speedMode,
      loadingMotionPreference.speedMultiplier,
      loadingMotionPreference.styleId,
    ],
  )

  const handleSelectLoadingSpeed = useCallback(
    (speedId: LoadingMotionSpeedId) => {
      handleLoadingMotionChange({
        styleId: loadingMotionPreference.styleId,
        intensityId: loadingMotionPreference.intensityId,
        speedMode: 'preset',
        speedId,
        speedMultiplier: loadingMotionPreference.speedMultiplier,
      })
    },
    [
      handleLoadingMotionChange,
      loadingMotionPreference.intensityId,
      loadingMotionPreference.styleId,
      loadingMotionPreference.speedMultiplier,
    ],
  )

  const handleSelectCustomLoadingSpeed = useCallback(
    (speedMultiplier: number) => {
      handleLoadingMotionChange({
        styleId: loadingMotionPreference.styleId,
        intensityId: loadingMotionPreference.intensityId,
        speedMode: 'custom',
        speedId: loadingMotionPreference.speedId,
        speedMultiplier,
      })
    },
    [handleLoadingMotionChange, loadingMotionPreference.intensityId, loadingMotionPreference.speedId, loadingMotionPreference.styleId],
  )

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
                desktopHost={desktopHost}
                theme={theme}
                locale={locale}
                onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
                onAppModeChange={handleAppModeChange}
                onWorkspaceChange={() => {}}
                onLauncherPageChange={handleLauncherPageChange}
                onMinimizeWindow={() => void minimizeCurrentWindow()}
                onToggleMaximizeWindow={() => void handleToggleMaximizeWindow()}
                onCloseWindow={() => void forceCloseCurrentWindow()}
                onOpenSettings={openSettingsWindow}
                onToggleDebugMode={() => setDebugEnabled((current) => !current)}
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
                  accentColor={activeAccentPreset.color}
                  desktopHost={desktopHost}
                  onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
                  onSwitchToLauncher={handleSwitchToLauncher}
                  onOpenSettings={openSettingsWindow}
                  onMinimizeWindow={() => void minimizeCurrentWindow()}
                  onToggleMaximizeWindow={() => void handleToggleMaximizeWindow()}
                  onCloseWindow={() => void forceCloseCurrentWindow()}
                  onWindowCloseRequestChange={handleWindowCloseRequestChange}
                  onWorkbenchEvent={eventBus.emit}
                  pendingWorkbenchIntent={pendingWorkbenchIntent}
                  onClearPendingIntent={appCommandHandler.clearPendingIntent}
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
                        ['Desktop Host', desktopHost ? 'yes' : 'no'],
                      ]
                    : [
                        ['Mode', appMode],
                        ['Desktop Host', desktopHost ? 'yes' : 'no'],
                      ]
                }
              />
            ) : null}

            {settingsWindowOpen ? (
              <Suspense fallback={<LoadingMotionFallback />}>
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
                  windowBorderToneLabel={settingsMenuCopy.windowBorderToneLabel}
                  windowBorderToneDescription={settingsMenuCopy.windowBorderToneDescription}
                  windowBorderToneOptions={(
                    Object.entries(settingsMenuCopy.windowBorderToneOptions) as Array<[WindowBorderTone, string]>
                  ).map(([id, label]) => ({ id, label }))}
                  activeWindowBorderTone={windowBorderTone}
                  windowBorderWeightLabel={settingsMenuCopy.windowBorderWeightLabel}
                  windowBorderWeightDescription={settingsMenuCopy.windowBorderWeightDescription}
                  windowBorderWeightOptions={(
                    Object.entries(settingsMenuCopy.windowBorderWeightOptions) as Array<[WindowBorderWeight, string]>
                  ).map(([id, label]) => ({ id, label }))}
                  activeWindowBorderWeight={windowBorderWeight}
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
                  activeCategory={settingsWindowCategory}
                  accentOptions={ACCENT_PRESETS}
                  activeAccentId={activeAccentPreset.id}
                  onSelectAccent={setAccentPresetId}
                  onResetAccent={() => setAccentPresetId(ACCENT_PRESETS[0].id)}
                  onSelectLocale={setLocale}
                  onSelectWindowBorderTone={setWindowBorderTone}
                  onSelectWindowBorderWeight={setWindowBorderWeight}
                  onToggleBorderlessFullscreen={() => void handleToggleBorderlessFullscreen()}
                  onToggleNotificationSound={() => setNotificationSoundEnabledState((current) => !current)}
                  onToggleDebugMode={() => setDebugEnabled((current) => !current)}
                  loadingMotionStyleLabel={settingsMenuCopy.loadingMotionStyleLabel}
                  loadingMotionStyleDescription={settingsMenuCopy.loadingMotionStyleDescription}
                  loadingMotionIntensityLabel={settingsMenuCopy.loadingMotionIntensityLabel}
                  loadingMotionIntensityDescription={settingsMenuCopy.loadingMotionIntensityDescription}
                  loadingMotionSpeedLabel={settingsMenuCopy.loadingMotionSpeedLabel}
                  loadingMotionSpeedDescription={settingsMenuCopy.loadingMotionSpeedDescription}
                  loadingMotionCustomSpeedLabel={settingsMenuCopy.loadingMotionCustomSpeedLabel}
                  loadingMotionCustomSpeedDescription={settingsMenuCopy.loadingMotionCustomSpeedDescription}
                  loadingMotionCustomSpeedToggleLabel={settingsMenuCopy.loadingMotionCustomSpeedToggleLabel}
                  loadingMotionPresetSpeedToggleLabel={settingsMenuCopy.loadingMotionPresetSpeedToggleLabel}
                  loadingMotionSpeedValueLabel={settingsMenuCopy.loadingMotionSpeedValueLabel}
                  activeLoadingStyleId={loadingMotionPreference.styleId}
                  activeLoadingIntensityId={loadingMotionPreference.intensityId}
                  activeLoadingSpeedMode={loadingMotionPreference.speedMode}
                  activeLoadingSpeedId={loadingMotionPreference.speedId}
                  activeLoadingSpeedMultiplier={loadingMotionPreference.speedMultiplier}
                  onSelectLoadingStyle={handleSelectLoadingStyle}
                  onSelectLoadingIntensity={handleSelectLoadingIntensity}
                  onSelectLoadingSpeed={handleSelectLoadingSpeed}
                  onSelectCustomLoadingSpeed={handleSelectCustomLoadingSpeed}
                  loadingStyleOptions={LOADING_MOTION_STYLE_LABELS.map((entry) => ({
                    id: entry.id,
                    label: locale === 'zh-CN' ? entry.labelZh : entry.labelEn,
                  }))}
                  loadingIntensityOptions={LOADING_MOTION_INTENSITY_LABELS.map((entry) => ({
                    id: entry.id,
                    label: locale === 'zh-CN' ? entry.labelZh : entry.labelEn,
                  }))}
                  loadingSpeedOptions={LOADING_MOTION_SPEED_LABELS.map((entry) => ({
                    id: entry.id,
                    label: locale === 'zh-CN' ? entry.labelZh : entry.labelEn,
                  }))}
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
