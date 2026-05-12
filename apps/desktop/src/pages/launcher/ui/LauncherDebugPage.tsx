import { Bug, ChevronDown, Download, MessageSquare, RefreshCw, ScrollText } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'
import { cx } from '@shared/lib/cx'
import { useEditorCopy, useSettingsMenuCopy } from '@locales/localeContext'
import { reportAppEvent, type AppEventLevel } from '@shared/lib/observability'
import { LoadingMotionReveal } from '@shared/ui/loading-motion'
import {
  canUseDesktopHost,
  clearLauncherImageCache,
  type LauncherNexusDiagnosticsResult,
  loadLauncherNexusDiagnostics,
  retryLauncherNexusDiagnosticsRoute,
  setLauncherNexusForceOffline,
  type LauncherNexusRouteSnapshot,
} from '@platform/desktop'
import { mergeLauncherNexusDiagnostics, useLauncherDownloads, useLauncherSettings } from '@features/launcher'
import { LauncherSettingsForm } from '@features/launcher/ui/shared/LauncherSettingsForm'
import { LauncherNexusApiStatusCard } from '@features/launcher/ui/shared/LauncherNexusApiStatusCard'
import type { LauncherCopy } from '@locales/schema'

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

function getNexusRouteResponsibility(
  routeId: string,
  routeResponsibilities: LauncherCopy['debug']['nexusDiagnosticsRouteResponsibilities'],
) {
  if (routeId in routeResponsibilities) {
    return routeResponsibilities[routeId as keyof typeof routeResponsibilities]
  }

  return routeResponsibilities.fallback
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
  settingsState: ReturnType<typeof useLauncherSettings>
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
          {icon ? (
            <span className="launcher-debug-card-badge" aria-hidden="true">
              {icon}
            </span>
          ) : null}
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
  routeResponsibilities,
  forceOfflineEnableButton,
  forceOfflineDisableButton,
  forceOfflineEnabledLabel,
  forceOfflineDisabledLabel,
  retryRouteLabel,
  settingsState,
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
  routeResponsibilities: LauncherCopy['debug']['nexusDiagnosticsRouteResponsibilities']
  forceOfflineEnableButton: string
  forceOfflineDisableButton: string
  forceOfflineEnabledLabel: string
  forceOfflineDisabledLabel: string
  retryRouteLabel: string
  settingsState: ReturnType<typeof useLauncherSettings>
  onDiagnosticsUpdate?: (diagnostics: LauncherNexusDiagnosticsResult) => void
}) {
  const [routes, setRoutes] = useState<LauncherNexusRouteSnapshot[]>([])
  const routesRef = useRef<LauncherNexusRouteSnapshot[]>([])
  const [loading, setLoading] = useState(() => canUseDesktopHost())
  const [forceOffline, setForceOffline] = useState(() => getAppUiStateSnapshot().launcher.forceOffline)
  const [toggleBusy, setToggleBusy] = useState(false)
  const [retryingRouteIds, setRetryingRouteIds] = useState<Set<string>>(() => new Set())
  const [pollNonce, setPollNonce] = useState(0)
  const hasNexusApiRoute = routes.some((route) => route.routeId === 'nexusApi')

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

        routesRef.current = diagnostics.routes
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
          routesRef.current = []
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
      routesRef.current = diagnostics.routes
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

  const handleRetryRoute = async (routeId: string) => {
    setRetryingRouteIds((value) => {
      const next = new Set(value)
      next.add(routeId)
      return next
    })

    try {
      const diagnostics = await retryLauncherNexusDiagnosticsRoute(routeId)
      const routes = mergeLauncherNexusDiagnostics(routesRef.current, diagnostics.routes)
      routesRef.current = routes
      setRoutes(routes)
      onDiagnosticsUpdate?.({ routes })
      setLoading(false)
    } catch {
      // Debug-only control: keep the last route snapshot visible if the bridge fails.
    } finally {
      setRetryingRouteIds((value) => {
        const next = new Set(value)
        next.delete(routeId)
        return next
      })
    }
  }

  return (
    <DebugActionCard
      title={title}
      description={description}
      icon={null}
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
      {((!loading && routes.length > 0) || !hasNexusApiRoute) ? (
        <div className="launcher-debug-route-list">
          {!loading ? routes.map((route) => {
            const retrying = retryingRouteIds.has(route.routeId)
            const canRetryRoute = !forceOffline && (route.status === 'warning' || !route.available)

            if (route.routeId !== 'nexusApi') {
              return (
                <section
                  key={route.routeId}
                  className={cx(
                    'launcher-debug-route-row',
                    `launcher-debug-route-row-${route.status}`,
                  )}
                >
                  <div className="launcher-debug-route-main">
                    <div className="launcher-debug-route-copy">
                      <h3 className="launcher-debug-route-title">{route.label}</h3>
                      <p className="launcher-debug-route-endpoint">
                        <span>{endpointLabel}</span>
                        <span>{route.endpoint}</span>
                      </p>
                    </div>
                  </div>

                  <div className="launcher-debug-route-details">
                    <div className="launcher-debug-route-result-head">
                      <span
                        className={cx(
                          'launcher-debug-route-status',
                          `launcher-debug-route-status-${route.status}`,
                        )}
                      >
                        {route.status}
                      </span>
                      <span className="launcher-debug-route-result-label">{observedLabel}</span>
                    </div>
                    <p className="launcher-debug-route-message">
                      <span>{route.message}</span>
                    </p>
                    <p className="launcher-debug-route-meta">
                      <span>{getNexusRouteResponsibility(route.routeId, routeResponsibilities)}</span>
                      <span>{`${attemptsLabel}: ${route.attempts} / ${route.maxAttempts}`}</span>
                      <span>{`${routeLabel}: ${route.routeId}`}</span>
                      <span>
                        {`${availabilityLabel}: ${getRouteAvailabilityCopy(route, {
                          available: availableState,
                          unavailable: unavailableState,
                          loading: loadingState,
                        })}`}
                      </span>
                    </p>
                    <div className="launcher-debug-route-actions">
                      {canRetryRoute ? (
                        <button
                          type="button"
                          className="control-button launcher-debug-route-retry"
                          disabled={retrying}
                          aria-label={`${retryRouteLabel} ${route.label}`}
                          onClick={() => {
                            void handleRetryRoute(route.routeId)
                          }}
                        >
                          <RefreshCw className="h-4 w-4" aria-hidden="true" />
                          <span>{retryRouteLabel}</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                </section>
              )
            }

            return (
              <LauncherNexusApiStatusCard
                key={route.routeId}
                settingsState={settingsState}
                variant="route-row"
                renderCard={({ actions, status, statusLabel, detail, meta }) => {
                  const mergedStatus = route.routeId === 'nexusApi' && status !== 'success' ? status : route.status
                  const mergedMessage = route.routeId === 'nexusApi' && detail ? `${route.message} ${detail}` : route.message
                  const mergedStatusLabel = mergedStatus === route.status ? route.status : statusLabel
                  const mergedMeta = [
                    getNexusRouteResponsibility(route.routeId, routeResponsibilities),
                    `${attemptsLabel}: ${route.attempts} / ${route.maxAttempts}`,
                    `${routeLabel}: ${route.routeId}`,
                    `${availabilityLabel}: ${getRouteAvailabilityCopy(route, {
                      available: availableState,
                      unavailable: unavailableState,
                      loading: loadingState,
                    })}`,
                    ...(route.routeId === 'nexusApi' ? meta : []),
                  ]

                  return (
                    <section
                      className={cx(
                        'launcher-debug-route-row',
                        route.routeId === 'nexusApi' && 'launcher-debug-route-row-api',
                        `launcher-debug-route-row-${mergedStatus}`,
                      )}
                    >
                      <div className="launcher-debug-route-main">
                        <div className="launcher-debug-route-copy">
                          <h3 className="launcher-debug-route-title">{route.label}</h3>
                          <p className="launcher-debug-route-endpoint">
                            <span>{endpointLabel}</span>
                            <span>{route.endpoint}</span>
                          </p>
                        </div>
                      </div>

                      <div className="launcher-debug-route-details">
                        <div className="launcher-debug-route-result-head">
                          <span
                            className={cx(
                              'launcher-debug-route-status',
                              `launcher-debug-route-status-${mergedStatus}`,
                            )}
                        >
                            {mergedStatusLabel}
                          </span>
                          <span className="launcher-debug-route-result-label">{observedLabel}</span>
                        </div>
                        <p className="launcher-debug-route-message">
                          <span>{mergedMessage}</span>
                        </p>
                        <p className="launcher-debug-route-meta">
                          {mergedMeta.map((item) => (
                            <span key={item}>{item}</span>
                          ))}
                        </p>
                        <div className={cx('launcher-debug-route-actions', route.routeId === 'nexusApi' && 'launcher-debug-route-actions-wide')}>
                          {canRetryRoute ? (
                            <button
                              type="button"
                              className="control-button launcher-debug-route-retry"
                              disabled={retrying}
                              aria-label={`${retryRouteLabel} ${route.label}`}
                              onClick={() => {
                                void handleRetryRoute(route.routeId)
                              }}
                            >
                              <RefreshCw className="h-4 w-4" aria-hidden="true" />
                              <span>{retryRouteLabel}</span>
                            </button>
                          ) : null}
                          {actions}
                        </div>
                      </div>
                    </section>
                  )
                }}
              />
            )
          }) : null}
          {!hasNexusApiRoute ? (
            <LauncherNexusApiStatusCard
              settingsState={settingsState}
              variant="route-row"
              renderCard={({ title, description, actions, status, statusLabel, detail, meta }) => (
                <section
                  className={cx(
                    'launcher-debug-route-row',
                    'launcher-debug-route-row-api',
                    `launcher-debug-route-row-${status}`,
                  )}
                >
                  <div className="launcher-debug-route-main">
                    <div className="launcher-debug-route-copy">
                      <h3 className="launcher-debug-route-title">{title}</h3>
                      <p className="launcher-debug-route-endpoint">
                        <span>{routeLabel}</span>
                        <span>{description}</span>
                      </p>
                    </div>
                  </div>
                  <div className="launcher-debug-route-details">
                    <div className="launcher-debug-route-result-head">
                      <span className={cx('launcher-debug-route-status', `launcher-debug-route-status-${status}`)}>
                        {statusLabel}
                      </span>
                      <span className="launcher-debug-route-result-label">{observedLabel}</span>
                    </div>
                    <p className="launcher-debug-route-message">
                      <span>{detail}</span>
                    </p>
                    {meta.length ? (
                      <p className="launcher-debug-route-meta">
                        {meta.map((item) => (
                          <span key={item}>{item}</span>
                        ))}
                      </p>
                    ) : null}
                    <div className="launcher-debug-route-actions launcher-debug-route-actions-wide">
                      {actions}
                    </div>
                  </div>
                </section>
              )}
            />
          ) : null}
        </div>
      ) : null}
    </DebugActionCard>
  )
}

export function LauncherDebugPage({
  debugEnabled,
  onToggleDebugMode,
  onLauncherDiagnosticsUpdate,
  settingsState,
  downloads,
}: LauncherDebugPageProps) {
  const copy = useEditorCopy().launcher
  const settingsCopy = useSettingsMenuCopy()
  const [debugToolsExpanded, setDebugToolsExpanded] = useState(false)
  const debugSimulationActive = downloads.activeItems.some((item) => item.source === 'debug' && item.status === 'downloading')
  const handleClearLauncherImageCache = () => {
    void clearLauncherImageCache().catch(() => {
      // Debug-only affordance: ignore desktop bridge failures here.
    })
  }

  return (
    <section className="launcher-debug-page">
      <div className="launcher-debug-canvas">
        <LoadingMotionReveal itemId="launcher-debug-header" index={0}>
          <header className="launcher-debug-page-header">
            <h1 className="launcher-debug-page-title">{copy.debug.title}</h1>
            <p className="launcher-debug-page-subtitle">{copy.debug.subtitle}</p>
          </header>
        </LoadingMotionReveal>

        <LoadingMotionReveal itemId="launcher-settings-panel" index={1}>
          <section className="launcher-config-main" aria-label={copy.settings.title}>
            <div className="launcher-config-section-header">
              <div>
                <h2 className="launcher-debug-card-title">{copy.debug.title}</h2>
                <p className="launcher-debug-card-description">{copy.debug.subtitle}</p>
              </div>
            </div>
            <LauncherSettingsForm settingsState={settingsState} showDiagnostics={false} showApiStatus={false} />
          </section>
        </LoadingMotionReveal>

        <LoadingMotionReveal itemId="launcher-config-network" index={2}>
          <section className="launcher-config-network" aria-label={copy.diagnostics.title}>
            <div className="launcher-config-section-header">
              <div>
                <h2 className="launcher-debug-card-title">{copy.diagnostics.title}</h2>
                <p className="launcher-debug-card-description">{copy.diagnostics.sectionSubtitle}</p>
              </div>
            </div>

            <div className="launcher-config-network-grid">
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
                routeResponsibilities={copy.debug.nexusDiagnosticsRouteResponsibilities}
                forceOfflineEnableButton={copy.debug.forceOfflineEnableButton}
                forceOfflineDisableButton={copy.debug.forceOfflineDisableButton}
                forceOfflineEnabledLabel={copy.debug.forceOfflineEnabledLabel}
                forceOfflineDisabledLabel={copy.debug.forceOfflineDisabledLabel}
                retryRouteLabel={copy.actions.retry}
                settingsState={settingsState}
                onDiagnosticsUpdate={onLauncherDiagnosticsUpdate}
              />
            </div>
          </section>
        </LoadingMotionReveal>

        <section className="launcher-config-tools" aria-label={copy.debug.moreToolsTitle}>
          <LoadingMotionReveal itemId="launcher-debug-tools-toggle" index={3}>
            <section className="launcher-debug-more-card">
              <div className="launcher-debug-card-copy">
                <h2 className="launcher-debug-card-title">{copy.debug.moreToolsTitle}</h2>
                <p className="launcher-debug-card-description">{copy.debug.moreToolsSubtitle}</p>
              </div>
              <button
                type="button"
                className="control-button launcher-debug-more-button"
                aria-expanded={debugToolsExpanded}
                onClick={() => setDebugToolsExpanded((value) => !value)}
              >
                <span>{debugToolsExpanded ? copy.debug.lessToolsAction : copy.debug.moreToolsAction}</span>
                <ChevronDown className={cx('h-4 w-4', debugToolsExpanded && 'rotate-180')} aria-hidden="true" />
              </button>
            </section>
          </LoadingMotionReveal>

          {debugToolsExpanded ? (
            <div className="launcher-debug-tools-stack">
              <LoadingMotionReveal itemId="launcher-debug-overview" index={4}>
                <section className="launcher-debug-overview-card" aria-label={copy.debug.moreToolsTitle}>
                  <div className="launcher-debug-stat-card launcher-debug-stat-card-primary">
                    <strong className="launcher-debug-overview-value">5</strong>
                    <span className="launcher-debug-overview-label">{copy.debug.notificationsOverviewTitle}</span>
                  </div>
                  <div className="launcher-debug-stat-card launcher-debug-stat-card-neutral">
                    <strong className="launcher-debug-overview-value">4</strong>
                    <span className="launcher-debug-overview-label">{copy.debug.logsOverviewTitle}</span>
                  </div>
                </section>
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-mode" index={5}>
                <DebugModeSwitch
                  checked={debugEnabled}
                  title={copy.debug.debugOnlyTitle}
                  description={copy.debug.debugOnlyDescription}
                  enabledLabel={settingsCopy.enableDebugModeLabel}
                  disabledLabel={settingsCopy.disableDebugModeLabel}
                  onToggle={onToggleDebugMode}
                />
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-notifications" index={6}>
                <DebugActionCard
                  title={copy.debug.notificationsTitle}
                  description={copy.debug.notificationsSubtitle}
                  icon={<MessageSquare className="h-4 w-4" />}
                >
                  <NotificationTestButtons labels={copy.debug.notificationButtons} debugEnabled={debugEnabled} />
                </DebugActionCard>
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-logs" index={7}>
                <DebugActionCard
                  title={copy.debug.logsTitle}
                  description={copy.debug.logsSubtitle}
                  icon={<ScrollText className="h-4 w-4" />}
                >
                  <LogTestButtons labels={copy.debug.logButtons} debugEnabled={debugEnabled} />
                </DebugActionCard>
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-image-cache" index={8}>
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
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-simulation" index={9}>
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
              </LoadingMotionReveal>
            </div>
          ) : null}
        </section>
      </div>
    </section>
  )
}
