import { useMemo } from 'react'
import type { LauncherPage } from '../../lib/editor-shell'
import { useLauncherDownloads } from '../../lib/launcher/useLauncherDownloads'
import { useLauncherLibrary } from '../../lib/launcher/useLauncherLibrary'
import { useLauncherSettings } from '../../lib/launcher/useLauncherSettings'
import { LauncherDebugPage } from './pages/LauncherDebugPage'
import { LauncherDiscoverPage } from './pages/LauncherDiscoverPage'
import { LauncherLibraryPageContent } from './pages/LauncherLibraryPage'
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
  const library = useLauncherLibrary(settingsState.settings)
  const libraryPage = useMemo(
    () => (
      <LauncherLibraryPageContent
        settings={settingsState.settings}
        library={library}
        launchGameLabel={launchGameLabel}
        launchGameDisabled={launchGameDisabled}
        launchGameBusy={launchGameBusy}
        onLaunchGame={onLaunchGame}
      />
    ),
    [library, settingsState.settings, launchGameLabel, launchGameDisabled, launchGameBusy, onLaunchGame],
  )

  return (
    <section className="launcher-shell launcher-shell-routed">
      <div className="launcher-shell-content">
        <div key="library" hidden={activePage !== 'library'}>
          {libraryPage}
        </div>
        <div key="discover" hidden={activePage !== 'discover'}>
          {activePage === 'discover' ? (
            <LauncherDiscoverPage
              settings={settingsState.settings}
              onQueueDownload={downloads.queueDownload}
              onNavigateToSettings={onNavigateToSettings}
            />
          ) : null}
        </div>
        <div key="updates" hidden={activePage !== 'updates'}>
          {activePage === 'updates' ? (
            <LauncherUpdatesPage
              settings={settingsState.settings}
              onQueueDownload={downloads.queueDownload}
              onNavigateToSettings={onNavigateToSettings}
            />
          ) : null}
        </div>
        <div key="debug" hidden={activePage !== 'debug' || !debugEnabled}>
          {activePage === 'debug' && debugEnabled ? (
            <LauncherDebugPage debugEnabled={debugEnabled} onToggleDebugMode={onToggleDebugMode} downloads={downloads} />
          ) : null}
        </div>
      </div>
    </section>
  )
}
