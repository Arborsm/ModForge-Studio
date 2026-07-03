import { ArrowUpRight, Database, FolderOpen, HelpCircle, Image, KeyRound, Network, RefreshCw, Server } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'
import { cx } from '@shared/lib/cx'
import { useEditorCopy, useSettingsMenuCopy } from '@locales/localeContext'
import { LoadingMotionReveal, LoadingMotionRevealItem } from '@shared/ui/loading-motion'
import {
  clearLauncherImageCache,
  type LauncherNexusDiagnosticsResult,
  loadLauncherNexusDiagnostics,
  restartLauncherNexusDiagnostics,
  setLauncherNexusForceOffline,
  type LauncherNexusRouteSnapshot,
} from '@features/launcher/api'
import { canUseDesktopHost } from '@shared/lib/desktop'
import {
  clearCachedLauncherConfigurationDiagnostics,
  getLauncherWarningState,
  readCachedLauncherConfigurationApiKeyStatus,
  readCachedLauncherConfigurationDiagnostics,
  readCachedLauncherConfigurationLibraryScan,
  readCachedLauncherConfigurationRuntimeInfo,
  readCachedLauncherConfigurationSsoStatus,
  useLauncherPort,
  useLauncherSettings,
  writeCachedLauncherConfigurationApiKeyStatus,
  writeCachedLauncherConfigurationDiagnostics,
  writeCachedLauncherConfigurationLibraryScan,
  writeCachedLauncherConfigurationRuntimeInfo,
  writeCachedLauncherConfigurationSsoStatus,
} from '@features/launcher'
import type { LauncherCopy } from '@locales/schema'
import type { LauncherRuntimeInfo, ValidateApiKeyResult } from '@features/launcher/model/launcherContracts'
import type { LauncherPort } from '@features/launcher/model/launcherPort'
import { LauncherConfigurationMoreTools } from './LauncherConfigurationMoreTools'
import { ConfigAccountCard, ConfigCompletionRail, ConfigDownloadDefaults, type ConfigStep } from './LauncherConfigurationRailCards'

type LauncherConfigurationPageProps = {
  debugEnabled: boolean
  onToggleDebugMode: () => void
  onLauncherDiagnosticsUpdate?: (diagnostics: LauncherNexusDiagnosticsResult) => void
  settingsState: ReturnType<typeof useLauncherSettings>
  downloads: {
    activeItems: Array<{ source: string; status: string }>
    startDebugSimulation: (title: string) => void
  }
}

type ApiRouteTone = 'ok' | 'warn' | 'danger' | 'loading'
type ConfigRouteId = 'nexusApi' | 'publicGraphql' | 'nexusImages' | 'smapi' | 'privateGraphql'
type NexusApiAccountStatus = {
  apiKeyStatus: ValidateApiKeyResult | null
  apiKeyError: string | null
  apiKeyChecking: boolean
  hasApiKey: boolean
  ssoAuthorized: boolean
  ssoStarting: boolean
  refreshApiKeyStatus: (options?: { force?: boolean; forceNonPremium?: boolean }) => Promise<void>
  startSso: () => Promise<void>
}

const SSO_STATUS_POLL_INTERVAL_MS = 1500
const SSO_STATUS_POLL_TIMEOUT_MS = 125_000

function isSsoPendingStatus(status: string) {
  return status === 'connecting' || status === 'awaitingAuthorization'
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function pollNexusSsoUntilSettled(launcherPort: LauncherPort, options: { signal: () => boolean }) {
  const startedAt = Date.now()

  while (!options.signal()) {
    const snapshot = await launcherPort.getNexusSsoStatus()
    if (!isSsoPendingStatus(snapshot.status)) {
      return snapshot
    }

    if (Date.now() - startedAt >= SSO_STATUS_POLL_TIMEOUT_MS) {
      return snapshot
    }

    await wait(SSO_STATUS_POLL_INTERVAL_MS)
  }

  return launcherPort.getNexusSsoStatus()
}

function createLoadingRoute(routeId: ConfigRouteId, label: string): LauncherNexusRouteSnapshot {
  return {
    routeId,
    label,
    endpoint: '',
    status: 'loading',
    attempts: 0,
    maxAttempts: 0,
    available: false,
    message: '',
  }
}

function getDefaultConfigRoutes(copy: LauncherCopy): LauncherNexusRouteSnapshot[] {
  return [
    createLoadingRoute('publicGraphql', copy.settings.nexusApiGraphql),
    createLoadingRoute('nexusImages', copy.settings.nexusApiImageCdn),
    createLoadingRoute('smapi', 'SMAPI'),
    createLoadingRoute('privateGraphql', 'Nexus Private GraphQL'),
    createLoadingRoute('nexusApi', copy.settings.nexusApiRest),
  ]
}

function getDisplayedConfigRoutes(routes: LauncherNexusRouteSnapshot[], copy: LauncherCopy) {
  const routesById = new Map(routes.map((route) => [route.routeId, route]))
  return getDefaultConfigRoutes(copy).map((fallbackRoute) => routesById.get(fallbackRoute.routeId) ?? fallbackRoute)
}

function hasConfiguredPath(value: string | null | undefined) {
  return Boolean(value?.trim())
}

function countConfiguredPaths(settings: ReturnType<typeof useLauncherSettings>['settings']) {
  return [settings.gamePath, settings.modsPath, settings.downloadPath].filter(hasConfiguredPath).length
}

function hasWarningDiagnostics(routes: LauncherNexusRouteSnapshot[]) {
  return routes.some((route) => route.status === 'warning' || !route.available)
}

function formatNumber(value: number | null | undefined) {
  return value == null ? '0' : new Intl.NumberFormat().format(value)
}

function getPercent(value: number | null | undefined, total: number) {
  if (value == null) {
    return 0
  }

  return Math.max(0, Math.min(100, (value / total) * 100))
}

function formatPercent(percent: number) {
  if (percent <= 0) {
    return '0%'
  }

  if (percent >= 100) {
    return '100%'
  }

  if (percent > 99) {
    return `${Math.floor(percent)}%`
  }

  const rounded = Math.round(percent)
  return `${Math.max(1, rounded)}%`
}

function formatResetCountdown(timestampSeconds: number | null | undefined, copy: LauncherCopy) {
  if (timestampSeconds == null) {
    return null
  }

  const remainingMs = timestampSeconds * 1000 - Date.now()
  if (remainingMs <= 0) {
    return copy.settings.nexusQuotaResetIn(copy.settings.nexusQuotaDurationMinutes(0))
  }

  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const duration =
    hours > 0 ? copy.settings.nexusQuotaDurationHoursMinutes(hours, minutes) : copy.settings.nexusQuotaDurationMinutes(minutes)

  return copy.settings.nexusQuotaResetIn(duration)
}

function getNextUtcMidnightTimestampSeconds() {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0) / 1000
}

function getNextHourTimestampSeconds() {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1, 0, 0) / 1000
}

function getQuotaDetail(limit: string, resetAt: number | null | undefined, fallbackResetAt: () => number, copy: LauncherCopy) {
  const resetDetail = formatResetCountdown(resetAt ?? fallbackResetAt(), copy)
  return resetDetail == null ? limit : `${limit} · ${resetDetail}`
}

function getPremiumExpiryLabel(status: ValidateApiKeyResult | null, copy: LauncherCopy) {
  if (!status?.isPremium) {
    return null
  }

  if (status.isLifetimePremium) {
    return copy.diagnostics.premiumLifetime
  }

  const rawValue = status.premiumExpiresAt?.trim()
  if (!rawValue) {
    return null
  }

  const timestampMs = Number(rawValue)
  const date =
    Number.isFinite(timestampMs) && timestampMs > 0
      ? new Date(timestampMs < 10_000_000_000 ? timestampMs * 1000 : timestampMs)
      : new Date(rawValue)
  const displayValue = Number.isNaN(date.getTime()) ? rawValue : date.toLocaleDateString()

  return copy.diagnostics.premiumExpiresAt(displayValue)
}

function getPremiumCacheExpiresAtMs(status: ValidateApiKeyResult | null) {
  if (!status?.isPremium) {
    return undefined
  }

  if (status.isLifetimePremium) {
    return null
  }

  const rawValue = status.premiumExpiresAt?.trim()
  if (!rawValue) {
    return undefined
  }

  const timestampMs = Number(rawValue)
  const date =
    Number.isFinite(timestampMs) && timestampMs > 0
      ? new Date(timestampMs < 10_000_000_000 ? timestampMs * 1000 : timestampMs)
      : new Date(rawValue)

  return Number.isNaN(date.getTime()) ? undefined : date.getTime()
}

function getDiagnosticsAgeLabel(timestamp: number | null, copy: LauncherCopy) {
  if (timestamp == null) {
    return copy.settings.configurationDiagnosticsJustNow
  }

  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  return minutes <= 0 ? copy.settings.configurationDiagnosticsJustNow : copy.settings.configurationDiagnosticsMinutesAgo(minutes)
}

function getConfigurationDiagnosticsApiKeySignature(settings: ReturnType<typeof useLauncherSettings>['settings']) {
  return settings.nexusApiKey?.trim() ?? ''
}

function getRouteTone(route: LauncherNexusRouteSnapshot | undefined): ApiRouteTone {
  if (!route) {
    return 'loading'
  }

  if (route.status === 'loading') {
    return 'loading'
  }

  if (route.available && route.status === 'success') {
    return 'ok'
  }

  return route.status === 'warning' ? 'warn' : 'danger'
}

function getRouteStatusLabel(tone: ApiRouteTone, copy: LauncherCopy) {
  if (tone === 'ok') {
    return copy.settings.nexusApiAvailable
  }

  if (tone === 'warn') {
    return copy.settings.nexusApiSlow
  }

  if (tone === 'loading') {
    return copy.configuration.nexusDiagnosticsLoadingState
  }

  return copy.settings.nexusApiUnavailable
}

function getRouteDisplayName(route: LauncherNexusRouteSnapshot, copy: LauncherCopy) {
  if (route.routeId === 'nexusApi') {
    return copy.settings.nexusApiRest
  }

  if (route.routeId === 'publicGraphql') {
    return copy.settings.nexusApiGraphql
  }

  if (route.routeId === 'nexusImages') {
    return copy.settings.nexusApiImageCdn
  }

  return route.label
}

function getRouteDescription(route: LauncherNexusRouteSnapshot, copy: LauncherCopy) {
  const responsibilities = copy.configuration.nexusDiagnosticsRouteResponsibilities
  if (route.routeId === 'publicGraphql') {
    return responsibilities.publicGraphql
  }

  if (route.routeId === 'privateGraphql') {
    return responsibilities.privateGraphql
  }

  if (route.routeId === 'nexusApi') {
    return responsibilities.nexusApi
  }

  if (route.routeId === 'nexusImages') {
    return responsibilities.nexusImages
  }

  if (route.routeId === 'smapi') {
    return responsibilities.smapi
  }

  return responsibilities.fallback
}

function getRouteRowTone(route: LauncherNexusRouteSnapshot | undefined, account: NexusApiAccountStatus, isAuthorized: boolean) {
  if (route?.routeId === 'nexusApi') {
    const restTone: ApiRouteTone = account.apiKeyError ? 'danger' : account.apiKeyChecking ? 'loading' : getRouteTone(route)
    return isAuthorized ? restTone : 'danger'
  }

  if (route?.routeId === 'privateGraphql' && (account.apiKeyError || !isAuthorized)) {
    return 'danger'
  }

  const routeTone = getRouteTone(route)
  if (routeTone === 'loading') {
    return 'loading'
  }

  if (route?.routeId === 'nexusImages') {
    return routeTone === 'ok' ? 'ok' : 'warn'
  }

  if (route?.routeId === 'publicGraphql' && routeTone === 'danger') {
    return 'warn'
  }

  return routeTone
}

function getRouteIcon(routeId: string) {
  if (routeId === 'nexusApi') {
    return <Database className="h-4 w-4" />
  }

  if (routeId === 'privateGraphql') {
    return <KeyRound className="h-4 w-4" />
  }

  if (routeId === 'nexusImages') {
    return <Image className="h-4 w-4" />
  }

  if (routeId === 'smapi') {
    return <Server className="h-4 w-4" />
  }

  return <Network className="h-4 w-4" />
}

function ConfigPanelHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="launcher-config-panel-head">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actions ? <div className="launcher-config-panel-actions">{actions}</div> : null}
    </div>
  )
}

function ConfigPathPanel({
  settingsState,
  copy,
  browseLabel,
}: {
  settingsState: ReturnType<typeof useLauncherSettings>
  copy: LauncherCopy
  browseLabel: string
}) {
  const launcherPort = useLauncherPort()
  const rows = [
    {
      field: 'gamePath' as const,
      label: copy.fields.gamePath,
      value: settingsState.settings.gamePath,
    },
    {
      field: 'modsPath' as const,
      label: copy.fields.modsPath,
      value: settingsState.settings.modsPath,
    },
    {
      field: 'downloadPath' as const,
      label: copy.fields.downloadPath,
      value: settingsState.settings.downloadPath,
    },
  ]

  return (
    <section className="launcher-config-panel launcher-config-paths" aria-label={copy.settings.pathsTitle}>
      <ConfigPanelHeader title={copy.settings.pathsTitle} description={copy.settings.pathsHint} />
      <div className="launcher-config-path-list">
        {rows.map((row, index) => (
          <LoadingMotionRevealItem key={row.field} index={index} as="div" className="launcher-config-path-row">
            <div className="launcher-config-path-label">
              <strong>{row.label}</strong>
            </div>
            <div className="launcher-config-path-field">
              <span className="launcher-config-path-text" data-testid={`launcher-config-${row.field}-value`}>
                {row.value?.trim() || copy.settings.pathNotConfigured}
              </span>
              <div className="launcher-config-path-actions">
                <button
                  type="button"
                  className="launcher-config-icon-button"
                  aria-label={`${row.label} ${browseLabel}`}
                  title={browseLabel}
                  onClick={() => void settingsState.pickDirectory(row.field, row.label)}
                >
                  <FolderOpen className="h-4 w-4" aria-hidden="true" />
                </button>
                {row.value ? (
                  <button
                    type="button"
                    className="launcher-config-icon-button"
                    aria-label={`${row.label} ${copy.actions.openFolder}`}
                    title={copy.actions.openFolder}
                    onClick={() => void launcherPort.openPath({ path: row.value! })}
                  >
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
          </LoadingMotionRevealItem>
        ))}
      </div>
    </section>
  )
}

function applyForcedNonPremiumStatus(status: ValidateApiKeyResult | null, forceNonPremium: boolean) {
  return status && forceNonPremium ? { ...status, isPremium: false } : status
}

function useNexusApiAccountStatus(
  settingsState: ReturnType<typeof useLauncherSettings>,
  forceNonPremium: boolean,
  onAuthorized?: () => void,
): NexusApiAccountStatus {
  const launcherPort = useLauncherPort()
  const { settings, refresh } = settingsState
  const [apiKeyStatus, setApiKeyStatus] = useState<ValidateApiKeyResult | null>(null)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [apiKeyChecking, setApiKeyChecking] = useState(false)
  const [ssoAuthorized, setSsoAuthorized] = useState(false)
  const [ssoStarting, setSsoStarting] = useState(false)
  const apiKeySignature = getConfigurationDiagnosticsApiKeySignature(settings)
  const hasApiKey = Boolean(apiKeySignature)
  const applyDebugAccountTier = useCallback(
    (status: ValidateApiKeyResult | null, overrideForceNonPremium = forceNonPremium) =>
      applyForcedNonPremiumStatus(status, overrideForceNonPremium),
    [forceNonPremium],
  )

  const writeApiKeyStatusCache = useCallback(
    (status: ValidateApiKeyResult | null, error: string | null, overrideForceNonPremium = forceNonPremium) => {
      const cachedStatus = applyDebugAccountTier(status, overrideForceNonPremium)
      writeCachedLauncherConfigurationApiKeyStatus(
        {
          status: cachedStatus,
          error,
        },
        {
          apiKeySignature,
          expiresAtMs: getPremiumCacheExpiresAtMs(cachedStatus),
        },
      )
    },
    [apiKeySignature, applyDebugAccountTier, forceNonPremium],
  )
  const refreshApiKeyStatus = useCallback(
    async (options: { force?: boolean; forceNonPremium?: boolean } = {}) => {
      const effectiveForceNonPremium = options.forceNonPremium ?? forceNonPremium
      if (!hasApiKey && !options.force) {
        setApiKeyStatus(null)
        setApiKeyError(null)
        return
      }

      if (!options.force) {
        const cached = readCachedLauncherConfigurationApiKeyStatus({
          apiKeySignature,
        })
        if (cached) {
          setApiKeyStatus(applyDebugAccountTier(cached.status, effectiveForceNonPremium))
          setApiKeyError(cached.error)
          if (!cached.shouldRefresh) {
            return
          }
        }
      }

      setApiKeyChecking(true)
      setApiKeyError(null)
      try {
        const nextStatus = applyDebugAccountTier(await launcherPort.validateNexusApiKey(), effectiveForceNonPremium)
        setApiKeyStatus(nextStatus)
        writeApiKeyStatusCache(nextStatus, null, effectiveForceNonPremium)
      } catch (nextError) {
        const errorMessage = nextError instanceof Error ? nextError.message : String(nextError)
        setApiKeyStatus(null)
        setApiKeyError(errorMessage)
        writeApiKeyStatusCache(null, errorMessage, effectiveForceNonPremium)
      } finally {
        setApiKeyChecking(false)
      }
    },
    [apiKeySignature, applyDebugAccountTier, forceNonPremium, hasApiKey, launcherPort, writeApiKeyStatusCache],
  )

  useEffect(() => {
    let cancelled = false

    void (async () => {
      if (!hasApiKey) {
        if (!cancelled) {
          setApiKeyStatus(null)
          setApiKeyError(null)
        }
        return
      }

      const cached = readCachedLauncherConfigurationApiKeyStatus({
        apiKeySignature,
      })
      if (cached) {
        if (!cancelled) {
          setApiKeyStatus(applyDebugAccountTier(cached.status))
          setApiKeyError(cached.error)
        }
        if (!cached.shouldRefresh) {
          return
        }
      }

      if (!cancelled) {
        setApiKeyChecking(true)
        setApiKeyError(null)
      }
      try {
        const nextStatus = applyDebugAccountTier(await launcherPort.validateNexusApiKey())
        writeApiKeyStatusCache(nextStatus, null)
        if (!cancelled) {
          setApiKeyStatus(nextStatus)
          setApiKeyError(null)
        }
      } catch (nextError) {
        const errorMessage = nextError instanceof Error ? nextError.message : String(nextError)
        writeApiKeyStatusCache(null, errorMessage)
        if (!cancelled) {
          setApiKeyStatus(null)
          setApiKeyError(errorMessage)
        }
      } finally {
        if (!cancelled) {
          setApiKeyChecking(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [apiKeySignature, applyDebugAccountTier, hasApiKey, launcherPort, writeApiKeyStatusCache])

  useEffect(() => {
    let cancelled = false

    const loadSso = async () => {
      const cached = readCachedLauncherConfigurationSsoStatus()
      if (cached) {
        if (!cancelled) {
          setSsoAuthorized(cached.snapshot.status === 'authorized')
        }
        return
      }

      try {
        const snapshot = await launcherPort.getNexusSsoStatus()
        writeCachedLauncherConfigurationSsoStatus(snapshot)
        if (!cancelled) {
          setSsoAuthorized(snapshot.status === 'authorized')
        }
      } catch {
        if (!cancelled) {
          setSsoAuthorized(false)
        }
      }
    }

    void loadSso()

    return () => {
      cancelled = true
    }
  }, [launcherPort])

  const startSso = useCallback(async () => {
    let cancelled = false
    setSsoStarting(true)
    try {
      await launcherPort.startNexusSso()
      const snapshot = await pollNexusSsoUntilSettled(launcherPort, {
        signal: () => cancelled,
      })
      writeCachedLauncherConfigurationSsoStatus(snapshot)
      setSsoAuthorized(snapshot.status === 'authorized')
      if (snapshot.status === 'authorized') {
        clearCachedLauncherConfigurationDiagnostics()
        writeCachedLauncherConfigurationSsoStatus(snapshot)
        await refresh()
        await refreshApiKeyStatus({ force: true })
        onAuthorized?.()
      }
    } catch (nextError) {
      setApiKeyError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      cancelled = true
      setSsoStarting(false)
    }
  }, [launcherPort, onAuthorized, refresh, refreshApiKeyStatus])

  return {
    apiKeyStatus,
    apiKeyError,
    apiKeyChecking,
    hasApiKey,
    ssoAuthorized,
    ssoStarting,
    refreshApiKeyStatus,
    startSso,
  }
}

function ConfigMetric({
  title,
  value,
  percent,
  limit,
  warn,
}: {
  title: string
  value: string
  percent: number
  limit: string
  warn?: boolean
}) {
  return (
    <div className={cx('launcher-config-dash-metric', warn && 'launcher-config-dash-metric-warn')}>
      <div className="launcher-config-metric-head">
        <span>{title}</span>
        <span>{formatPercent(percent)}</span>
      </div>
      <div className="launcher-config-metric-value">{value}</div>
      <div className={cx('launcher-config-progress', warn && 'launcher-config-progress-warn')}>
        <i style={{ width: `${percent}%` }} />
      </div>
      <div className="launcher-config-micro">{limit}</div>
    </div>
  )
}

function ConfigApiRow({
  index,
  routeId,
  name,
  description,
  statusLabel,
  tone,
  resolved,
  children,
}: {
  index: number
  routeId: ConfigRouteId
  name: string
  description: string
  statusLabel: string
  tone: ApiRouteTone
  resolved: boolean
  children: ReactNode
}) {
  return (
    <LoadingMotionRevealItem
      index={index}
      as="div"
      className={cx('launcher-config-api-row', `launcher-config-api-row-${tone}`, resolved && 'launcher-config-api-row-resolved')}
    >
      <div className="launcher-config-api-name">
        <span
          className={cx('launcher-config-api-icon', `launcher-config-api-icon-${routeId}`, `launcher-config-api-icon-${tone}`)}
          aria-hidden="true"
        >
          {children}
        </span>
        <h3>{name}</h3>
      </div>
      <div className="launcher-config-api-desc">{description}</div>
      <span className={cx('launcher-config-status-tag', `launcher-config-status-tag-${tone}`)}>{statusLabel}</span>
    </LoadingMotionRevealItem>
  )
}

function ConfigNexusPanel({
  settingsState,
  account,
  copy,
  routes,
  diagnosticsRefreshing,
  onRefreshDiagnostics,
}: {
  settingsState: ReturnType<typeof useLauncherSettings>
  account: NexusApiAccountStatus
  copy: LauncherCopy
  routes: LauncherNexusRouteSnapshot[]
  diagnosticsRefreshing: boolean
  onRefreshDiagnostics: () => void
}) {
  const hasApiKey = Boolean(settingsState.settings.nexusApiKey?.trim())
  const isAuthorized = Boolean(account.apiKeyStatus || account.ssoAuthorized || hasApiKey)
  const dailyPercent = getPercent(account.apiKeyStatus?.dailyRemaining, 20_000)
  const hourlyPercent = getPercent(account.apiKeyStatus?.hourlyRemaining, 500)
  const dailyLimit = getQuotaDetail(
    copy.settings.nexusQuotaDailyLimit,
    account.apiKeyStatus?.dailyResetAt,
    getNextUtcMidnightTimestampSeconds,
    copy,
  )
  const hourlyLimit = getQuotaDetail(
    copy.settings.nexusQuotaHourlyLimit,
    account.apiKeyStatus?.hourlyResetAt,
    getNextHourTimestampSeconds,
    copy,
  )
  const displayedRoutes = getDisplayedConfigRoutes(routes, copy)

  return (
    <section
      className="launcher-config-panel launcher-config-nexus"
      aria-label={copy.settings.nexusAccessTitle}
      data-testid="launcher-config-nexus"
    >
      <ConfigPanelHeader
        title={copy.settings.nexusAccessTitle}
        description={isAuthorized ? copy.settings.nexusAccessHint : copy.settings.nexusGuestSubtitle}
        actions={
          <div className="launcher-config-actions">
            <button
              type="button"
              className="launcher-config-button"
              disabled={!hasApiKey}
              onClick={() => settingsState.updateField('nexusApiKey', null)}
            >
              {copy.settings.nexusClearApiKeyAction}
            </button>
            <button
              type="button"
              className="launcher-config-icon-button launcher-config-panel-icon-button launcher-config-refresh-button"
              aria-busy={diagnosticsRefreshing}
              aria-label={copy.configuration.nexusDiagnosticsTitle}
              title={copy.configuration.nexusDiagnosticsTitle}
              onClick={onRefreshDiagnostics}
            >
              <RefreshCw className={cx('h-3.5 w-3.5', diagnosticsRefreshing && 'animate-spin')} aria-hidden="true" />
            </button>
            <span className="launcher-config-help" title={copy.settings.nexusAccessHint}>
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </div>
        }
      />

      <div className="launcher-config-account-slot">
        {isAuthorized ? (
          <div className="launcher-config-dashboard">
            <div className="launcher-config-dash-metrics">
              <ConfigMetric
                title={copy.settings.nexusQuotaDaily}
                value={formatNumber(account.apiKeyStatus?.dailyRemaining)}
                percent={dailyPercent}
                limit={dailyLimit}
              />
              <ConfigMetric
                title={copy.settings.nexusQuotaHourly}
                value={formatNumber(account.apiKeyStatus?.hourlyRemaining)}
                percent={hourlyPercent}
                limit={hourlyLimit}
                warn
              />
            </div>
          </div>
        ) : (
          <div className="launcher-config-guest-hero">
            <div>
              <h3>{copy.settings.nexusGuestTitle}</h3>
              <p>{copy.settings.nexusGuestSubtitle}</p>
            </div>
            <div className="launcher-config-actions">
              <button
                type="button"
                className="launcher-config-button launcher-config-button-primary"
                disabled={account.ssoStarting}
                aria-busy={account.ssoStarting}
                onClick={() => void account.startSso()}
              >
                {account.ssoStarting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                {copy.settings.nexusSignInAction}
              </button>
              <button
                type="button"
                className="launcher-config-button"
                onClick={() => settingsState.updateField('nexusApiKey', settingsState.settings.nexusApiKey ?? '')}
              >
                {copy.settings.nexusPasteApiKeyAction}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="launcher-config-api-list">
        {displayedRoutes.map((route, index) => {
          const tone = getRouteRowTone(route, account, isAuthorized)
          return (
            <ConfigApiRow
              key={route.routeId}
              index={index}
              routeId={route.routeId as ConfigRouteId}
              name={getRouteDisplayName(route, copy)}
              description={getRouteDescription(route, copy)}
              tone={tone}
              statusLabel={getRouteStatusLabel(tone, copy)}
              resolved={route.status !== 'loading'}
            >
              {getRouteIcon(route.routeId)}
            </ConfigApiRow>
          )
        })}
      </div>

      {account.apiKeyError ? <p className="launcher-config-api-error">{`Log: ${account.apiKeyError}`}</p> : null}
    </section>
  )
}

export function LauncherConfigurationPage({
  debugEnabled,
  onToggleDebugMode,
  onLauncherDiagnosticsUpdate,
  settingsState,
  downloads,
}: LauncherConfigurationPageProps) {
  const rootCopy = useEditorCopy()
  const copy = rootCopy.launcher
  const settingsCopy = useSettingsMenuCopy()
  const commonCopy = rootCopy.common
  const [debugToolsExpanded, setDebugToolsExpanded] = useState(false)
  const [bbcodePreviewExpanded, setBbcodePreviewExpanded] = useState(false)
  const [diagnosticRoutes, setDiagnosticRoutes] = useState<LauncherNexusRouteSnapshot[]>([])
  const [lastDiagnosticsAt, setLastDiagnosticsAt] = useState<number | null>(null)
  const [diagnosticsRefreshing, setDiagnosticsRefreshing] = useState(false)
  const [forceOffline, setForceOffline] = useState(() => getAppUiStateSnapshot().launcher.forceOffline)
  const [forceOfflineBusy, setForceOfflineBusy] = useState(false)
  const [forceNonPremium, setForceNonPremium] = useState(() => getAppUiStateSnapshot().launcher.forceNonPremium)
  const [forceNonPremiumBusy, setForceNonPremiumBusy] = useState(false)
  const [diagnosticsPollNonce] = useState(0)
  const [diagnosticsRestartNonce, setDiagnosticsRestartNonce] = useState(0)
  const [installedModCount, setInstalledModCount] = useState<number | null>(null)
  const [runtimeInfo, setRuntimeInfo] = useState<LauncherRuntimeInfo | null>(null)
  const launcherPort = useLauncherPort()
  const warningState = getLauncherWarningState(settingsState.settings)
  const configuredPaths = countConfiguredPaths(settingsState.settings)
  const hasCredentials = !warningState.missingCredentials
  const warningDiagnostics = hasWarningDiagnostics(diagnosticRoutes)
  const stepItems: ConfigStep[] = [
    {
      id: 'paths',
      label: copy.settings.stepPaths,
      detail: copy.settings.configuredPathsSummary(configuredPaths, 3),
      tone: configuredPaths === 3 ? 'ok' : configuredPaths > 0 ? 'warn' : 'danger',
    },
    {
      id: 'nexus',
      label: copy.settings.stepNexus,
      detail: hasCredentials ? copy.settings.nexusReady : copy.settings.nexusMissing,
      tone: hasCredentials ? 'ok' : 'danger',
    },
    {
      id: 'downloads',
      label: copy.settings.stepDownloads,
      detail: settingsState.settings.autoCheckModUpdates ? copy.settings.downloadsReady : copy.settings.downloadsLimited,
      tone: settingsState.settings.autoCheckModUpdates ? 'ok' : 'warn',
    },
    {
      id: 'diagnostics',
      label: copy.settings.stepDiagnostics,
      detail: warningDiagnostics ? copy.settings.diagnosticsReview : copy.settings.diagnosticsHealthy,
      tone: warningDiagnostics ? 'warn' : 'ok',
    },
  ]
  const readyStepCount = stepItems.filter((step) => step.tone === 'ok').length
  const issueStepCount = stepItems.length - readyStepCount
  const overallStatus = issueStepCount > 0 ? copy.settings.configurationNeedsReview : copy.settings.configurationReady
  const modCountLabel =
    installedModCount == null
      ? copy.settings.configurationInstalledModsUnknown
      : copy.settings.configurationInstalledMods(installedModCount)
  const diagnosticsAgeLabel = getDiagnosticsAgeLabel(lastDiagnosticsAt, copy)
  const headerStatusLine = copy.settings.configurationStatusLine(overallStatus, modCountLabel, diagnosticsAgeLabel)
  const gameVersion = runtimeInfo?.gameVersion ?? null
  const smapiVersion = runtimeInfo?.smapiVersion ?? null
  const debugSimulationActive = downloads.activeItems.some((item) => item.source === 'debug' && item.status === 'downloading')
  const diagnosticsApiKeySignature = getConfigurationDiagnosticsApiKeySignature(settingsState.settings)
  const handleDiagnosticsUpdate = useCallback(
    (diagnostics: LauncherNexusDiagnosticsResult) => {
      setDiagnosticRoutes(diagnostics.routes)
      setLastDiagnosticsAt(Date.now())
      onLauncherDiagnosticsUpdate?.(diagnostics)
    },
    [onLauncherDiagnosticsUpdate],
  )
  const handleRefreshDiagnostics = useCallback(() => {
    setDiagnosticsRefreshing(true)
    setDiagnosticRoutes(getDefaultConfigRoutes(copy))
    setDiagnosticsRestartNonce((value) => value + 1)
  }, [copy])
  const account = useNexusApiAccountStatus(settingsState, forceNonPremium, handleRefreshDiagnostics)
  useEffect(() => {
    let disposed = false
    const modsPath = settingsState.settings.modsPath?.trim()

    const loadInstalledModCount = async () => {
      if (!modsPath) {
        if (!disposed) {
          setInstalledModCount(null)
        }
        return
      }

      const cached = readCachedLauncherConfigurationLibraryScan({ modsPath })
      if (cached) {
        if (!disposed) {
          setInstalledModCount(cached.result.mods.length)
        }
        return
      }

      try {
        const result = await launcherPort.scanLibrary({ modsPath })
        writeCachedLauncherConfigurationLibraryScan(result, { modsPath })
        if (!disposed) {
          setInstalledModCount(result.mods.length)
        }
      } catch {
        if (!disposed) {
          setInstalledModCount(null)
        }
      }
    }

    void loadInstalledModCount()

    return () => {
      disposed = true
    }
  }, [launcherPort, settingsState.settings.modsPath])
  useEffect(() => {
    let disposed = false
    const gamePath = settingsState.settings.gamePath?.trim() ?? ''

    const loadRuntimeInfo = async () => {
      const cached = readCachedLauncherConfigurationRuntimeInfo({ gamePath })
      if (cached) {
        if (!disposed) {
          setRuntimeInfo(cached.info)
        }
        return
      }

      try {
        const info = await launcherPort.loadRuntimeInfo()
        writeCachedLauncherConfigurationRuntimeInfo(info, { gamePath })
        if (!disposed) {
          setRuntimeInfo(info)
        }
      } catch {
        if (!disposed) {
          setRuntimeInfo(null)
        }
      }
    }

    void loadRuntimeInfo()

    return () => {
      disposed = true
    }
  }, [launcherPort, settingsState.settings.gamePath])
  useEffect(() => {
    if (!canUseDesktopHost()) {
      return
    }

    let disposed = false
    let timeoutId: number | null = null
    let shouldRestartDiagnostics = diagnosticsRestartNonce > 0
    const cachedDiagnostics = shouldRestartDiagnostics
      ? null
      : readCachedLauncherConfigurationDiagnostics({
          apiKeySignature: diagnosticsApiKeySignature,
        })

    const poll = async () => {
      if (cachedDiagnostics) {
        setDiagnosticRoutes(cachedDiagnostics.diagnostics.routes)
        setLastDiagnosticsAt(cachedDiagnostics.cachedAt)
        onLauncherDiagnosticsUpdate?.(cachedDiagnostics.diagnostics)
        if (!cachedDiagnostics.shouldRefresh) {
          setDiagnosticsRefreshing(false)
          return
        }
      }

      try {
        const diagnostics = shouldRestartDiagnostics ? await restartLauncherNexusDiagnostics() : await loadLauncherNexusDiagnostics()
        shouldRestartDiagnostics = false
        if (disposed) {
          return
        }
        writeCachedLauncherConfigurationDiagnostics(diagnostics, {
          apiKeySignature: diagnosticsApiKeySignature,
        })
        handleDiagnosticsUpdate(diagnostics)
        setDiagnosticsRefreshing(false)
        if (diagnostics.routes.some((route) => route.status === 'loading')) {
          timeoutId = window.setTimeout(() => {
            void poll()
          }, 1000)
        }
      } catch {
        if (!disposed) {
          handleDiagnosticsUpdate({ routes: [] })
          setDiagnosticsRefreshing(false)
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
  }, [diagnosticsApiKeySignature, diagnosticsPollNonce, diagnosticsRestartNonce, handleDiagnosticsUpdate, onLauncherDiagnosticsUpdate])
  const handleViewLogs = useCallback(() => {
    setDebugToolsExpanded(true)
    window.requestAnimationFrame(() => {
      document.querySelector('[data-loading-section="launcher-debug-logs"]')?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      })
    })
  }, [])
  const handleToggleForceOffline = useCallback(async () => {
    const nextForceOffline = !forceOffline
    setForceOfflineBusy(true)

    try {
      const diagnostics = await setLauncherNexusForceOffline(nextForceOffline)
      await applyAppUiStatePatch({
        launcher: {
          forceOffline: nextForceOffline,
        },
      })
      setForceOffline(nextForceOffline)
      writeCachedLauncherConfigurationDiagnostics(diagnostics as LauncherNexusDiagnosticsResult, {
        apiKeySignature: diagnosticsApiKeySignature,
      })
      handleDiagnosticsUpdate(diagnostics as LauncherNexusDiagnosticsResult)
      if (diagnostics.routes.some((route) => route.status === 'loading')) {
        handleRefreshDiagnostics()
      }
    } catch {
      // The config page should keep the last visible route state if the debug override fails.
    } finally {
      setForceOfflineBusy(false)
    }
  }, [diagnosticsApiKeySignature, forceOffline, handleDiagnosticsUpdate, handleRefreshDiagnostics])
  const handleToggleForceNonPremium = useCallback(async () => {
    const nextForceNonPremium = !forceNonPremium
    setForceNonPremiumBusy(true)

    try {
      await applyAppUiStatePatch({
        launcher: {
          forceNonPremium: nextForceNonPremium,
        },
      })
      setForceNonPremium(nextForceNonPremium)
      await account.refreshApiKeyStatus({
        force: true,
        forceNonPremium: nextForceNonPremium,
      })
    } catch {
      // Debug-only account tier override should keep the current visible state on failure.
    } finally {
      setForceNonPremiumBusy(false)
    }
  }, [account, forceNonPremium])
  const handleClearLauncherImageCache = () => {
    void clearLauncherImageCache().catch(() => {
      // Debug-only affordance: ignore desktop bridge failures here.
    })
  }

  return (
    <section className="launcher-configuration-page">
      <div className="launcher-configuration-canvas">
        <LoadingMotionReveal itemId="launcher-configuration-header" index={0}>
          <header className="launcher-configuration-page-header">
            <div className="launcher-config-title-cluster">
              <div className="launcher-config-breadcrumb">{copy.settings.configurationBreadcrumb}</div>
              <h1 className="launcher-configuration-page-title">{copy.settings.configurationGameTitle}</h1>
              <p className="launcher-config-header-status">{headerStatusLine}</p>
            </div>
            <div className="launcher-config-header-actions">
              <div className="launcher-config-env-tags" aria-label={copy.settings.configurationGameTitle}>
                <span className="launcher-config-env-tag">
                  {gameVersion ? copy.settings.configurationGameVersionTag(gameVersion) : copy.settings.configurationVersionUnknown}
                </span>
                <span className="launcher-config-env-tag">
                  {smapiVersion ? copy.settings.configurationSmapiVersionTag(smapiVersion) : copy.settings.configurationVersionUnknown}
                </span>
              </div>
              <div className="launcher-config-header-button-group">
                <button
                  type="button"
                  className="launcher-config-button launcher-config-button-brand"
                  aria-busy={diagnosticsRefreshing}
                  onClick={handleRefreshDiagnostics}
                >
                  {copy.settings.configurationRunDiagnostics}
                </button>
                <button type="button" className="launcher-config-button" onClick={handleViewLogs}>
                  {copy.settings.configurationViewLogs}
                </button>
              </div>
            </div>
          </header>
        </LoadingMotionReveal>

        <div className="launcher-config-layout">
          <main className="launcher-config-main-column">
            <LoadingMotionReveal itemId="launcher-settings-panel" index={1}>
              <ConfigPathPanel settingsState={settingsState} copy={copy} browseLabel={rootCopy.controls.browse} />
            </LoadingMotionReveal>

            <LoadingMotionReveal itemId="launcher-config-network" index={2}>
              <ConfigNexusPanel
                settingsState={settingsState}
                account={account}
                copy={copy}
                routes={diagnosticRoutes}
                diagnosticsRefreshing={diagnosticsRefreshing}
                onRefreshDiagnostics={handleRefreshDiagnostics}
              />
            </LoadingMotionReveal>
          </main>

          <aside className="launcher-config-rail">
            <ConfigCompletionRail title={copy.settings.completionTitle} steps={stepItems} />
            <ConfigAccountCard
              account={account}
              copy={copy}
              premiumExpiryLabel={getPremiumExpiryLabel(account.apiKeyStatus, copy)}
              onRefresh={() => void account.refreshApiKeyStatus({ force: true })}
            />
            <ConfigDownloadDefaults settingsState={settingsState} copy={copy} yesLabel={commonCopy.yes} noLabel={commonCopy.no} />
          </aside>
        </div>

        <LauncherConfigurationMoreTools
          copy={copy}
          debugEnabled={debugEnabled}
          debugToolsExpanded={debugToolsExpanded}
          forceNonPremium={forceNonPremium}
          forceNonPremiumBusy={forceNonPremiumBusy}
          forceOffline={forceOffline}
          forceOfflineBusy={forceOfflineBusy}
          bbcodePreviewExpanded={bbcodePreviewExpanded}
          debugSimulationActive={debugSimulationActive}
          enableDebugModeLabel={settingsCopy.enableDebugModeLabel}
          disableDebugModeLabel={settingsCopy.disableDebugModeLabel}
          onToggleDebugMode={onToggleDebugMode}
          onToggleForceNonPremium={handleToggleForceNonPremium}
          onToggleForceOffline={handleToggleForceOffline}
          onClearLauncherImageCache={handleClearLauncherImageCache}
          onStartDebugSimulation={downloads.startDebugSimulation}
          setDebugToolsExpanded={setDebugToolsExpanded}
          setBbcodePreviewExpanded={setBbcodePreviewExpanded}
        />
      </div>
    </section>
  )
}
