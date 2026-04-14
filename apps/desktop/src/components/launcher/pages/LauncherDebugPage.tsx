import { Bug, Download, MessageSquare, ScrollText, Wifi } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '../../../lib/app/uiState'
import { cx } from '../../../lib/cx'
import { useEditorCopy, useSettingsMenuCopy } from '../../../lib/app/localeContext'
import { reportAppEvent, type AppEventLevel } from '../../../lib/app/observability'
import {
  canUseDesktopHost,
  clearLauncherImageCache,
  type LauncherNexusDiagnosticsResult,
  loadLauncherNexusDiagnostics,
  setLauncherNexusForceOffline,
  type LauncherNexusRouteSnapshot,
} from '../../../lib/desktop'
import { useLauncherDownloads } from '../../../lib/launcher/useLauncherDownloads'

type DebugButtonGroup = Record<'debug' | 'info' | 'success' | 'warning' | 'error', string>
type DebugLogButtonGroup = Record<'debug' | 'info' | 'warning' | 'error', string>

function getRouteAvailabilityCopy(
  route: LauncherNexusRouteSnapshot,
  labels: {
    available: string
    unavailable: string
    loading: string
  },
) {
  if (route.status === 'loading') {
    return labels.loading
  }

  if (route.available && route.status === 'success') {
    return labels.available
  }

  return labels.unavailable
}

function NotificationTestButtons({ labels, debugEnabled }: { labels: DebugButtonGroup; debugEnabled: boolean }) {
  const notify = (level: AppEventLevel, title: string) => {
    reportAppEvent({
      level,
      title,
      description: `Launcher debug notification test: ${level}`,
      debugDiagnosticsEnabled: debugEnabled,
      keyValues: {
        source: 'launcher-debug-page',
        kind: 'notification-test',
        level,
      },
    })
  }

  return (
    <div className="launcher-toolbar">
      <button type="button" className="control-button launcher-debug-level-button launcher-debug-level-button-debug" onClick={() => notify('debug', labels.debug)}>
        {labels.debug}
      </button>
      <button type="button" className="control-button launcher-debug-level-button launcher-debug-level-button-info" onClick={() => notify('info', labels.info)}>
        {labels.info}
      </button>
      <button type="button" className="control-button launcher-debug-level-button launcher-debug-level-button-success" onClick={() => notify('success', labels.success)}>
        {labels.success}
      </button>
      <button type="button" className="control-button launcher-debug-level-button launcher-debug-level-button-warning" onClick={() => notify('warning', labels.warning)}>
        {labels.warning}
      </button>
      <button type="button" className="control-button launcher-debug-level-button launcher-debug-level-button-error" onClick={() => notify('error', labels.error)}>
        {labels.error}
      </button>
    </div>
  )
}

function LogTestButtons({ labels, debugEnabled }: { labels: DebugLogButtonGroup; debugEnabled: boolean }) {
  const logOnly = (level: Extract<AppEventLevel, 'debug' | 'info' | 'warning' | 'error'>, title: string) => {
    reportAppEvent({
      level,
      title,
      description: `Launcher debug log test: ${level}`,
      debugDiagnosticsEnabled: debugEnabled,
      notify: false,
      keyValues: {
        source: 'launcher-debug-page',
        kind: 'log-test',
        level,
      },
    })
  }

  return (
    <div className="launcher-toolbar">
      <button type="button" className="control-button launcher-debug-level-button launcher-debug-level-button-debug" onClick={() => logOnly('debug', labels.debug)}>
        {labels.debug}
      </button>
      <button type="button" className="control-button launcher-debug-level-button launcher-debug-level-button-info" onClick={() => logOnly('info', labels.info)}>
        {labels.info}
      </button>
      <button type="button" className="control-button launcher-debug-level-button launcher-debug-level-button-warning" onClick={() => logOnly('warning', labels.warning)}>
        {labels.warning}
      </button>
      <button type="button" className="control-button launcher-debug-level-button launcher-debug-level-button-error" onClick={() => logOnly('error', labels.error)}>
        {labels.error}
      </button>
    </div>
  )
}

type LauncherDebugPageProps = {
  debugEnabled: boolean
  onToggleDebugMode: () => void
  onLauncherDiagnosticsUpdate?: (diagnostics: LauncherNexusDiagnosticsResult) => void
  downloads: ReturnType<typeof useLauncherDownloads>
}

function DebugModeSwitch({
  checked,
  title,
  description,
  enabledLabel,
  disabledLabel,
  onToggle,
}: {
  checked: boolean
  title: string
  description: string
  enabledLabel: string
  disabledLabel: string
  onToggle: () => void
}) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <section className="launcher-debug-card">
      <div className="launcher-debug-card-header launcher-debug-card-header-center">
        <div className="launcher-debug-setting">
          <span className="launcher-debug-setting-icon" aria-hidden="true">
            <Bug className="h-4 w-4" />
          </span>
          <div className="launcher-debug-setting-copy">
            <h2 id={titleId} className="launcher-debug-card-title">
              {title}
            </h2>
            <p id={descriptionId} className="launcher-debug-card-description">
              {description}
            </p>
          </div>
        </div>

        <button
          type="button"
          className={cx('settings-switch', checked && 'settings-switch-active')}
          role="switch"
          aria-checked={checked}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          title={checked ? disabledLabel : enabledLabel}
          onClick={onToggle}
        >
          <span className="settings-switch-copy">{checked ? disabledLabel : enabledLabel}</span>
          <span className="settings-switch-track" aria-hidden="true">
            <span className="settings-switch-thumb" />
          </span>
        </button>
      </div>
    </section>
  )
}

function DebugActionCard({
  title,
  description,
  icon,
  headerActions,
  children,
}: {
  title: string
  description: string
  icon: ReactNode
  headerActions?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="launcher-debug-card">
      <div className="launcher-debug-card-header">
        <div className="launcher-debug-card-copy">
          <h2 className="launcher-debug-card-title">{title}</h2>
          <p className="launcher-debug-card-description">{description}</p>
        </div>
        <div className="launcher-debug-card-header-side">
          {headerActions ? <div className="launcher-debug-card-header-actions">{headerActions}</div> : null}
          <span className="launcher-debug-card-badge" aria-hidden="true">
            {icon}
          </span>
        </div>
      </div>
      {children != null ? <div className="launcher-debug-card-tray">{children}</div> : null}
    </section>
  )
}

function LauncherNexusDiagnosticsCard({
  title,
  description,
  loadingLabel,
  emptyLabel,
  endpointLabel,
  attemptsLabel,
  routeLabel,
  observedLabel,
  availabilityLabel,
  availableState,
  unavailableState,
  loadingState,
  forceOfflineEnableButton,
  forceOfflineDisableButton,
  forceOfflineEnabledLabel,
  forceOfflineDisabledLabel,
  onDiagnosticsUpdate,
}: {
  title: string
  description: string
  loadingLabel: string
  emptyLabel: string
  endpointLabel: string
  attemptsLabel: string
  routeLabel: string
  observedLabel: string
  availabilityLabel: string
  availableState: string
  unavailableState: string
  loadingState: string
  forceOfflineEnableButton: string
  forceOfflineDisableButton: string
  forceOfflineEnabledLabel: string
  forceOfflineDisabledLabel: string
  onDiagnosticsUpdate?: (diagnostics: LauncherNexusDiagnosticsResult) => void
}) {
  const [routes, setRoutes] = useState<LauncherNexusRouteSnapshot[]>([])
  const [loading, setLoading] = useState(() => canUseDesktopHost())
  const [forceOffline, setForceOffline] = useState(() => getAppUiStateSnapshot().launcher.forceOffline)
  const [toggleBusy, setToggleBusy] = useState(false)
  const [pollNonce, setPollNonce] = useState(0)

  useEffect(() => {
    if (!canUseDesktopHost()) {
      return
    }

    let disposed = false
    let timeoutId: number | null = null

    const poll = async () => {
      try {
        const diagnostics = await loadLauncherNexusDiagnostics()
        if (disposed) {
          return
        }

        setRoutes(diagnostics.routes)
        onDiagnosticsUpdate?.(diagnostics)
        setLoading(false)
        if (diagnostics.routes.some((route) => route.status === 'loading')) {
          timeoutId = window.setTimeout(() => {
            void poll()
          }, 1000)
        }
      } catch {
        if (!disposed) {
          setLoading(false)
          setRoutes([])
        }
      }
    }

    void poll()

    return () => {
      disposed = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [onDiagnosticsUpdate, pollNonce])

  const handleToggleForceOffline = async () => {
    const nextForceOffline = !forceOffline
    setToggleBusy(true)

    try {
      const diagnostics = await setLauncherNexusForceOffline(nextForceOffline)
      await applyAppUiStatePatch({
        launcher: {
          forceOffline: nextForceOffline,
        },
      })
      setForceOffline(nextForceOffline)
      setRoutes(diagnostics.routes)
      onDiagnosticsUpdate?.(diagnostics as LauncherNexusDiagnosticsResult)
      setLoading(false)
      if (diagnostics.routes.some((route) => route.status === 'loading')) {
        setLoading(true)
        setPollNonce((value) => value + 1)
      }
    } catch {
      // Debug-only control: leave the last known state in place on bridge failures.
    } finally {
      setToggleBusy(false)
    }
  }

  return (
    <DebugActionCard
      title={title}
      description={description}
      icon={<Wifi className="h-4 w-4" />}
      headerActions={
        <div className="launcher-toolbar">
          <button
            type="button"
            className={cx('control-button', forceOffline && 'control-button-primary')}
            disabled={!canUseDesktopHost() || toggleBusy}
            onClick={() => {
              void handleToggleForceOffline()
            }}
          >
            {forceOffline ? forceOfflineDisableButton : forceOfflineEnableButton}
          </button>
          <span className="dock-chip">{forceOffline ? forceOfflineEnabledLabel : forceOfflineDisabledLabel}</span>
        </div>
      }
    >
      {loading ? <p className="launcher-debug-route-loading">{loadingLabel}</p> : null}
      {!loading && !routes.length ? <p className="launcher-debug-route-loading">{emptyLabel}</p> : null}
      {!loading && routes.length ? (
        <div className="launcher-debug-route-list">
          {routes.map((route) => (
            <section
              key={route.routeId}
              className={cx(
                'launcher-debug-route-row',
                `launcher-debug-route-row-${route.status}`,
              )}
            >
              <div className="launcher-debug-route-top">
                <div className="launcher-debug-route-copy">
                  <h3 className="launcher-debug-route-title">{route.label}</h3>
                </div>
                <span
                  className={cx(
                    'launcher-debug-route-status',
                    `launcher-debug-route-status-${route.status}`,
                  )}
                >
                  {route.status}
                </span>
              </div>

              <div className="launcher-debug-route-meta">
                <span className="launcher-debug-route-chip">
                  <strong>{endpointLabel}</strong>
                  <span>{route.endpoint}</span>
                </span>
                <span className="launcher-debug-route-chip">
                  <strong>{attemptsLabel}</strong>
                  <span>{`${route.attempts} / ${route.maxAttempts}`}</span>
                </span>
                <span className="launcher-debug-route-chip">
                  <strong>{routeLabel}</strong>
                  <span>{route.routeId}</span>
                </span>
              </div>

              <div className="launcher-debug-route-details">
                <div className="launcher-debug-route-detail-row">
                  <div className="launcher-debug-route-detail-label">{observedLabel}</div>
                  <div className="launcher-debug-route-detail-value">{route.message}</div>
                </div>
                <div className="launcher-debug-route-detail-row">
                  <div className="launcher-debug-route-detail-label">{availabilityLabel}</div>
                  <div className="launcher-debug-route-detail-value">
                    {getRouteAvailabilityCopy(route, {
                      available: availableState,
                      unavailable: unavailableState,
                      loading: loadingState,
                    })}
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </DebugActionCard>
  )
}

export function LauncherDebugPage({
  debugEnabled,
  onToggleDebugMode,
  onLauncherDiagnosticsUpdate,
  downloads,
}: LauncherDebugPageProps) {
  const copy = useEditorCopy().launcher
  const settingsCopy = useSettingsMenuCopy()
  const debugSimulationActive = downloads.activeItems.some((item) => item.source === 'debug' && item.status === 'downloading')
  const handleClearLauncherImageCache = () => {
    void clearLauncherImageCache().catch(() => {
      // Debug-only affordance: ignore desktop bridge failures here.
    })
  }

  return (
    <section className="launcher-debug-page">
      <div className="launcher-debug-canvas">
        <header className="launcher-debug-page-header">
          <h1 className="launcher-debug-page-title">{copy.debug.title}</h1>
          <p className="launcher-debug-page-subtitle">{copy.debug.subtitle}</p>
        </header>

        <section className="launcher-debug-overview-card" aria-label={copy.debug.title}>
          <div className="launcher-debug-overview-cell">
            <span className="launcher-debug-overview-label">{copy.debug.notificationsOverviewTitle}</span>
            <strong className="launcher-debug-overview-value">5</strong>
          </div>
          <div className="launcher-debug-overview-divider" aria-hidden="true" />
          <div className="launcher-debug-overview-cell">
            <span className="launcher-debug-overview-label">{copy.debug.logsOverviewTitle}</span>
            <strong className="launcher-debug-overview-value">4</strong>
          </div>
        </section>

        <div className="launcher-debug-stack">
          <DebugModeSwitch
            checked={debugEnabled}
            title={copy.debug.debugOnlyTitle}
            description={copy.debug.debugOnlyDescription}
            enabledLabel={settingsCopy.enableDebugModeLabel}
            disabledLabel={settingsCopy.disableDebugModeLabel}
            onToggle={onToggleDebugMode}
          />

          <DebugActionCard
            title={copy.debug.notificationsTitle}
            description={copy.debug.notificationsSubtitle}
            icon={<MessageSquare className="h-4 w-4" />}
          >
            <NotificationTestButtons labels={copy.debug.notificationButtons} debugEnabled={debugEnabled} />
          </DebugActionCard>

          <DebugActionCard
            title={copy.debug.logsTitle}
            description={copy.debug.logsSubtitle}
            icon={<ScrollText className="h-4 w-4" />}
          >
            <LogTestButtons labels={copy.debug.logButtons} debugEnabled={debugEnabled} />
          </DebugActionCard>

          <LauncherNexusDiagnosticsCard
            title={copy.debug.nexusDiagnosticsTitle}
            description={copy.debug.nexusDiagnosticsSubtitle}
            loadingLabel={copy.debug.nexusDiagnosticsLoading}
            emptyLabel={copy.debug.nexusDiagnosticsEmpty}
            endpointLabel={copy.debug.nexusDiagnosticsEndpointLabel}
            attemptsLabel={copy.debug.nexusDiagnosticsAttemptsLabel}
            routeLabel={copy.debug.nexusDiagnosticsRouteLabel}
            observedLabel={copy.debug.nexusDiagnosticsObservedLabel}
            availabilityLabel={copy.debug.nexusDiagnosticsAvailabilityLabel}
            availableState={copy.debug.nexusDiagnosticsAvailableState}
            unavailableState={copy.debug.nexusDiagnosticsUnavailableState}
            loadingState={copy.debug.nexusDiagnosticsLoadingState}
            forceOfflineEnableButton={copy.debug.forceOfflineEnableButton}
            forceOfflineDisableButton={copy.debug.forceOfflineDisableButton}
            forceOfflineEnabledLabel={copy.debug.forceOfflineEnabledLabel}
            forceOfflineDisabledLabel={copy.debug.forceOfflineDisabledLabel}
            onDiagnosticsUpdate={onLauncherDiagnosticsUpdate}
          />

          <DebugActionCard
            title={copy.debug.clearImageCacheTitle}
            description={copy.debug.clearImageCacheSubtitle}
            icon={<ScrollText className="h-4 w-4" />}
            headerActions={
              <div className="launcher-toolbar">
                <button type="button" className="control-button" onClick={handleClearLauncherImageCache}>
                  {copy.debug.clearImageCacheButton}
                </button>
              </div>
            }
          />

          <DebugActionCard
            title={copy.debug.simulationTitle}
            description={copy.debug.simulationSubtitle}
            icon={<Download className="h-4 w-4" />}
            headerActions={
              <div className="launcher-toolbar">
                <button
                  type="button"
                  className="control-button control-button-primary"
                  onClick={() => downloads.startDebugSimulation(copy.debug.simulationTitle)}
                  disabled={debugSimulationActive}
                >
                  {debugSimulationActive ? copy.debug.simulationButtonRunning : copy.debug.simulationButtonIdle}
                </button>
                <span className="dock-chip">2 MB/s · 10s · 20 MB</span>
              </div>
            }
          />
        </div>
      </div>
    </section>
  )
}
