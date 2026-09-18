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
  Settings2,
  SlidersHorizontal,
  Zap,
} from 'lucide-react'
import { cx } from '@shared/lib/helper'
import { LoadingMotionRevealItem } from '@shared/ui/loading-motion'
import { normalizeLookupKey } from '@features/launcher/model/libraryHelpers'
import { useEditorCopy } from '@locales/provider'
import type { LauncherPackPreset } from '@features/launcher/model/types'
import type { LibrarySortMode } from '../model/launcherLibraryDisplay'

type LauncherLibraryHeaderProps = {
  /** True inside the Android WebView launcher host; drag install is replaced by a visible file picker button. */
  androidHost?: boolean
  editState: {
    editMode: boolean
    editCount: number
    childModSelectionMode: boolean
    childModSelectionParentName: string | null
    childModSelectionCount: number
  }
  menus: {
    drawerOpen: boolean
    quickSwitchOpen: boolean
    sortMenuOpen: boolean
    actionsMenuOpen: boolean
    sortingBannerOpen: boolean
  }
  menuRefs: {
    titleMenuRef: RefObject<HTMLDivElement | null>
    sortMenuRef: RefObject<HTMLDivElement | null>
    actionsMenuRef: RefObject<HTMLDivElement | null>
  }
  packState: {
    hiddenViewOpen: boolean
    currentPackId: string | null
    currentPack: LauncherPackPreset | null
    packPresets: LauncherPackPreset[]
    visibleLibraryModsCount: number
    hiddenModsCount: number
  }
  paths: {
    shortModsPath: string | null
    modsPath: string | null | undefined
  }
  filterState: {
    filterText: string
    enabledOnly: boolean
    configOnly: boolean
  }
  sortState: {
    sortOptions: Array<{ value: LibrarySortMode; label: string }>
    sortMode: LibrarySortMode
  }
  launchState: {
    launchGameDisabled: boolean
    launchGameBusy: boolean
  }
  actions: {
    toggleDrawer: () => void
    /** Android host: opens the full-screen pack page instead of the desktop drawer. */
    openPacksPage?: () => void
    toggleQuickSwitch: () => void
    closeFloatingMenus: () => void
    selectPack: (packId: string | null) => void
    selectHiddenView: () => void
    createLibraryFolder: () => void
    refreshLibrary: () => void
    openLibraryRoot: () => void
    inspectArchive: () => void
    openInstallBackupsDialog: () => void
    launchGame: () => void
    filterTextChange: (value: string) => void
    enabledOnlyChange: (enabledOnly: boolean) => void
    configOnlyChange: (configOnly: boolean) => void
    toggleSortMenu: () => void
    toggleActionsMenu: () => void
    closeActionsMenu: () => void
    sortModeChange: (sortMode: LibrarySortMode) => void
    cancelEditMode: () => void
    saveEditMode: () => void
    cancelChildModSelection: () => void
    confirmChildModSelection: () => void
    finishSorting: () => void
    startSortingMode: () => void
  }
}

export function LauncherLibraryHeader({
  androidHost = false,
  editState,
  menus,
  menuRefs,
  packState,
  paths,
  filterState,
  sortState,
  launchState,
  actions,
}: LauncherLibraryHeaderProps) {
  const { editMode, editCount, childModSelectionMode, childModSelectionParentName, childModSelectionCount } = editState
  const { drawerOpen, quickSwitchOpen, sortMenuOpen, actionsMenuOpen, sortingBannerOpen } = menus
  const { titleMenuRef, sortMenuRef, actionsMenuRef } = menuRefs
  const { hiddenViewOpen, currentPackId, currentPack, packPresets, visibleLibraryModsCount, hiddenModsCount } = packState
  const { shortModsPath, modsPath } = paths
  const { filterText, enabledOnly, configOnly } = filterState
  const { sortOptions, sortMode } = sortState
  const { launchGameDisabled, launchGameBusy } = launchState
  const {
    toggleDrawer: onToggleDrawer,
    toggleQuickSwitch: onToggleQuickSwitch,
    closeFloatingMenus: onCloseFloatingMenus,
    selectPack: onSelectPack,
    selectHiddenView: onSelectHiddenView,
    createLibraryFolder: onCreateLibraryFolder,
    refreshLibrary: onRefreshLibrary,
    openLibraryRoot: onOpenLibraryRoot,
    inspectArchive: onInspectArchive,
    openInstallBackupsDialog: onOpenInstallBackupsDialog,
    launchGame: onLaunchGame,
    filterTextChange: onFilterTextChange,
    enabledOnlyChange: onEnabledOnlyChange,
    configOnlyChange: onConfigOnlyChange,
    toggleSortMenu: onToggleSortMenu,
    toggleActionsMenu: onToggleActionsMenu,
    closeActionsMenu: onCloseActionsMenu,
    sortModeChange: onSortModeChange,
    cancelEditMode: onCancelEditMode,
    saveEditMode: onSaveEditMode,
    cancelChildModSelection: onCancelChildModSelection,
    confirmChildModSelection: onConfirmChildModSelection,
    finishSorting: onFinishSorting,
    startSortingMode: onStartSortingMode,
  } = actions
  const copy = useEditorCopy().launcher
  const currentPackLabel = hiddenViewOpen ? copy.library.hiddenMods : currentPack ? currentPack.name : copy.library.allPacks
  const currentSortLabel = sortOptions.find((option) => option.value === sortMode)?.label ?? copy.library.sortByName
  const launchGameLabel = copy.actions.launchGame
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
            aria-label={copy.library.packTitle}
            title={copy.library.packTitle}
            onClick={androidHost && actions.openPacksPage ? actions.openPacksPage : toggleDrawer}
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="launcher-library-edit-label">
            {copy.library.editingPackLabel} <strong>{currentPack?.name ?? copy.library.allPacks}</strong>
          </span>
        </div>
        <div className="launcher-library-edit-bar-center">
          <span className="launcher-library-edit-label">{copy.library.includedModsCount(editCount)}</span>
        </div>
        <div className="launcher-library-edit-bar-right">
          <button type="button" className="control-button launcher-library-secondary-action" onClick={onCancelEditMode}>
            {copy.library.cancelEdit}
          </button>
          <button type="button" className="control-button control-button-primary launcher-library-primary-action" onClick={onSaveEditMode}>
            {copy.library.saveChanges}
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
            aria-label={copy.library.packTitle}
            title={copy.library.packTitle}
            onClick={androidHost && actions.openPacksPage ? actions.openPacksPage : toggleDrawer}
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="launcher-library-edit-label">
            {copy.library.choosingChildModsLabel(childModSelectionParentName ?? copy.library.allPacks)}
          </span>
        </div>
        <div className="launcher-library-edit-bar-center">
          <span className="launcher-library-edit-label">{copy.library.selectedChildModsCount(childModSelectionCount)}</span>
        </div>
        <div className="launcher-library-edit-bar-right">
          <button type="button" className="control-button launcher-library-secondary-action" onClick={onCancelChildModSelection}>
            {copy.library.cancelEdit}
          </button>
          <button
            type="button"
            className="control-button control-button-primary launcher-library-primary-action"
            onClick={onConfirmChildModSelection}
          >
            {copy.library.confirmChildMods}
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
            aria-label={copy.library.packTitle}
            title={copy.library.packTitle}
            onClick={androidHost && actions.openPacksPage ? actions.openPacksPage : toggleDrawer}
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="launcher-library-edit-label">
            <GripVertical className="h-4 w-4" aria-hidden="true" />
            <span>{copy.library.sortingLabel}</span>
            <strong>{currentPackLabel}</strong>
          </span>
        </div>
        <div className="launcher-library-edit-bar-right">
          <button type="button" className="control-button control-button-primary launcher-library-primary-action" onClick={onFinishSorting}>
            {copy.library.sortingDone}
          </button>
        </div>
      </LoadingMotionRevealItem>
    )
  }

  return (
    <LoadingMotionRevealItem index={0} as="section" className="launcher-library-console">
      <div className="launcher-library-console-top" data-guide="launcher-library-toolbar">
        <div className="launcher-library-console-heading">
          <button
            type="button"
            className="launcher-library-icon-button launcher-library-inline-menu-button"
            aria-label={copy.library.packTitle}
            title={copy.library.packTitle}
            onClick={androidHost && actions.openPacksPage ? actions.openPacksPage : toggleDrawer}
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
                  aria-label={copy.library.allPacks}
                  onClick={() => onSelectPack(null)}
                >
                  <span>{copy.library.allPacks}</span>
                  <span>{visibleLibraryModsCount}</span>
                </button>

                <button
                  type="button"
                  className={cx('launcher-library-title-menu-item', hiddenViewOpen && 'launcher-library-title-menu-item-active')}
                  aria-label={copy.library.hiddenMods}
                  onClick={onSelectHiddenView}
                >
                  <span>{copy.library.hiddenMods}</span>
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

        {/* The Android host retires the desktop toolbar round buttons: search
            moves to the top bar, sort/filter/display live in the bottom sheet,
            and launching moves to the pinned launch dock. */}
        {androidHost ? null : (
          <div className="launcher-library-console-actions">
            <div ref={searchRef} className={cx('launcher-library-search', searchExpanded && 'is-open')} role="search">
              <button
                type="button"
                className="launcher-library-search-trigger"
                aria-label={copy.fields.filterLibrary}
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
                placeholder={copy.fields.filterLibrary}
                spellCheck={false}
                aria-label={copy.fields.filterLibrary}
                tabIndex={searchExpanded ? 0 : -1}
              />
            </div>

            <span className="launcher-library-toolbar-divider" aria-hidden="true" />

            <button
              type="button"
              className={cx('launcher-library-icon-button', enabledOnly && 'launcher-library-icon-button-accent')}
              aria-pressed={enabledOnly}
              aria-label={copy.toggles.enabledOnly}
              title={copy.toggles.enabledOnly}
              onClick={() => onEnabledOnlyChange(!enabledOnly)}
            >
              {enabledOnly ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>

            <button
              type="button"
              className={cx('launcher-library-icon-button', configOnly && 'launcher-library-icon-button-accent')}
              aria-pressed={configOnly}
              aria-label={copy.toggles.configOnly}
              title={copy.toggles.configOnly}
              onClick={() => onConfigOnlyChange(!configOnly)}
            >
              <Settings2 className="h-4 w-4" />
            </button>

            <div className="launcher-library-popover-shell" ref={sortMenuRef}>
              <button
                type="button"
                className={cx('launcher-library-icon-button', sortMenuOpen && 'launcher-library-icon-button-active')}
                aria-haspopup="menu"
                aria-expanded={sortMenuOpen}
                aria-label={copy.library.sortLabel}
                title={currentSortLabel}
                onClick={onToggleSortMenu}
              >
                <ArrowDownUp className="h-4 w-4" />
              </button>

              {sortMenuOpen ? (
                <div className="launcher-library-sort-menu" role="menu" aria-label={copy.library.sortLabel}>
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
                      aria-label={copy.library.startSortingLabel}
                      title={copy.library.customSortHint}
                      onClick={onStartSortingMode}
                    >
                      <Move className="launcher-library-sort-option-icon h-4 w-4" aria-hidden="true" />
                      <span className="launcher-library-sort-option-label">{copy.library.startSortingLabel}</span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="launcher-library-icon-button"
              onClick={onCreateLibraryFolder}
              aria-label={copy.library.createLibraryFolder}
              title={copy.library.createLibraryFolder}
            >
              <FolderPlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="launcher-library-icon-button"
              onClick={onRefreshLibrary}
              aria-label={copy.actions.refresh}
              title={copy.actions.refresh}
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            {androidHost ? (
              <button
                type="button"
                className="launcher-library-icon-button"
                onClick={onInspectArchive}
                aria-label={copy.actions.installArchive}
                title={copy.actions.installArchive}
              >
                <FolderArchive className="h-4 w-4" />
              </button>
            ) : null}

            <div className="launcher-library-popover-shell launcher-library-actions-menu-shell" ref={actionsMenuRef}>
              <button
                type="button"
                className="launcher-library-icon-button"
                aria-haspopup="menu"
                aria-expanded={actionsMenuOpen}
                aria-label={copy.library.moreActions}
                title={copy.library.moreActions}
                onClick={onToggleActionsMenu}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>

              {actionsMenuOpen ? (
                <div className="launcher-library-actions-menu" role="menu" aria-label={copy.library.moreActions}>
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
                    <span>{copy.actions.openStorageFolder}</span>
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
                    <span>{copy.actions.installArchive}</span>
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
                    <span>{copy.library.installBackupsTitle}</span>
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
        )}
      </div>
    </LoadingMotionRevealItem>
  )
}
