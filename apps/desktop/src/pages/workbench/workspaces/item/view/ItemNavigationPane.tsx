import { Search } from 'lucide-react'
import { useItemsCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { BrowserSourceMode } from '@pages/workbench/workspaces/mod'
import { getContainedItemSpriteFrame, type ItemBrowseCategory, type ItemTextureAssetState, type ItemWorkspaceEntry } from '@entities/item'
import { ItemSprite } from '@entities/item'
import { getWorkspaceText } from './itemWorkspaceRows'
import { EmptyNotice } from './itemWorkspaceSharedUi'
import type { BrowseTab } from './itemWorkspaceTypes'

function SourceSwitch({
  value,
  onChange,
  text,
}: {
  value: BrowserSourceMode
  onChange: (mode: BrowserSourceMode) => void
  text: ReturnType<typeof getWorkspaceText>
}) {
  return (
    <div className="flex gap-px rounded-lg border border-(--border-color) bg-(--bg-panel-muted) p-px">
      {(
        [
          ['original', text.sourceOriginalLabel],
          ['mod', text.sourceModLabel],
        ] as const
      ).map(([mode, label]) => {
        const isActive = value === mode
        return (
          <button
            key={mode}
            type="button"
            className={cx(
              'flex-1 rounded-[0.4375rem] py-1.5 text-xs font-semibold transition-colors',
              isActive
                ? 'bg-(--bg-panel) text-(--text-primary) shadow-[inset_0_-1.5px_0_0_var(--accent)]'
                : 'text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-hover)',
            )}
            onClick={() => onChange(mode)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

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
  visibleCount: _visibleCount,
  totalVisibleCount: _totalVisibleCount,
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
  const currentSpriteFrame = item ? getContainedItemSpriteFrame(item, 56, 2, 4) : null

  return (
    <aside className="item-workspace-pane h-full">
      <div className="panel-body min-h-0 overflow-auto p-4">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--text-tertiary)" />
          <input
            className="control-input bg-(--bg-panel-muted) pl-9"
            value={itemFilter}
            onChange={(event) => onItemFilterChange(event.target.value)}
            placeholder={copy.browserFilterPlaceholder}
            spellCheck={false}
          />
        </div>

        <div className="mb-4">
          <SourceSwitch value={browserSourceMode} onChange={onBrowserSourceModeChange} text={text} />
        </div>

        {browserSourceMode === 'original' ? (
          <div className="flex flex-col gap-1">
            {tabs.map((tab) => {
              const isActive = tab.id === activeBrowseTab
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={cx(
                    'flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                    isActive
                      ? 'bg-(--accent-soft) text-(--accent)'
                      : 'text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)',
                  )}
                  onClick={() => onBrowseTabChange(tab.id)}
                >
                  <span
                    className={cx(
                      'flex h-[1.625rem] w-[1.625rem] shrink-0 items-center justify-center rounded-md',
                      isActive ? 'bg-[color-mix(in_srgb,var(--accent)_16%,var(--bg-panel-muted))]' : 'bg-(--bg-panel-muted)',
                    )}
                  >
                    <tab.Icon className="h-4 w-4 shrink-0" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{tab.label}</span>
                  <span className={cx('text-xs font-semibold tabular-nums', isActive ? 'text-(--accent)/70' : 'text-(--text-tertiary)')}>
                    {tab.count}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-(--border-color) bg-(--bg-panel-muted) p-3 text-sm text-(--text-secondary)">
            Grouped by mod. Only modified items are shown.
          </div>
        )}

        <section className="mt-4 border-t border-(--border-color)/65 pt-4">
          <p className="panel-section-title mb-3">{text.selectionTitle}</p>
          {item ? (
            <div className="flex items-center gap-3.5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl">
                {currentSpriteFrame ? (
                  <ItemSprite
                    item={item}
                    textureState={textureState}
                    scale={currentSpriteFrame.scale}
                    fallbackClassName="text-2xl"
                    className="bg-transparent"
                    style={{ width: `${currentSpriteFrame.width}px`, height: `${currentSpriteFrame.height}px` }}
                  />
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-(--text-primary)">{item.displayName}</p>
                <p className="truncate font-mono text-xs text-(--text-tertiary)">{item.qualifiedItemId}</p>
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
