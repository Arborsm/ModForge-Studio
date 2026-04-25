import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { DevDebugOverlay } from './components/DevDebugOverlay'
import StatusBar from './components/StatusBar'
import TopMenuBar from './components/TopMenuBar'
import LauncherShell from './components/launcher/LauncherShell'
import { LauncherDownloadsPopover } from './components/launcher/shared/LauncherDownloadsPopover'
import { LauncherSettingsForm } from './components/launcher/shared/LauncherSettingsForm'
import {
  canUseDesktopHost,
  clearDesktopLocaleCache,
  closeCurrentWindow,
  isCurrentWindowFullscreen,
  launchLauncherGame,
  minimizeCurrentWindow,
  restartLauncherNexusDiagnostics,
  setLauncherNexusForceOffline,
  toggleFullscreenCurrentWindow,
  toggleMaximizeCurrentWindow,
  type LauncherNexusDiagnosticsResult,
} from './lib/desktop'
import {
  editorCopy,
  getSettingsMenuCopy,
  launcherPages,
  type AppMode,
  type LauncherPage,
  type LocaleCode,
  type ThemeMode,
} from './lib/editor-shell'
import { normalizeAppShellState } from './lib/app/appShell'
import { rgbaFromHex } from './lib/app/color'
import { ACCENT_PRESETS } from './lib/app/constants'
import {
  clonePlayerAppearanceProfile,
  createDefaultPlayerAppearanceProfile,
  readStoredPlayerAppearanceState,
  sanitizePlayerAppearanceProfile,
  type PlayerAppearanceProfile,
} from './lib/app/playerAppearance'
import { clearLocalizedStageMetadataCache } from './lib/app/eventStageShared'
import { LocaleProvider } from './lib/app/localeContext'
import { NotificationProvider } from './lib/app/notifications'
import { setNotificationSoundEnabled } from './lib/app/notificationSounds'
import { syncDebugDiagnosticsEnabled } from './lib/app/observability'
import {
  applyAppUiStatePatch,
  clearLegacyBrowserUiState,
  getAppUiStateSnapshot,
  initializeAppUiState,
} from './lib/app/uiState'
import { clearImageMetricsLocaleCache } from './lib/imageMetrics'
import {
  loadSettledLauncherNexusDiagnostics,
} from './lib/launcher/nexusDiagnostics'
import {
  syncLauncherDiagnosticsNotification,
} from './lib/launcher/nexusDiagnosticsNotifications'
import { useLauncherRuntime } from './lib/launcher/useLauncherRuntime'
import { useLauncherUpdateProgressNotifications } from './lib/launcher/useLauncherUpdateProgressNotifications'
import { clearMapViewportLocaleCache } from './lib/mapViewportCache'
import type { SettingsWindowCategory } from './components/SettingsWindow'

const SettingsWindow = lazy(() => import('./components/SettingsWindow'))
const WorkbenchExperience = lazy(() => import('./components/workbench/WorkbenchExperience'))

let workbenchStylesPromise: Promise<unknown> | null = null

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

function normalizePlayerAppearanceState(
  profiles: unknown[] | null | undefined,
  activeProfileId: string | null | undefined,
) {
  return readStoredPlayerAppearanceState(JSON.stringify(Array.isArray(profiles) ? profiles : []), activeProfileId ?? null)
}

export default function App() {
  const initialAppUiStateRef = useRef<ReturnType<typeof getAppUiStateSnapshot> | null>(null)
  if (!initialAppUiStateRef.current) {
    initialAppUiStateRef.current = getAppUiStateSnapshot()
  }

  const initialAppUiState = initialAppUiStateRef.current
  const initialShellState = normalizeAppShellState(initialAppUiState.shell)
  const initialPlayerAppearanceState = normalizePlayerAppearanceState(
    initialAppUiState.appearance.playerAppearance.profiles,
    initialAppUiState.appearance.playerAppearance.activeProfileId,
  )

  const [theme, setTheme] = useState<ThemeMode>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
  )
  const [locale, setLocale] = useState<LocaleCode>(() => resolveLocale(initialAppUiState.appearance.locale))
  const [accentPresetId, setAccentPresetId] = useState<string>(
    () => initialAppUiState.appearance.accentPresetId || ACCENT_PRESETS[0].id,
  )
  const [appMode, setAppMode] = useState<AppMode>(initialShellState.appMode)
  const [launcherPage, setLauncherPage] = useState<LauncherPage>(
    initialShellState.appMode === 'launcher' ? 'library' : initialShellState.launcherPage,
  )
  const [debugEnabled, setDebugEnabled] = useState(initialShellState.debugEnabled)
  const [notificationSoundEnabled, setNotificationSoundEnabledState] = useState(initialShellState.notificationSoundEnabled)
  const [appUiStateReady, setAppUiStateReady] = useState(false)
  const [settingsWindowOpen, setSettingsWindowOpen] = useState(false)
  const [settingsWindowCategory, setSettingsWindowCategory] = useState<SettingsWindowCategory>('appearance')
  const [windowIsFullscreen, setWindowIsFullscreen] = useState(false)
  const [launcherLaunchBusy, setLauncherLaunchBusy] = useState(false)
  const [playerAppearanceProfiles, setPlayerAppearanceProfiles] = useState(initialPlayerAppearanceState.profiles)
  const [activePlayerAppearanceProfileId, setActivePlayerAppearanceProfileId] = useState<string | null>(
    initialPlayerAppearanceState.activeProfileId,
  )
  const [workbenchLoaded, setWorkbenchLoaded] = useState(initialShellState.appMode === 'workbench')
  const previousLocaleRef = useRef<LocaleCode>(locale)
  const launcherDiagnosticsRetryRef = useRef<(() => Promise<void>) | null>(null)

  const copy = editorCopy[locale]
  const desktopHost = canUseDesktopHost()
  const launcherRuntime = useLauncherRuntime(locale)

  useLauncherUpdateProgressNotifications(locale)

  useEffect(() => {
    if (appMode === 'workbench') {
      setWorkbenchLoaded(true)
    }
  }, [appMode])

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
        const nextPlayerAppearanceState = normalizePlayerAppearanceState(
          state.appearance.playerAppearance.profiles,
          state.appearance.playerAppearance.activeProfileId,
        )

        clearLegacyBrowserUiState()
        setLocale(nextLocale)
        setAccentPresetId(state.appearance.accentPresetId || ACCENT_PRESETS[0].id)
        setAppMode(nextShellState.appMode)
        setLauncherPage(nextShellState.appMode === 'launcher' ? 'library' : nextShellState.launcherPage)
        setDebugEnabled(nextShellState.debugEnabled)
        setNotificationSoundEnabledState(nextShellState.notificationSoundEnabled)
        setPlayerAppearanceProfiles(nextPlayerAppearanceState.profiles)
        setActivePlayerAppearanceProfileId(nextPlayerAppearanceState.activeProfileId)
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

  const handleLauncherDiagnosticsUpdate = useCallback((diagnostics: LauncherNexusDiagnosticsResult | null | undefined) => {
    syncLauncherDiagnosticsNotification(copy.launcher, diagnostics, {
      onRetry: getAppUiStateSnapshot().launcher.forceOffline
        ? null
        : () => launcherDiagnosticsRetryRef.current?.(),
      onViewDetails: handleViewLauncherDiagnostics,
    })
  }, [copy.launcher, handleViewLauncherDiagnostics])

  useEffect(() => {
    launcherDiagnosticsRetryRef.current = async () => {
      if (!desktopHost) {
        return
      }

      if (getAppUiStateSnapshot().launcher.forceOffline) {
        return
      }

      await restartLauncherNexusDiagnostics()

      const diagnostics = await loadSettledLauncherNexusDiagnostics()
      handleLauncherDiagnosticsUpdate(diagnostics)
    }

    return () => {
      launcherDiagnosticsRetryRef.current = null
    }
  }, [desktopHost, handleLauncherDiagnosticsUpdate])

  useEffect(() => {
    if (!desktopHost) {
      return
    }

    let disposed = false

    void loadSettledLauncherNexusDiagnostics()
      .then((diagnostics) => {
        if (disposed) {
          return
        }
        handleLauncherDiagnosticsUpdate(diagnostics)
      })
      .catch(() => {
        // Ignore startup diagnostics errors. Manual actions can still reprobe routes later.
      })

    return () => {
      disposed = true
    }
  }, [desktopHost, handleLauncherDiagnosticsUpdate])

  useEffect(() => {
    if (!desktopHost || !appUiStateReady) {
      return
    }

    void setLauncherNexusForceOffline(getAppUiStateSnapshot().launcher.forceOffline).catch(() => {
      // Startup launcher diagnostics synchronization should not block the shell.
    })
  }, [appUiStateReady, desktopHost])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.lang = locale
  }, [locale, theme])

  useEffect(() => {
    if (appMode !== 'workbench') {
      return
    }

    workbenchStylesPromise ??= import('./styles/workbench.css')
    void workbenchStylesPromise
  }, [appMode])

  useEffect(() => {
    if (!appUiStateReady) {
      return
    }

    void applyAppUiStatePatch({
      appearance: {
        locale,
      },
    })
  }, [appUiStateReady, locale])

  useEffect(() => {
    if (!appUiStateReady) {
      return
    }

    void applyAppUiStatePatch({
      shell: {
        appMode,
        launcherPage: appMode === 'workbench' ? launcherPage : 'library',
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

    void applyAppUiStatePatch({
      appearance: {
        accentPresetId: activeAccentPreset.id,
      },
    })
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

  useEffect(() => {
    if (!appUiStateReady) {
      return
    }

    void applyAppUiStatePatch({
      appearance: {
        playerAppearance: {
          profiles: playerAppearanceProfiles,
          activeProfileId: activePlayerAppearanceProfileId,
        },
      },
    })
  }, [activePlayerAppearanceProfileId, appUiStateReady, playerAppearanceProfiles])

  const activePlayerAppearanceProfile =
    playerAppearanceProfiles.find((profile) => profile.id === activePlayerAppearanceProfileId) ?? playerAppearanceProfiles[0] ?? null

  const handleCreatePlayerAppearanceProfile = useCallback(() => {
    const nextProfile = createDefaultPlayerAppearanceProfile(
      locale === 'zh-CN' ? `\u73a9\u5bb6 ${playerAppearanceProfiles.length + 1}` : `Player ${playerAppearanceProfiles.length + 1}`,
    )
    setPlayerAppearanceProfiles((current) => [...current, nextProfile])
    setActivePlayerAppearanceProfileId(nextProfile.id)
  }, [locale, playerAppearanceProfiles.length])

  const handleDuplicatePlayerAppearanceProfile = useCallback(() => {
    if (!activePlayerAppearanceProfile) {
      return
    }

    const nextProfile = clonePlayerAppearanceProfile(activePlayerAppearanceProfile)
    setPlayerAppearanceProfiles((current) => [...current, nextProfile])
    setActivePlayerAppearanceProfileId(nextProfile.id)
  }, [activePlayerAppearanceProfile])

  const handleDeletePlayerAppearanceProfile = useCallback(() => {
    if (!activePlayerAppearanceProfile) {
      return
    }

    const remainingProfiles = playerAppearanceProfiles.filter((profile) => profile.id !== activePlayerAppearanceProfile.id)
    if (remainingProfiles.length === 0) {
      const fallback = createDefaultPlayerAppearanceProfile(locale === 'zh-CN' ? '\u9ed8\u8ba4\u73a9\u5bb6' : 'Default Player')
      setPlayerAppearanceProfiles([fallback])
      setActivePlayerAppearanceProfileId(fallback.id)
      return
    }

    setPlayerAppearanceProfiles(remainingProfiles)
    setActivePlayerAppearanceProfileId(remainingProfiles[0]?.id ?? null)
  }, [activePlayerAppearanceProfile, locale, playerAppearanceProfiles])

  const handleChangePlayerAppearanceProfile = useCallback((nextProfile: PlayerAppearanceProfile) => {
    const sanitized = sanitizePlayerAppearanceProfile(nextProfile)
    setPlayerAppearanceProfiles((current) => current.map((profile) => (profile.id === sanitized.id ? sanitized : profile)))
  }, [])

  const handleImportPlayerAppearanceProfile = useCallback((nextProfile: PlayerAppearanceProfile) => {
    const sanitized = sanitizePlayerAppearanceProfile(nextProfile)
    setPlayerAppearanceProfiles((current) => [...current, sanitized])
    setActivePlayerAppearanceProfileId(sanitized.id)
  }, [])

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

  const handleLauncherPageChange = useCallback((nextPage: LauncherPage) => {
    if (nextPage === 'debug' && !debugEnabled) {
      return
    }

    setLauncherPage(nextPage)
  }, [debugEnabled])

  const openSettingsWindow = useCallback((category: SettingsWindowCategory = 'appearance') => {
    setSettingsWindowCategory(category)
    setSettingsWindowOpen(true)
  }, [])

  const handleLaunchGame = useCallback(async () => {
    if (!desktopHost || launcherLaunchBusy) {
      return
    }

    if (!launcherRuntime.settingsState.settings.gamePath?.trim()) {
      setAppMode('launcher')
      openSettingsWindow('launcher')
      return
    }

    setLauncherLaunchBusy(true)

    try {
      await launchLauncherGame()
    } catch {
      setAppMode('launcher')
      openSettingsWindow('launcher')
    } finally {
      setLauncherLaunchBusy(false)
    }
  }, [desktopHost, launcherLaunchBusy, launcherRuntime.settingsState.settings.gamePath, openSettingsWindow])

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
  const launcherSettingsWarningLabel = copy.launcher.states.settingsIncomplete
  const availableLauncherPages: LauncherPage[] = debugEnabled
    ? launcherPages
    : launcherPages.filter((page): page is Exclude<LauncherPage, 'debug'> => page !== 'debug')
  const activeLauncherPage: LauncherPage = !debugEnabled && launcherPage === 'debug' ? 'library' : launcherPage

  return (
    <LocaleProvider locale={locale}>
      <NotificationProvider>
        <div className="relative h-screen w-screen overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]">
          <div className={appMode === 'launcher' ? 'flex h-full flex-col' : 'hidden'}>
            <TopMenuBar
              appMode="launcher"
              onAppModeChange={handleAppModeChange}
              workspaceMode="map"
              onWorkspaceChange={() => {}}
              theme={theme}
              onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
              statusTone="idle"
              desktopHost={desktopHost}
              onMinimizeWindow={() => void minimizeCurrentWindow()}
              onToggleMaximizeWindow={() => void toggleMaximizeCurrentWindow()}
              onCloseWindow={() => void closeCurrentWindow()}
              viewMenu={{
                panelItems: [],
                presetNames: [],
                onTogglePanel: () => {},
                onResetLayout: () => {},
                onSavePreset: () => {},
                onLoadPreset: () => {},
                onDeletePreset: () => {},
              }}
              settingsMenu={{
                onOpen: () => openSettingsWindow('appearance'),
              }}
              projectMenu={{
                onOpen: () => {},
              }}
              launcherChrome={{
                page: activeLauncherPage,
                visiblePages: availableLauncherPages,
                onPageChange: handleLauncherPageChange,
                updatesBadgeCount: launcherRuntime.updatesBadgeCount,
                downloadsBadgeCount: launcherRuntime.downloadsBadgeCount,
                downloadsProgressPercent: launcherRuntime.downloadsProgressPercent,
                downloadsHasFailure: launcherRuntime.downloadsHasFailure,
                settingsWarning: launcherRuntime.settingsWarning,
                settingsWarningLabel: launcherSettingsWarningLabel,
                downloadsPopover: <LauncherDownloadsPopover downloads={launcherRuntime.downloads} />,
              }}
            />

            <div className="relative min-h-0 flex-1 overflow-hidden">
              <div className="absolute inset-0 min-h-0 overflow-hidden">
                <LauncherShell
                  page={activeLauncherPage}
                  debugEnabled={debugEnabled}
                  onToggleDebugMode={() => setDebugEnabled((current) => !current)}
                  onNavigateToDiagnostics={handleViewLauncherDiagnostics}
                  onRetryDiagnostics={
                    getAppUiStateSnapshot().launcher.forceOffline
                      ? null
                      : async () => launcherDiagnosticsRetryRef.current?.()
                  }
                  onLauncherDiagnosticsUpdate={handleLauncherDiagnosticsUpdate}
                  settingsState={launcherRuntime.settingsState}
                  downloads={launcherRuntime.downloads}
                  onNavigateToSettings={() => openSettingsWindow('launcher')}
                  launchGameLabel={copy.launcher.actions.launchGame}
                  launchGameDisabled={!desktopHost || launcherLaunchBusy}
                  launchGameBusy={launcherLaunchBusy}
                  onLaunchGame={() => void handleLaunchGame()}
                />
              </div>
            </div>

            {debugEnabled ? (
              <DevDebugOverlay
                workspaceMode="launcher"
                mapName={null}
                eventName={null}
                currentEventCommandId={null}
                actorCount={0}
                contextSectionLabel="Launcher"
                contextMetrics={[
                  ['Page', copy.launcher.pages[activeLauncherPage]],
                  ['Settings', launcherRuntime.settingsState.state],
                  ['Queue', String(launcherRuntime.downloads.items.length)],
                  ['Active', String(launcherRuntime.downloads.counts.downloading)],
                  ['Ready', String(launcherRuntime.downloads.counts.readyToInstall)],
                ]}
              />
            ) : null}

            <StatusBar
              appMode="launcher"
              launcherPage={activeLauncherPage}
              workspaceMode="map"
              workspaceStatus={{ tone: 'idle', message: '' }}
              directoryInfo={null}
              mapAssets={[]}
              activeAsset={null}
              mapDocument={null}
              pathLabel={copy.common.none}
              hoverInfo={null}
            />
          </div>

          {workbenchLoaded ? (
            <Suspense fallback={null}>
              <WorkbenchExperience
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
                playerAppearanceProfiles={playerAppearanceProfiles}
                activePlayerAppearanceProfileId={activePlayerAppearanceProfileId}
                onSelectPlayerAppearanceProfile={setActivePlayerAppearanceProfileId}
                onCreatePlayerAppearanceProfile={handleCreatePlayerAppearanceProfile}
                onDuplicatePlayerAppearanceProfile={handleDuplicatePlayerAppearanceProfile}
                onDeletePlayerAppearanceProfile={handleDeletePlayerAppearanceProfile}
                onImportPlayerAppearanceProfile={handleImportPlayerAppearanceProfile}
                onChangePlayerAppearanceProfile={handleChangePlayerAppearanceProfile}
              />
            </Suspense>
          ) : null}

          {settingsWindowOpen ? (
            <Suspense fallback={null}>
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
                onActiveCategoryChange={setSettingsWindowCategory}
                onClose={() => setSettingsWindowOpen(false)}
              />
            </Suspense>
          ) : null}
        </div>
      </NotificationProvider>
    </LocaleProvider>
  )
}
