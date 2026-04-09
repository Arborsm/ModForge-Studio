import type { LauncherPage } from '../../lib/editor-shell'
import { useLauncherDownloads } from '../../lib/launcher/useLauncherDownloads'
import { useLauncherSettings } from '../../lib/launcher/useLauncherSettings'
import { LauncherDiscoverPage } from './pages/LauncherDiscoverPage'
import { LauncherLibraryPage } from './pages/LauncherLibraryPage'
import { LauncherSettingsPage } from './pages/LauncherSettingsPage'
import { LauncherUpdatesPage } from './pages/LauncherUpdatesPage'

type LauncherShellProps = {
  page: LauncherPage
  debugEnabled: boolean
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
  settingsState,
  downloads,
  onNavigateToSettings,
  launchGameLabel,
  launchGameDisabled,
  launchGameBusy,
  onLaunchGame,
}: LauncherShellProps) {
  const activePage = !debugEnabled && page === 'settings' ? 'library' : page

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
        {activePage === 'settings' && debugEnabled ? <LauncherSettingsPage /> : null}
      </div>
    </section>
  )
}
