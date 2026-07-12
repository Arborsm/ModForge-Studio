import { Eye, EyeOff, Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { FocusedMapObjectTarget, MapDocument } from '@entities/map'
import {
  formatObjectPreviewMeta,
  getObjectDisplayName,
  getObjectInteractionTag,
  getObjectPropertyKeys,
  rankObjectForPreview,
} from '@entities/map'
import type { ModSourceEntry } from '@pages/workbench/workspaces/mod'
import { useEditorCopy, useMapPanelCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { ModSourceList } from '@shared/ui/ModSourceList'

type DetailTab = 'overview' | 'layers' | 'objects'

type MapDetailPanelProps = {
  mapDocument: MapDocument | null
  modSources?: ModSourceEntry[]
  visibleLayerIds: number[]
  onToggleLayer: (id: number) => void
  onShowAllLayers: () => void
  onHideAllLayers: () => void
  visibleObjectGroupIds: number[]
  onToggleObjectGroup: (id: number) => void
  onShowAllObjectGroups: () => void
  onHideAllObjectGroups: () => void
  focusedObjectTarget: FocusedMapObjectTarget | null
  onFocusObject: (groupId: number, objectId: number) => void
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pb-1">
      <p className="panel-section-title mb-1">{title}</p>
      {children}
    </section>
  )
}

function KvRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-(--border-color)/50 py-2.5 last:border-b-0">
      <span className="shrink-0 text-[11px] font-semibold tracking-wide text-(--text-secondary) uppercase">{label}</span>
      <span
        className={cx(
          'max-w-[68%] text-right text-xs font-semibold break-words text-(--text-primary)',
          mono && 'font-mono font-medium text-(--text-secondary)',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-(--bg-panel-muted) px-3 py-2.5">
      <span className="text-[10px] font-bold tracking-wider text-(--text-tertiary) uppercase">{label}</span>
      <strong className="font-mono text-[15px] font-bold tracking-tight text-(--text-primary) tabular-nums">{value}</strong>
    </div>
  )
}

function countWarpObjects(mapDocument: MapDocument) {
  let total = 0
  for (const group of mapDocument.objectGroups) {
    for (const object of group.objects) {
      const tag = getObjectInteractionTag(object)
      if (tag === 'Warp' || tag === 'NPCWarp' || tag === 'LockedDoorWarp' || tag === 'MagicWarp') {
        total += 1
      }
    }
  }
  return total
}

/**
 * Right-rail map detail: hero metrics + overview / layers / objects tabs.
 * Replaces stacked inspector + layers + object-groups dock panels for browse mode.
 */
export function MapDetailPanel({
  mapDocument,
  modSources = [],
  visibleLayerIds,
  onToggleLayer,
  onShowAllLayers,
  onHideAllLayers,
  visibleObjectGroupIds,
  onToggleObjectGroup,
  onShowAllObjectGroups,
  onHideAllObjectGroups,
  focusedObjectTarget,
  onFocusObject,
}: MapDetailPanelProps) {
  const labels = useMapPanelCopy()
  const copy = useEditorCopy()
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')
  const [layerFilter, setLayerFilter] = useState('')
  const [objectFilter, setObjectFilter] = useState('')
  const [collapsedObjectGroups, setCollapsedObjectGroups] = useState<Record<number, boolean>>({})

  const layerItems = useMemo(() => {
    if (!mapDocument) {
      return []
    }
    const needle = layerFilter.trim().toLowerCase()
    return mapDocument.layers
      .map((layer) => ({
        id: layer.id,
        name: layer.name,
        meta: `${layer.nonEmptyTiles} ${copy.rightDock.layerTiles}`,
        visible: visibleLayerIds.includes(layer.id),
      }))
      .filter((layer) => !needle || `${layer.name} ${layer.meta}`.toLowerCase().includes(needle))
  }, [copy.rightDock.layerTiles, layerFilter, mapDocument, visibleLayerIds])

  const objectGroupItems = useMemo(() => {
    if (!mapDocument) {
      return []
    }
    const needle = objectFilter.trim().toLowerCase()
    return mapDocument.objectGroups
      .map((group) => {
        const visible = visibleObjectGroupIds.includes(group.id)
        const pointCount = group.objects.filter((object) => object.width === 0 && object.height === 0).length
        const interactionCount = group.objects.filter((object) => Boolean(getObjectInteractionTag(object))).length
        const previewObjects = [...group.objects]
          .sort((left, right) => rankObjectForPreview(right) - rankObjectForPreview(left) || left.id - right.id)
          .slice(0, 6)
        return {
          id: group.id,
          name: group.name,
          visible,
          objectCount: group.objects.length,
          pointCount,
          interactionCount,
          propertyKeys: getObjectPropertyKeys(group),
          previewObjects,
          group,
          summary: copy.rightDock.objectGroupSummary(group.objects.length, interactionCount, pointCount),
        }
      })
      .filter((item) => {
        if (!needle) {
          return true
        }
        const objectSearch = item.group.objects
          .slice(0, 24)
          .map((object) => `${object.name} ${object.type} ${Object.keys(object.properties).join(' ')}`)
          .join(' ')
        return `${item.name} ${item.propertyKeys.join(' ')} ${objectSearch}`.toLowerCase().includes(needle)
      })
  }, [copy.rightDock, mapDocument, objectFilter, visibleObjectGroupIds])

  if (!mapDocument) {
    return (
      <section className="item-workspace-pane h-full">
        <div className="panel-body flex h-full min-h-0 items-center justify-center p-6 text-center">
          <p className="max-w-md text-sm text-(--text-secondary)">{labels.detailEmpty}</p>
        </div>
      </section>
    )
  }

  const visibleLayerCount = mapDocument.layers.filter((layer) => visibleLayerIds.includes(layer.id)).length
  const objectTotal = mapDocument.objectGroups.reduce((total, group) => total + group.objects.length, 0)
  const warpTotal = countWarpObjects(mapDocument)
  const tabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'overview', label: labels.detailOverviewTab },
    { id: 'layers', label: labels.detailLayersTab },
    { id: 'objects', label: labels.detailObjectsTab },
  ]

  return (
    <section className="item-workspace-pane h-full">
      <div className="shrink-0 border-b border-(--border-color)/65 px-3.5 py-3.5">
        <h2 className="text-[1.45rem] leading-tight font-extrabold tracking-tight text-balance text-(--text-primary)">
          {mapDocument.name}
        </h2>
        <p className="mt-1.5 truncate font-mono text-xs text-(--text-tertiary)">{mapDocument.relativePath}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center rounded-full bg-(--accent-soft) px-2.5 py-1 text-xs font-bold text-(--accent)">
            {mapDocument.format.toUpperCase()}
          </span>
          <span className="inline-flex items-center rounded-full bg-(--bg-panel-muted) px-2.5 py-1 text-xs font-bold text-(--text-secondary)">
            {mapDocument.orientation}
          </span>
          <span className="inline-flex items-center rounded-full bg-(--bg-panel-muted) px-2.5 py-1 text-xs font-bold text-(--text-secondary)">
            {mapDocument.renderOrder}
          </span>
        </div>
        <div
          className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-(--border-color)/55 bg-(--border-color)/55"
          aria-label={copy.rightDock.sceneSummary}
        >
          <MetricCell label={copy.common.dimensions} value={`${mapDocument.width} × ${mapDocument.height}`} />
          <MetricCell label={copy.common.tileSize} value={`${mapDocument.tileWidth} × ${mapDocument.tileHeight}`} />
          <MetricCell label={copy.common.tilesets} value={String(mapDocument.tilesets.length)} />
          <MetricCell label={copy.common.objectGroups} value={String(mapDocument.objectGroups.length)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 px-3 pt-2.5" role="tablist" aria-label={copy.rightDock.inspector}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            className={cx(
              'rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
              tab.id === activeTab
                ? 'bg-(--accent-soft) text-(--accent)'
                : 'text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)',
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="custom-scrollbar panel-body min-h-0 flex-1 overflow-auto">
        {activeTab === 'overview' ? (
          <div className="detail-sections-stack px-3.5 py-3">
            <DetailSection title={labels.basicsSection}>
              <div className="flex flex-col">
                <KvRow label={copy.common.path} value={mapDocument.relativePath} mono />
                <KvRow label={copy.common.orientation} value={mapDocument.orientation} />
                <KvRow label={copy.common.renderOrder} value={mapDocument.renderOrder} mono />
                <KvRow label={copy.common.format} value={mapDocument.format.toUpperCase()} />
              </div>
            </DetailSection>
            <DetailSection title={labels.resourcesSection}>
              <div className="flex flex-col">
                <KvRow label={copy.common.tilesets} value={String(mapDocument.tilesets.length)} mono />
                <KvRow label={copy.rightDock.layers} value={labels.layersVisible(visibleLayerCount, mapDocument.layers.length)} mono />
                <KvRow label={copy.common.objectGroups} value={labels.objectsTotal(objectTotal)} mono />
                <KvRow label={labels.warpsLabel} value={labels.warpsTotal(warpTotal)} mono />
              </div>
            </DetailSection>
            <DetailSection title={labels.modSourcesSection}>
              <div className="flex flex-col">
                <KvRow label={labels.baselineSource} value={labels.baselineSource} />
                {modSources.length ? (
                  <div className="border-b border-(--border-color)/50 py-2.5 last:border-b-0">
                    <ModSourceList sources={modSources} />
                  </div>
                ) : (
                  <KvRow label={copy.common.none} value={labels.overlayNone} mono />
                )}
              </div>
            </DetailSection>
          </div>
        ) : null}

        {activeTab === 'layers' ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center gap-2 px-3 pt-2.5">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-(--text-tertiary)" />
                <input
                  className="control-input bg-(--bg-panel-muted) pl-9"
                  value={layerFilter}
                  onChange={(event) => setLayerFilter(event.target.value)}
                  placeholder={labels.layersFilterPlaceholder}
                  spellCheck={false}
                />
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="rounded-lg px-2 py-1.5 text-[11px] font-bold text-(--text-tertiary) hover:bg-(--bg-hover) hover:text-(--text-primary)"
                  onClick={onShowAllLayers}
                >
                  {copy.controls.showAll}
                </button>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1.5 text-[11px] font-bold text-(--text-tertiary) hover:bg-(--bg-hover) hover:text-(--text-primary)"
                  onClick={onHideAllLayers}
                >
                  {copy.controls.hideAll}
                </button>
              </div>
            </div>
            <div className="mt-1" role="list" aria-label={copy.rightDock.layers}>
              {layerItems.length ? (
                layerItems.map((layer) => (
                  <div
                    key={layer.id}
                    role="listitem"
                    className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-(--border-color)/50 px-3 py-2.5 last:border-b-0"
                  >
                    <button
                      type="button"
                      className={cx(
                        'grid h-7 w-7 place-items-center rounded-lg transition-colors',
                        layer.visible ? 'text-(--accent) hover:bg-(--bg-hover)' : 'text-(--text-tertiary) hover:bg-(--bg-hover)',
                      )}
                      aria-label={layer.name}
                      aria-pressed={layer.visible}
                      onClick={() => onToggleLayer(layer.id)}
                    >
                      {layer.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 opacity-70" />}
                    </button>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-(--text-primary)">{layer.name}</p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-(--text-secondary)">{layer.meta}</p>
                    </div>
                    <span className="text-[10px] font-bold tracking-wider text-(--text-tertiary) uppercase">{labels.layerKind}</span>
                  </div>
                ))
              ) : (
                <div className="px-4 py-5 text-sm text-(--text-secondary)">{copy.center.noSceneLoaded}</div>
              )}
            </div>
          </div>
        ) : null}

        {activeTab === 'objects' ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center gap-2 px-3 pt-2.5">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-(--text-tertiary)" />
                <input
                  className="control-input bg-(--bg-panel-muted) pl-9"
                  value={objectFilter}
                  onChange={(event) => setObjectFilter(event.target.value)}
                  placeholder={labels.objectsFilterPlaceholder}
                  spellCheck={false}
                />
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="rounded-lg px-2 py-1.5 text-[11px] font-bold text-(--text-tertiary) hover:bg-(--bg-hover) hover:text-(--text-primary)"
                  onClick={onShowAllObjectGroups}
                >
                  {copy.controls.showAll}
                </button>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1.5 text-[11px] font-bold text-(--text-tertiary) hover:bg-(--bg-hover) hover:text-(--text-primary)"
                  onClick={onHideAllObjectGroups}
                >
                  {copy.controls.hideAll}
                </button>
              </div>
            </div>
            <div className="mt-1">
              {objectGroupItems.length ? (
                objectGroupItems.map((item) => {
                  const isCollapsed = collapsedObjectGroups[item.id] ?? false
                  return (
                    <div key={item.id} className="border-b border-(--border-color)/50 last:border-b-0">
                      <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5">
                        <button
                          type="button"
                          className={cx(
                            'grid h-7 w-7 place-items-center rounded-lg transition-colors',
                            item.visible ? 'text-(--accent) hover:bg-(--bg-hover)' : 'text-(--text-tertiary) hover:bg-(--bg-hover)',
                          )}
                          aria-label={item.name}
                          aria-pressed={item.visible}
                          onClick={() => onToggleObjectGroup(item.id)}
                        >
                          {item.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 opacity-70" />}
                        </button>
                        <button
                          type="button"
                          className="min-w-0 text-left"
                          onClick={() =>
                            setCollapsedObjectGroups((current) => ({
                              ...current,
                              [item.id]: !isCollapsed,
                            }))
                          }
                        >
                          <p className="truncate text-[13px] font-semibold text-(--text-primary)">{item.name}</p>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-(--text-secondary)">{item.summary}</p>
                        </button>
                        <span className="text-[10px] font-bold tracking-wider text-(--text-tertiary) uppercase">
                          {item.propertyKeys[0] ?? 'group'}
                        </span>
                      </div>
                      {!isCollapsed && item.previewObjects.length ? (
                        <div className="flex flex-col gap-0.5 px-3 pb-2 pl-10">
                          {item.previewObjects.map((object) => {
                            const isFocused = focusedObjectTarget?.groupId === item.group.id && focusedObjectTarget?.objectId === object.id
                            return (
                              <button
                                key={object.id}
                                type="button"
                                className={cx(
                                  'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors',
                                  isFocused
                                    ? 'border-[color-mix(in_srgb,var(--accent)_16%,transparent)] bg-(--accent-soft)'
                                    : 'hover:bg-(--bg-hover)',
                                )}
                                aria-pressed={isFocused}
                                onClick={() => onFocusObject(item.group.id, object.id)}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-xs font-semibold text-(--text-primary)">
                                    {getObjectDisplayName(object, copy)}
                                  </span>
                                  <span className="mt-0.5 block truncate font-mono text-[11px] text-(--text-tertiary)">
                                    {formatObjectPreviewMeta(object, copy)}
                                  </span>
                                </span>
                                <span className="font-mono text-[11px] text-(--text-tertiary) tabular-nums">
                                  {Math.round(object.x)}, {Math.round(object.y)}
                                </span>
                              </button>
                            )
                          })}
                          {item.group.objects.length > item.previewObjects.length ? (
                            <p className="px-2 pt-1 text-[11px] text-(--text-tertiary)">
                              {labels.moreObjects(item.group.objects.length - item.previewObjects.length)}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )
                })
              ) : (
                <div className="px-4 py-5 text-sm text-(--text-secondary)">{copy.rightDock.noObjectGroups}</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
