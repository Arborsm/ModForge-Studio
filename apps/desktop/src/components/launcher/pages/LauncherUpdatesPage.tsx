import { Download, ExternalLink, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useEditorCopy } from '../../../lib/app/localeContext'
import { cx } from '../../../lib/cx'
import { useLauncherImage } from '../../../lib/launcher/imageLoader'
import { useLauncherUpdates } from '../../../lib/launcher/useLauncherUpdates'
import type { LauncherSettingsDraft, QueueLauncherDownloadInput } from '../../../lib/launcher/types'
import { LauncherControlBar } from '../shared/LauncherControlBar'
import { LauncherPageScaffold } from '../shared/LauncherPageScaffold'
import { LauncherSplitLayout } from '../shared/LauncherSplitLayout'
import { LauncherStateBlock } from '../shared/LauncherStateBlock'

type LauncherUpdatesPageProps = {
  settings: LauncherSettingsDraft
  onQueueDownload: (input: QueueLauncherDownloadInput) => void
  onNavigateToSettings?: () => void
}

function UpdateCard({
  name,
  currentVersion,
  latestVersion,
  modUrl,
  imageUrl,
  selected,
  active,
  onSelect,
  onToggleSelected,
  onQueueDownload,
}: {
  name: string
  currentVersion: string | null
  latestVersion: string
  modUrl: string
  imageUrl: string | null
  selected: boolean
  active: boolean
  onSelect: () => void
  onToggleSelected: () => void
  onQueueDownload: () => void
}) {
  const copy = useEditorCopy().launcher
  const image = useLauncherImage(imageUrl)
  const versionLine =
    `${copy.fields.currentVersion}: ${currentVersion ?? copy.states.noSummary} / ` +
    `${copy.fields.latestVersion}: ${latestVersion}`

  return (
    <article
      className={cx(
        'launcher-update-card',
        active && 'panel-list-card-active',
        selected
          ? 'border-[color-mix(in_srgb,var(--accent)_40%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_60%,var(--bg-panel))]'
          : undefined,
      )}
    >
      <button type="button" className="launcher-update-card-media" onClick={onSelect}>
        {image.imageUrl ? <img src={image.imageUrl} alt="" className="launcher-discover-card-image" /> : null}
      </button>
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <button type="button" className="min-w-0 text-left" onClick={onSelect}>
            <p className="launcher-discover-card-title">{name}</p>
            <p className="launcher-discover-card-subtitle">{versionLine}</p>
          </button>
          <input
            type="checkbox"
            aria-label={name}
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
            checked={selected}
            onChange={onToggleSelected}
          />
        </div>
        <div className="launcher-discover-card-actions">
          <a
            href={modUrl}
            target="_blank"
            rel="noreferrer"
            className="control-button"
            aria-label={copy.actions.openModPage}
            title={copy.actions.openModPage}
          >
            <span>{copy.actions.openModPage}</span>
          </a>
          <button type="button" className="control-button control-button-primary" onClick={onQueueDownload}>
            <Download className="h-4 w-4" />
            <span>{copy.actions.queueDownload}</span>
          </button>
        </div>
      </div>
    </article>
  )
}

export function LauncherUpdatesPage({
  settings,
  onQueueDownload,
  onNavigateToSettings,
}: LauncherUpdatesPageProps) {
  const copy = useEditorCopy().launcher
  const updates = useLauncherUpdates(settings)
  const [selectedUpdateKey, setSelectedUpdateKey] = useState<string | null>(null)
  const queueItem = (item: (typeof updates.items)[number]) =>
    onQueueDownload({
      modId: item.modId,
      title: item.name,
      imageUrl: item.imageUrl,
      version: item.latestVersion,
      source: 'updates',
    })
  const activeSelectedUpdateKey = updates.items.some((item) => `${item.modId}:${item.absolutePath}` === selectedUpdateKey)
    ? selectedUpdateKey
    : updates.items[0]
      ? `${updates.items[0].modId}:${updates.items[0].absolutePath}`
      : null

  const selectedItem = useMemo(
    () => updates.items.find((item) => `${item.modId}:${item.absolutePath}` === activeSelectedUpdateKey) ?? null,
    [activeSelectedUpdateKey, updates.items],
  )
  const selectedImage = useLauncherImage(selectedItem?.imageUrl ?? null)

  const listPanel = (
    <div className="space-y-4">
      <LauncherControlBar
        title={copy.updates.title}
        subtitle={copy.updates.selectionSummary(updates.selectedCount, updates.items.length)}
        action={
          <button type="button" className="control-button" onClick={() => void updates.refresh()}>
            <RefreshCw className="h-4 w-4" />
            <span>{copy.actions.refresh}</span>
          </button>
        }
      >
        <div className="launcher-toolbar">
          <button type="button" className="control-button" disabled={updates.allSelected} onClick={updates.selectAll}>
            <span>{copy.actions.selectAllUpdates}</span>
          </button>
          <button type="button" className="control-button" disabled={!updates.hasSelection} onClick={updates.clearSelection}>
            <span>{copy.actions.clearUpdateSelection}</span>
          </button>
          <button
            type="button"
            className="control-button control-button-primary"
            disabled={!updates.hasSelection}
            onClick={() => {
              updates.selectedItems.forEach(queueItem)
            }}
          >
            <Download className="h-4 w-4" />
            <span>{copy.actions.queueSelectedDownloads}</span>
          </button>
        </div>
      </LauncherControlBar>

      {!settings.modsPath ? (
        <LauncherStateBlock
          title={copy.states.missingModsPath}
          detail={copy.updates.subtitle}
          tone="warning"
          action={
            onNavigateToSettings ? (
              <button type="button" className="control-button control-button-primary" onClick={onNavigateToSettings}>
                {copy.pages.settings}
              </button>
            ) : null
          }
        />
      ) : null}

      {settings.modsPath && updates.state === 'error' ? (
        <LauncherStateBlock title={copy.updates.title} detail={updates.error ?? copy.updates.empty} tone="warning" />
      ) : null}

      {settings.modsPath && !updates.items.length && updates.state !== 'error' ? (
        <LauncherStateBlock title={copy.updates.empty} detail={copy.updates.subtitle} />
      ) : null}

      {settings.modsPath && updates.items.length ? (
        <div className="launcher-update-list">
          {updates.items.map((item) => (
            <UpdateCard
              key={`${item.modId}:${item.absolutePath}`}
              {...item}
              selected={updates.isSelected(item)}
              active={activeSelectedUpdateKey === `${item.modId}:${item.absolutePath}`}
              onSelect={() => setSelectedUpdateKey(`${item.modId}:${item.absolutePath}`)}
              onToggleSelected={() => updates.toggleSelected(item)}
              onQueueDownload={() => queueItem(item)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )

  const details = selectedItem ? (
    <section className="panel-surface h-full">
      <header className="panel-header">
        <div className="min-w-0">
          <p className="panel-title">{selectedItem.name}</p>
          <p className="panel-subtitle">{selectedItem.modUrl}</p>
        </div>
      </header>
      <div className="panel-body space-y-4">
        <div className="launcher-detail-hero">
          <div className="launcher-detail-cover launcher-mod-card-cover">
            {selectedImage.imageUrl ? <img src={selectedImage.imageUrl} alt="" className="launcher-mod-card-cover-image" /> : null}
            {!selectedImage.imageUrl ? <span className="launcher-mod-card-cover-fallback">{selectedItem.name.slice(0, 2).toUpperCase()}</span> : null}
          </div>
          <div>
            <p className="launcher-detail-title">{selectedItem.name}</p>
            <p className="launcher-detail-summary">{copy.updates.subtitle}</p>
          </div>
        </div>

        <div className="launcher-page-stats-grid launcher-page-stats-grid-compact">
          <div className="metric-card">
            <span className="metric-label">{copy.fields.currentVersion}</span>
            <strong className="metric-value">{selectedItem.currentVersion ?? copy.states.noSummary}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">{copy.fields.latestVersion}</span>
            <strong className="metric-value">{selectedItem.latestVersion}</strong>
          </div>
        </div>

        <div className="launcher-toolbar">
          <a href={selectedItem.modUrl} target="_blank" rel="noreferrer" className="control-button">
            <ExternalLink className="h-4 w-4" />
            <span>{copy.actions.openModPage}</span>
          </a>
          <button type="button" className="control-button control-button-primary" onClick={() => queueItem(selectedItem)}>
            <Download className="h-4 w-4" />
            <span>{copy.actions.queueDownload}</span>
          </button>
        </div>
      </div>
    </section>
  ) : (
    <LauncherStateBlock title={copy.updates.title} detail={copy.updates.subtitle} />
  )

  return (
    <LauncherPageScaffold
      eyebrow={copy.pages.updates}
      title={copy.updates.title}
      subtitle={copy.updates.subtitle}
      stats={
        <div className="launcher-page-stats-grid">
          <div className="metric-card">
            <span className="metric-label">{copy.pages.updates}</span>
            <strong className="metric-value">{updates.items.length}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">{copy.actions.queueSelectedDownloads}</span>
            <strong className="metric-value">{updates.selectedCount}</strong>
          </div>
        </div>
      }
    >
      <LauncherSplitLayout primary={listPanel} secondary={details} />
    </LauncherPageScaffold>
  )
}
