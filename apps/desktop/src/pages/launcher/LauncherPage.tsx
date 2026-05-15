import { useCallback, useState } from 'react'
import { LauncherDownloadsPopover } from './ui/LauncherDownloadsPopover'
import LauncherShell from './ui/LauncherShell'
import TopMenuBar from '@widgets/top-navigation'
import StatusBar from '@widgets/status-bar'
import type { LauncherPage as LauncherPageId, AppMode, ThemeMode, WorkspaceMode } from '@locales/editor-shell'
import { useEditorCopy } from '@locales/localeContext'
import type { SettingsWindowCategory, WorkspacePanelMeta } from '@shared/contracts'
import {
  useLauncherPort,
  useLauncherRuntime,
  useLauncherUpdateProgressNotifications,
  type LauncherNexusDiagnosticsResult,
} from '@features/launcher'
import type { LocaleCode } from '@locales'

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
  locale,
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
  const launcherRuntime = useLauncherRuntime(locale)
  useLauncherUpdateProgressNotifications(locale)
  const [launchBusy, setLaunchBusy] = useState(false)
  const launcherPort = useLauncherPort()
  const activeLauncherPage: LauncherPageId = page
  const availableLauncherPages = ['library', 'discover', 'updates', 'configuration'] as const
  const downloadsPopover = <LauncherDownloadsPopover downloads={launcherRuntime.downloads} />
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
    } catch {
      onOpenSettings('launcher')
    } finally {
      setLaunchBusy(false)
    }
  }, [desktopHost, launchBusy, launcherPort, launcherRuntime.settingsState.settings.gamePath, onOpenSettings])

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
            onNavigateToSettings={() => onLauncherPageChange('configuration')}
            launchGameLabel={copy.launcher.actions.launchGame}
            launchGameDisabled={!desktopHost || launchBusy}
            launchGameBusy={launchBusy}
            onLaunchGame={() => void handleLaunchGame()}
          />
        </div>
      </div>

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
  )
}
