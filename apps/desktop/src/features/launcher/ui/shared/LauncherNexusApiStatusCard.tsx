import { AlertTriangle, ExternalLink, KeyRound, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useEditorCopy } from '@locales/localeContext'
import { cx } from '@shared/lib/cx'
import { useLauncherPort } from '@features/launcher/model/launcherPortContext'
import type { SsoSnapshot, ValidateApiKeyResult } from '@features/launcher/model/launcherContracts'
import { useLauncherSettings } from '@features/launcher/model/useLauncherSettings'

type LauncherNexusApiStatusCardVariant = 'state-block' | 'debug-card' | 'route-row'
type LauncherNexusApiRouteStatus = 'loading' | 'warning' | 'success' | 'error'

type LauncherNexusApiStatusCardProps = {
  settingsState: ReturnType<typeof useLauncherSettings>
  variant?: LauncherNexusApiStatusCardVariant
  className?: string
  renderCard?: (content: {
    title: string
    description: string
    icon: ReactNode
    actions: ReactNode
    children: ReactNode
    status: LauncherNexusApiRouteStatus
    statusLabel: string
    detail: string
    meta: string[]
  }) => ReactNode
}

type NexusMessageCardKind = keyof ReturnType<typeof useEditorCopy>['launcher']['diagnostics']['errors']

type NexusMessageCard = {
  kind: NexusMessageCardKind
  source: 'api' | 'sso'
}

function formatQuotaResetAt(timestampSeconds: number) {
  return new Date(timestampSeconds * 1000).toLocaleString()
}

function classifyApiError(message: string | null): NexusMessageCard | null {
  if (!message) {
    return null
  }

  const normalized = message.toLowerCase()
  if (normalized.includes('401') || normalized.includes('invalid api key') || normalized.includes('not authenticated')) {
    return { kind: 'invalidApiKey', source: 'api' }
  }
  if (normalized.includes('premium') || normalized.includes('403') || normalized.includes('forbidden')) {
    return { kind: 'premiumRequired', source: 'api' }
  }
  if (normalized.includes('429') || normalized.includes('rate limited') || normalized.includes('rate limit')) {
    return { kind: 'rateLimited', source: 'api' }
  }
  if (normalized.includes('503') || normalized.includes('service unavailable')) {
    return { kind: 'serviceUnavailable', source: 'api' }
  }
  if (normalized.includes('network') || normalized.includes('timed out') || normalized.includes('timeout') || normalized.includes('connection')) {
    return { kind: 'network', source: 'api' }
  }

  return { kind: 'unknown', source: 'api' }
}

function classifySsoError(snapshot: SsoSnapshot | null, bridgeError: string | null): NexusMessageCard | null {
  if (bridgeError) {
    return { kind: classifyApiError(bridgeError)?.kind ?? 'network', source: 'sso' }
  }
  if (snapshot?.status !== 'failed') {
    return null
  }

  switch (snapshot.errorKind) {
    case 'cancelled':
      return { kind: 'ssoCancelled', source: 'sso' }
    case 'authorizationTimeout':
    case 'connectionTimeout':
      return { kind: 'ssoTimeout', source: 'sso' }
    case 'connectionRefused':
      return { kind: 'ssoDenied', source: 'sso' }
    case 'networkError':
      return { kind: 'network', source: 'sso' }
    default:
      return { kind: 'unknown', source: 'sso' }
  }
}

export function LauncherNexusApiStatusCard({
  settingsState,
  variant = 'state-block',
  className,
  renderCard,
}: LauncherNexusApiStatusCardProps) {
  const launcherPort = useLauncherPort()
  const diagnosticsCopy = useEditorCopy().launcher.diagnostics
  const { settings, refresh } = settingsState
  const [apiKeyStatus, setApiKeyStatus] = useState<ValidateApiKeyResult | null>(null)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [apiKeyChecking, setApiKeyChecking] = useState(false)
  const [ssoStatus, setSsoStatus] = useState<SsoSnapshot | null>(null)
  const [ssoError, setSsoError] = useState<string | null>(null)
  const [ssoStarting, setSsoStarting] = useState(false)
  const hasApiKey = Boolean(settings.nexusApiKey?.trim())
  const isSsoActive = ssoStatus?.status === 'connecting' || ssoStatus?.status === 'awaitingAuthorization'

  const refreshApiKeyStatus = useCallback(async () => {
    if (!hasApiKey) {
      setApiKeyStatus(null)
      setApiKeyError(null)
      return
    }

    setApiKeyChecking(true)
    setApiKeyError(null)
    try {
      setApiKeyStatus(await launcherPort.validateNexusApiKey())
    } catch (nextError) {
      setApiKeyStatus(null)
      setApiKeyError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setApiKeyChecking(false)
    }
  }, [hasApiKey, launcherPort])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      if (!hasApiKey) {
        setApiKeyStatus(null)
        setApiKeyError(null)
        return
      }

      setApiKeyChecking(true)
      setApiKeyError(null)
      try {
        const nextStatus = await launcherPort.validateNexusApiKey()
        if (!cancelled) {
          setApiKeyStatus(nextStatus)
        }
      } catch (nextError) {
        if (!cancelled) {
          setApiKeyStatus(null)
          setApiKeyError(nextError instanceof Error ? nextError.message : String(nextError))
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
  }, [hasApiKey, launcherPort])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const pollSsoStatus = async () => {
      try {
        const snapshot = await launcherPort.getNexusSsoStatus()
        if (cancelled) {
          return
        }
        setSsoStatus(snapshot)
        if (snapshot.status === 'authorized') {
          await refresh()
          await refreshApiKeyStatus()
        }
      } catch (nextError) {
        if (!cancelled) {
          setSsoError(nextError instanceof Error ? nextError.message : String(nextError))
        }
      }
    }

    void pollSsoStatus()
    if (isSsoActive) {
      timer = setInterval(() => void pollSsoStatus(), 1500)
    }

    return () => {
      cancelled = true
      if (timer) {
        clearInterval(timer)
      }
    }
  }, [isSsoActive, launcherPort, refresh, refreshApiKeyStatus])

  const startSso = useCallback(async () => {
    setSsoStarting(true)
    setSsoError(null)
    try {
      await launcherPort.startNexusSso()
      setSsoStatus(await launcherPort.getNexusSsoStatus())
    } catch (nextError) {
      setSsoError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setSsoStarting(false)
    }
  }, [launcherPort])

  const cancelSso = useCallback(async () => {
    setSsoError(null)
    try {
      await launcherPort.cancelNexusSso()
      setSsoStatus(await launcherPort.getNexusSsoStatus())
    } catch (nextError) {
      setSsoError(nextError instanceof Error ? nextError.message : String(nextError))
    }
  }, [launcherPort])

  const apiStatusDetail = apiKeyStatus
    ? `${apiKeyStatus.userName} · ${apiKeyStatus.isPremium ? diagnosticsCopy.premiumActive : diagnosticsCopy.premiumFree}`
    : hasApiKey
      ? diagnosticsCopy.apiKeyUnchecked
      : diagnosticsCopy.apiKeyMissing
  const rawErrorLog = apiKeyError ?? ssoError ?? (ssoStatus?.status === 'failed' ? ssoStatus.errorMessage : null)
  const apiRouteStatus: LauncherNexusApiRouteStatus = apiKeyChecking || ssoStarting || isSsoActive
    ? 'loading'
    : apiKeyError || ssoError || ssoStatus?.status === 'failed'
      ? 'error'
      : apiKeyStatus || ssoStatus?.status === 'authorized'
        ? 'success'
        : 'warning'
  const apiRouteMeta = [
    apiKeyStatus ? null : apiStatusDetail,
    apiKeyStatus ? `${diagnosticsCopy.apiKeyBadge}: ${apiKeyStatus.isPremium ? diagnosticsCopy.premiumActive : diagnosticsCopy.premiumFree}` : null,
    apiKeyStatus?.dailyRemaining != null ? diagnosticsCopy.quotaRemaining(String(apiKeyStatus.dailyRemaining)) : null,
    apiKeyStatus?.hourlyRemaining != null ? diagnosticsCopy.hourlyQuotaRemaining(String(apiKeyStatus.hourlyRemaining)) : null,
    apiKeyStatus?.hourlyResetAt != null ? diagnosticsCopy.quotaResetAt(formatQuotaResetAt(apiKeyStatus.hourlyResetAt)) : null,
    apiKeyStatus?.dailyResetAt != null ? diagnosticsCopy.quotaResetAt(formatQuotaResetAt(apiKeyStatus.dailyResetAt)) : null,
    ssoStatus?.status === 'authorized' ? diagnosticsCopy.ssoAuthorized : null,
    ssoStatus?.status === 'failed' && ssoStatus.errorMessage ? ssoStatus.errorMessage : null,
    ssoError,
    rawErrorLog ? `Log: ${rawErrorLog}` : null,
  ].filter((item): item is string => Boolean(item))
  const messageCards = [
    classifyApiError(apiKeyError),
    classifySsoError(ssoStatus, ssoError),
  ].filter((item): item is NexusMessageCard => Boolean(item))
  const primaryMessageCard = messageCards[0] ?? null
  const primaryMessageCopy = primaryMessageCard ? diagnosticsCopy.errors[primaryMessageCard.kind] : null

  const actions = (
    <div className="launcher-toolbar">
      <button
        type="button"
        className="control-button"
        disabled={!hasApiKey || apiKeyChecking}
        onClick={() => void refreshApiKeyStatus()}
      >
        <RefreshCw className={cx('h-4 w-4', apiKeyChecking && 'animate-spin')} />
        <span>{diagnosticsCopy.validateApiKeyAction}</span>
      </button>
      <button
        type="button"
        className="control-button"
        disabled={ssoStarting || isSsoActive}
        onClick={() => void startSso()}
      >
        <ExternalLink className="h-4 w-4" />
        <span>{isSsoActive ? diagnosticsCopy.ssoWaiting : diagnosticsCopy.startSsoAction}</span>
      </button>
      {isSsoActive ? (
        <button type="button" className="control-button" onClick={() => void cancelSso()}>
          {diagnosticsCopy.cancelSsoAction}
        </button>
      ) : null}
    </div>
  )

  const content = (
    <div className={cx('launcher-nexus-api-status-grid', variant === 'debug-card' && 'launcher-debug-api-status-grid')}>
      <section className="launcher-state-block launcher-state-block-compact">
        <div className="launcher-state-block-copy">
          <h3 className="launcher-state-block-title">{diagnosticsCopy.apiKeyBadge}</h3>
          <p className="launcher-state-block-detail">{apiStatusDetail}</p>
          {apiKeyStatus?.dailyRemaining != null ? (
            <p className="launcher-state-block-detail">{diagnosticsCopy.quotaRemaining(String(apiKeyStatus.dailyRemaining))}</p>
          ) : null}
          {apiKeyStatus?.hourlyRemaining != null ? (
            <p className="launcher-state-block-detail">{diagnosticsCopy.hourlyQuotaRemaining(String(apiKeyStatus.hourlyRemaining))}</p>
          ) : null}
          {apiKeyStatus?.hourlyResetAt != null ? (
            <p className="launcher-state-block-detail">{diagnosticsCopy.quotaResetAt(formatQuotaResetAt(apiKeyStatus.hourlyResetAt))}</p>
          ) : null}
        </div>
      </section>

      <section className="launcher-state-block launcher-state-block-compact">
        <div className="launcher-state-block-copy">
          <h3 className="launcher-state-block-title">{diagnosticsCopy.startSsoAction}</h3>
          {ssoStatus?.status === 'authorized' ? (
            <p className="launcher-state-block-detail">{diagnosticsCopy.ssoAuthorized}</p>
          ) : (
            <p className="launcher-state-block-detail">{isSsoActive ? diagnosticsCopy.ssoWaiting : diagnosticsCopy.apiKeyUnchecked}</p>
          )}
        </div>
      </section>
      {messageCards.map((card) => {
        const message = diagnosticsCopy.errors[card.kind]

        return (
          <section
            key={`${card.source}-${card.kind}`}
            className="launcher-alert-card launcher-alert-card-error launcher-nexus-message-card"
            role="alert"
          >
            <div className="launcher-alert-card-title-row">
              <span className="launcher-alert-card-icon" aria-hidden="true">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="launcher-alert-card-copy">
                <p className="launcher-alert-card-eyebrow">{diagnosticsCopy.errorCardLabel}</p>
                <h3 className="launcher-alert-card-title">{message.title}</h3>
                <p className="launcher-alert-card-subtitle">{message.detail}</p>
                <p className="launcher-alert-card-note">{message.action}</p>
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )

  if (renderCard) {
    return renderCard({
      title: diagnosticsCopy.apiKeyTitle,
      description: diagnosticsCopy.apiKeySubtitle,
      icon: <KeyRound className="h-4 w-4" />,
      actions,
      children: content,
      status: apiRouteStatus,
      statusLabel: apiRouteStatus,
      detail: primaryMessageCopy?.title ?? apiStatusDetail,
      meta: primaryMessageCopy
        ? [primaryMessageCopy.detail, primaryMessageCopy.action, ...apiRouteMeta]
        : apiRouteMeta,
    })
  }

  return (
    <section className={cx('launcher-state-block', className)}>
      <div className="launcher-state-block-icon">
        <KeyRound className="h-4 w-4" />
      </div>
      <div className="launcher-state-block-copy">
        <p className="launcher-state-block-title">{diagnosticsCopy.apiKeyTitle}</p>
        <p className="launcher-state-block-detail">{apiStatusDetail}</p>
        {apiKeyStatus?.dailyRemaining != null ? (
          <p className="launcher-state-block-detail">{diagnosticsCopy.quotaRemaining(String(apiKeyStatus.dailyRemaining))}</p>
        ) : null}
        {apiKeyStatus?.hourlyRemaining != null ? (
          <p className="launcher-state-block-detail">{diagnosticsCopy.hourlyQuotaRemaining(String(apiKeyStatus.hourlyRemaining))}</p>
        ) : null}
        {apiKeyStatus?.hourlyResetAt != null ? (
          <p className="launcher-state-block-detail">{diagnosticsCopy.quotaResetAt(formatQuotaResetAt(apiKeyStatus.hourlyResetAt))}</p>
        ) : null}
        {ssoStatus?.status === 'authorized' ? (
          <p className="launcher-state-block-detail">{diagnosticsCopy.ssoAuthorized}</p>
        ) : null}
        {primaryMessageCopy ? (
          <div className="launcher-alert-card launcher-alert-card-error launcher-nexus-message-card" role="alert">
            <div className="launcher-alert-card-title-row">
              <span className="launcher-alert-card-icon" aria-hidden="true">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="launcher-alert-card-copy">
                <p className="launcher-alert-card-eyebrow">{diagnosticsCopy.errorCardLabel}</p>
                <h3 className="launcher-alert-card-title">{primaryMessageCopy.title}</h3>
                <p className="launcher-alert-card-subtitle">{primaryMessageCopy.detail}</p>
                <p className="launcher-alert-card-note">{primaryMessageCopy.action}</p>
              </div>
            </div>
          </div>
        ) : null}
        <div className="launcher-settings-inline-actions mt-2">{actions}</div>
      </div>
    </section>
  )
}
