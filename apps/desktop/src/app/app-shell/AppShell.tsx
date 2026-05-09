import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, ShieldAlert, X } from 'lucide-react'
import {
  canUseDesktopHost,
  clearDesktopLocaleCache,
  closeCurrentWindow,
  isCurrentWindowFullscreen,
  loadAppUiState,
  loadImageDataUrl,
  minimizeCurrentWindow,
  patchAppUiState,
  toggleFullscreenCurrentWindow,
  toggleMaximizeCurrentWindow,
  setDesktopDebugLoggingEnabled,
  writeFrontendLog,
  type LauncherPublicHtmlVerificationSnapshot,
} from '@platform/desktop'
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
import { clearLocalizedStageMetadataCache } from '@entities/event'
import { LocaleProvider } from '@locales/localeContext'
import { NotificationProvider, setNotificationSoundEnabled } from '@shared/ui/notifications'
import { configureObservability, syncDebugDiagnosticsEnabled } from '@shared/lib/observability'
import {
  applyAppUiStatePatch,
  clearLegacyBrowserUiState,
  configureAppUiStatePersistence,
  getAppUiStateSnapshot,
  initializeAppUiState,
} from '@shared/lib/app-state'
import { clearImageMetricsLocaleCache, configureImageDataUrlLoader } from '@shared/lib/assets'
import {
  loadSettledLauncherNexusDiagnostics,
  syncLauncherDiagnosticsNotification,
  useLauncherPort,
  useLauncherRuntime,
  type LauncherNexusDiagnosticsResult,
} from '@features/launcher'
import { LauncherSettingsForm } from '@features/launcher/ui/shared/LauncherSettingsForm'
import { clearMapViewportLocaleCache } from '@shared/lib/maps'
import { createAppEventBus } from '../providers/appEventBus'
import { createAppCommandHandler } from '../providers/appCommandRouting'
import { createWorkbenchOrchestration } from '../providers/workbenchOrchestration'
import { LauncherPage as LauncherPageView } from '@pages/launcher'
import { getWorkbenchViewRegistration } from '@app/registry-setup'
import type { PendingWorkbenchCommandIntent, SettingsWindowCategory } from '@shared/contracts'

const SettingsWindow = lazy(() => import('./SettingsWindow'))
const WorkbenchPage = lazy(() => import('@pages/workbench').then((module) => ({ default: module.WorkbenchPage })))

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

const IDLE_PUBLIC_HTML_VERIFICATION_STATE: LauncherPublicHtmlVerificationSnapshot = {
  state: 'idle',
  targetUrl: null,
  reason: null,
  disablePublicHtmlRoute: false,
  lastVerifiedAtMs: null,
  message: null,
}

const DEFAULT_PUBLIC_HTML_VERIFICATION_URL = 'https://www.nexusmods.com/stardewvalley'

function PublicHtmlVerificationCard({
  launcherCopy,
  verificationState,
  onOpen,
  onDisableRoute,
  onClose,
}: {
  launcherCopy: typeof editorCopy['en-US']['launcher']
  verificationState: LauncherPublicHtmlVerificationSnapshot
  onOpen: () => void
  onDisableRoute: () => void
  onClose: () => void
}) {
  const targetUrl = verificationState.targetUrl ?? DEFAULT_PUBLIC_HTML_VERIFICATION_URL
  const message =
    verificationState.state === 'opening' || verificationState.state === 'waitingForUser'
      ? launcherCopy.settings.verificationHint
      : verificationState.message ?? launcherCopy.cloudflareChallenge.detail

  return (
    <section
      data-testid="public-html-verification-card"
      className="absolute right-4 bottom-4 z-40 w-[min(420px,calc(100vw-32px))] border border-(--line-subtle) bg-(--bg-elevated) shadow-[0_20px_60px_rgba(0,0,0,0.28)]"
    >
      <header className="flex items-start justify-between gap-3 border-b border-(--line-subtle) px-4 py-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="settings-window-control-icon" aria-hidden="true">
              <ShieldAlert className="h-4 w-4" />
            </span>
            <p className="settings-window-section-title">{launcherCopy.cloudflareChallenge.title}</p>
          </div>
          <p className="settings-window-section-copy">{message}</p>
        </div>
        <button
          type="button"
          className="workspace-panel-action h-8 w-8 shrink-0"
          title={launcherCopy.actions.closeDialog}
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="settings-window-control-card">
          <p className="settings-window-section-title">{launcherCopy.settings.verificationTitle}</p>
          <p className="settings-window-section-copy break-all">{targetUrl}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="control-button h-9" onClick={onOpen}>
            <ExternalLink className="h-4 w-4" />
            {launcherCopy.settings.openVerificationAction}
          </button>
          <button type="button" className="control-button h-9" onClick={onDisableRoute}>
            <X className="h-4 w-4" />
            {launcherCopy.cloudflareChallenge.disablePublicHtmlLabel}
          </button>
        </div>
      </div>
    </section>
  )
}

export default function App() {
  const initialAppUiStateRef = useRef<ReturnType<typeof getAppUiStateSnapshot> | null>(null)
  if (!initialAppUiStateRef.current) {
    initialAppUiStateRef.current = getAppUiStateSnapshot()
  }

  const initialAppUiState = initialAppUiStateRef.current
  const initialShellState = normalizeAppShellState(initialAppUiState.shell)

  const [theme, setTheme] = useState<ThemeMode>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
  )
  const [locale, setLocale] = useState<LocaleCode>(() => resolveLocale(initialAppUiState.appearance.locale))
  const [accentPresetId, setAccentPresetId] = useState<string>(
    () => initialAppUiState.appearance.accentPresetId || ACCENT_PRESETS[0].id,
  )
  const [appMode, setAppMode] = useState<AppMode>(initialShellState.appMode)
  const [launcherPage, setLauncherPage] = useState<LauncherPage>(initialShellState.launcherPage)
  const [debugEnabled, setDebugEnabled] = useState(initialShellState.debugEnabled)
  const [notificationSoundEnabled, setNotificationSoundEnabledState] = useState(
    initialShellState.notificationSoundEnabled,
  )
  const [loadingMotionPreference, setLoadingMotionPreference] = useState<LoadingMotionPreference>(() =>
    normalizeLoadingMotionPreference(initialAppUiState.appearance?.loadingMotion),
  )
  const [appUiStateReady, setAppUiStateReady] = useState(false)
  const [settingsWindowOpen, setSettingsWindowOpen] = useState(false)
  const [settingsWindowCategory, setSettingsWindowCategory] = useState<SettingsWindowCategory>('appearance')
  const [windowIsFullscreen, setWindowIsFullscreen] = useState(false)
  const [workbenchLoaded, setWorkbenchLoaded] = useState(initialShellState.appMode === 'workbench')
  const [publicHtmlVerificationState, setPublicHtmlVerificationState] =
    useState<LauncherPublicHtmlVerificationSnapshot>(IDLE_PUBLIC_HTML_VERIFICATION_STATE)
  const previousLocaleRef = useRef<LocaleCode>(locale)
  const launcherDiagnosticsRetryRef = useRef<(() => Promise<void>) | null>(null)

  const copy = editorCopy[locale]
  const desktopHost = canUseDesktopHost()
  const launcherPort = useLauncherPort()
  const launcherRuntime = useLauncherRuntime(locale)
  const eventBus = useMemo(() => createAppEventBus(), [])
  const [pendingWorkbenchIntent, setPendingWorkbenchIntent] = useState<PendingWorkbenchCommandIntent | null>(null)
  const appCommandHandler = useMemo(
    () =>
      createAppCommandHandler({
        setAppMode,
        onPendingIntent: setPendingWorkbenchIntent,
      }),
    [],
  )
  const workbenchOrchestration = useMemo(
    () => createWorkbenchOrchestration({ dispatch: appCommandHandler.handleCommand }),
    [appCommandHandler],
  )

  useEffect(() => {
    if (appMode === 'workbench') {
      setWorkbenchLoaded(true)
    }
  }, [appMode])

  useEffect(() => eventBus.subscribe(workbenchOrchestration.handleEvent), [eventBus, workbenchOrchestration])

  useEffect(() => {
    if (!desktopHost) {
      setAppUiStateReady(true)
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

        clearLegacyBrowserUiState()
        setLocale(nextLocale)
        setAccentPresetId(state.appearance.accentPresetId || ACCENT_PRESETS[0].id)
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
    setLauncherPage('debug')
  }, [])

  const handleLauncherDiagnosticsUpdate = useCallback(
    (diagnostics: LauncherNexusDiagnosticsResult | null | undefined) => {
      syncLauncherDiagnosticsNotification(copy.launcher, diagnostics, {
        onRetry: getAppUiStateSnapshot().launcher.forceOffline ? null : () => launcherDiagnosticsRetryRef.current?.(),
        onViewDetails: handleViewLauncherDiagnostics,
      })

      const publicHtmlVerifyingRoute = diagnostics?.routes.find(
        (route) => route.routeId === 'publicHtml' && route.status === 'verifying',
      )
      if (publicHtmlVerifyingRoute && publicHtmlVerificationState.state === 'idle') {
        setPublicHtmlVerificationState({
          state: 'waitingForUser',
          targetUrl: publicHtmlVerifyingRoute.endpoint,
          reason: 'diagnostics',
          disablePublicHtmlRoute: false,
          lastVerifiedAtMs: null,
          message: copy.launcher.cloudflareChallenge.detail,
        })
      }
    },
    [copy.launcher, handleViewLauncherDiagnostics, publicHtmlVerificationState.state],
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

      await refreshLauncherDiagnostics()
    }

    return () => {
      launcherDiagnosticsRetryRef.current = null
    }
  }, [refreshLauncherDiagnostics])

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
    if (!desktopHost || !appUiStateReady) {
      return
    }

    let disposed = false
    let unlisten: (() => void) | null = null

    void launcherPort
      .loadPublicHtmlVerificationState()
      .then((state) => {
        if (!disposed) {
          setPublicHtmlVerificationState(state)
        }
      })
      .catch(() => {})

    void launcherPort
      .listenToPublicHtmlVerificationState((state) => {
        if (disposed) {
          return
        }

        setPublicHtmlVerificationState(state)
      })
      .then((unlistenFn) => {
        if (disposed) {
          unlistenFn()
          return
        }
        unlisten = unlistenFn
      })
      .catch(() => {})

    return () => {
      disposed = true
      unlisten?.()
    }
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
        launcherPage,
        debugEnabled,
        notificationSoundEnabled,
      },
    })
  }, [appMode, appUiStateReady, debugEnabled, launcherPage, notificationSoundEnabled])

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

  const activeAccentPreset = ACCENT_PRESETS.find((preset) => preset.id === accentPresetId) ?? ACCENT_PRESETS[0]

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

  const handleToggleBorderlessFullscreen = useCallback(async () => {
    const nextFullscreen = await toggleFullscreenCurrentWindow()
    setWindowIsFullscreen(nextFullscreen)
  }, [])

  const handleAppModeChange = useCallback((nextMode: AppMode) => {
    setAppMode(nextMode)
  }, [])

  const handleSwitchToLauncher = useCallback(() => {
    setAppMode('launcher')
  }, [])

  const handleLauncherPageChange = useCallback(
    (nextPage: LauncherPage) => {
      if (nextPage === 'debug' && !debugEnabled) {
        return
      }

      setLauncherPage(nextPage)
    },
    [debugEnabled],
  )

  const openSettingsWindow = useCallback((category: SettingsWindowCategory = 'appearance') => {
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
    [
      handleLoadingMotionChange,
      loadingMotionPreference.intensityId,
      loadingMotionPreference.speedId,
      loadingMotionPreference.styleId,
    ],
  )

  const settingsMenuCopy = getSettingsMenuCopy(locale)
  const showPublicHtmlVerificationCard =
    appUiStateReady &&
    !publicHtmlVerificationState.disablePublicHtmlRoute &&
    ['opening', 'waitingForUser'].includes(publicHtmlVerificationState.state)

  const handleOpenPublicHtmlVerification = useCallback(() => {
    void launcherPort.openPublicHtmlVerification({
      targetUrl: publicHtmlVerificationState.targetUrl ?? DEFAULT_PUBLIC_HTML_VERIFICATION_URL,
      reason: publicHtmlVerificationState.reason ?? 'diagnostics',
    })
  }, [launcherPort, publicHtmlVerificationState.reason, publicHtmlVerificationState.targetUrl])

  const handleDisablePublicHtmlRoute = useCallback(() => {
    void launcherPort.saveSettings({ disablePublicHtmlRoute: true })
  }, [launcherPort])

  const handleClosePublicHtmlVerification = useCallback(() => {
    void launcherPort.closePublicHtmlVerification()
  }, [launcherPort])

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
          <div className="relative h-screen w-screen overflow-hidden bg-(--bg-app) text-(--text-primary)">
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
                onToggleMaximizeWindow={() => void toggleMaximizeCurrentWindow()}
                onCloseWindow={() => void closeCurrentWindow()}
                onOpenSettings={openSettingsWindow}
                onToggleDebugMode={() => setDebugEnabled((current) => !current)}
                onLauncherEvent={eventBus.emit}
                onNavigateToDiagnostics={handleViewLauncherDiagnostics}
                onRetryDiagnostics={
                  getAppUiStateSnapshot().launcher.forceOffline ? null : async () => launcherDiagnosticsRetryRef.current?.()
                }
                onLauncherDiagnosticsUpdate={handleLauncherDiagnosticsUpdate}
              />
            ) : null}

            {workbenchLoaded ? (
              <Suspense fallback={<LoadingMotionFallback />}>
                <WorkbenchPage
                  active={appMode === 'workbench'}
                  appUiStateReady={appUiStateReady}
                  theme={theme}
                  locale={locale}
                  accentColor={activeAccentPreset.color}
                  debugEnabled={debugEnabled}
                  desktopHost={desktopHost}
                  onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
                  onSwitchToLauncher={handleSwitchToLauncher}
                  onOpenSettings={openSettingsWindow}
                  onMinimizeWindow={() => void minimizeCurrentWindow()}
                  onToggleMaximizeWindow={() => void toggleMaximizeCurrentWindow()}
                  onCloseWindow={() => void closeCurrentWindow()}
                  onWorkbenchEvent={eventBus.emit}
                  getWorkbenchViewRegistration={getWorkbenchViewRegistration}
                  pendingWorkbenchIntent={pendingWorkbenchIntent}
                  onClearPendingIntent={appCommandHandler.clearPendingIntent}
                />
              </Suspense>
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

            {showPublicHtmlVerificationCard ? (
              <PublicHtmlVerificationCard
                launcherCopy={copy.launcher}
                verificationState={publicHtmlVerificationState}
                onOpen={handleOpenPublicHtmlVerification}
                onDisableRoute={handleDisablePublicHtmlRoute}
                onClose={handleClosePublicHtmlVerification}
              />
            ) : null}
          </div>
        </LoadingMotionProvider>
      </NotificationProvider>
    </LocaleProvider>
  )
}
