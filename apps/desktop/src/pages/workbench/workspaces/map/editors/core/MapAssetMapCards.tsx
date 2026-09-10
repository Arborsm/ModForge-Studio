import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as Popover from '@radix-ui/react-popover'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { cx } from '@shared/lib/helper'
import {
  DAY_TILES_PROPERTY_KEY,
  DOORS_PROPERTY_KEY,
  NIGHT_TILES_PROPERTY_KEY,
  WARP_PROPERTY_KEY,
  asMapPropertyString,
  collectCellActions,
  collectWarpEntries,
  findTilesetForGid,
  formatActionWarp,
  formatTouchActionWarp,
  gidAtCell,
  isLightMarkerObject,
  parseCellWarpAction,
  parseDoorGroups,
  parseWarpGroups,
  serializeDoorGroups,
  serializeWarpGroups,
  stripTileGidFlags,
  writeCellAction,
  type CellActionEntry,
  type DoorGroup,
  type MapDocument,
  type MapInspectorHighlight,
  type MapLayer,
  type MapPropertyValue,
  type MapTileRect,
  type WarpGroup,
  type WarpSourceEntry,
} from '@entities/map'
import type { LocaleCode, ThemeMode } from '@locales/api'
import { useMapAuthoringCopy } from '@locales/provider'
import { propertyEditMergeKey } from '../../model/mapHistoryStack'
import { TileIndexPreview, TileRegionPreview, resolveTileIndexTileset } from './tileIndexPreview'
import { WarpDialog, type WarpCarrier, type WarpCarrierOption, type WarpDialogMapOption } from './WarpDialog'
import {
  dayNightColumnsResolver,
  groupDayNightDisplayRects,
  mergeDayNight,
  parseDayNightGroups,
  serializeDayNightGroups,
  type DayNightGroup,
} from './dayNightEntries'
import { DoorDialog, type DoorDialogTarget } from './DoorDialog'
import { DayNightStudioDialog } from './DayNightStudioDialog'
import { WarpTargetPreview } from '../../ui/WarpTargetPreview'

type CardProps = {
  properties: Record<string, MapPropertyValue>
  onChange: (nextProperties: Record<string, MapPropertyValue>, mergeKey?: string | null, label?: string) => void
}

/** Reads a map property as its raw string form (typed envelopes are unwrapped). */
function readPropertyRaw(properties: Record<string, MapPropertyValue>, key: string) {
  return asMapPropertyString(properties[key])
}

/** Writes a raw string into a property, preserving a typed envelope when one exists; empty removes the key. */
function writePropertyRaw(properties: Record<string, MapPropertyValue>, key: string, raw: string): Record<string, MapPropertyValue> {
  const next = { ...properties }
  const trimmed = raw.trim()
  if (!trimmed) {
    delete next[key]
    return next
  }
  const existing = properties[key]
  if (typeof existing === 'object' && existing !== null && 'value' in existing) {
    const typed = existing as {
      value: MapPropertyValue
      tmxType: string
      propertyType?: string
    }
    next[key] =
      typed.propertyType != null
        ? {
            value: trimmed,
            tmxType: typed.tmxType,
            propertyType: typed.propertyType,
          }
        : { value: trimmed, tmxType: typed.tmxType }
  } else {
    next[key] = trimmed
  }
  return next
}

/**
 * Resolves the id of the first `TileData` rule object in the layer-named object
 * group whose pixel rect covers the cell, or null when none does. Mirrors the
 * cell→object mapping of the TMX per-cell carrier, so a hover highlight on an
 * object-backed entry can emphasize exactly the object the game reads.
 */
function tileDataObjectIdAt(document: MapDocument, layerName: string, x: number, y: number): number | null {
  const group = document.objectGroups.find((candidate) => candidate.name === layerName)
  if (!group) return null
  const tileWidth = document.tileWidth
  const tileHeight = document.tileHeight
  const covering = group.objects.find((object) => {
    if (object.name !== 'TileData' || isLightMarkerObject(object)) return false
    const startX = Math.floor(object.x / tileWidth)
    const startY = Math.floor(object.y / tileHeight)
    const endX = Math.floor((object.x + object.width - 1) / tileWidth)
    const endY = Math.floor((object.y + object.height - 1) / tileHeight)
    return x >= startX && x <= endX && y >= startY && y <= endY
  })
  return covering?.id ?? null
}

/** Inspector hover target for one warp entry: the property cell or its per-cell carrier object. */
function warpHighlightTarget(document: MapDocument, entry: WarpSourceEntry | null): MapInspectorHighlight | null {
  if (!entry) return null
  if (entry.kind === 'property') {
    return {
      tileRects: [{ x: entry.group.fromX, y: entry.group.fromY, width: 1, height: 1 }],
      objectIds: [],
    }
  }
  if (entry.source === 'tileDataObject') {
    const layerName = entry.kind === 'touch' ? 'Back' : 'Buildings'
    const objectId = tileDataObjectIdAt(document, layerName, entry.x, entry.y)
    if (objectId != null) return { tileRects: [], objectIds: [objectId] }
  }
  return {
    tileRects: [{ x: entry.x, y: entry.y, width: 1, height: 1 }],
    objectIds: [],
  }
}

/**
 * Content-tab section frame shared by every inspector card list (semantic
 * cards, animations, objects): `title · count` on the left and the section's
 * single add/manage entry as a quiet icon button on the right (guidance lives
 * in the title tooltip, not the body). Sections without entries render the
 * quiet `is-empty` header variant so populated sections stay the visual
 * anchors of the tab.
 */
export function CardSection({
  title,
  countLabel,
  addAction,
  children,
}: {
  title: string
  countLabel?: string | null
  /** Section head action rendered as a quiet icon button (＋ by default). */
  addAction?: { label: string; onClick: () => void; disabled?: boolean; icon?: ReactNode }
  children: ReactNode
}) {
  return (
    <section className={cx('map-asset-card-section', countLabel == null && 'is-empty')}>
      <header>
        <span className="map-asset-card-heading">
          {title}
          {countLabel ? <span className="map-asset-card-count"> · {countLabel}</span> : null}
        </span>
        {addAction ? (
          <button
            type="button"
            className="map-asset-card-add-head"
            aria-label={addAction.label}
            title={addAction.label}
            disabled={addAction.disabled}
            onClick={addAction.onClick}
          >
            {addAction.icon ?? <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
        ) : null}
      </header>
      {children}
    </section>
  )
}

/**
 * Entry list that collapses to the first `threshold` cards and reveals the
 * rest through a "view all N ›" toggle link (the confirmed long-list pattern).
 */
function CollapsibleEntryList({
  cards,
  editLabel,
  onEdit,
  deleteLabel,
  onDelete,
  onHighlightEntry,
  onClearHighlight,
}: {
  cards: ReactNode[]
  editLabel?: string
  onEdit?: (index: number) => void
  deleteLabel: string
  onDelete: (index: number) => void
  /** Hover callback for the entry root; receives the entry index. */
  onHighlightEntry?: (index: number) => void
  /** Leave callback clearing the entry hover highlight. */
  onClearHighlight?: () => void
}) {
  const copy = useMapAuthoringCopy().assetEditor.mapCards
  const [expanded, setExpanded] = useState(false)
  const threshold = 2

  useEffect(() => {
    if (cards.length <= threshold) setExpanded(false)
  }, [cards.length])

  const visibleCards = expanded ? cards : cards.slice(0, threshold)
  return (
    <div className="map-asset-card-list">
      {visibleCards.map((card, index) => (
        <ContextMenu.Root key={index}>
          <ContextMenu.Trigger asChild>
            <div
              className="map-asset-entry-card"
              onPointerEnter={onHighlightEntry ? () => onHighlightEntry(index) : undefined}
              onPointerLeave={onClearHighlight}
            >
              <div className="map-asset-entry-card-body">{card}</div>
              <div className="map-asset-entry-card-actions">
                {onEdit ? (
                  <button
                    type="button"
                    className="icon-button map-asset-entry-card-action"
                    aria-label={editLabel}
                    title={editLabel}
                    onClick={() => onEdit(index)}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="icon-button is-danger map-asset-entry-card-action"
                  aria-label={deleteLabel}
                  title={deleteLabel}
                  onClick={() => onDelete(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
              {onEdit ? (
                <ContextMenu.Item className="context-menu-item" onSelect={() => onEdit(index)}>
                  {editLabel}
                </ContextMenu.Item>
              ) : null}
              <ContextMenu.Item className="context-menu-item is-danger" onSelect={() => onDelete(index)}>
                {deleteLabel}
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ))}
      {cards.length > threshold ? (
        <button type="button" className="map-asset-more-link" onClick={() => setExpanded((current) => !current)}>
          {expanded ? copy.collapseAll : copy.viewAll(cards.length)}
        </button>
      ) : null}
    </div>
  )
}

type WarpDialogState = { kind: 'closed' } | { kind: 'add' } | { kind: 'edit'; entryIndex: number }

/**
 * The warp card edits three carriers at once: the `Warp` map property (rows of
 * `fromX fromY toMap toX toY`), Back-layer per-cell `TouchAction` strings
 * (`Warp <map> <x> <y>`, walked onto by the player) and Buildings-layer
 * per-cell `Action` strings (`Warp <x> <y> <map>`, the door destination).
 * Property entries commit through `onChange`; per-cell entries rewrite the
 * cell's action string through `writeCellAction` on `onUpdateDocument`.
 */
function WarpCard({
  properties,
  onChange,
  document,
  onUpdateDocument,
  renderDocument,
  addNonce = 0,
  onRequestAdd,
  gameRootPath = null,
  locale,
  theme,
  accentColor,
  mapOptions,
  loadTargetDocument,
  onHighlightInspector,
}: CardProps & {
  document: MapDocument
  onUpdateDocument: (nextDocument: MapDocument, mergeKey?: string | null, label?: string) => void
  /** Render document feeding the warp dialog's origin map picker. */
  renderDocument: MapDocument
  /** Monotonic nonce from the section add entry; 0 → positive opens the add dialog. */
  addNonce?: number
  /** Section head ＋ action: asks the parent to open this card's add dialog. */
  onRequestAdd: () => void
  /** Game root used to resolve dynamically referenced vanilla sheets in the origin picker. */
  gameRootPath?: string | null
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  mapOptions: readonly WarpDialogMapOption[]
  loadTargetDocument: (target: string) => Promise<MapDocument>
  onHighlightInspector?: (target: MapInspectorHighlight | null) => void
}) {
  const assetCopy = useMapAuthoringCopy().assetEditor
  const copy = assetCopy.mapCards
  const warpEntries = collectWarpEntries(document)
  const propertyGroups = parseWarpGroups(readPropertyRaw(properties, WARP_PROPERTY_KEY))
  const [dialogState, setDialogState] = useState<WarpDialogState>({
    kind: 'closed',
  })
  const [carrier, setCarrier] = useState<WarpCarrier>('property')
  /** Row currently hovered; mounts its target-map preview popover lazily. */
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  /** Row elements by entry index, anchoring the hovered row's preview popover. */
  const rowElementRefs = useRef(new Map<number, HTMLElement>())
  const seenAddNonceRef = useRef(0)

  useEffect(() => {
    if (addNonce > 0 && addNonce !== seenAddNonceRef.current) {
      seenAddNonceRef.current = addNonce
      openAdd()
    }
  }, [addNonce])

  function commitGroups(nextGroups: readonly WarpGroup[]) {
    onChange(
      writePropertyRaw(properties, WARP_PROPERTY_KEY, serializeWarpGroups(nextGroups, propertyGroups.leftover)),
      null,
      assetCopy.editWarp,
    )
  }

  /**
   * Applies one per-cell action write onto `base` and returns the next
   * document; when the cell already carries a different non-empty value, the
   * change is confirmed first (an empty value is a delete and never confirms).
   * Returns null when the change was rejected by the user.
   */
  function applyCellAction(
    base: MapDocument,
    layerName: string,
    key: string,
    point: { x: number; y: number },
    value: string,
  ): MapDocument | null {
    const existing = collectCellActions(base, layerName, [key]).find((entry) => entry.x === point.x && entry.y === point.y)
    const trimmed = value.trim()
    if (trimmed && existing && existing.value !== trimmed && !globalThis.confirm(copy.warpReplaceConfirm)) {
      return null
    }
    return writeCellAction(base, layerName, point, key, value)
  }

  function commitCellAction(layerName: string, key: string, point: { x: number; y: number }, value: string) {
    const next = applyCellAction(document, layerName, key, point, value)
    if (next) onUpdateDocument(next, null, assetCopy.editWarp)
  }

  // Carrier labels/descriptions for the dialog's select; disabled state is
  // derived inside the dialog from its own picked origin cell.
  const carrierOptions: readonly WarpCarrierOption[] = [
    {
      value: 'property',
      label: copy.warpCarrierProperty,
      description: copy.warpCarrierPropertyHint,
    },
    {
      value: 'touch',
      label: copy.warpCarrierTouch,
      description: copy.warpCarrierTouchHint,
    },
    {
      value: 'action',
      label: copy.warpCarrierAction,
      description: copy.warpCarrierActionHint,
    },
  ]

  function openAdd() {
    setCarrier('property')
    setDialogState({ kind: 'add' })
  }

  function openEdit(index: number) {
    const entry = warpEntries[index]
    if (!entry) return
    setCarrier(entry.kind === 'property' ? 'property' : entry.kind)
    setDialogState({ kind: 'edit', entryIndex: index })
  }

  const dialogEntry = dialogState.kind === 'edit' ? warpEntries[dialogState.entryIndex] : null

  function handleConfirm(confirmCarrier: WarpCarrier, origin: { x: number; y: number }, toMap: string, toX: number, toY: number) {
    if (dialogState.kind === 'add') {
      if (confirmCarrier === 'property') {
        commitGroups([...propertyGroups.groups, { fromX: origin.x, fromY: origin.y, toMap, toX, toY }])
      } else if (confirmCarrier === 'touch') {
        commitCellAction('Back', 'TouchAction', origin, formatTouchActionWarp(toMap, toX, toY))
      } else {
        commitCellAction('Buildings', 'Action', origin, formatActionWarp(toX, toY, toMap))
      }
    } else if (dialogState.kind === 'edit' && dialogEntry) {
      if (dialogEntry.kind === 'property') {
        commitGroups(
          propertyGroups.groups.map((group, index) =>
            index === dialogEntry.index ? { ...group, fromX: origin.x, fromY: origin.y, toMap, toX, toY } : group,
          ),
        )
      } else if (dialogEntry.kind === 'touch') {
        let base: MapDocument | null = document
        if (dialogEntry.x !== origin.x || dialogEntry.y !== origin.y) {
          base = applyCellAction(base, 'Back', 'TouchAction', { x: dialogEntry.x, y: dialogEntry.y }, '')
        }
        const next = base ? applyCellAction(base, 'Back', 'TouchAction', origin, formatTouchActionWarp(toMap, toX, toY)) : null
        if (next) onUpdateDocument(next, null, assetCopy.editWarp)
      } else {
        let base: MapDocument | null = document
        if (dialogEntry.x !== origin.x || dialogEntry.y !== origin.y) {
          base = applyCellAction(base, 'Buildings', 'Action', { x: dialogEntry.x, y: dialogEntry.y }, '')
        }
        const next = base ? applyCellAction(base, 'Buildings', 'Action', origin, formatActionWarp(toX, toY, toMap)) : null
        if (next) onUpdateDocument(next, null, assetCopy.editWarp)
      }
    }
    setDialogState({ kind: 'closed' })
  }

  function deleteEntry(index: number) {
    const entry = warpEntries[index]
    if (!entry) return
    if (entry.kind === 'property') {
      commitGroups(propertyGroups.groups.filter((_, groupIndex) => groupIndex !== entry.index))
    } else if (entry.kind === 'touch') {
      commitCellAction('Back', 'TouchAction', { x: entry.x, y: entry.y }, '')
    } else {
      commitCellAction('Buildings', 'Action', { x: entry.x, y: entry.y }, '')
    }
  }

  // Origin rectangles of every existing warp, framed as picker highlights in
  // the dialog; the entry being edited is excluded so its origin stays free.
  const isEditedEntry = (entry: WarpSourceEntry) => {
    if (!dialogEntry) return false
    if (entry.kind === 'property' && dialogEntry.kind === 'property') return entry.index === dialogEntry.index
    if (entry.kind !== 'property' && dialogEntry.kind !== 'property') {
      return entry.kind === dialogEntry.kind && entry.x === dialogEntry.x && entry.y === dialogEntry.y
    }
    return false
  }
  const warpOriginRects: MapTileRect[] = warpEntries
    .filter((entry) => !isEditedEntry(entry))
    .map((entry) =>
      entry.kind === 'property'
        ? { x: entry.group.fromX, y: entry.group.fromY, width: 1, height: 1 }
        : { x: entry.x, y: entry.y, width: 1, height: 1 },
    )

  return (
    <>
      <CardSection
        title={copy.warpsTitle}
        countLabel={warpEntries.length > 0 ? String(warpEntries.length) : null}
        addAction={{ label: copy.addWarp, onClick: onRequestAdd }}
      >
        {warpEntries.length > 0 ? (
          <CollapsibleEntryList
            cards={warpEntries.map((entry, index) => {
              const title =
                entry.kind === 'property'
                  ? copy.warpSummaryTitle(entry.group.fromX, entry.group.fromY, entry.group.toMap)
                  : copy.warpSummaryTitle(entry.x, entry.y, entry.toMap)
              const landing =
                entry.kind === 'property'
                  ? copy.warpSummaryLanding(entry.group.toX, entry.group.toY)
                  : copy.warpSummaryLanding(entry.toX, entry.toY)
              const sourceLabel =
                entry.kind === 'property' ? copy.warpSourceProperty : entry.kind === 'touch' ? copy.warpSourceTouch : copy.warpSourceAction
              // The source cell's tile as the row's icon block; warps on empty
              // cells (property rows over void) render text-only.
              const sourceLayer = entry.kind === 'action' ? 'Buildings' : 'Back'
              const sourceX = entry.kind === 'property' ? entry.group.fromX : entry.x
              const sourceY = entry.kind === 'property' ? entry.group.fromY : entry.y
              const sourceGid = stripTileGidFlags(gidAtCell(document, sourceLayer, sourceX, sourceY))
              const sourceTileset = sourceGid !== 0 ? findTilesetForGid(document.tilesets, sourceGid) : null
              const target = entry.kind === 'property' ? entry.group.toMap : entry.toMap
              const targetX = entry.kind === 'property' ? entry.group.toX : entry.toX
              const targetY = entry.kind === 'property' ? entry.group.toY : entry.toY
              return (
                <Fragment key={`${entry.kind}:${entry.kind === 'property' ? entry.index : `${entry.x},${entry.y}`}`}>
                  <div
                    className="map-asset-warp-ref"
                    ref={(node) => {
                      if (node) rowElementRefs.current.set(index, node)
                      else rowElementRefs.current.delete(index)
                    }}
                  >
                    {sourceTileset ? (
                      <span className="map-asset-entry-thumbs">
                        <TileIndexPreview
                          renderDocument={renderDocument}
                          layerName={sourceLayer}
                          x={sourceX}
                          y={sourceY}
                          tileIndex={sourceGid - sourceTileset.firstGid}
                          label={title}
                          gameRootPath={gameRootPath}
                        />
                      </span>
                    ) : null}
                    <div className="map-asset-entry-card-text">
                      <strong>{title}</strong>
                      <small>{landing}</small>
                    </div>
                    <span className="map-asset-entry-tag">{sourceLabel}</span>
                    <Popover.Root open={previewIndex === index}>
                      <Popover.Anchor virtualRef={{ current: rowElementRefs.current.get(index) ?? null }} />
                      <Popover.Portal>
                        <Popover.Content
                          side="top"
                          align="end"
                          sideOffset={6}
                          collisionPadding={12}
                          className="map-asset-warp-preview-pop"
                          onOpenAutoFocus={(event) => event.preventDefault()}
                        >
                          <WarpTargetPreview
                            target={target}
                            x={targetX}
                            y={targetY}
                            locale={locale}
                            theme={theme}
                            accentColor={accentColor}
                            loadTargetDocument={loadTargetDocument}
                          />
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  </div>
                </Fragment>
              )
            })}
            editLabel={copy.warpEdit}
            onEdit={openEdit}
            deleteLabel={copy.deleteEntry}
            onDelete={deleteEntry}
            onHighlightEntry={(index) => {
              setPreviewIndex(index)
              onHighlightInspector?.(warpHighlightTarget(document, warpEntries[index] ?? null))
            }}
            onClearHighlight={() => {
              setPreviewIndex(null)
              onHighlightInspector?.(null)
            }}
          />
        ) : null}
      </CardSection>
      <WarpDialog
        open={dialogState.kind !== 'closed'}
        document={document}
        renderDocument={renderDocument}
        initialMap={dialogEntry ? (dialogEntry.kind === 'property' ? dialogEntry.group.toMap : dialogEntry.toMap) : ''}
        initialX={dialogEntry ? (dialogEntry.kind === 'property' ? dialogEntry.group.toX : dialogEntry.toX) : 0}
        initialY={dialogEntry ? (dialogEntry.kind === 'property' ? dialogEntry.group.toY : dialogEntry.toY) : 0}
        initialOrigin={
          dialogEntry
            ? dialogEntry.kind === 'property'
              ? { x: dialogEntry.group.fromX, y: dialogEntry.group.fromY }
              : { x: dialogEntry.x, y: dialogEntry.y }
            : null
        }
        originRects={warpOriginRects}
        gameRootPath={gameRootPath}
        carrier={carrier}
        carrierOptions={dialogState.kind === 'add' ? carrierOptions : []}
        onCarrierChange={setCarrier}
        mapOptions={mapOptions}
        locale={locale}
        theme={theme}
        accentColor={accentColor}
        loadTargetDocument={loadTargetDocument}
        onClose={() => setDialogState({ kind: 'closed' })}
        onConfirm={handleConfirm}
      />
    </>
  )
}

/**
 * The doors card manages the `Doors` map property (door tiles) and, for each
 * door, the Buildings-layer per-cell `Action` that sends the player through
 * it. Door cards show the linked destination when the cell has one and flag
 * cells that hold a conflicting non-warp action; the dialog picks the door's
 * cell on the embedded map and can write the door's destination action
 * together with the door entry, and opens for an existing entry (row edit) to
 * re-pick its cell and destination. The section renders nothing when no door
 * entries exist (and no dialog is open).
 */
function DoorsCard({
  properties,
  onChange,
  document,
  onUpdateDocument,
  renderDocument,
  activeLayer,
  addNonce = 0,
  onRequestAdd,
  mapOptions,
  loadTargetDocument,
  onHighlightInspector,
  gameRootPath = null,
  locale,
  theme,
  accentColor,
}: CardProps & {
  document: MapDocument
  onUpdateDocument: (nextDocument: MapDocument, mergeKey?: string | null, label?: string) => void
  renderDocument: MapDocument
  activeLayer?: MapLayer | null
  /** Monotonic nonce from the section add entry; 0 → positive opens the add dialog. */
  addNonce?: number
  /** Section head ＋ action: asks the parent to open this card's add dialog. */
  onRequestAdd: () => void
  mapOptions: readonly WarpDialogMapOption[]
  loadTargetDocument: (target: string) => Promise<MapDocument>
  onHighlightInspector?: (target: MapInspectorHighlight | null) => void
  gameRootPath?: string | null
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
}) {
  const assetCopy = useMapAuthoringCopy().assetEditor
  const copy = assetCopy.mapCards
  const { groups, leftover } = parseDoorGroups(readPropertyRaw(properties, DOORS_PROPERTY_KEY))
  const [dialogState, setDialogState] = useState<{ kind: 'closed' } | { kind: 'add' } | { kind: 'edit'; index: number }>({
    kind: 'closed',
  })
  const seenAddNonceRef = useRef(0)

  useEffect(() => {
    if (addNonce > 0 && addNonce !== seenAddNonceRef.current) {
      seenAddNonceRef.current = addNonce
      setDialogState({ kind: 'add' })
    }
  }, [addNonce])

  const buildingsLayer = document.layers.find((layer) => layer.name.trim().toLowerCase() === 'buildings')
  const actionLayerName = buildingsLayer?.name ?? 'Buildings'
  const doorLayerName = buildingsLayer?.name ?? activeLayer?.name ?? ''

  // One Action per cell (cellProperties wins over TileData objects), so each
  // door card can show where its cell sends the player.
  const doorActions = new Map<string, CellActionEntry>()
  for (const action of collectCellActions(document, actionLayerName, ['Action'])) {
    if (!doorActions.has(`${action.x},${action.y}`)) {
      doorActions.set(`${action.x},${action.y}`, action)
    }
  }

  function commit(nextGroups: readonly DoorGroup[]) {
    onChange(writePropertyRaw(properties, DOORS_PROPERTY_KEY, serializeDoorGroups(nextGroups, leftover)), null, assetCopy.editDoor)
  }

  /** Commits the door groups and, when the dialog asked for it, the cell's warp Action. */
  function commitWithTarget(nextGroups: readonly DoorGroup[], point: { x: number; y: number }, target: DoorDialogTarget) {
    const nextProperties = writePropertyRaw(properties, DOORS_PROPERTY_KEY, serializeDoorGroups(nextGroups, leftover))
    let nextDocument = document
    if (target.setTarget && target.toMap.trim()) {
      const value = formatActionWarp(target.toX, target.toY, target.toMap.trim())
      const existing = doorActions.get(`${point.x},${point.y}`)
      if (existing && existing.value !== value && !globalThis.confirm(copy.warpReplaceConfirm)) {
        return
      }
      nextDocument = writeCellAction(nextDocument, actionLayerName, point, 'Action', value)
    }
    if (nextDocument === document) {
      onChange(nextProperties, null, assetCopy.editDoor)
    } else {
      onUpdateDocument({ ...nextDocument, properties: nextProperties }, null, assetCopy.editDoor)
    }
  }

  /**
   * Commits the door entry confirmed by the dialog: the sheet/tile pair is
   * re-derived from the dialog-reported cell (the tile preview inside the
   * dialog used the same derivation), then the destination action is written.
   * Editing replaces the entry in place; the door's own destination follows
   * the door — a warp-shaped action on the old cell moves to the new cell
   * (the dialog's destination, when set, wins), non-warp actions stay put.
   */
  function handleConfirm(point: { x: number; y: number }, target: DoorDialogTarget) {
    const gid = doorLayerName ? gidAtCell(document, doorLayerName, point.x, point.y) : 0
    const tileset = gid !== 0 ? findTilesetForGid(document.tilesets, gid) : null
    if (!tileset) return
    const nextDoor = {
      x: point.x,
      y: point.y,
      sheet: document.tilesets.indexOf(tileset) + 1,
      tileIndex: gid - tileset.firstGid,
    }
    if (dialogState.kind === 'add') {
      commitWithTarget([...groups, nextDoor], point, target)
      setDialogState({ kind: 'closed' })
      return
    }
    if (dialogState.kind !== 'edit') return
    const edited = groups[dialogState.index]
    if (!edited) return
    const cellChanged = edited.x !== point.x || edited.y !== point.y
    const oldAction = doorActions.get(`${edited.x},${edited.y}`)
    const oldWarp = oldAction ? parseCellWarpAction(oldAction.value) : null
    const destination = target.setTarget
      ? { toMap: target.toMap.trim(), toX: target.toX, toY: target.toY }
      : cellChanged && oldWarp
        ? { toMap: oldWarp.toMap, toX: oldWarp.toX, toY: oldWarp.toY }
        : null
    if (destination) {
      const value = formatActionWarp(destination.toX, destination.toY, destination.toMap)
      const existing = doorActions.get(`${point.x},${point.y}`)
      if (existing && existing.value !== value && !globalThis.confirm(copy.warpReplaceConfirm)) return
    }
    let nextDocument = document
    if (cellChanged && oldWarp) {
      nextDocument = writeCellAction(nextDocument, actionLayerName, { x: edited.x, y: edited.y }, 'Action', '')
    }
    if (destination) {
      nextDocument = writeCellAction(
        nextDocument,
        actionLayerName,
        point,
        'Action',
        formatActionWarp(destination.toX, destination.toY, destination.toMap),
      )
    }
    const nextGroups = groups.map((group, index) => (index === dialogState.index ? nextDoor : group))
    const nextProperties = writePropertyRaw(properties, DOORS_PROPERTY_KEY, serializeDoorGroups(nextGroups, leftover))
    onUpdateDocument({ ...nextDocument, properties: nextProperties }, null, assetCopy.editDoor)
    setDialogState({ kind: 'closed' })
  }

  // Edit draft handed to the dialog: the edited door's cell plus its current
  // destination (when the cell's action parses as a warp).
  const editDoorDraft =
    dialogState.kind === 'edit'
      ? (() => {
          const door = groups[dialogState.index]
          if (!door) return null
          const action = doorActions.get(`${door.x},${door.y}`)
          const parsed = action ? parseCellWarpAction(action.value) : null
          return {
            x: door.x,
            y: door.y,
            setTarget: parsed != null,
            toMap: parsed?.toMap ?? '',
            toX: parsed?.toX ?? 0,
            toY: parsed?.toY ?? 0,
          }
        })()
      : null

  // Existing door cells framed as picker highlights; the entry being edited
  // stays out so its own cell remains free in the dialog.
  const existingDoorRects: MapTileRect[] = groups
    .filter((_, index) => dialogState.kind !== 'edit' || index !== dialogState.index)
    .map((door) => ({
      x: door.x,
      y: door.y,
      width: 1,
      height: 1,
    }))

  return (
    <>
      <CardSection
        title={copy.doorsTitle}
        countLabel={groups.length > 0 ? String(groups.length) : null}
        addAction={{ label: copy.addDoor, onClick: onRequestAdd }}
      >
        {groups.length > 0 ? (
          <CollapsibleEntryList
            cards={groups.map((door) => {
              const action = doorActions.get(`${door.x},${door.y}`)
              const target = action ? parseCellWarpAction(action.value) : null
              return (
                <div className="map-asset-tile-ref" key={`${door.x},${door.y}`}>
                  <span className="map-asset-entry-thumbs">
                    <TileIndexPreview
                      renderDocument={renderDocument}
                      layerName={doorLayerName}
                      x={door.x}
                      y={door.y}
                      tileIndex={door.tileIndex}
                      label={copy.doorTileIndex}
                      gameRootPath={gameRootPath}
                    />
                  </span>
                  <div className="map-asset-entry-card-text">
                    <strong>{target ? copy.doorSummary(door.x, door.y, target.toMap) : copy.doorEntry(door.x, door.y)}</strong>
                    <small>
                      {target ? copy.warpSummaryLanding(target.toX, target.toY) : action ? copy.doorTargetConflict : copy.doorTargetMissing}
                    </small>
                  </div>
                </div>
              )
            })}
            deleteLabel={copy.deleteEntry}
            editLabel={copy.doorEdit}
            onEdit={(index) => setDialogState({ kind: 'edit', index })}
            onDelete={(index) => commit(groups.filter((_, groupIndex) => groupIndex !== index))}
            onHighlightEntry={(index) => {
              const door = groups[index]
              onHighlightInspector?.(
                door
                  ? {
                      tileRects: [{ x: door.x, y: door.y, width: 1, height: 1 }],
                      objectIds: [],
                    }
                  : null,
              )
            }}
            onClearHighlight={() => onHighlightInspector?.(null)}
          />
        ) : null}
      </CardSection>
      <DoorDialog
        open={dialogState.kind !== 'closed'}
        document={document}
        renderDocument={renderDocument}
        layerName={doorLayerName}
        existingDoorRects={existingDoorRects}
        editDoor={editDoorDraft}
        gameRootPath={gameRootPath}
        mapOptions={mapOptions}
        loadTargetDocument={loadTargetDocument}
        locale={locale}
        theme={theme}
        accentColor={accentColor}
        onClose={() => setDialogState({ kind: 'closed' })}
        onConfirm={handleConfirm}
      />
    </>
  )
}

/**
 * The day/night card manages the paired `DayTiles`/`NightTiles` map
 * properties: cells that swap to another tile index at night. Display entries
 * are collapsed into contiguous rectangles, one list card per rectangle; the
 * studio dialog captures the cell (map picker), the day tile (auto-derived
 * from the cell's gid) and the night tile (sheet pick on the day tile's own
 * tileset) in one pass. The section head always renders so its ＋ stays
 * reachable; the entry list appears once swaps exist.
 */
function DayNightCard({
  properties,
  onChange,
  document,
  renderDocument,
  activeLayer,
  addNonce = 0,
  onRequestAdd,
  onHighlightInspector,
  gameRootPath = null,
  locale,
  theme,
  accentColor,
}: CardProps & {
  document: MapDocument
  renderDocument: MapDocument
  activeLayer?: MapLayer | null
  /** Monotonic nonce from the section add entry; 0 → positive opens the add dialog. */
  addNonce?: number
  /** Section head ＋ action: asks the parent to open this card's add dialog. */
  onRequestAdd: () => void
  onHighlightInspector?: (target: MapInspectorHighlight | null) => void
  gameRootPath?: string | null
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
}) {
  const assetCopy = useMapAuthoringCopy().assetEditor
  const copy = assetCopy.mapCards
  const day = parseDayNightGroups(readPropertyRaw(properties, DAY_TILES_PROPERTY_KEY))
  const night = parseDayNightGroups(readPropertyRaw(properties, NIGHT_TILES_PROPERTY_KEY))
  const entries = mergeDayNight(day.groups, night.groups)
  /** Display entries collapsed into commit rectangles; one list card per rectangle. */
  const rects = groupDayNightDisplayRects(entries, dayNightColumnsResolver(document))
  const [studioState, setStudioState] = useState<{ kind: 'closed' } | { kind: 'add' } | { kind: 'edit'; index: number }>({
    kind: 'closed',
  })
  const seenAddNonceRef = useRef(0)

  useEffect(() => {
    if (addNonce > 0 && addNonce !== seenAddNonceRef.current) {
      seenAddNonceRef.current = addNonce
      setStudioState({ kind: 'add' })
    }
  }, [addNonce])

  /** Deletes one display rectangle: every covered cell is removed from both day and night groups. */
  function removeEntry(index: number) {
    const rect = rects[index]
    if (!rect) return
    const cellKeys = new Set(rect.cells.map((cell) => `${cell.x},${cell.y}`))
    const matches = (group: DayNightGroup) => group.layer === rect.layer && cellKeys.has(`${group.x},${group.y}`)
    let next = properties
    next = writePropertyRaw(
      next,
      DAY_TILES_PROPERTY_KEY,
      serializeDayNightGroups(
        day.groups.filter((group) => !matches(group)),
        day.leftover,
      ),
    )
    next = writePropertyRaw(
      next,
      NIGHT_TILES_PROPERTY_KEY,
      serializeDayNightGroups(
        night.groups.filter((group) => !matches(group)),
        night.leftover,
      ),
    )
    onChange(next, null, assetCopy.editDayNight)
  }

  /**
   * Commits the swaps confirmed by the studio: every covered cell is first
   * removed from both day and night groups (so editing replaces in place),
   * then the new day values — and the night values for cells with one — are
   * appended.
   */
  function commitSwap(payload: { layer: string; cells: { x: number; y: number; dayTile: number; nightTile: number | null }[] }) {
    const cellKeys = new Set(payload.cells.map((cell) => `${cell.x},${cell.y}`))
    const kept = (group: DayNightGroup) => !(group.layer === payload.layer && cellKeys.has(`${group.x},${group.y}`))
    let next = properties
    next = writePropertyRaw(
      next,
      DAY_TILES_PROPERTY_KEY,
      serializeDayNightGroups(
        [
          ...day.groups.filter(kept),
          ...payload.cells.map((cell) => ({
            layer: payload.layer,
            x: cell.x,
            y: cell.y,
            tileIndex: cell.dayTile,
          })),
        ],
        day.leftover,
      ),
    )
    next = writePropertyRaw(
      next,
      NIGHT_TILES_PROPERTY_KEY,
      serializeDayNightGroups(
        [
          ...night.groups.filter(kept),
          ...payload.cells.flatMap((cell) =>
            cell.nightTile != null ? [{ layer: payload.layer, x: cell.x, y: cell.y, tileIndex: cell.nightTile }] : [],
          ),
        ],
        night.leftover,
      ),
    )
    onChange(next, null, assetCopy.editDayNight)
    setStudioState({ kind: 'closed' })
  }

  const entryCards = rects.map((rect) => {
    const isBlock = rect.width !== 1 || rect.height !== 1
    const title = isBlock
      ? copy.pickedRect(rect.layer, rect.x, rect.y, rect.width, rect.height)
      : copy.pickedCell(rect.layer, rect.x, rect.y)
    // Day and night tiles live on the same sheet (the studio locks the night
    // pick to the day tiles' tileset), so one resolution serves both sides.
    const anchorTile = rect.cells.find((cell) => cell.dayTile != null)?.dayTile ?? rect.cells[0]?.nightTile ?? null
    const tileset = anchorTile != null ? resolveTileIndexTileset(renderDocument, rect.layer, rect.x, rect.y, anchorTile) : null
    const dayCells = rect.cells.flatMap((cell) =>
      cell.dayTile != null ? [{ dx: cell.x - rect.x, dy: cell.y - rect.y, tileIndex: cell.dayTile }] : [],
    )
    const nightCells = rect.cells.flatMap((cell) =>
      cell.nightTile != null ? [{ dx: cell.x - rect.x, dy: cell.y - rect.y, tileIndex: cell.nightTile }] : [],
    )
    return (
      <div className="map-asset-tile-ref" key={`${rect.layer}\u0000${rect.x},${rect.y}`}>
        <div className="map-asset-entry-thumbs">
          {dayCells.length > 0 ? (
            <TileRegionPreview
              renderDocument={renderDocument}
              tileset={tileset}
              width={rect.width}
              height={rect.height}
              cells={dayCells}
              label={copy.dayNightDayTile}
              gameRootPath={gameRootPath}
            />
          ) : null}
          {dayCells.length > 0 && nightCells.length > 0 ? (
            <span className="map-asset-daynight-preview-swap" aria-hidden="true">
              ⇄
            </span>
          ) : null}
          {nightCells.length > 0 ? (
            <TileRegionPreview
              renderDocument={renderDocument}
              tileset={tileset}
              width={rect.width}
              height={rect.height}
              cells={nightCells}
              label={copy.dayNightNightTile}
              gameRootPath={gameRootPath}
            />
          ) : null}
        </div>
        <div className="map-asset-entry-card-text">
          <strong>{title}</strong>
          {isBlock ? <small>{copy.dayNightBlockCells(rect.cells.length)}</small> : null}
        </div>
      </div>
    )
  })

  return (
    <>
      <CardSection
        title={copy.dayNightTitle}
        countLabel={rects.length > 0 ? copy.dayNightCount(rects.length) : null}
        addAction={{ label: copy.dayNightStudioAddTitle, onClick: onRequestAdd }}
      >
        {rects.length > 0 ? (
          <CollapsibleEntryList
            cards={entryCards}
            editLabel={copy.dayNightEdit}
            onEdit={(index) => setStudioState({ kind: 'edit', index })}
            deleteLabel={copy.deleteEntry}
            onDelete={removeEntry}
            onHighlightEntry={(index) => {
              const rect = rects[index]
              onHighlightInspector?.(
                rect
                  ? {
                      tileRects: [
                        {
                          x: rect.x,
                          y: rect.y,
                          width: rect.width,
                          height: rect.height,
                        },
                      ],
                      objectIds: [],
                    }
                  : null,
              )
            }}
            onClearHighlight={() => onHighlightInspector?.(null)}
          />
        ) : null}
      </CardSection>
      <DayNightStudioDialog
        open={studioState.kind !== 'closed'}
        document={document}
        renderDocument={renderDocument}
        activeLayerName={activeLayer?.name}
        editEntry={
          studioState.kind === 'edit'
            ? (() => {
                const rect = rects[studioState.index]
                if (!rect) return null
                const cell = rect.cells[0]
                return {
                  layer: rect.layer,
                  x: cell.x,
                  y: cell.y,
                  dayTile: cell.dayTile,
                  nightTile: cell.nightTile,
                }
              })()
            : null
        }
        gameRootPath={gameRootPath}
        locale={locale}
        theme={theme}
        accentColor={accentColor}
        onClose={() => setStudioState({ kind: 'closed' })}
        onConfirm={commitSwap}
      />
    </>
  )
}

export type MapAssetMapCardsProps = {
  document: MapDocument
  /** Render document whose tileset image paths are loadable data URLs (used by tile previews and dialog map pickers). */
  renderDocument: MapDocument
  onUpdateDocument: (nextDocument: MapDocument, mergeKey?: string | null, label?: string) => void
  /** Active layer; feeds the door capture rows and the day/night studio's preselected layer. */
  activeLayer?: MapLayer | null
  /** Target-map choices for the warp dialog (localized names from the map catalog). */
  mapOptions: readonly WarpDialogMapOption[]
  /** Loads a target map document for the warp destination preview. */
  loadTargetDocument: (target: string) => Promise<MapDocument>
  /** Reports the hovered entry's canvas highlight (cells/objects); null clears it. */
  onHighlightInspector?: (target: MapInspectorHighlight | null) => void
  /** Game root used to resolve dynamically referenced vanilla sheets in tile previews. */
  gameRootPath?: string | null
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
}

/**
 * Semantic map-property cards for the asset editor inspector's content tab:
 * warp entries (dialog-picked origin + destination), doors and day/night
 * swaps, each a section whose head ＋ opens its own add dialog directly. The
 * warp and door dialogs pick their cell on an embedded map picker, so adding
 * never requires a canvas pick first; warps and doors read and write both
 * `document.properties` and per-cell action strings through
 * `onUpdateDocument`; music and ambient light live in the top-bar chips.
 */
export function MapAssetMapCards({
  document,
  renderDocument,
  onUpdateDocument,
  activeLayer,
  mapOptions,
  loadTargetDocument,
  onHighlightInspector,
  gameRootPath = null,
  locale,
  theme,
  accentColor,
}: MapAssetMapCardsProps) {
  const copy = useMapAuthoringCopy().assetEditor
  const updateProperties = (nextProperties: Record<string, MapPropertyValue>, mergeKey?: string | null, label?: string) =>
    onUpdateDocument(
      { ...document, properties: nextProperties },
      mergeKey ?? propertyEditMergeKey('map-property', document.properties, nextProperties as Record<string, unknown>),
      label ?? copy.editMapProperties,
    )
  // Each section head's ＋ opens its own card's add dialog through a monotonic
  // per-type nonce; the card watches its nonce and opens on 0 → positive.
  const [addSignal, setAddSignal] = useState<{
    type: 'warp' | 'door' | 'dayNight'
    nonce: number
  } | null>(null)
  const nextAddNonceRef = useRef(1)

  /** Bumps the type's nonce so the matching card opens its add dialog. */
  function requestAdd(type: 'warp' | 'door' | 'dayNight') {
    setAddSignal({ type, nonce: nextAddNonceRef.current })
    nextAddNonceRef.current += 1
  }

  return (
    <div className="map-asset-card-stack">
      <WarpCard
        properties={document.properties}
        onChange={updateProperties}
        document={document}
        onUpdateDocument={onUpdateDocument}
        renderDocument={renderDocument}
        addNonce={addSignal?.type === 'warp' ? addSignal.nonce : 0}
        onRequestAdd={() => requestAdd('warp')}
        gameRootPath={gameRootPath}
        locale={locale}
        theme={theme}
        accentColor={accentColor}
        mapOptions={mapOptions}
        loadTargetDocument={loadTargetDocument}
        onHighlightInspector={onHighlightInspector}
      />
      <DoorsCard
        properties={document.properties}
        onChange={updateProperties}
        document={document}
        onUpdateDocument={onUpdateDocument}
        renderDocument={renderDocument}
        activeLayer={activeLayer}
        addNonce={addSignal?.type === 'door' ? addSignal.nonce : 0}
        onRequestAdd={() => requestAdd('door')}
        mapOptions={mapOptions}
        loadTargetDocument={loadTargetDocument}
        onHighlightInspector={onHighlightInspector}
        gameRootPath={gameRootPath}
        locale={locale}
        theme={theme}
        accentColor={accentColor}
      />
      <DayNightCard
        properties={document.properties}
        onChange={updateProperties}
        document={document}
        renderDocument={renderDocument}
        activeLayer={activeLayer}
        addNonce={addSignal?.type === 'dayNight' ? addSignal.nonce : 0}
        onRequestAdd={() => requestAdd('dayNight')}
        onHighlightInspector={onHighlightInspector}
        gameRootPath={gameRootPath}
        locale={locale}
        theme={theme}
        accentColor={accentColor}
      />
    </div>
  )
}
