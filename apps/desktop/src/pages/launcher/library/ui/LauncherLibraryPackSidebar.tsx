import type { RefObject } from 'react'
import { Folder, FolderArchive, LayoutGrid, MoreHorizontal, Plus } from 'lucide-react'
import { cx } from '@shared/lib/cx'
import { normalizeLookupKey } from '@features/launcher/model/libraryHelpers'
import type { LauncherPackPreset } from '@features/launcher/model/types'

type LauncherLibraryPackSidebarLabels = {
  packTitle: string
  allPacks: string
  hiddenMods: string
  createPack: string
  manageCurrentPack: string
  editCurrentPack: string
  renameCurrentPack: string
  deleteCurrentPack: string
}

type LauncherLibraryPackSidebarProps = {
  drawerOpen: boolean
  hiddenViewOpen: boolean
  currentPackId: string | null
  visibleLibraryModsCount: number
  hiddenModsCount: number
  packPresets: LauncherPackPreset[]
  packActionMenuId: string | null
  drawerPanelRef: RefObject<HTMLDivElement | null>
  labels: LauncherLibraryPackSidebarLabels
  onCreatePack: () => void
  onSelectPack: (packId: string | null) => void
  onSelectHiddenView: () => void
  onTogglePackActionMenu: (packId: string) => void
  onEditPack: (pack: LauncherPackPreset, isCurrentPack: boolean) => void
  onRenamePack: (pack: LauncherPackPreset) => void
  onDeletePack: (pack: LauncherPackPreset) => void
}

export function LauncherLibraryPackSidebar({
  drawerOpen,
  hiddenViewOpen,
  currentPackId,
  visibleLibraryModsCount,
  hiddenModsCount,
  packPresets,
  packActionMenuId,
  drawerPanelRef,
  labels,
  onCreatePack,
  onSelectPack,
  onSelectHiddenView,
  onTogglePackActionMenu,
  onEditPack,
  onRenamePack,
  onDeletePack,
}: LauncherLibraryPackSidebarProps) {
  return (
    <aside
      className={cx('launcher-library-sidebar', drawerOpen ? 'launcher-library-sidebar-open' : 'launcher-library-sidebar-collapsed')}
      ref={drawerPanelRef}
    >
      <div className={cx('launcher-library-sidebar-inner', !drawerOpen && 'launcher-library-sidebar-inner-collapsed')}>
        <div className="launcher-library-sidebar-header">
          <div
            className={cx('launcher-library-sidebar-header-meta', !drawerOpen && 'launcher-library-sidebar-header-meta-hidden')}
            aria-hidden={!drawerOpen}
          >
            <p className="launcher-library-pack-drawer-title">{labels.packTitle}</p>
            <button type="button" className="launcher-library-drawer-add-button" onClick={onCreatePack}>
              <Plus className="h-4 w-4" />
              <span>{labels.createPack}</span>
            </button>
          </div>
        </div>

        <div
          className={cx('launcher-library-sidebar-body', !drawerOpen && 'launcher-library-sidebar-body-hidden')}
          aria-hidden={!drawerOpen}
        >
          <div className="launcher-library-pack-drawer-divider" />

          <div className="launcher-library-pack-drawer-list">
            <div
              className={cx(
                'launcher-library-pack-row-shell',
                'launcher-library-pack-row-shell-static',
                !currentPackId && 'launcher-library-pack-row-shell-active',
              )}
            >
              <button
                type="button"
                className={cx('launcher-library-pack-row', !hiddenViewOpen && !currentPackId && 'launcher-library-pack-row-active')}
                aria-label={labels.allPacks}
                onClick={() => onSelectPack(null)}
              >
                <span className="launcher-library-pack-row-main">
                  <LayoutGrid className="launcher-library-pack-row-icon h-4 w-4" />
                  <span className="launcher-library-pack-row-name">{labels.allPacks}</span>
                </span>
                <span className="launcher-library-pack-row-trailing">
                  <span className="launcher-library-pack-row-count-badge">{visibleLibraryModsCount}</span>
                </span>
              </button>
            </div>

            <div
              className={cx(
                'launcher-library-pack-row-shell',
                'launcher-library-pack-row-shell-static',
                hiddenViewOpen && 'launcher-library-pack-row-shell-active',
              )}
            >
              <button
                type="button"
                className={cx('launcher-library-pack-row', hiddenViewOpen && 'launcher-library-pack-row-active')}
                aria-label={labels.hiddenMods}
                onClick={onSelectHiddenView}
              >
                <span className="launcher-library-pack-row-main">
                  <FolderArchive className="launcher-library-pack-row-icon h-4 w-4" />
                  <span className="launcher-library-pack-row-name">{labels.hiddenMods}</span>
                </span>
                <span className="launcher-library-pack-row-trailing">
                  <span className="launcher-library-pack-row-count-badge">{hiddenModsCount}</span>
                </span>
              </button>
            </div>

            <div className="launcher-library-pack-row-separator" />

            {packPresets.map((pack) => {
              const isCurrentPack = !hiddenViewOpen && normalizeLookupKey(pack.id) === normalizeLookupKey(currentPackId ?? '')
              const isActionMenuOpen = packActionMenuId === pack.id

              return (
                <div
                  key={pack.id}
                  className={cx('launcher-library-pack-row-shell', isCurrentPack && 'launcher-library-pack-row-shell-active')}
                  data-launcher-pack-drop-id={pack.id}
                >
                  <button
                    type="button"
                    className={cx('launcher-library-pack-row', isCurrentPack && 'launcher-library-pack-row-active')}
                    aria-label={pack.name}
                    onClick={() => onSelectPack(pack.id)}
                  >
                    <span className="launcher-library-pack-row-main">
                      <Folder className="launcher-library-pack-row-icon h-4 w-4" />
                      <span className="launcher-library-pack-row-name">{pack.name}</span>
                    </span>
                    <span className="launcher-library-pack-row-trailing">
                      <span className="launcher-library-pack-row-count-badge">{pack.modKeys.length}</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className="launcher-library-pack-row-menu-button"
                    aria-label={`${labels.manageCurrentPack} ${pack.name}`}
                    aria-expanded={isActionMenuOpen}
                    onClick={() => onTogglePackActionMenu(pack.id)}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>

                  {isActionMenuOpen ? (
                    <div className="launcher-library-pack-row-menu">
                      <button type="button" className="launcher-library-pack-row-menu-item" onClick={() => onEditPack(pack, isCurrentPack)}>
                        {labels.editCurrentPack}
                      </button>
                      <button type="button" className="launcher-library-pack-row-menu-item" onClick={() => onRenamePack(pack)}>
                        {labels.renameCurrentPack}
                      </button>
                      <button type="button" className="launcher-library-pack-row-menu-item" onClick={() => onDeletePack(pack)}>
                        {labels.deleteCurrentPack}
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </aside>
  )
}
