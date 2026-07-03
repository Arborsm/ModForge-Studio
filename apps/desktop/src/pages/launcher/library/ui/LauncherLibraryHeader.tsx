import type { RefObject } from 'react'
import { ChevronDown, Folder, FolderArchive, FolderOpen, FolderPlus, Menu, Play, RefreshCw, Search } from 'lucide-react'
import { cx } from '@shared/lib/cx'
import { LoadingMotionRevealItem } from '@shared/ui/loading-motion'
import { normalizeLookupKey } from '@features/launcher/model/libraryHelpers'
import type { LauncherPackPreset } from '@features/launcher/model/types'
import type { LibrarySortMode } from '../model/launcherLibraryDisplay'

type LauncherLibraryHeaderLabels = {
  packTitle: string
  allPacks: string
  hiddenMods: string
  createLibraryFolder: string
  refresh: string
  openStorageFolder: string
  installArchive: string
  installBackupsTitle: string
  filterLibrary: string
  enabledOnly: string
  sortLabel: string
  editingPackLabel: string
  choosingChildModsLabel: (name: string) => string
  includedModsCount: (count: number) => string
  selectedChildModsCount: (count: number) => string
  cancelEdit: string
  saveChanges: string
  confirmChildMods: string
}

type LauncherLibraryHeaderProps = {
  editMode: boolean
  childModSelectionMode: boolean
  childModSelectionParentName: string | null
  childModSelectionCount: number
  drawerOpen: boolean
  quickSwitchOpen: boolean
  sortMenuOpen: boolean
  titleMenuRef: RefObject<HTMLDivElement | null>
  sortMenuRef: RefObject<HTMLDivElement | null>
  currentPackLabel: string
  shortModsPath: string | null
  modsPath: string | null | undefined
  hiddenViewOpen: boolean
  currentPackId: string | null
  visibleLibraryModsCount: number
  hiddenModsCount: number
  packPresets: LauncherPackPreset[]
  currentPack: LauncherPackPreset | null
  editCount: number
  filterText: string
  enabledOnly: boolean
  sortOptions: Array<{ value: LibrarySortMode; label: string }>
  sortMode: LibrarySortMode
  currentSortLabel: string
  launchGameLabel: string
  launchGameDisabled: boolean
  launchGameBusy: boolean
  labels: LauncherLibraryHeaderLabels
  onToggleDrawer: () => void
  onToggleQuickSwitch: () => void
  onCloseFloatingMenus: () => void
  onSelectPack: (packId: string | null) => void
  onSelectHiddenView: () => void
  onCreateLibraryFolder: () => void
  onRefreshLibrary: () => void
  onOpenLibraryRoot: () => void
  onInspectArchive: () => void
  onOpenInstallBackupsDialog: () => void
  onLaunchGame: () => void
  onFilterTextChange: (value: string) => void
  onEnabledOnlyChange: (enabledOnly: boolean) => void
  onToggleSortMenu: () => void
  onSortModeChange: (sortMode: LibrarySortMode) => void
  onCancelEditMode: () => void
  onSaveEditMode: () => void
  onCancelChildModSelection: () => void
  onConfirmChildModSelection: () => void
}

export function LauncherLibraryHeader({
  editMode,
  childModSelectionMode,
  childModSelectionParentName,
  childModSelectionCount,
  drawerOpen,
  quickSwitchOpen,
  sortMenuOpen,
  titleMenuRef,
  sortMenuRef,
  currentPackLabel,
  shortModsPath,
  modsPath,
  hiddenViewOpen,
  currentPackId,
  visibleLibraryModsCount,
  hiddenModsCount,
  packPresets,
  currentPack,
  editCount,
  filterText,
  enabledOnly,
  sortOptions,
  sortMode,
  currentSortLabel,
  launchGameLabel,
  launchGameDisabled,
  launchGameBusy,
  labels,
  onToggleDrawer,
  onToggleQuickSwitch,
  onCloseFloatingMenus,
  onSelectPack,
  onSelectHiddenView,
  onCreateLibraryFolder,
  onRefreshLibrary,
  onOpenLibraryRoot,
  onInspectArchive,
  onOpenInstallBackupsDialog,
  onLaunchGame,
  onFilterTextChange,
  onEnabledOnlyChange,
  onToggleSortMenu,
  onSortModeChange,
  onCancelEditMode,
  onSaveEditMode,
  onCancelChildModSelection,
  onConfirmChildModSelection,
}: LauncherLibraryHeaderProps) {
  const toggleDrawer = () => {
    onToggleDrawer()
    onCloseFloatingMenus()
  }

  if (editMode) {
    return (
      <LoadingMotionRevealItem index={0} as="section" className="launcher-library-edit-bar">
        <div className="launcher-library-edit-bar-left">
          <button
            type="button"
            className="launcher-library-icon-button launcher-library-inline-menu-button"
            aria-label={labels.packTitle}
            title={labels.packTitle}
            onClick={toggleDrawer}
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="launcher-library-edit-label">
            {labels.editingPackLabel} <strong>{currentPack?.name ?? labels.allPacks}</strong>
          </span>
        </div>
        <div className="launcher-library-edit-bar-center">
          <span className="launcher-library-edit-label">{labels.includedModsCount(editCount)}</span>
        </div>
        <div className="launcher-library-edit-bar-right">
          <button type="button" className="control-button launcher-library-secondary-action" onClick={onCancelEditMode}>
            {labels.cancelEdit}
          </button>
          <button type="button" className="control-button control-button-primary launcher-library-primary-action" onClick={onSaveEditMode}>
            {labels.saveChanges}
          </button>
        </div>
      </LoadingMotionRevealItem>
    )
  }

  if (childModSelectionMode) {
    return (
      <LoadingMotionRevealItem index={0} as="section" className="launcher-library-edit-bar">
        <div className="launcher-library-edit-bar-left">
          <button
            type="button"
            className="launcher-library-icon-button launcher-library-inline-menu-button"
            aria-label={labels.packTitle}
            title={labels.packTitle}
            onClick={toggleDrawer}
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="launcher-library-edit-label">
            {labels.choosingChildModsLabel(childModSelectionParentName ?? labels.allPacks)}
          </span>
        </div>
        <div className="launcher-library-edit-bar-center">
          <span className="launcher-library-edit-label">{labels.selectedChildModsCount(childModSelectionCount)}</span>
        </div>
        <div className="launcher-library-edit-bar-right">
          <button type="button" className="control-button launcher-library-secondary-action" onClick={onCancelChildModSelection}>
            {labels.cancelEdit}
          </button>
          <button
            type="button"
            className="control-button control-button-primary launcher-library-primary-action"
            onClick={onConfirmChildModSelection}
          >
            {labels.confirmChildMods}
          </button>
        </div>
      </LoadingMotionRevealItem>
    )
  }

  return (
    <LoadingMotionRevealItem index={0} as="section" className="launcher-library-console">
      <div className="launcher-library-console-top">
        <div className="launcher-library-console-heading">
          <button
            type="button"
            className="launcher-library-icon-button launcher-library-inline-menu-button"
            aria-label={labels.packTitle}
            title={labels.packTitle}
            onClick={toggleDrawer}
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="launcher-library-console-copy" ref={titleMenuRef}>
            <button
              type="button"
              className="launcher-library-title-button"
              onClick={() => {
                if (drawerOpen) return
                onToggleQuickSwitch()
              }}
            >
              <h1 className="launcher-library-console-title">{currentPackLabel}</h1>
              {!drawerOpen ? <ChevronDown className="h-4 w-4" /> : null}
            </button>
            {shortModsPath ? (
              <p className="launcher-library-console-subtitle" title={modsPath ?? undefined}>
                {shortModsPath}
              </p>
            ) : null}

            {quickSwitchOpen && !drawerOpen ? (
              <div className="launcher-library-title-menu">
                <button
                  type="button"
                  className={cx(
                    'launcher-library-title-menu-item',
                    !hiddenViewOpen && !currentPackId && 'launcher-library-title-menu-item-active',
                  )}
                  aria-label={labels.allPacks}
                  onClick={() => onSelectPack(null)}
                >
                  <span>{labels.allPacks}</span>
                  <span>{visibleLibraryModsCount}</span>
                </button>

                <button
                  type="button"
                  className={cx('launcher-library-title-menu-item', hiddenViewOpen && 'launcher-library-title-menu-item-active')}
                  aria-label={labels.hiddenMods}
                  onClick={onSelectHiddenView}
                >
                  <span>{labels.hiddenMods}</span>
                  <span>{hiddenModsCount}</span>
                </button>

                {packPresets.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    className={cx(
                      'launcher-library-title-menu-item',
                      !hiddenViewOpen &&
                        normalizeLookupKey(pack.id) === normalizeLookupKey(currentPackId ?? '') &&
                        'launcher-library-title-menu-item-active',
                    )}
                    aria-label={pack.name}
                    onClick={() => onSelectPack(pack.id)}
                  >
                    <span>{pack.name}</span>
                    <span>{pack.modKeys.length}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="launcher-library-console-actions">
          <button
            type="button"
            className="launcher-library-icon-button"
            onClick={onCreateLibraryFolder}
            aria-label={labels.createLibraryFolder}
            title={labels.createLibraryFolder}
          >
            <FolderPlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="launcher-library-icon-button"
            onClick={onRefreshLibrary}
            aria-label={labels.refresh}
            title={labels.refresh}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="launcher-library-icon-button"
            onClick={onOpenLibraryRoot}
            aria-label={labels.openStorageFolder}
            title={labels.openStorageFolder}
          >
            <FolderOpen className="h-4 w-4" />
          </button>
          <button type="button" className="control-button launcher-library-secondary-action" onClick={onInspectArchive}>
            <FolderArchive className="h-4 w-4" />
            <span>{labels.installArchive}</span>
          </button>
          <button type="button" className="control-button launcher-library-secondary-action" onClick={onOpenInstallBackupsDialog}>
            <Folder className="h-4 w-4" />
            <span>{labels.installBackupsTitle}</span>
          </button>
          <button
            type="button"
            className="control-button control-button-primary launcher-library-primary-action"
            disabled={launchGameDisabled}
            onClick={onLaunchGame}
          >
            <Play className="h-4 w-4" />
            <span>{launchGameBusy ? `${launchGameLabel}...` : launchGameLabel}</span>
          </button>
        </div>
      </div>

      <div className="launcher-library-console-divider" />

      <div className="launcher-library-console-bottom">
        <div className="launcher-library-console-left">
          <label className="launcher-library-search">
            <Search className="h-4 w-4" />
            <input
              value={filterText}
              onChange={(event) => onFilterTextChange(event.target.value)}
              placeholder={labels.filterLibrary}
              spellCheck={false}
            />
          </label>
        </div>

        <div className="launcher-library-console-right">
          <button
            type="button"
            className={cx('launcher-library-switch-button', enabledOnly && 'launcher-library-switch-button-active')}
            role="switch"
            aria-checked={enabledOnly}
            onClick={() => onEnabledOnlyChange(!enabledOnly)}
          >
            <span className="launcher-library-switch-track" aria-hidden="true">
              <span className="launcher-library-switch-thumb" />
            </span>
            <span>{labels.enabledOnly}</span>
          </button>

          <div className="launcher-library-popover-shell" ref={sortMenuRef}>
            <button
              type="button"
              className="launcher-library-sort-trigger"
              aria-haspopup="menu"
              aria-expanded={sortMenuOpen}
              aria-label={labels.sortLabel}
              onClick={onToggleSortMenu}
            >
              <span>{currentSortLabel}</span>
              <ChevronDown className="h-4 w-4" />
            </button>

            {sortMenuOpen ? (
              <div className="launcher-library-sort-menu" role="menu" aria-label={labels.sortLabel}>
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={sortMode === option.value}
                    className={cx('launcher-library-sort-option', sortMode === option.value && 'launcher-library-sort-option-active')}
                    onClick={() => onSortModeChange(option.value)}
                  >
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </LoadingMotionRevealItem>
  )
}
