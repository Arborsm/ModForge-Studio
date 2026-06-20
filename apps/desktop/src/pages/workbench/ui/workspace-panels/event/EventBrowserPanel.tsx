import { Search } from 'lucide-react'
import type { EventAssetSummary } from '@shared/contracts'
import type { BrowserSourceMode, ModBrowserEntry, ModBrowserGroup } from '@pages/workbench/workspaces/mod'
import { cx } from '@shared/lib/cx'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { BrowserSourceSwitch } from '@shared/ui/BrowserSourceSwitch'
import { formatBytes } from '@shared/lib/formatting'
import { getLoadingMotionChildRevealProps } from '@shared/ui/loading-motion'
import { useEventStageCopy } from '@locales/provider'

type EventBrowserPanelProps = {
  locale: 'zh-CN' | 'en-US'
  eventAssets: EventAssetSummary[]
  filteredEventAssets: EventAssetSummary[]
  browserSourceMode: BrowserSourceMode
  onBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  modEventGroups: ModBrowserGroup<EventAssetSummary>[]
  activeModEventSelectionId: string | null
  activeEventAssetId: string | null
  assetFilter: string
  onAssetFilterChange: (value: string) => void
  onOpenAsset: (asset: EventAssetSummary) => void
  onOpenModAsset: (entry: ModBrowserEntry<EventAssetSummary>) => void
}

export function EventBrowserPanel({
  eventAssets,
  filteredEventAssets,
  browserSourceMode,
  onBrowserSourceModeChange,
  modEventGroups,
  activeModEventSelectionId,
  activeEventAssetId,
  assetFilter,
  onAssetFilterChange,
  onOpenAsset,
  onOpenModAsset,
}: EventBrowserPanelProps) {
  const labels = useEventStageCopy().workflow.workspacePanels
  const emptyLabel = eventAssets.length ? labels.browserEmptyFiltered : labels.browserEmptyMissing

  return (
    <PanelFrame
      hideHeader
      title={labels.browserTitle}
      subtitle={labels.browserSubtitle}
      className="h-full"
      headerAction={
        <span className="dock-chip">
          {browserSourceMode === 'mod'
            ? modEventGroups.reduce((total, group) => total + group.items.length, 0)
            : filteredEventAssets.length}
        </span>
      }
    >
      <div className="flex h-full flex-col gap-3 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--text-tertiary)" />
          <input
            className="control-input pl-9"
            value={assetFilter}
            onChange={(event) => onAssetFilterChange(event.target.value)}
            placeholder={labels.browserPlaceholder}
            spellCheck={false}
          />
        </div>

        <BrowserSourceSwitch value={browserSourceMode} onChange={onBrowserSourceModeChange} />

        <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
          {browserSourceMode === 'mod' ? (
            modEventGroups.length ? (
              modEventGroups.map((group, groupIndex) => (
                <section
                  key={group.modPath}
                  {...getLoadingMotionChildRevealProps({
                    index: groupIndex,
                    className: 'overflow-hidden rounded-xl border border-(--border-color) bg-(--bg-panel-muted)',
                  })}
                >
                  <div className="border-b border-(--border-color) px-3 py-2">
                    <p className="truncate text-xs font-semibold tracking-[0.16em] text-(--text-primary) uppercase">{group.modName}</p>
                    <p className="truncate text-[11px] text-(--text-secondary)">{group.items.length}</p>
                  </div>
                  <div className="space-y-2 p-2">
                    {group.items.map((entry, itemIndex) => {
                      const { value: asset, targets } = entry
                      const isActive = entry.selectionId === activeModEventSelectionId
                      const revealProps = getLoadingMotionChildRevealProps({
                        index: groupIndex + itemIndex + 1,
                        className: cx('asset-row text-left', isActive && 'asset-row-active'),
                      })
                      return (
                        <button key={`${group.modId}:${asset.id}`} type="button" {...revealProps} onClick={() => onOpenModAsset(entry)}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-(--text-primary)">{asset.name}</p>
                              <p className="truncate text-xs text-(--text-secondary)">{targets[0] ?? asset.relativePath}</p>
                            </div>
                            <div className="shrink-0 text-right text-[11px] text-(--text-secondary)">
                              <p>XNB</p>
                              <p>{formatBytes(asset.sizeBytes)}</p>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-(--border-color) px-4 py-5 text-sm text-(--text-secondary)">
                {labels.browserModEmpty}
              </div>
            )
          ) : filteredEventAssets.length ? (
            filteredEventAssets.map((asset, index) => {
              const isActive = asset.id === activeEventAssetId
              const revealProps = getLoadingMotionChildRevealProps({
                index,
                className: cx('asset-row text-left', isActive && 'asset-row-active'),
              })

              return (
                <button key={asset.id} type="button" {...revealProps} onClick={() => onOpenAsset(asset)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-(--text-primary)">{asset.name}</p>
                      <p className="truncate text-xs text-(--text-secondary)">{asset.relativePath}</p>
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-(--text-secondary)">
                      <p>XNB</p>
                      <p>{formatBytes(asset.sizeBytes)}</p>
                    </div>
                  </div>
                </button>
              )
            })
          ) : (
            <div className="rounded-xl border border-dashed border-(--border-color) px-4 py-5 text-sm text-(--text-secondary)">
              {emptyLabel}
            </div>
          )}
        </div>
      </div>
    </PanelFrame>
  )
}
