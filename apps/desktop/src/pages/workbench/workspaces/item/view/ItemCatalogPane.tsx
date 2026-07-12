import { ChevronLeft, ChevronRight, Grid2x2, List } from 'lucide-react'
import { useCallback, useMemo, useRef, type WheelEvent } from 'react'
import { useItemsCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { BrowserSourceMode, ModBrowserEntry, ModBrowserGroup } from '@pages/workbench/workspaces/mod'
import type { CatalogViewMode } from './useItemWorkspaceUi'
import { getContainedItemSpriteFrame, type ItemTextureAssetState, type ItemWorkspaceEntry } from '../entities/item'
import { ItemSprite } from '../entities/item'
import { buildPaginationTokens, useCatalogPageSize } from './itemCatalogPagination'
import { formatPrice, getWorkspaceText } from './itemWorkspaceRows'
import { EmptyNotice } from './itemWorkspaceSharedUi'
import type { DetailTab } from './itemWorkspaceTypes'

function formatListSource(item: ItemWorkspaceEntry, copy: ReturnType<typeof useItemsCopy>) {
  if (item.shopEntries.length) {
    return item.shopEntries[0]?.shopId ?? copy.noneLabel
  }
  if (item.fishCatchLocations.length) {
    return item.fishCatchLocations[0]?.locationDisplayName ?? copy.noneLabel
  }
  if (item.cropHarvests.length) {
    return item.cropHarvests[0]?.seedDisplayName ?? copy.noneLabel
  }
  if (item.forageSources.length) {
    return copy.forageSourceLabel
  }
  if (item.artifactSpotSources.length) {
    return copy.artifactSourceLabel
  }
  return copy.noneLabel
}

function CatalogViewToggle({
  mode,
  onChange,
  copy,
}: {
  mode: CatalogViewMode
  onChange: (mode: CatalogViewMode) => void
  copy: ReturnType<typeof useItemsCopy>
}) {
  return (
    <div className="flex gap-px rounded-lg border border-(--border-color) bg-(--bg-panel-muted) p-px" role="group" aria-label="View mode">
      <button
        type="button"
        aria-pressed={mode === 'list'}
        className={cx(
          'inline-flex items-center gap-1.5 rounded-[0.4375rem] px-2.5 py-1 text-[11px] font-semibold transition-colors',
          mode === 'list'
            ? 'bg-(--bg-panel) text-(--text-primary) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border-color)_100%,transparent)]'
            : 'text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-hover)',
        )}
        onClick={() => onChange('list')}
      >
        <List className="h-3.5 w-3.5" />
        {copy.listViewLabel}
      </button>
      <button
        type="button"
        aria-pressed={mode === 'grid'}
        className={cx(
          'inline-flex items-center gap-1.5 rounded-[0.4375rem] px-2.5 py-1 text-[11px] font-semibold transition-colors',
          mode === 'grid'
            ? 'bg-(--bg-panel) text-(--text-primary) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border-color)_100%,transparent)]'
            : 'text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-hover)',
        )}
        onClick={() => onChange('grid')}
      >
        <Grid2x2 className="h-3.5 w-3.5" />
        {copy.gridViewLabel}
      </button>
    </div>
  )
}

function CatalogListRow({
  entry,
  textureState,
  isActive,
  copy,
  onSelect,
}: {
  entry: ItemWorkspaceEntry
  textureState: ItemTextureAssetState | null
  isActive: boolean
  copy: ReturnType<typeof useItemsCopy>
  onSelect: () => void
}) {
  const spriteFrame = getContainedItemSpriteFrame(entry, 32, 2, 3)
  const typeLabel = entry.kindMetaLabel ?? copy.kindLabels[entry.kind]
  const sourceLabel = formatListSource(entry, copy)

  return (
    <button
      type="button"
      aria-pressed={isActive}
      className={cx(
        'grid w-full grid-cols-[2.75rem_1.5fr_0.9fr_0.7fr_0.9fr] items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
        isActive ? 'bg-(--accent-soft)' : 'hover:bg-(--bg-hover)',
      )}
      data-catalog-item
      onClick={onSelect}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-[0.625rem] bg-(--bg-panel-muted) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border-color)_70%,transparent)]">
        <ItemSprite
          item={entry}
          textureState={textureState}
          scale={spriteFrame.scale}
          fallbackClassName="text-lg"
          className="bg-transparent"
          style={{ width: `${spriteFrame.width}px`, height: `${spriteFrame.height}px` }}
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-bold text-(--text-primary)">{entry.displayName}</p>
        <p className="truncate font-mono text-[11px] text-(--text-tertiary)">{entry.qualifiedItemId}</p>
      </div>
      <p className="truncate text-[13px] text-(--text-secondary)">{typeLabel}</p>
      <p className="truncate text-[13px] font-bold text-(--text-primary)">{formatPrice(entry.price ?? entry.salePrice, copy)}</p>
      <p className="truncate text-right text-[12px] text-(--text-secondary)">{sourceLabel}</p>
    </button>
  )
}

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
  onPageChange,
  onItemsPerPageChange,
  catalogViewMode,
  onCatalogViewModeChange,
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
  onPageChange: (page: number) => void
  onItemsPerPageChange: (itemsPerPage: number) => void
  catalogViewMode: CatalogViewMode
  onCatalogViewModeChange: (mode: CatalogViewMode) => void
}) {
  const copy = useItemsCopy()
  const paginationTokens = useMemo(() => buildPaginationTokens(currentPage, pageCount), [currentPage, pageCount])
  const { viewportRef } = useCatalogPageSize(catalogViewMode, itemsPerPage, items.length, onItemsPerPageChange)
  const wheelAccumulatorRef = useRef(0)
  const lastWheelFlipRef = useRef(0)
  const rangeStart = totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0
  const rangeEnd = totalItems > 0 ? Math.min(currentPage * itemsPerPage, totalItems) : 0

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
    <section className="item-workspace-pane relative h-full" onWheel={handleWheel}>
      <div className="panel-body flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        {browserSourceMode === 'original' ? (
          <div className="mb-3 flex justify-end">
            <CatalogViewToggle mode={catalogViewMode} onChange={onCatalogViewModeChange} copy={copy} />
          </div>
        ) : null}

        {browserSourceMode === 'mod' ? (
          modItemGroups.length ? (
            <div className="min-h-0 flex-1 space-y-4 overflow-auto">
              {modItemGroups.map((group) => (
                <section key={group.modPath} className="rounded-2xl border border-(--border-color) bg-(--bg-panel) p-4">
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
                      const spriteFrame = getContainedItemSpriteFrame(entry, 40, 2.5, 4)

                      return (
                        <button
                          key={`${group.modId}:${entry.key}`}
                          type="button"
                          aria-pressed={isActive}
                          className={cx(
                            'flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
                            isActive
                              ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg-panel-muted))]'
                              : 'border-(--border-color) bg-(--bg-panel-muted) hover:bg-(--bg-hover)',
                          )}
                          onClick={() => onSelectModItem(modEntry)}
                        >
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.625rem] bg-(--bg-panel) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border-color)_70%,transparent)]">
                            <ItemSprite
                              item={entry}
                              textureState={textureState}
                              scale={spriteFrame.scale}
                              className="bg-transparent"
                              style={{ width: `${spriteFrame.width}px`, height: `${spriteFrame.height}px` }}
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
        ) : catalogViewMode === 'list' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="grid grid-cols-[2.75rem_1.5fr_0.9fr_0.7fr_0.9fr] gap-3 rounded-lg bg-(--bg-panel-muted) px-3 py-2 text-[0.625rem] font-extrabold tracking-widest text-(--text-tertiary) uppercase">
              <span />
              <span>{copy.displayNameLabel}</span>
              <span>{copy.typeLabel}</span>
              <span>{copy.priceLabel}</span>
              <span className="text-right">{copy.sourceLabel}</span>
            </div>
            <div ref={viewportRef} className="min-h-0 flex-1 overflow-hidden">
              {items.length ? (
                <div className="flex flex-col gap-1.5 py-1">
                  {items.map((entry) => {
                    const textureState = entry.textureAssetName ? (textureStatesByAssetName[entry.textureAssetName] ?? null) : null
                    const isActive = entry.key === activeItemId

                    return (
                      <CatalogListRow
                        key={entry.key}
                        entry={entry}
                        textureState={textureState}
                        isActive={isActive}
                        copy={copy}
                        onSelect={() => onSelectItem(entry.key, 'info')}
                      />
                    )
                  })}
                </div>
              ) : (
                <div className="p-4">
                  <EmptyNotice message={copy.browserFilteredEmpty} />
                </div>
              )}
            </div>
          </div>
        ) : items.length ? (
          <div ref={viewportRef} className="min-h-0 flex-1 overflow-hidden">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3">
              {items.map((entry) => {
                const textureState = entry.textureAssetName ? (textureStatesByAssetName[entry.textureAssetName] ?? null) : null
                const isActive = entry.key === activeItemId
                const spriteFrame = getContainedItemSpriteFrame(entry, 48, 3, 4)

                return (
                  <button
                    key={entry.key}
                    type="button"
                    aria-pressed={isActive}
                    className={cx(
                      'group flex aspect-[1/1.05] w-full flex-col items-center justify-center rounded-lg border p-2 text-center transition-all duration-150',
                      isActive
                        ? 'border-[color-mix(in_srgb,var(--accent)_44%,transparent)] bg-[color-mix(in_srgb,var(--accent-soft)_70%,var(--bg-panel-muted))] shadow-[0_0_0_0.125rem_var(--accent-soft),var(--shadow-panel)]'
                        : 'border-[color-mix(in_srgb,var(--border-color)_82%,transparent)] bg-[color-mix(in_srgb,var(--bg-panel-muted)_90%,var(--bg-panel)_10%)] hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border-color))] hover:bg-(--bg-panel) hover:shadow-(--shadow-float) hover:-translate-y-px',
                    )}
                    data-catalog-item
                    onClick={() => onSelectItem(entry.key, 'info')}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      onSelectItem(entry.key, 'relations')
                    }}
                    aria-label={`${entry.displayName} ${entry.qualifiedItemId}`}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.625rem] bg-(--bg-panel) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border-color)_70%,transparent)]">
                      <ItemSprite
                        item={entry}
                        textureState={textureState}
                        scale={spriteFrame.scale}
                        fallbackClassName="text-[28px]"
                        className="bg-transparent"
                        style={{ width: `${spriteFrame.width}px`, height: `${spriteFrame.height}px` }}
                      />
                    </div>
                    <div className="mt-2 flex min-w-0 flex-col items-center">
                      <span className="line-clamp-2 text-[12px] leading-tight font-bold text-(--text-primary)">{entry.displayName}</span>
                      <span className="mt-0.5 line-clamp-1 text-[10px] leading-none text-(--text-tertiary)">{entry.qualifiedItemId}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <EmptyNotice message={copy.browserFilteredEmpty} />
        )}

        {browserSourceMode === 'original' && totalItems > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-(--border-color)/65 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-(--bg-panel-muted) px-3 py-1 text-xs font-semibold text-(--text-primary)">
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
                className="inline-flex h-8 items-center gap-1 rounded-md border border-(--border-color) bg-(--bg-panel-muted) px-2.5 text-xs font-semibold text-(--text-secondary) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                title={text.previousPageLabel}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{text.previousPageLabel}</span>
              </button>
              <div className="flex items-center gap-1 rounded-md border border-(--border-color) bg-(--bg-panel-muted) p-1">
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
                        'min-w-8 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                        token.value === currentPage
                          ? 'bg-(--text-primary) text-white'
                          : 'text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)',
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
                className="inline-flex h-8 items-center gap-1 rounded-md border border-(--border-color) bg-(--bg-panel-muted) px-2.5 text-xs font-semibold text-(--text-secondary) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-45"
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
    </section>
  )
}
