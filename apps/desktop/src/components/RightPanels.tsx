import {
  Activity,
  ChevronDown,
  Eye,
  EyeOff,
  Search,
  Settings2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FocusedMapObjectTarget } from './MapViewport'
import type { EditorCopy, ModuleBlueprint, WorkspaceTone } from '../lib/editor-shell'
import type { GameDirectoryInfo } from '../lib/desktop'
import type { MapDocument, MapObject, MapObjectGroup } from '../lib/maps/types'
import { cx } from '../lib/cx'
import { PanelFrame } from './ui/PanelFrame'

type VisibilityListItem = {
  id: number
  name: string
  meta: string
  visible: boolean
  active?: boolean
  groupLabel: string
  setVisible: (visible: boolean) => void
}

type ObjectGroupListItem = {
  id: number
  name: string
  groupLabel: string
  visible: boolean
  objectCount: number
  pointCount: number
  interactionCount: number
  propertyKeys: string[]
  previewObjects: MapObject[]
  group: MapObjectGroup
  setVisible: (visible: boolean) => void
}

type InspectorPanelProps = {
  copy: EditorCopy
  mapDocument: MapDocument | null
  moduleBlueprint?: ModuleBlueprint
}

type LayersPanelProps = {
  copy: EditorCopy
  mapDocument: MapDocument | null
  visibleLayerIds: number[]
  onToggleLayer: (id: number) => void
  onShowAllLayers: () => void
  onHideAllLayers: () => void
}

type ObjectGroupsPanelProps = {
  copy: EditorCopy
  mapDocument: MapDocument | null
  visibleObjectGroupIds: number[]
  onToggleObjectGroup: (id: number) => void
  onShowAllObjectGroups: () => void
  onHideAllObjectGroups: () => void
  focusedObjectTarget: FocusedMapObjectTarget | null
  onFocusObject: (groupId: number, objectId: number) => void
}

type DiagnosticsPanelProps = {
  copy: EditorCopy
  directoryInfo: GameDirectoryInfo | null
  visibleLayerIds: number[]
  visibleObjectGroupIds: number[]
  workspaceStatus: {
    tone: WorkspaceTone
    message: string
  }
}

const INTERACTIVE_OBJECT_PROPERTY_KEYS = ['Action', 'TouchAction', 'Warp', 'NPCWarp', 'LockedDoorWarp', 'MagicWarp']

function getVisibilityGroupLabel(name: string, fallbackLabel: string) {
  const separatorIndex = name.indexOf(' / ')
  return separatorIndex >= 0 ? name.slice(0, separatorIndex) : fallbackLabel
}

function getObjectDisplayName(object: MapObject, copy: EditorCopy) {
  return object.name || object.type || copy.common.objectLabel(object.id)
}

function getObjectInteractionTag(object: MapObject) {
  for (const key of INTERACTIVE_OBJECT_PROPERTY_KEYS) {
    if (key in object.properties) {
      return key
    }
  }

  return null
}

function getObjectPropertyKeys(group: MapObjectGroup) {
  const keys = new Set<string>()

  for (const object of group.objects) {
    for (const key of Object.keys(object.properties)) {
      keys.add(key)
      if (keys.size >= 4) {
        return Array.from(keys)
      }
    }
  }

  return Array.from(keys)
}

function rankObjectForPreview(object: MapObject) {
  let score = 0

  if (getObjectInteractionTag(object)) {
    score += 100
  }
  if (object.name) {
    score += 40
  }
  if (object.type) {
    score += 20
  }
  if (object.width === 0 && object.height === 0) {
    score += 10
  }

  return score
}

function formatObjectPreviewMeta(object: MapObject, copy: EditorCopy) {
  const segments = [
    object.type ? `${copy.common.type}: ${object.type}` : null,
    `${copy.common.bounds}: ${Math.round(object.x)}, ${Math.round(object.y)} / ${Math.round(object.width)} x ${Math.round(object.height)}`,
  ].filter((segment): segment is string => Boolean(segment))

  const interactionTag = getObjectInteractionTag(object)
  if (interactionTag) {
    segments.unshift(interactionTag)
  }

  return segments.join(' / ')
}

function VisibilityRow({
  name,
  meta,
  visible,
  active,
  onToggle,
}: {
  name: string
  meta: string
  visible: boolean
  active?: boolean
  onToggle: () => void
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2 text-xs ${
        active ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-active)]'
      }`}
    >
      <div className="min-w-0">
        <p className={`truncate font-medium ${active ? 'text-white' : 'text-[var(--text-primary)]'}`}>{name}</p>
        <p className="truncate text-[11px] opacity-80">{meta}</p>
      </div>
      <button type="button" className="shrink-0" onClick={onToggle}>
        {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 opacity-60" />}
      </button>
    </div>
  )
}

function GroupedVisibilityList({
  items,
  filterPlaceholder,
  emptyMessage,
}: {
  items: VisibilityListItem[]
  filterPlaceholder: string
  emptyMessage: string
}) {
  const [filterValue, setFilterValue] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const normalizedFilter = filterValue.trim().toLowerCase()
  const entries = useMemo(() => {
    const grouped = new Map<string, VisibilityListItem[]>()

    for (const item of items) {
      const haystack = `${item.groupLabel} ${item.name} ${item.meta}`.toLowerCase()
      if (normalizedFilter && !haystack.includes(normalizedFilter)) {
        continue
      }

      const current = grouped.get(item.groupLabel)
      if (current) {
        current.push(item)
      } else {
        grouped.set(item.groupLabel, [item])
      }
    }

    return Array.from(grouped.entries())
      .map(([groupLabel, groupItems]) => ({
        groupLabel,
        items: groupItems.sort(
          (left, right) =>
            Number(right.visible) - Number(left.visible) ||
            Number(Boolean(right.active)) - Number(Boolean(left.active)) ||
            left.name.localeCompare(right.name),
        ),
        grouped: groupItems.length > 1,
      }))
      .sort(
        (left, right) =>
          Number(right.grouped) - Number(left.grouped) ||
          left.groupLabel.localeCompare(right.groupLabel),
      )
  }, [items, normalizedFilter])

  return (
    <div className="space-y-3 p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          className="control-input pl-9"
          value={filterValue}
          onChange={(event) => setFilterValue(event.target.value)}
          placeholder={filterPlaceholder}
          spellCheck={false}
        />
      </div>

      {entries.length ? (
        <div className="space-y-3">
          {entries.map((group) => {
            const isCollapsed = collapsedGroups[group.groupLabel] ?? true
            const visibleCount = group.items.filter((item) => item.visible).length

            if (!group.grouped) {
              const item = group.items[0]
              return (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)]"
                >
                  <VisibilityRow
                    name={item.name}
                    meta={item.meta}
                    visible={item.visible}
                    active={item.active}
                    onToggle={() => item.setVisible(!item.visible)}
                  />
                </div>
              )
            }

            return (
              <section
                key={group.groupLabel}
                className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)]"
              >
                <div className="flex items-center gap-2 border-b border-[var(--border-color)] px-3 py-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                    onClick={() =>
                      setCollapsedGroups((current) => ({
                        ...current,
                        [group.groupLabel]: !isCollapsed,
                      }))
                    }
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)]">
                        {group.groupLabel}
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        {visibleCount}/{group.items.length}
                      </p>
                    </div>
                    <ChevronDown className={cx('h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform', !isCollapsed && 'rotate-180')} />
                  </button>

                  <div className="flex shrink-0 gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                    <button type="button" onClick={() => group.items.forEach((item) => item.setVisible(true))}>
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => group.items.forEach((item) => item.setVisible(false))}>
                      <EyeOff className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {!isCollapsed ? (
                  <div className="py-1">
                    {group.items.map((item) => (
                      <VisibilityRow
                        key={item.id}
                        name={item.name}
                        meta={item.meta}
                        visible={item.visible}
                        active={item.active}
                        onToggle={() => item.setVisible(!item.visible)}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border-color)] px-4 py-5 text-sm text-[var(--text-secondary)]">
          {emptyMessage}
        </div>
      )}
    </div>
  )
}

function ObjectGroupCard({
  item,
  copy,
  focusedObjectTarget,
  onFocusObject,
}: {
  item: ObjectGroupListItem
  copy: EditorCopy
  focusedObjectTarget: FocusedMapObjectTarget | null
  onFocusObject: (groupId: number, objectId: number) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)]">
      <div className="flex items-start justify-between gap-3 px-3 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{item.name}</p>
          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
            {item.objectCount} {copy.rightDock.objectCount} / {item.interactionCount} Action / {item.pointCount} Point
          </p>
          {item.propertyKeys.length ? (
            <p className="mt-1 truncate text-[11px] text-[var(--text-tertiary)]">
              {item.propertyKeys.join(' / ')}
            </p>
          ) : null}
        </div>
        <button type="button" className="shrink-0" onClick={() => item.setVisible(!item.visible)}>
          {item.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 opacity-60" />}
        </button>
      </div>

      {item.previewObjects.length ? (
        <div className="border-t border-[var(--border-color)] px-2 py-2">
          <div className="space-y-2">
            {item.previewObjects.map((object) => {
              const interactionTag = getObjectInteractionTag(object)
              const isFocused =
                focusedObjectTarget?.groupId === item.group.id && focusedObjectTarget?.objectId === object.id
              return (
                <button
                  key={object.id}
                  type="button"
                  className={cx(
                    'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                    isFocused
                      ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_16%,var(--bg-panel))]'
                      : 'border-[var(--border-color)] bg-[var(--bg-panel)] hover:bg-[var(--bg-active)]',
                  )}
                  onClick={() => onFocusObject(item.group.id, object.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                        {getObjectDisplayName(object, copy)}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-[var(--text-secondary)]">
                        {formatObjectPreviewMeta(object, copy)}
                      </p>
                    </div>
                    <span className="dock-chip shrink-0">
                      {interactionTag ?? object.type ?? `#${object.id}`}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {item.group.objects.length > item.previewObjects.length ? (
            <p className="px-1 pt-2 text-[11px] text-[var(--text-tertiary)]">
              +{item.group.objects.length - item.previewObjects.length}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function GroupedObjectGroupList({
  items,
  filterPlaceholder,
  emptyMessage,
  copy,
  focusedObjectTarget,
  onFocusObject,
}: {
  items: ObjectGroupListItem[]
  filterPlaceholder: string
  emptyMessage: string
  copy: EditorCopy
  focusedObjectTarget: FocusedMapObjectTarget | null
  onFocusObject: (groupId: number, objectId: number) => void
}) {
  const [filterValue, setFilterValue] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const normalizedFilter = filterValue.trim().toLowerCase()
  const entries = useMemo(() => {
    const grouped = new Map<string, ObjectGroupListItem[]>()

    for (const item of items) {
      const objectSearch = item.group.objects
        .slice(0, 24)
        .map((object) => `${object.name} ${object.type} ${Object.keys(object.properties).join(' ')}`)
        .join(' ')
      const haystack = `${item.groupLabel} ${item.name} ${item.propertyKeys.join(' ')} ${objectSearch}`.toLowerCase()
      if (normalizedFilter && !haystack.includes(normalizedFilter)) {
        continue
      }

      const current = grouped.get(item.groupLabel)
      if (current) {
        current.push(item)
      } else {
        grouped.set(item.groupLabel, [item])
      }
    }

    return Array.from(grouped.entries())
      .map(([groupLabel, groupItems]) => ({
        groupLabel,
        items: groupItems.sort(
          (left, right) =>
            Number(right.visible) - Number(left.visible) ||
            right.interactionCount - left.interactionCount ||
            right.objectCount - left.objectCount ||
            left.name.localeCompare(right.name),
        ),
        objectCount: groupItems.reduce((total, item) => total + item.objectCount, 0),
        interactionCount: groupItems.reduce((total, item) => total + item.interactionCount, 0),
        pointCount: groupItems.reduce((total, item) => total + item.pointCount, 0),
        grouped: groupItems.length > 1,
      }))
      .sort(
        (left, right) =>
          Number(right.grouped) - Number(left.grouped) ||
          left.groupLabel.localeCompare(right.groupLabel),
      )
  }, [items, normalizedFilter])

  return (
    <div className="space-y-3 p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          className="control-input pl-9"
          value={filterValue}
          onChange={(event) => setFilterValue(event.target.value)}
          placeholder={filterPlaceholder}
          spellCheck={false}
        />
      </div>

      {entries.length ? (
        <div className="space-y-3">
          {entries.map((entry) => {
            const isCollapsed = collapsedGroups[entry.groupLabel] ?? true

            if (!entry.grouped) {
              return (
                <ObjectGroupCard
                  key={entry.items[0].id}
                  item={entry.items[0]}
                  copy={copy}
                  focusedObjectTarget={focusedObjectTarget}
                  onFocusObject={onFocusObject}
                />
              )
            }

            return (
              <section
                key={entry.groupLabel}
                className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)]"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--bg-active)]"
                  onClick={() =>
                    setCollapsedGroups((current) => ({
                      ...current,
                      [entry.groupLabel]: !isCollapsed,
                    }))
                  }
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)]">
                      {entry.groupLabel}
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {entry.items.length} / {entry.objectCount} {copy.rightDock.objectCount} / {entry.interactionCount} Action / {entry.pointCount} Point
                    </p>
                  </div>
                  <ChevronDown
                    className={cx(
                      'h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform',
                      !isCollapsed && 'rotate-180',
                    )}
                  />
                </button>

                {!isCollapsed ? (
                  <div className="space-y-2 border-t border-[var(--border-color)] p-2">
                    {entry.items.map((item) => (
                      <ObjectGroupCard
                        key={item.id}
                        item={item}
                        copy={copy}
                        focusedObjectTarget={focusedObjectTarget}
                        onFocusObject={onFocusObject}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border-color)] px-4 py-5 text-sm text-[var(--text-secondary)]">
          {emptyMessage}
        </div>
      )}
    </div>
  )
}

export function InspectorPanel({ copy, mapDocument, moduleBlueprint }: InspectorPanelProps) {
  if (moduleBlueprint) {
    return (
      <PanelFrame
        hideHeader
        title={copy.center.moduleInspector}
        subtitle={moduleBlueprint.inspectorTitle}
        headerAction={<span className="dock-chip">{moduleBlueprint.state}</span>}
      >
        <div className="space-y-4 p-3">
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] p-3">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{moduleBlueprint.title}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{moduleBlueprint.summary}</p>
          </div>
          <div className="space-y-2">
            {moduleBlueprint.bullets.map((bullet) => (
              <div
                key={bullet}
                className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-3 py-3 text-xs text-[var(--text-secondary)]"
              >
                {bullet}
              </div>
            ))}
          </div>
          <div className="grid gap-2">
            {moduleBlueprint.lanes.map((lane) => (
              <div key={lane} className="dock-chip justify-center rounded-lg py-2 text-center">
                {lane}
              </div>
            ))}
          </div>
        </div>
      </PanelFrame>
    )
  }

  return (
    <PanelFrame
      hideHeader
      title={copy.rightDock.inspector}
      subtitle={copy.rightDock.sceneSummary}
      headerAction={<Settings2 className="h-4 w-4 text-[var(--text-secondary)]" />}
    >
      <div className="space-y-2.5 p-2.5">
        {mapDocument ? (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="metric-card compact-metric-card">
                <span className="metric-label">{copy.common.dimensions}</span>
                <strong className="metric-value">
                  {mapDocument.width} x {mapDocument.height}
                </strong>
              </div>
              <div className="metric-card compact-metric-card">
                <span className="metric-label">{copy.common.tileSize}</span>
                <strong className="metric-value">
                  {mapDocument.tileWidth} x {mapDocument.tileHeight}
                </strong>
              </div>
              <div className="metric-card compact-metric-card">
                <span className="metric-label">{copy.common.tilesets}</span>
                <strong className="metric-value">{mapDocument.tilesets.length}</strong>
              </div>
              <div className="metric-card compact-metric-card">
                <span className="metric-label">{copy.common.objectGroups}</span>
                <strong className="metric-value">{mapDocument.objectGroups.length}</strong>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-2.5">
              <div className="kv-row compact-kv-row">
                <span>{copy.common.path}</span>
                <span>{mapDocument.relativePath}</span>
              </div>
              <div className="kv-row compact-kv-row">
                <span>{copy.common.orientation}</span>
                <span>{mapDocument.orientation}</span>
              </div>
              <div className="kv-row compact-kv-row">
                <span>{copy.common.renderOrder}</span>
                <span>{mapDocument.renderOrder}</span>
              </div>
              <div className="kv-row compact-kv-row">
                <span>{copy.common.format}</span>
                <span>{mapDocument.format.toUpperCase()}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border-color)] px-4 py-5 text-sm text-[var(--text-secondary)]">
            {copy.center.noSceneLoaded}
          </div>
        )}
      </div>
    </PanelFrame>
  )
}

export function LayersPanel({
  copy,
  mapDocument,
  visibleLayerIds,
  onToggleLayer,
  onShowAllLayers,
  onHideAllLayers,
}: LayersPanelProps) {
  const layerItems = useMemo<VisibilityListItem[]>(() => {
    if (!mapDocument) {
      return []
    }

    return mapDocument.layers.map((layer) => {
      const visible = visibleLayerIds.includes(layer.id)
      return {
        id: layer.id,
        name: layer.name,
        meta: `${layer.nonEmptyTiles} ${copy.rightDock.layerTiles}`,
        visible,
        active: visible,
        groupLabel: getVisibilityGroupLabel(layer.name, mapDocument.name),
        setVisible: (nextVisible) => {
          if (nextVisible !== visible) {
            onToggleLayer(layer.id)
          }
        },
      }
    })
  }, [copy.rightDock.layerTiles, mapDocument, onToggleLayer, visibleLayerIds])

  return (
    <PanelFrame
      hideHeader
      title={copy.rightDock.layers}
      subtitle={copy.rightDock.subtitle}
      className="h-full"
      headerAction={
        <div className="flex gap-2 text-[10px] font-semibold uppercase tracking-[0.16em]">
          <button type="button" onClick={onShowAllLayers}>
            {copy.controls.showAll}
          </button>
          <button type="button" onClick={onHideAllLayers}>
            {copy.controls.hideAll}
          </button>
        </div>
      }
    >
      {mapDocument ? (
        <GroupedVisibilityList
          items={layerItems}
          filterPlaceholder={copy.leftDock.filterPlaceholder}
          emptyMessage={copy.center.noSceneLoaded}
        />
      ) : (
        <div className="px-4 py-5 text-sm text-[var(--text-secondary)]">{copy.center.noSceneLoaded}</div>
      )}
    </PanelFrame>
  )
}

export function ObjectGroupsPanel({
  copy,
  mapDocument,
  visibleObjectGroupIds,
  onToggleObjectGroup,
  onShowAllObjectGroups,
  onHideAllObjectGroups,
  focusedObjectTarget,
  onFocusObject,
}: ObjectGroupsPanelProps) {
  const objectGroupItems = useMemo<ObjectGroupListItem[]>(() => {
    if (!mapDocument) {
      return []
    }

    return mapDocument.objectGroups.map((group) => {
      const visible = visibleObjectGroupIds.includes(group.id)
      const pointCount = group.objects.filter((object) => object.width === 0 && object.height === 0).length
      const interactionCount = group.objects.filter((object) => Boolean(getObjectInteractionTag(object))).length
      return {
        id: group.id,
        name: group.name,
        visible,
        objectCount: group.objects.length,
        pointCount,
        interactionCount,
        propertyKeys: getObjectPropertyKeys(group),
        previewObjects: [...group.objects]
          .sort((left, right) => rankObjectForPreview(right) - rankObjectForPreview(left) || left.id - right.id)
          .slice(0, 4),
        group,
        groupLabel: getVisibilityGroupLabel(group.name, mapDocument.name),
        setVisible: (nextVisible) => {
          if (nextVisible !== visible) {
            onToggleObjectGroup(group.id)
          }
        },
      }
    })
  }, [mapDocument, onToggleObjectGroup, visibleObjectGroupIds])

  return (
    <PanelFrame
      hideHeader
      title={copy.rightDock.objectGroups}
      subtitle={copy.rightDock.subtitle}
      className="h-full"
      headerAction={
        <div className="flex gap-2 text-[10px] font-semibold uppercase tracking-[0.16em]">
          <button type="button" onClick={onShowAllObjectGroups}>
            {copy.controls.showAll}
          </button>
          <button type="button" onClick={onHideAllObjectGroups}>
            {copy.controls.hideAll}
          </button>
        </div>
      }
    >
      {mapDocument ? (
        mapDocument.objectGroups.length ? (
          <GroupedObjectGroupList
            items={objectGroupItems}
            filterPlaceholder={copy.leftDock.filterPlaceholder}
            emptyMessage={copy.rightDock.noObjectGroups}
            copy={copy}
            focusedObjectTarget={focusedObjectTarget}
            onFocusObject={onFocusObject}
          />
        ) : (
          <div className="px-4 py-5 text-sm text-[var(--text-secondary)]">{copy.rightDock.noObjectGroups}</div>
        )
      ) : (
        <div className="px-4 py-5 text-sm text-[var(--text-secondary)]">{copy.center.noSceneLoaded}</div>
      )}
    </PanelFrame>
  )
}

export function DiagnosticsPanel({
  copy,
  directoryInfo,
  visibleLayerIds,
  visibleObjectGroupIds,
  workspaceStatus,
}: DiagnosticsPanelProps) {
  return (
    <PanelFrame
      hideHeader
      title={copy.rightDock.diagnostics}
      subtitle={copy.rightDock.projectFacts}
      headerAction={<Activity className="h-4 w-4 text-[var(--text-secondary)]" />}
    >
      <div className="space-y-2.5 p-2.5">
        {directoryInfo ? (
          <>
            <div className="grid grid-cols-4 gap-1.5">
              <div className="metric-card compact-metric-card">
                <span className="metric-label">{copy.common.visibleLayers}</span>
                <strong className="metric-value">{visibleLayerIds.length}</strong>
              </div>
              <div className="metric-card compact-metric-card">
                <span className="metric-label">{copy.common.visibleObjects}</span>
                <strong className="metric-value">{visibleObjectGroupIds.length}</strong>
              </div>
              <div className="metric-card compact-metric-card">
                <span className="metric-label">{copy.statusBar.scanned}</span>
                <strong className="metric-value">{directoryInfo.mapCount}</strong>
              </div>
              <div className="metric-card compact-metric-card">
                <span className="metric-label">{copy.rightDock.workspaceStatus}</span>
                <strong className="metric-value">{copy.statusTone[workspaceStatus.tone]}</strong>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-2.5">
              <div className="kv-row compact-kv-row">
                <span>{copy.common.executable}</span>
                <span>{directoryInfo.executablePath}</span>
              </div>
              <div className="kv-row compact-kv-row">
                <span>{copy.leftDock.preferredMaps}</span>
                <span>{directoryInfo.preferredMapsPath ?? copy.common.none}</span>
              </div>
              <div className="kv-row compact-kv-row">
                <span>{copy.common.unpackedMaps}</span>
                <span>{directoryInfo.unpackedMapsPath ?? copy.common.none}</span>
              </div>
              <div className="kv-row compact-kv-row">
                <span>{copy.common.xnbMaps}</span>
                <span>{directoryInfo.xnbMapsPath ?? copy.common.none}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border-color)] px-4 py-5 text-sm text-[var(--text-secondary)]">
            {copy.rightDock.diagnosticsPrompt}
          </div>
        )}

        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-2.5 py-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
              {copy.rightDock.workspaceStatus}
            </p>
            <span className={`inline-flex status-pill status-pill-${workspaceStatus.tone}`}>
              {copy.statusTone[workspaceStatus.tone]}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-[var(--text-secondary)]">
            {workspaceStatus.message || copy.statusTone.idle}
          </p>
        </div>
      </div>
    </PanelFrame>
  )
}
