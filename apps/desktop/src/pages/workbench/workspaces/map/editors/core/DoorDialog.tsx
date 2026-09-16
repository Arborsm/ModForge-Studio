import { useEffect, useState } from 'react'
import { findTilesetForGid, gidAtCell, type MapDocument } from '@entities/map'
import type { LocaleCode, ThemeMode } from '@locales/api'
import { useMapAuthoringCopy } from '@locales/provider'
import { CompactSelect } from '@shared/ui/CompactSelect'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { PickedCellRow, TileIndexPreview } from './tileIndexPreview'
import { WarpDestinationPointPicker } from '../../ui/WarpDestinationPointPicker'
import { CurrentMapCellPicker } from '../../ui/CurrentMapCellPicker'
import type { WarpDialogMapOption } from './WarpDialog'

/** Destination the door dialog confirms, mirroring the former inline form draft. */
export type DoorDialogTarget = { setTarget: boolean; toMap: string; toX: number; toY: number }

/**
 * Studio dialog for one door entry, following the day/night studio layout: the
 * left map picker chooses the door's cell (existing door cells are
 * highlighted), the right panel shows the auto-captured door tile of that cell
 * and optionally asks for the door's destination (target map + click-to-pick
 * landing cell) written as the cell's Buildings-layer Action. The caller owns
 * the property writes; the dialog only reports the picked cell and the
 * destination draft on confirm. Passing `editDoor` pre-picks the entry's cell
 * and pre-fills its current destination, switching the dialog into edit mode.
 */
export function DoorDialog({
  open,
  document,
  renderDocument,
  layerName,
  existingDoorRects,
  editDoor = null,
  gameRootPath,
  mapOptions,
  loadTargetDocument,
  locale,
  theme,
  accentColor,
  onClose,
  onConfirm,
}: {
  open: boolean
  /** Data document whose layers/tilesets resolve the auto-captured door tile. */
  document: MapDocument
  /** Render document feeding the left map picker (tileset image paths loadable as data URLs). */
  renderDocument: MapDocument
  /** Layer whose (x, y) cell selects the owning tileset for the tile preview. */
  layerName: string
  /** Existing door rectangles framed as picker highlights. */
  existingDoorRects: readonly { x: number; y: number; width: number; height: number }[]
  /** Door draft being edited: pre-picked cell plus its current destination state. */
  editDoor?: { x: number; y: number; setTarget: boolean; toMap: string; toX: number; toY: number } | null
  /** Game root used to resolve dynamically referenced vanilla sheets; null leaves previews blank. */
  gameRootPath: string | null
  /** Localized target-map choices for the destination select. */
  mapOptions: readonly WarpDialogMapOption[]
  /** Loads a target map document for the destination preview. */
  loadTargetDocument: (target: string) => Promise<MapDocument>
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  onClose: () => void
  /** Reports the picked cell and the destination draft; the caller commits the door entry (and action). */
  onConfirm: (cell: { x: number; y: number }, target: DoorDialogTarget) => void
}) {
  const copy = useMapAuthoringCopy().assetEditor.mapCards
  const [cell, setCell] = useState<{ x: number; y: number } | null>(null)
  const [setTarget, setSetTarget] = useState(false)
  const [toMap, setToMap] = useState('')
  const [landing, setLanding] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [landingKey, setLandingKey] = useState('')

  // Each dialog open restarts from the edited door's draft (edit mode) or a
  // fresh draft (add mode: no cell picked yet, no destination); switching the
  // target map also re-mounts the preview (fresh picked cell) for that map.
  const editCellX = editDoor?.x ?? null
  const editCellY = editDoor?.y ?? null
  const editSetTarget = editDoor?.setTarget ?? false
  const editToMap = editDoor?.toMap ?? ''
  const editToX = editDoor?.toX ?? 0
  const editToY = editDoor?.toY ?? 0
  useEffect(() => {
    if (!open) return
    setCell(editCellX != null ? { x: editCellX, y: editCellY ?? 0 } : null)
    setSetTarget(editSetTarget)
    setToMap(editToMap)
    setLanding({ x: editToX, y: editToY })
  }, [open, editCellX, editCellY, editSetTarget, editToMap, editToX, editToY])

  useEffect(() => {
    if (!open) return
    setLandingKey(`${toMap}\u0000`)
  }, [open, toMap])

  // The door tile is derived from the picked cell's gid on the capture layer.
  const doorGid = cell && layerName ? gidAtCell(document, layerName, cell.x, cell.y) : 0
  const doorTileset = doorGid !== 0 ? findTilesetForGid(document.tilesets, doorGid) : null
  const doorTile = doorTileset && cell ? { tilesetName: doorTileset.name, tileIndex: doorGid - doorTileset.firstGid } : null

  const canConfirm = Boolean(cell && doorTile && (!setTarget || toMap.trim() !== ''))

  return (
    <Dialog open={open} onClose={onClose} size="xl" labelledBy="map-door-dialog-title">
      <DialogHeader
        id="map-door-dialog-title"
        title={editDoor ? copy.doorEditTitle : copy.addDoor}
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
              onPick={(tileX, tileY) => setCell({ x: tileX, y: tileY })}
              selectedCell={cell}
              highlightRects={existingDoorRects}
              gameRootPath={gameRootPath}
            />
          </div>
          <div className="map-asset-studio-panel">
            <PickedCellRow layerName={layerName} selectedTile={cell} hint={copy.doorPickCellHint} />
            {cell ? (
              <div className="map-asset-picked-tile">
                <span className="map-asset-tile-ref-label">{copy.doorTileAuto}</span>
                {doorTile ? (
                  <TileIndexPreview
                    renderDocument={renderDocument}
                    tilesetName={doorTile.tilesetName}
                    layerName={layerName}
                    x={cell.x}
                    y={cell.y}
                    tileIndex={doorTile.tileIndex}
                    label={copy.doorTileAuto}
                    gameRootPath={gameRootPath}
                  />
                ) : (
                  <span className="map-asset-picked-warn">{copy.pickedCellEmpty}</span>
                )}
              </div>
            ) : null}
            <label className="map-asset-checkbox">
              <input type="checkbox" checked={setTarget} onChange={(event) => setSetTarget(event.target.checked)} />
              <span>{copy.doorSetTarget}</span>
            </label>
            {setTarget ? (
              <>
                <label className="map-warp-dialog-field">
                  <span>{copy.warpDialogMapLabel}</span>
                  <CompactSelect
                    value={toMap}
                    options={mapOptions.map((option) => ({
                      value: option.value,
                      label: option.label,
                      description: option.description,
                    }))}
                    onChange={(value) => setToMap(value)}
                    ariaLabel={copy.warpDialogMapLabel}
                    placeholder={copy.warpDialogMapPlaceholder}
                    placement="bottom-start"
                    menuClassName="compact-select__menu--in-dialog"
                  />
                </label>
                <label className="map-warp-dialog-field">
                  <span>{copy.warpDialogPointLabel}</span>
                  {toMap.trim() ? (
                    <WarpDestinationPointPicker
                      key={landingKey}
                      target={toMap}
                      locale={locale}
                      theme={theme}
                      accentColor={accentColor}
                      loadTargetDocument={loadTargetDocument}
                      onPick={(x, y) => setLanding({ x, y })}
                    />
                  ) : (
                    <p className="map-warp-dialog-empty">{copy.warpDialogPointHint}</p>
                  )}
                </label>
              </>
            ) : null}
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{copy.warpDialogCancel}</DialogAction>
        <DialogAction
          tone="primary"
          disabled={!canConfirm}
          onClick={() => {
            if (!cell || !doorTile) return
            onConfirm(cell, { setTarget, toMap, toX: landing.x, toY: landing.y })
          }}
        >
          {copy.warpDialogConfirm}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
