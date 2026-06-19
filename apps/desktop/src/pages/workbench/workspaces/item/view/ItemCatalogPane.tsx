import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useMemo, useRef, type WheelEvent } from 'react'
import { useItemsCopy } from '@locales/provider'
import { cx } from '@shared/lib/cx'
import type { BrowserSourceMode, ModBrowserEntry, ModBrowserGroup } from '@pages/workbench/workspaces/mod'
import { getContainedItemSpriteScale, type ItemTextureAssetState, type ItemWorkspaceEntry } from '../entities/item'
import { ItemSprite } from '../entities/item'
import { CATALOG_GRID_GAP_PX, buildPaginationTokens, useCatalogGridMetrics } from './itemCatalogPagination'
import { getWorkspaceText } from './itemWorkspaceRows'
import { EmptyNotice, ItemTooltip } from './itemWorkspaceSharedUi'
import type { DetailTab } from './itemWorkspaceTypes'

export function CatalogPane({
  text,
  browserSourceMode,
  modItemGroups,
  items,
  totalItems,
  currentPage,
  pageCount,
  itemsPerPage,
  activeItemId,
  activeModItemSelectionId,
  textureStatesByAssetName,
  onSelectItem,
  onSelectModItem,
  hoveredItemId,
  onHoverItem,
  onPageChange,
  onItemsPerPageChange,
}: {
  text: ReturnType<typeof getWorkspaceText>
  browserSourceMode: BrowserSourceMode
  modItemGroups: ModBrowserGroup<ItemWorkspaceEntry>[]
  items: ItemWorkspaceEntry[]
  totalItems: number
  currentPage: number
  pageCount: number
  itemsPerPage: number
  activeItemId: string | null
  activeModItemSelectionId: string | null
  textureStatesByAssetName: Record<string, ItemTextureAssetState>
  onSelectItem: (itemKey: string, tab?: DetailTab) => void
  onSelectModItem: (entry: ModBrowserEntry<ItemWorkspaceEntry>, tab?: DetailTab) => void
  hoveredItemId: string | null
  onHoverItem: (itemKey: string | null) => void
  onPageChange: (page: number) => void
  onItemsPerPageChange: (itemsPerPage: number) => void
}) {
  const copy = useItemsCopy()
  const hoveredItem = hoveredItemId ? (items.find((entry) => entry.key === hoveredItemId) ?? null) : null
  const paginationTokens = useMemo(() => buildPaginationTokens(currentPage, pageCount), [currentPage, pageCount])
  const { viewportRef, columns, rows } = useCatalogGridMetrics(itemsPerPage, onItemsPerPageChange)
  const wheelAccumulatorRef = useRef(0)
  const lastWheelFlipRef = useRef(0)
  const rangeStart = totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0
  const rangeEnd = totalItems > 0 ? Math.min(currentPage * itemsPerPage, totalItems) : 0
  const emptySlotCount = Math.max(0, itemsPerPage - items.length)

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLElement>) => {
      if (browserSourceMode === 'mod' || pageCount <= 1 || event.ctrlKey || Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
        return
      }

      event.preventDefault()
      const now = performance.now()
      if (now - lastWheelFlipRef.current < 180) {
        return
      }

      if (wheelAccumulatorRef.current !== 0 && Math.sign(wheelAccumulatorRef.current) !== Math.sign(event.deltaY)) {
        wheelAccumulatorRef.current = 0
      }

      wheelAccumulatorRef.current += event.deltaY
      if (Math.abs(wheelAccumulatorRef.current) < 56) {
        return
      }

      const nextPage = Math.max(1, Math.min(pageCount, currentPage + (wheelAccumulatorRef.current > 0 ? 1 : -1)))
      wheelAccumulatorRef.current = 0
      if (nextPage !== currentPage) {
        lastWheelFlipRef.current = now
        onPageChange(nextPage)
      }
    },
    [browserSourceMode, currentPage, onPageChange, pageCount],
  )

  return (
    <section className="panel-surface relative h-full" onWheel={handleWheel}>
      <div className="panel-header">
        <div className="min-w-0">
          <p className="panel-title">{text.catalogTitle}</p>
          <p className="panel-subtitle">
            {browserSourceMode === 'mod'
              ? `${modItemGroups.reduce((total, group) => total + group.items.length, 0)} ${text.catalogItemsLabel}`
              : `${totalItems} ${text.catalogItemsLabel} / ${itemsPerPage} ${text.catalogItemsPerPageLabel}`}
          </p>
        </div>
        {browserSourceMode === 'original' ? (
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent)_12%,var(--bg-panel))] px-3 py-1 text-[11px] font-semibold text-(--text-primary)">
              {columns} x {rows} {text.catalogGridLabel}
            </span>
          </div>
        ) : null}
      </div>
      <div className="panel-body flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        {browserSourceMode === 'mod' ? (
          modItemGroups.length ? (
            <div className="min-h-0 flex-1 space-y-4 overflow-auto">
              {modItemGroups.map((group) => (
                <section key={group.modPath} className="panel-section rounded-3xl p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-(--text-primary)">{group.modName}</p>
                      <p className="truncate text-xs text-(--text-secondary)">{group.items.length} modified items</p>
                    </div>
                    <span className="dock-chip shrink-0">{group.items.length}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {group.items.map((modEntry) => {
                      const { value: entry, targets } = modEntry
                      const textureState = entry.textureAssetName ? (textureStatesByAssetName[entry.textureAssetName] ?? null) : null
                      const isActive = modEntry.selectionId === activeModItemSelectionId

                      return (
                        <button
                          key={`${group.modId}:${entry.key}`}
                          type="button"
                          aria-pressed={isActive}
                          className={cx(
                            'panel-list-card flex items-center gap-3 px-3 py-3 text-left transition-colors',
                            isActive && 'border-[color-mix(in_srgb,var(--accent)_40%,var(--border-color))] bg-(--bg-active)',
                          )}
                          onClick={() => onSelectModItem(modEntry)}
                          onMouseEnter={() => onHoverItem(entry.key)}
                          onMouseLeave={() => onHoverItem(null)}
                        >
                          <div className="panel-list-card flex h-12 w-12 shrink-0 items-center justify-center px-2 py-2">
                            <ItemSprite
                              item={entry}
                              textureState={textureState}
                              scale={getContainedItemSpriteScale(entry, 32, 2)}
                              className="h-8 w-8"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-(--text-primary)">{entry.displayName}</p>
                            <p className="truncate text-xs text-(--text-secondary)">{targets[0] ?? entry.qualifiedItemId}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <EmptyNotice message="No modded items match the current filter." />
          )
        ) : items.length ? (
          <div ref={viewportRef} className="min-h-0 flex-1 overflow-hidden">
            <div
              className="grid h-full"
              style={{
                gap: `${CATALOG_GRID_GAP_PX}px`,
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              }}
            >
              {items.map((entry) => {
                const textureState = entry.textureAssetName ? (textureStatesByAssetName[entry.textureAssetName] ?? null) : null
                const isActive = entry.key === activeItemId

                return (
                  <button
                    key={entry.key}
                    type="button"
                    aria-pressed={isActive}
                    className={cx(
                      'group flex h-full min-h-0 flex-col items-center justify-center rounded-[22px] border px-2 py-3 text-center transition-all duration-200',
                      isActive
                        ? 'border-[color-mix(in_srgb,var(--accent)_44%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_18%,transparent),color-mix(in_srgb,var(--accent)_10%,var(--bg-panel)))] shadow-[0_18px_36px_color-mix(in_srgb,var(--accent)_16%,transparent)]'
                        : 'border-(--border-color) bg-[linear-gradient(180deg,var(--bg-panel),color-mix(in_srgb,var(--bg-panel-muted)_68%,transparent))] hover:-translate-y-0.5 hover:bg-(--bg-panel-muted) hover:shadow-[0_14px_28px_rgba(15,23,42,0.10)]',
                    )}
                    onClick={() => onSelectItem(entry.key, 'info')}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      onSelectItem(entry.key, 'relations')
                    }}
                    onMouseEnter={() => onHoverItem(entry.key)}
                    onMouseLeave={() => onHoverItem(null)}
                    onFocus={() => onHoverItem(entry.key)}
                    onBlur={() => onHoverItem(null)}
                    aria-label={`${entry.displayName} ${entry.qualifiedItemId}`}
                  >
                    <span className="mb-2 inline-flex rounded-full border border-(--border-color) bg-(--bg-app) px-2 py-0.5 text-[9px] font-semibold tracking-[0.14em] text-(--text-tertiary) uppercase">
                      {copy.kindLabels[entry.kind]}
                    </span>
                    <ItemSprite
                      item={entry}
                      textureState={textureState}
                      scale={getContainedItemSpriteScale(entry, 40, 1.55)}
                      className="h-10 w-10 shrink-0"
                    />
                    <span className="mt-2 line-clamp-2 text-[11px] leading-4 font-semibold text-(--text-primary)">{entry.displayName}</span>
                    <span className="mt-1 line-clamp-1 text-[10px] leading-4 text-(--text-tertiary)">{entry.qualifiedItemId}</span>
                  </button>
                )
              })}

              {Array.from({ length: emptySlotCount }, (_, index) => (
                <div
                  key={`empty-slot:${currentPage}:${index}`}
                  aria-hidden="true"
                  className="rounded-[22px] border border-dashed border-[color-mix(in_srgb,var(--border-color)_85%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-panel-muted)_55%,transparent),transparent)]"
                />
              ))}
            </div>
          </div>
        ) : (
          <EmptyNotice message={copy.browserFilteredEmpty} />
        )}

        {browserSourceMode === 'original' && totalItems > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-(--border-color) bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-panel)_90%,transparent),color-mix(in_srgb,var(--bg-panel-muted)_82%,transparent))] px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-(--bg-app) px-3 py-1 text-xs font-semibold text-(--text-primary)">
                {rangeStart}-{rangeEnd}
              </span>
              <span className="text-xs text-(--text-secondary)">
                {text.catalogPageLabel} {currentPage} / {pageCount}
              </span>
              <span className="text-[11px] text-(--text-tertiary)">{text.catalogWheelHint}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-full border border-(--border-color) bg-(--bg-app) px-3 text-xs font-semibold text-(--text-secondary) transition-colors hover:bg-(--bg-panel) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                title={text.previousPageLabel}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{text.previousPageLabel}</span>
              </button>
              <div className="flex items-center gap-1 rounded-full border border-(--border-color) bg-(--bg-app) p-1">
                {paginationTokens.map((token) => {
                  if (token.type === 'ellipsis') {
                    return (
                      <span
                        key={token.key}
                        className="inline-flex min-w-8 items-center justify-center px-1 text-xs font-semibold text-(--text-tertiary)"
                      >
                        ...
                      </span>
                    )
                  }

                  return (
                    <button
                      key={`page:${token.value}`}
                      type="button"
                      className={cx(
                        'min-w-9 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                        token.value === currentPage
                          ? 'bg-(--accent) text-white shadow-[0_10px_22px_color-mix(in_srgb,var(--accent)_24%,transparent)]'
                          : 'text-(--text-secondary) hover:bg-(--bg-panel) hover:text-(--text-primary)',
                      )}
                      onClick={() => onPageChange(token.value)}
                    >
                      {token.value}
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-full border border-(--border-color) bg-(--bg-app) px-3 text-xs font-semibold text-(--text-secondary) transition-colors hover:bg-(--bg-panel) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
                disabled={currentPage >= pageCount}
                title={text.nextPageLabel}
              >
                <span className="hidden sm:inline">{text.nextPageLabel}</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {browserSourceMode === 'original' ? <ItemTooltip item={hoveredItem} /> : null}
    </section>
  )
}
