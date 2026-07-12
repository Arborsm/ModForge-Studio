import { useEditorCopy } from '@locales/provider'
import type { LauncherDownloadQueueItem } from '../../model/types'
import { formatBytes } from '@shared/lib/formatting'
import { cx } from '@shared/lib/helper'

type LauncherDownloadRowProps = {
  item: LauncherDownloadQueueItem
  statusLabel: string
  onRetry: () => void
  onRemove: () => void
  onInstall: () => void
}

function getDownloadProgressPercent(item: LauncherDownloadQueueItem) {
  if (typeof item.totalBytes !== 'number' || item.totalBytes <= 0 || typeof item.downloadedBytes !== 'number') {
    return null
  }

  return Math.max(0, Math.min(100, Math.round((item.downloadedBytes / item.totalBytes) * 100)))
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
  const versionLabel = item.version ?? rootCopy.common.none
  const canRetry = item.status === 'failed'
  const canInstall = Boolean(item.archivePath) && (item.status === 'completed' || item.status === 'failed')
  const progressPercent = getDownloadProgressPercent(item)
  const isDownloading = item.status === 'downloading'
  const showProgress = isDownloading && progressPercent !== null
  const rateLabel = typeof item.bytesPerSecond === 'number' ? `${formatBytes(item.bytesPerSecond)}/s` : null
  const sizeLabel =
    typeof item.downloadedBytes === 'number' && typeof item.totalBytes === 'number'
      ? `${formatBytes(item.downloadedBytes)} / ${formatBytes(item.totalBytes)}`
      : null
  const localizedErrorKind = classifyDownloadError(item.error)
  const localizedError = localizedErrorKind ? copy.diagnostics.errors[localizedErrorKind] : null
  const errorTitle = localizedError?.title ?? item.error
  const errorDetail = localizedError?.detail ?? null

  const secondary = showProgress
    ? [rateLabel, sizeLabel].filter(Boolean).join(' · ')
    : errorTitle
      ? errorTitle
      : `${sourceLabel} / ${versionLabel}`

  const statusText = showProgress && progressPercent !== null ? `${progressPercent}%` : statusLabel

  return (
    <article className={cx('launcher-download-row', `launcher-download-row-${item.status}`)} data-status={item.status} role="listitem">
      <span className="launcher-download-row-dot" aria-hidden="true" />

      <div className="launcher-download-row-body">
        <p className="launcher-download-row-title" title={item.title}>
          {item.title}
        </p>
        <p
          className={cx('launcher-download-row-secondary', Boolean(errorTitle) && !showProgress && 'is-error')}
          title={errorDetail ?? secondary}
        >
          {secondary}
        </p>
        {errorDetail && !showProgress ? <p className="launcher-download-row-error-detail">{errorDetail}</p> : null}
        {showProgress ? (
          <div
            className="launcher-download-row-progress"
            role="progressbar"
            aria-valuenow={progressPercent ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${item.title} ${progressPercent ?? 0}%`}
          >
            <span className="launcher-download-row-progress-fill" style={{ width: `${progressPercent ?? 0}%` }} />
          </div>
        ) : null}
      </div>

      <div className="launcher-download-row-side">
        <span
          className={cx(
            'launcher-download-row-status',
            isDownloading && 'is-active',
            (item.status === 'completed' || item.status === 'installed') && 'is-ready',
            item.status === 'failed' && 'is-danger',
          )}
        >
          {statusText}
        </span>
        <div className="launcher-download-row-links">
          {canInstall ? (
            <button type="button" className="launcher-download-row-link is-strong" onClick={onInstall}>
              {copy.actions.install}
            </button>
          ) : null}
          {canRetry ? (
            <button type="button" className="launcher-download-row-link is-strong" onClick={onRetry}>
              {copy.actions.retry}
            </button>
          ) : null}
          <button type="button" className="launcher-download-row-link" onClick={onRemove}>
            {copy.actions.remove}
          </button>
        </div>
      </div>
    </article>
  )
}
