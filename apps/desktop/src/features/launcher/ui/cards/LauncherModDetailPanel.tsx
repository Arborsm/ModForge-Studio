import type { CSSProperties } from 'react'
import { Download, ExternalLink, FolderOpen, ImageIcon, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useEditorCopy } from '@locales/localeContext'
import { useLauncherPort } from '@features/launcher/model/launcherPortContext'
import { useLauncherRemoteModDetail } from '@features/launcher/model/useLauncherRemoteModDetail'
import { cx } from '@shared/lib/cx'
import { PanelEmptyState } from '@shared/ui/PanelSection'
import type { LauncherDiscoverDetail, LauncherLibraryItem, QueueLauncherDownloadInput } from '../../model/types'
import { LauncherArtworkCover } from './LauncherArtworkCover'
import { getLauncherCardCoverWord, getLauncherCardFallbackPalette } from './launcherCardPresentation'

type LauncherDetailTab = 'overview' | 'description' | 'details' | 'dependencies' | 'files'

type LauncherDetailMod = Partial<LauncherLibraryItem> & {
  packName?: string | null
}

type DetailRow = {
  label: string
  value: string
  title?: string
}

type DependencyListItem = {
  name: string
  meta: string
  status: string
  missing: boolean
  title: string
}

type FileListItem = {
  id: string
  name: string
  meta: string
  status: string
  changelog: string
  fileId: number | null
  version: string | null
  primary: boolean
  group: 'main' | 'optional' | 'old'
  title: string
}

type LauncherModDetailPanelProps = {
  open: boolean
  onClose: () => void
  closeLabel: string
  title: string
  subtitle: string
  empty: string
  mod: LauncherDetailMod | null
  remoteDetail?: LauncherDiscoverDetail | null
  labels: {
    currentVersion: string
    uniqueId: string
    path: string
    dependencies: string
    updateKeys: string
    pack: string
  }
  noSummary: string
  onToggleEnabled: () => void
  enableLabel: string
  disableLabel: string
  enabledStateLabel: string
  disabledStateLabel: string
  openFolderLabel: string
  setCoverLabel: string
  clearCoverLabel: string
  onOpenFolder: () => void
  onSetCover: () => void
  onClearCover: () => void
  openModPageLabel?: string
  packName?: string | null
  onQueueDownload?: (input: QueueLauncherDownloadInput) => void
}

function compactNumber(value: number | null | undefined, noneLabel: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return noneLabel
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2).replace(/\.0+$/, '')}M`
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2).replace(/\.0+$/, '')}K`
  }

  return new Intl.NumberFormat().format(value)
}

function formatDate(value: string | null | undefined, noneLabel: string) {
  if (!value) {
    return noneLabel
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toISOString().slice(0, 10)
}

function formatSize(kilobytes: number | null | undefined, bytes: number | null | undefined, noneLabel: string) {
  const byteValue = typeof bytes === 'number' && Number.isFinite(bytes) ? bytes : null
  if (byteValue !== null) {
    if (byteValue >= 1024 * 1024) {
      return `${(byteValue / 1024 / 1024).toFixed(1)} MB`
    }
    if (byteValue >= 1024) {
      return `${Math.round(byteValue / 1024)} KB`
    }
    return `${byteValue} B`
  }

  if (typeof kilobytes === 'number' && Number.isFinite(kilobytes)) {
    return `${new Intl.NumberFormat().format(kilobytes)} KB`
  }

  return noneLabel
}

function normalizeVersion(value: string | null | undefined, noneLabel: string) {
  const normalized = value?.trim()
  if (!normalized) {
    return noneLabel
  }
  return normalized.startsWith('v') || normalized === noneLabel ? normalized : `v${normalized}`
}

function truncatePath(value: string | null | undefined, noneLabel: string) {
  if (!value) {
    return noneLabel
  }

  const parts = value.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 3) {
    return value
  }

  const root = value.match(/^[A-Za-z]:/)?.[0] ?? parts[0]
  return `${root}\\...\\${parts.slice(-2).join('\\')}`
}

function splitChangelog(lines: string[] | undefined, fallback: string | null | undefined) {
  const rawLines = lines?.length ? lines : fallback ? fallback.split(/(?<=\.)\s+/) : []
  return rawLines
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
}

function hasUpdate(localVersion: string | null | undefined, remoteVersion: string | null | undefined) {
  const local = localVersion?.trim()
  const remote = remoteVersion?.trim()
  return Boolean(local && remote && local !== remote)
}

function formatBooleanStatus(value: boolean | null | undefined, trueLabel: string, falseLabel: string, noneLabel: string) {
  if (value === true) {
    return trueLabel
  }
  if (value === false) {
    return falseLabel
  }
  return noneLabel
}

function normalizeFileCategory(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? ''
}

function resolveFileGroup(file: { category?: string | null; primary?: boolean }): FileListItem['group'] {
  const category = normalizeFileCategory(file.category)
  if (category.includes('OLD') || category.includes('ARCHIVE')) {
    return 'old'
  }
  if (category.includes('OPTIONAL')) {
    return 'optional'
  }
  if (file.primary || category.includes('MAIN')) {
    return 'main'
  }
  return 'optional'
}

function PropertyRow({ row }: { row: DetailRow }) {
  return (
    <div className="launcher-mod-detail-property">
      <span>{row.label}</span>
      <strong title={row.title ?? row.value}>{row.value}</strong>
    </div>
  )
}

function DetailSection({ title, rows, tone }: { title: string; rows: DetailRow[]; tone?: 'graphql' }) {
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

function DependencyList({ items }: { items: DependencyListItem[] }) {
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

function FileList({
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
  }
  actionLabel: string
  onDownloadFile: (item: FileListItem) => void
}) {
  const defaultExpandedIds = useMemo(
    () => new Set(items.filter((item) => item.group !== 'old' && item.changelog).map((item) => item.id)),
    [items],
  )
  const [toggledIds, setToggledIds] = useState<Set<string>>(() => new Set())
  const groups = [
    { id: 'main' as const, title: labels.main, items: items.filter((item) => item.group === 'main') },
    { id: 'optional' as const, title: labels.optional, items: items.filter((item) => item.group === 'optional') },
    { id: 'old' as const, title: labels.old, items: items.filter((item) => item.group === 'old') },
  ].filter((group) => group.items.length > 0)

  return (
    <div className="launcher-mod-detail-data-list file-list">
      {groups.map((group) => (
        <section className={cx('launcher-mod-detail-file-group', `file-group-${group.id}`)} key={group.id}>
          <div className="launcher-mod-detail-file-group-head">
            <span>{group.title}</span>
            <strong>{group.items.length}</strong>
          </div>
          <div className="launcher-mod-detail-file-stack">
            {group.items.map((item) => {
              const isExpanded = toggledIds.has(item.id) ? !defaultExpandedIds.has(item.id) : defaultExpandedIds.has(item.id)
              return (
                <div
                  className={cx('launcher-mod-detail-data-item file-item', item.primary && 'is-primary', isExpanded && 'is-expanded')}
                  key={item.id}
                  title={item.title}
                >
                  <div className="launcher-mod-detail-file-row">
                    <button
                      type="button"
                      className="launcher-mod-detail-file-toggle"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setToggledIds((current) => {
                          const next = new Set(current)
                          if (next.has(item.id)) {
                            next.delete(item.id)
                          } else {
                            next.add(item.id)
                          }
                          return next
                        })
                      }
                    >
                      <div className="launcher-mod-detail-file-mark">
                        <span>{item.primary ? 'P' : 'F'}</span>
                      </div>
                      <div className="launcher-mod-detail-data-copy">
                        <strong>{item.name}</strong>
                        <span>{item.meta}</span>
                      </div>
                      <span className="launcher-mod-detail-data-pill ready">{item.status}</span>
                      <span className="launcher-mod-detail-file-chevron" aria-hidden="true">
                        ›
                      </span>
                    </button>
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
                  {isExpanded && item.changelog ? <p className="launcher-mod-detail-file-changelog">{item.changelog}</p> : null}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

export function LauncherModDetailPanel({
  open,
  onClose,
  closeLabel,
  title,
  subtitle,
  empty,
  mod,
  remoteDetail,
  labels,
  noSummary,
  onToggleEnabled,
  enableLabel,
  disableLabel,
  enabledStateLabel,
  disabledStateLabel,
  openFolderLabel,
  setCoverLabel,
  clearCoverLabel,
  onOpenFolder,
  onSetCover,
  onClearCover,
  openModPageLabel,
  packName,
  onQueueDownload,
}: LauncherModDetailPanelProps) {
  const launcherPort = useLauncherPort()
  const copy = useEditorCopy()
  const launcherCopy = copy.launcher
  const detailCopy = launcherCopy.library.modDetail
  const [activeTab, setActiveTab] = useState<LauncherDetailTab>('overview')
  const fallbackPalette = getLauncherCardFallbackPalette(mod?.name ?? remoteDetail?.title ?? title)
  const coverWord = getLauncherCardCoverWord(mod?.name ?? remoteDetail?.title ?? title)
  const fetchedRemoteDetail = useLauncherRemoteModDetail(open && !remoteDetail && mod?.nexusModId ? mod.nexusModId : null).detail
  const remote = remoteDetail ?? fetchedRemoteDetail
  const fallbackRemoteModId = mod?.nexusModId ?? null
  const isLocal = Boolean(mod?.absolutePath)
  const isNexus = Boolean(remote)
  const isCombined = isLocal && isNexus
  const description = remote?.summary ?? mod?.description ?? noSummary
  const latestVersion = remote?.primaryFileVersion ?? remote?.version ?? null
  const updateAvailable = isCombined && hasUpdate(mod?.version, latestVersion)
  const coverStyle = {
    '--launcher-cover-bright': fallbackPalette.bright,
    '--launcher-cover-base': fallbackPalette.base,
    '--launcher-cover-dark': fallbackPalette.dark,
    '--launcher-cover-edge': fallbackPalette.edge,
    '--launcher-cover-glow': fallbackPalette.glow,
    '--launcher-cover-shadow': fallbackPalette.shadow,
  } as CSSProperties

  const displayName = mod?.name ?? remote?.title ?? title
  const displayAuthor = mod?.author ?? remote?.author ?? subtitle
  const displayVersion = isCombined
    ? `${detailCopy.installedVersionShort} ${normalizeVersion(mod?.version, copy.common.none)} · ${detailCopy.nexusVersionShort} ${normalizeVersion(latestVersion, copy.common.none)}`
    : normalizeVersion(mod?.version ?? latestVersion, copy.common.none)
  const category = remote?.category ?? packName ?? null
  const subtitleText = [displayAuthor ? `${detailCopy.byAuthor} ${displayAuthor}` : null, displayVersion, category]
    .filter(Boolean)
    .join(' · ')

  const dependencyText = mod?.missingRequiredDependencies?.length ? mod.missingRequiredDependencies.join(', ') : detailCopy.clean
  const dependencyTone = mod?.missingRequiredDependencies?.length ? 'status-pill-error' : 'status-pill-ready'
  const primaryFileName = remote?.primaryFileName ?? (remote ? remote.title : null)
  const primaryFileId = remote?.primaryFileId ? `#${remote.primaryFileId}` : copy.common.none
  const primarySize = formatSize(remote?.primaryFileSize ?? remote?.fileSize, remote?.primaryFileSizeBytes, copy.common.none)
  const changelogLines = splitChangelog(remote?.primaryFileChangelog, remote?.summary)
  const rawLocalDependencies = mod?.requiredDependencies?.length ? mod.requiredDependencies : (mod?.missingRequiredDependencies ?? [])
  const localDependencies = Array.from(new Set(rawLocalDependencies.map((item) => item.trim()).filter(Boolean)))
  const remoteRequirements = useMemo(
    () => (remote?.requirements ?? []).filter((requirement) => requirement.name.trim() !== ''),
    [remote?.requirements],
  )
  const remoteFiles = useMemo(() => (remote?.files ?? []).filter((file) => (file.name ?? '').trim() !== '' || file.fileId), [remote?.files])
  const hasDependencyData = localDependencies.length > 0 || remoteRequirements.length > 0
  const hasFileData = isNexus && remoteFiles.length > 0
  const detailTabs = useMemo<LauncherDetailTab[]>(() => {
    const tabs: LauncherDetailTab[] = ['overview', 'description', 'details']
    if (hasDependencyData) {
      tabs.push('dependencies')
    }
    if (hasFileData) {
      tabs.push('files')
    }
    return tabs
  }, [hasDependencyData, hasFileData])
  const selectedTab = detailTabs.includes(activeTab) ? activeTab : 'overview'
  const tags = useMemo(() => {
    const nextTags = [...(remote?.tags ?? [])]
    if (isLocal && !isCombined) {
      nextTags.push(mod?.enabled ? enabledStateLabel : disabledStateLabel)
      nextTags.push(fallbackRemoteModId ? `Nexus #${fallbackRemoteModId}` : detailCopy.noNexusLink)
      nextTags.push(mod?.missingRequiredDependencies?.length ? labels.dependencies : detailCopy.dependenciesClean)
    }
    if (packName) {
      nextTags.push(packName)
    }
    if (mod?.updateKeys?.some((key) => key.toLowerCase().includes('nexus'))) {
      nextTags.push('Nexus')
    }
    return Array.from(new Set(nextTags.map((item) => item.trim()).filter(Boolean))).slice(0, 6)
  }, [
    detailCopy.dependenciesClean,
    detailCopy.noNexusLink,
    enabledStateLabel,
    fallbackRemoteModId,
    isCombined,
    isLocal,
    labels.dependencies,
    mod?.enabled,
    mod?.missingRequiredDependencies?.length,
    mod?.updateKeys,
    packName,
    remote?.tags,
    disabledStateLabel,
  ])

  const sidebarStats = isNexus
    ? [
        {
          label: detailCopy.reach,
          value: `${compactNumber(remote?.downloads, copy.common.none)} / ${compactNumber(remote?.endorsements, copy.common.none)}`,
        },
        { label: detailCopy.scan, value: remote?.primaryFileScanStatus ?? copy.common.none },
      ]
    : isLocal && !isCombined
      ? []
      : [
          { label: detailCopy.state, value: mod?.enabled ? enabledStateLabel : disabledStateLabel },
          { label: labels.dependencies, value: dependencyText },
        ]

  const sidebarRows: DetailRow[] = [
    {
      label: detailCopy.identity,
      value:
        mod?.uniqueId ?? ((remote?.modId ?? fallbackRemoteModId) ? `Nexus #${remote?.modId ?? fallbackRemoteModId}` : copy.common.none),
    },
    ...(isCombined || (!isLocal && (remote?.modId ?? fallbackRemoteModId))
      ? [
          {
            label: detailCopy.nexus,
            value: (remote?.modId ?? fallbackRemoteModId) ? `#${remote?.modId ?? fallbackRemoteModId}` : copy.common.none,
          },
        ]
      : []),
    ...(isLocal ? [{ label: detailCopy.folder, value: mod?.folderName ?? copy.common.none, title: mod?.absolutePath ?? undefined }] : []),
    ...(isNexus ? [{ label: detailCopy.category, value: remote?.category ?? copy.common.none }] : []),
    ...(isNexus
      ? [{ label: detailCopy.updated, value: formatDate(remote?.updatedAt, copy.common.none), title: remote?.updatedAt ?? undefined }]
      : []),
  ]

  const localDetails: DetailRow[] = [
    { label: detailCopy.absolutePath, value: truncatePath(mod?.absolutePath, copy.common.none), title: mod?.absolutePath ?? undefined },
    { label: detailCopy.manifestFile, value: 'manifest.json' },
  ]

  const manifestDetails: DetailRow[] = [
    { label: labels.updateKeys, value: mod?.updateKeys?.[0] ?? '', title: mod?.updateKeys?.join(', ') },
    { label: labels.pack, value: packName ?? '', title: packName ?? undefined },
  ]

  const nexusPageDetails: DetailRow[] = [
    { label: detailCopy.requirement, value: remote?.requiredLoader ?? '', title: remote?.requiredLoader ?? undefined },
    { label: detailCopy.gameVersion, value: remote?.gameVersion ?? '', title: remote?.gameVersion ?? undefined },
    {
      label: detailCopy.download,
      value: remote?.directDownloadEnabled ? detailCopy.directDownload : remote?.supportsVortex ? detailCopy.vortexSupported : '',
    },
  ]

  const primaryFileDetails: DetailRow[] = [
    { label: detailCopy.name, value: primaryFileName ?? '', title: primaryFileName ?? undefined },
    { label: detailCopy.fileId, value: remote?.primaryFileId ? primaryFileId : '' },
    { label: detailCopy.archiveType, value: remote?.archiveType ?? '', title: remote?.archiveType ?? undefined },
  ]

  const evidenceText = fallbackRemoteModId ? `Nexus:${fallbackRemoteModId}` : copy.common.none
  const evidenceTitle = fallbackRemoteModId ? `${detailCopy.updateKeyEvidence} ${evidenceText}` : undefined
  const updateEvidenceDetails: DetailRow[] = [
    { label: detailCopy.method, value: fallbackRemoteModId ? detailCopy.updateKey : copy.common.none },
    { label: detailCopy.evidence, value: evidenceText, title: evidenceTitle },
    { label: detailCopy.confidence, value: fallbackRemoteModId ? detailCopy.exact : copy.common.none },
    { label: detailCopy.primaryFile, value: primaryFileId },
    { label: detailCopy.sizeChange, value: copy.common.none },
    {
      label: detailCopy.risk,
      value:
        remote?.updateRisk ??
        (remote?.primaryFileScanStatus ? `${detailCopy.verifiedFile}: ${remote.primaryFileScanStatus}` : copy.common.none),
    },
    { label: detailCopy.match, value: fallbackRemoteModId ? detailCopy.exactUpdateKeyMatch : copy.common.none },
  ]

  const missingLocalDependencies = new Set(mod?.missingRequiredDependencies ?? [])
  const dependencyItems: DependencyListItem[] = [
    ...localDependencies.map((dependency) => {
      const missing = missingLocalDependencies.has(dependency)
      return {
        name: dependency,
        meta: detailCopy.localRequirement,
        status: missing ? detailCopy.missing : detailCopy.satisfied,
        missing,
        title: dependency,
      }
    }),
    ...remoteRequirements.map((requirement) => ({
      name: requirement.name,
      meta: [requirement.external ? detailCopy.externalRequirement : detailCopy.remoteRequirement, requirement.notes]
        .filter(Boolean)
        .join(' · '),
      status: requirement.external ? detailCopy.externalRequirement : detailCopy.satisfied,
      missing: false,
      title: [requirement.name, requirement.notes, requirement.url].filter(Boolean).join(' · '),
    })),
  ]

  const fileItems: FileListItem[] = remoteFiles.map((file) => {
    const fileName = file.name ?? (file.fileId ? `#${file.fileId}` : '')
    const meta = [
      file.version ? normalizeVersion(file.version, copy.common.none) : null,
      file.category ?? null,
      formatSize(file.size, file.sizeBytes, copy.common.none),
    ]
      .filter(Boolean)
      .join(' · ')
    const changelog = splitChangelog(file.changelog, null).join(' ')
    const status = file.scanStatus ?? formatBooleanStatus(file.scanned, detailCopy.verifiedFile, copy.common.none, copy.common.none)
    return {
      id: `${file.fileId ?? fileName}`,
      name: fileName,
      meta: [meta, file.archiveType].filter(Boolean).join(' · '),
      status,
      changelog,
      fileId: file.fileId ?? null,
      version: file.version ?? null,
      primary: Boolean(file.primary),
      group: resolveFileGroup(file),
      title: [fileName, meta, file.archiveType, status, changelog].filter(Boolean).join(' · '),
    }
  })

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  const openRemotePage = () => {
    const url = remote?.modUrl ?? mod?.modUrl
    if (url) {
      void launcherPort.openUrl({ url })
    }
  }

  const handleDownloadRemoteFile = (item: FileListItem) => {
    const modId = remote?.modId ?? fallbackRemoteModId
    if (onQueueDownload && modId) {
      onQueueDownload({
        modId,
        fileId: item.fileId,
        title: remote?.title ?? mod?.name ?? item.name,
        imageUrl: remote?.imageUrl ?? mod?.imageUrl ?? null,
        version: item.version ?? latestVersion,
        source: isLocal ? 'updates' : 'discover',
      })
    }
  }

  return (
    <aside className={cx('launcher-library-drawer', open && 'launcher-library-drawer-open')} aria-hidden={!open}>
      <button
        type="button"
        className="launcher-library-drawer-backdrop"
        aria-label={closeLabel}
        onClick={onClose}
        tabIndex={open ? 0 : -1}
      />

      <section className="launcher-library-drawer-panel launcher-mod-detail-panel" role="dialog" aria-modal="true" aria-label={displayName}>
        {!mod && !remote ? (
          <div className="launcher-library-drawer-body">
            <PanelEmptyState>{empty}</PanelEmptyState>
          </div>
        ) : (
          <>
            <header className="launcher-mod-detail-header">
              <LauncherArtworkCover
                title={displayName}
                imageUrl={mod?.imageUrl ?? remote?.imageUrl ?? null}
                coverStyle={coverStyle}
                coverWord={coverWord}
                className="launcher-mod-detail-cover"
              />

              <div className="launcher-mod-detail-identity">
                <div className="launcher-mod-detail-title-line">
                  <h2 title={displayName}>{displayName}</h2>
                  <span className="launcher-mod-detail-source-row">
                    {isLocal ? <span className="launcher-mod-detail-badge green">{detailCopy.local}</span> : null}
                    {isNexus ? <span className="launcher-mod-detail-badge blue">Nexus</span> : null}
                  </span>
                </div>
                <p title={subtitleText}>{subtitleText}</p>
              </div>

              {isLocal ? (
                <button
                  type="button"
                  className={cx('launcher-mod-detail-switch', !mod?.enabled && 'is-off')}
                  onClick={onToggleEnabled}
                  title={mod?.enabled ? disableLabel : enableLabel}
                >
                  {mod?.enabled ? enabledStateLabel : disabledStateLabel}
                </button>
              ) : null}

              <button type="button" className="icon-button" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="launcher-mod-detail-body">
              <aside className="launcher-mod-detail-sidebar">
                {sidebarStats.length ? (
                  <section className="launcher-mod-detail-sidebar-group">
                    <h3>{detailCopy.status}</h3>
                    <div className="launcher-mod-detail-stat-row">
                      {sidebarStats.map((stat) => (
                        <div className="launcher-mod-detail-stat" key={stat.label} title={stat.value}>
                          <span>{stat.label}</span>
                          <strong>{stat.value}</strong>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="launcher-mod-detail-sidebar-group">
                  <h3>{detailCopy.metadata}</h3>
                  <div className="launcher-mod-detail-property-list">
                    {sidebarRows.map((row) => (
                      <PropertyRow key={row.label} row={row} />
                    ))}
                  </div>
                </section>

                {tags.length ? (
                  <section className="launcher-mod-detail-sidebar-group">
                    <h3>{detailCopy.tags}</h3>
                    <div className="launcher-mod-detail-tags">
                      {tags.map((tag) => (
                        <span className="launcher-mod-detail-badge" key={tag} title={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </section>
                ) : null}
              </aside>

              <main className={cx('launcher-mod-detail-main', !updateAvailable && 'no-status')}>
                <div className="launcher-mod-detail-tabs" role="tablist" aria-label={detailCopy.tabsLabel}>
                  {detailTabs.map((tab) => (
                    <button key={tab} type="button" role="tab" aria-selected={selectedTab === tab} onClick={() => setActiveTab(tab)}>
                      {detailCopy.tabs[tab]}
                    </button>
                  ))}
                </div>

                {updateAvailable ? (
                  <div className="launcher-mod-detail-update-strip">
                    <span aria-hidden="true">!</span>
                    <p>
                      <strong>{detailCopy.updateAvailable}</strong> {normalizeVersion(mod?.version, copy.common.none)}{' '}
                      {detailCopy.installedTo} {normalizeVersion(latestVersion, copy.common.none)}
                    </p>
                  </div>
                ) : null}

                <section
                  className={cx('launcher-mod-detail-tab-panel', selectedTab === 'overview' && 'active')}
                  role="tabpanel"
                  hidden={selectedTab !== 'overview'}
                  aria-hidden={selectedTab !== 'overview'}
                >
                  {isCombined ? (
                    <div className="launcher-mod-detail-overview diff">
                      <section className="launcher-mod-detail-state-column current">
                        <div className="launcher-mod-detail-column-head">
                          <h3>{detailCopy.installed}</h3>
                          <span>{detailCopy.currentFolder}</span>
                        </div>
                        <div className="launcher-mod-detail-state-list">
                          <div className="launcher-mod-detail-state-item">
                            <span>{detailCopy.version}</span>
                            <strong>{normalizeVersion(mod?.version, copy.common.none)}</strong>
                          </div>
                          <div className="launcher-mod-detail-state-item">
                            <span>{labels.dependencies}</span>
                            <strong className={cx('launcher-mod-detail-status-value', dependencyTone)} title={dependencyText}>
                              {dependencyText}
                            </strong>
                          </div>
                          <div className="launcher-mod-detail-state-item">
                            <span>{detailCopy.status}</span>
                            <strong>{mod?.enabled ? enabledStateLabel : disabledStateLabel}</strong>
                          </div>
                        </div>
                      </section>

                      <section className="launcher-mod-detail-state-column target">
                        <div className="launcher-mod-detail-column-head">
                          <h3>{detailCopy.updateAvailable}</h3>
                          <span>{detailCopy.nexusPrimaryFile}</span>
                        </div>
                        <div className="launcher-mod-detail-state-list">
                          <div className="launcher-mod-detail-state-item">
                            <span>{detailCopy.version}</span>
                            <strong>{normalizeVersion(latestVersion, copy.common.none)}</strong>
                          </div>
                          <div className="launcher-mod-detail-state-item">
                            <span>{detailCopy.file}</span>
                            <strong title={primaryFileName ?? undefined}>{primaryFileName ?? copy.common.none}</strong>
                          </div>
                          <div className="launcher-mod-detail-state-item">
                            <span>{detailCopy.size}</span>
                            <strong>{primarySize}</strong>
                          </div>
                          <div className="launcher-mod-detail-state-item changelog">
                            <span>{detailCopy.whatsNew}</span>
                            {changelogLines.length ? (
                              <ul title={changelogLines.join(' ')}>
                                {changelogLines.map((line) => (
                                  <li key={line}>{line}</li>
                                ))}
                              </ul>
                            ) : (
                              <p>{copy.common.none}</p>
                            )}
                          </div>
                        </div>
                      </section>
                    </div>
                  ) : (
                    <div className={cx('launcher-mod-detail-overview single', isNexus && 'nexus', isLocal && !isCombined && 'local')}>
                      <section className="launcher-mod-detail-single-story">
                        <div>
                          <span>{isNexus ? detailCopy.version : detailCopy.installed}</span>
                          <strong title={displayVersion}>{displayVersion}</strong>
                          <p title={description}>{description}</p>
                        </div>
                        <div className="launcher-mod-detail-single-facts">
                          {(isNexus
                            ? [
                                { label: detailCopy.primaryFile, value: primaryFileName ?? copy.common.none },
                                { label: detailCopy.size, value: primarySize },
                                { label: detailCopy.scan, value: remote?.primaryFileScanStatus ?? copy.common.none },
                              ]
                            : [
                                { label: labels.dependencies, value: dependencyText },
                                {
                                  label: detailCopy.path,
                                  value: truncatePath(mod?.absolutePath, copy.common.none),
                                  title: mod?.absolutePath ?? undefined,
                                },
                              ]
                          ).map((item) => (
                            <div className="launcher-mod-detail-single-fact" key={item.label}>
                              <span>{item.label}</span>
                              <strong title={item.title ?? item.value}>{item.value}</strong>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  )}
                </section>

                <section
                  className={cx('launcher-mod-detail-tab-panel', selectedTab === 'description' && 'active')}
                  role="tabpanel"
                  hidden={selectedTab !== 'description'}
                  aria-hidden={selectedTab !== 'description'}
                >
                  <div className="launcher-mod-detail-description">
                    <p title={description}>{description}</p>
                    {(remote?.modUrl ?? mod?.modUrl) ? (
                      <button type="button" className="control-button" onClick={openRemotePage}>
                        {detailCopy.readFullDescription}
                      </button>
                    ) : null}
                  </div>
                </section>

                <section
                  className={cx('launcher-mod-detail-tab-panel', selectedTab === 'details' && 'active')}
                  role="tabpanel"
                  hidden={selectedTab !== 'details'}
                  aria-hidden={selectedTab !== 'details'}
                >
                  {isCombined ? (
                    <div className="launcher-mod-detail-info-layout combined">
                      <DetailSection title={detailCopy.installPath} rows={localDetails} />
                      <DetailSection title={detailCopy.updateEvidence} rows={updateEvidenceDetails} />
                    </div>
                  ) : isNexus ? (
                    <div className="launcher-mod-detail-info-layout only">
                      <DetailSection title={detailCopy.nexusPage} rows={nexusPageDetails} tone="graphql" />
                      <DetailSection title={detailCopy.primaryFile} rows={primaryFileDetails} />
                    </div>
                  ) : (
                    <div className="launcher-mod-detail-info-layout only">
                      <DetailSection title={detailCopy.install} rows={localDetails} />
                      <DetailSection title={detailCopy.manifest} rows={manifestDetails} />
                    </div>
                  )}
                </section>

                {hasDependencyData ? (
                  <section
                    className={cx('launcher-mod-detail-tab-panel', selectedTab === 'dependencies' && 'active')}
                    role="tabpanel"
                    hidden={selectedTab !== 'dependencies'}
                    aria-hidden={selectedTab !== 'dependencies'}
                  >
                    <div className="launcher-mod-detail-info-layout rich scrollable">
                      <div className="launcher-mod-detail-rich-head">
                        <span>{detailCopy.tabs.dependencies}</span>
                        <strong>{dependencyItems.length}</strong>
                      </div>
                      <DependencyList items={dependencyItems} />
                    </div>
                  </section>
                ) : null}

                {hasFileData ? (
                  <section
                    className={cx('launcher-mod-detail-tab-panel', selectedTab === 'files' && 'active')}
                    role="tabpanel"
                    hidden={selectedTab !== 'files'}
                    aria-hidden={selectedTab !== 'files'}
                  >
                    <div className="launcher-mod-detail-info-layout rich scrollable">
                      <div className="launcher-mod-detail-rich-head">
                        <span>{detailCopy.availableFiles}</span>
                        <strong>{fileItems.length}</strong>
                      </div>
                      <FileList
                        items={fileItems}
                        labels={{
                          main: detailCopy.mainFiles,
                          optional: detailCopy.optionalFiles,
                          old: detailCopy.oldFiles,
                        }}
                        actionLabel={launcherCopy.actions.queueDownload}
                        onDownloadFile={handleDownloadRemoteFile}
                      />
                    </div>
                  </section>
                ) : null}
              </main>
            </div>

            <footer className="launcher-mod-detail-footer">
              <div className="launcher-mod-detail-tool-group">
                {isLocal ? (
                  <button
                    type="button"
                    className="launcher-mod-detail-tool-button"
                    onClick={onOpenFolder}
                    title={openFolderLabel}
                    aria-label={openFolderLabel}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </button>
                ) : null}
                {isLocal ? (
                  <button
                    type="button"
                    className="launcher-mod-detail-tool-button"
                    onClick={mod?.imageUrl ? onClearCover : onSetCover}
                    title={mod?.imageUrl ? clearCoverLabel : setCoverLabel}
                    aria-label={mod?.imageUrl ? clearCoverLabel : setCoverLabel}
                  >
                    <ImageIcon className="h-4 w-4" />
                  </button>
                ) : null}
                {(remote?.modUrl ?? mod?.modUrl) ? (
                  <button
                    type="button"
                    className="launcher-mod-detail-tool-button"
                    onClick={openRemotePage}
                    title={openModPageLabel ?? launcherCopy.actions.openModPage}
                    aria-label={openModPageLabel ?? launcherCopy.actions.openModPage}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                className="control-button control-button-primary launcher-mod-detail-primary-action"
                onClick={() => {
                  if (isCombined && updateAvailable) {
                    const primaryFile = fileItems.find((item) => item.primary) ?? fileItems[0]
                    if (primaryFile) {
                      handleDownloadRemoteFile(primaryFile)
                      return
                    }
                  }

                  if (!isLocal && isNexus) {
                    const primaryFile = fileItems.find((item) => item.primary) ?? fileItems[0]
                    if (primaryFile) {
                      handleDownloadRemoteFile(primaryFile)
                      return
                    }
                    openRemotePage()
                    return
                  }

                  onOpenFolder()
                }}
              >
                {isCombined
                  ? updateAvailable
                    ? detailCopy.updateNow
                    : detailCopy.reinstall
                  : isNexus
                    ? launcherCopy.actions.queueDownload
                    : openFolderLabel}
              </button>
            </footer>
          </>
        )}
      </section>
    </aside>
  )
}
