import { Search } from 'lucide-react'
import { useItemsCopy } from '@locales/localeContext'
import { cx } from '@shared/lib/cx'
import { getContainedItemSpriteScale, type ItemTextureAssetState, type ItemWorkspaceEntry } from '../../../workspaces/item'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { ItemSprite } from '../../../workspaces/item'
import { getLoadingMotionChildRevealProps } from '@shared/ui/loading-motion'

type ItemBrowserPanelProps = {
  items: ItemWorkspaceEntry[]
  filteredItems: ItemWorkspaceEntry[]
  activeItemId: string | null
  itemFilter: string
  textureStatesByAssetName: Record<string, ItemTextureAssetState>
  onItemFilterChange: (value: string) => void
  onSelectItem: (itemKey: string) => void
}

function getCountByKind(items: ItemWorkspaceEntry[], kind: ItemWorkspaceEntry['kind']) {
  return items.filter((item) => item.kind === kind).length
}

export function ItemBrowserPanel({
  items,
  filteredItems,
  activeItemId,
  itemFilter,
  textureStatesByAssetName,
  onItemFilterChange,
  onSelectItem,
}: ItemBrowserPanelProps) {
  const copy = useItemsCopy()
  const matchedKeys = new Set(filteredItems.map((item) => item.key))
  const stats = [
    { label: copy.statsAllLabel, value: items.length },
    {
      label: copy.statsCraftingLabel,
      value: items.filter((item) => item.recipesProduced.some((recipe) => recipe.kind === 'crafting')).length,
    },
    {
      label: copy.statsCookingLabel,
      value: items.filter((item) => item.recipesProduced.some((recipe) => recipe.kind === 'cooking')).length,
    },
    { label: copy.statsFishLabel, value: items.filter((item) => item.fishData).length },
    { label: copy.statsCropLabel, value: items.filter((item) => item.cropData || item.cropHarvests.length).length },
  ]

  const grouped = (['object', 'big-craftable', 'weapon', 'tool', 'shirt', 'pants', 'trinket', 'hat', 'boots', 'furniture'] as const)
    .map((kind) => ({
      kind,
      label: copy.kindLabels[kind],
      items: items.filter((item) => item.kind === kind && (!itemFilter || matchedKeys.has(item.key))),
    }))
    .filter((group) => group.items.length)

  return (
    <PanelFrame
      hideHeader
      title={copy.browserTitle}
      subtitle={copy.browserSubtitle}
      className="h-full"
      headerAction={<span className="dock-chip">{filteredItems.length}</span>}
    >
      <div className="flex h-full flex-col gap-3 p-3">
        <div className="grid grid-cols-2 gap-2">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              {...getLoadingMotionChildRevealProps({
                index,
                className:
                  'rounded-[20px] border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_95%,white_5%)] px-3 py-3 text-left',
              })}
            >
              <p className="text-[10px] tracking-[0.14em] text-[var(--text-secondary)] uppercase">{stat.label}</p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-[var(--text-primary)]">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            className="control-input pl-9"
            value={itemFilter}
            onChange={(event) => onItemFilterChange(event.target.value)}
            placeholder={copy.browserFilterPlaceholder}
            spellCheck={false}
          />
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto pr-1">
          {items.length ? (
            grouped.length ? (
              grouped.map((group, groupIndex) => (
                <section key={group.kind} {...getLoadingMotionChildRevealProps({ index: groupIndex + stats.length })}>
                  <div className="mb-2 flex items-center justify-between gap-3 px-1">
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.18em] text-[var(--text-secondary)] uppercase">{group.label}</p>
                      <p className="text-[11px] text-[var(--text-tertiary)]">
                        {group.items.length} / {getCountByKind(items, group.kind)}
                      </p>
                    </div>
                    <span className="dock-chip">{group.items.length}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {group.items.map((item, itemIndex) => {
                      const isActive = item.key === activeItemId
                      const textureState = item.textureAssetName ? (textureStatesByAssetName[item.textureAssetName] ?? null) : null
                      const revealProps = getLoadingMotionChildRevealProps({
                        index: groupIndex + stats.length + itemIndex + 1,
                        className: cx(
                          'flex aspect-square flex-col items-center justify-center rounded-[20px] border p-2 text-center transition-all',
                          isActive
                            ? 'border-[color-mix(in_srgb,var(--accent)_44%,transparent)] bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] shadow-[0_16px_30px_rgba(79,70,229,0.12)]'
                            : 'border-[var(--border-color)] bg-[var(--bg-panel)] hover:bg-[var(--bg-panel-muted)] hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]',
                        ),
                      })

                      return (
                        <button key={item.key} type="button" {...revealProps} onClick={() => onSelectItem(item.key)}>
                          <ItemSprite
                            item={item}
                            textureState={textureState}
                            scale={getContainedItemSpriteScale(item, 40, 1.55)}
                            className="h-10 w-10 rounded-2xl"
                          />
                          <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-[var(--text-secondary)]">{item.displayName}</p>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border-color)] px-4 py-5 text-sm text-[var(--text-secondary)]">
                {copy.browserFilteredEmpty}
              </div>
            )
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--border-color)] px-4 py-5 text-sm text-[var(--text-secondary)]">
              {copy.browserUnloadedEmpty}
            </div>
          )}
        </div>
      </div>
    </PanelFrame>
  )
}
