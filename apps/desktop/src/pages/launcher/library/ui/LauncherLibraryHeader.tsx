import { useEffect, useId, useRef, useState } from 'react'
import type { RefObject } from 'react'
import {
  ArrowDownAZ,
  ArrowDownUp,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Folder,
  FolderArchive,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Menu,
  MoreHorizontal,
  Move,
  Play,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Zap,
} from 'lucide-react'
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
  sortingLabel: string
  sortingDragHint: string
  sortingDone: string
  startSortingLabel: string
  customSortHint: string
  moreActions: string
}

type LauncherLibraryHeaderProps = {
  editMode: boolean
  childModSelectionMode: boolean
  childModSelectionParentName: string | null
  childModSelectionCount: number
  drawerOpen: boolean
  quickSwitchOpen: boolean
  sortMenuOpen: boolean
  actionsMenuOpen: boolean
  sortingBannerOpen: boolean
  titleMenuRef: RefObject<HTMLDivElement | null>
  sortMenuRef: RefObject<HTMLDivElement | null>
  actionsMenuRef: RefObject<HTMLDivElement | null>
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
  onToggleActionsMenu: () => void
  onCloseActionsMenu: () => void
  onSortModeChange: (sortMode: LibrarySortMode) => void
  onCancelEditMode: () => void
  onSaveEditMode: () => void
  onCancelChildModSelection: () => void
  onConfirmChildModSelection: () => void
  onFinishSorting: () => void
  onStartSortingMode: () => void
}

export function LauncherLibraryHeader({
  editMode,
  childModSelectionMode,
  childModSelectionParentName,
  childModSelectionCount,
  drawerOpen,
  quickSwitchOpen,
  sortMenuOpen,
  actionsMenuOpen,
  sortingBannerOpen,
  titleMenuRef,
  sortMenuRef,
  actionsMenuRef,
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
  onToggleActionsMenu,
  onCloseActionsMenu,
  onSortModeChange,
  onCancelEditMode,
  onSaveEditMode,
  onCancelChildModSelection,
  onConfirmChildModSelection,
  onFinishSorting,
  onStartSortingMode,
}: LauncherLibraryHeaderProps) {
  const searchRef = useRef<HTMLDivElement | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputId = useId()
  const hasFilter = filterText.trim().length > 0
  // A filter value always keeps the field expanded; collapse only when empty.
  const searchExpanded = searchOpen || hasFilter

  // Click outside an empty field collapses it. A filled field stays open so the
  // active filter stays legible.
  useEffect(() => {
    if (!searchOpen) return
    function handlePointerDown(event: PointerEvent) {
      if (!searchRef.current?.contains(event.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [searchOpen])

  const toggleDrawer = () => {
    onToggleDrawer()
    onCloseFloatingMenus()
  }

  const sortOptionIcon: Record<LibrarySortMode, typeof ArrowDownUp> = {
    name: ArrowDownAZ,
    'enabled-first': Zap,
    custom: SlidersHorizontal,
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

  if (sortMode === 'custom' && sortingBannerOpen) {
    return (
      <LoadingMotionRevealItem index={0} as="section" className="launcher-library-edit-bar launcher-library-edit-bar--sorting">
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
            <GripVertical className="h-4 w-4" aria-hidden="true" />
            <span>{labels.sortingLabel}</span>
            <strong>{currentPackLabel}</strong>
          </span>
        </div>
        <div className="launcher-library-edit-bar-right">
          <button type="button" className="control-button control-button-primary launcher-library-primary-action" onClick={onFinishSorting}>
            {labels.sortingDone}
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
          <div ref={searchRef} className={cx('launcher-library-search', searchExpanded && 'is-open')} role="search">
            <button
              type="button"
              className="launcher-library-search-trigger"
              aria-label={labels.filterLibrary}
              aria-expanded={searchExpanded}
              aria-controls={searchInputId}
              tabIndex={searchExpanded ? -1 : 0}
              onClick={() => {
                if (!searchExpanded) {
                  setSearchOpen(true)
                }
              }}
            >
              <Search className="h-4 w-4" />
            </button>
            <input
              id={searchInputId}
              value={filterText}
              onChange={(event) => onFilterTextChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && !hasFilter) {
                  event.preventDefault()
                  setSearchOpen(false)
                }
              }}
              placeholder={labels.filterLibrary}
              spellCheck={false}
              aria-label={labels.filterLibrary}
              tabIndex={searchExpanded ? 0 : -1}
            />
          </div>

          <span className="launcher-library-toolbar-divider" aria-hidden="true" />

          <button
            type="button"
            className={cx('launcher-library-icon-button', enabledOnly && 'launcher-library-icon-button-accent')}
            aria-pressed={enabledOnly}
            aria-label={labels.enabledOnly}
            title={labels.enabledOnly}
            onClick={() => onEnabledOnlyChange(!enabledOnly)}
          >
            {enabledOnly ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>

          <div className="launcher-library-popover-shell" ref={sortMenuRef}>
            <button
              type="button"
              className={cx('launcher-library-icon-button', sortMenuOpen && 'launcher-library-icon-button-active')}
              aria-haspopup="menu"
              aria-expanded={sortMenuOpen}
              aria-label={labels.sortLabel}
              title={currentSortLabel}
              onClick={onToggleSortMenu}
            >
              <ArrowDownUp className="h-4 w-4" />
            </button>

            {sortMenuOpen ? (
              <div className="launcher-library-sort-menu" role="menu" aria-label={labels.sortLabel}>
                {sortOptions.map((option) => {
                  const OptionIcon = sortOptionIcon[option.value]
                  const selected = sortMode === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      className={cx('launcher-library-sort-option', selected && 'launcher-library-sort-option-active')}
                      onClick={() => onSortModeChange(option.value)}
                    >
                      <OptionIcon className="launcher-library-sort-option-icon h-4 w-4" aria-hidden="true" />
                      <span className="launcher-library-sort-option-label">{option.label}</span>
                      {selected ? <Check className="launcher-library-sort-option-check h-4 w-4" aria-hidden="true" /> : null}
                    </button>
                  )
                })}

                {!sortingBannerOpen ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="launcher-library-sort-option launcher-library-sort-reorder-action"
                    aria-label={labels.startSortingLabel}
                    title={labels.customSortHint}
                    onClick={onStartSortingMode}
                  >
                    <Move className="launcher-library-sort-option-icon h-4 w-4" aria-hidden="true" />
                    <span className="launcher-library-sort-option-label">{labels.startSortingLabel}</span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

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

          <div className="launcher-library-popover-shell launcher-library-actions-menu-shell" ref={actionsMenuRef}>
            <button
              type="button"
              className="launcher-library-icon-button"
              aria-haspopup="menu"
              aria-expanded={actionsMenuOpen}
              aria-label={labels.moreActions}
              title={labels.moreActions}
              onClick={onToggleActionsMenu}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            {actionsMenuOpen ? (
              <div className="launcher-library-actions-menu" role="menu" aria-label={labels.moreActions}>
                <button
                  type="button"
                  role="menuitem"
                  className="launcher-library-actions-menu-item"
                  onClick={() => {
                    onCloseActionsMenu()
                    onOpenLibraryRoot()
                  }}
                >
                  <FolderOpen className="h-4 w-4" />
                  <span>{labels.openStorageFolder}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="launcher-library-actions-menu-item"
                  onClick={() => {
                    onCloseActionsMenu()
                    onInspectArchive()
                  }}
                >
                  <FolderArchive className="h-4 w-4" />
                  <span>{labels.installArchive}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="launcher-library-actions-menu-item"
                  onClick={() => {
                    onCloseActionsMenu()
                    onOpenInstallBackupsDialog()
                  }}
                >
                  <Folder className="h-4 w-4" />
                  <span>{labels.installBackupsTitle}</span>
                </button>
              </div>
            ) : null}
          </div>

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
    </LoadingMotionRevealItem>
  )
}
