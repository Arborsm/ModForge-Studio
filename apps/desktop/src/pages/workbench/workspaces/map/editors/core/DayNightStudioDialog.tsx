import { useEffect, useState } from 'react'
import { DAY_TILES_PROPERTY_KEY, NIGHT_TILES_PROPERTY_KEY, asMapPropertyString, type MapDocument, type MapTileRect } from '@entities/map'
import type { LocaleCode, ThemeMode } from '@locales/api'
import { useMapAuthoringCopy } from '@locales/provider'
import { CompactSelect } from '@shared/ui/CompactSelect'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { SheetGridCanvas } from '@entities/map/ui/SheetGridCanvas'
import { CurrentMapCellPicker } from '../../ui/CurrentMapCellPicker'
import {
  collectDayNightRectCells,
  dayNightColumnsResolver,
  groupDayNightDisplayRects,
  mergeDayNight,
  parseDayNightGroups,
} from './dayNightEntries'
import { PickedCellRow, TileRegionPreview } from './tileIndexPreview'

type DayNightStudioDialogProps = {
  open: boolean
  /** Document whose layers/tilesets resolve the day tiles and the pick space. */
  document: MapDocument
  /** Render document whose tileset image paths are loadable data URLs. */
  renderDocument: MapDocument
  /** Layer preselected when the dialog opens without an entry being edited. */
  activeLayerName?: string
  /** Existing swap loaded for editing; null adds a new swap at a freshly picked rect. */
  editEntry?: { layer: string; x: number; y: number; dayTile: number | null; nightTile: number | null } | null
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  /** Game root used to resolve dynamically referenced vanilla sheets; null leaves previews blank. */
  gameRootPath?: string | null
  onClose: () => void
  /**
   * Reports the swaps to commit: every non-empty cell of the picked rect with
   * its captured day tile and the offset-mapped night tile (null when no
   * night origin was picked). The caller owns the DayTiles/NightTiles writes.
   */
  onConfirm: (payload: { layer: string; cells: { x: number; y: number; dayTile: number; nightTile: number | null }[] }) => void
}

/**
 * Studio dialog for day/night swaps: the left map picker rectangle-selects
 * the cells to swap (existing swaps are highlighted), the right panel picks
 * the layer and previews the captured day region, and the sheet canvas —
 * locked to the day tiles' own tileset — picks the night region by its
 * top-left origin tile; the region size always follows the map selection.
 * Day and night sides preview as composed region images side by side.
 */
export function DayNightStudioDialog({
  open,
  document,
  renderDocument,
  activeLayerName,
  editEntry,
  locale,
  theme,
  accentColor,
  gameRootPath = null,
  onClose,
  onConfirm,
}: DayNightStudioDialogProps) {
  const copy = useMapAuthoringCopy().assetEditor.mapCards
  const [rect, setRect] = useState<MapTileRect | null>(null)
  const [layer, setLayer] = useState('')
  /** Night region origin: the sheet-local tile id of the region's top-left tile. */
  const [nightOrigin, setNightOrigin] = useState<number | null>(null)

  // Each dialog open restarts from the edit entry (or a fresh add draft); the
  // entry/document snapshots are read once at open time on purpose.
  useEffect(() => {
    if (!open) return
    setRect(editEntry ? { x: editEntry.x, y: editEntry.y, width: 1, height: 1 } : null)
    setLayer(editEntry?.layer ?? activeLayerName ?? document.layers[0]?.name ?? '')
    setNightOrigin(editEntry?.nightTile ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-running mid-session would wipe in-progress picks
  }, [open])

  const capture = rect && layer ? collectDayNightRectCells(document, layer, rect) : null
  const hasCells = (capture?.cells.length ?? 0) > 0
  const captureValid = capture != null && hasCells && !capture.mixedTilesets
  // The sheet is locked to the captured cells' own tileset (single-sheet rects only).
  const sheetTileset = captureValid
    ? (document.tilesets.find((candidate) => candidate.name === capture.cells[0].tilesetName) ?? null)
    : null

  // The night region always matches the map rect size; only its origin is picked.
  const nightInBounds =
    nightOrigin != null && rect != null && sheetTileset != null
      ? nightOrigin % sheetTileset.columns <= sheetTileset.columns - rect.width &&
        Math.floor(nightOrigin / sheetTileset.columns) + rect.height <= Math.ceil(sheetTileset.tileCount / sheetTileset.columns)
      : false
  const nightCells =
    nightOrigin != null && nightInBounds && rect && sheetTileset
      ? Array.from({ length: rect.width * rect.height }, (_, index) => {
          const dx = index % rect.width
          const dy = Math.floor(index / rect.width)
          return { dx, dy, tileIndex: nightOrigin + dy * sheetTileset.columns + dx }
        })
      : null

  // Existing swap rectangles frame the map picker; the entry being edited is excluded.
  const existingRects = groupDayNightDisplayRects(
    mergeDayNight(
      parseDayNightGroups(asMapPropertyString(document.properties[DAY_TILES_PROPERTY_KEY])).groups,
      parseDayNightGroups(asMapPropertyString(document.properties[NIGHT_TILES_PROPERTY_KEY])).groups,
    ),
    dayNightColumnsResolver(document),
  )
  const highlightRects: MapTileRect[] = existingRects
    .filter((existingRect) => {
      if (!editEntry || existingRect.layer !== editEntry.layer) return true
      return !existingRect.cells.some((rectCell) => rectCell.x === editEntry.x && rectCell.y === editEntry.y)
    })
    .map((existingRect) => ({ x: existingRect.x, y: existingRect.y, width: existingRect.width, height: existingRect.height }))

  const confirmDisabled = !captureValid || (nightOrigin != null && !nightInBounds)

  function handleConfirm() {
    if (!captureValid || !rect || !capture) return
    onConfirm({
      layer,
      cells: capture.cells.map((cell) => ({
        x: cell.x,
        y: cell.y,
        dayTile: cell.dayTile,
        nightTile:
          nightOrigin != null && nightInBounds && sheetTileset
            ? nightOrigin + (cell.y - rect.y) * sheetTileset.columns + (cell.x - rect.x)
            : null,
      })),
    })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} size="xl" labelledBy="map-daynight-studio-title">
      <DialogHeader
        id="map-daynight-studio-title"
        title={editEntry ? copy.dayNightStudioEditTitle : copy.dayNightStudioAddTitle}
        onClose={onClose}
        closeLabel={copy.warpDialogClose}
      />
      <DialogBody>
        <div className="map-asset-studio">
          <div className="map-asset-studio-map">
            <CurrentMapCellPicker
              document={renderDocument}
              locale={locale}
              theme={theme}
              accentColor={accentColor}
              onPickRect={setRect}
              selectedCell={null}
              selectedRect={rect}
              highlightRects={highlightRects}
              gameRootPath={gameRootPath}
            />
          </div>
          <div className="map-asset-studio-panel">
            <label className="map-warp-dialog-field">
              <span>{copy.dayNightLayer}</span>
              <CompactSelect
                value={layer}
                options={document.layers.map((mapLayer) => ({ value: mapLayer.name, label: mapLayer.name }))}
                onChange={(nextLayer) => {
                  setLayer(nextLayer)
                  setNightOrigin(null)
                }}
                ariaLabel={copy.dayNightLayer}
                placeholder={copy.dayNightLayer}
                placement="bottom-start"
                menuClassName="compact-select__menu--in-dialog"
              />
            </label>
            <PickedCellRow layerName={layer} selectedTile={null} selectedRect={rect} hint={copy.dayNightPickCellHint} />
            {capture && !hasCells ? <span className="map-asset-picked-warn">{copy.pickedCellEmpty}</span> : null}
            {capture?.mixedTilesets ? <span className="map-asset-picked-warn">{copy.dayNightMixedTilesets}</span> : null}
            {captureValid && rect && capture && sheetTileset ? (
              <>
                <div className="map-asset-daynight-preview">
                  <TileRegionPreview
                    renderDocument={renderDocument}
                    tileset={sheetTileset}
                    width={rect.width}
                    height={rect.height}
                    cells={capture.cells.map((cell) => ({ dx: cell.x - rect.x, dy: cell.y - rect.y, tileIndex: cell.dayTile }))}
                    label={copy.dayNightDayTile}
                    gameRootPath={gameRootPath}
                  />
                  <span className="map-asset-daynight-preview-swap" aria-hidden="true">
                    ⇄
                  </span>
                  {nightCells ? (
                    <TileRegionPreview
                      renderDocument={renderDocument}
                      tileset={sheetTileset}
                      width={rect.width}
                      height={rect.height}
                      cells={nightCells}
                      label={copy.dayNightNightTile}
                      gameRootPath={gameRootPath}
                    />
                  ) : (
                    <span className="map-asset-tile-ref-ph" style={{ aspectRatio: `${rect.width} / ${rect.height}` }} aria-hidden="true" />
                  )}
                </div>
                <div className="map-asset-daynight-meta">
                  <small>
                    {copy.dayNightBlockCells(capture.cells.length)}
                    {capture.emptyCellCount > 0 ? ` · ${copy.dayNightEmptyCellsSkipped(capture.emptyCellCount)}` : ''}
                  </small>
                  {!nightCells ? <small>{copy.nightTileNone}</small> : null}
                </div>
                <p className="map-warp-dialog-empty">{copy.dayNightPickNightTileHint}</p>
                <div className="map-asset-studio-sheet">
                  <SheetGridCanvas
                    document={renderDocument}
                    tileset={sheetTileset}
                    locale={locale}
                    gameRootPath={gameRootPath}
                    enableDragSelect={false}
                    showMagnifier={false}
                    selectionRect={
                      nightOrigin != null && rect
                        ? nightInBounds
                          ? {
                              startTileId: nightOrigin,
                              endTileId: nightOrigin + (rect.height - 1) * sheetTileset.columns + (rect.width - 1),
                            }
                          : { startTileId: nightOrigin, endTileId: nightOrigin }
                        : null
                    }
                    onTileClick={setNightOrigin}
                  />
                </div>
                {nightOrigin != null && !nightInBounds ? (
                  <span className="map-asset-picked-warn">{copy.dayNightNightOutOfBounds}</span>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{copy.warpDialogCancel}</DialogAction>
        <DialogAction tone="primary" disabled={confirmDisabled} onClick={handleConfirm}>
          {copy.warpDialogConfirm}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
