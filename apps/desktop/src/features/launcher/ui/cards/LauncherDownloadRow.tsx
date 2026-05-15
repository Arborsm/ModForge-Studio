import { AlertCircle, CheckCircle2, Clock3, DownloadCloud, Trash2 } from 'lucide-react'
import { useEditorCopy } from '@locales/localeContext'
import type { LauncherDownloadQueueItem } from '@features/launcher'
import { ProgressRing } from '@shared/ui/ProgressRing.tsx'

type LauncherDownloadRowProps = {
  item: LauncherDownloadQueueItem
  statusLabel: string
  onRetry: () => void
  onRemove: () => void
  onInstall: () => void
}

function getStatusIcon(status: LauncherDownloadQueueItem['status']) {
  if (status === 'failed') {
    return <AlertCircle className="h-5 w-5" />
  }

  if (status === 'completed' || status === 'installed') {
    return <CheckCircle2 className="h-5 w-5" />
  }

  if (status === 'downloading') {
    return <DownloadCloud className="h-5 w-5" />
  }

  return <Clock3 className="h-5 w-5" />
}

function getDownloadProgressPercent(item: LauncherDownloadQueueItem) {
  if (typeof item.totalBytes !== 'number' || item.totalBytes <= 0 || typeof item.downloadedBytes !== 'number') {
    return null
  }

  return Math.max(0, Math.min(100, Math.round((item.downloadedBytes / item.totalBytes) * 100)))
}

function formatMegabytes(bytes: number | null) {
  if (typeof bytes !== 'number') {
    return null
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function classifyDownloadError(message: string | null) {
  if (!message) {
    return null
  }

  const normalized = message.toLowerCase()
  if (normalized.includes('premium') || normalized.includes('403') || normalized.includes('forbidden')) {
    return 'premiumRequired' as const
  }
  if (normalized.includes('429') || normalized.includes('rate limited') || normalized.includes('rate limit')) {
    return 'rateLimited' as const
  }
  if (normalized.includes('503') || normalized.includes('service unavailable')) {
    return 'serviceUnavailable' as const
  }
  if (
    normalized.includes('network') ||
    normalized.includes('timed out') ||
    normalized.includes('timeout') ||
    normalized.includes('connection')
  ) {
    return 'network' as const
  }
  if (normalized.includes('401') || normalized.includes('api key') || normalized.includes('not authenticated')) {
    return 'invalidApiKey' as const
  }

  return null
}

export function LauncherDownloadRow({ item, statusLabel, onRetry, onRemove, onInstall }: LauncherDownloadRowProps) {
  const rootCopy = useEditorCopy()
  const copy = rootCopy.launcher
  const sourceLabel =
    item.source === 'updates' ? copy.pages.updates : item.source === 'debug' ? copy.pages.configuration : copy.pages.discover
  const secondaryLabel = [sourceLabel, item.version ?? rootCopy.common.none].join(' / ')
  const resolvedPath = item.installedTargetPath ?? item.archivePath
  const canRetry = item.status === 'failed'
  const canInstall = Boolean(item.archivePath) && (item.status === 'completed' || item.status === 'failed')
  const progressPercent = getDownloadProgressPercent(item)
  const progressRateLabel = formatMegabytes(item.bytesPerSecond)
  const progressDownloadedLabel = formatMegabytes(item.downloadedBytes)
  const progressTotalLabel = formatMegabytes(item.totalBytes)
  const localizedErrorKind = classifyDownloadError(item.error)
  const localizedError = localizedErrorKind ? copy.diagnostics.errors[localizedErrorKind] : null
  const progressLabel =
    item.status === 'downloading' && progressPercent !== null
      ? [
          `${progressPercent}%`,
          progressRateLabel ? `${progressRateLabel}/s` : null,
          progressDownloadedLabel && progressTotalLabel ? `${progressDownloadedLabel} / ${progressTotalLabel}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null

  return (
    <article className="launcher-download-row">
      <div className="launcher-download-row-main">
        <div className="launcher-download-row-icon">
          {item.status === 'downloading' && progressPercent !== null ? (
            <ProgressRing
              progress={progressPercent}
              size={42}
              strokeWidth={3}
              label={`${item.title} download progress`}
              className="launcher-download-row-progress"
            >
              <DownloadCloud className="h-5 w-5" />
            </ProgressRing>
          ) : (
            getStatusIcon(item.status)
          )}
        </div>

        <div className="launcher-download-row-body min-w-0 flex-1">
          <div className="launcher-download-row-topline">
            <p className="launcher-download-row-title">{item.title}</p>
            <p className="launcher-download-row-subtitle">{secondaryLabel}</p>
            <span
              className={`status-pill status-pill-compact ${
                item.status === 'failed'
                  ? 'status-pill-error'
                  : item.status === 'completed' || item.status === 'installed'
                    ? 'status-pill-ready'
                    : 'status-pill-working'
              }`}
            >
              {statusLabel}
            </span>
          </div>

          {localizedError ? (
            <div className="launcher-alert-card launcher-alert-card-error launcher-nexus-message-card" role="alert">
              <div className="launcher-alert-card-copy">
                <p className="launcher-alert-card-eyebrow">{copy.diagnostics.errorCardLabel}</p>
                <p className="launcher-alert-card-title">{localizedError.title}</p>
                <p className="launcher-alert-card-subtitle">{localizedError.detail}</p>
              </div>
            </div>
          ) : item.error ? (
            <p className="launcher-download-row-detailline launcher-download-row-error">{item.error}</p>
          ) : null}
          {!item.error && progressLabel ? (
            <p className="launcher-download-row-detailline launcher-download-row-progress-copy">{progressLabel}</p>
          ) : null}
          {!item.error && !progressLabel && resolvedPath ? (
            <p className="launcher-download-row-detailline launcher-download-row-path" title={resolvedPath}>
              {resolvedPath}
            </p>
          ) : null}
        </div>
      </div>

      <div className="launcher-download-row-actions">
        {canRetry ? (
          <button type="button" className="control-button" onClick={onRetry}>
            {copy.actions.retry}
          </button>
        ) : null}
        {canInstall ? (
          <button type="button" className="control-button control-button-primary" onClick={onInstall}>
            {copy.actions.install}
          </button>
        ) : null}
        <button type="button" className="control-button" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
          <span>{copy.actions.remove}</span>
        </button>
      </div>
    </article>
  )
}
