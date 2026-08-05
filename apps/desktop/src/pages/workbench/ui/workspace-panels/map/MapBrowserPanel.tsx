import { ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { MapAssetSummary } from '@entities/game/api'
import type { BrowserSourceMode, ModBrowserEntry, ModBrowserGroup } from '@pages/workbench/workspaces/mod'
import { useMapPanelCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { formatBytes, getAssetGroupLabel } from '../common/leftShared'
import { getLoadingMotionChildRevealProps } from '@shared/ui/loading-motion'

type MapBrowserPanelProps = {
  mapAssets: MapAssetSummary[]
  filteredAssets: MapAssetSummary[]
  browserSourceMode: BrowserSourceMode
  onBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  modMapGroups: ModBrowserGroup<MapAssetSummary>[]
  activeModMapSelectionId: string | null
  activeMapId: string | null
  assetFilter: string
  onAssetFilterChange: (value: string) => void
  onOpenAsset: (asset: MapAssetSummary) => void
  onOpenModAsset: (entry: ModBrowserEntry<MapAssetSummary>) => void
}

function SourceSwitch({
  value,
  onChange,
  originalLabel,
  modLabel,
}: {
  value: BrowserSourceMode
  onChange: (mode: BrowserSourceMode) => void
  originalLabel: string
  modLabel: string
}) {
  return (
    <div className="border-border-subtle bg-surface-panel-muted rounded-field flex gap-px border p-px">
      {(
        [
          ['original', originalLabel],
          ['mod', modLabel],
        ] as const
      ).map(([mode, label]) => {
        const isActive = value === mode
        return (
          <button
            key={mode}
            type="button"
            className={cx(
              'flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors',
              isActive
                ? 'bg-surface-panel text-text-primary shadow-[inset_0_-1.5px_0_0_var(--accent)]'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
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

function locationDotClass(name: string) {
  const key = name.toLowerCase()
  if (key.includes('saloon')) {
    return 'bg-[#c47a3a]'
  }
  if (key.includes('beach') || key.includes('island')) {
    return 'bg-info'
  }
  if (key.includes('farm') || key.includes('forest')) {
    return 'bg-success'
  }
  if (key.includes('mountain') || key.includes('mine') || key.includes('volcano')) {
    return 'bg-[#a78bfa]'
  }
  if (key.includes('town') || key.includes('seed') || key.includes('archaeology')) {
    return 'bg-accent'
  }
  return 'bg-text-tertiary'
}

function LocationDot({ name }: { name: string }) {
  return (
    <span
      className={cx(
        'h-2 w-2 shrink-0 rounded-full shadow-[0_0_0_1px_color-mix(in_srgb,var(--border-color)_50%,transparent)]',
        locationDotClass(name),
      )}
      aria-hidden="true"
    />
  )
}

function MapRow({
  asset,
  isActive,
  revealIndex,
  onOpen,
}: {
  asset: MapAssetSummary
  isActive: boolean
  revealIndex: number
  onOpen: () => void
}) {
  const revealProps = getLoadingMotionChildRevealProps({
    index: revealIndex,
    className: cx(
      'ml-2 grid w-full grid-cols-[0.5rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-field border border-transparent px-2 py-1.5 text-left transition-colors',
      isActive
        ? 'border-[color-mix(in_srgb,var(--accent)_16%,transparent)] bg-accent-soft shadow-[inset_2px_0_0_0_var(--accent)]'
        : 'hover:bg-surface-hover',
    ),
  })

  return (
    <button type="button" {...revealProps} aria-pressed={isActive} onClick={onOpen}>
      <LocationDot name={asset.name} />
      <span className="min-w-0">
        <span
          className={cx(
            'block truncate text-body-px font-semibold leading-tight',
            isActive ? 'text-[color-mix(in_srgb,var(--accent)_72%,var(--text-primary))]' : 'text-text-primary',
          )}
        >
          {asset.name}
        </span>
        <span className="text-text-tertiary text-meta-px mt-0.5 block truncate font-mono">{asset.relativePath}</span>
      </span>
      <span className="text-text-tertiary text-meta-px shrink-0 text-right font-mono leading-tight tabular-nums">
        <span className="text-text-secondary block font-semibold">{asset.format.toUpperCase()}</span>
        <span className="mt-0.5 block">{formatBytes(asset.sizeBytes)}</span>
      </span>
    </button>
  )
}

/**
 * Map catalog rail: search, vanilla/mod switch, hierarchical region groups.
 * Content-first pane without a duplicate dock title bar.
 */
export function MapBrowserPanel({
  mapAssets,
  filteredAssets,
  browserSourceMode,
  onBrowserSourceModeChange,
  modMapGroups,
  activeModMapSelectionId,
  activeMapId,
  assetFilter,
  onAssetFilterChange,
  onOpenAsset,
  onOpenModAsset,
}: MapBrowserPanelProps) {
  const labels = useMapPanelCopy()
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  const groupedAssets = useMemo(() => {
    const groups = new Map<string, MapAssetSummary[]>()
    for (const asset of filteredAssets) {
      const groupLabel = getAssetGroupLabel(asset)
      const current = groups.get(groupLabel)
      if (current) {
        current.push(asset)
      } else {
        groups.set(groupLabel, [asset])
      }
    }

    return Array.from(groups.entries())
      .map(([label, items]) => ({
        label,
        items: items.sort((left, right) => left.name.localeCompare(right.name)),
      }))
      .sort((left, right) => right.items.length - left.items.length || left.label.localeCompare(right.label))
  }, [filteredAssets])

  return (
    <aside className="item-workspace-pane h-full">
      <div className="custom-scrollbar flex h-full min-h-0 flex-col overflow-auto p-4">
        <div className="relative mb-3">
          <Search className="text-text-tertiary pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2" />
          <input
            className="control-input bg-surface-panel-muted pl-9"
            value={assetFilter}
            onChange={(event) => onAssetFilterChange(event.target.value)}
            placeholder={labels.browserPlaceholder}
            spellCheck={false}
          />
        </div>

        <div className="mb-4">
          <SourceSwitch
            value={browserSourceMode}
            onChange={onBrowserSourceModeChange}
            originalLabel={labels.sourceOriginalLabel}
            modLabel={labels.sourceModLabel}
          />
        </div>

        <div className="min-h-0 flex-1" role="tree" aria-label={labels.browserTitle}>
          {browserSourceMode === 'mod' ? (
            modMapGroups.length ? (
              <div className="flex flex-col gap-0.5">
                {modMapGroups.map((group, groupIndex) => {
                  const isCollapsed = collapsedGroups[group.modPath] ?? false
                  return (
                    <section key={group.modPath} className="mb-0.5">
                      <button
                        type="button"
                        className={cx(
                          'grid w-full grid-cols-[1rem_0.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-field px-2 py-1.5 text-left transition-colors',
                          'hover:bg-surface-hover',
                          !isCollapsed && 'bg-[color-mix(in_srgb,var(--bg-panel-muted)_80%,transparent)]',
                        )}
                        aria-expanded={!isCollapsed}
                        onClick={() =>
                          setCollapsedGroups((current) => ({
                            ...current,
                            [group.modPath]: !isCollapsed,
                          }))
                        }
                      >
                        <ChevronRight
                          className={cx('h-3.5 w-3.5 text-text-tertiary transition-transform', !isCollapsed && 'rotate-90')}
                          aria-hidden="true"
                        />
                        <LocationDot name={group.modName} />
                        <span className="text-text-primary text-body-px truncate font-semibold tracking-tight">{group.modName}</span>
                        <span className="text-text-tertiary text-meta-px font-mono font-semibold tabular-nums">{group.items.length}</span>
                      </button>
                      {!isCollapsed ? (
                        <div className="flex flex-col gap-0.5 pl-1" role="group">
                          {group.items.map((entry, itemIndex) => (
                            <MapRow
                              key={`${group.modId}:${entry.value.id}:${entry.selectionId}`}
                              asset={entry.value}
                              isActive={entry.selectionId === activeModMapSelectionId}
                              revealIndex={groupIndex + itemIndex + 1}
                              onOpen={() => onOpenModAsset(entry)}
                            />
                          ))}
                        </div>
                      ) : null}
                    </section>
                  )
                })}
              </div>
            ) : (
              <div className="border-border-subtle text-text-secondary rounded-xl border border-dashed px-4 py-5 text-sm">
                {labels.browserModEmpty}
              </div>
            )
          ) : groupedAssets.length ? (
            <div className="flex flex-col gap-0.5">
              {groupedAssets.map((group, groupIndex) => {
                const isCollapsed = collapsedGroups[group.label] ?? groupIndex > 1

                return (
                  <section key={group.label} className="mb-0.5">
                    <button
                      type="button"
                      className={cx(
                        'grid w-full grid-cols-[1rem_0.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-field px-2 py-1.5 text-left transition-colors',
                        'hover:bg-surface-hover',
                        !isCollapsed && 'bg-[color-mix(in_srgb,var(--bg-panel-muted)_80%,transparent)]',
                      )}
                      aria-expanded={!isCollapsed}
                      onClick={() =>
                        setCollapsedGroups((current) => ({
                          ...current,
                          [group.label]: !isCollapsed,
                        }))
                      }
                    >
                      <ChevronRight
                        className={cx('h-3.5 w-3.5 text-text-tertiary transition-transform', !isCollapsed && 'rotate-90')}
                        aria-hidden="true"
                      />
                      <LocationDot name={group.label} />
                      <span className="text-text-primary text-body-px truncate font-semibold tracking-tight">{group.label}</span>
                      <span className="text-text-tertiary text-meta-px font-mono font-semibold tabular-nums">{group.items.length}</span>
                    </button>
                    {!isCollapsed ? (
                      <div className="flex flex-col gap-0.5 pl-1" role="group">
                        {group.items.map((asset, itemIndex) => (
                          <MapRow
                            key={asset.id}
                            asset={asset}
                            isActive={asset.id === activeMapId}
                            revealIndex={groupIndex + itemIndex + 1}
                            onOpen={() => onOpenAsset(asset)}
                          />
                        ))}
                      </div>
                    ) : null}
                  </section>
                )
              })}
            </div>
          ) : (
            <div className="border-border-subtle text-text-secondary rounded-xl border border-dashed px-4 py-5 text-sm">
              {mapAssets.length ? labels.browserEmptyFiltered : labels.browserEmptyMissing}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
