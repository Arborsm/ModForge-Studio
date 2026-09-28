/**
 * @file Per-cell layer reads: resolves the tile a named layer holds at one
 * grid cell, shared by the map-card dialogs and tile previews.
 */

import type { MapDocument } from './types'
import { stripTileGidFlags } from './tileFlags'

/**
 * Returns the flag-stripped gid at (x, y) on the named layer, or 0 when the
 * layer/cell is missing or out of range.
 */
export function gidAtCell(document: MapDocument, layerName: string, x: number, y: number) {
  const layer = document.layers.find((candidate) => candidate.name === layerName)
  if (!layer || x < 0 || y < 0 || x >= layer.width || y >= layer.height) return 0
  return stripTileGidFlags(layer.gids[y * layer.width + x] >>> 0)
}
