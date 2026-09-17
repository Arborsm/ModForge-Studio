/**
 * @file Library filter bottom sheet (Android host): filter / sort / display
 * chips plus an actions group, replacing the retired desktop toolbar round
 * buttons. State maps onto the existing library filter and sort controls.
 */
import { FolderArchive, FolderOpen, RefreshCw } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { LibrarySortMode } from '../model/launcherLibraryDisplay'
import { MobileSheet } from '../../ui/mobile/MobileSheet'

export type LauncherLibraryMobileFilter = 'all' | 'enabled' | 'updates'

type LauncherLibraryFilterSheetProps = {
  open: boolean
  onClose: () => void
  filter: LauncherLibraryMobileFilter
  onFilterChange: (filter: LauncherLibraryMobileFilter) => void
  sortOptions: ReadonlyArray<{ value: LibrarySortMode; label: string }>
  sortMode: LibrarySortMode
  onSortModeChange: (sortMode: LibrarySortMode) => void
  /** Display switch: show disabled mods (inverse of the enabled-only filter). */
  showDisabled: boolean
  onShowDisabledChange: (showDisabled: boolean) => void
  showFolders: boolean
  onShowFoldersChange: (showFolders: boolean) => void
  onInstallArchive: () => void
  onOpenLibraryRoot: () => void
  onRefresh: () => void
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" className={cx('mobile-chip', pressed && 'is-active')} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  )
}

/** Bottom sheet with the library's filter, sort, and display controls. */
export function LauncherLibraryFilterSheet({
  open,
  onClose,
  filter,
  onFilterChange,
  sortOptions,
  sortMode,
  onSortModeChange,
  showDisabled,
  onShowDisabledChange,
  showFolders,
  onShowFoldersChange,
  onInstallArchive,
  onOpenLibraryRoot,
  onRefresh,
}: LauncherLibraryFilterSheetProps) {
  const copy = useEditorCopy().launcher
  const mobileCopy = copy.library.mobile

  const pickFilter = (nextFilter: LauncherLibraryMobileFilter) => {
    onFilterChange(nextFilter)
    if (nextFilter === 'enabled') {
      onShowDisabledChange(false)
    } else if (nextFilter === 'all') {
      onShowDisabledChange(true)
    }
  }

  return (
    <MobileSheet open={open} onClose={onClose} title={mobileCopy.filterSheetTitle}>
      <div className="mobile-sheet-group">
        <p className="mobile-sheet-group-label">{mobileCopy.filterGroupLabel}</p>
        <div className="mobile-chip-row">
          <Chip pressed={filter === 'all'} onClick={() => pickFilter('all')}>
            {mobileCopy.filterAll}
          </Chip>
          <Chip pressed={filter === 'enabled'} onClick={() => pickFilter('enabled')}>
            {mobileCopy.filterEnabled}
          </Chip>
          <Chip pressed={filter === 'updates'} onClick={() => pickFilter('updates')}>
            {mobileCopy.filterUpdates}
          </Chip>
        </div>
      </div>

      <div className="mobile-sheet-group">
        <p className="mobile-sheet-group-label">{mobileCopy.sortGroupLabel}</p>
        <div className="mobile-chip-row">
          {sortOptions.map((option) => (
            <Chip key={option.value} pressed={sortMode === option.value} onClick={() => onSortModeChange(option.value)}>
              {option.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mobile-sheet-group">
        <p className="mobile-sheet-group-label">{mobileCopy.displayGroupLabel}</p>
        <div className="mobile-chip-row">
          <Chip pressed={showDisabled} onClick={() => onShowDisabledChange(!showDisabled)}>
            {mobileCopy.showDisabled}
          </Chip>
          <Chip pressed={showFolders} onClick={() => onShowFoldersChange(!showFolders)}>
            {mobileCopy.showFolders}
          </Chip>
        </div>
      </div>

      <div className="mobile-sheet-group">
        <p className="mobile-sheet-group-label">{mobileCopy.actionsGroupLabel}</p>
        <div className="mobile-chip-row">
          <button
            type="button"
            className="mobile-chip mobile-chip-action"
            onClick={() => {
              onClose()
              onInstallArchive()
            }}
          >
            <FolderArchive className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.actions.installArchive}
          </button>
          <button
            type="button"
            className="mobile-chip mobile-chip-action"
            onClick={() => {
              onClose()
              onOpenLibraryRoot()
            }}
          >
            <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.actions.openStorageFolder}
          </button>
          <button
            type="button"
            className="mobile-chip mobile-chip-action"
            onClick={() => {
              onClose()
              onRefresh()
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.actions.refresh}
          </button>
        </div>
      </div>

      <button type="button" className="mobile-sheet-apply" onClick={onClose}>
        {mobileCopy.apply}
      </button>
    </MobileSheet>
  )
}
