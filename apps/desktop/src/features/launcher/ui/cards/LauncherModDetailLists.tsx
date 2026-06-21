import { Download } from 'lucide-react'
import { useState } from 'react'
import { cx } from '@shared/lib/helper'
import { NexusModsBbcode } from '@shared/ui/nexusmods-bbcode'
import { PanelEmptyState } from '@shared/ui/PanelSection'
import type { ChangelogListItem, DependencyListItem, DetailRow, FileListItem } from './launcherModDetailData'

export function PropertyRow({ row }: { row: DetailRow }) {
  return (
    <div className="launcher-mod-detail-property">
      <span>{row.label}</span>
      <strong title={row.title ?? row.value}>{row.value}</strong>
    </div>
  )
}

export function DetailSection({ title, rows, tone }: { title: string; rows: DetailRow[]; tone?: 'graphql' }) {
  const visibleRows = rows.filter((row) => row.value.trim() !== '')
  if (!visibleRows.length) {
    return null
  }

  return (
    <section className="launcher-detail-info-section">
      <div className="launcher-detail-info-heading">
        <h3>{title}</h3>
        {tone ? <span>{tone}</span> : null}
      </div>
      <div className="launcher-detail-info-list">
        {visibleRows.map((row) => (
          <DetailRowView key={`${title}-${row.label}`} row={row} />
        ))}
      </div>
    </section>
  )
}

function DetailRowView({ row }: { row: DetailRow }) {
  return (
    <div className="launcher-detail-info-row">
      <span>{row.label}</span>
      <strong title={row.title ?? row.value}>{row.value}</strong>
    </div>
  )
}

export function DependencyList({ items }: { items: DependencyListItem[] }) {
  return (
    <div className="launcher-mod-detail-data-list dependency-list">
      {items.map((item) => (
        <div
          className={cx('launcher-mod-detail-data-item dependency-item', item.missing && 'is-missing')}
          key={item.title}
          title={item.title}
        >
          <span className="launcher-mod-detail-data-dot" aria-hidden="true" />
          <div className="launcher-mod-detail-data-copy">
            <strong>{item.name}</strong>
            <span>{item.meta}</span>
          </div>
          <span className={cx('launcher-mod-detail-data-pill', item.missing ? 'danger' : 'ready')}>{item.status}</span>
        </div>
      ))}
    </div>
  )
}

export function FileList({
  items,
  labels,
  actionLabel,
  onDownloadFile,
}: {
  items: FileListItem[]
  labels: {
    main: string
    optional: string
    old: string
    oldAndArchived: string
  }
  actionLabel: string
  onDownloadFile: (item: FileListItem) => void
}) {
  const [showOldFiles, setShowOldFiles] = useState(false)
  const renderFileItem = (item: FileListItem) => {
    return (
      <div className={cx('launcher-mod-detail-data-item file-item', item.primary && 'is-primary')} key={item.id}>
        <div className="launcher-mod-detail-file-row">
          <div className="launcher-mod-detail-file-toggle">
            <div className="launcher-mod-detail-file-mark">
              <span>{item.primary ? 'P' : 'F'}</span>
            </div>
            <div className="launcher-mod-detail-data-copy">
              <strong>{item.name}</strong>
              <span>{item.meta}</span>
              {item.description ? (
                <div className="launcher-mod-detail-file-description">
                  <NexusModsBbcode source={item.description} />
                </div>
              ) : null}
            </div>
            {item.status ? <span className="launcher-mod-detail-data-pill ready">{item.status}</span> : null}
          </div>
          <button
            type="button"
            className="launcher-mod-detail-file-action"
            aria-label={`${actionLabel} ${item.name}`}
            title={`${actionLabel} ${item.name}`}
            onClick={() => onDownloadFile(item)}
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }
  const groups = [
    { id: 'main' as const, title: labels.main, items: items.filter((item) => item.group === 'main') },
    { id: 'optional' as const, title: labels.optional, items: items.filter((item) => item.group === 'optional') },
  ].filter((group) => group.items.length > 0)
  const oldFiles = items.filter((item) => item.group === 'old')
  const visibleGroups = [
    ...groups,
    ...(showOldFiles && oldFiles.length ? [{ id: 'old' as const, title: labels.old, items: oldFiles }] : []),
  ].filter((group) => group.items.length > 0)

  return (
    <div className="launcher-mod-detail-data-list file-list">
      {visibleGroups.map((group) => (
        <section className={cx('launcher-mod-detail-file-group', `file-group-${group.id}`)} key={group.id}>
          <div className="launcher-mod-detail-file-group-head">
            <span>{group.title}</span>
            <strong>{group.items.length}</strong>
          </div>
          <div className="launcher-mod-detail-file-stack">{group.items.map(renderFileItem)}</div>
        </section>
      ))}
      {oldFiles.length && !showOldFiles ? (
        <button
          type="button"
          className="launcher-mod-detail-file-archive-toggle"
          aria-label={`${labels.oldAndArchived} ${oldFiles.length}`}
          onClick={() => setShowOldFiles(true)}
        >
          <span>{labels.oldAndArchived}</span>
          <strong>{oldFiles.length}</strong>
        </button>
      ) : null}
    </div>
  )
}

export function DetailDataLoading({ label }: { label: string }) {
  return (
    <div className="launcher-mod-detail-data-loading" role="status" aria-live="polite">
      <span className="launcher-mod-detail-data-loading-spinner" aria-hidden="true" />
      <strong>{label}</strong>
      <div className="launcher-mod-detail-data-loading-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}

export function ChangelogList({ items, emptyLabel }: { items: ChangelogListItem[]; emptyLabel: string }) {
  if (!items.length) {
    return <PanelEmptyState>{emptyLabel}</PanelEmptyState>
  }

  return (
    <div className="launcher-mod-detail-changelog-list">
      {items.map((item) => (
        <article className="launcher-mod-detail-changelog-entry" key={item.id}>
          <header>
            <div>
              <span>{item.version}</span>
              {item.meta ? <strong>{item.meta}</strong> : null}
            </div>
            {item.source ? <p title={item.source}>{item.source}</p> : null}
          </header>
          <ul>
            {item.lines.map((line) => (
              <li key={line}>
                <NexusModsBbcode source={line} />
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  )
}
