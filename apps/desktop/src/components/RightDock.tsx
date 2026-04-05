import {
  Activity,
  Box,
  ChevronDown,
  Eye,
  EyeOff,
  Layers,
  MousePointerSquareDashed,
  Search,
  Settings2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FocusedMapObjectTarget, TileHoverInfo } from './MapViewport'
import type { EditorCopy, ModuleBlueprint, WorkspaceTone } from '../lib/editor-shell'
import type { GameDirectoryInfo } from '../lib/desktop'
import type { MapDocument, MapObject, MapObjectGroup, MapPropertyValue } from '../lib/maps/types'
import { useEditorCopy } from '../lib/app/localeContext'
import { cx } from '../lib/cx'
import { AccordionSection } from './ui/AccordionSection'

type RightDockProps = {
  mapDocument: MapDocument | null
  hoverInfo: TileHoverInfo | null
  visibleLayerIds: number[]
  visibleObjectGroupIds: number[]
  onToggleLayer: (id: number) => void
  onToggleObjectGroup: (id: number) => void
  onShowAllLayers: () => void
  onHideAllLayers: () => void
  onShowAllObjectGroups: () => void
  onHideAllObjectGroups: () => void
  focusedObjectTarget: FocusedMapObjectTarget | null
  onFocusObject: (groupId: number, objectId: number) => void
  directoryInfo: GameDirectoryInfo | null
  workspaceStatus: {
    tone: WorkspaceTone
    message: string
  }
  moduleBlueprint?: ModuleBlueprint
}

function formatPropertyValue(value: MapPropertyValue, copy: EditorCopy) {
  if (typeof value === 'boolean') {
    return value ? copy.common.yes : copy.common.no
  }

  return String(value)
}

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
                  className="panel-section-muted panel-section overflow-hidden"
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
                className="panel-section-muted panel-section overflow-hidden"
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
        <div className="panel-empty-state">
          {emptyMessage}
        </div>
      )}
    </div>
  )
}

function ObjectGroupCard({
  item,
  focusedObjectTarget,
  onFocusObject,
}: {
  item: ObjectGroupListItem
  focusedObjectTarget: FocusedMapObjectTarget | null
  onFocusObject: (groupId: number, objectId: number) => void
}) {
  const copy = useEditorCopy()
  return (
    <div className="panel-section-muted panel-section overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-3 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{item.name}</p>
          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
            {copy.rightDock.objectGroupSummary(item.objectCount, item.interactionCount, item.pointCount)}
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
                    'panel-list-card panel-list-card-interactive w-full rounded-lg px-3 py-2 text-left',
                    isFocused
                      ? 'panel-list-card-active'
                      : 'hover:bg-[color-mix(in_srgb,var(--bg-active)_66%,transparent)]',
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
  focusedObjectTarget,
  onFocusObject,
}: {
  items: ObjectGroupListItem[]
  filterPlaceholder: string
  emptyMessage: string
  focusedObjectTarget: FocusedMapObjectTarget | null
  onFocusObject: (groupId: number, objectId: number) => void
}) {
  const copy = useEditorCopy()
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
                  focusedObjectTarget={focusedObjectTarget}
                  onFocusObject={onFocusObject}
                />
              )
            }

            return (
              <section
                key={entry.groupLabel}
                className="panel-section-muted panel-section overflow-hidden"
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
                      {copy.rightDock.objectGroupCollectionSummary(
                        entry.items.length,
                        entry.objectCount,
                        entry.interactionCount,
                        entry.pointCount,
                      )}
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
        <div className="panel-empty-state">
          {emptyMessage}
        </div>
      )}
    </div>
  )
}

export default function RightDock({
  mapDocument,
  hoverInfo,
  visibleLayerIds,
  visibleObjectGroupIds,
  onToggleLayer,
  onToggleObjectGroup,
  onShowAllLayers,
  onHideAllLayers,
  onShowAllObjectGroups,
  onHideAllObjectGroups,
  focusedObjectTarget,
  onFocusObject,
  directoryInfo,
  workspaceStatus,
  moduleBlueprint,
}: RightDockProps) {
  const copy = useEditorCopy()
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

  if (moduleBlueprint) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-panel)]">
        <div className="panel-header">
          <div>
            <p className="panel-title">{copy.center.moduleInspector}</p>
            <p className="panel-subtitle">{moduleBlueprint.inspectorTitle}</p>
          </div>
          <span className="dock-chip">{moduleBlueprint.state}</span>
        </div>
        <div className="panel-body space-y-4 p-3">
          <div className="panel-section-muted panel-section p-3">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{moduleBlueprint.title}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{moduleBlueprint.summary}</p>
          </div>
          <div className="space-y-2">
            {moduleBlueprint.bullets.map((bullet) => (
              <div
                key={bullet}
                className="panel-section-muted panel-section px-3 py-3 text-xs text-[var(--text-secondary)]"
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
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-panel)]">
      <div className="panel-header">
        <div>
          <p className="panel-title">{copy.rightDock.title}</p>
          <p className="panel-subtitle">{copy.rightDock.subtitle}</p>
        </div>
      </div>

      <div className="panel-body">
        <AccordionSection title={copy.rightDock.inspector} icon={<Settings2 className="h-4 w-4" />}>
          <div className="space-y-4 p-3">
            {mapDocument ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="metric-card">
                    <span className="metric-label">{copy.common.dimensions}</span>
                    <strong className="metric-value">
                      {mapDocument.width} x {mapDocument.height}
                    </strong>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">{copy.common.tileSize}</span>
                    <strong className="metric-value">
                      {mapDocument.tileWidth} x {mapDocument.tileHeight}
                    </strong>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">{copy.common.tilesets}</span>
                    <strong className="metric-value">{mapDocument.tilesets.length}</strong>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">{copy.common.objectGroups}</span>
                    <strong className="metric-value">{mapDocument.objectGroups.length}</strong>
                  </div>
                </div>

                <div className="panel-section-muted panel-section px-3">
                  <div className="kv-row">
                    <span>{copy.common.path}</span>
                    <span>{mapDocument.relativePath}</span>
                  </div>
                  <div className="kv-row">
                    <span>{copy.common.orientation}</span>
                    <span>{mapDocument.orientation}</span>
                  </div>
                  <div className="kv-row">
                    <span>{copy.common.renderOrder}</span>
                    <span>{mapDocument.renderOrder}</span>
                  </div>
                  <div className="kv-row">
                    <span>{copy.common.format}</span>
                    <span>{mapDocument.format.toUpperCase()}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="panel-empty-state">
                {copy.center.noSceneLoaded}
              </div>
            )}
          </div>
        </AccordionSection>

        <AccordionSection
          title={copy.rightDock.layers}
          icon={<Layers className="h-4 w-4" />}
          action={
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
            <div className="panel-empty-state">{copy.center.noSceneLoaded}</div>
          )}
        </AccordionSection>

        <AccordionSection
          title={copy.rightDock.objectGroups}
          icon={<Box className="h-4 w-4" />}
          action={
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
                focusedObjectTarget={focusedObjectTarget}
                onFocusObject={onFocusObject}
              />
            ) : (
              <div className="panel-empty-state">{copy.rightDock.noObjectGroups}</div>
            )
          ) : (
            <div className="panel-empty-state">{copy.center.noSceneLoaded}</div>
          )}
        </AccordionSection>

        <AccordionSection title={copy.rightDock.hoverProbe} icon={<MousePointerSquareDashed className="h-4 w-4" />}>
          <div className="space-y-4 p-3">
            {hoverInfo ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="metric-card">
                    <span className="metric-label">{copy.common.tile}</span>
                    <strong className="metric-value">
                      {hoverInfo.tileX}, {hoverInfo.tileY}
                    </strong>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">{copy.common.pixel}</span>
                    <strong className="metric-value">
                      {hoverInfo.pixelX}, {hoverInfo.pixelY}
                    </strong>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">{copy.common.gid}</span>
                    <strong className="metric-value">{hoverInfo.gid ?? copy.common.none}</strong>
                  </div>
                </div>

                <div className="panel-section-muted panel-section px-3">
                  <div className="kv-row">
                    <span>{copy.common.layer}</span>
                    <span>{hoverInfo.layerName ?? copy.common.none}</span>
                  </div>
                  <div className="kv-row">
                    <span>{copy.common.tileId}</span>
                    <span>{hoverInfo.tileId ?? copy.common.none}</span>
                  </div>
                  <div className="kv-row">
                    <span>{copy.common.tilesets}</span>
                    <span>{hoverInfo.tilesetName ?? copy.common.none}</span>
                  </div>
                </div>

                <div className="panel-section-muted panel-section p-3">
                  <p className="panel-section-title tracking-[0.16em]">
                    {copy.common.tileProperties}
                  </p>
                  <div className="mt-2 space-y-2">
                    {hoverInfo.tileProperties && Object.keys(hoverInfo.tileProperties).length ? (
                      Object.entries(hoverInfo.tileProperties).map(([key, value]) => (
                        <div key={key} className="kv-row py-1.5">
                          <span>{key}</span>
                          <span>{formatPropertyValue(value, copy)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-[var(--text-secondary)]">{copy.rightDock.noTileProperties}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {hoverInfo.objectHits.length ? (
                    hoverInfo.objectHits.map((object) => (
                      <div
                        key={`${object.groupName}:${object.id}`}
                        className="panel-section-muted panel-section p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">
                              {object.name || copy.common.objectLabel(object.id)}
                            </p>
                            <p className="text-xs text-[var(--text-secondary)]">{object.groupName}</p>
                          </div>
                          <span className="dock-chip">{object.type || copy.common.none}</span>
                        </div>
                        <div className="mt-3 space-y-1 text-xs text-[var(--text-secondary)]">
                          <p>
                            {copy.common.bounds}: {object.x}, {object.y} / {object.width} x {object.height}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="panel-empty-state py-4">
                      {copy.rightDock.noHoveredObjects}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="panel-empty-state">
                {copy.viewportLabels.loadPrompt}
              </div>
            )}
          </div>
        </AccordionSection>

        <AccordionSection title={copy.rightDock.diagnostics} icon={<Activity className="h-4 w-4" />}>
          <div className="space-y-4 p-3">
            {directoryInfo ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="metric-card">
                    <span className="metric-label">{copy.common.visibleLayers}</span>
                    <strong className="metric-value">{visibleLayerIds.length}</strong>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">{copy.common.visibleObjects}</span>
                    <strong className="metric-value">{visibleObjectGroupIds.length}</strong>
                  </div>
                </div>

                <div className="panel-section-muted panel-section px-3">
                  <div className="kv-row">
                    <span>{copy.common.executable}</span>
                    <span>{directoryInfo.executablePath}</span>
                  </div>
                  <div className="kv-row">
                    <span>{copy.leftDock.preferredMaps}</span>
                    <span>{directoryInfo.mapsPath ?? copy.common.none}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="panel-empty-state">
                {copy.rightDock.diagnosticsPrompt}
              </div>
            )}

            <div className="panel-section-muted panel-section p-3">
              <p className="panel-section-title tracking-[0.16em]">
                {copy.rightDock.workspaceStatus}
              </p>
              <span className={`mt-2 inline-flex status-pill status-pill-${workspaceStatus.tone}`}>
                {copy.statusTone[workspaceStatus.tone]}
              </span>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                {workspaceStatus.message || copy.statusTone.idle}
              </p>
            </div>
          </div>
        </AccordionSection>
      </div>
    </div>
  )
}
