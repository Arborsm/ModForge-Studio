export type MapTileEditDraft = {
  layer: string
  x: number | string
  y: number | string
  setTilesheet?: string
  setIndex?: number | string
  remove?: boolean
  setProperties?: Record<string, unknown>
  _raw?: Record<string, unknown>
}

export type MapTilePoint = { x: number; y: number }

export type MapPatchArea = { x: number; y: number; width: number; height: number }

export type MapPatchMode = 'Overlay' | 'Replace' | 'ReplaceByLayer'

export type MapWarpDraft = {
  fromX: number | string
  fromY: number | string
  toMap: string
  toX: number | string
  toY: number | string
  rawExpression?: string
}

/** Splits CP multi-target expressions while retaining commas inside token braces. */
export function splitMapTargets(expression: string): string[] {
  const targets: string[] = []
  let start = 0
  let braceDepth = 0
  for (let index = 0; index < expression.length; index += 1) {
    const pair = expression.slice(index, index + 2)
    if (pair === '{{') {
      braceDepth += 1
      index += 1
    } else if (pair === '}}' && braceDepth > 0) {
      braceDepth -= 1
      index += 1
    } else if (expression[index] === ',' && braceDepth === 0) {
      const target = expression.slice(start, index).trim()
      if (target) targets.push(target)
      start = index + 1
    }
  }
  const target = expression.slice(start).trim()
  if (target) targets.push(target)
  return targets.length > 0 ? targets : [expression]
}

function tileKey(tile: Pick<MapTileEditDraft, 'layer' | 'x' | 'y'>): string {
  return `${tile.layer}\0${String(tile.x)}\0${String(tile.y)}`
}

/** Expands an inclusive rectangle into one deterministic tile stroke. */
export function rectangleTilePoints(left: number, top: number, width: number, height: number): MapTilePoint[] {
  const points: MapTilePoint[] = []
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) points.push({ x, y })
  }
  return points
}

/** Replaces SetProperties for one tile edit while retaining its other CP fields. */
export function setMapTileProperties(
  current: readonly MapTileEditDraft[],
  layer: string,
  point: MapTilePoint,
  properties: Record<string, unknown>,
): MapTileEditDraft[] {
  const next = [...current]
  const index = next.findLastIndex((entry) => entry.layer === layer && entry.x === point.x && entry.y === point.y)
  if (index < 0) {
    if (Object.keys(properties).length > 0) next.push({ layer, x: point.x, y: point.y, setProperties: properties })
    return next
  }
  const existing = next[index]!
  if (Object.keys(properties).length > 0) next[index] = { ...existing, setProperties: properties }
  else {
    const { setProperties: _removed, ...rest } = existing
    void _removed
    next[index] = rest
  }
  return next
}

/** Removes duplicate coordinates while retaining the last edit, matching CP patch order. */
export function compactMapTileEdits(edits: readonly MapTileEditDraft[]): MapTileEditDraft[] {
  const result: MapTileEditDraft[] = []
  const indices = new Map<string, number>()
  for (const edit of edits) {
    const key = tileKey(edit)
    const previous = indices.get(key)
    if (previous === undefined) {
      indices.set(key, result.length)
      result.push(edit)
    } else {
      result[previous] = edit
    }
  }
  return result
}

/** Adds or replaces a warp by source coordinate; later entries have CP priority. */
export function upsertMapWarp(current: readonly MapWarpDraft[], warp: MapWarpDraft): MapWarpDraft[] {
  return [...current.filter((entry) => entry.fromX !== warp.fromX || entry.fromY !== warp.fromY), warp]
}

const GID_FLAGS = 0xf0000000

type SparseCells<T> = Record<number, T>
type PreviewLayer = MapDocument['layers'][number]

function normalizeTilesetImage(value: string | null): string {
  const segments: string[] = []
  for (const segment of (value ?? '').replaceAll('\\', '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment.toLowerCase())
  }
  return segments.join('/')
}

function remapSparseWidth<T>(cells: SparseCells<T> | undefined, oldWidth: number, newWidth: number): SparseCells<T> | undefined {
  if (!cells) return undefined
  return Object.fromEntries(
    Object.entries(cells).map(([rawIndex, value]) => {
      const index = Number(rawIndex)
      const x = index % oldWidth
      const y = Math.floor(index / oldWidth)
      return [String(y * newWidth + x), value]
    }),
  )
}

function cloneLayerAtSize(layer: PreviewLayer, width: number, height: number): PreviewLayer {
  const gids = new Uint32Array(width * height)
  for (let y = 0; y < Math.min(layer.height, height); y += 1) {
    for (let x = 0; x < Math.min(layer.width, width); x += 1) gids[y * width + x] = layer.gids[y * layer.width + x] ?? 0
  }
  return {
    ...layer,
    width,
    height,
    gids,
    cellProperties: remapSparseWidth(layer.cellProperties, layer.width, width),
    cellAnimations: remapSparseWidth(layer.cellAnimations, layer.width, width),
  }
}

function copySparseCell(source: PreviewLayer, target: PreviewLayer, sourceIndex: number, targetIndex: number) {
  const sourceProperties = source.cellProperties?.[sourceIndex]
  if (sourceProperties === undefined) {
    if (target.cellProperties) delete target.cellProperties[targetIndex]
  } else {
    target.cellProperties = { ...target.cellProperties, [targetIndex]: sourceProperties }
  }
  const sourceAnimation = source.cellAnimations?.[sourceIndex]
  if (sourceAnimation === undefined) {
    if (target.cellAnimations) delete target.cellAnimations[targetIndex]
  } else {
    target.cellAnimations = { ...target.cellAnimations, [targetIndex]: sourceAnimation }
  }
}

function mergePreviewTilesets(target: MapDocument, source: MapDocument) {
  const tilesets = target.tilesets.map((tileset) => ({ ...tileset }))
  const gidMapping = new Map<number, number>()
  for (const sourceTileset of source.tilesets) {
    const existing = tilesets.find(
      (targetTileset) =>
        targetTileset.name === sourceTileset.name &&
        normalizeTilesetImage(targetTileset.imageSource) === normalizeTilesetImage(sourceTileset.imageSource),
    )
    if (existing) {
      for (let index = 0; index < sourceTileset.tileCount; index += 1) {
        gidMapping.set(sourceTileset.firstGid + index, existing.firstGid + index)
      }
      continue
    }
    const firstGid = tilesets.length === 0 ? 1 : Math.max(...tilesets.map((tileset) => tileset.firstGid + tileset.tileCount))
    let name = sourceTileset.name
    if (tilesets.some((tileset) => tileset.name === name)) {
      const base = `z_${name.replace(/^z_/u, '')}`
      name = base
      for (let suffix = 2; tilesets.some((tileset) => tileset.name === name); suffix += 1) name = `${base}_${suffix}`
    }
    tilesets.push({ ...sourceTileset, firstGid, name })
    for (let index = 0; index < sourceTileset.tileCount; index += 1) {
      gidMapping.set(sourceTileset.firstGid + index, firstGid + index)
    }
  }
  return { tilesets, remapGid: (gid: number) => ((gidMapping.get((gid & ~GID_FLAGS) >>> 0) ?? gid & ~GID_FLAGS) | (gid & GID_FLAGS)) >>> 0 }
}

/** Applies a statically resolvable FromFile region with Content Patcher PatchMode semantics. */
export function applyMapAreaPreview(
  target: MapDocument,
  source: MapDocument,
  fromArea: MapPatchArea | null,
  toArea: MapPatchArea | null,
  patchMode: MapPatchMode,
): MapDocument {
  const from = fromArea ?? { x: 0, y: 0, width: source.width, height: source.height }
  const to = toArea ?? { x: 0, y: 0, width: from.width, height: from.height }
  if (from.width !== to.width || from.height !== to.height || from.width < 0 || from.height < 0) return target
  const width = Math.max(target.width, to.x + to.width)
  const height = Math.max(target.height, to.y + to.height)
  const { tilesets, remapGid } = mergePreviewTilesets(target, source)
  const layers = target.layers.map((layer) => cloneLayerAtSize(layer as PreviewLayer, width, height))

  for (const targetLayer of layers) {
    const sourceLayer = source.layers.find((layer) => layer.name === targetLayer.name) as PreviewLayer | undefined
    if (sourceLayer) {
      targetLayer.properties = { ...sourceLayer.properties }
      for (let dy = 0; dy < to.height; dy += 1) {
        for (let dx = 0; dx < to.width; dx += 1) {
          const sx = from.x + dx
          const sy = from.y + dy
          if (sx < 0 || sy < 0 || sx >= sourceLayer.width || sy >= sourceLayer.height) continue
          const sourceIndex = sy * sourceLayer.width + sx
          const targetIndex = (to.y + dy) * width + to.x + dx
          const sourceGid = sourceLayer.gids[sourceIndex] ?? 0
          if (patchMode === 'Overlay' && sourceGid === 0) continue
          targetLayer.gids[targetIndex] = remapGid(sourceGid)
          copySparseCell(sourceLayer, targetLayer, sourceIndex, targetIndex)
        }
      }
    } else if (patchMode === 'Replace') {
      for (let dy = 0; dy < to.height; dy += 1) {
        for (let dx = 0; dx < to.width; dx += 1) {
          const targetIndex = (to.y + dy) * width + to.x + dx
          targetLayer.gids[targetIndex] = 0
          delete targetLayer.cellProperties?.[targetIndex]
          delete targetLayer.cellAnimations?.[targetIndex]
        }
      }
    }
    targetLayer.nonEmptyTiles = Array.from(targetLayer.gids).filter((gid) => (gid & ~GID_FLAGS) !== 0).length
  }

  for (const sourceLayer of source.layers as PreviewLayer[]) {
    if (layers.some((layer) => layer.name === sourceLayer.name)) continue
    const layer = cloneLayerAtSize(
      { ...sourceLayer, width: 0, height: 0, gids: new Uint32Array(), cellProperties: undefined, cellAnimations: undefined },
      width,
      height,
    )
    layer.cellProperties = {}
    layer.cellAnimations = {}
    for (let dy = 0; dy < to.height; dy += 1) {
      for (let dx = 0; dx < to.width; dx += 1) {
        const sx = from.x + dx
        const sy = from.y + dy
        if (sx < 0 || sy < 0 || sx >= sourceLayer.width || sy >= sourceLayer.height) continue
        const sourceIndex = sy * sourceLayer.width + sx
        const targetIndex = (to.y + dy) * width + to.x + dx
        layer.gids[targetIndex] = remapGid(sourceLayer.gids[sourceIndex] ?? 0)
        copySparseCell(sourceLayer, layer, sourceIndex, targetIndex)
      }
    }
    layer.id = Math.max(0, ...layers.map((entry) => entry.id)) + 1
    layer.nonEmptyTiles = Array.from(layer.gids).filter((gid) => (gid & ~GID_FLAGS) !== 0).length
    layers.push(layer)
  }

  return { ...target, width, height, tilesets, layers }
}

/** Applies statically resolvable MapTiles edits to a cloned document for result preview. */
export function applyMapTilePreview(document: MapDocument, edits: readonly MapTileEditDraft[]): MapDocument {
  const touchedLayers = new Map<number, MapDocument['layers'][number]>()
  const layers = [...document.layers]
  for (const edit of compactMapTileEdits(edits)) {
    if (typeof edit.x !== 'number' || typeof edit.y !== 'number') continue
    const originalIndex = document.layers.findIndex((layer) => layer.name === edit.layer)
    if (originalIndex < 0) continue
    const original = document.layers[originalIndex]!
    if (edit.x < 0 || edit.y < 0 || edit.x >= original.width || edit.y >= original.height) continue
    let layer = touchedLayers.get(originalIndex)
    if (!layer) {
      const cloned = { ...original, gids: new Uint32Array(original.gids) }
      touchedLayers.set(originalIndex, cloned)
      layers[originalIndex] = cloned
      layer = cloned
    }
    const cell = edit.y * layer.width + edit.x
    const currentGid = (layer.gids[cell] ?? 0) >>> 0
    if (edit.remove) layer.gids[cell] = 0
    if (edit.setIndex === undefined) continue
    const tileIndex = typeof edit.setIndex === 'number' ? edit.setIndex : Number(edit.setIndex)
    if (!Number.isInteger(tileIndex) || tileIndex < 0) continue
    const currentBase = (currentGid & ~GID_FLAGS) >>> 0
    const tileset = edit.setTilesheet
      ? document.tilesets.find((entry) => entry.name === edit.setTilesheet)
      : [...document.tilesets].sort((left, right) => right.firstGid - left.firstGid).find((entry) => currentBase >= entry.firstGid)
    if (!tileset || tileIndex >= tileset.tileCount) continue
    layer.gids[cell] = (tileset.firstGid + tileIndex + (currentGid & GID_FLAGS)) >>> 0
  }
  return touchedLayers.size === 0 ? document : { ...document, layers }
}
import type { MapDocument } from '@entities/map'
