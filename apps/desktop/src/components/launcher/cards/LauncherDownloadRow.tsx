import { AlertCircle, CheckCircle2, Clock3, DownloadCloud, Trash2 } from 'lucide-react'
import { useEditorCopy } from '../../../lib/app/localeContext'
import type { LauncherDownloadQueueItem } from '../../../lib/launcher/types'

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

export function LauncherDownloadRow({
  item,
  statusLabel,
  onRetry,
  onRemove,
  onInstall,
}: LauncherDownloadRowProps) {
  const rootCopy = useEditorCopy()
  const copy = rootCopy.launcher
  const sourceLabel = item.source === 'updates' ? copy.pages.updates : copy.pages.discover
  const secondaryLabel = [sourceLabel, item.version ?? rootCopy.common.none].join(' / ')
  const resolvedPath = item.installedTargetPath ?? item.archivePath
  const canRetry = item.status === 'failed'
  const canInstall = item.status === 'completed' && Boolean(item.archivePath)

  return (
    <article className="launcher-download-row">
      <div className="launcher-download-row-main">
        <div className="launcher-download-row-icon">{getStatusIcon(item.status)}</div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="launcher-download-row-title">{item.title}</p>
              <p className="launcher-download-row-subtitle">{secondaryLabel}</p>
            </div>

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

          {item.error ? <p className="launcher-download-row-error">{item.error}</p> : null}
          {!item.error && resolvedPath ? (
            <p className="launcher-download-row-path" title={resolvedPath}>
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
