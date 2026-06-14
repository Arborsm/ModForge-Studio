import { RefreshCw } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import { useLauncherDownloads } from '@features/launcher/model/useLauncherDownloads'
import { LauncherDownloadRow } from '@features/launcher/ui/cards/LauncherDownloadRow'
import { LauncherStateBlock } from '@features/launcher/ui/shared/LauncherStateBlock'
import { orderLauncherDownloadItems } from '@features/launcher/ui/shared/orderLauncherDownloadItems'

type LauncherDownloadsPopoverProps = {
  downloads: ReturnType<typeof useLauncherDownloads>
  onInstallArchives: (archivePaths: string[]) => void
}

export function LauncherDownloadsPopover({ downloads, onInstallArchives }: LauncherDownloadsPopoverProps) {
  const copy = useEditorCopy().launcher
  const orderedItems = orderLauncherDownloadItems(downloads.items)
  const readyArchivePaths = downloads.readyToInstall.map((item) => item.archivePath).filter((path): path is string => Boolean(path))

  return (
    <div className="launcher-downloads-popover">
      <div className="launcher-downloads-popover-header">
        <div>
          <p className="launcher-downloads-popover-title">{copy.downloads.title}</p>
          <p className="launcher-downloads-popover-subtitle">{copy.downloads.subtitle}</p>
        </div>
        <div className="launcher-downloads-popover-actions">
          {readyArchivePaths.length ? (
            <button type="button" className="control-button control-button-primary" onClick={() => onInstallArchives(readyArchivePaths)}>
              <span>
                {copy.actions.install} ({downloads.counts.readyToInstall})
              </span>
            </button>
          ) : null}
          {downloads.counts.failed ? (
            <button type="button" className="control-button" onClick={downloads.retryFailed}>
              <span>
                {copy.actions.retry} ({downloads.counts.failed})
              </span>
            </button>
          ) : null}
          {downloads.removableItems.length ? (
            <button type="button" className="control-button" onClick={downloads.removeCompleted}>
              <span>
                {copy.actions.remove} ({downloads.removableItems.length})
              </span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="launcher-downloads-popover-metrics">
        <div className="metric-card">
          <span className="metric-label">{copy.overview.queuedDownloads}</span>
          <strong className="metric-value">{downloads.counts.queued}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">{copy.overview.activeDownloads}</span>
          <strong className="metric-value">{downloads.counts.downloading}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">{copy.overview.completedDownloads}</span>
          <strong className="metric-value">{downloads.counts.completed}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">{copy.states.failed}</span>
          <strong className="metric-value">{downloads.counts.failed}</strong>
        </div>
      </div>

      {!downloads.items.length ? (
        <LauncherStateBlock title={copy.downloads.empty} detail={copy.downloads.subtitle} tone="info" />
      ) : (
        <div className="launcher-downloads-popover-body">
          <div className="launcher-downloads-popover-refresh">
            <span className="dock-chip">
              <RefreshCw className="h-3 w-3" />
              <span>
                {downloads.counts.downloading} {copy.overview.activeDownloads}
              </span>
            </span>
            <span className="dock-chip">{orderedItems.length}</span>
          </div>
          <div className="launcher-downloads-popover-list-shell">
            <div className="launcher-downloads-popover-list">
              {orderedItems.map((item) => (
                <LauncherDownloadRow
                  key={item.id}
                  item={item}
                  statusLabel={copy.states[item.status]}
                  onRetry={() => downloads.retryItem(item.id)}
                  onRemove={() => downloads.removeItem(item.id)}
                  onInstall={() => (item.archivePath ? onInstallArchives([item.archivePath]) : undefined)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
