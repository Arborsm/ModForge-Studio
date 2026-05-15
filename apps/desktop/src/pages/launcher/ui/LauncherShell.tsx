import { Suspense, lazy, useMemo } from 'react'
import type { LauncherPage } from '@locales/editor-shell'
import type { LauncherNexusDiagnosticsResult } from '@shared/contracts'
import { LoadingMotionFallback } from '@shared/ui/loading-motion'
import { useLauncherDownloads } from '@features/launcher'
import { useLauncherLibrary } from '@features/launcher'
import { useLauncherSettings } from '@features/launcher'
import { LauncherLibraryPageContent } from './LauncherLibraryPage'
import { cx } from '@shared/lib/cx'

const LauncherDiscoverPage = lazy(() => import('./LauncherDiscoverPage').then((module) => ({ default: module.LauncherDiscoverPage })))
const LauncherUpdatesPage = lazy(() => import('./LauncherUpdatesPage').then((module) => ({ default: module.LauncherUpdatesPage })))
const LauncherConfigurationPage = lazy(() =>
  import('./LauncherConfigurationPage').then((module) => ({ default: module.LauncherConfigurationPage })),
)

type LauncherShellProps = {
  page: LauncherPage
  debugEnabled: boolean
  onToggleDebugMode: () => void
  onNavigateToDiagnostics?: () => void
  onRetryDiagnostics?: (() => Promise<void> | void) | null
  onLauncherDiagnosticsUpdate?: (diagnostics: LauncherNexusDiagnosticsResult) => void
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
  onNavigateToDiagnostics,
  onRetryDiagnostics,
  onLauncherDiagnosticsUpdate,
  settingsState,
  downloads,
  onNavigateToSettings,
  launchGameLabel,
  launchGameDisabled,
  launchGameBusy,
  onLaunchGame,
}: LauncherShellProps) {
  const activePage = page
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
        <div
          key="library"
          hidden={activePage !== 'library'}
          className={cx('launcher-shell-route', activePage === 'library' && 'launcher-shell-route-active')}
        >
          {libraryPage}
        </div>
        <div
          key="discover"
          hidden={activePage !== 'discover'}
          className={cx('launcher-shell-route', activePage === 'discover' && 'launcher-shell-route-active')}
        >
          <Suspense fallback={<LoadingMotionFallback />}>
            {activePage === 'discover' ? (
              <LauncherDiscoverPage
                settings={settingsState.settings}
                onQueueDownload={downloads.queueDownload}
                onNavigateToDiagnostics={onNavigateToDiagnostics}
                onRetryDiagnostics={onRetryDiagnostics}
                onNavigateToSettings={onNavigateToSettings}
              />
            ) : null}
          </Suspense>
        </div>
        <div
          key="updates"
          hidden={activePage !== 'updates'}
          className={cx('launcher-shell-route', activePage === 'updates' && 'launcher-shell-route-active')}
        >
          <Suspense fallback={<LoadingMotionFallback />}>
            {activePage === 'updates' ? (
              <LauncherUpdatesPage
                settings={settingsState.settings}
                onQueueDownload={downloads.queueDownload}
                onNavigateToDiagnostics={onNavigateToDiagnostics}
                onRetryDiagnostics={onRetryDiagnostics}
                onNavigateToSettings={onNavigateToSettings}
              />
            ) : null}
          </Suspense>
        </div>
        <div
          key="configuration"
          hidden={activePage !== 'configuration'}
          className={cx('launcher-shell-route', activePage === 'configuration' && 'launcher-shell-route-active')}
        >
          <Suspense fallback={<LoadingMotionFallback />}>
            {activePage === 'configuration' ? (
              <LauncherConfigurationPage
                debugEnabled={debugEnabled}
                onToggleDebugMode={onToggleDebugMode}
                onLauncherDiagnosticsUpdate={onLauncherDiagnosticsUpdate}
                settingsState={settingsState}
                downloads={downloads}
              />
            ) : null}
          </Suspense>
        </div>
      </div>
    </section>
  )
}
