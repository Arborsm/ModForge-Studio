import { Search } from 'lucide-react'
import { useItemsCopy } from '@locales/provider'
import { cx } from '@shared/lib/cx'
import { BrowserSourceSwitch } from '@shared/ui/BrowserSourceSwitch'
import type { BrowserSourceMode } from '@pages/workbench/workspaces/mod'
import { getContainedItemSpriteScale, type ItemBrowseCategory, type ItemTextureAssetState, type ItemWorkspaceEntry } from '../entities/item'
import { ItemSprite } from '../entities/item'
import { getWorkspaceText } from './itemWorkspaceRows'
import { EmptyNotice } from './itemWorkspaceSharedUi'
import { getPillClass } from './itemWorkspaceUiClasses'
import type { BrowseTab } from './itemWorkspaceTypes'

export function NavigationPane({
  text,
  browserSourceMode,
  onBrowserSourceModeChange,
  tabs,
  activeBrowseTab,
  onBrowseTabChange,
  itemFilter,
  onItemFilterChange,
  item,
  textureState,
  visibleCount,
  totalVisibleCount,
}: {
  text: ReturnType<typeof getWorkspaceText>
  browserSourceMode: BrowserSourceMode
  onBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  tabs: BrowseTab[]
  activeBrowseTab: ItemBrowseCategory
  onBrowseTabChange: (tab: ItemBrowseCategory) => void
  itemFilter: string
  onItemFilterChange: (value: string) => void
  item: ItemWorkspaceEntry | null
  textureState: ItemTextureAssetState | null
  visibleCount: number
  totalVisibleCount: number
}) {
  const copy = useItemsCopy()
  return (
    <aside className="panel-surface h-full">
      <div className="panel-header">
        <div>
          <p className="panel-title">{text.railTitle}</p>
          <p className="panel-subtitle">
            {visibleCount} / {totalVisibleCount}
          </p>
        </div>
      </div>
      <div className="panel-body min-h-0 overflow-auto p-4">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            className="control-input pl-9"
            value={itemFilter}
            onChange={(event) => onItemFilterChange(event.target.value)}
            placeholder={copy.browserFilterPlaceholder}
            spellCheck={false}
          />
        </div>

        <div className="mb-4">
          <BrowserSourceSwitch value={browserSourceMode} onChange={onBrowserSourceModeChange} />
        </div>

        {browserSourceMode === 'original' ? (
          <div className="space-y-2">
            {tabs.map((tab) => {
              const isActive = tab.id === activeBrowseTab
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={cx(
                    'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors',
                    getPillClass(isActive),
                  )}
                  onClick={() => onBrowseTabChange(tab.id)}
                >
                  <span
                    className={cx(
                      'inline-flex h-10 w-10 shrink-0 items-center justify-center border',
                      isActive ? 'border-white/15 bg-white/10 text-white' : 'border-[var(--border-color)] bg-[var(--bg-panel-muted)]',
                    )}
                  >
                    <tab.Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{tab.label}</span>
                    <span className={cx('block text-xs', isActive ? 'text-white/80' : 'text-[var(--text-tertiary)]')}>{tab.count}</span>
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="panel-section p-3 text-sm text-[var(--text-secondary)]">Grouped by mod. Only modified items are shown.</div>
        )}

        <section className="mt-4 border-t border-[var(--border-color)] pt-4">
          {item ? (
            <div className="panel-section p-3">
              <div className="flex items-center gap-3">
                <div className="panel-list-card flex h-14 w-14 shrink-0 items-center justify-center">
                  <ItemSprite
                    item={item}
                    textureState={textureState}
                    scale={getContainedItemSpriteScale(item, 40, 1.75)}
                    className="h-10 w-10"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{item.displayName}</p>
                  <p className="truncate text-xs text-[var(--text-secondary)]">{item.qualifiedItemId}</p>
                </div>
              </div>
            </div>
          ) : (
            <EmptyNotice message={copy.workspaceEmpty} />
          )}
        </section>
      </div>
    </aside>
  )
}
