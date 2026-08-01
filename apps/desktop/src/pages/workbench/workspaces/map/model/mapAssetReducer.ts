import {
  FLIPPED_DIAGONALLY_FLAG,
  FLIPPED_HORIZONTALLY_FLAG,
  FLIPPED_VERTICALLY_FLAG,
  TILE_GID_FLAG_MASK,
  TILE_ID_MASK,
  type MapDocument,
  type MapLayer,
  type MapPropertyValue,
} from '@entities/map'

export type MapAssetPoint = { x: number; y: number }
export type MapAssetTbinIssue =
  | 'objects'
  | 'transforms'
  | 'extensions'
  | 'tilesetLayout'
  | 'tileDefinitions'
  | 'layerPresentation'
  | 'typedProperties'
  | 'externalTilesets'

export type MapAssetLayerNameIssue = { kind: 'empty'; id: number } | { kind: 'duplicate'; name: string }

/** Finds empty and case-insensitive duplicate layer names before Stardew/CP lookup becomes ambiguous. */
export function collectMapAssetLayerNameIssues(document: MapDocument): MapAssetLayerNameIssue[] {
  const names = [...document.layers, ...document.objectGroups].map((layer) => ({ id: layer.id, name: layer.name.trim() }))
  const issues: MapAssetLayerNameIssue[] = names.filter((entry) => entry.name === '').map((entry) => ({ kind: 'empty', id: entry.id }))
  const counts = new Map<string, { name: string; count: number }>()
  for (const entry of names) {
    if (!entry.name) continue
    const key = entry.name.toLowerCase()
    const current = counts.get(key)
    counts.set(key, { name: current?.name ?? entry.name, count: (current?.count ?? 0) + 1 })
  }
  for (const value of counts.values()) {
    if (value.count > 1) issues.push({ kind: 'duplicate', name: value.name })
  }
  return issues
}

function hasTypedProperty(properties: Record<string, unknown>): boolean {
  return Object.values(properties).some(
    (value) => typeof value === 'object' && value !== null && ('tmxType' in value || 'propertyType' in value),
  )
}

/** Returns every semantic feature that prevents lossless TBin serialization. */
export function collectMapAssetTbinIssues(document: MapDocument): MapAssetTbinIssue[] {
  const issues = new Set<MapAssetTbinIssue>()
  if (document.objectGroups.length > 0) issues.add('objects')
  if (document.layers.some((layer) => Array.from(layer.gids).some((gid) => (gid & TILE_GID_FLAG_MASK) !== 0))) issues.add('transforms')
  if (
    document.preservedXml?.length ||
    document.layers.some((layer) => layer.preservedXml?.length) ||
    document.tilesets.some((tileset) => tileset.preservedXml?.length)
  )
    issues.add('extensions')
  if (
    document.tilesets.some(
      (tileset) =>
        (tileset.margin ?? 0) !== 0 ||
        (tileset.spacing ?? 0) !== 0 ||
        (tileset.tileOffsetX ?? 0) !== 0 ||
        (tileset.tileOffsetY ?? 0) !== 0 ||
        tileset.imageTrans != null,
    )
  )
    issues.add('tilesetLayout')
  if (document.tilesets.some((tileset) => Object.keys(tileset.tileProperties).length > 0 || Object.keys(tileset.animations).length > 0)) {
    issues.add('tileDefinitions')
  }
  if (document.tilesets.some((tileset) => tileset.source != null)) issues.add('externalTilesets')
  if (document.layers.some((layer) => layer.opacity !== 1 || layer.offsetX !== 0 || layer.offsetY !== 0)) issues.add('layerPresentation')
  if (
    hasTypedProperty(document.properties) ||
    document.tilesets.some(
      (tileset) => hasTypedProperty(tileset.properties) || Object.values(tileset.tileProperties).some(hasTypedProperty),
    ) ||
    document.layers.some((layer) => hasTypedProperty(layer.properties) || Object.values(layer.cellProperties ?? {}).some(hasTypedProperty))
  )
    issues.add('typedProperties')
  return [...issues]
}

function cloneLayer(layer: MapLayer): MapLayer {
  return {
    ...layer,
    gids: new Uint32Array(layer.gids),
    properties: { ...layer.properties },
    cellProperties: Object.fromEntries(Object.entries(layer.cellProperties ?? {}).map(([index, properties]) => [index, { ...properties }])),
    cellAnimations: Object.fromEntries(
      Object.entries(layer.cellAnimations ?? {}).map(([index, frames]) => [index, frames.map((frame) => ({ ...frame }))]),
    ),
  }
}

function updateLayer(document: MapDocument, layerId: number, transform: (layer: MapLayer) => MapLayer): MapDocument {
  return {
    ...document,
    layers: document.layers.map((layer) => (layer.id === layerId ? transform(cloneLayer(layer)) : layer)),
  }
}

function recount(layer: MapLayer) {
  layer.nonEmptyTiles = Array.from(layer.gids).filter((gid) => (gid & TILE_ID_MASK) !== 0).length
  return layer
}

/** Applies one GID to all valid points while preserving sparse cell metadata. */
export function applyMapAssetStroke(document: MapDocument, layerId: number, points: readonly MapAssetPoint[], gid: number): MapDocument {
  return updateLayer(document, layerId, (layer) => {
    for (const point of points) {
      if (point.x < 0 || point.y < 0 || point.x >= layer.width || point.y >= layer.height) continue
      layer.gids[point.y * layer.width + point.x] = gid >>> 0
    }
    return recount(layer)
  })
}

/** Applies a rectangular atlas selection without wrapping beyond the selected tileset. */
export function applyMapAssetStamp(
  document: MapDocument,
  layerId: number,
  origin: MapAssetPoint,
  selection: { firstGid: number; startIndex: number; width: number; height: number; columns: number; tileCount: number },
): MapDocument {
  const placements: Array<{ point: MapAssetPoint; gid: number }> = []
  for (let row = 0; row < selection.height; row += 1) {
    for (let column = 0; column < selection.width; column += 1) {
      const sourceColumn = (selection.startIndex % selection.columns) + column
      const sourceRow = Math.floor(selection.startIndex / selection.columns) + row
      if (sourceColumn >= selection.columns) continue
      const tileIndex = sourceRow * selection.columns + sourceColumn
      if (tileIndex >= selection.tileCount) continue
      placements.push({ point: { x: origin.x + column, y: origin.y + row }, gid: selection.firstGid + tileIndex })
    }
  }
  return updateLayer(document, layerId, (layer) => {
    for (const placement of placements) {
      const { x, y } = placement.point
      if (x >= 0 && y >= 0 && x < layer.width && y < layer.height) layer.gids[y * layer.width + x] = placement.gid >>> 0
    }
    return recount(layer)
  })
}

/** Returns the contiguous full-GID region used by the asset editor bucket tool. */
export function mapAssetBucketPoints(document: MapDocument, layerId: number, start: MapAssetPoint): MapAssetPoint[] {
  const layer = document.layers.find((candidate) => candidate.id === layerId)
  if (!layer || start.x < 0 || start.y < 0 || start.x >= layer.width || start.y >= layer.height) return []
  const target = layer.gids[start.y * layer.width + start.x] ?? 0
  const queue = [start]
  const visited = new Set<string>()
  const points: MapAssetPoint[] = []
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const point = queue[cursor]!
    const key = `${point.x}:${point.y}`
    if (visited.has(key) || point.x < 0 || point.y < 0 || point.x >= layer.width || point.y >= layer.height) continue
    visited.add(key)
    if (layer.gids[point.y * layer.width + point.x] !== target) continue
    points.push(point)
    queue.push(
      { x: point.x - 1, y: point.y },
      { x: point.x + 1, y: point.y },
      { x: point.x, y: point.y - 1 },
      { x: point.x, y: point.y + 1 },
    )
  }
  return points
}

/** Sets instance properties at one map cell without changing tileset definition properties. */
export function setMapAssetCellProperties(
  document: MapDocument,
  layerId: number,
  point: MapAssetPoint,
  properties: Record<string, MapPropertyValue>,
): MapDocument {
  return updateLayer(document, layerId, (layer) => {
    const index = point.y * layer.width + point.x
    const next = { ...layer.cellProperties }
    if (Object.keys(properties).length === 0) delete next[index]
    else next[index] = { ...properties }
    layer.cellProperties = next
    return layer
  })
}

export function toggleMapAssetTileFlag(document: MapDocument, layerId: number, point: MapAssetPoint, flag: number): MapDocument {
  return updateLayer(document, layerId, (layer) => {
    const index = point.y * layer.width + point.x
    layer.gids[index] = ((layer.gids[index] ?? 0) ^ flag) >>> 0
    return layer
  })
}

const CLOCKWISE_FLAGS = new Map<number, number>([
  [0, FLIPPED_HORIZONTALLY_FLAG | FLIPPED_DIAGONALLY_FLAG],
  [FLIPPED_HORIZONTALLY_FLAG, FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG | FLIPPED_DIAGONALLY_FLAG],
  [FLIPPED_VERTICALLY_FLAG, FLIPPED_DIAGONALLY_FLAG],
  [FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG, FLIPPED_VERTICALLY_FLAG | FLIPPED_DIAGONALLY_FLAG],
  [FLIPPED_DIAGONALLY_FLAG, FLIPPED_HORIZONTALLY_FLAG],
  [FLIPPED_HORIZONTALLY_FLAG | FLIPPED_DIAGONALLY_FLAG, FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG],
  [FLIPPED_VERTICALLY_FLAG | FLIPPED_DIAGONALLY_FLAG, 0],
  [FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG | FLIPPED_DIAGONALLY_FLAG, FLIPPED_VERTICALLY_FLAG],
])

/** Rotates one transformed TMX tile clockwise without discarding existing flip state. */
export function rotateMapAssetTileClockwise(document: MapDocument, layerId: number, point: MapAssetPoint): MapDocument {
  return updateLayer(document, layerId, (layer) => {
    const index = point.y * layer.width + point.x
    const gid = layer.gids[index] ?? 0
    const flags = (gid & TILE_GID_FLAG_MASK) >>> 0
    layer.gids[index] = ((gid & TILE_ID_MASK) | (CLOCKWISE_FLAGS.get(flags) ?? flags)) >>> 0
    return layer
  })
}

export function addMapAssetLayer(document: MapDocument, name: string): MapDocument {
  const nextId = Math.max(
    document.nextLayerId ?? 1,
    ...document.layers.map((layer) => layer.id + 1),
    ...document.objectGroups.map((group) => group.id + 1),
  )
  const layer: MapLayer = {
    id: nextId,
    name,
    kind: 'tile',
    width: document.width,
    height: document.height,
    visible: true,
    opacity: 1,
    offsetX: 0,
    offsetY: 0,
    properties: {},
    gids: new Uint32Array(document.width * document.height),
    nonEmptyTiles: 0,
    dataEncoding: 'csv',
    cellProperties: {},
    cellAnimations: {},
  }
  return { ...document, nextLayerId: nextId + 1, layers: [...document.layers, layer] }
}

export function reorderMapAssetLayer(document: MapDocument, layerId: number, offset: -1 | 1): MapDocument {
  const index = document.layers.findIndex((layer) => layer.id === layerId)
  const target = index + offset
  if (index < 0 || target < 0 || target >= document.layers.length) return document
  const layers = [...document.layers]
  ;[layers[index], layers[target]] = [layers[target]!, layers[index]!]
  return { ...document, layers }
}

export function deleteMapAssetLayer(document: MapDocument, layerId: number): MapDocument {
  if (document.layers.length <= 1) return document
  return { ...document, layers: document.layers.filter((layer) => layer.id !== layerId) }
}

/** Computes a portable asset reference from a map file to another project asset. */
export function relativeMapAssetReference(mapPath: string, assetPath: string) {
  const from = mapPath.replaceAll('\\', '/').split('/').filter(Boolean)
  const to = assetPath.replaceAll('\\', '/').split('/').filter(Boolean)
  from.pop()
  let common = 0
  while (common < from.length && common < to.length && from[common]!.toLowerCase() === to[common]!.toLowerCase()) common += 1
  return [...Array.from({ length: from.length - common }, () => '..'), ...to.slice(common)].join('/')
}
