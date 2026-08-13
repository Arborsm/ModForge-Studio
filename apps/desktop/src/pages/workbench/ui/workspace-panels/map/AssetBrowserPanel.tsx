import { ChevronDown, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { BrowserSourceSwitch } from '@shared/ui/BrowserSourceSwitch'
import { getLoadingMotionChildRevealProps } from '@shared/ui/loading-motion'
import { formatBytes, getAssetGroupLabel, type AssetBrowserPanelProps } from '../common/leftShared'

export function AssetBrowserPanel({
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
}: AssetBrowserPanelProps) {
  const copy = useEditorCopy()
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const groupedAssets = useMemo(() => {
    const groups = new Map<string, typeof filteredAssets>()
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
        grouped: items.length > 1,
      }))
      .sort((left, right) => right.items.length - left.items.length || left.label.localeCompare(right.label))
  }, [filteredAssets])
  const visibleCount = useMemo(
    () => (browserSourceMode === 'mod' ? modMapGroups.reduce((total, group) => total + group.items.length, 0) : filteredAssets.length),
    [browserSourceMode, filteredAssets.length, modMapGroups],
  )

  return (
    <PanelFrame
      hideHeader
      title={copy.leftDock.contentBrowser}
      subtitle={copy.leftDock.contentSubtitle}
      className="h-full"
      headerAction={<span className="dock-chip">{visibleCount}</span>}
    >
      <div className="flex h-full flex-col gap-3 p-3">
        <div className="relative">
          <Search className="text-text-tertiary pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <input
            className="control-input pl-9"
            value={assetFilter}
            onChange={(event) => onAssetFilterChange(event.target.value)}
            placeholder={copy.leftDock.filterPlaceholder}
            spellCheck={false}
          />
        </div>

        <BrowserSourceSwitch value={browserSourceMode} onChange={onBrowserSourceModeChange} />

        <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
          {browserSourceMode === 'mod' ? (
            modMapGroups.length ? (
              modMapGroups.map((group, groupIndex) => (
                <section
                  key={group.modPath}
                  {...getLoadingMotionChildRevealProps({
                    index: groupIndex,
                    className: 'overflow-hidden rounded-xl border border-border-subtle bg-surface-panel-muted',
                  })}
                >
                  <div className="border-border-subtle border-b px-3 py-2">
                    <p className="text-text-primary tracking-ui-wider truncate text-xs font-semibold uppercase">{group.modName}</p>
                    <p className="text-text-secondary text-meta-px truncate">{group.items.length}</p>
                  </div>
                  <div className="space-y-2 p-2">
                    {group.items.map((entry, itemIndex) => {
                      const { value: asset, targets } = entry
                      const isActive = entry.selectionId === activeModMapSelectionId
                      const revealProps = getLoadingMotionChildRevealProps({
                        index: groupIndex + itemIndex + 1,
                        className: cx('asset-row', isActive && 'asset-row-active'),
                      })
                      return (
                        <button key={`${group.modId}:${asset.id}`} type="button" {...revealProps} onClick={() => onOpenModAsset(entry)}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-text-primary truncate text-sm font-semibold">{asset.name}</p>
                              <p className="text-text-secondary truncate text-xs">{targets[0] ?? asset.relativePath}</p>
                            </div>
                            <div className="text-text-secondary text-meta-px shrink-0 text-right">
                              <p>{asset.format.toUpperCase()}</p>
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
              <div className="border-border-subtle text-text-secondary rounded-xl border border-dashed px-4 py-5 text-sm">
                No modded maps match the current filter.
              </div>
            )
          ) : groupedAssets.length ? (
            groupedAssets.map((group, groupIndex) => {
              const isCollapsed = collapsedGroups[group.label] ?? true

              if (!group.grouped) {
                const asset = group.items[0]
                const isActive = asset.id === activeMapId
                const isPinned = /^town$/i.test(asset.name)
                const revealProps = getLoadingMotionChildRevealProps({
                  index: groupIndex,
                  className: cx('asset-row', isActive && 'asset-row-active'),
                })

                return (
                  <button key={asset.id} type="button" {...revealProps} onClick={() => onOpenAsset(asset)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-text-primary truncate text-sm font-semibold">{asset.name}</p>
                        <p className="text-text-secondary truncate text-xs">{asset.relativePath}</p>
                      </div>
                      <div className="text-text-secondary text-meta-px shrink-0 text-right">
                        {isPinned ? <p className="text-accent font-semibold">{copy.leftDock.pinned}</p> : null}
                        <p>{asset.format.toUpperCase()}</p>
                        <p>{formatBytes(asset.sizeBytes)}</p>
                      </div>
                    </div>
                  </button>
                )
              }

              return (
                <section
                  key={group.label}
                  {...getLoadingMotionChildRevealProps({
                    index: groupIndex,
                    className: 'overflow-hidden rounded-xl border border-border-subtle bg-surface-panel-muted',
                  })}
                >
                  <button
                    type="button"
                    className="hover:bg-surface-active flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                    onClick={() =>
                      setCollapsedGroups((current) => ({
                        ...current,
                        [group.label]: !isCollapsed,
                      }))
                    }
                  >
                    <div className="min-w-0">
                      <p className="text-text-primary tracking-ui-wider truncate text-xs font-semibold uppercase">{group.label}</p>
                      <p className="text-text-secondary text-meta-px">{group.items.length}</p>
                    </div>
                    <ChevronDown className={cx('h-4 w-4 text-text-secondary transition-transform', !isCollapsed && 'rotate-180')} />
                  </button>

                  {!isCollapsed ? (
                    <div className="border-border-subtle space-y-2 border-t p-2">
                      {group.items.map((asset, itemIndex) => {
                        const isActive = asset.id === activeMapId
                        const isPinned = /^town$/i.test(asset.name)
                        const revealProps = getLoadingMotionChildRevealProps({
                          index: groupIndex + itemIndex + 1,
                          className: cx('asset-row', isActive && 'asset-row-active'),
                        })

                        return (
                          <button key={asset.id} type="button" {...revealProps} onClick={() => onOpenAsset(asset)}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-text-primary truncate text-sm font-semibold">{asset.name}</p>
                                <p className="text-text-secondary truncate text-xs">{asset.relativePath}</p>
                              </div>
                              <div className="text-text-secondary text-meta-px shrink-0 text-right">
                                {isPinned ? <p className="text-accent font-semibold">{copy.leftDock.pinned}</p> : null}
                                <p>{asset.format.toUpperCase()}</p>
                                <p>{formatBytes(asset.sizeBytes)}</p>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                </section>
              )
            })
          ) : (
            <div className="border-border-subtle text-text-secondary rounded-xl border border-dashed px-4 py-5 text-sm">
              {mapAssets.length ? copy.leftDock.noFilteredMaps : copy.leftDock.noMapsFound}
            </div>
          )}
        </div>
      </div>
    </PanelFrame>
  )
}
