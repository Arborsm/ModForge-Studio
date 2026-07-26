import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import type { LauncherPage } from '@locales/api'
import type { LauncherNexusDiagnosticsResult } from '@features/launcher/model/launcherContracts'
import { LoadingMotionFallback } from '@shared/ui/loading-motion'
import { useLauncherDownloads } from '@features/launcher/model/useLauncherDownloads'
import { useLauncherLibrary } from '@features/launcher/model/useLauncherLibrary'
import { useLauncherSettings } from '@features/launcher/model/useLauncherSettings'
import { LauncherLibraryPageContent } from './LauncherLibraryPage'
import { cx } from '@shared/lib/helper'
import type { LauncherDiscoverSearchRequest } from '../model/launcherDiscoverSearchRequest'

const LauncherDiscoverPage = lazy(() => import('./LauncherDiscoverPage').then((module) => ({ default: module.LauncherDiscoverPage })))
const LauncherUpdatesPage = lazy(() => import('./LauncherUpdatesPage').then((module) => ({ default: module.LauncherUpdatesPage })))
const LauncherConfigurationPage = lazy(() =>
  import('./LauncherConfigurationPage').then((module) => ({ default: module.LauncherConfigurationPage })),
)

const INITIAL_CACHED_PAGES = new Set<LauncherPage>(['library'])

type LauncherShellProps = {
  page: LauncherPage
  debugEnabled: boolean
  onToggleDebugMode: () => void
  onNavigateToDiagnostics?: () => void
  onRetryDiagnostics?: (() => Promise<void> | void) | null
  onLauncherDiagnosticsUpdate?: (diagnostics: LauncherNexusDiagnosticsResult) => void
  settingsState: ReturnType<typeof useLauncherSettings>
  downloads: ReturnType<typeof useLauncherDownloads>
  downloadInstallRequest?: { id: number; archivePaths: string[] } | null
  discoverSearchRequest?: LauncherDiscoverSearchRequest | null
  onDownloadArchivesInstalled?: (archivePaths: string[]) => void
  onNavigateToSettings: () => void
  onSearchDiscover?: (query: string) => void
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
  downloadInstallRequest,
  discoverSearchRequest,
  onDownloadArchivesInstalled,
  onNavigateToSettings,
  onSearchDiscover,
  launchGameLabel,
  launchGameDisabled,
  launchGameBusy,
  onLaunchGame,
}: LauncherShellProps) {
  const activePage = page
  const library = useLauncherLibrary(settingsState.settings)
  const cachedPagesRef = useRef<Set<LauncherPage>>(new Set([...INITIAL_CACHED_PAGES, activePage]))
  const [enteringPage, setEnteringPage] = useState<LauncherPage | null>(activePage)
  const [enterSequence, setEnterSequence] = useState(0)
  if (!cachedPagesRef.current.has(activePage)) {
    cachedPagesRef.current.add(activePage)
  }

  useEffect(() => {
    setEnteringPage(null)
    const scheduleFrame =
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0)
    const cancelFrame =
      typeof window.cancelAnimationFrame === 'function'
        ? window.cancelAnimationFrame.bind(window)
        : (handle: number) => window.clearTimeout(handle)
    const frameId = scheduleFrame(() => {
      setEnteringPage(activePage)
      setEnterSequence((current) => current + 1)
    })

    return () => cancelFrame(frameId)
  }, [activePage])

  const getRouteProps = (route: LauncherPage) => {
    const active = activePage === route
    const entering = active && enteringPage === route

    return {
      hidden: !active,
      className: cx('launcher-shell-route', active && 'launcher-shell-route-active', entering && 'launcher-shell-route-enter'),
      'data-launcher-route': route,
      'data-launcher-route-enter': entering ? enterSequence : undefined,
      'data-guide-surface': `launcher.${route}`,
    }
  }
  const shouldRenderRoute = (route: LauncherPage) => cachedPagesRef.current.has(route)

  const libraryRouteEnterSequenceRef = useRef(0)
  if (activePage === 'library' && enterSequence > 0) {
    libraryRouteEnterSequenceRef.current = enterSequence
  }
  const libraryRouteEnterSequence = libraryRouteEnterSequenceRef.current
  const libraryPage = useMemo(
    () => (
      <LauncherLibraryPageContent
        settings={settingsState.settings}
        library={library}
        routeEnterSequence={libraryRouteEnterSequence}
        launchGameLabel={launchGameLabel}
        launchGameDisabled={launchGameDisabled}
        launchGameBusy={launchGameBusy}
        onLaunchGame={onLaunchGame}
        onQueueDownload={downloads.queueDownload}
        onSearchDiscover={onSearchDiscover}
        downloadInstallRequest={downloadInstallRequest}
        onDownloadArchivesInstalled={onDownloadArchivesInstalled}
        onNavigateToSettings={onNavigateToSettings}
      />
    ),
    [
      downloadInstallRequest,
      downloads.queueDownload,
      library,
      onDownloadArchivesInstalled,
      onNavigateToSettings,
      onSearchDiscover,
      settingsState.settings,
      launchGameLabel,
      launchGameDisabled,
      launchGameBusy,
      onLaunchGame,
    ],
  )

  return (
    <section className="launcher-shell launcher-shell-routed">
      <div className="launcher-shell-content">
        <div key="library" {...getRouteProps('library')}>
          {libraryPage}
        </div>
        <div key="discover" {...getRouteProps('discover')}>
          {shouldRenderRoute('discover') ? (
            <Suspense fallback={<LoadingMotionFallback />}>
              <LauncherDiscoverPage
                settings={settingsState.settings}
                onQueueDownload={downloads.queueDownload}
                onNavigateToDiagnostics={onNavigateToDiagnostics}
                onRetryDiagnostics={onRetryDiagnostics}
                onNavigateToSettings={onNavigateToSettings}
                searchRequest={discoverSearchRequest}
              />
            </Suspense>
          ) : null}
        </div>
        <div key="updates" {...getRouteProps('updates')}>
          {shouldRenderRoute('updates') ? (
            <Suspense fallback={<LoadingMotionFallback />}>
              <LauncherUpdatesPage
                settings={settingsState.settings}
                onQueueDownload={downloads.queueDownload}
                onQueueDownloads={downloads.queueDownloads}
                onNavigateToDiagnostics={onNavigateToDiagnostics}
                onRetryDiagnostics={onRetryDiagnostics}
                onNavigateToSettings={onNavigateToSettings}
              />
            </Suspense>
          ) : null}
        </div>
        <div key="configuration" {...getRouteProps('configuration')}>
          {shouldRenderRoute('configuration') ? (
            <Suspense fallback={<LoadingMotionFallback />}>
              <LauncherConfigurationPage
                debugEnabled={debugEnabled}
                onToggleDebugMode={onToggleDebugMode}
                onLauncherDiagnosticsUpdate={onLauncherDiagnosticsUpdate}
                settingsState={settingsState}
                downloads={downloads}
              />
            </Suspense>
          ) : null}
        </div>
      </div>
    </section>
  )
}
