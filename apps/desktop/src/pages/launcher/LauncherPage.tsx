import { useCallback, useEffect, useState } from 'react'
import { LauncherDownloadsPopover } from './ui/LauncherDownloadsPopover'
import LauncherShell from './ui/LauncherShell'
import TopMenuBar from '@widgets/top-navigation'
import type { LauncherPage as LauncherPageId, AppMode, ThemeMode, WorkspaceMode } from '@locales/api'
import { useEditorCopy } from '@locales/provider'
import type { SettingsWindowCategory } from '@shared/contracts'
import type { LauncherNexusDiagnosticsResult } from '@features/launcher/model/launcherContracts'
import { useLauncherPort } from '@features/launcher/model/launcherPortContext'
import { useLauncherRuntime } from '@features/launcher/model/useLauncherRuntime'
import { useLauncherImageFetchNotifications } from '@features/launcher/model/useLauncherImageFetchNotifications'
import { useLauncherUpdateProgressNotifications } from '@features/launcher/model/useLauncherUpdateProgressNotifications'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import type { LocaleCode } from '@locales'
import type { LauncherDiscoverSearchRequest } from './model/launcherDiscoverSearchRequest'

type LauncherPageProps = {
  page: LauncherPageId
  debugEnabled: boolean
  desktopHost: boolean
  theme: ThemeMode
  locale: LocaleCode
  onToggleTheme: () => void
  onAppModeChange: (mode: AppMode) => void
  onWorkspaceChange: (mode: WorkspaceMode) => void
  onLauncherPageChange: (page: LauncherPageId) => void
  onMinimizeWindow: () => void
  onToggleMaximizeWindow: () => void
  onCloseWindow: () => void
  onOpenSettings: (category?: SettingsWindowCategory) => void
  onToggleDebugMode: () => void
  onNavigateToDiagnostics?: () => void
  onRetryDiagnostics?: (() => Promise<void> | void) | null
  onLauncherDiagnosticsUpdate?: (diagnostics: LauncherNexusDiagnosticsResult) => void
}

type LauncherLaunchErrorDetails = {
  code: string | null
  message: string
}

function launcherLaunchErrorDetails(error: unknown): LauncherLaunchErrorDetails {
  if (error instanceof Error) {
    return { code: null, message: error.message }
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const message = typeof record.message === 'string' && record.message.trim() ? record.message : JSON.stringify(record)
    return {
      code: typeof record.code === 'string' ? record.code : null,
      message,
    }
  }

  return { code: null, message: String(error) }
}

const GMCM_PROBE_NOTIFICATION_ID = 'launcher-gmcm-probe'

function navigateToGmcmDiagnostics(onLauncherPageChange: (page: LauncherPageId) => void) {
  onLauncherPageChange('configuration')
  const startedAt = Date.now()

  const revealTarget = () => {
    const route = document.querySelector('[data-launcher-route="configuration"].launcher-shell-route-active')
    const panel = route?.querySelector<HTMLElement>('[data-testid="launcher-config-gmcm-probe"]') ?? null
    if (!panel) {
      if (Date.now() - startedAt < 5_000) {
        window.requestAnimationFrame(revealTarget)
      }
      return
    }

    panel.scrollIntoView({ block: 'center', behavior: 'smooth' })
    panel.focus({ preventScroll: true })
    panel.dataset.notificationTarget = 'true'
    window.setTimeout(() => {
      delete panel.dataset.notificationTarget
    }, 1_800)
  }

  window.requestAnimationFrame(revealTarget)
}

export function LauncherPage({
  page,
  debugEnabled,
  desktopHost,
  theme,
  onToggleTheme,
  onAppModeChange,
  onWorkspaceChange,
  onLauncherPageChange,
  onMinimizeWindow,
  onToggleMaximizeWindow,
  onCloseWindow,
  onOpenSettings,
  onToggleDebugMode,
  onNavigateToDiagnostics,
  onRetryDiagnostics,
  onLauncherDiagnosticsUpdate,
}: LauncherPageProps) {
  const copy = useEditorCopy()
  const launcherRuntime = useLauncherRuntime()
  useLauncherImageFetchNotifications()
  useLauncherUpdateProgressNotifications()
  const [launchBusy, setLaunchBusy] = useState(false)
  const [downloadInstallRequest, setDownloadInstallRequest] = useState<{ id: number; archivePaths: string[] } | null>(null)
  const [discoverSearchRequest, setDiscoverSearchRequest] = useState<LauncherDiscoverSearchRequest | null>(null)
  const launcherPort = useLauncherPort()
  const activeLauncherPage: LauncherPageId = page
  const availableLauncherPages = ['library', 'discover', 'updates', 'configuration'] as const
  const downloadsPopover = (
    <LauncherDownloadsPopover
      downloads={launcherRuntime.downloads}
      onInstallArchives={(archivePaths) => {
        setDownloadInstallRequest({ id: Date.now(), archivePaths })
      }}
    />
  )
  useEffect(() => {
    if (
      !desktopHost ||
      launcherRuntime.settingsState.state !== 'ready' ||
      launcherRuntime.settingsState.settings.gmcmParsingEnabled === false
    ) {
      dismissNotification(GMCM_PROBE_NOTIFICATION_ID)
      return
    }

    let disposed = false
    const configurationCopy = copy.launcher.configuration

    void launcherPort
      .loadGmcmProbeDiagnostics()
      .then((diagnostics) => {
        if (disposed) {
          return
        }
        if (diagnostics.status === 'ready') {
          dismissNotification(GMCM_PROBE_NOTIFICATION_ID)
          return
        }

        const warning = diagnostics.warnings.find((message) =>
          Object.prototype.hasOwnProperty.call(configurationCopy.gmcmProbeWarningMessages, message),
        )
        const repair = diagnostics.repairActions.find((action) =>
          Object.prototype.hasOwnProperty.call(configurationCopy.gmcmProbeRepairActions, action),
        )
        const description = warning
          ? configurationCopy.gmcmProbeWarningMessages[warning as keyof typeof configurationCopy.gmcmProbeWarningMessages]
          : configurationCopy.gmcmProbeUnavailable
        const note = repair
          ? configurationCopy.gmcmProbeRepairActions[repair as keyof typeof configurationCopy.gmcmProbeRepairActions]
          : configurationCopy.gmcmProbeNotificationNote
        const chips = [
          !diagnostics.probeAssemblyPath ? configurationCopy.gmcmProbeAssemblyLabel : null,
          !diagnostics.dotnetAvailable ? configurationCopy.gmcmProbeDotnetLabel : null,
          !diagnostics.net6RuntimeAvailable ? configurationCopy.gmcmProbeRuntimeLabel : null,
        ]
          .filter((label): label is string => label != null)
          .map((label) => ({ label, tone: 'warning' as const }))

        publishNotification({
          id: GMCM_PROBE_NOTIFICATION_ID,
          level: diagnostics.status === 'warning' ? 'warning' : 'error',
          variant: 'diagnostic',
          title: configurationCopy.gmcmProbeTitle,
          summary: configurationCopy.gmcmProbeNotificationImpact,
          description,
          note,
          chips,
          action: {
            label: copy.launcher.actions.viewDetails,
            callback: () => navigateToGmcmDiagnostics(onLauncherPageChange),
            tone: 'primary',
            closeOnClick: true,
          },
          autoDismissMs: null,
        })
      })
      .catch(() => {
        // Configuration page retry remains available if the startup probe itself cannot run.
      })

    return () => {
      disposed = true
    }
  }, [
    copy.launcher.actions.viewDetails,
    copy.launcher.configuration,
    desktopHost,
    launcherPort,
    launcherRuntime.settingsState.settings.gmcmParsingEnabled,
    launcherRuntime.settingsState.state,
    onLauncherPageChange,
  ])
  const handleLaunchGame = useCallback(async () => {
    if (!desktopHost || launchBusy) {
      return
    }

    if (!launcherRuntime.settingsState.settings.gamePath?.trim()) {
      onOpenSettings('launcher')
      return
    }

    setLaunchBusy(true)
    try {
      await launcherPort.launchGame()
    } catch (error) {
      const { code, message } = launcherLaunchErrorDetails(error)
      const normalizedCode = code?.toLowerCase() ?? ''
      const normalizedMessage = message.toLowerCase()
      if (normalizedCode === 'missinggamepath' || normalizedMessage.includes('game path')) {
        onOpenSettings('launcher')
      }
      publishNotification({
        level: 'error',
        title: copy.launcher.actions.launchFailed,
        description: message,
      })
    } finally {
      setLaunchBusy(false)
    }
  }, [
    copy.launcher.actions.launchFailed,
    desktopHost,
    launchBusy,
    launcherPort,
    launcherRuntime.settingsState.settings.gamePath,
    onOpenSettings,
  ])

  const handleSearchDiscover = useCallback(
    (query: string) => {
      const normalizedQuery = query.trim()
      if (!normalizedQuery) {
        return
      }
      setDiscoverSearchRequest({ id: Date.now(), query: normalizedQuery })
      onLauncherPageChange('discover')
    },
    [onLauncherPageChange],
  )

  return (
    <div className="flex h-full flex-col">
      <TopMenuBar
        appMode="launcher"
        onAppModeChange={onAppModeChange}
        workspaceMode="map"
        onWorkspaceChange={onWorkspaceChange}
        theme={theme}
        onToggleTheme={onToggleTheme}
        statusTone="idle"
        desktopHost={desktopHost}
        onMinimizeWindow={onMinimizeWindow}
        onToggleMaximizeWindow={onToggleMaximizeWindow}
        onCloseWindow={onCloseWindow}
        settingsMenu={{ onOpen: () => onOpenSettings('appearance') }}
        launcherChrome={{
          page: activeLauncherPage,
          visiblePages: [...availableLauncherPages],
          onPageChange: onLauncherPageChange,
          updatesBadgeCount: launcherRuntime.updatesBadgeCount,
          downloadsBadgeCount: launcherRuntime.downloadsBadgeCount,
          downloadsProgressPercent: launcherRuntime.downloads.downloadProgressPercent,
          downloadsHasFailure: launcherRuntime.downloadsHasFailure,
          settingsWarning: false,
          settingsWarningLabel: '',
          downloadsPopover,
        }}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-0 min-h-0 overflow-hidden">
          <LauncherShell
            page={activeLauncherPage}
            debugEnabled={debugEnabled}
            onToggleDebugMode={onToggleDebugMode}
            onNavigateToDiagnostics={onNavigateToDiagnostics}
            onRetryDiagnostics={onRetryDiagnostics}
            onLauncherDiagnosticsUpdate={onLauncherDiagnosticsUpdate}
            settingsState={launcherRuntime.settingsState}
            downloads={launcherRuntime.downloads}
            downloadInstallRequest={downloadInstallRequest}
            discoverSearchRequest={discoverSearchRequest}
            onDownloadArchivesInstalled={launcherRuntime.downloads.markArchivesInstalled}
            onNavigateToSettings={() => onLauncherPageChange('configuration')}
            onSearchDiscover={handleSearchDiscover}
            launchGameLabel={copy.launcher.actions.launchGame}
            launchGameDisabled={!desktopHost || launchBusy}
            launchGameBusy={launchBusy}
            onLaunchGame={() => void handleLaunchGame()}
          />
        </div>
      </div>
    </div>
  )
}
