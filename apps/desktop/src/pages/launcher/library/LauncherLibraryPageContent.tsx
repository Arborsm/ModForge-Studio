/**
 * @file Launcher mod library page content component: composes the grid, sidebar, detail panel, and dialogs.
 */
import { useEffect, useRef, useState } from 'react'
import { FolderSearch, ListFilter, PackageOpen, RefreshCw, Search, Settings } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { useLauncherMobileTopLeading } from '@shared/lib/app-state'
import { getModKey, normalizeLookupKey } from '@features/launcher/model/libraryHelpers'
import type { LauncherSettingsDraft, QueueLauncherDownloadInput } from '@features/launcher/model/types'
import { useLauncherLibrary } from '@features/launcher/model/useLauncherLibrary'
import { LauncherEmptyState } from '@features/launcher/ui/shared/LauncherEmptyState'
import { LauncherModDetailPanel } from '@features/launcher/ui/cards/LauncherModDetailPanel'
import { usePullToRefresh } from '../ui/mobile/usePullToRefresh'
import { MobilePullToRefreshIndicator } from '../ui/mobile/MobilePullToRefreshIndicator'
import { LauncherLibraryFilterSheet, type LauncherLibraryMobileFilter } from './ui/LauncherLibraryFilterSheet'
import { LauncherLibraryLaunchDock } from './ui/LauncherLibraryLaunchDock'
import { LauncherLibraryArchiveDropOverlay } from './ui/LauncherLibraryArchiveDropOverlay'
import { LauncherLibraryDndScope, VirtualizedLauncherGrid } from './ui/LauncherLibraryGrid'
import { LauncherLibraryHeader } from './ui/LauncherLibraryHeader'
import { LauncherLibraryPacksPage } from './ui/LauncherLibraryPacksPage'
import { LauncherLibraryPackSidebar } from './ui/LauncherLibraryPackSidebar'
import { LauncherLibraryDialogs } from './ui/LauncherLibraryDialogs'
import { useLauncherLibraryController } from './hooks/useLauncherLibraryController'
import { getLibraryViewOrderContainerKey } from './model/launcherLibraryDisplay'

/** Props for the launcher mod library page. */
export type LauncherLibraryPageProps = {
  settings: LauncherSettingsDraft
  launchGameDisabled: boolean
  launchGameBusy: boolean
  routeEnterSequence?: number
  /** False while the library route is hidden (cached pages stay mounted). */
  routeActive?: boolean
  /** True inside the Android WebView launcher host; surfaces a tap-friendly install entry. */
  androidHost?: boolean
  onLaunchGame: () => void
  onQueueDownload?: (input: QueueLauncherDownloadInput) => void
  onSearchDiscover?: (query: string) => void
  downloadInstallRequest?: { id: number; archivePaths: string[] } | null
  onDownloadArchivesInstalled?: (archivePaths: string[]) => void
  onNavigateToSettings?: () => void
}

type LauncherLibraryPageContentProps = LauncherLibraryPageProps & {
  library: ReturnType<typeof useLauncherLibrary>
}

/** Mod library page content component: receives controller state and renders the grid, sidebar, detail panel, and dialogs. */
export function LauncherLibraryPageContent({
  settings,
  library,
  launchGameDisabled,
  launchGameBusy,
  routeEnterSequence = 0,
  routeActive = true,
  androidHost = false,
  onLaunchGame,
  onQueueDownload,
  onSearchDiscover,
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
    routeActive,
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
    editCount,
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

  // Android host chrome state: the bottom filter sheet replaces the retired
  // toolbar round buttons; the updates/folders display filters are mobile-only.
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [packsPageOpen, setPacksPageOpen] = useState(false)
  const [updatesOnly, setUpdatesOnly] = useState(false)
  const [showFolders, setShowFolders] = useState(true)
  const mobileCopy = copy.library.mobile
  // Cached launcher routes stay mounted while hidden; close the pack page
  // as soon as the library route leaves the active page.
  useEffect(() => {
    if (routeActive === false) {
      setPacksPageOpen(false)
    }
  }, [routeActive])
  const consoleVisible = !editMode && !childModSelection && !(sortingBannerOpen && sortMode === 'custom')
  const mobileFilter: LauncherLibraryMobileFilter = updatesOnly ? 'updates' : library.enabledOnly ? 'enabled' : 'all'
  const libraryScrollHostRef = useRef<HTMLDivElement | null>(null)
  const pullToRefresh = usePullToRefresh({
    hostRef: libraryScrollHostRef,
    scrollSelector: '.launcher-library-grid-viewport',
    onRefresh: () => void refreshLibrary(),
    disabled: !androidHost || !routeActive || !consoleVisible,
  })

  const mobileTopSearch = (
    <div className="mobile-top-search" role="search">
      <Search className="mobile-top-search-icon" aria-hidden="true" />
      <input
        className="mobile-top-search-input"
        value={library.filterText}
        onChange={(event) => library.setFilterText(event.target.value)}
        placeholder={copy.fields.filterLibrary}
        aria-label={copy.fields.filterLibrary}
        spellCheck={false}
      />
      <button
        type="button"
        className="mobile-top-search-filter"
        aria-label={mobileCopy.filterAction}
        aria-expanded={filterSheetOpen}
        onClick={() => setFilterSheetOpen(true)}
      >
        <ListFilter className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  )
  useLauncherMobileTopLeading(mobileTopSearch, androidHost && routeActive && consoleVisible)

  const pickMobileFilter = (filter: LauncherLibraryMobileFilter) => {
    setUpdatesOnly(filter === 'updates')
    if (filter !== 'updates') {
      library.setEnabledOnly(filter === 'enabled')
    }
  }

  const modHasUpdate = (mod: (typeof library.mods)[number]) =>
    mod.nexusModId != null && (library.latestVersionByModId[mod.nexusModId]?.trim() ?? '') !== ''

  const gridDisplayItems =
    androidHost && (updatesOnly || !showFolders)
      ? visibleDisplayItems.filter((item) => {
          if (!showFolders && item.kind === 'folder') {
            return false
          }
          if (updatesOnly && (item.kind !== 'mod' || !modHasUpdate(item.mod))) {
            return false
          }
          return true
        })
      : visibleDisplayItems

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
            androidHost={androidHost}
            editState={{
              editMode,
              editCount,
              childModSelectionMode: Boolean(childModSelection),
              childModSelectionParentName: childModSelection?.parentMod.name ?? null,
              childModSelectionCount: childModSelection?.selectedModIds.length ?? 0,
            }}
            menus={{ drawerOpen, quickSwitchOpen, sortMenuOpen, actionsMenuOpen, sortingBannerOpen }}
            menuRefs={{ titleMenuRef, sortMenuRef, actionsMenuRef }}
            packState={{
              hiddenViewOpen,
              currentPackId: library.currentPackId,
              currentPack: library.currentPack,
              packPresets: library.packPresets,
              visibleLibraryModsCount,
              hiddenModsCount: hiddenLibraryItemCount,
            }}
            paths={{ shortModsPath, modsPath: settings.modsPath }}
            filterState={{
              filterText: library.filterText,
              enabledOnly: library.enabledOnly,
              configOnly: library.configOnly,
            }}
            sortState={{ sortOptions, sortMode }}
            launchState={{ launchGameDisabled, launchGameBusy }}
            actions={{
              toggleDrawer: () => setDrawerOpen((current) => !current),
              openPacksPage: androidHost ? () => setPacksPageOpen(true) : undefined,
              toggleQuickSwitch: () => setQuickSwitchOpen((current) => !current),
              closeFloatingMenus: () => {
                setQuickSwitchOpen(false)
                setPackActionMenuId(null)
                setSortMenuOpen(false)
                setActionsMenuOpen(false)
              },
              selectPack: (packId) => void selectPack(packId),
              selectHiddenView: () => selectHiddenView(),
              createLibraryFolder,
              refreshLibrary: () => void refreshLibrary(),
              openLibraryRoot: () => void openLibraryRoot(),
              inspectArchive: () => void inspectArchive(),
              openInstallBackupsDialog,
              launchGame: onLaunchGame,
              filterTextChange: library.setFilterText,
              enabledOnlyChange: library.setEnabledOnly,
              configOnlyChange: library.setConfigOnly,
              toggleSortMenu: () => {
                setSortMenuOpen((current) => !current)
                setActionsMenuOpen(false)
                setQuickSwitchOpen(false)
                setPackActionMenuId(null)
              },
              toggleActionsMenu: () => {
                setActionsMenuOpen((current) => !current)
                setSortMenuOpen(false)
                setQuickSwitchOpen(false)
                setPackActionMenuId(null)
              },
              closeActionsMenu: () => setActionsMenuOpen(false),
              sortModeChange: (value) => {
                changeSortMode(value)
              },
              finishSorting,
              startSortingMode,
              cancelEditMode,
              saveEditMode: () => void saveEditMode(),
              cancelChildModSelection,
              confirmChildModSelection: () => void submitChildModSelection(),
            }}
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
            {androidHost ? (
              <LauncherLibraryPacksPage
                open={packsPageOpen}
                onClose={() => setPacksPageOpen(false)}
                hiddenViewOpen={hiddenViewOpen}
                currentPackId={library.currentPackId}
                visibleLibraryModsCount={visibleLibraryModsCount}
                hiddenModsCount={hiddenLibraryItemCount}
                packPresets={library.packPresets}
                packActionMenuId={packActionMenuId}
                onCreatePack={openCreatePackDialog}
                onSelectPack={(packId) => {
                  setPacksPageOpen(false)
                  void selectPack(packId)
                }}
                onSelectHiddenView={() => {
                  setPacksPageOpen(false)
                  selectHiddenView()
                }}
                onTogglePackActionMenu={(packId) => setPackActionMenuId((current) => (current === packId ? null : packId))}
                onEditPack={startEditingPack}
                onEditPackInfo={openEditPackDialog}
                onDeletePack={openDeletePackDialog}
              />
            ) : null}
            <div className="launcher-library-content" ref={libraryScrollHostRef}>
              <div className="launcher-library-browser">
                {androidHost && routeActive ? (
                  <MobilePullToRefreshIndicator
                    state={pullToRefresh}
                    hint={mobileCopy.pullHint}
                    release={mobileCopy.pullRelease}
                    refreshing={mobileCopy.pullRefreshing}
                  />
                ) : null}
                {archiveDropActive ? <LauncherLibraryArchiveDropOverlay /> : null}
                {library.state !== 'error' && !gridDisplayItems.length ? (
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
                    gridData={{
                      items: gridDisplayItems,
                      latestVersionByModId: library.latestVersionByModId,
                      openFolderItemsById: openLibraryFolderItemsById,
                    }}
                    features={{ routeEnterSequence, routeActive, androidHost }}
                    editState={{
                      editMode,
                      sortingActive,
                      rootOrderContainerKey: getLibraryViewOrderContainerKey(viewKey),
                    }}
                    selectionState={{
                      editingSelectionIds,
                      boxSelectionIds,
                      childModSelectionMode: Boolean(childModSelection),
                      childModSelectionParentId: childModSelection?.parentMod.id ?? null,
                      childModSelectionIds: childModSelection?.selectedModIds ?? [],
                    }}
                    queries={{
                      isParentExpanded,
                      isLibraryFolderOpen,
                      isClosingLibraryFolder,
                      getFolderContextActions: directActionsForLibraryFolder,
                      getContextActions: directActionsForMod,
                    }}
                    actions={{
                      toggleSelection: toggleEditSelection,
                      boxSelectionChange: updateBoxSelection,
                      toggleChildModSelection,
                      toggleParentExpanded,
                      openModDetails,
                      openModFolder: openGridModFolder,
                      openLibraryFolder: toggleLibraryFolderOpen,
                      closeLibraryFolder,
                      toggleModEnabled: (mod) => void library.toggleEnabled(mod),
                      clearSelection: () => {
                        library.clearSelection()
                        updateBoxSelection([])
                      },
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {androidHost && routeActive ? (
            <>
              <LauncherLibraryLaunchDock
                mods={library.mods}
                launchGameDisabled={launchGameDisabled}
                launchGameBusy={launchGameBusy}
                onLaunchGame={onLaunchGame}
              />
              <LauncherLibraryFilterSheet
                open={filterSheetOpen}
                onClose={() => setFilterSheetOpen(false)}
                filter={mobileFilter}
                onFilterChange={pickMobileFilter}
                sortOptions={sortOptions}
                sortMode={sortMode}
                onSortModeChange={changeSortMode}
                showDisabled={!library.enabledOnly}
                onShowDisabledChange={(showDisabled) => {
                  library.setEnabledOnly(!showDisabled)
                  if (!showDisabled) {
                    setUpdatesOnly(false)
                  }
                }}
                showFolders={showFolders}
                onShowFoldersChange={setShowFolders}
                onInstallArchive={() => void inspectArchive()}
                onOpenLibraryRoot={() => void openLibraryRoot()}
                onRefresh={() => void refreshLibrary()}
              />
            </>
          ) : null}

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
            onSearchDependency={onSearchDiscover}
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
          archiveInstall={{
            archivePreviewState,
            archivePreviews,
            selectedArchivePreviewPath,
            archivePreviewError,
            installingArchive,
            installResult,
          }}
          backupsDialog={{
            installBackupsOpen,
            installBackupsState,
            installBackups,
            installBackupsError,
            restoringBackupId,
            modsPath: settings.modsPath,
          }}
          dialogs={{
            childModManager,
            galleryCoverDialog,
            packDialog,
            folderDialog,
            packDialogInputRef,
          }}
          actions={{
            closeArchivePreview,
            confirmArchiveInstall: () => void confirmArchiveInstall(),
            selectArchivePreviewPath: setSelectedArchivePreviewPath,
            closeInstallSummary,
            openInstallBackupsFromSummary,
            closeInstallBackupsDialog,
            restoreInstallBackup: (backupId) => void restoreInstallBackupSession(backupId),
            closeChildModManager: () => setChildModManager(null),
            removeChildMod,
            childModManagerChildrenChange: (childMods) =>
              setChildModManager((current) =>
                current
                  ? {
                      ...current,
                      childMods,
                    }
                  : current,
              ),
            closeGalleryCoverDialog,
            selectGalleryCover: (url) =>
              setGalleryCoverDialog((current) =>
                current
                  ? {
                      ...current,
                      selectedImageUrl: url,
                    }
                  : current,
              ),
            applyGalleryCover: () => void applyGalleryCover(),
            closePackDialog,
            packDialogChange: setPackDialog,
            submitPackDialog: () => void submitPackDialog(),
            closeFolderDialog,
            folderDialogChange: setFolderDialog,
            submitFolderDialog: () => void submitFolderDialog(),
          }}
        />{' '}
      </LauncherLibraryDndScope>
    </>
  )
}

/** Launcher mod library page component: initializes the library hook and delegates to the content component. */
export function LauncherLibraryPage(props: LauncherLibraryPageProps) {
  const library = useLauncherLibrary(props.settings)
  return <LauncherLibraryPageContent {...props} library={library} />
}
