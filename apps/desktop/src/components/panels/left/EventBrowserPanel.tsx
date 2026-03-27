import { Search } from 'lucide-react'
import type { EventAssetSummary } from '../../../lib/desktop'
import { cx } from '../../../lib/cx'
import { PanelFrame } from '../../ui/PanelFrame'

type EventBrowserPanelProps = {
  locale: 'zh-CN' | 'en-US'
  eventAssets: EventAssetSummary[]
  filteredEventAssets: EventAssetSummary[]
  activeEventAssetId: string | null
  assetFilter: string
  onAssetFilterChange: (value: string) => void
  onOpenAsset: (asset: EventAssetSummary) => void
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
  activeEventAssetId,
  assetFilter,
  onAssetFilterChange,
  onOpenAsset,
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
      headerAction={<span className="dock-chip">{filteredEventAssets.length}</span>}
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

        <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
          {filteredEventAssets.length ? (
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
