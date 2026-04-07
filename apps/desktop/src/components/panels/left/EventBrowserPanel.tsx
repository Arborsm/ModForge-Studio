import { Search } from 'lucide-react'
import type { EventAssetSummary } from '../../../lib/desktop'
import type { BrowserSourceMode, ModBrowserEntry, ModBrowserGroup } from '../../../lib/app/modAssetIndex'
import { cx } from '../../../lib/cx'
import { PanelFrame } from '../../ui/PanelFrame'
import { BrowserSourceSwitch } from '../../ui/BrowserSourceSwitch'

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

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function EventBrowserPanel({
  locale,
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
  const labels =
    locale === 'zh-CN'
      ? {
          title: '事件文件',
          subtitle: 'Content / Data / Events',
          placeholder: '按地点名或路径筛选事件文件',
          empty: eventAssets.length ? '当前筛选没有匹配的事件文件。' : '当前目录没有可加载的 XNB 事件文件。',
        }
      : {
          title: 'Event Files',
          subtitle: 'Content / Data / Events',
          placeholder: 'Filter event files by location or path',
          empty: eventAssets.length ? 'No event files match the current filter.' : 'No loadable XNB event files were found.',
        }

  return (
    <PanelFrame
      hideHeader
      title={labels.title}
      subtitle={labels.subtitle}
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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            className="control-input pl-9"
            value={assetFilter}
            onChange={(event) => onAssetFilterChange(event.target.value)}
            placeholder={labels.placeholder}
            spellCheck={false}
          />
        </div>

        <BrowserSourceSwitch value={browserSourceMode} onChange={onBrowserSourceModeChange} />

        <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
          {browserSourceMode === 'mod' ? (
            modEventGroups.length ? (
              modEventGroups.map((group) => (
                <section
                  key={group.modPath}
                  className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)]"
                >
                  <div className="border-b border-[var(--border-color)] px-3 py-2">
                    <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)]">
                      {group.modName}
                    </p>
                    <p className="truncate text-[11px] text-[var(--text-secondary)]">{group.items.length}</p>
                  </div>
                  <div className="space-y-2 p-2">
                    {group.items.map((entry) => {
                      const { value: asset, targets } = entry
                      const isActive = entry.selectionId === activeModEventSelectionId
                      return (
                        <button
                          key={`${group.modId}:${asset.id}`}
                          type="button"
                          className={cx('asset-row text-left', isActive && 'asset-row-active')}
                          onClick={() => onOpenModAsset(entry)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{asset.name}</p>
                              <p className="truncate text-xs text-[var(--text-secondary)]">{targets[0] ?? asset.relativePath}</p>
                            </div>
                            <div className="shrink-0 text-right text-[11px] text-[var(--text-secondary)]">
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
              <div className="rounded-xl border border-dashed border-[var(--border-color)] px-4 py-5 text-sm text-[var(--text-secondary)]">
                No modded event files match the current filter.
              </div>
            )
          ) : filteredEventAssets.length ? (
            filteredEventAssets.map((asset) => {
              const isActive = asset.id === activeEventAssetId

              return (
                <button
                  key={asset.id}
                  type="button"
                  className={cx('asset-row text-left', isActive && 'asset-row-active')}
                  onClick={() => onOpenAsset(asset)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{asset.name}</p>
                      <p className="truncate text-xs text-[var(--text-secondary)]">{asset.relativePath}</p>
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-[var(--text-secondary)]">
                      <p>XNB</p>
                      <p>{formatBytes(asset.sizeBytes)}</p>
                    </div>
                  </div>
                </button>
              )
            })
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--border-color)] px-4 py-5 text-sm text-[var(--text-secondary)]">
              {labels.empty}
            </div>
          )}
        </div>
      </div>
    </PanelFrame>
  )
}
