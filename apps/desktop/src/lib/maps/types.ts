export type MapPropertyValue = string | number | boolean

export type MapTilesetAnimationFrame = {
  tileId: number
  duration: number
}

export type MapTileset = {
  firstGid: number
  name: string
  tileWidth: number
  tileHeight: number
  tileCount: number
  columns: number
  imageSource: string | null
  imageWidth: number | null
  imageHeight: number | null
  properties: Record<string, MapPropertyValue>
  tileProperties: Record<number, Record<string, MapPropertyValue>>
  animations: Record<number, MapTilesetAnimationFrame[]>
}

export type MapLayer = {
  id: number
  name: string
  kind: 'tile'
  width: number
  height: number
  visible: boolean
  opacity: number
  offsetX: number
  offsetY: number
  properties: Record<string, MapPropertyValue>
  gids: Uint32Array
  nonEmptyTiles: number
}

export type MapObject = {
  id: number
  name: string
  type: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  properties: Record<string, MapPropertyValue>
}

export type MapObjectGroup = {
  id: number
  name: string
  kind: 'object'
  visible: boolean
  opacity: number
  drawOrder: string
  properties: Record<string, MapPropertyValue>
  objects: MapObject[]
}

export type MapDocument = {
  name: string
  format: 'tmx'
  sourcePath: string
  relativePath: string
  width: number
  height: number
  tileWidth: number
  tileHeight: number
  orientation: string
  renderOrder: string
  properties: Record<string, MapPropertyValue>
  tilesets: MapTileset[]
  layers: MapLayer[]
  objectGroups: MapObjectGroup[]
}
