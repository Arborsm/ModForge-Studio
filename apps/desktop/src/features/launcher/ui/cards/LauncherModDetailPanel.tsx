import type { CSSProperties } from 'react'
import { ExternalLink, FolderOpen, ImageIcon, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEditorCopy } from '@locales/localeContext'
import { useLauncherPort } from '@features/launcher/model/launcherPortContext'
import { useLauncherRemoteModDetail } from '@features/launcher/model/useLauncherRemoteModDetail'
import { cx } from '@shared/lib/cx'
import { NexusModsBbcode } from '@shared/ui/nexusmods-bbcode'
import { PanelEmptyState } from '@shared/ui/PanelSection'
import type { LauncherDiscoverDetail, LauncherLibraryItem, QueueLauncherDownloadInput } from '../../model/types'
import { LauncherArtworkCover } from './LauncherArtworkCover'
import { getLauncherCardCoverWord, getLauncherCardFallbackPalette } from './launcherCardPresentation'
import { ChangelogList, DependencyList, DetailDataLoading, DetailSection, FileList, PropertyRow } from './LauncherModDetailLists'
import {
  buildChangelogItems,
  compactNumber,
  formatDate,
  formatSize,
  hasUpdate,
  normalizeVersion,
  resolveFileGroup,
  truncatePath,
  type DependencyListItem,
  type DetailRow,
  type FileListItem,
} from './launcherModDetailData'

type LauncherDetailTab = 'description' | 'changelog' | 'details' | 'dependencies' | 'files'

type LauncherDetailMod = Partial<LauncherLibraryItem> & {
  packName?: string | null
}

function shouldDeferDetailContent() {
  return import.meta.env.MODE !== 'test' && (typeof navigator === 'undefined' || !navigator.userAgent.toLowerCase().includes('jsdom'))
}

function DependencyIcon({ name }: { name: string }) {
  const symbol = name.toLowerCase().includes('smapi') ? '⚙' : '🧩'

  return <span>{symbol}</span>
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
  remoteLoading?: boolean
  remoteFilesDeferred?: boolean
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
  remoteLoading = false,
  remoteFilesDeferred = false,
}: LauncherModDetailPanelProps) {
  const launcherPort = useLauncherPort()
  const copy = useEditorCopy()
  const launcherCopy = copy.launcher
  const detailCopy = launcherCopy.library.modDetail
  const [activeTab, setActiveTab] = useState<LauncherDetailTab>('description')
  const [descriptionReaderOpen, setDescriptionReaderOpen] = useState(false)
  const detailContentKey = `${mod?.id ?? 'empty'}:${remoteDetail?.modId ?? mod?.nexusModId ?? 'local'}`
  const deferDetailContent = shouldDeferDetailContent()
  const [readyContentKey, setReadyContentKey] = useState(() => (!deferDetailContent ? detailContentKey : null))
  const contentReady = !deferDetailContent || readyContentKey === detailContentKey
  const fallbackPalette = getLauncherCardFallbackPalette(mod?.name ?? remoteDetail?.title ?? title)
  const coverWord = getLauncherCardCoverWord(mod?.name ?? remoteDetail?.title ?? title)
  const fetchedRemote = useLauncherRemoteModDetail(open && !remoteDetail && mod?.nexusModId ? mod.nexusModId : null, {
    ...(remoteFilesDeferred ? { includeFiles: false } : {}),
  })
  const deferredFilesModId = remoteDetail?.modId ?? fetchedRemote.detail?.modId ?? mod?.nexusModId ?? null
  const shouldFetchDeferredFiles =
    open && remoteFilesDeferred && (activeTab === 'files' || activeTab === 'changelog') && deferredFilesModId ? deferredFilesModId : null
  const fetchedRemoteWithFiles = useLauncherRemoteModDetail(shouldFetchDeferredFiles, {
    includeFiles: true,
    notify: false,
  })
  const deferredFilesLoading = Boolean(shouldFetchDeferredFiles && fetchedRemoteWithFiles.state === 'loading')
  const remote = fetchedRemoteWithFiles.detail ?? remoteDetail ?? fetchedRemote.detail
  const showRemoteLoading =
    remoteLoading || Boolean(open && !remoteDetail && mod?.nexusModId && fetchedRemote.state === 'loading') || deferredFilesLoading
  const fallbackRemoteModId = mod?.nexusModId ?? null
  const isLocal = Boolean(mod?.absolutePath)
  const isNexus = Boolean(remote)
  const isCombined = isLocal && isNexus
  const overviewDescription = remote?.summary ?? mod?.description ?? noSummary
  const fullDescription = remote?.description ?? remote?.summary ?? mod?.description ?? noSummary
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
  const primaryFileName = remote?.primaryFileName ?? (remote ? remote.title : null)
  const primaryFileId = remote?.primaryFileId ? `#${remote.primaryFileId}` : copy.common.none
  const primarySize = formatSize(remote?.primaryFileSize ?? remote?.fileSize, remote?.primaryFileSizeBytes, copy.common.none)
  const rawLocalDependencies = mod?.requiredDependencies?.length ? mod.requiredDependencies : (mod?.missingRequiredDependencies ?? [])
  const localDependencies = Array.from(new Set(rawLocalDependencies.map((item) => item.trim()).filter(Boolean)))
  const remoteRequirements = useMemo(
    () => (remote?.requirements ?? []).filter((requirement) => requirement.name.trim() !== ''),
    [remote?.requirements],
  )
  const remoteFiles = useMemo(() => (remote?.files ?? []).filter((file) => (file.name ?? '').trim() !== '' || file.fileId), [remote?.files])
  const changelogItems = useMemo(
    () =>
      buildChangelogItems({
        primaryLines: remote?.primaryFileChangelog,
        primarySource: primaryFileName ?? detailCopy.primaryFile,
        primaryVersion: latestVersion,
        files: remoteFiles,
        noneLabel: copy.common.none,
      }),
    [copy.common.none, detailCopy.primaryFile, latestVersion, primaryFileName, remote?.primaryFileChangelog, remoteFiles],
  )
  const hasDependencyData = localDependencies.length > 0 || remoteRequirements.length > 0
  const hasDeferredFileData = Boolean(remoteFilesDeferred && deferredFilesModId && onQueueDownload)
  const hasFileData = isNexus && (remoteFiles.length > 0 || hasDeferredFileData)
  const hasChangelogData = isNexus && (changelogItems.length > 0 || Boolean(remoteFilesDeferred && deferredFilesModId))
  const detailTabs = useMemo<LauncherDetailTab[]>(() => {
    const tabs: LauncherDetailTab[] = ['description']
    if (hasChangelogData) {
      tabs.push('changelog')
    }
    tabs.push('details')
    if (hasDependencyData) {
      tabs.push('dependencies')
    }
    if (hasFileData) {
      tabs.push('files')
    }
    return tabs
  }, [hasChangelogData, hasDependencyData, hasFileData])
  const selectedTab = detailTabs.includes(activeTab) ? activeTab : 'description'
  const showDescriptionReader = open && selectedTab === 'description' && descriptionReaderOpen
  const localHeroRows: DetailRow[] = isLocal
    ? [
        { label: detailCopy.installPath, value: truncatePath(mod?.absolutePath, copy.common.none), title: mod?.absolutePath ?? undefined },
        { label: detailCopy.folder, value: mod?.folderName ?? copy.common.none, title: mod?.folderName ?? undefined },
        { label: labels.dependencies, value: dependencyText, title: dependencyText },
      ]
    : []

  const remoteHeroRows: DetailRow[] = isNexus
    ? [
        { label: detailCopy.updated, value: formatDate(remote?.updatedAt, copy.common.none), title: remote?.updatedAt ?? undefined },
        { label: detailCopy.download, value: compactNumber(remote?.downloads, copy.common.none) },
        { label: launcherCopy.sortOptions.endorsements, value: compactNumber(remote?.endorsements, copy.common.none) },
      ]
    : []

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
      value: remote?.updateRisk ?? copy.common.none,
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
  const keyStatusItems: DependencyListItem[] = dependencyItems.length
    ? dependencyItems.slice(0, 3)
    : [
        {
          name: labels.dependencies,
          meta: detailCopy.status,
          status: dependencyText,
          missing: Boolean(mod?.missingRequiredDependencies?.length),
          title: dependencyText,
        },
      ]

  const fileItems: FileListItem[] = remoteFiles.map((file) => {
    const fileName = file.name ?? (file.fileId ? `#${file.fileId}` : '')
    const meta = [
      file.version ? normalizeVersion(file.version, copy.common.none) : null,
      file.category ?? null,
      file.uploadedAt ? formatDate(file.uploadedAt, copy.common.none) : null,
      formatSize(file.size, file.sizeBytes, copy.common.none),
      file.uniqueDownloads ? detailCopy.uniqueDownloads(compactNumber(file.uniqueDownloads, copy.common.none)) : null,
      file.totalDownloads ? detailCopy.totalDownloads(compactNumber(file.totalDownloads, copy.common.none)) : null,
    ]
      .filter(Boolean)
      .join(' · ')
    const description = file.description?.trim() ?? ''
    return {
      id: `${file.fileId ?? fileName}`,
      name: fileName,
      meta: [meta, file.archiveType, file.managerDownloadEnabled ? detailCopy.modManagerDownload : null].filter(Boolean).join(' · '),
      status: '',
      description,
      fileId: file.fileId ?? null,
      version: file.version ?? null,
      primary: Boolean(file.primary),
      group: resolveFileGroup(file),
    }
  })

  const handleClose = useCallback(() => {
    setDescriptionReaderOpen(false)
    if (deferDetailContent) {
      setReadyContentKey(null)
    }
    onClose()
  }, [deferDetailContent, onClose])

  const handleSelectTab = (tab: LauncherDetailTab) => {
    if (tab !== 'description') {
      setDescriptionReaderOpen(false)
    }
    setActiveTab(tab)
  }

  useEffect(() => {
    if (!open) {
      return
    }

    if (!deferDetailContent) {
      return
    }

    const frameId = window.requestAnimationFrame(() => setReadyContentKey(detailContentKey))
    return () => window.cancelAnimationFrame(frameId)
  }, [deferDetailContent, detailContentKey, open])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showDescriptionReader) {
          setDescriptionReaderOpen(false)
          return
        }
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleClose, open, showDescriptionReader])

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

  if (!open) {
    return null
  }

  return (
    <aside className={cx('launcher-library-drawer', open && 'launcher-library-drawer-open')}>
      <button type="button" className="launcher-library-drawer-backdrop" aria-label={closeLabel} onClick={handleClose} />

      <section className="launcher-library-drawer-panel launcher-mod-detail-panel" role="dialog" aria-modal="true" aria-label={displayName}>
        {showRemoteLoading ? (
          <div className="launcher-mod-detail-loading-overlay" role="status">
            <div className="launcher-mod-detail-loading-card">
              <span className="launcher-mod-detail-loading-bar" aria-hidden="true" />
              <div>
                <span>{launcherCopy.updates.detailsLoading}</span>
                <i aria-hidden="true" />
              </div>
            </div>
          </div>
        ) : null}

        {!contentReady ? (
          <>
            <button
              type="button"
              className="icon-button launcher-mod-detail-close-button launcher-mod-detail-shell-close-button"
              onClick={handleClose}
              aria-label={closeLabel}
              title={closeLabel}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="launcher-mod-detail-shell-pending" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </>
        ) : !mod && !remote ? (
          <div className="launcher-library-drawer-body">
            <PanelEmptyState>{empty}</PanelEmptyState>
          </div>
        ) : (
          <>
            <header className="launcher-mod-detail-hero">
              <div className="launcher-mod-detail-cover-frame">
                <LauncherArtworkCover
                  title={displayName}
                  imageUrl={mod?.imageUrl ?? remote?.imageUrl ?? null}
                  coverStyle={coverStyle}
                  coverWord={coverWord}
                  className="launcher-mod-detail-cover"
                />
              </div>

              <div className="launcher-mod-detail-hero-main">
                <button
                  type="button"
                  className="icon-button launcher-mod-detail-close-button"
                  onClick={handleClose}
                  aria-label={closeLabel}
                  title={closeLabel}
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="launcher-mod-detail-status-overview">
                  <div className="launcher-mod-detail-status-primary">
                    <div className="launcher-mod-detail-status-heading">
                      <h2 className="launcher-mod-detail-status-title" title={displayName}>
                        {displayName}
                      </h2>
                      <div className="launcher-mod-detail-status-meta-line">
                        <span className={cx('launcher-mod-detail-update-badge', updateAvailable && 'is-update')}>
                          {updateAvailable ? detailCopy.updateAvailable : isLocal ? detailCopy.installed : detailCopy.nexus}
                        </span>
                        <p title={subtitleText}>
                          {displayAuthor ? (
                            <>
                              {detailCopy.byAuthor} <strong>{displayAuthor}</strong>
                            </>
                          ) : null}
                          {displayAuthor && category ? ' · ' : null}
                          {category ? <strong>{category}</strong> : null}
                        </p>
                      </div>
                    </div>

                    {isCombined ? (
                      <div className="launcher-mod-detail-version-compare">
                        <div className="launcher-mod-detail-version-node">
                          <span>{detailCopy.currentFolder}</span>
                          <strong>{normalizeVersion(mod?.version, copy.common.none)}</strong>
                          <button
                            type="button"
                            className={cx('launcher-mod-detail-version-state', !mod?.enabled && 'is-off')}
                            onClick={onToggleEnabled}
                            title={mod?.enabled ? disableLabel : enableLabel}
                          >
                            {mod?.enabled ? enabledStateLabel : disabledStateLabel} · {dependencyText}
                          </button>
                        </div>
                        <div className="launcher-mod-detail-version-arrow" aria-hidden="true">
                          →
                        </div>
                        <div className="launcher-mod-detail-version-node">
                          <span>{detailCopy.nexusPrimaryFile}</span>
                          <strong className="latest">{normalizeVersion(latestVersion, copy.common.none)}</strong>
                          <em>
                            {detailCopy.size}: {primarySize}
                          </em>
                        </div>
                      </div>
                    ) : (
                      <div className={cx('launcher-mod-detail-version-compare single', isNexus && 'nexus')}>
                        <div className="launcher-mod-detail-version-node">
                          <span>{isNexus ? detailCopy.nexusPrimaryFile : detailCopy.installed}</span>
                          <strong>{displayVersion}</strong>
                          {isLocal ? (
                            <button
                              type="button"
                              className={cx('launcher-mod-detail-version-state', !mod?.enabled && 'is-off')}
                              onClick={onToggleEnabled}
                              title={mod?.enabled ? disableLabel : enableLabel}
                            >
                              {mod?.enabled ? enabledStateLabel : disabledStateLabel} · {dependencyText}
                            </button>
                          ) : (
                            <em>
                              {detailCopy.size}: {primarySize}
                            </em>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="launcher-mod-detail-hero-summary">
                      <NexusModsBbcode source={overviewDescription} />
                    </div>
                  </div>

                  <aside className="launcher-mod-detail-status-side" aria-label={detailCopy.metadata}>
                    {localHeroRows.length ? (
                      <div className="launcher-mod-detail-status-group">
                        {localHeroRows.map((row) => (
                          <PropertyRow key={row.label} row={row} />
                        ))}
                      </div>
                    ) : null}
                    {remoteHeroRows.length ? (
                      <div className="launcher-mod-detail-status-group">
                        {remoteHeroRows.map((row) => (
                          <PropertyRow key={row.label} row={row} />
                        ))}
                      </div>
                    ) : null}
                  </aside>
                </div>
              </div>
            </header>

            <div className="launcher-mod-detail-body">
              <main className={cx('launcher-mod-detail-main', !updateAvailable && 'no-status')}>
                <div className="launcher-mod-detail-tabs" role="tablist" aria-label={detailCopy.tabsLabel}>
                  {detailTabs.map((tab) => (
                    <button key={tab} type="button" role="tab" aria-selected={selectedTab === tab} onClick={() => handleSelectTab(tab)}>
                      {detailCopy.tabs[tab]}
                    </button>
                  ))}
                </div>

                <section
                  className={cx('launcher-mod-detail-tab-panel', selectedTab === 'description' && 'active')}
                  role="tabpanel"
                  hidden={selectedTab !== 'description'}
                  aria-hidden={selectedTab !== 'description'}
                >
                  <div className="launcher-mod-detail-description">
                    {selectedTab === 'description' ? <NexusModsBbcode source={fullDescription} /> : null}
                    {selectedTab === 'description' ? (
                      <button type="button" className="control-button" onClick={() => setDescriptionReaderOpen(true)}>
                        {detailCopy.readFullDescription}
                      </button>
                    ) : null}
                  </div>
                </section>

                {hasChangelogData && selectedTab === 'changelog' ? (
                  <section
                    className={cx('launcher-mod-detail-tab-panel', selectedTab === 'changelog' && 'active')}
                    role="tabpanel"
                    hidden={selectedTab !== 'changelog'}
                    aria-hidden={selectedTab !== 'changelog'}
                  >
                    <div className="launcher-mod-detail-info-layout rich scrollable">
                      {selectedTab === 'changelog' ? (
                        deferredFilesLoading ? (
                          <DetailDataLoading label={detailCopy.filesLoading} />
                        ) : (
                          <ChangelogList items={changelogItems} emptyLabel={detailCopy.changelogEmpty} />
                        )
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {selectedTab === 'details' ? (
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
                ) : null}

                {hasDependencyData && selectedTab === 'dependencies' ? (
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

                {hasFileData && selectedTab === 'files' ? (
                  <section
                    className={cx('launcher-mod-detail-tab-panel', selectedTab === 'files' && 'active')}
                    role="tabpanel"
                    hidden={selectedTab !== 'files'}
                    aria-hidden={selectedTab !== 'files'}
                  >
                    <div className="launcher-mod-detail-info-layout rich scrollable">
                      {selectedTab === 'files' && deferredFilesLoading ? (
                        <DetailDataLoading label={detailCopy.filesLoading} />
                      ) : selectedTab === 'files' ? (
                        <FileList
                          items={fileItems}
                          labels={{
                            main: detailCopy.mainFiles,
                            optional: detailCopy.optionalFiles,
                            old: detailCopy.oldFiles,
                            oldAndArchived: detailCopy.oldAndArchivedFiles,
                          }}
                          actionLabel={launcherCopy.actions.queueDownload}
                          onDownloadFile={handleDownloadRemoteFile}
                        />
                      ) : null}
                    </div>
                  </section>
                ) : null}
              </main>

              <aside className="launcher-mod-detail-key-card">
                <h3>{detailCopy.status}</h3>
                <div className="launcher-mod-detail-key-list">
                  {keyStatusItems.map((item) => (
                    <article className={cx('launcher-mod-detail-key-item', item.missing && 'is-missing')} key={`${item.name}-${item.meta}`}>
                      <span className="launcher-mod-detail-key-icon" aria-hidden="true">
                        <DependencyIcon name={item.name} />
                      </span>
                      <div>
                        <strong title={item.title}>{item.name}</strong>
                        <span>{item.meta}</span>
                      </div>
                      <em>{item.status}</em>
                    </article>
                  ))}
                </div>
              </aside>
            </div>

            {showDescriptionReader ? (
              <div className="launcher-mod-detail-reader" role="dialog" aria-modal="false" aria-label={detailCopy.fullDescriptionTitle}>
                <div className="launcher-mod-detail-reader-head">
                  <div>
                    <h2>{detailCopy.fullDescriptionTitle}</h2>
                    <p>{displayName}</p>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setDescriptionReaderOpen(false)}
                    aria-label={closeLabel}
                    title={closeLabel}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <article className="launcher-mod-detail-reader-body">
                  <NexusModsBbcode source={fullDescription} />
                </article>
              </div>
            ) : null}

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
