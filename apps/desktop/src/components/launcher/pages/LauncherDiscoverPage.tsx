import { Download, ExternalLink, RefreshCw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useEditorCopy } from '../../../lib/app/localeContext'
import { cx } from '../../../lib/cx'
import type { LauncherSettings } from '../../../lib/desktop'
import { useLauncherImage } from '../../../lib/launcher/imageLoader'
import { useLauncherDiscover } from '../../../lib/launcher/useLauncherDiscover'
import type { QueueLauncherDownloadInput } from '../../../lib/launcher/types'
import { LauncherControlBar } from '../shared/LauncherControlBar'
import { LauncherPageScaffold } from '../shared/LauncherPageScaffold'
import { LauncherSplitLayout } from '../shared/LauncherSplitLayout'
import { LauncherStateBlock } from '../shared/LauncherStateBlock'

type LauncherDiscoverPageProps = {
  settings: LauncherSettings
  onQueueDownload: (input: QueueLauncherDownloadInput) => void
  onNavigateToSettings?: () => void
}

function DiscoverCard({
  modId,
  title,
  summary,
  author,
  modUrl,
  imageUrl,
  active,
  onSelect,
  onQueueDownload,
}: QueueLauncherDownloadInput & {
  summary: string | null
  author: string | null
  modUrl: string
  active: boolean
  onSelect: () => void
  onQueueDownload: () => void
}) {
  const copy = useEditorCopy().launcher
  const image = useLauncherImage(imageUrl)

  return (
    <article className={cx('launcher-discover-card panel-list-card', active && 'panel-list-card-active')}>
      <button type="button" className="launcher-discover-card-media" onClick={onSelect}>
        {image.imageUrl ? <img src={image.imageUrl} alt="" className="launcher-discover-card-image" /> : null}
      </button>
      <div className="space-y-3">
        <button type="button" className="w-full text-left" onClick={onSelect}>
          <p className="launcher-discover-card-title">{title}</p>
          <p className="launcher-discover-card-subtitle">{author ?? `Nexus #${modId}`}</p>
        </button>
        <p className="launcher-discover-card-summary">{summary ?? copy.states.noSummary}</p>
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

export function LauncherDiscoverPage({
  settings,
  onQueueDownload,
  onNavigateToSettings,
}: LauncherDiscoverPageProps) {
  const copy = useEditorCopy().launcher
  const discover = useLauncherDiscover()
  const [selectedModId, setSelectedModId] = useState<number | null>(null)
  const credentialsReady = Boolean(settings.nexusApiKey?.trim() || settings.nexusCookie?.trim())
  const activeSelectedModId = discover.items.some((item) => item.modId === selectedModId)
    ? selectedModId
    : discover.items[0]?.modId ?? null

  const selectedItem = useMemo(
    () => discover.items.find((item) => item.modId === activeSelectedModId) ?? null,
    [activeSelectedModId, discover.items],
  )
  const selectedImage = useLauncherImage(selectedItem?.imageUrl ?? null)

  const results = (
    <div className="space-y-4">
      <LauncherControlBar
        title={copy.fields.searchDiscover}
        subtitle={copy.descriptions.discover}
        action={
          <button type="button" className="control-button" onClick={discover.refresh} disabled={!credentialsReady}>
            <RefreshCw className="h-4 w-4" />
            <span>{copy.actions.refresh}</span>
          </button>
        }
      >
        <div className="launcher-toolbar">
          <label className="control-input launcher-toolbar-input">
            <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
            <input
              value={discover.query}
              onChange={(event) => discover.setQuery(event.target.value)}
              placeholder={copy.fields.searchDiscover}
              spellCheck={false}
              disabled={!credentialsReady}
            />
          </label>

          <select
            className="control-input launcher-select"
            value={discover.sort}
            onChange={(event) => discover.setSort(event.target.value as never)}
            disabled={!credentialsReady}
          >
            <option value="newest">{copy.sortOptions.newest}</option>
            <option value="updated">{copy.sortOptions.updated}</option>
            <option value="trending">{copy.sortOptions.trending}</option>
            <option value="downloads">{copy.sortOptions.downloads}</option>
            <option value="endorsements">{copy.sortOptions.endorsements}</option>
            <option value="name">{copy.sortOptions.name}</option>
          </select>

          <button
            type="button"
            className={`control-button ${discover.ascending ? 'control-button-primary' : ''}`}
            aria-pressed={discover.ascending}
            onClick={() => discover.setAscending(!discover.ascending)}
            disabled={!credentialsReady}
          >
            <span>{copy.toggles.ascending}</span>
          </button>
        </div>
      </LauncherControlBar>

      {!credentialsReady ? (
        <LauncherStateBlock
          title={copy.states.credentialsRequired}
          detail={copy.discover.credentialsHint}
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

      {credentialsReady && discover.state === 'error' ? (
        <LauncherStateBlock title={copy.discover.title} detail={discover.error ?? copy.discover.empty} tone="warning" />
      ) : null}

      {credentialsReady && discover.state !== 'error' && !discover.items.length ? (
        <LauncherStateBlock title={copy.discover.empty} detail={copy.discover.subtitle} />
      ) : null}

      {credentialsReady && discover.items.length ? (
        <>
          <div className="launcher-discover-grid">
            {discover.items.map((item) => (
              <DiscoverCard
                key={`${item.modId}:${item.modUrl}`}
                {...item}
                source="discover"
                version={null}
                active={activeSelectedModId === item.modId}
                onSelect={() => setSelectedModId(item.modId)}
                onQueueDownload={() =>
                  onQueueDownload({
                    modId: item.modId,
                    title: item.title,
                    imageUrl: item.imageUrl,
                    source: 'discover',
                  })
                }
              />
            ))}
          </div>

          {discover.hasMore ? (
            <div className="flex justify-center">
              <button type="button" className="control-button" onClick={discover.loadMore}>
                <span>{copy.actions.loadMore}</span>
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )

  const details = selectedItem ? (
    <section className="panel-surface h-full">
      <header className="panel-header">
        <div className="min-w-0">
          <p className="panel-title">{selectedItem.title}</p>
          <p className="panel-subtitle">{selectedItem.author ?? `Nexus #${selectedItem.modId}`}</p>
        </div>
      </header>
      <div className="panel-body space-y-4">
        <div className="launcher-detail-hero">
          <div className="launcher-detail-cover launcher-mod-card-cover">
            {selectedImage.imageUrl ? <img src={selectedImage.imageUrl} alt="" className="launcher-mod-card-cover-image" /> : null}
            {!selectedImage.imageUrl ? <span className="launcher-mod-card-cover-fallback">{selectedItem.title.slice(0, 2).toUpperCase()}</span> : null}
          </div>
          <div>
            <p className="launcher-detail-title">{selectedItem.title}</p>
            <p className="launcher-detail-summary">{selectedItem.summary ?? copy.states.noSummary}</p>
          </div>
        </div>

        <div className="launcher-page-stats-grid launcher-page-stats-grid-compact">
          <div className="metric-card">
            <span className="metric-label">Nexus</span>
            <strong className="metric-value">#{selectedItem.modId}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">{copy.pages.discover}</span>
            <strong className="metric-value">{discover.items.length}</strong>
          </div>
        </div>

        <div className="launcher-toolbar">
          <a href={selectedItem.modUrl} target="_blank" rel="noreferrer" className="control-button">
            <ExternalLink className="h-4 w-4" />
            <span>{copy.actions.openModPage}</span>
          </a>
          <button
            type="button"
            className="control-button control-button-primary"
            onClick={() =>
              onQueueDownload({
                modId: selectedItem.modId,
                title: selectedItem.title,
                imageUrl: selectedItem.imageUrl,
                source: 'discover',
              })
            }
          >
            <Download className="h-4 w-4" />
            <span>{copy.actions.queueDownload}</span>
          </button>
        </div>
      </div>
    </section>
  ) : (
    <LauncherStateBlock title={copy.discover.title} detail={copy.discover.subtitle} />
  )

  return (
    <LauncherPageScaffold
      eyebrow={copy.pages.discover}
      title={copy.discover.title}
      subtitle={copy.discover.subtitle}
      stats={
        <div className="launcher-page-stats-grid">
          <div className="metric-card">
            <span className="metric-label">{copy.pages.discover}</span>
            <strong className="metric-value">{discover.items.length}</strong>
          </div>
        </div>
      }
    >
      <LauncherSplitLayout primary={results} secondary={details} />
    </LauncherPageScaffold>
  )
}
