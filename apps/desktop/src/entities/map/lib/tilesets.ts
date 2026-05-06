import type { MapTileset } from './types'

export function findTilesetForGid(tilesets: MapTileset[], gid: number) {
  for (let index = tilesets.length - 1; index >= 0; index -= 1) {
    const tileset = tilesets[index]
    if (gid >= tileset.firstGid) {
      return tileset
    }
  }

  return null
}
