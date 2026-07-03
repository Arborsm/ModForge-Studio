import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { LauncherNexusDiagnosticsResult, LauncherNexusRouteSnapshot } from '@features/launcher/model/launcherContracts'
import type { LauncherPort } from '@features/launcher/model/launcherPort'
import { mergeLauncherNexusDiagnostics } from '@features/launcher/model/nexusDiagnostics'

type DiagnosticsCopy = ReturnType<typeof useEditorCopy>['launcher']['diagnostics']

function formatTimeAgo(timestamp: number, copy: DiagnosticsCopy): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 5) return copy.justNow
  if (seconds < 60) return copy.secondsAgo(String(seconds))
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return copy.minutesAgo(String(minutes))
  return copy.hoursAgo(String(Math.floor(minutes / 60)))
}

function RouteStatusIcon({ status }: { status: LauncherNexusRouteSnapshot['status'] }) {
  if (status === 'success') {
    return <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
  }
  if (status === 'warning') {
    return <AlertTriangle className="h-4 w-4 text-yellow-500" aria-hidden="true" />
  }
  return <Loader2 className="text-muted h-4 w-4 animate-spin" aria-hidden="true" />
}

type DiagnosticsPanelProps = {
  launcherPort: LauncherPort
}

export function DiagnosticsPanel({ launcherPort }: DiagnosticsPanelProps) {
  const copy = useEditorCopy().launcher.diagnostics
  const [routes, setRoutes] = useState<LauncherNexusRouteSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [retryingRouteIds, setRetryingRouteIds] = useState<Set<string>>(new Set())
  const retryTimestamps = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const diagnostics: LauncherNexusDiagnosticsResult = await launcherPort.loadNexusDiagnostics()
        if (!cancelled) {
          setRoutes(diagnostics.routes)
          setLastRefreshedAt(Date.now())
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [launcherPort])

  useEffect(() => {
    const refreshClock = window.setInterval(() => {
      setCurrentTime(Date.now())
    }, 60_000)

    return () => {
      window.clearInterval(refreshClock)
    }
  }, [])

  const handleRetryRoute = useCallback(
    async (routeId: string) => {
      const now = Date.now()
      const lastRetry = retryTimestamps.current.get(routeId) ?? 0
      if (now - lastRetry < 2000) return // 2s debounce
      retryTimestamps.current.set(routeId, now)

      setRetryingRouteIds((prev) => {
        const next = new Set(prev)
        next.add(routeId)
        return next
      })

      try {
        const diagnostics = await launcherPort.retryNexusDiagnosticsRoute(routeId)
        setRoutes((currentRoutes) => mergeLauncherNexusDiagnostics(currentRoutes, diagnostics.routes))
        setLastRefreshedAt(Date.now())
      } catch {
        // Keep last state on failure
      } finally {
        setRetryingRouteIds((prev) => {
          const next = new Set(prev)
          next.delete(routeId)
          return next
        })
      }
    },
    [launcherPort],
  )

  const isStale = lastRefreshedAt != null && currentTime - lastRefreshedAt > 5 * 60 * 1000

  if (loading) {
    return (
      <section className="settings-window-control-card launcher-settings-control-card">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="settings-window-section-copy">{copy.loading}</span>
        </div>
      </section>
    )
  }

  return (
    <section className="launcher-settings-subsection">
      <div>
        <p className="settings-window-section-title">{copy.sectionTitle}</p>
        <p className="settings-window-section-copy">{copy.sectionSubtitle}</p>
      </div>

      {lastRefreshedAt != null && (
        <p className={cx('mt-1 text-xs', isStale ? 'text-yellow-500 italic' : 'text-muted')}>
          {copy.lastRefresh(formatTimeAgo(lastRefreshedAt, copy))}
          {isStale && ` - ${copy.staleWarning}`}
        </p>
      )}

      <div className="mt-2 flex flex-col gap-1">
        {routes.map((route) => {
          const retrying = retryingRouteIds.has(route.routeId)
          const canRetry = route.status === 'warning' || !route.available

          return (
            <div
              key={route.routeId}
              className={cx('flex items-center gap-2 rounded px-2 py-1.5 text-xs', 'bg-surface/50 hover:bg-surface/80 transition-colors')}
            >
              <RouteStatusIcon status={route.status} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{route.label}</p>
                <p className="text-muted truncate">{route.endpoint}</p>
                <p className="text-muted truncate">{route.message}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="dock-chip">
                  {route.attempts}/{route.maxAttempts}
                </span>
                {canRetry && (
                  <button
                    type="button"
                    className="control-button p-1"
                    disabled={retrying}
                    aria-label={copy.retryRouteAction(route.label)}
                    onClick={() => void handleRetryRoute(route.routeId)}
                  >
                    <RefreshCw className={cx('h-3 w-3', retrying && 'animate-spin')} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {routes.length === 0 && <p className="text-muted mt-1 text-xs">{copy.empty}</p>}
    </section>
  )
}
