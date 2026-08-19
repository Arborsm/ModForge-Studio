/**
 * @file Tileset lookup helpers: finds the tileset that owns a given GID and
 * resolves tile-local ids within a map's tileset collection.
 */

import type { MapTileset } from './types'

/** Finds the tileset that owns a given GID by scanning tilesets in descending firstGid order. */
export function findTilesetForGid(tilesets: MapTileset[], gid: number) {
  for (let index = tilesets.length - 1; index >= 0; index -= 1) {
    const tileset = tilesets[index]
    if (gid >= tileset.firstGid) {
      return tileset
    }
  }

  return null
}
