export type MapPropertyValue = string | number | boolean | { value: MapPropertyValue; tmxType: string; propertyType?: string }

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
  source?: string | null
  margin?: number
  spacing?: number
  tileOffsetX?: number
  tileOffsetY?: number
  imageSource: string | null
  imagePath: string | null
  imageWidth: number | null
  imageHeight: number | null
  imageTrans?: string | null
  properties: Record<string, MapPropertyValue>
  tileProperties: Record<number, Record<string, MapPropertyValue>>
  animations: Record<number, MapTilesetAnimationFrame[]>
  preservedAttributes?: Record<string, string>
  tilePreservedAttributes?: Record<number, Record<string, string>>
  tilePreservedXml?: Record<number, Array<{ xml: string }>>
  preservedXml?: Array<{ xml: string }>
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
  dataEncoding?: 'csv' | 'xml' | 'base64'
  dataCompression?: string | null
  cellProperties?: Record<number, Record<string, MapPropertyValue>>
  cellAnimations?: Record<number, MapTilesetAnimationFrame[]>
  preservedXml?: Array<{ xml: string }>
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
  visible?: boolean
  gid?: number | null
  template?: string | null
  class?: string | null
  shape?: string
  properties: Record<string, MapPropertyValue>
  preservedXml?: Array<{ xml: string }>
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
  preservedXml?: Array<{ xml: string }>
}

export type MapAtlasPlacement = {
  mapName: string
  sourcePath: string
  relativePath: string
  offsetX: number
  offsetY: number
  width: number
  height: number
}

export type MapAtlasPoint = {
  x: number
  y: number
}

export type MapAtlasWarpRoute = {
  id: string
  fromMap: string
  toMap: string
  source: MapAtlasPoint
  target: MapAtlasPoint
  path: MapAtlasPoint[]
}

export type MapAtlasPortal = {
  id: string
  fromMap: string
  targetMap: string
  label: string
  position: MapAtlasPoint
}

export type MapAtlasData = {
  rootMapName: string
  originOffsetX: number
  originOffsetY: number
  placements: MapAtlasPlacement[]
  warpRoutes: MapAtlasWarpRoute[]
  portals: MapAtlasPortal[]
}

export type MapDocument = {
  name: string
  format: 'tmx' | 'tbin' | 'xnb' | 'atlas'
  sourcePath: string
  relativePath: string
  width: number
  height: number
  tileWidth: number
  tileHeight: number
  orientation: string
  renderOrder: string
  tmxVersion?: string | null
  tiledVersion?: string | null
  nextLayerId?: number | null
  nextObjectId?: number | null
  infinite?: boolean
  properties: Record<string, MapPropertyValue>
  tilesets: MapTileset[]
  layers: MapLayer[]
  objectGroups: MapObjectGroup[]
  layerOrder?: Array<{ tileLayer: number } | { objectGroup: number } | { preserved: number }>
  preservedXml?: Array<{ xml: string }>
  atlas?: MapAtlasData
}
