/**
 * @file Map viewport shared types: loaded tileset image entries and other
 * viewport-internal data structures.
 */

import type { MapTileset } from '@entities/map'

export type LoadedTilesetImage = {
  image: HTMLImageElement
  tileset: MapTileset
}
