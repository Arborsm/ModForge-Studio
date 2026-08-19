import { Pencil } from 'lucide-react'
import { cellOverlayRule, findTilesetForGid, stripTileGidFlags, type MapDocument, type MapLayer, type MapObject } from '@entities/map'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'

type MapAssetInspectPopoverProps = {
  document: MapDocument
  activeLayer: MapLayer | null
  selectedTile: { x: number; y: number } | null
  /** Objects on the active layer's object group at the selected tile, if any. */
  objectsAtTile: MapObject[]
  /** Callback to open the Inspector and switch to the relevant tab. */
  onEditInInspector: () => void
}

/**
 * Floating read-only info popover shown at the bottom-right of the canvas when
 * the inspect tool selects a cell. Aggregates coordinate, layer, tile, object,
 * cell-property, and cell-animation info in one place so the user doesn't have
 * to manually switch Inspector tabs to see what's at a cell.
 */
export function MapAssetInspectPopover({
  document,
  activeLayer,
  selectedTile,
  objectsAtTile,
  onEditInInspector,
}: MapAssetInspectPopoverProps) {
  const copy = useMapAuthoringCopy().assetEditor
  if (!selectedTile || !activeLayer) return null
  const { x, y } = selectedTile
  const cellIndex = y * activeLayer.width + x
  const rawGid = activeLayer.gids[cellIndex] ?? 0
  const baseGid = stripTileGidFlags(rawGid)
  const tileset = baseGid > 0 ? findTilesetForGid(document.tilesets, baseGid) : null
  const tileId = tileset ? baseGid - tileset.firstGid : null
  const cellProps = activeLayer.cellProperties?.[cellIndex]
  const cellRule = cellProps ? cellOverlayRule(cellProps) : null
  const cellAnimFrames = activeLayer.cellAnimations?.[cellIndex]
  const hasContent = baseGid > 0 || objectsAtTile.length > 0 || cellRule != null || (cellAnimFrames != null && cellAnimFrames.length > 0)
  if (!hasContent) return null
  return (
    <div className="map-asset-inspect-popover" role="dialog" aria-label={copy.inspectPopoverTitle(x, y)}>
      <header>
        <strong>{copy.inspectPopoverTitle(x, y)}</strong>
      </header>
      <dl>
        <div className="map-asset-inspect-popover-row">
          <dt>{copy.inspectPopoverLayer}</dt>
          <dd>{activeLayer.name}</dd>
        </div>
        {baseGid > 0 && tileset ? (
          <div className="map-asset-inspect-popover-row">
            <dt>{copy.inspectPopoverTile}</dt>
            <dd>
              {tileset.name} #{tileId}
            </dd>
          </div>
        ) : (
          <div className="map-asset-inspect-popover-row">
            <dt>{copy.inspectPopoverTile}</dt>
            <dd className="is-muted">{copy.inspectPopoverEmpty}</dd>
          </div>
        )}
        {objectsAtTile.length > 0 ? (
          <div className="map-asset-inspect-popover-row">
            <dt>{copy.inspectPopoverObject}</dt>
            <dd>
              {objectsAtTile.map((object, index) => (
                <span key={object.id} className={cx(index > 0 && 'is-extra')}>
                  {object.name || object.type || copy.genericObject(object.id)}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
        {cellRule != null ? (
          <div className="map-asset-inspect-popover-row">
            <dt>{copy.inspectPopoverCellProps}</dt>
            <dd>{copy.overlayRules[cellRule]}</dd>
          </div>
        ) : null}
        {cellAnimFrames != null && cellAnimFrames.length > 0 ? (
          <div className="map-asset-inspect-popover-row">
            <dt>{copy.inspectPopoverAnimation}</dt>
            <dd>{copy.inspectPopoverAnimationFrameCount(cellAnimFrames.length)}</dd>
          </div>
        ) : null}
      </dl>
      <button type="button" className="control-button map-asset-inspect-popover-edit" onClick={onEditInInspector}>
        <Pencil className="h-3 w-3" />
        {copy.inspectPopoverEdit}
      </button>
    </div>
  )
}
