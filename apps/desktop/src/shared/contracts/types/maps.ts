/** Value type for a map property — string, number, or boolean. */
export type MapPropertyValue = string | number | boolean

/** One frame in a tileset tile animation. */
export type MapTilesetAnimationFrame = {
  tileId: number
  duration: number
}

/** One tileset in a map — first gid, dimensions, image, properties, and animations. */
export type MapTileset = {
  firstGid: number
  name: string
  tileWidth: number
  tileHeight: number
  tileCount: number
  columns: number
  imageSource: string | null
  imagePath: string | null
  imageWidth: number | null
  imageHeight: number | null
  properties: Record<string, MapPropertyValue>
  tileProperties: Record<number, Record<string, MapPropertyValue>>
  animations: Record<number, MapTilesetAnimationFrame[]>
}

/** One tile layer in a map — id, name, dimensions, visibility, opacity, and GID array. */
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

/** One map object (entity placed on the map with position, size, rotation, and properties). */
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

/** One object group layer in a map — id, name, visibility, draw order, and contained objects. */
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

/** One map placement in a world atlas — map name, source path, offset, and dimensions. */
export type MapAtlasPlacement = {
  mapName: string
  sourcePath: string
  relativePath: string
  offsetX: number
  offsetY: number
  width: number
  height: number
}

/** One point in a world atlas (tile or pixel coordinates). */
export type MapAtlasPoint = {
  x: number
  y: number
}

/** One warp route connecting two maps in the world atlas. */
export type MapAtlasWarpRoute = {
  id: string
  fromMap: string
  toMap: string
  source: MapAtlasPoint
  target: MapAtlasPoint
  path: MapAtlasPoint[]
}

/** One portal in the world atlas — from map, target map, label, and position. */
export type MapAtlasPortal = {
  id: string
  fromMap: string
  targetMap: string
  label: string
  position: MapAtlasPoint
}

/** World atlas data — root map, origin offset, placements, warp routes, and portals. */
export type MapAtlasData = {
  rootMapName: string
  originOffsetX: number
  originOffsetY: number
  placements: MapAtlasPlacement[]
  warpRoutes: MapAtlasWarpRoute[]
  portals: MapAtlasPortal[]
}

/** Parsed map document — name, format, dimensions, tilesets, layers, object groups, and optional atlas. */
export type MapDocument = {
  name: string
  format: 'tmx' | 'xnb' | 'atlas'
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
  atlas?: MapAtlasData
}
