import type { MapPropertyValue } from './mapTypes'

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

export type FocusedMapObjectTarget = {
  groupId: number
  objectId: number
  nonce: number
}

export type ViewportWorldPoint = {
  worldX: number
  worldY: number
}
