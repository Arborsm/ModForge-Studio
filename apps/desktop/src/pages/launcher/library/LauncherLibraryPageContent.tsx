import { useEffect, useRef } from 'react'
import { FolderSearch, PackageOpen, RefreshCw, Settings } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { getModKey, normalizeLookupKey } from '@features/launcher/model/libraryHelpers'
import type { LauncherSettingsDraft, QueueLauncherDownloadInput } from '@features/launcher/model/types'
import { useLauncherLibrary } from '@features/launcher/model/useLauncherLibrary'
import { LauncherEmptyState } from '@features/launcher/ui/shared/LauncherEmptyState'
import { LauncherStateBlock } from '@features/launcher/ui/shared/LauncherStateBlock'
import { LauncherModDetailPanel } from '@features/launcher/ui/cards/LauncherModDetailPanel'
import { LauncherLibraryDndScope, VirtualizedLauncherGrid } from './ui/LauncherLibraryGrid'
import { LauncherLibraryHeader } from './ui/LauncherLibraryHeader'
import { LauncherLibraryPackSidebar } from './ui/LauncherLibraryPackSidebar'
import { LauncherLibraryDialogs } from './ui/LauncherLibraryDialogs'
import { useLauncherLibraryController } from './hooks/useLauncherLibraryController'
import { getLibraryViewOrderContainerKey } from './model/launcherLibraryDisplay'

export type LauncherLibraryPageProps = {
  settings: LauncherSettingsDraft
  launchGameLabel: string
  launchGameDisabled: boolean
  launchGameBusy: boolean
  routeEnterSequence?: number
  onLaunchGame: () => void
  onQueueDownload?: (input: QueueLauncherDownloadInput) => void
  downloadInstallRequest?: { id: number; archivePaths: string[] } | null
  onDownloadArchivesInstalled?: (archivePaths: string[]) => void
  onNavigateToSettings?: () => void
}

type LauncherLibraryPageContentProps = LauncherLibraryPageProps & {
  library: ReturnType<typeof useLauncherLibrary>
}

export function LauncherLibraryPageContent({
  settings,
  library,
  launchGameLabel,
  launchGameDisabled,
  launchGameBusy,
  routeEnterSequence = 0,
  onLaunchGame,
  onQueueDownload,
  downloadInstallRequest,
  onDownloadArchivesInstalled,
  onNavigateToSettings,
}: LauncherLibraryPageContentProps) {
  const editorCopy = useEditorCopy()
  const copy = editorCopy.launcher
  const { refresh } = library

  const controller = useLauncherLibraryController({
    settings,
    library,
    refresh,
    copy,
    onArchiveInstallSuccess: onDownloadArchivesInstalled,
  })
  const { viewModel, refs, dialogState, dragState, shellState, actions: controllerActions } = controller
  const {
    packLookup,
    viewKey,
    hiddenLibraryItemCount,
    visibleLibraryModsCount,
    detailMod,
    visibleDisplayItems,
    openLibraryFolderItemsById,
    shortModsPath,
    sortOptions,
    currentSortLabel,
    editCount,
    currentPackLabel,
    supportedArchiveFormatsLabel,
  } = viewModel
  const { titleMenuRef, drawerPanelRef, sortMenuRef, actionsMenuRef, packDialogInputRef } = refs
  const {
    archivePreviewState,
    archivePreviews,
    selectedArchivePreviewPath,
    archivePreviewError,
    installingArchive,
    installResult,
    installBackupsOpen,
    installBackupsState,
    installBackups,
    installBackupsError,
    restoringBackupId,
    packDialog,
    folderDialog,
    galleryCoverDialog,
    childModManager,
  } = dialogState
  const { editMode, editingSelectionIds, boxSelectionIds, childModSelection, archiveDropActive } = dragState
  const {
    actionError,
    sortMode,
    sortingBannerOpen,
    sortingActive,
    sortMenuOpen,
    actionsMenuOpen,
    drawerOpen,
    quickSwitchOpen,
    packActionMenuId,
    hiddenViewOpen,
  } = shellState
  const {
    setSelectedArchivePreviewPath,
    changeSortMode,
    finishSorting,
    startSortingMode,
    setSortMenuOpen,
    setActionsMenuOpen,
    setDetailModId,
    setDrawerOpen,
    setQuickSwitchOpen,
    setPackActionMenuId,
    setPackDialog,
    setFolderDialog,
    setGalleryCoverDialog,
    setChildModManager,
    closeArchivePreview,
    closeInstallSummary,
    closeInstallBackupsDialog,
    openInstallBackupsDialog,
    openInstallBackupsFromSummary,
    openArchivePreviewForPaths,
    refreshLibrary,
    inspectArchive,
    confirmArchiveInstall,
    restoreInstallBackupSession,
    openLibraryRoot,
    openModFolder,
    setModCover,
    clearModCover,
    closeGalleryCoverDialog,
    applyGalleryCover,
    openModDetails,
    toggleEditSelection,
    updateBoxSelection,
    selectPack,
    selectHiddenView,
    resolveDraggedModIds,
    createLibraryFolder,
    removeDraggedChildModsFromParent,
    removeDraggedModsFromLibraryFolders,
    moveDraggedFolderToFolder,
    toggleParentExpanded,
    removeChildMod,
    toggleChildModSelection,
    cancelChildModSelection,
    submitChildModSelection,
    cancelEditMode,
    saveEditMode,
    openCreatePackDialog,
    openEditPackDialog,
    openDeletePackDialog,
    closePackDialog,
    closeFolderDialog,
    submitPackDialog,
    submitFolderDialog,
    isParentExpanded,
    openGridModFolder,
    assignDraggedModsToLibraryFolderFromDnd,
    addDraggedModsToPack,
    reorderRootItems,
    reorderFolderItems,
    reorderChildModItems,
    directActionsForMod,
    directActionsForLibraryFolder,
    startEditingPack,
    isLibraryFolderOpen,
    isClosingLibraryFolder,
    toggleLibraryFolderOpen,
    closeLibraryFolder,
  } = controllerActions
  const handledDownloadInstallRequestIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!downloadInstallRequest || handledDownloadInstallRequestIdRef.current === downloadInstallRequest.id) {
      return
    }

    handledDownloadInstallRequestIdRef.current = downloadInstallRequest.id
    void openArchivePreviewForPaths(downloadInstallRequest.archivePaths)
  }, [downloadInstallRequest, openArchivePreviewForPaths])

  return (
    <>
      <LauncherLibraryDndScope
        sortingActive={sortingActive}
        resolveDraggedModIds={resolveDraggedModIds}
        onAddModsToPack={addDraggedModsToPack}
        onAssignModsToLibraryFolder={assignDraggedModsToLibraryFolderFromDnd}
        onRemoveChildModsFromParent={removeDraggedChildModsFromParent}
        onRemoveModsFromLibraryFolders={removeDraggedModsFromLibraryFolders}
        onReleaseModsFromLibraryFolder={removeDraggedModsFromLibraryFolders}
        onMoveFolderToFolder={moveDraggedFolderToFolder}
        onReorderRoot={reorderRootItems}
        onReorderFolder={reorderFolderItems}
        onReorderChildMod={reorderChildModItems}
      >
        <section className="launcher-library-page">
          <LauncherLibraryHeader
            key={`launcher-library-header:${routeEnterSequence}`}
            editMode={editMode}
            childModSelectionMode={Boolean(childModSelection)}
            childModSelectionParentName={childModSelection?.parentMod.name ?? null}
            childModSelectionCount={childModSelection?.selectedModIds.length ?? 0}
            drawerOpen={drawerOpen}
            quickSwitchOpen={quickSwitchOpen}
            sortMenuOpen={sortMenuOpen}
            actionsMenuOpen={actionsMenuOpen}
            sortingBannerOpen={sortingBannerOpen}
            titleMenuRef={titleMenuRef}
            sortMenuRef={sortMenuRef}
            actionsMenuRef={actionsMenuRef}
            currentPackLabel={currentPackLabel}
            shortModsPath={shortModsPath}
            modsPath={settings.modsPath}
            hiddenViewOpen={hiddenViewOpen}
            currentPackId={library.currentPackId}
            visibleLibraryModsCount={visibleLibraryModsCount}
            hiddenModsCount={hiddenLibraryItemCount}
            packPresets={library.packPresets}
            currentPack={library.currentPack}
            editCount={editCount}
            filterText={library.filterText}
            enabledOnly={library.enabledOnly}
            sortOptions={sortOptions}
            sortMode={sortMode}
            currentSortLabel={currentSortLabel}
            launchGameLabel={launchGameLabel}
            launchGameDisabled={launchGameDisabled}
            launchGameBusy={launchGameBusy}
            onToggleDrawer={() => setDrawerOpen((current) => !current)}
            onToggleQuickSwitch={() => setQuickSwitchOpen((current) => !current)}
            onCloseFloatingMenus={() => {
              setQuickSwitchOpen(false)
              setPackActionMenuId(null)
              setSortMenuOpen(false)
              setActionsMenuOpen(false)
            }}
            onSelectPack={(packId) => void selectPack(packId)}
            onSelectHiddenView={() => selectHiddenView()}
            onCreateLibraryFolder={createLibraryFolder}
            onRefreshLibrary={() => void refreshLibrary()}
            onOpenLibraryRoot={() => void openLibraryRoot()}
            onInspectArchive={() => void inspectArchive()}
            onOpenInstallBackupsDialog={openInstallBackupsDialog}
            onLaunchGame={onLaunchGame}
            onFilterTextChange={library.setFilterText}
            onEnabledOnlyChange={library.setEnabledOnly}
            onToggleSortMenu={() => {
              setSortMenuOpen((current) => !current)
              setActionsMenuOpen(false)
              setQuickSwitchOpen(false)
              setPackActionMenuId(null)
            }}
            onToggleActionsMenu={() => {
              setActionsMenuOpen((current) => !current)
              setSortMenuOpen(false)
              setQuickSwitchOpen(false)
              setPackActionMenuId(null)
            }}
            onCloseActionsMenu={() => setActionsMenuOpen(false)}
            onSortModeChange={(value) => {
              changeSortMode(value)
            }}
            onFinishSorting={finishSorting}
            onStartSortingMode={startSortingMode}
            onCancelEditMode={cancelEditMode}
            onSaveEditMode={() => void saveEditMode()}
            onCancelChildModSelection={cancelChildModSelection}
            onConfirmChildModSelection={() => void submitChildModSelection()}
          />
          <div
            className={cx(
              'launcher-library-shell',
              drawerOpen ? 'launcher-library-shell-sidebar-open' : 'launcher-library-shell-sidebar-collapsed',
            )}
          >
            <LauncherLibraryPackSidebar
              drawerOpen={drawerOpen}
              hiddenViewOpen={hiddenViewOpen}
              currentPackId={library.currentPackId}
              visibleLibraryModsCount={visibleLibraryModsCount}
              hiddenModsCount={hiddenLibraryItemCount}
              packPresets={library.packPresets}
              packActionMenuId={packActionMenuId}
              drawerPanelRef={drawerPanelRef}
              onCreatePack={openCreatePackDialog}
              onSelectPack={(packId) => void selectPack(packId)}
              onSelectHiddenView={() => selectHiddenView()}
              onTogglePackActionMenu={(packId) => setPackActionMenuId((current) => (current === packId ? null : packId))}
              onEditPack={startEditingPack}
              onEditPackInfo={openEditPackDialog}
              onDeletePack={openDeletePackDialog}
            />{' '}
            <div className="launcher-library-content">
              <div className="launcher-library-browser">
                {archiveDropActive ? (
                  <div className="launcher-library-drop-overlay" role="status" aria-live="polite">
                    <div className="launcher-library-drop-overlay-card">
                      <strong>{copy.library.dragDropInstallTitle}</strong>
                      <span>{copy.library.dragDropInstallSubtitle(supportedArchiveFormatsLabel)}</span>
                    </div>
                  </div>
                ) : null}
                {actionError ? <LauncherStateBlock title={currentPackLabel} detail={actionError} tone="warning" /> : null}
                {library.state === 'error' ? (
                  <LauncherStateBlock title={currentPackLabel} detail={library.error ?? copy.library.empty} tone="warning" />
                ) : null}
                {library.state !== 'error' && !visibleDisplayItems.length ? (
                  <div className="launcher-library-empty-host">
                    {!settings.modsPath ? (
                      <LauncherEmptyState
                        eyebrow={copy.library.title}
                        title={copy.library.missingModsPathTitle}
                        detail={copy.library.missingModsPathDetail}
                        illustrationAccent={<Settings className="h-4 w-4" />}
                        primaryAction={
                          onNavigateToSettings ? (
                            <button type="button" className="control-button control-button-primary" onClick={onNavigateToSettings}>
                              <Settings className="h-4 w-4" />
                              <span>{copy.library.missingModsPathAction}</span>
                            </button>
                          ) : null
                        }
                      />
                    ) : !library.mods.length ? (
                      <LauncherEmptyState
                        eyebrow={copy.library.title}
                        title={copy.library.emptyTitle}
                        detail={copy.library.emptyDetail}
                        illustrationAccent={<PackageOpen className="h-4 w-4" />}
                        primaryAction={
                          onNavigateToSettings ? (
                            <button type="button" className="control-button control-button-primary" onClick={onNavigateToSettings}>
                              <Settings className="h-4 w-4" />
                              <span>{copy.library.missingModsPathAction}</span>
                            </button>
                          ) : null
                        }
                        secondaryAction={
                          <button type="button" className="control-button" onClick={() => void refreshLibrary()}>
                            <RefreshCw className="h-4 w-4" />
                            <span>{copy.library.emptyRefreshAction}</span>
                          </button>
                        }
                      />
                    ) : (
                      <LauncherEmptyState
                        eyebrow={copy.library.title}
                        title={copy.library.filteredEmptyTitle}
                        detail={copy.library.filteredEmptyDetail}
                        illustrationAccent={<FolderSearch className="h-4 w-4" />}
                      />
                    )}
                  </div>
                ) : (
                  <VirtualizedLauncherGrid
                    items={visibleDisplayItems}
                    latestVersionByModId={library.latestVersionByModId}
                    openFolderItemsById={openLibraryFolderItemsById}
                    routeEnterSequence={routeEnterSequence}
                    editMode={editMode}
                    sortingActive={sortingActive}
                    rootOrderContainerKey={getLibraryViewOrderContainerKey(viewKey)}
                    editingSelectionIds={editingSelectionIds}
                    boxSelectionIds={boxSelectionIds}
                    childModSelectionMode={Boolean(childModSelection)}
                    childModSelectionParentId={childModSelection?.parentMod.id ?? null}
                    childModSelectionIds={childModSelection?.selectedModIds ?? []}
                    noneLabel={editorCopy.common.none}
                    childCountLabel={copy.library.childModsCount}
                    expandLabel={copy.library.expandChildMods}
                    collapseLabel={copy.library.collapseChildMods}
                    folderCountLabel={copy.library.libraryFolderCount}
                    folderEmptyLabel={copy.library.libraryFolderEmpty}
                    openFolderLabel={copy.library.openLibraryFolder}
                    missingDependenciesLabel={copy.library.missingDependenciesCount}
                    missingDependenciesBadgeLabel={copy.library.modDetail.missing}
                    closeFolderLabel={copy.library.closeLibraryFolder}
                    onToggleSelection={toggleEditSelection}
                    onBoxSelectionChange={updateBoxSelection}
                    onToggleChildModSelection={toggleChildModSelection}
                    onToggleParentExpanded={toggleParentExpanded}
                    isParentExpanded={isParentExpanded}
                    onOpenModDetails={openModDetails}
                    onOpenModFolder={openGridModFolder}
                    isLibraryFolderOpen={isLibraryFolderOpen}
                    isClosingLibraryFolder={isClosingLibraryFolder}
                    onOpenLibraryFolder={toggleLibraryFolderOpen}
                    onCloseLibraryFolder={closeLibraryFolder}
                    getFolderContextActions={directActionsForLibraryFolder}
                    getContextActions={directActionsForMod}
                    onClearSelection={() => {
                      library.clearSelection()
                      updateBoxSelection([])
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          <LauncherModDetailPanel
            open={Boolean(detailMod)}
            onClose={() => setDetailModId(null)}
            mod={detailMod}
            libraryMods={library.mods}
            onToggleEnabled={() => {
              if (detailMod) {
                void library.toggleEnabled(detailMod)
              }
            }}
            onQueueDownload={onQueueDownload}
            remoteFilesDeferred={Boolean(onQueueDownload)}
            onOpenFolder={() => {
              if (detailMod) {
                void openModFolder(detailMod)
              }
            }}
            onSetCover={() => {
              if (detailMod) {
                void setModCover(detailMod)
              }
            }}
            onClearCover={() => {
              if (detailMod) {
                void clearModCover(detailMod)
              }
            }}
            packName={
              detailMod
                ? (packLookup
                    .get(normalizeLookupKey(getModKey(detailMod)))
                    ?.find((pack) => normalizeLookupKey(pack.id) === normalizeLookupKey(library.currentPackId ?? ''))?.name ?? null)
                : null
            }
          />
        </section>
        <LauncherLibraryDialogs
          archivePreviewState={archivePreviewState}
          archivePreviews={archivePreviews}
          selectedArchivePreviewPath={selectedArchivePreviewPath}
          archivePreviewError={archivePreviewError}
          installingArchive={installingArchive}
          installResult={installResult}
          installBackupsOpen={installBackupsOpen}
          installBackupsState={installBackupsState}
          installBackups={installBackups}
          installBackupsError={installBackupsError}
          restoringBackupId={restoringBackupId}
          modsPath={settings.modsPath}
          childModManager={childModManager}
          galleryCoverDialog={galleryCoverDialog}
          packDialog={packDialog}
          folderDialog={folderDialog}
          packDialogInputRef={packDialogInputRef}
          onCloseArchivePreview={closeArchivePreview}
          onConfirmArchiveInstall={() => void confirmArchiveInstall()}
          onSelectArchivePreviewPath={setSelectedArchivePreviewPath}
          onCloseInstallSummary={closeInstallSummary}
          onOpenInstallBackupsFromSummary={openInstallBackupsFromSummary}
          onCloseInstallBackupsDialog={closeInstallBackupsDialog}
          onRestoreInstallBackup={(backupId) => void restoreInstallBackupSession(backupId)}
          onCloseChildModManager={() => setChildModManager(null)}
          onRemoveChildMod={removeChildMod}
          onChildModManagerChildrenChange={(childMods) =>
            setChildModManager((current) =>
              current
                ? {
                    ...current,
                    childMods,
                  }
                : current,
            )
          }
          onCloseGalleryCoverDialog={closeGalleryCoverDialog}
          onSelectGalleryCover={(url) =>
            setGalleryCoverDialog((current) =>
              current
                ? {
                    ...current,
                    selectedImageUrl: url,
                  }
                : current,
            )
          }
          onApplyGalleryCover={() => void applyGalleryCover()}
          onClosePackDialog={closePackDialog}
          onPackDialogChange={setPackDialog}
          onSubmitPackDialog={() => void submitPackDialog()}
          onCloseFolderDialog={closeFolderDialog}
          onFolderDialogChange={setFolderDialog}
          onSubmitFolderDialog={() => void submitFolderDialog()}
        />{' '}
      </LauncherLibraryDndScope>
    </>
  )
}

export function LauncherLibraryPage(props: LauncherLibraryPageProps) {
  const library = useLauncherLibrary(props.settings)
  return <LauncherLibraryPageContent {...props} library={library} />
}
