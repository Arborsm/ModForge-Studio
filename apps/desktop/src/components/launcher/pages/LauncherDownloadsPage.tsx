import { RefreshCw } from 'lucide-react'
import { useEditorCopy } from '../../../lib/app/localeContext'
import { useLauncherDownloads } from '../../../lib/launcher/useLauncherDownloads'
import { PanelEmptyState, PanelSection } from '../../ui/PanelSection'
import { PanelFrame } from '../../ui/PanelFrame'
import { LauncherDownloadRow } from '../cards/LauncherDownloadRow'
import { LauncherEmptyState } from '../shared/LauncherEmptyState'

type LauncherDownloadsPageProps = {
  downloads: ReturnType<typeof useLauncherDownloads>
}

function DownloadSection({
  title,
  subtitle,
  items,
  emptyLabel,
  copyStates,
  downloads,
}: {
  title: string
  subtitle: string
  items: ReturnType<typeof useLauncherDownloads>['items']
  emptyLabel: string
  copyStates: ReturnType<typeof useEditorCopy>['launcher']['states']
  downloads: ReturnType<typeof useLauncherDownloads>
}) {
  return (
    <PanelSection title={title} subtitle={subtitle}>
      {items.length ? (
        <div className="launcher-download-list">
          {items.map((item) => (
            <LauncherDownloadRow
              key={item.id}
              item={item}
              statusLabel={copyStates[item.status]}
              onRetry={() => downloads.retryItem(item.id)}
              onRemove={() => downloads.removeItem(item.id)}
              onInstall={() => void downloads.installItem(item.id)}
            />
          ))}
        </div>
      ) : (
        <PanelEmptyState>{emptyLabel}</PanelEmptyState>
      )}
    </PanelSection>
  )
}

export function LauncherDownloadsPage({ downloads }: LauncherDownloadsPageProps) {
  const copy = useEditorCopy().launcher
  const queueItems = [...downloads.activeItems, ...downloads.queuedItems]
  const completedItems = [...downloads.readyToInstall, ...downloads.installedItems]

  return (
    <PanelFrame
      title={copy.downloads.title}
      subtitle={copy.downloads.subtitle}
      bodyClassName="space-y-4"
      headerAction={
        <div className="launcher-header-actions launcher-header-actions-tight">
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
          <span className="dock-chip">
            <RefreshCw className="h-3 w-3" />
            <span>{downloads.counts.downloading} {copy.overview.activeDownloads}</span>
          </span>
        </div>
      }
    >
      <PanelSection variant="accent">
        <div className="launcher-metric-grid">
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
      </PanelSection>

      {!downloads.items.length ? (
        <LauncherEmptyState title={copy.downloads.empty} detail={copy.downloads.subtitle} />
      ) : (
        <div className="launcher-manager-grid">
          <div className="launcher-manager-column">
            <DownloadSection
              title={`${copy.states.downloading} (${queueItems.length})`}
              subtitle={copy.downloads.subtitle}
              items={queueItems}
              emptyLabel={copy.downloads.empty}
              copyStates={copy.states}
              downloads={downloads}
            />
          </div>

          <div className="launcher-manager-column">
            <DownloadSection
              title={`${copy.overview.completedDownloads} (${completedItems.length})`}
              subtitle={copy.downloads.subtitle}
              items={completedItems}
              emptyLabel={copy.states.completed}
              copyStates={copy.states}
              downloads={downloads}
            />
            <DownloadSection
              title={`${copy.states.failed} (${downloads.failedItems.length})`}
              subtitle={copy.downloads.subtitle}
              items={downloads.failedItems}
              emptyLabel={copy.states.failed}
              copyStates={copy.states}
              downloads={downloads}
            />
          </div>
        </div>
      )}
    </PanelFrame>
  )
}
