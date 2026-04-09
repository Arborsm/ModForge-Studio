import { RefreshCw } from 'lucide-react'
import { useEditorCopy } from '../../../lib/app/localeContext'
import { LauncherDownloadRow } from '../cards/LauncherDownloadRow'
import { LauncherStateBlock } from './LauncherStateBlock'
import { useLauncherDownloads } from '../../../lib/launcher/useLauncherDownloads'

type LauncherDownloadsPopoverProps = {
  downloads: ReturnType<typeof useLauncherDownloads>
}

type LauncherDownloadsSectionProps = {
  title: string
  items: ReturnType<typeof useLauncherDownloads>['items']
  emptyLabel: string
  downloads: ReturnType<typeof useLauncherDownloads>
  statusLabels: ReturnType<typeof useEditorCopy>['launcher']['states']
}

function LauncherDownloadsSection({
  title,
  items,
  emptyLabel,
  downloads,
  statusLabels,
}: LauncherDownloadsSectionProps) {
  return (
    <section className="launcher-downloads-popover-section">
      <div className="launcher-downloads-popover-section-header">
        <p className="launcher-downloads-popover-section-title">{title}</p>
        <span className="dock-chip">{items.length}</span>
      </div>
      {items.length ? (
        <div className="launcher-downloads-popover-list">
          {items.map((item) => (
            <LauncherDownloadRow
              key={item.id}
              item={item}
              statusLabel={statusLabels[item.status]}
              onRetry={() => downloads.retryItem(item.id)}
              onRemove={() => downloads.removeItem(item.id)}
              onInstall={() => void downloads.installItem(item.id)}
            />
          ))}
        </div>
      ) : (
        <LauncherStateBlock title={emptyLabel} detail="" compact tone="info" />
      )}
    </section>
  )
}

export function LauncherDownloadsPopover({ downloads }: LauncherDownloadsPopoverProps) {
  const copy = useEditorCopy().launcher
  const queueItems = [...downloads.activeItems, ...downloads.queuedItems]
  const readyItems = downloads.readyToInstall
  const completedItems = downloads.installedItems
  const failedItems = downloads.failedItems

  return (
    <div className="launcher-downloads-popover">
      <div className="launcher-downloads-popover-header">
        <div>
          <p className="launcher-downloads-popover-title">{copy.downloads.title}</p>
          <p className="launcher-downloads-popover-subtitle">{copy.downloads.subtitle}</p>
        </div>
        <div className="launcher-downloads-popover-actions">
          {downloads.counts.readyToInstall ? (
            <button
              type="button"
              className="control-button control-button-primary"
              onClick={() => void downloads.installAllReady()}
            >
              <span>{copy.actions.install} ({downloads.counts.readyToInstall})</span>
            </button>
          ) : null}
          {downloads.counts.failed ? (
            <button type="button" className="control-button" onClick={downloads.retryFailed}>
              <span>{copy.actions.retry} ({downloads.counts.failed})</span>
            </button>
          ) : null}
          {downloads.removableItems.length ? (
            <button type="button" className="control-button" onClick={downloads.removeCompleted}>
              <span>{copy.actions.remove} ({downloads.removableItems.length})</span>
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
              <span>{downloads.counts.downloading} {copy.overview.activeDownloads}</span>
            </span>
          </div>

          <LauncherDownloadsSection
            title={`${copy.states.downloading} / ${copy.states.queued}`}
            items={queueItems}
            emptyLabel={copy.downloads.empty}
            downloads={downloads}
            statusLabels={copy.states}
          />
          <LauncherDownloadsSection
            title={copy.actions.install}
            items={readyItems}
            emptyLabel={copy.states.completed}
            downloads={downloads}
            statusLabels={copy.states}
          />
          <LauncherDownloadsSection
            title={copy.overview.completedDownloads}
            items={completedItems}
            emptyLabel={copy.states.completed}
            downloads={downloads}
            statusLabels={copy.states}
          />
          <LauncherDownloadsSection
            title={copy.states.failed}
            items={failedItems}
            emptyLabel={copy.states.failed}
            downloads={downloads}
            statusLabels={copy.states}
          />
        </div>
      )}
    </div>
  )
}
