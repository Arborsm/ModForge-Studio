/**
 * Footprint grid drawn on top of the building sprite.
 *
 * Placement in Stardew anchors the sprite's bottom-left corner to the
 * footprint's bottom-left tile, so the grid is `Size.X × Size.Y` tiles of 16
 * game pixels laid out from that corner — the same maths the game uses when it
 * decides which ground a building covers.
 *
 * The overlay lives inside the already-scaled sprite stage and counter-scales
 * itself, so its own coordinate system is screen pixels: grid lines stay one
 * device pixel wide instead of being blown up with the sprite.
 *
 * Picking comes in two shapes. A tile target commits on one click. A rect target
 * (`AnimalDoor` spans two tiles on a barn) commits on the second click, using the
 * first as its anchor — two clicks rather than a drag, so the grid stays
 * keyboard-reachable given every cell is already a real button.
 */

import { useEffect, useState } from 'react'
import type { BuildingSpriteGeometry } from '@entities/building'
import { useBuildingDataEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'

/** Game pixels per tile. */
export const TILE_PIXELS = 16

/** Single-tile coordinate fields the overlay can write back to. */
export type FootprintTilePickTarget = 'HumanDoor' | 'UpgradeSignTile'

/** Tile-rectangle fields the overlay can write back to. */
export type FootprintRectPickTarget = 'AnimalDoor'

/** Field a grid click writes to. */
export type FootprintPickTarget = FootprintTilePickTarget | FootprintRectPickTarget

export type FootprintTile = { X: number; Y: number }

export type FootprintRect = { X: number; Y: number; Width: number; Height: number }

/** Whether a pick target stores a rectangle rather than a single tile. */
export function isFootprintRectTarget(target: FootprintPickTarget): target is FootprintRectPickTarget {
  return target === 'AnimalDoor'
}

export type BuildingFootprintOverlayProps = {
  geometry: BuildingSpriteGeometry
  /** Footprint in tiles; the overlay renders nothing when it is not positive. */
  size: FootprintTile | null
  humanDoor: FootprintTile | null
  upgradeSign: FootprintTile | null
  animalDoor: FootprintRect | null
  /** Extra ground the building reserves, in footprint-relative tiles. */
  additionalTiles: readonly FootprintRect[]
  /** Field a tile click writes to; `null` disables picking. */
  pickTarget: FootprintPickTarget | null
  onPickTile: (target: FootprintTilePickTarget, tile: FootprintTile) => void
  onPickRect: (target: FootprintRectPickTarget, rect: FootprintRect) => void
}

/** Marker box for one tile-space rectangle, in overlay (screen-pixel) units. */
function markerStyle(rect: FootprintRect, tilePx: number, gridHeight: number) {
  return {
    left: `${rect.X * tilePx}px`,
    bottom: `${gridHeight - (rect.Y + rect.Height) * tilePx}px`,
    width: `${rect.Width * tilePx}px`,
    height: `${rect.Height * tilePx}px`,
  }
}

/** The rectangle spanned by two corner tiles, inclusive of both. */
function rectBetween(anchor: FootprintTile, corner: FootprintTile): FootprintRect {
  return {
    X: Math.min(anchor.X, corner.X),
    Y: Math.min(anchor.Y, corner.Y),
    Width: Math.abs(corner.X - anchor.X) + 1,
    Height: Math.abs(corner.Y - anchor.Y) + 1,
  }
}

export function BuildingFootprintOverlay({
  geometry,
  size,
  humanDoor,
  upgradeSign,
  animalDoor,
  additionalTiles,
  pickTarget,
  onPickTile,
  onPickRect,
}: BuildingFootprintOverlayProps) {
  const copy = useBuildingDataEditorCopy()
  const [anchor, setAnchor] = useState<FootprintTile | null>(null)
  const [hovered, setHovered] = useState<FootprintTile | null>(null)

  // Switching target (or leaving pick mode) abandons a half-drawn rectangle
  // rather than letting its anchor apply to the next field.
  useEffect(() => {
    setAnchor(null)
    setHovered(null)
  }, [pickTarget])

  if (size === null || size.X <= 0 || size.Y <= 0) {
    return null
  }

  const tilesWide = Math.round(size.X)
  const tilesHigh = Math.round(size.Y)
  const tilePx = TILE_PIXELS * geometry.scale
  const gridWidth = tilesWide * tilePx
  const gridHeight = tilesHigh * tilePx
  const rectMode = pickTarget !== null && isFootprintRectTarget(pickTarget)

  const markers: Array<{ key: string; className: string; rect: FootprintRect }> = []
  if (humanDoor !== null) {
    markers.push({ key: 'human-door', className: 'is-human-door', rect: { ...humanDoor, Width: 1, Height: 1 } })
  }
  if (upgradeSign !== null) {
    markers.push({ key: 'upgrade-sign', className: 'is-upgrade-sign', rect: { ...upgradeSign, Width: 1, Height: 1 } })
  }
  if (animalDoor !== null && animalDoor.Width > 0 && animalDoor.Height > 0) {
    markers.push({ key: 'animal-door', className: 'is-animal-door', rect: animalDoor })
  }
  additionalTiles.forEach((rect, index) => {
    markers.push({ key: `additional-${index}`, className: 'is-additional', rect })
  })

  // While a rect anchor is down, the span to the hovered tile previews what a
  // second click would commit.
  const pendingRect = rectMode && anchor !== null ? rectBetween(anchor, hovered ?? anchor) : null
  if (pendingRect !== null) {
    markers.push({ key: 'pending', className: 'is-pending', rect: pendingRect })
  }

  function handleCellClick(tile: FootprintTile) {
    if (pickTarget === null) {
      return
    }
    if (!isFootprintRectTarget(pickTarget)) {
      onPickTile(pickTarget, tile)
      return
    }
    if (anchor === null) {
      setAnchor(tile)
      setHovered(tile)
      return
    }
    onPickRect(pickTarget, rectBetween(anchor, tile))
    setAnchor(null)
  }

  return (
    <div
      className={cx('building-footprint-overlay', pickTarget !== null && 'is-picking')}
      style={{
        width: `${geometry.sourceWidth * geometry.scale}px`,
        height: `${geometry.sourceHeight * geometry.scale}px`,
        transform: `scale(${1 / geometry.scale})`,
        transformOrigin: 'bottom left',
      }}
    >
      <div
        className="building-footprint-grid"
        style={{
          width: `${gridWidth}px`,
          height: `${gridHeight}px`,
          gridTemplateColumns: `repeat(${tilesWide}, ${tilePx}px)`,
          gridTemplateRows: `repeat(${tilesHigh}, ${tilePx}px)`,
        }}
      >
        {Array.from({ length: tilesWide * tilesHigh }, (_, index) => {
          const x = index % tilesWide
          const y = Math.floor(index / tilesWide)
          const label = copy.preview.tileLabel(x, y)
          return pickTarget === null ? (
            <div key={`${x}:${y}`} className="building-footprint-cell" />
          ) : (
            <button
              key={`${x}:${y}`}
              type="button"
              className="building-footprint-cell"
              title={label}
              aria-label={label}
              onClick={() => handleCellClick({ X: x, Y: y })}
              onPointerEnter={rectMode ? () => setHovered({ X: x, Y: y }) : undefined}
              onFocus={rectMode ? () => setHovered({ X: x, Y: y }) : undefined}
            />
          )
        })}

        {markers.map((marker) => (
          <div
            key={marker.key}
            className={cx('building-footprint-marker', marker.className)}
            style={markerStyle(marker.rect, tilePx, gridHeight)}
          />
        ))}
      </div>
    </div>
  )
}
