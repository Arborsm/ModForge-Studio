import type { MapPropertyValue } from './maps'

/** Hover info for one map object under the cursor. */
export type HoverObjectInfo = {
  id: number
  name: string
  type: string
  groupName: string
  x: number
  y: number
  width: number
  height: number
}

/** Tile hover info — tile/pixel coordinates, layer, gid, tileset, tile id, properties, and object hits. */
export type TileHoverInfo = {
  tileX: number
  tileY: number
  pixelX: number
  pixelY: number
  layerName: string | null
  gid: number | null
  tilesetName: string | null
  tileId: number | null
  tileProperties: Record<string, MapPropertyValue> | null
  objectHits: HoverObjectInfo[]
}

/** Identifies a focused map object by group id, object id, and a nonce for focus change detection. */
export type FocusedMapObjectTarget = {
  groupId: number
  objectId: number
  nonce: number
}

/** One point in world (tile) coordinates. */
export type ViewportWorldPoint = {
  worldX: number
  worldY: number
}
