import { ChevronDown, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { getWorkspaceModeLabel, type WorkspaceMode } from '../lib/editor-shell'
import { useEditorCopy, useLocale } from '../lib/app/localeContext'
import type { GameDirectoryInfo, MapAssetSummary } from '../lib/desktop'
import { cx } from '../lib/cx'
import { PanelFrame } from './ui/PanelFrame'

type LeftDockProps = {
  workspaceMode: WorkspaceMode
  desktopHost: boolean
  gameDirectory: string
  onGameDirectoryChange: (value: string) => void
  onChooseDirectory: () => void
  onUseKnownPath: () => void
  onValidateOnly: () => void
  onScanAndOpenTown: () => void
  directoryInfo: GameDirectoryInfo | null
  mapAssets: MapAssetSummary[]
  filteredAssets: MapAssetSummary[]
  activeMapId: string | null
  sceneLabel?: string
  assetFilter: string
  onAssetFilterChange: (value: string) => void
  onOpenAsset: (asset: MapAssetSummary) => void
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

function getAssetGroupLabel(asset: MapAssetSummary) {
  const relativePath = asset.relativePath.replaceAll('\\', '/')
  const pathSegments = relativePath.split('/')
  const fileName = pathSegments[pathSegments.length - 1]?.replace(/\.(tmx|xnb)$/i, '') ?? asset.name
  const familySource = /^Island(?:_|-|[A-Z])/.test(fileName)
    ? 'Island'
    : fileName.split(/[-_]/)[0]?.replace(/\d+$/u, '') || fileName

  return familySource || '#'
}

export default function LeftDock({
  workspaceMode,
  desktopHost,
  gameDirectory,
  onGameDirectoryChange,
  onChooseDirectory,
  onUseKnownPath,
  onValidateOnly,
  onScanAndOpenTown,
  directoryInfo,
  mapAssets,
  filteredAssets,
  activeMapId,
  sceneLabel,
  assetFilter,
  onAssetFilterChange,
  onOpenAsset,
}: LeftDockProps) {
  const copy = useEditorCopy()
  const locale = useLocale()
  const activeAssetName = sceneLabel ?? mapAssets.find((item) => item.id === activeMapId)?.name ?? copy.common.none
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
        grouped: items.length > 1,
      }))
      .sort(
        (left, right) =>
          right.items.length - left.items.length ||
          left.label.localeCompare(right.label),
      )
  }, [filteredAssets])

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden bg-[var(--bg-panel)] p-3">
      <PanelFrame title={copy.leftDock.project} subtitle={copy.leftDock.projectSubtitle}>
        <div className="space-y-3 p-3">
          <div className="grid gap-2">
            <label className="panel-section-title">
              {copy.leftDock.gameDirectory}
            </label>
            <input
              className="control-input"
              value={gameDirectory}
              onChange={(event) => onGameDirectoryChange(event.target.value)}
              placeholder={copy.leftDock.directoryPlaceholder}
              spellCheck={false}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="control-button" onClick={onChooseDirectory}>
              {copy.controls.browse}
            </button>
            <button type="button" className="control-button" onClick={onUseKnownPath}>
              {copy.controls.useKnownPath}
            </button>
            <button type="button" className="control-button" onClick={onValidateOnly}>
              {copy.controls.validateOnly}
            </button>
            <button type="button" className="control-button control-button-primary" onClick={onScanAndOpenTown}>
              {copy.controls.scanAndOpenTown}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="metric-card">
              <span className="metric-label">{copy.leftDock.hostMode}</span>
              <strong className="metric-value">
                {desktopHost ? copy.leftDock.desktopHost : copy.leftDock.browserHost}
              </strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">{copy.leftDock.preferredFormat}</span>
              <strong className="metric-value">{directoryInfo ? 'XNB' : copy.common.none}</strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">{copy.leftDock.detectedMaps}</span>
              <strong className="metric-value">{mapAssets.length || directoryInfo?.mapCount || 0}</strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">{copy.leftDock.sceneFocus}</span>
              <strong className="metric-value">
                {workspaceMode === 'map' ? activeAssetName : getWorkspaceModeLabel(locale, copy, workspaceMode)}
              </strong>
            </div>
          </div>

          <div className="panel-section-muted panel-section px-3 py-2">
            <div className="kv-row">
              <span>{copy.leftDock.installState}</span>
              <span>{directoryInfo ? copy.statusTone.ready : copy.statusTone.idle}</span>
            </div>
            <div className="kv-row">
              <span>{copy.leftDock.preferredMaps}</span>
              <span>{directoryInfo?.mapsPath ?? copy.common.none}</span>
            </div>
          </div>
        </div>
      </PanelFrame>

      <PanelFrame
        title={copy.leftDock.contentBrowser}
        subtitle={copy.leftDock.contentSubtitle}
        className="flex-1"
        headerAction={<span className="dock-chip">{filteredAssets.length}</span>}
      >
        <div className="flex h-full flex-col gap-3 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              className="control-input pl-9"
              value={assetFilter}
              onChange={(event) => onAssetFilterChange(event.target.value)}
              placeholder={copy.leftDock.filterPlaceholder}
              spellCheck={false}
            />
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
            {groupedAssets.length ? (
              groupedAssets.map((group) => {
                const isCollapsed = collapsedGroups[group.label] ?? true

                if (!group.grouped) {
                  const asset = group.items[0]
                  const isActive = asset.id === activeMapId
                  const isPinned = /^town$/i.test(asset.name)

                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={cx('asset-row', isActive && 'asset-row-active')}
                      onClick={() => onOpenAsset(asset)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{asset.name}</p>
                          <p className="truncate text-xs text-[var(--text-secondary)]">{asset.relativePath}</p>
                        </div>
                        <div className="shrink-0 text-right text-[11px] text-[var(--text-secondary)]">
                          {isPinned ? <p className="font-semibold text-[var(--accent)]">{copy.leftDock.pinned}</p> : null}
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
                    className="panel-section-muted panel-section overflow-hidden"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--bg-active)]"
                      onClick={() =>
                        setCollapsedGroups((current) => ({
                          ...current,
                          [group.label]: !isCollapsed,
                        }))
                      }
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)]">
                          {group.label}
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)]">{group.items.length}</p>
                      </div>
                      <ChevronDown className={cx('h-4 w-4 text-[var(--text-secondary)] transition-transform', !isCollapsed && 'rotate-180')} />
                    </button>

                    {!isCollapsed ? (
                      <div className="space-y-2 border-t border-[var(--border-color)] p-2">
                        {group.items.map((asset) => {
                          const isActive = asset.id === activeMapId
                          const isPinned = /^town$/i.test(asset.name)

                          return (
                            <button
                              key={asset.id}
                              type="button"
                              className={cx('asset-row', isActive && 'asset-row-active')}
                              onClick={() => onOpenAsset(asset)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{asset.name}</p>
                                  <p className="truncate text-xs text-[var(--text-secondary)]">{asset.relativePath}</p>
                                </div>
                                <div className="shrink-0 text-right text-[11px] text-[var(--text-secondary)]">
                                  {isPinned ? <p className="font-semibold text-[var(--accent)]">{copy.leftDock.pinned}</p> : null}
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
              <div className="panel-empty-state">
                {mapAssets.length ? copy.leftDock.noFilteredMaps : copy.leftDock.noMapsFound}
              </div>
            )}
          </div>
        </div>
      </PanelFrame>
    </div>
  )
}

