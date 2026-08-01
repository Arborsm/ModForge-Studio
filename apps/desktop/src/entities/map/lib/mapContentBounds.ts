import type { MapDocument } from './types'
import { stripTileGidFlags } from './tileFlags'

export type MapContentBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type MapContentBoundsOptions = {
  layerIds?: readonly number[]
  objectGroupIds?: readonly number[]
  includeObjects?: boolean
  includeHiddenLayers?: boolean
  paddingTiles?: number
  transparentTileGids?: ReadonlySet<number>
}

export type MapPreviewBoundsOptions = MapContentBoundsOptions & {
  minimumCoverageRatio?: number
  targetAspectRatio?: number
}

function fullMapBounds(mapDocument: MapDocument): MapContentBounds {
  return {
    x: 0,
    y: 0,
    width: Math.max(1, mapDocument.width * mapDocument.tileWidth),
    height: Math.max(1, mapDocument.height * mapDocument.tileHeight),
  }
}

function includeRect(
  current: { left: number; top: number; right: number; bottom: number } | null,
  left: number,
  top: number,
  right: number,
  bottom: number,
) {
  if (right <= left || bottom <= top) {
    return current
  }

  if (!current) {
    return { left, top, right, bottom }
  }

  return {
    left: Math.min(current.left, left),
    top: Math.min(current.top, top),
    right: Math.max(current.right, right),
    bottom: Math.max(current.bottom, bottom),
  }
}

function paddedAndClampedBounds(
  mapDocument: MapDocument,
  bounds: { left: number; top: number; right: number; bottom: number },
  paddingTiles: number,
): MapContentBounds {
  const full = fullMapBounds(mapDocument)
  const paddingX = Math.max(0, paddingTiles) * mapDocument.tileWidth
  const paddingY = Math.max(0, paddingTiles) * mapDocument.tileHeight
  const left = Math.max(0, bounds.left - paddingX)
  const top = Math.max(0, bounds.top - paddingY)
  const right = Math.min(full.width, bounds.right + paddingX)
  const bottom = Math.min(full.height, bounds.bottom + paddingY)

  if (right <= left || bottom <= top) {
    return full
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function clampBoundsCenter(center: number, size: number, maxSize: number) {
  if (size >= maxSize) {
    return 0
  }

  return Math.min(Math.max(0, center - size / 2), maxSize - size)
}

function containsVisibleTileContent(
  mapDocument: MapDocument,
  layerIds: readonly number[] | undefined,
  transparentTileGids: ReadonlySet<number> | undefined,
  includeHiddenLayers: boolean | undefined,
) {
  const layerIdSet = layerIds ? new Set(layerIds) : null
  return mapDocument.layers.some(
    (layer) =>
      (includeHiddenLayers || layer.visible) &&
      (!layerIdSet || layerIdSet.has(layer.id)) &&
      layer.gids.some((gid) => {
        const strippedGid = stripTileGidFlags(gid >>> 0)
        return strippedGid !== 0 && !transparentTileGids?.has(strippedGid)
      }),
  )
}

function containsVisibleObjectContent(
  mapDocument: MapDocument,
  objectGroupIds: readonly number[] | undefined,
  includeObjects: boolean | undefined,
) {
  if (includeObjects === false) {
    return false
  }

  const objectGroupIdSet = objectGroupIds ? new Set(objectGroupIds) : null
  return mapDocument.objectGroups.some(
    (group) => group.visible && (!objectGroupIdSet || objectGroupIdSet.has(group.id)) && group.objects.length > 0,
  )
}

/** Returns whether the selected visible layers/groups contain anything worth thumbnailing. */
export function hasVisibleMapContent(mapDocument: MapDocument, options: MapContentBoundsOptions = {}) {
  return (
    containsVisibleTileContent(mapDocument, options.layerIds, options.transparentTileGids, options.includeHiddenLayers) ||
    containsVisibleObjectContent(mapDocument, options.objectGroupIds, options.includeObjects)
  )
}

/**
 * Finds the useful visual bounds of a map for compact previews.
 *
 * This keeps tiny interior maps from rendering as a dot inside the full map
 * canvas, while falling back to the full map for empty or fully hidden maps.
 */
export function getMapContentBounds(mapDocument: MapDocument, options: MapContentBoundsOptions = {}): MapContentBounds {
  const layerIdSet = options.layerIds ? new Set(options.layerIds) : null
  const objectGroupIdSet = options.objectGroupIds ? new Set(options.objectGroupIds) : null
  const includeObjects = options.includeObjects ?? true
  let bounds: { left: number; top: number; right: number; bottom: number } | null = null

  for (const layer of mapDocument.layers) {
    if ((!options.includeHiddenLayers && !layer.visible) || (layerIdSet && !layerIdSet.has(layer.id))) {
      continue
    }

    for (let index = 0; index < layer.gids.length; index += 1) {
      const gid = stripTileGidFlags(layer.gids[index] >>> 0)
      if (gid === 0) {
        continue
      }

      if (options.transparentTileGids?.has(gid)) {
        continue
      }

      const tileX = index % layer.width
      const tileY = Math.floor(index / layer.width)
      const left = tileX * mapDocument.tileWidth + layer.offsetX
      const top = tileY * mapDocument.tileHeight + layer.offsetY
      bounds = includeRect(bounds, left, top, left + mapDocument.tileWidth, top + mapDocument.tileHeight)
    }
  }

  if (includeObjects) {
    for (const group of mapDocument.objectGroups) {
      if (!group.visible || (objectGroupIdSet && !objectGroupIdSet.has(group.id))) {
        continue
      }

      for (const object of group.objects) {
        const isPoint = object.width === 0 && object.height === 0
        const width = Math.abs(object.width) || mapDocument.tileWidth
        const height = Math.abs(object.height) || mapDocument.tileHeight
        const left = isPoint ? object.x - width / 2 : object.width >= 0 ? object.x : object.x + object.width
        const top = isPoint ? object.y - height / 2 : object.height >= 0 ? object.y : object.y + object.height
        bounds = includeRect(bounds, left, top, left + width, top + height)
      }
    }
  }

  return bounds ? paddedAndClampedBounds(mapDocument, bounds, options.paddingTiles ?? 1) : fullMapBounds(mapDocument)
}

/**
 * Expands tight content bounds into a calmer catalog thumbnail crop.
 *
 * Callers may pass preprocessed transparent tile gids so filler tiles do not
 * participate in the cover crop.
 */
export function getMapPreviewBounds(mapDocument: MapDocument, options: MapPreviewBoundsOptions = {}): MapContentBounds {
  const full = fullMapBounds(mapDocument)
  const content = getMapContentBounds(mapDocument, options)
  const minimumCoverageRatio = Math.min(1, Math.max(0, options.minimumCoverageRatio ?? 0.42))
  const targetAspectRatio = Math.max(0.25, options.targetAspectRatio ?? 4 / 3)
  let width = Math.max(content.width, full.width * minimumCoverageRatio)
  let height = Math.max(content.height, full.height * minimumCoverageRatio)
  const currentAspectRatio = width / height

  if (currentAspectRatio < targetAspectRatio * 0.62) {
    width = Math.min(full.width, height * targetAspectRatio * 0.62)
  } else if (currentAspectRatio > targetAspectRatio * 1.62) {
    height = Math.min(full.height, width / (targetAspectRatio * 1.62))
  }

  width = Math.min(full.width, Math.max(1, width))
  height = Math.min(full.height, Math.max(1, height))

  return {
    x: clampBoundsCenter(content.x + content.width / 2, width, full.width),
    y: clampBoundsCenter(content.y + content.height / 2, height, full.height),
    width,
    height,
  }
}
