import { AlertTriangle, ExternalLink, FolderOpen, ImageIcon, X } from 'lucide-react'
import { useCallback, useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditorCopy } from '@locales/provider'
import { useLauncherPort } from '@features/launcher/model/launcherPortContext'
import { useLauncherRemoteModDetail } from '@features/launcher/model/useLauncherRemoteModDetail'
import { cx } from '@shared/lib/helper'
import { NexusModsBbcode } from '@shared/ui/nexusmods-bbcode'
import { PanelEmptyState } from '@shared/ui/PanelSection'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import type { LauncherDiscoverDetail, LauncherLibraryItem, QueueLauncherDownloadInput } from '../../model/types'
import { useLauncherDependencyDetails, usePreloadLauncherDependencyDetails } from './dependency-tree/useLauncherDependencyDetails'
import type { LauncherDetailMod } from './dependency-tree/dependencyTreeTypes'
import { LauncherArtworkCover } from './LauncherArtworkCover'
import { LauncherModConfigPanel, type LauncherModConfigLeaveGuard } from './LauncherModConfigPanel'
import { ChangelogList, DependencyTree, DetailDataLoading, DetailSection, FileList, PropertyRow } from './LauncherModDetailLists'
import { normalizeVersion, type DependencyTreeNode, type FileListItem, type LauncherDetailTab } from './launcherModDetailData'
import { useLauncherModDetailViewModel } from './useLauncherModDetailViewModel'

function shouldDeferDetailContent() {
  return import.meta.env.MODE !== 'test' && (typeof navigator === 'undefined' || !navigator.userAgent.toLowerCase().includes('jsdom'))
}

type LauncherModDetailPanelProps = {
  open: boolean
  onClose: () => void
  mod: LauncherDetailMod | null
  remoteDetail?: LauncherDiscoverDetail | null
  onToggleEnabled: () => void
  onOpenFolder: () => void
  onSetCover: () => void
  onClearCover: () => void
  packName?: string | null
  onQueueDownload?: (input: QueueLauncherDownloadInput) => void
  onSearchDependency?: (query: string) => void
  remoteLoading?: boolean
  remoteFilesDeferred?: boolean
  libraryMods?: LauncherLibraryItem[]
}

export function LauncherModDetailPanel({
  open,
  onClose,
  mod,
  remoteDetail,
  onToggleEnabled,
  onOpenFolder,
  onSetCover,
  onClearCover,
  packName,
  onQueueDownload,
  onSearchDependency,
  remoteLoading = false,
  remoteFilesDeferred = false,
  libraryMods = [],
}: LauncherModDetailPanelProps) {
  const launcherPort = useLauncherPort()
  const copy = useEditorCopy()
  const launcherCopy = copy.launcher
  const detailCopy = launcherCopy.library.modDetail
  const configLeaveDialogTitleId = useId()
  const [activeTab, setActiveTab] = useState<LauncherDetailTab>('description')
  const [configToolbarTarget, setConfigToolbarTarget] = useState<HTMLDivElement | null>(null)
  const [configLeaveGuard, setConfigLeaveGuard] = useState<LauncherModConfigLeaveGuard | null>(null)
  const [pendingConfigLeave, setPendingConfigLeave] = useState<{ kind: 'close' } | { kind: 'tab'; tab: LauncherDetailTab } | null>(null)
  const [descriptionReaderOpen, setDescriptionReaderOpen] = useState(false)
  const [expandedDependencyNodeIds, setExpandedDependencyNodeIds] = useState<Set<string>>(new Set())
  const detailContentKey = `${mod?.id ?? 'empty'}:${remoteDetail?.modId ?? mod?.nexusModId ?? 'local'}`
  const deferDetailContent = shouldDeferDetailContent()
  const [readyContentKey, setReadyContentKey] = useState(() => (!deferDetailContent ? detailContentKey : null))
  const contentReady = !deferDetailContent || readyContentKey === detailContentKey
  const fetchedRemote = useLauncherRemoteModDetail(
    open && !remoteDetail && mod?.nexusModId ? mod.nexusModId : null,
    remoteFilesDeferred ? { includeFiles: false } : {},
  )
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
  const { remoteDependencyDetails, loadRemoteDependencyDetail } = useLauncherDependencyDetails({
    detailContentKey,
    launcherPort,
  })
  const viewModel = useLauncherModDetailViewModel({
    copy,
    activeTab,
    mod,
    remote,
    packName,
    libraryMods,
    remoteDependencyDetails,
    remoteFilesDeferred,
    deferredFilesModId,
    canQueueDownload: Boolean(onQueueDownload),
  })
  const {
    statusFlags: { isLocal, isNexus, isCombined, updateAvailable },
    hero: {
      displayName,
      displayAuthor,
      displayVersion,
      category,
      subtitleText,
      overviewDescription,
      fullDescription,
      latestVersion,
      dependencyText,
      primarySize,
      coverStyle,
      coverWord,
      imageUrl,
      localRows: localHeroRows,
      remoteRows: remoteHeroRows,
    },
    tabs: {
      items: detailTabs,
      selected: selectedTab,
      hasChangelogData,
      hasDependencyData,
      hasFileData,
      missingDependencyCount,
      missingDependencyLabel,
    },
    details: {
      localRows: localDetails,
      manifestRows: manifestDetails,
      nexusPageRows: nexusPageDetails,
      primaryFileRows: primaryFileDetails,
      updateEvidenceRows: updateEvidenceDetails,
    },
    files: { items: fileItems },
    changelog: { items: changelogItems },
    dependencyTree,
    remote: { fallbackModId: fallbackRemoteModId },
  } = viewModel
  const dependencyTreeItems = dependencyTree.items
  const dependencyIssueCount = dependencyTree.issueCount
  usePreloadLauncherDependencyDetails({
    open,
    selectedTab,
    loadableModIds: dependencyTree.loadableModIds,
    loadRemoteDependencyDetail,
  })
  const showDescriptionReader = open && selectedTab === 'description' && descriptionReaderOpen

  const closeImmediately = useCallback(() => {
    setDescriptionReaderOpen(false)
    if (deferDetailContent) {
      setReadyContentKey(null)
    }
    onClose()
  }, [deferDetailContent, onClose])

  const handleClose = useCallback(() => {
    if (configLeaveGuard?.dirty) {
      setPendingConfigLeave({ kind: 'close' })
      return
    }
    closeImmediately()
  }, [closeImmediately, configLeaveGuard?.dirty])

  const completePendingConfigLeave = useCallback(() => {
    const pending = pendingConfigLeave
    setPendingConfigLeave(null)
    if (pending?.kind === 'close') closeImmediately()
    else if (pending?.kind === 'tab') setActiveTab(pending.tab)
  }, [closeImmediately, pendingConfigLeave])

  const handleSelectTab = (tab: LauncherDetailTab) => {
    if (tab !== selectedTab && configLeaveGuard?.dirty) {
      setPendingConfigLeave({ kind: 'tab', tab })
      return
    }
    if (tab !== 'description') {
      setDescriptionReaderOpen(false)
    }
    setActiveTab(tab)
  }

  useEffect(() => {
    setExpandedDependencyNodeIds(dependencyTree.expandedNodeIds)
  }, [dependencyTree.expandedNodeKey, detailContentKey])

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
        if (pendingConfigLeave) {
          return
        }
        if (showDescriptionReader) {
          setDescriptionReaderOpen(false)
          return
        }
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleClose, open, pendingConfigLeave, showDescriptionReader])

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

  const handleDownloadDependency = (item: DependencyTreeNode) => {
    if (onQueueDownload && item.modId) {
      onQueueDownload({
        modId: item.modId,
        title: item.name,
        imageUrl: item.imageUrl ?? null,
        version: item.version ?? null,
        source: isLocal ? 'updates' : 'discover',
      })
    }
  }

  const handleOpenDependencyPage = (item: DependencyTreeNode) => {
    const url = item.url ?? (item.modId ? `https://www.nexusmods.com/stardewvalley/mods/${item.modId}` : null)
    if (url) {
      void launcherPort.openUrl({ url })
    }
  }

  const handleSearchDependency = (item: DependencyTreeNode) => {
    const query = item.searchQuery?.trim()
    if (query) {
      onSearchDependency?.(query)
    }
  }

  const handleToggleDependencyNode = (item: DependencyTreeNode) => {
    setExpandedDependencyNodeIds((current) => {
      const next = new Set(current)
      if (next.has(item.id)) {
        next.delete(item.id)
      } else {
        next.add(item.id)
      }
      return next
    })

    if (!item.loadable || !item.modId || remoteDependencyDetails[item.modId]?.state === 'loading') {
      return
    }

    loadRemoteDependencyDetail(item.modId)
  }

  if (!open) {
    return null
  }

  const drawer = (
    <aside className={cx('launcher-library-drawer', open && 'launcher-library-drawer-open')}>
      <button
        type="button"
        className="launcher-library-drawer-backdrop"
        aria-label={launcherCopy.actions.closeDialog}
        onClick={handleClose}
      />

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
              aria-label={launcherCopy.actions.closeDialog}
              title={launcherCopy.actions.closeDialog}
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
            <PanelEmptyState>{launcherCopy.library.selectionEmpty}</PanelEmptyState>
          </div>
        ) : (
          <>
            <header className="launcher-mod-detail-hero">
              <div className="launcher-mod-detail-cover-frame">
                <LauncherArtworkCover
                  title={displayName}
                  imageUrl={imageUrl}
                  coverStyle={coverStyle}
                  coverWord={coverWord}
                  className="launcher-mod-detail-cover"
                  showBlurStrip={false}
                />
              </div>

              <div className="launcher-mod-detail-hero-main">
                <button
                  type="button"
                  className="icon-button launcher-mod-detail-close-button"
                  onClick={handleClose}
                  aria-label={launcherCopy.actions.closeDialog}
                  title={launcherCopy.actions.closeDialog}
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
                            title={mod?.enabled ? launcherCopy.actions.disable : launcherCopy.actions.enable}
                          >
                            {mod?.enabled ? launcherCopy.overview.enabledMods : launcherCopy.overview.disabledMods} · {dependencyText}
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
                              title={mod?.enabled ? launcherCopy.actions.disable : launcherCopy.actions.enable}
                            >
                              {mod?.enabled ? launcherCopy.overview.enabledMods : launcherCopy.overview.disabledMods} · {dependencyText}
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
              <main className="launcher-mod-detail-main">
                <div className="launcher-mod-detail-tabs-shell">
                  <div className="launcher-mod-detail-tabs" role="tablist" aria-label={detailCopy.tabsLabel}>
                    {detailTabs.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={selectedTab === tab}
                        onClick={() => handleSelectTab(tab)}
                        title={tab === 'dependencies' && missingDependencyLabel ? missingDependencyLabel : undefined}
                      >
                        <span>{detailCopy.tabs[tab]}</span>
                        {tab === 'dependencies' && missingDependencyCount ? (
                          <strong className="launcher-mod-detail-tab-alert" aria-hidden="true">
                            {missingDependencyCount}
                          </strong>
                        ) : null}
                      </button>
                    ))}
                  </div>
                  {selectedTab === 'config' ? <div className="launcher-mod-detail-tab-toolbar" ref={setConfigToolbarTarget} /> : null}
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
                        <div className="launcher-mod-detail-rich-head-title">
                          <span>{detailCopy.tabs.dependencies}</span>
                          <strong>{dependencyTreeItems.length}</strong>
                        </div>
                        {dependencyIssueCount > 0 ? (
                          <span className="launcher-mod-detail-dependency-issues-badge">
                            {detailCopy.dependencyIssues(dependencyIssueCount)}
                          </span>
                        ) : null}
                      </div>
                      <DependencyTree
                        items={dependencyTreeItems}
                        expandedNodeIds={expandedDependencyNodeIds}
                        labels={{
                          download: detailCopy.downloadDependency,
                          openPage: launcherCopy.actions.openModPage,
                          search: launcherCopy.fields.searchDiscover,
                          expand: detailCopy.expandDependency,
                          collapse: detailCopy.collapseDependency,
                          loadChildren: detailCopy.loadDependencyChildren,
                        }}
                        onToggleNode={handleToggleDependencyNode}
                        onDownloadDependency={handleDownloadDependency}
                        onOpenDependencyPage={handleOpenDependencyPage}
                        onSearchDependency={onSearchDependency ? handleSearchDependency : undefined}
                      />
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

                {isLocal && mod?.hasConfig && selectedTab === 'config' && mod.absolutePath ? (
                  <section
                    className={cx('launcher-mod-detail-tab-panel', selectedTab === 'config' && 'active')}
                    role="tabpanel"
                    hidden={selectedTab !== 'config'}
                    aria-hidden={selectedTab !== 'config'}
                  >
                    <div className="launcher-mod-detail-info-layout rich scrollable">
                      <LauncherModConfigPanel
                        modPath={mod.absolutePath}
                        launcherPort={launcherPort}
                        toolbarTarget={configToolbarTarget}
                        onLeaveGuardChange={setConfigLeaveGuard}
                      />
                    </div>
                  </section>
                ) : null}
              </main>
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
                    aria-label={launcherCopy.actions.closeDialog}
                    title={launcherCopy.actions.closeDialog}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <article className="launcher-mod-detail-reader-body">
                  <NexusModsBbcode source={fullDescription} />
                </article>
              </div>
            ) : null}

            <Dialog
              open={Boolean(pendingConfigLeave)}
              onClose={() => setPendingConfigLeave(null)}
              size="sm"
              labelledBy={configLeaveDialogTitleId}
              closeOnBackdrop={!configLeaveGuard?.saving}
              closeOnEscape={!configLeaveGuard?.saving}
            >
              <DialogHeader
                title={detailCopy.config.unsavedTitle}
                tone="warning"
                icon={<AlertTriangle className="h-4 w-4" />}
                onClose={() => setPendingConfigLeave(null)}
                closeLabel={detailCopy.config.unsavedCancel}
                closeDisabled={configLeaveGuard?.saving}
                id={configLeaveDialogTitleId}
              />
              <DialogBody>
                <p className="text-sm text-(--text-secondary)">{detailCopy.config.unsavedMessage}</p>
              </DialogBody>
              <DialogFooter>
                <DialogAction onClick={() => setPendingConfigLeave(null)} disabled={configLeaveGuard?.saving}>
                  {detailCopy.config.unsavedCancel}
                </DialogAction>
                <DialogAction tone="warning" onClick={completePendingConfigLeave} disabled={configLeaveGuard?.saving}>
                  {detailCopy.config.unsavedDiscard}
                </DialogAction>
                <DialogAction
                  tone="primary"
                  disabled={!configLeaveGuard?.canSave || configLeaveGuard?.saving}
                  onClick={() => void configLeaveGuard?.save().then((saved) => saved && completePendingConfigLeave())}
                >
                  {configLeaveGuard?.saving ? detailCopy.config.saving : detailCopy.config.unsavedSave}
                </DialogAction>
              </DialogFooter>
            </Dialog>

            <footer className="launcher-mod-detail-footer">
              <div className="launcher-mod-detail-tool-group">
                {isLocal ? (
                  <button
                    type="button"
                    className="launcher-mod-detail-tool-button"
                    onClick={onOpenFolder}
                    title={launcherCopy.actions.openFolder}
                    aria-label={launcherCopy.actions.openFolder}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </button>
                ) : null}
                {isLocal ? (
                  <button
                    type="button"
                    className="launcher-mod-detail-tool-button"
                    onClick={mod?.imageUrl ? onClearCover : onSetCover}
                    title={mod?.imageUrl ? launcherCopy.actions.clearCover : launcherCopy.actions.setCover}
                    aria-label={mod?.imageUrl ? launcherCopy.actions.clearCover : launcherCopy.actions.setCover}
                  >
                    <ImageIcon className="h-4 w-4" />
                  </button>
                ) : null}
                {(remote?.modUrl ?? mod?.modUrl) ? (
                  <button
                    type="button"
                    className="launcher-mod-detail-tool-button"
                    onClick={openRemotePage}
                    title={launcherCopy.actions.openModPage}
                    aria-label={launcherCopy.actions.openModPage}
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
                    : launcherCopy.actions.openFolder}
              </button>
            </footer>
          </>
        )}
      </section>
    </aside>
  )

  return createPortal(drawer, document.body)
}
