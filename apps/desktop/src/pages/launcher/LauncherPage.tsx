import { useCallback, useState } from 'react'
import { LauncherDownloadsPopover } from './ui/LauncherDownloadsPopover'
import LauncherShell from './ui/LauncherShell'
import TopMenuBar from '@widgets/top-navigation'
import type { LauncherPage as LauncherPageId, AppMode, ThemeMode, WorkspaceMode } from '@locales/api'
import { useEditorCopy } from '@locales/provider'
import type { SettingsWindowCategory, WorkspacePanelMeta } from '@shared/contracts'
import type { LauncherNexusDiagnosticsResult } from '@features/launcher/model/launcherContracts'
import { useLauncherPort } from '@features/launcher/model/launcherPortContext'
import { useLauncherRuntime } from '@features/launcher/model/useLauncherRuntime'
import { useLauncherUpdateProgressNotifications } from '@features/launcher/model/useLauncherUpdateProgressNotifications'
import { publishNotification } from '@shared/ui/notifications'
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

const EMPTY_VIEW_MENU = {
  panelItems: [] as WorkspacePanelMeta[],
  presetNames: [],
  onTogglePanel: () => {},
  onResetLayout: () => {},
  onSavePreset: () => {},
  onLoadPreset: () => {},
  onDeletePreset: () => {},
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
        viewMenu={EMPTY_VIEW_MENU}
        settingsMenu={{ onOpen: () => onOpenSettings('appearance') }}
        projectMenu={{ onOpen: () => {} }}
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
