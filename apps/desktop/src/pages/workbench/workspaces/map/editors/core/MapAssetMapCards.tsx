import { useEffect, useState, type ReactNode } from 'react'
import { DoorOpen, MapPin, Pencil, Plus, SunMoon, Trash2 } from 'lucide-react'
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
  isLightMarkerObject,
  parseCellWarpAction,
  parseDoorGroups,
  parseWarpGroups,
  resolveTilesetImagePath,
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
  type MapTileset,
  type MapTilesetPaletteSelection,
  type WarpGroup,
  type WarpSourceEntry,
} from '@entities/map'
import type { LocaleCode, ThemeMode } from '@locales/api'
import { useEditorCopy, useLocale, useMapAuthoringCopy } from '@locales/provider'
import { loadImage } from '@entities/map/ui/mapViewportHelpers'
import { propertyEditMergeKey } from '../../model/mapHistoryStack'
import { WarpDialog, type WarpCarrier, type WarpCarrierOption, type WarpDialogMapOption } from './WarpDialog'
import { groupDayNightRects, mergeDayNight, parseDayNightGroups, serializeDayNightGroups, type DayNightGroup } from './dayNightEntries'

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
    const typed = existing as { value: MapPropertyValue; tmxType: string; propertyType?: string }
    next[key] =
      typed.propertyType != null
        ? { value: trimmed, tmxType: typed.tmxType, propertyType: typed.propertyType }
        : { value: trimmed, tmxType: typed.tmxType }
  } else {
    next[key] = trimmed
  }
  return next
}

/** Returns the flag-stripped gid at (x, y) on the named layer, or 0 when the layer/cell is missing or out of range. */
function gidAtCell(document: MapDocument, layerName: string, x: number, y: number) {
  const layer = document.layers.find((candidate) => candidate.name === layerName)
  if (!layer || x < 0 || y < 0 || x >= layer.width || y >= layer.height) return 0
  return stripTileGidFlags(layer.gids[y * layer.width + x] >>> 0)
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
    return { tileRects: [{ x: entry.group.fromX, y: entry.group.fromY, width: 1, height: 1 }], objectIds: [] }
  }
  if (entry.source === 'tileDataObject') {
    const layerName = entry.kind === 'touch' ? 'Back' : 'Buildings'
    const objectId = tileDataObjectIdAt(document, layerName, entry.x, entry.y)
    if (objectId != null) return { tileRects: [], objectIds: [objectId] }
  }
  return { tileRects: [{ x: entry.x, y: entry.y, width: 1, height: 1 }], objectIds: [] }
}

/**
 * Section header per the v2.8 inspector: title · count on the left, a quiet
 * ＋ that owns the add operation (guidance lives in the button's tooltip).
 */
function CardSection({
  title,
  countLabel,
  addTitle,
  addDisabled,
  onAdd,
  children,
}: {
  title: string
  countLabel?: string | null
  addTitle?: string
  addDisabled?: boolean
  onAdd?: () => void
  children: ReactNode
}) {
  return (
    <section className="map-asset-card-section">
      <header>
        <span className="map-asset-card-heading">
          {title}
          {countLabel ? <span className="map-asset-card-count"> · {countLabel}</span> : null}
        </span>
        {onAdd ? (
          <button
            type="button"
            className="map-asset-card-add-head"
            title={addTitle}
            aria-label={addTitle}
            disabled={addDisabled}
            onClick={onAdd}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
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
  icon,
  cards,
  editLabel,
  onEdit,
  deleteLabel,
  onDelete,
  onHighlightEntry,
  onClearHighlight,
}: {
  /** Icon shown in each card's leading 24px block. */
  icon: ReactNode
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
        <div
          key={index}
          className="map-asset-entry-card"
          onPointerEnter={onHighlightEntry ? () => onHighlightEntry(index) : undefined}
          onPointerLeave={onClearHighlight}
        >
          <span className="map-asset-entry-icon" aria-hidden="true">
            {icon}
          </span>
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
      ))}
      {cards.length > threshold ? (
        <button type="button" className="map-asset-more-link" onClick={() => setExpanded((current) => !current)}>
          {expanded ? copy.collapseAll : copy.viewAll(cards.length)}
        </button>
      ) : null}
    </div>
  )
}

/**
 * Capture row shared by the door/day-night forms: shows the cell picked
 * on the canvas (or a hint when none was picked yet) plus a small pick hint.
 */
function PickedCellRow({
  layerName,
  selectedTile,
  label,
}: {
  layerName: string
  selectedTile: { x: number; y: number } | null
  /** Optional row label shown before the picked-cell summary. */
  label?: string
}) {
  const copy = useMapAuthoringCopy().assetEditor.mapCards
  return (
    <div className="map-asset-picked-cell">
      {label ? <span className="map-asset-picked-cell-label">{label}</span> : null}
      <span>{selectedTile ? copy.pickedCell(layerName, selectedTile.x, selectedTile.y) : copy.pickedCellNone}</span>
      <small>{copy.pickCellHint}</small>
    </div>
  )
}

/**
 * Resolves the tileset a tile-index preview should crop from: the tileset
 * owning the layer's (x, y) gid when that layer exists and holds a tile and
 * can contain `tileIndex`; otherwise the first tileset whose tile count can
 * hold the index. Returns null when nothing can host it.
 */
function resolveTileIndexTileset(
  renderDocument: MapDocument,
  layerName: string,
  x: number,
  y: number,
  tileIndex: number,
): MapTileset | null {
  const normalizedLayerName = layerName.trim().toLowerCase()
  const layer = renderDocument.layers.find((candidate) => candidate.name.trim().toLowerCase() === normalizedLayerName)
  if (layer && x >= 0 && y >= 0 && x < layer.width && y < layer.height) {
    const gid = stripTileGidFlags(layer.gids[y * layer.width + x] >>> 0)
    if (gid !== 0) {
      const owningTileset = findTilesetForGid(renderDocument.tilesets, gid)
      if (owningTileset && tileIndex >= 0 && tileIndex < owningTileset.tileCount) {
        return owningTileset
      }
    }
  }
  return renderDocument.tilesets.find((tileset) => tileIndex >= 0 && tileIndex < tileset.tileCount) ?? null
}

/** Crops one tileset-local tile into a 3x data URL; null when the canvas is unavailable. */
function renderTileIndexDataUrl(image: HTMLImageElement, tileset: MapTileset, tileIndex: number): string | null {
  const canvas = globalThis.document.createElement('canvas')
  const scale = 3
  canvas.width = tileset.tileWidth * scale
  canvas.height = tileset.tileHeight * scale
  const context = canvas.getContext('2d')
  if (!context) return null
  const sourceX = (tileset.margin ?? 0) + (tileIndex % tileset.columns) * (tileset.tileWidth + (tileset.spacing ?? 0))
  const sourceY = (tileset.margin ?? 0) + Math.floor(tileIndex / tileset.columns) * (tileset.tileHeight + (tileset.spacing ?? 0))
  context.imageSmoothingEnabled = false
  context.drawImage(image, sourceX, sourceY, tileset.tileWidth, tileset.tileHeight, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

type TileIndexPreviewProps = {
  /** Render document whose tileset image paths are loadable data URLs. */
  renderDocument: MapDocument
  /** Layer whose (x, y) cell selects the owning tileset; may be missing in the document. */
  layerName: string
  /** Tile X of the referenced cell. */
  x: number
  /** Tile Y of the referenced cell. */
  y: number
  /** Tileset-local tile index to crop (day/night swap or door tile). */
  tileIndex: number
  /** Accessible label and tooltip for the preview image. */
  label: string
  /** When set, crops from the named tileset directly instead of resolving the owner from the layer cell. */
  tilesetName?: string
}

/**
 * Hover-preview for one tileset-local tile index: crops the tile from the
 * tileset that owns the referenced layer cell (falling back to the first
 * tileset that can hold the index) and renders it at 3x as a data URL. When
 * `tilesetName` is set, that tileset is used directly instead of resolving
 * the owner from the layer cell. The tileset re-resolves on every
 * document/prop change, so tile edits and property edits reflect
 * immediately; loading and failure render a placeholder square.
 */
function TileIndexPreview({ renderDocument, layerName, x, y, tileIndex, label, tilesetName }: TileIndexPreviewProps) {
  const locale = useLocale()
  const viewportCopy = useEditorCopy().viewportLabels
  const tileset = tilesetName
    ? (renderDocument.tilesets.find((candidate) => candidate.name === tilesetName) ?? null)
    : resolveTileIndexTileset(renderDocument, layerName, x, y, tileIndex)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!tileset) return undefined
    let cancelled = false
    setImageUrl(null)
    const imagePath = resolveTilesetImagePath(renderDocument, tileset)
    if (!imagePath) return undefined
    void loadImage(imagePath, locale, (failedPath) => viewportCopy.failedToLoadTilesetImage(failedPath))
      .then((image) => {
        if (cancelled) return
        setImageUrl(renderTileIndexDataUrl(image, tileset, tileIndex))
      })
      .catch(() => {
        // The placeholder square below covers failed loads.
      })
    return () => {
      cancelled = true
    }
  }, [locale, renderDocument, tileIndex, tileset, viewportCopy])

  if (!tileset || !imageUrl) {
    return <span className="map-asset-tile-ref-ph" aria-hidden="true" />
  }
  return <img className="map-asset-tile-ref-img" src={imageUrl} alt={label} title={label} draggable={false} />
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
  selectedTile,
  locale,
  theme,
  accentColor,
  mapOptions,
  loadTargetDocument,
  onHighlightInspector,
}: CardProps & {
  document: MapDocument
  onUpdateDocument: (nextDocument: MapDocument, mergeKey?: string | null, label?: string) => void
  selectedTile: { x: number; y: number } | null
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  mapOptions: readonly WarpDialogMapOption[]
  loadTargetDocument: (target: string) => Promise<MapDocument>
  onHighlightInspector: (target: MapInspectorHighlight | null) => void
}) {
  const assetCopy = useMapAuthoringCopy().assetEditor
  const copy = assetCopy.mapCards
  const warpEntries = collectWarpEntries(document)
  const propertyGroups = parseWarpGroups(readPropertyRaw(properties, WARP_PROPERTY_KEY))
  const [dialogState, setDialogState] = useState<WarpDialogState>({ kind: 'closed' })
  const [carrier, setCarrier] = useState<WarpCarrier>('property')

  function commitGroups(nextGroups: readonly WarpGroup[]) {
    onChange(
      writePropertyRaw(properties, WARP_PROPERTY_KEY, serializeWarpGroups(nextGroups, propertyGroups.leftover)),
      null,
      assetCopy.editWarp,
    )
  }

  /**
   * Writes one per-cell action; when the cell already carries a different
   * non-empty value, the change is confirmed first (an empty value is a delete
   * and never confirms).
   */
  function commitCellAction(layerName: string, key: string, point: { x: number; y: number }, value: string) {
    const existing = collectCellActions(document, layerName, [key]).find((entry) => entry.x === point.x && entry.y === point.y)
    const trimmed = value.trim()
    if (trimmed && existing && existing.value !== trimmed && !globalThis.confirm(copy.warpReplaceConfirm)) {
      return
    }
    onUpdateDocument(writeCellAction(document, layerName, point, key, value), null, assetCopy.editWarp)
  }

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

  function handleConfirm(confirmCarrier: WarpCarrier, toMap: string, toX: number, toY: number) {
    if (dialogState.kind === 'add' && selectedTile) {
      if (confirmCarrier === 'property') {
        commitGroups([...propertyGroups.groups, { fromX: selectedTile.x, fromY: selectedTile.y, toMap, toX, toY }])
      } else if (confirmCarrier === 'touch') {
        commitCellAction('Back', 'TouchAction', selectedTile, formatTouchActionWarp(toMap, toX, toY))
      } else {
        commitCellAction('Buildings', 'Action', selectedTile, formatActionWarp(toX, toY, toMap))
      }
    } else if (dialogState.kind === 'edit' && dialogEntry) {
      if (dialogEntry.kind === 'property') {
        commitGroups(propertyGroups.groups.map((group, index) => (index === dialogEntry.index ? { ...group, toMap, toX, toY } : group)))
      } else if (dialogEntry.kind === 'touch') {
        commitCellAction('Back', 'TouchAction', { x: dialogEntry.x, y: dialogEntry.y }, formatTouchActionWarp(toMap, toX, toY))
      } else {
        commitCellAction('Buildings', 'Action', { x: dialogEntry.x, y: dialogEntry.y }, formatActionWarp(toX, toY, toMap))
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

  // Per-cell carriers need a picked cell that holds a tile on the target layer
  // (TMX rules attach to placed tiles only) and a layer that exists.
  function perCellCarrierEnabled(layerName: string) {
    if (!selectedTile) return false
    if (!document.layers.some((layer) => layer.name === layerName)) return false
    return gidAtCell(document, layerName, selectedTile.x, selectedTile.y) !== 0
  }

  const carrierOptions: readonly WarpCarrierOption[] = [
    { value: 'property', label: copy.warpCarrierProperty },
    { value: 'touch', label: copy.warpCarrierTouch, disabled: !perCellCarrierEnabled('Back') },
    { value: 'action', label: copy.warpCarrierAction, disabled: !perCellCarrierEnabled('Buildings') },
  ]

  return (
    <CardSection
      title={copy.warpsTitle}
      countLabel={warpEntries.length > 0 ? String(warpEntries.length) : null}
      addTitle={copy.addWarpTitle}
      addDisabled={selectedTile == null}
      onAdd={openAdd}
    >
      {warpEntries.length > 0 ? (
        <CollapsibleEntryList
          icon={<MapPin className="h-3.5 w-3.5" aria-hidden="true" />}
          cards={warpEntries.map((entry) => {
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
            return (
              <div
                className="map-asset-entry-card-text"
                key={`${entry.kind}:${entry.kind === 'property' ? entry.index : `${entry.x},${entry.y}`}`}
              >
                <strong>{title}</strong>
                <small>
                  {landing} · {sourceLabel}
                </small>
              </div>
            )
          })}
          editLabel={copy.warpEdit}
          onEdit={openEdit}
          deleteLabel={copy.deleteEntry}
          onDelete={deleteEntry}
          onHighlightEntry={(index) => onHighlightInspector(warpHighlightTarget(document, warpEntries[index] ?? null))}
          onClearHighlight={() => onHighlightInspector(null)}
        />
      ) : null}
      <WarpDialog
        open={dialogState.kind !== 'closed'}
        initialMap={dialogEntry ? (dialogEntry.kind === 'property' ? dialogEntry.group.toMap : dialogEntry.toMap) : ''}
        initialX={dialogEntry ? (dialogEntry.kind === 'property' ? dialogEntry.group.toX : dialogEntry.toX) : 0}
        initialY={dialogEntry ? (dialogEntry.kind === 'property' ? dialogEntry.group.toY : dialogEntry.toY) : 0}
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
    </CardSection>
  )
}

/**
 * The doors card manages the `Doors` map property (door tiles) and, for each
 * door, the Buildings-layer per-cell `Action` that sends the player through
 * it. Door cards show the linked destination when the cell has one, flag
 * cells that hold a conflicting non-warp action, and the add form can write
 * the door's destination action together with the door entry.
 */
function DoorsCard({
  properties,
  onChange,
  document,
  onUpdateDocument,
  renderDocument,
  activeLayer,
  selectedTile,
  mapOptions,
  onHighlightInspector,
}: CardProps & {
  document: MapDocument
  onUpdateDocument: (nextDocument: MapDocument, mergeKey?: string | null, label?: string) => void
  renderDocument: MapDocument
  activeLayer?: MapLayer | null
  selectedTile: { x: number; y: number } | null
  mapOptions: readonly WarpDialogMapOption[]
  onHighlightInspector: (target: MapInspectorHighlight | null) => void
}) {
  const assetCopy = useMapAuthoringCopy().assetEditor
  const copy = assetCopy.mapCards
  const { groups, leftover } = parseDoorGroups(readPropertyRaw(properties, DOORS_PROPERTY_KEY))
  const [formOpen, setFormOpen] = useState(false)
  const [draft, setDraft] = useState({ setTarget: false, toMap: '', toX: 0, toY: 0 })

  const buildingsLayer = document.layers.find((layer) => layer.name.trim().toLowerCase() === 'buildings')
  const actionLayerName = buildingsLayer?.name ?? 'Buildings'
  const doorLayerName = buildingsLayer?.name ?? activeLayer?.name ?? ''
  const doorGid = selectedTile && doorLayerName ? gidAtCell(document, doorLayerName, selectedTile.x, selectedTile.y) : 0
  const doorTileset = doorGid !== 0 ? findTilesetForGid(document.tilesets, doorGid) : null
  const doorSheet = doorTileset ? document.tilesets.indexOf(doorTileset) + 1 : 0
  const doorTileIndex = doorTileset ? doorGid - doorTileset.firstGid : 0

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

  function doorTargetLabel(door: DoorGroup) {
    const action = doorActions.get(`${door.x},${door.y}`)
    if (!action) return copy.doorTargetMissing
    const parsed = parseCellWarpAction(action.value)
    return parsed ? `→ ${parsed.toMap}` : copy.doorTargetConflict
  }

  /** Commits the door groups and, when the form asked for it, the cell's warp Action. */
  function commitWithTarget(nextGroups: readonly DoorGroup[], point: { x: number; y: number }) {
    const nextProperties = writePropertyRaw(properties, DOORS_PROPERTY_KEY, serializeDoorGroups(nextGroups, leftover))
    let nextDocument = document
    if (draft.setTarget && draft.toMap.trim()) {
      const value = formatActionWarp(draft.toX, draft.toY, draft.toMap.trim())
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

  return (
    <CardSection
      title={copy.doorsTitle}
      countLabel={groups.length > 0 ? String(groups.length) : null}
      addTitle={copy.addDoorTitle}
      onAdd={() => {
        setDraft({ setTarget: false, toMap: '', toX: 0, toY: 0 })
        setFormOpen(true)
      }}
    >
      {groups.length > 0 ? (
        <CollapsibleEntryList
          icon={<DoorOpen className="h-3.5 w-3.5" aria-hidden="true" />}
          cards={groups.map((door) => (
            <div className="map-asset-tile-ref" key={`${door.x},${door.y}`}>
              <div className="map-asset-entry-card-text">
                <strong>{copy.doorEntry(door.x, door.y)}</strong>
                <small>
                  {copy.doorSheet} {door.sheet} · {copy.doorTileIndex} {door.tileIndex} · {doorTargetLabel(door)}
                </small>
              </div>
              <div className="map-asset-tile-ref-pop">
                <div className="map-asset-tile-ref-block">
                  <span className="map-asset-tile-ref-label">{copy.doorTileIndex}</span>
                  <TileIndexPreview
                    renderDocument={renderDocument}
                    layerName="Buildings"
                    x={door.x}
                    y={door.y}
                    tileIndex={door.tileIndex}
                    label={copy.doorTileIndex}
                  />
                </div>
              </div>
            </div>
          ))}
          deleteLabel={copy.deleteEntry}
          onDelete={(index) => commit(groups.filter((_, groupIndex) => groupIndex !== index))}
          onHighlightEntry={(index) => {
            const door = groups[index]
            onHighlightInspector(door ? { tileRects: [{ x: door.x, y: door.y, width: 1, height: 1 }], objectIds: [] } : null)
          }}
          onClearHighlight={() => onHighlightInspector(null)}
        />
      ) : null}
      {formOpen ? (
        <form
          className="map-asset-card-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!selectedTile || !doorTileset) return
            const point = { x: selectedTile.x, y: selectedTile.y }
            commitWithTarget([...groups, { x: point.x, y: point.y, sheet: doorSheet, tileIndex: doorTileIndex }], point)
            setFormOpen(false)
          }}
        >
          <PickedCellRow layerName={doorLayerName} selectedTile={selectedTile} />
          <div className="map-asset-picked-tile">
            <span className="map-asset-tile-ref-label">{copy.doorTileAuto}</span>
            {doorGid !== 0 && doorTileset && selectedTile ? (
              <TileIndexPreview
                renderDocument={renderDocument}
                tilesetName={doorTileset.name}
                layerName={doorLayerName}
                x={selectedTile.x}
                y={selectedTile.y}
                tileIndex={doorTileIndex}
                label={copy.doorTileAuto}
              />
            ) : (
              <span className="map-asset-picked-warn">{copy.pickedCellEmpty}</span>
            )}
          </div>
          <label className="map-asset-checkbox">
            <input
              type="checkbox"
              checked={draft.setTarget}
              onChange={(event) => setDraft((current) => ({ ...current, setTarget: event.target.checked }))}
            />
            <span>{copy.doorSetTarget}</span>
          </label>
          {draft.setTarget ? (
            <>
              <label className="map-asset-card-field">
                <span>{copy.warpDialogMapLabel}</span>
                <select value={draft.toMap} onChange={(event) => setDraft((current) => ({ ...current, toMap: event.target.value }))}>
                  <option value="">{copy.warpDialogMapPlaceholder}</option>
                  {mapOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="map-asset-card-form-row">
                <label className="map-asset-card-field">
                  <span>{copy.doorX}</span>
                  <input
                    type="number"
                    min={0}
                    value={draft.toX}
                    onChange={(event) => setDraft((current) => ({ ...current, toX: Number(event.target.value) }))}
                  />
                </label>
                <label className="map-asset-card-field">
                  <span>{copy.doorY}</span>
                  <input
                    type="number"
                    min={0}
                    value={draft.toY}
                    onChange={(event) => setDraft((current) => ({ ...current, toY: Number(event.target.value) }))}
                  />
                </label>
              </div>
            </>
          ) : null}
          <div className="map-asset-card-form-actions">
            <button type="submit" className="control-button" disabled={!selectedTile || doorGid === 0}>
              {copy.confirm}
            </button>
            <button type="button" className="control-button" onClick={() => setFormOpen(false)}>
              {assetCopy.cancel}
            </button>
          </div>
        </form>
      ) : null}
    </CardSection>
  )
}

function DayNightCard({
  properties,
  onChange,
  document,
  renderDocument,
  activeLayer,
  selectedTile,
  paletteSelection,
  onHighlightInspector,
}: CardProps & {
  document: MapDocument
  renderDocument: MapDocument
  activeLayer?: MapLayer | null
  selectedTile: { x: number; y: number } | null
  paletteSelection: MapTilesetPaletteSelection | null
  onHighlightInspector: (target: MapInspectorHighlight | null) => void
}) {
  const assetCopy = useMapAuthoringCopy().assetEditor
  const copy = assetCopy.mapCards
  const day = parseDayNightGroups(readPropertyRaw(properties, DAY_TILES_PROPERTY_KEY))
  const night = parseDayNightGroups(readPropertyRaw(properties, NIGHT_TILES_PROPERTY_KEY))
  const entries = mergeDayNight(day.groups, night.groups)
  /** Display entries collapsed into contiguous rectangles; one list card per rectangle. */
  const rects = groupDayNightRects(entries)
  const [formOpen, setFormOpen] = useState(false)
  const [draft, setDraft] = useState({ layer: '' })

  const dayGid = selectedTile && draft.layer ? gidAtCell(document, draft.layer, selectedTile.x, selectedTile.y) : 0
  const dayTileset = dayGid !== 0 ? findTilesetForGid(document.tilesets, dayGid) : null
  const dayTile = dayTileset ? dayGid - dayTileset.firstGid : null
  const nightSheetMismatch = paletteSelection != null && dayTileset != null && paletteSelection.tilesetName !== dayTileset.name
  const canConfirm = draft.layer.trim() !== '' && selectedTile != null && dayGid !== 0 && !nightSheetMismatch

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

  function addEntry() {
    if (!selectedTile) return
    const layer = draft.layer.trim()
    if (!layer) return
    const gid = gidAtCell(document, layer, selectedTile.x, selectedTile.y)
    if (gid === 0) return
    const tileset = findTilesetForGid(document.tilesets, gid)
    if (!tileset) return
    const { x, y } = selectedTile
    let next = properties
    next = writePropertyRaw(
      next,
      DAY_TILES_PROPERTY_KEY,
      serializeDayNightGroups([...day.groups, { layer, x, y, tileIndex: gid - tileset.firstGid }], day.leftover),
    )
    const nightTile = paletteSelection && paletteSelection.tilesetName === tileset.name ? paletteSelection.startIndex : null
    if (nightTile != null) {
      next = writePropertyRaw(
        next,
        NIGHT_TILES_PROPERTY_KEY,
        serializeDayNightGroups([...night.groups, { layer, x, y, tileIndex: nightTile }], night.leftover),
      )
    }
    onChange(next, null, assetCopy.editDayNight)
    setFormOpen(false)
  }

  const entryCards = rects.map((rect) => {
    const isBlock = rect.width !== 1 || rect.height !== 1
    const title = isBlock
      ? copy.dayNightBlock(rect.layer, rect.x, rect.y, rect.width, rect.height, rect.dayTile, rect.nightTile)
      : copy.dayNightEntry(rect.layer, rect.x, rect.y, rect.dayTile, rect.nightTile)
    return (
      <div className="map-asset-tile-ref">
        <div className="map-asset-entry-card-text">
          <strong>{title}</strong>
          <small>
            {copy.dayNightLayer} {rect.layer}
            {isBlock ? ` · ${copy.dayNightBlockCells(rect.cells.length)}` : null}
          </small>
        </div>
        {rect.dayTile != null || rect.nightTile != null ? (
          <div className="map-asset-tile-ref-pop">
            {rect.dayTile != null ? (
              <div className="map-asset-tile-ref-block">
                <span className="map-asset-tile-ref-label">{copy.dayNightDayTile}</span>
                <TileIndexPreview
                  renderDocument={renderDocument}
                  layerName={rect.layer}
                  x={rect.x}
                  y={rect.y}
                  tileIndex={rect.dayTile}
                  label={copy.dayNightDayTile}
                />
              </div>
            ) : null}
            {rect.nightTile != null ? (
              <div className="map-asset-tile-ref-block">
                <span className="map-asset-tile-ref-label">{copy.dayNightNightTile}</span>
                <TileIndexPreview
                  renderDocument={renderDocument}
                  layerName={rect.layer}
                  x={rect.x}
                  y={rect.y}
                  tileIndex={rect.nightTile}
                  label={copy.dayNightNightTile}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  })

  return (
    <CardSection
      title={copy.dayNightTitle}
      countLabel={rects.length > 0 ? copy.dayNightCount(rects.length) : null}
      addTitle={copy.addDayNightTitle}
      onAdd={() => {
        setDraft({ layer: activeLayer?.name ?? document.layers[0]?.name ?? '' })
        setFormOpen(true)
      }}
    >
      {rects.length > 0 ? (
        <CollapsibleEntryList
          icon={<SunMoon className="h-3.5 w-3.5" aria-hidden="true" />}
          cards={entryCards}
          deleteLabel={copy.deleteEntry}
          onDelete={removeEntry}
          onHighlightEntry={(index) => {
            const rect = rects[index]
            onHighlightInspector(
              rect ? { tileRects: [{ x: rect.x, y: rect.y, width: rect.width, height: rect.height }], objectIds: [] } : null,
            )
          }}
          onClearHighlight={() => onHighlightInspector(null)}
        />
      ) : null}
      {formOpen ? (
        <form
          className="map-asset-card-form"
          onSubmit={(event) => {
            event.preventDefault()
            addEntry()
          }}
        >
          <label className="map-asset-card-field">
            <span>{copy.dayNightLayer}</span>
            <select value={draft.layer} onChange={(event) => setDraft((current) => ({ ...current, layer: event.target.value }))}>
              {document.layers.map((layer) => (
                <option key={layer.id} value={layer.name}>
                  {layer.name}
                </option>
              ))}
            </select>
          </label>
          <PickedCellRow layerName={draft.layer} selectedTile={selectedTile} />
          <div className="map-asset-picked-tile">
            <span className="map-asset-tile-ref-label">{copy.dayTileAuto}</span>
            {dayTile != null && selectedTile ? (
              <TileIndexPreview
                renderDocument={renderDocument}
                layerName={draft.layer}
                x={selectedTile.x}
                y={selectedTile.y}
                tileIndex={dayTile}
                label={copy.dayTileAuto}
              />
            ) : (
              <span className="map-asset-picked-warn">{copy.pickedCellEmpty}</span>
            )}
          </div>
          <div className="map-asset-picked-tile">
            <span className="map-asset-tile-ref-label">{copy.dayNightNightTile}</span>
            {paletteSelection && selectedTile ? (
              <TileIndexPreview
                renderDocument={renderDocument}
                tilesetName={paletteSelection.tilesetName}
                layerName={draft.layer}
                x={selectedTile.x}
                y={selectedTile.y}
                tileIndex={paletteSelection.startIndex}
                label={copy.dayNightNightTile}
              />
            ) : (
              <span className="map-asset-picked-warn">{copy.nightTileNone}</span>
            )}
            {!paletteSelection ? <small>{copy.pickNightTileHint}</small> : null}
          </div>
          {nightSheetMismatch && dayTileset ? (
            <p className="map-asset-picked-warn">{copy.nightTileSheetMismatch(dayTileset.name)}</p>
          ) : null}
          <div className="map-asset-card-form-actions">
            <button type="submit" className="control-button" disabled={!canConfirm}>
              {copy.confirm}
            </button>
            <button type="button" className="control-button" onClick={() => setFormOpen(false)}>
              {assetCopy.cancel}
            </button>
          </div>
        </form>
      ) : null}
    </CardSection>
  )
}

export type MapAssetMapCardsProps = {
  document: MapDocument
  /** Render document whose tileset image paths are loadable data URLs (used by tile hover previews). */
  renderDocument: MapDocument
  onUpdateDocument: (nextDocument: MapDocument, mergeKey?: string | null, label?: string) => void
  /** Active layer; feeds the door/day-night tile capture rows. */
  activeLayer?: MapLayer | null
  /** Cell picked on the canvas (check tool); null until one is picked. Feeds the warp/door/day-night capture rows. */
  selectedTile: { x: number; y: number } | null
  /** Tile picked in the tileset palette; captures the night/door tile when its sheet matches the cell. */
  paletteSelection: MapTilesetPaletteSelection | null
  /** Target-map choices for the warp dialog (localized names from the map catalog). */
  mapOptions: readonly WarpDialogMapOption[]
  /** Loads a target map document for the warp destination preview. */
  loadTargetDocument: (target: string) => Promise<MapDocument>
  /** Reports the hovered entry's canvas highlight (cells/objects); null clears it. */
  onHighlightInspector: (target: MapInspectorHighlight | null) => void
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
}

/**
 * Semantic map-property cards for the asset editor inspector: warp entries
 * (dialog-picked destinations), doors and day/night swaps. Warps and doors
 * read and write both `document.properties` and per-cell action strings
 * through `onUpdateDocument`; music and ambient light live in the top-bar
 * chips; the raw-properties collapsible lives at the bottom of the inspector
 * and edits the same properties object.
 */
export function MapAssetMapCards({
  document,
  renderDocument,
  onUpdateDocument,
  activeLayer,
  selectedTile,
  paletteSelection,
  mapOptions,
  loadTargetDocument,
  onHighlightInspector,
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
  return (
    <>
      <WarpCard
        properties={document.properties}
        onChange={updateProperties}
        document={document}
        onUpdateDocument={onUpdateDocument}
        selectedTile={selectedTile}
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
        selectedTile={selectedTile}
        mapOptions={mapOptions}
        onHighlightInspector={onHighlightInspector}
      />
      <DayNightCard
        properties={document.properties}
        onChange={updateProperties}
        document={document}
        renderDocument={renderDocument}
        activeLayer={activeLayer}
        selectedTile={selectedTile}
        paletteSelection={paletteSelection}
        onHighlightInspector={onHighlightInspector}
      />
    </>
  )
}
