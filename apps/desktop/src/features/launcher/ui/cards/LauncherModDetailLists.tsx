import { ChevronDown, ChevronRight, Download, ExternalLink, Minus, Search } from 'lucide-react'
import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import { cx } from '@shared/lib/helper'
import { NexusModsBbcode } from '@shared/ui/nexusmods-bbcode'
import { PanelEmptyState } from '@shared/ui/PanelSection'
import type { ChangelogListItem, DependencyListItem, DependencyTreeNode, DetailRow, FileListItem } from './launcherModDetailData'

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

export function DependencyList({
  items,
  downloadLabel,
  openPageLabel,
  onDownloadDependency,
  onOpenDependencyPage,
}: {
  items: DependencyListItem[]
  downloadLabel?: string
  openPageLabel?: string
  onDownloadDependency?: (item: DependencyListItem) => void
  onOpenDependencyPage?: (item: DependencyListItem) => void
}) {
  return (
    <div className="launcher-mod-detail-data-list dependency-list">
      {items.map((item) => (
        <div
          className={cx(
            'launcher-mod-detail-data-item dependency-item',
            item.missing && 'is-missing',
            item.downloadable && 'is-downloadable',
          )}
          key={item.title}
          title={item.title}
        >
          <span className="launcher-mod-detail-data-dot" aria-hidden="true" />
          <div className="launcher-mod-detail-data-copy">
            <strong>{item.name}</strong>
            <span>{item.meta}</span>
          </div>
          <div className="launcher-mod-detail-dependency-actions">
            <span className={cx('launcher-mod-detail-data-pill', item.missing ? 'danger' : 'ready')}>{item.status}</span>
            {item.downloadable && downloadLabel && onDownloadDependency ? (
              <button
                type="button"
                className="launcher-mod-detail-file-action launcher-mod-detail-dependency-download"
                aria-label={`${downloadLabel} ${item.name}`}
                title={`${downloadLabel} ${item.name}`}
                onClick={() => onDownloadDependency(item)}
              >
                <Download className="h-4 w-4" />
              </button>
            ) : null}
            {!item.downloadable && item.modId && openPageLabel && onOpenDependencyPage ? (
              <button
                type="button"
                className="launcher-mod-detail-file-action launcher-mod-detail-dependency-download"
                aria-label={`${openPageLabel} ${item.name}`}
                title={`${openPageLabel} ${item.name}`}
                onClick={() => onOpenDependencyPage(item)}
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function dependencyStateTone(statusKind: DependencyTreeNode['statusKind']): 'ready' | 'danger' | 'warning' | 'info' | 'muted' | 'optional' {
  if (statusKind === 'missing' || statusKind === 'error') return 'danger'
  if (statusKind === 'transitive' || statusKind === 'cycle') return 'warning'
  if (statusKind === 'optional') return 'optional'
  if (statusKind === 'loading') return 'info'
  if (statusKind === 'external' || statusKind === 'disabled') return 'muted'
  return 'ready'
}

function DependencyTreeItem({
  item,
  expandedNodeIds,
  labels,
  onToggleNode,
  onDownloadDependency,
  onOpenDependencyPage,
  onSearchDependency,
}: {
  item: DependencyTreeNode
  expandedNodeIds: Set<string>
  labels: {
    download: string
    openPage: string
    search: string
    expand: string
    collapse: string
    loadChildren: string
  }
  onToggleNode: (item: DependencyTreeNode) => void
  onDownloadDependency?: (item: DependencyTreeNode) => void
  onOpenDependencyPage?: (item: DependencyTreeNode) => void
  onSearchDependency?: (item: DependencyTreeNode) => void
}) {
  const expanded = expandedNodeIds.has(item.id)
  const hasChildren = item.children.length > 0
  const canToggle = hasChildren || item.loadable
  const toggleLabel = expanded ? labels.collapse : item.loadable && !hasChildren ? labels.loadChildren : labels.expand

  const stopActionPropagation = (event: MouseEvent) => {
    event.stopPropagation()
  }

  const canDownload = Boolean(item.downloadable && item.modId) && Boolean(onDownloadDependency)
  const canOpenPage = Boolean(item.url || item.modId) && Boolean(onOpenDependencyPage)
  const canSearch = !canOpenPage && Boolean(item.searchQuery?.trim()) && Boolean(onSearchDependency)
  const secondaryActionLabel = canOpenPage ? labels.openPage : labels.search
  const SecondaryActionIcon = canOpenPage ? ExternalLink : Search

  const renderRow = (props: {
    role?: 'button'
    tabIndex?: number
    'aria-expanded'?: boolean
    'aria-label'?: string
    onClick?: () => void
    onKeyDown?: (event: KeyboardEvent) => void
  }) => (
    <div
      className={cx(
        'launcher-mod-detail-dependency-node',
        `is-${item.statusKind}`,
        canToggle && 'is-toggleable',
        canToggle && expanded && 'is-open',
      )}
      role={props.role}
      tabIndex={props.tabIndex}
      aria-expanded={props['aria-expanded']}
      aria-label={props['aria-label']}
      title={item.title}
      onClick={props.onClick}
      onKeyDown={props.onKeyDown}
    >
      <span className="launcher-mod-detail-dependency-mark" aria-hidden="true">
        {canToggle ? expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
      </span>
      <div className="launcher-mod-detail-dependency-copy">
        <strong>{item.name}</strong>
        <span className="launcher-mod-detail-dependency-detail">{item.meta}</span>
      </div>
      <div className="launcher-mod-detail-dependency-actions" onClick={stopActionPropagation}>
        <span className={cx('launcher-mod-detail-data-pill', dependencyStateTone(item.statusKind))}>{item.status}</span>
        <button
          type="button"
          className="launcher-mod-detail-file-action launcher-mod-detail-dependency-download"
          aria-label={`${labels.download} ${item.name}`}
          title={`${labels.download} ${item.name}`}
          disabled={!canDownload}
          onClick={() => onDownloadDependency?.(item)}
        >
          <Download className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="launcher-mod-detail-file-action launcher-mod-detail-dependency-download"
          aria-label={`${secondaryActionLabel} ${item.name}`}
          title={`${secondaryActionLabel} ${item.name}`}
          disabled={!canOpenPage && !canSearch}
          onClick={() => {
            if (canOpenPage) {
              onOpenDependencyPage?.(item)
              return
            }
            onSearchDependency?.(item)
          }}
        >
          <SecondaryActionIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )

  return (
    <li className="launcher-mod-detail-dependency-tree-entry">
      {canToggle
        ? renderRow({
            role: 'button',
            tabIndex: 0,
            'aria-expanded': expanded,
            'aria-label': `${toggleLabel} ${item.name}`,
            onClick: () => onToggleNode(item),
            onKeyDown: (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onToggleNode(item)
              }
            },
          })
        : renderRow({})}
      {expanded && hasChildren ? (
        <ul className="launcher-mod-detail-dependency-tree-children">
          {item.children.map((child) => (
            <DependencyTreeItem
              key={child.id}
              item={child}
              expandedNodeIds={expandedNodeIds}
              labels={labels}
              onToggleNode={onToggleNode}
              onDownloadDependency={onDownloadDependency}
              onOpenDependencyPage={onOpenDependencyPage}
              onSearchDependency={onSearchDependency}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function DependencyTree({
  items,
  expandedNodeIds,
  labels,
  onToggleNode,
  onDownloadDependency,
  onOpenDependencyPage,
  onSearchDependency,
}: {
  items: DependencyTreeNode[]
  expandedNodeIds: Set<string>
  labels: {
    download: string
    openPage: string
    search: string
    expand: string
    collapse: string
    loadChildren: string
  }
  onToggleNode: (item: DependencyTreeNode) => void
  onDownloadDependency?: (item: DependencyTreeNode) => void
  onOpenDependencyPage?: (item: DependencyTreeNode) => void
  onSearchDependency?: (item: DependencyTreeNode) => void
}) {
  return (
    <ul className="launcher-mod-detail-dependency-tree">
      {items.map((item) => (
        <DependencyTreeItem
          key={item.id}
          item={item}
          expandedNodeIds={expandedNodeIds}
          labels={labels}
          onToggleNode={onToggleNode}
          onDownloadDependency={onDownloadDependency}
          onOpenDependencyPage={onOpenDependencyPage}
          onSearchDependency={onSearchDependency}
        />
      ))}
    </ul>
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

export function ChangelogList({
  items,
  emptyLabel,
  streaming = false,
}: {
  items: ChangelogListItem[]
  emptyLabel: string
  /** Marks the list as mid-translation so newly completed lines animate in. */
  streaming?: boolean
}) {
  if (!items.length) {
    return <PanelEmptyState>{emptyLabel}</PanelEmptyState>
  }

  return (
    <div className={cx('launcher-mod-detail-changelog-list', streaming && 'is-ai-streaming')}>
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
