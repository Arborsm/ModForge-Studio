import type { MapDocument, MapLayer } from './mapTypes'
import { cellOverlayRule, deriveCellOverlayCells, type CellOverlayRule } from './cellProperties'
import { stripTileGidFlags } from './tileFlags'
import { findTilesetForGid } from './tilesets'

/**
 * One cell of the derived overlay view: the display rule plus a flag telling
 * whether it came from the tileset definition level rather than an instance
 * property. Definition-level rules are shared by every map using the tileset
 * and cannot be painted over directly, so the viewport renders them dimmer.
 */
export type CellOverlayCell = { rule: CellOverlayRule; tilesetDerived: boolean }

/**
 * Derives the overlay view model for one layer by merging the three sources
 * the game reads per-tile properties from, in precedence order so the first
 * source that defines a cell wins (matching Stardew's instance-over-definition
 * lookup, where a cell's instance properties beat its tileset's):
 *
 * 1. `layer.cellProperties` — tbin per-cell instance properties;
 * 2. `TileData` objects inside the object group named exactly like the layer —
 *    the TMX instance carrier; an object's properties apply to every cell its
 *    pixel rect covers, but only where the layer actually has a tile placed;
 * 3. tileset definition-level `tileProperties` resolved from each placed gid.
 *
 * Cells with none of the overlay property keys are omitted; definition-level
 * cells are flagged `tilesetDerived`.
 */
export function deriveCellOverlayView(document: MapDocument, layer: MapLayer): Record<number, CellOverlayCell> {
  const cells: Record<number, CellOverlayCell> = {}

  function writeIfAbsent(index: number, rule: CellOverlayRule, tilesetDerived: boolean) {
    if (index in cells) return
    cells[index] = { rule, tilesetDerived }
  }

  // 1. tbin per-cell instance properties (also the paint path's backing store).
  for (const [indexKey, rule] of Object.entries(deriveCellOverlayCells(layer.cellProperties ?? {}))) {
    writeIfAbsent(Number(indexKey), rule, false)
  }

  // 2. TileData objects on the group named exactly like the layer (xTile
  // semantics), each covering the cells its pixel rect maps onto.
  const tileWidth = document.tileWidth
  const tileHeight = document.tileHeight
  for (const group of document.objectGroups) {
    if (group.name !== layer.name) continue
    for (const object of group.objects) {
      if (object.name !== 'TileData') continue
      const rule = cellOverlayRule(object.properties)
      if (!rule) continue
      const startX = Math.floor(object.x / tileWidth)
      const startY = Math.floor(object.y / tileHeight)
      const endX = Math.floor((object.x + object.width - 1) / tileWidth)
      const endY = Math.floor((object.y + object.height - 1) / tileHeight)
      for (let y = startY; y <= endY; y += 1) {
        if (y < 0 || y >= layer.height) continue
        for (let x = startX; x <= endX; x += 1) {
          if (x < 0 || x >= layer.width) continue
          const index = y * layer.width + x
          // Empty tiles (gid 0) never pick up instance rules in the game.
          if (stripTileGidFlags(layer.gids[index]) === 0) continue
          writeIfAbsent(index, rule, false)
        }
      }
    }
  }

  // 3. Tileset definition-level tile properties by placed gid.
  for (let index = 0; index < layer.gids.length; index += 1) {
    const gid = stripTileGidFlags(layer.gids[index])
    if (gid === 0) continue
    const tileset = findTilesetForGid(document.tilesets, gid)
    if (!tileset) continue
    const rule = cellOverlayRule(tileset.tileProperties[gid - tileset.firstGid] ?? {})
    if (!rule) continue
    writeIfAbsent(index, rule, true)
  }

  return cells
}
