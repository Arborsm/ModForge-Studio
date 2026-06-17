import { useEffect, useRef } from 'react'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/cx'
import { getModKey, normalizeLookupKey } from '@features/launcher/model/libraryHelpers'
import type { LauncherSettingsDraft, QueueLauncherDownloadInput } from '@features/launcher/model/types'
import { useLauncherLibrary } from '@features/launcher/model/useLauncherLibrary'
import { LauncherStateBlock } from '@features/launcher/ui/shared/LauncherStateBlock'
import { LauncherModDetailPanel } from '@features/launcher/ui/cards/LauncherModDetailPanel'
import { LauncherLibraryDndScope, VirtualizedLauncherGrid } from './ui/LauncherLibraryGrid'
import { LauncherLibraryHeader } from './ui/LauncherLibraryHeader'
import { LauncherLibraryPackSidebar } from './ui/LauncherLibraryPackSidebar'
import { LauncherLibraryDialogs } from './ui/LauncherLibraryDialogs'
import { useLauncherLibraryController } from './hooks/useLauncherLibraryController'

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
    hiddenMods,
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
  const { titleMenuRef, drawerPanelRef, sortMenuRef, packDialogInputRef } = refs
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
  const { actionError, sortMode, sortMenuOpen, drawerOpen, quickSwitchOpen, packActionMenuId, hiddenViewOpen } = shellState
  const {
    setSelectedArchivePreviewPath,
    setSortMode,
    setSortMenuOpen,
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
    openRenamePackDialog,
    openDeletePackDialog,
    closePackDialog,
    closeFolderDialog,
    submitPackDialog,
    submitFolderDialog,
    isParentExpanded,
    openGridModFolder,
    assignDraggedModsToLibraryFolderFromDnd,
    addDraggedModsToPack,
    directActionsForMod,
    directActionsForLibraryFolder,
    startEditingPack,
    isLibraryFolderOpen,
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
        resolveDraggedModIds={resolveDraggedModIds}
        onAddModsToPack={addDraggedModsToPack}
        onAssignModsToLibraryFolder={assignDraggedModsToLibraryFolderFromDnd}
        onRemoveChildModsFromParent={removeDraggedChildModsFromParent}
        onRemoveModsFromLibraryFolders={removeDraggedModsFromLibraryFolders}
        onReleaseModsFromLibraryFolder={removeDraggedModsFromLibraryFolders}
        onMoveFolderToFolder={moveDraggedFolderToFolder}
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
            titleMenuRef={titleMenuRef}
            sortMenuRef={sortMenuRef}
            currentPackLabel={currentPackLabel}
            shortModsPath={shortModsPath}
            modsPath={settings.modsPath}
            hiddenViewOpen={hiddenViewOpen}
            currentPackId={library.currentPackId}
            visibleLibraryModsCount={visibleLibraryModsCount}
            hiddenModsCount={hiddenMods.length}
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
            labels={{
              packTitle: copy.library.packTitle,
              allPacks: copy.library.allPacks,
              hiddenMods: copy.library.hiddenMods,
              createLibraryFolder: copy.library.createLibraryFolder,
              refresh: copy.actions.refresh,
              openStorageFolder: copy.actions.openStorageFolder,
              installArchive: copy.actions.installArchive,
              installBackupsTitle: copy.library.installBackupsTitle,
              filterLibrary: copy.fields.filterLibrary,
              enabledOnly: copy.toggles.enabledOnly,
              sortLabel: copy.library.sortLabel,
              editingPackLabel: copy.library.editingPackLabel,
              choosingChildModsLabel: copy.library.choosingChildModsLabel,
              includedModsCount: copy.library.includedModsCount,
              selectedChildModsCount: copy.library.selectedChildModsCount,
              cancelEdit: copy.library.cancelEdit,
              saveChanges: copy.library.saveChanges,
              confirmChildMods: copy.library.confirmChildMods,
            }}
            onToggleDrawer={() => setDrawerOpen((current) => !current)}
            onToggleQuickSwitch={() => setQuickSwitchOpen((current) => !current)}
            onCloseFloatingMenus={() => {
              setQuickSwitchOpen(false)
              setPackActionMenuId(null)
              setSortMenuOpen(false)
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
              setQuickSwitchOpen(false)
              setPackActionMenuId(null)
            }}
            onSortModeChange={(value) => {
              setSortMode(value)
              setSortMenuOpen(false)
            }}
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
              hiddenModsCount={hiddenMods.length}
              packPresets={library.packPresets}
              packActionMenuId={packActionMenuId}
              drawerPanelRef={drawerPanelRef}
              labels={{
                packTitle: copy.library.packTitle,
                allPacks: copy.library.allPacks,
                hiddenMods: copy.library.hiddenMods,
                createPack: copy.actions.createPack,
                manageCurrentPack: copy.library.manageCurrentPack,
                editCurrentPack: copy.library.editCurrentPack,
                renameCurrentPack: copy.library.renameCurrentPack,
                deleteCurrentPack: copy.library.deleteCurrentPack,
              }}
              onCreatePack={openCreatePackDialog}
              onSelectPack={(packId) => void selectPack(packId)}
              onSelectHiddenView={() => selectHiddenView()}
              onTogglePackActionMenu={(packId) => setPackActionMenuId((current) => (current === packId ? null : packId))}
              onEditPack={startEditingPack}
              onRenamePack={openRenamePackDialog}
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
                  <LauncherStateBlock
                    title={
                      !settings.modsPath
                        ? copy.states.missingModsPath
                        : !library.mods.length
                          ? copy.library.empty
                          : copy.library.filteredEmpty
                    }
                    detail={copy.library.subtitle}
                  />
                ) : (
                  <VirtualizedLauncherGrid
                    items={visibleDisplayItems}
                    latestVersionByModId={library.latestVersionByModId}
                    openFolderItemsById={openLibraryFolderItemsById}
                    routeEnterSequence={routeEnterSequence}
                    editMode={editMode}
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
                    closeFolderLabel={copy.library.closeLibraryFolder}
                    onToggleSelection={toggleEditSelection}
                    onBoxSelectionChange={updateBoxSelection}
                    onToggleChildModSelection={toggleChildModSelection}
                    onToggleParentExpanded={toggleParentExpanded}
                    isParentExpanded={isParentExpanded}
                    onOpenModDetails={openModDetails}
                    onOpenModFolder={openGridModFolder}
                    isLibraryFolderOpen={isLibraryFolderOpen}
                    onOpenLibraryFolder={toggleLibraryFolderOpen}
                    onCloseLibraryFolder={closeLibraryFolder}
                    getFolderContextActions={directActionsForLibraryFolder}
                    getContextActions={directActionsForMod}
                  />
                )}
              </div>
            </div>
          </div>

          <LauncherModDetailPanel
            open={Boolean(detailMod)}
            onClose={() => setDetailModId(null)}
            closeLabel={copy.actions.closeDialog}
            title={copy.library.detailsTitle}
            subtitle={copy.library.detailsSubtitle}
            empty={copy.library.selectionEmpty}
            mod={detailMod}
            labels={{
              currentVersion: copy.fields.currentVersion,
              uniqueId: copy.fields.uniqueId,
              path: copy.fields.path,
              dependencies: copy.fields.dependencies,
              updateKeys: copy.fields.updateKeys,
              pack: copy.library.packLabel,
            }}
            noSummary={copy.states.noSummary}
            onToggleEnabled={() => {
              if (detailMod) {
                void library.toggleEnabled(detailMod)
              }
            }}
            enableLabel={copy.actions.enable}
            disableLabel={copy.actions.disable}
            enabledStateLabel={copy.overview.enabledMods}
            disabledStateLabel={copy.overview.disabledMods}
            openFolderLabel={copy.actions.openFolder}
            setCoverLabel={copy.actions.setCover}
            clearCoverLabel={copy.actions.clearCover}
            openModPageLabel={copy.actions.openModPage}
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
          labels={{
            createPack: copy.actions.createPack,
            renameCurrentPack: copy.library.renameCurrentPack,
            deleteCurrentPack: copy.library.deleteCurrentPack,
            renameCurrentPackPrompt: copy.library.renameCurrentPackPrompt,
            deleteCurrentPackConfirm: copy.library.deleteCurrentPackConfirm,
            newPackPlaceholder: copy.library.newPackPlaceholder,
            cancelEdit: copy.library.cancelEdit,
            saveChanges: copy.library.saveChanges,
            galleryCoverTitle: copy.library.galleryCoverTitle,
            galleryCoverSubtitle: copy.library.galleryCoverSubtitle,
            galleryCoverImageLabel: copy.library.galleryCoverImageLabel,
            setCover: copy.actions.setCover,
            manageChildMods: copy.library.manageChildMods,
            parentModLabel: copy.library.parentModLabel,
            removeFromParent: copy.library.removeFromParent,
            closeDialog: copy.actions.closeDialog,
            renameLibraryFolder: copy.library.renameLibraryFolder,
            renameLibraryFolderPrompt: copy.library.renameLibraryFolderPrompt,
            newLibraryFolderName: copy.library.newLibraryFolderName,
          }}
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
