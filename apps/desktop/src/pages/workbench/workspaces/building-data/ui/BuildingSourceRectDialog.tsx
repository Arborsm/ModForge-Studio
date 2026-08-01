/**
 * Visual `SourceRect` selection over the building's own sheet.
 *
 * `SourceRect` decides which part of the texture the game draws, and getting it
 * wrong is the single most common reason an authored building renders as a slice
 * of the wrong sprite. Typing four numbers cannot show that; dragging over the
 * sheet can, so this wraps the shared `SheetRegionPicker` and commits the region
 * as the `{X, Y, Width, Height}` shape `Data/Buildings` stores.
 *
 * Snapping defaults to the 16px tile grid because vanilla building sheets are
 * laid out on it, with an off-grid escape hatch for sheets that are not.
 */

import { useEffect, useState } from 'react'
import { useBuildingDataEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { SheetRegionPicker, type SheetRegion } from '@shared/ui/SheetRegionPicker'
import type { FootprintRect } from './BuildingFootprintOverlay'
import { TILE_PIXELS } from './BuildingFootprintOverlay'

export type BuildingSourceRectDialogProps = {
  open: boolean
  /** Sheet the region is cut from; the dialog stays closed without it. */
  textureUrl: string | null
  textureWidth: number | null
  textureHeight: number | null
  /** Region currently stored on the entry, preselected on open. */
  value: FootprintRect | null
  /** Footprint in tiles, used to describe how the region will be sliced. */
  size: { X: number; Y: number } | null
  onClose: () => void
  onApply: (rect: FootprintRect) => void
}

function toRegion(rect: FootprintRect | null): SheetRegion | null {
  if (rect === null || rect.Width <= 0 || rect.Height <= 0) {
    return null
  }
  return { x: rect.X, y: rect.Y, width: rect.Width, height: rect.Height }
}

export function BuildingSourceRectDialog({
  open,
  textureUrl,
  textureWidth,
  textureHeight,
  value,
  size,
  onClose,
  onApply,
}: BuildingSourceRectDialogProps) {
  const copy = useBuildingDataEditorCopy().sourceRect
  const [region, setRegion] = useState<SheetRegion | null>(toRegion(value))
  const [snapToTiles, setSnapToTiles] = useState(true)

  // Each opening starts from what the entry currently stores, so an abandoned
  // drag never leaks into the next one.
  useEffect(() => {
    if (open) {
      setRegion(toRegion(value))
    }
  }, [open, value])

  if (textureUrl === null || textureWidth === null || textureHeight === null) {
    return null
  }

  const tilesWide = region === null ? null : region.width / TILE_PIXELS
  const tilesHigh = region === null ? null : region.height / TILE_PIXELS

  return (
    <Dialog open={open} onClose={onClose} ariaLabel={copy.title} size="lg" stack>
      <DialogHeader title={copy.title} subtitle={copy.subtitle} onClose={onClose} closeLabel={copy.cancelAction} />
      <DialogBody className="building-source-rect-body">
        <label className="building-source-rect-snap">
          <input
            type="checkbox"
            className="asset-field-checkbox"
            checked={snapToTiles}
            onChange={(event) => setSnapToTiles(event.target.checked)}
          />
          <span>{copy.snapLabel}</span>
        </label>
        <p className="asset-field-hint">{copy.snapHint}</p>

        <div className="building-source-rect-picker-frame" style={{ maxWidth: `min(100%, ${26 * (textureWidth / textureHeight)}rem)` }}>
          <SheetRegionPicker
            imageUrl={textureUrl}
            imageWidth={textureWidth}
            imageHeight={textureHeight}
            value={region}
            snap={snapToTiles ? TILE_PIXELS : undefined}
            onChange={setRegion}
          />
        </div>

        <dl className="asset-editor-summary-list">
          <div className="asset-editor-summary-chip">
            <dt>{copy.regionLabel}</dt>
            <dd className={region === null ? 'is-unset' : undefined}>
              {region === null ? copy.noRegion : copy.regionValue(region.x, region.y, region.width, region.height)}
            </dd>
          </div>
          <div className="asset-editor-summary-chip">
            <dt>{copy.tileSizeLabel}</dt>
            <dd className={tilesWide === null ? 'is-unset' : undefined}>
              {tilesWide === null || tilesHigh === null ? copy.noRegion : copy.tileSizeValue(tilesWide, tilesHigh)}
            </dd>
          </div>
          {size !== null ? (
            <div className="asset-editor-summary-chip">
              <dt>{copy.footprintLabel}</dt>
              <dd>{copy.footprintValue(size.X, size.Y)}</dd>
            </div>
          ) : null}
        </dl>
        <p className="asset-field-hint">{copy.footprintHint}</p>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{copy.cancelAction}</DialogAction>
        <DialogAction
          tone="primary"
          disabled={region === null}
          onClick={() => {
            if (region !== null) {
              onApply({ X: region.x, Y: region.y, Width: region.width, Height: region.height })
            }
          }}
        >
          {copy.applyAction}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
