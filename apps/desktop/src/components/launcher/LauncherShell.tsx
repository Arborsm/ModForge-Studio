import type { LauncherPage } from '../../lib/editor-shell'
import { useLauncherDownloads } from '../../lib/launcher/useLauncherDownloads'
import { useLauncherSettings } from '../../lib/launcher/useLauncherSettings'
import { LauncherDebugPage } from './pages/LauncherDebugPage'
import { LauncherDiscoverPage } from './pages/LauncherDiscoverPage'
import { LauncherLibraryPage } from './pages/LauncherLibraryPage'
import { LauncherUpdatesPage } from './pages/LauncherUpdatesPage'

type LauncherShellProps = {
  page: LauncherPage
  debugEnabled: boolean
  onToggleDebugMode: () => void
  settingsState: ReturnType<typeof useLauncherSettings>
  downloads: ReturnType<typeof useLauncherDownloads>
  onNavigateToSettings: () => void
  launchGameLabel: string
  launchGameDisabled: boolean
  launchGameBusy: boolean
  onLaunchGame: () => void
}

export default function LauncherShell({
  page,
  debugEnabled,
  onToggleDebugMode,
  settingsState,
  downloads,
  onNavigateToSettings,
  launchGameLabel,
  launchGameDisabled,
  launchGameBusy,
  onLaunchGame,
}: LauncherShellProps) {
  const activePage = !debugEnabled && page === 'debug' ? 'library' : page

  return (
    <section className="launcher-shell launcher-shell-routed">
      <div className="launcher-shell-content">
        {activePage === 'library' ? (
          <LauncherLibraryPage
            settings={settingsState.settings}
            launchGameLabel={launchGameLabel}
            launchGameDisabled={launchGameDisabled}
            launchGameBusy={launchGameBusy}
            onLaunchGame={onLaunchGame}
          />
        ) : null}
        {activePage === 'discover' ? (
          <LauncherDiscoverPage
            settings={settingsState.settings}
            onQueueDownload={downloads.queueDownload}
            onNavigateToSettings={onNavigateToSettings}
          />
        ) : null}
        {activePage === 'updates' ? (
          <LauncherUpdatesPage
            settings={settingsState.settings}
            onQueueDownload={downloads.queueDownload}
            onNavigateToSettings={onNavigateToSettings}
          />
        ) : null}
        {activePage === 'debug' && debugEnabled ? (
          <LauncherDebugPage debugEnabled={debugEnabled} onToggleDebugMode={onToggleDebugMode} downloads={downloads} />
        ) : null}
      </div>
    </section>
  )
}
