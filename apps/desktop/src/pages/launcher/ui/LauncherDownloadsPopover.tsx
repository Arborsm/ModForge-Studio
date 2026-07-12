import { Download } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import { useLauncherDownloads } from '@features/launcher/model/useLauncherDownloads'
import { LauncherDownloadRow } from '@features/launcher/ui/cards/LauncherDownloadRow'
import { orderLauncherDownloadItems } from '@features/launcher/ui/shared/orderLauncherDownloadItems'

type LauncherDownloadsPopoverProps = {
  downloads: ReturnType<typeof useLauncherDownloads>
  onInstallArchives: (archivePaths: string[]) => void
}

export function LauncherDownloadsPopover({ downloads, onInstallArchives }: LauncherDownloadsPopoverProps) {
  const copy = useEditorCopy().launcher
  const orderedItems = orderLauncherDownloadItems(downloads.items)
  const readyArchivePaths = downloads.readyToInstall.map((item) => item.archivePath).filter((path): path is string => Boolean(path))
  const hasItems = downloads.items.length > 0
  const activeCount = downloads.counts.downloading
  const totalCount = orderedItems.length

  // Prototype C header: "下载  28 项 · 3 进行中"
  const metaLabel = hasItems
    ? activeCount > 0
      ? copy.downloads.queueActiveMeta(totalCount, activeCount)
      : copy.downloads.queueCount(totalCount)
    : null

  return (
    <div className="launcher-downloads-popover">
      <header className="launcher-downloads-popover-header">
        <div className="launcher-downloads-popover-heading">
          <p className="launcher-downloads-popover-title">{copy.downloads.title}</p>
          {metaLabel ? <span className="launcher-downloads-popover-meta">{metaLabel}</span> : null}
        </div>

        <div className="launcher-downloads-popover-actions">
          {readyArchivePaths.length ? (
            <button type="button" className="control-button control-button-primary" onClick={() => onInstallArchives(readyArchivePaths)}>
              <span>{copy.downloads.installReady(downloads.counts.readyToInstall)}</span>
            </button>
          ) : null}
          {downloads.counts.failed ? (
            <button type="button" className="launcher-downloads-text-action" onClick={downloads.retryFailed}>
              {copy.downloads.retryFailed}
            </button>
          ) : null}
          {downloads.removableItems.length ? (
            <button type="button" className="launcher-downloads-text-action" onClick={downloads.removeCompleted}>
              {copy.downloads.clearFinished}
            </button>
          ) : null}
        </div>
      </header>

      {!hasItems ? (
        <div className="launcher-downloads-empty">
          <span className="launcher-downloads-empty-mark" aria-hidden="true">
            <Download className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <p className="launcher-downloads-empty-title">{copy.downloads.empty}</p>
          <p className="launcher-downloads-empty-detail">{copy.downloads.subtitle}</p>
        </div>
      ) : (
        <div className="launcher-downloads-popover-body">
          <div className="launcher-downloads-popover-list-shell">
            <div className="launcher-downloads-popover-list" role="list">
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
