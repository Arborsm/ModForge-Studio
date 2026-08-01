import {
  FLIPPED_DIAGONALLY_FLAG,
  FLIPPED_HORIZONTALLY_FLAG,
  FLIPPED_VERTICALLY_FLAG,
  findTilesetForGid,
  stripTileGidFlags,
  unwrapMapPropertyValue,
} from '@entities/map'
import { loadImageResourceFromPath } from '@shared/lib/assets'
import { viewportImageCache as imageCache, viewportImagePromiseCache as imagePromiseCache } from '@shared/lib/maps'
import { clampPanZoomZoom } from '@shared/lib/viewports'
import type { LocaleCode, ThemeMode } from '@locales/api'
import type { HoverObjectInfo, TileHoverInfo } from '@entities/map'
import type { MapAtlasPoint, MapAtlasPortal, MapAtlasWarpRoute, MapDocument, MapObject, MapTileset } from '@entities/map'
import type { LoadedTilesetImage } from './mapViewportTypes'
import type { MapContentBounds } from '../lib/mapContentBounds'

export const VIEWPORT_PADDING = 56
export const VIEWPORT_OVERPAN = 160
const MAX_RENDER_CANVAS_DIMENSION = 4096
const MAX_RENDER_CANVAS_AREA = 16_777_216
const TRANSPARENT_TILE_ALPHA_THRESHOLD = 0
const transparentTileIdCache = new WeakMap<HTMLImageElement, Map<string, ReadonlySet<number> | null>>()

export function clampZoom(value: number) {
  return clampPanZoomZoom(value)
}

function getNumericMapProperty(mapDocument: MapDocument, key: string) {
  const value = unwrapMapPropertyValue(mapDocument.properties[key])
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function getLoadedImageSize(image: HTMLImageElement, tileset: MapTileset) {
  const width = tileset.imageWidth ?? (image.naturalWidth > 0 ? image.naturalWidth : image.width)
  const height = tileset.imageHeight ?? (image.naturalHeight > 0 ? image.naturalHeight : image.height)
  return { width, height }
}

function hasVisibleAlphaPixel(data: Uint8ClampedArray, imageWidth: number, left: number, top: number, width: number, height: number) {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      if (data[(y * imageWidth + x) * 4 + 3] > TRANSPARENT_TILE_ALPHA_THRESHOLD) {
        return true
      }
    }
  }

  return false
}

function includeRasterPixelBounds(
  current: { left: number; top: number; right: number; bottom: number } | null,
  left: number,
  top: number,
  right: number,
  bottom: number,
) {
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

export function getRasterAlphaBounds(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context || canvas.width <= 0 || canvas.height <= 0) {
    return null
  }

  try {
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let bounds: { left: number; top: number; right: number; bottom: number } | null = null

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (data[(y * canvas.width + x) * 4 + 3] <= TRANSPARENT_TILE_ALPHA_THRESHOLD) {
          continue
        }
        bounds = includeRasterPixelBounds(bounds, x, y, x + 1, y + 1)
      }
    }

    return bounds
      ? {
          x: bounds.left,
          y: bounds.top,
          width: bounds.right - bounds.left,
          height: bounds.bottom - bounds.top,
        }
      : null
  } catch {
    return null
  }
}

function getTransparentTileIds(loadedTileset: LoadedTilesetImage): ReadonlySet<number> | null {
  if (typeof document === 'undefined') {
    return null
  }

  const { image, tileset } = loadedTileset
  const { width: imageWidth, height: imageHeight } = getLoadedImageSize(image, tileset)
  if (imageWidth <= 0 || imageHeight <= 0 || tileset.tileWidth <= 0 || tileset.tileHeight <= 0 || tileset.columns <= 0) {
    return null
  }

  const cacheKey = [tileset.name, tileset.tileWidth, tileset.tileHeight, tileset.tileCount, tileset.columns, imageWidth, imageHeight].join(
    ':',
  )
  const cachedForImage = transparentTileIdCache.get(image)
  if (cachedForImage?.has(cacheKey)) {
    return cachedForImage.get(cacheKey) ?? null
  }

  const nextCacheForImage = cachedForImage ?? new Map<string, ReadonlySet<number> | null>()
  transparentTileIdCache.set(image, nextCacheForImage)

  try {
    const canvas = document.createElement('canvas')
    canvas.width = imageWidth
    canvas.height = imageHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      nextCacheForImage.set(cacheKey, null)
      return null
    }

    context.clearRect(0, 0, imageWidth, imageHeight)
    context.drawImage(image, 0, 0, imageWidth, imageHeight)
    const data = context.getImageData(0, 0, imageWidth, imageHeight).data
    const transparentTileIds = new Set<number>()

    for (let tileId = 0; tileId < tileset.tileCount; tileId += 1) {
      const sourceX = (tileId % tileset.columns) * tileset.tileWidth
      const sourceY = Math.floor(tileId / tileset.columns) * tileset.tileHeight
      const isInsideImage =
        sourceX >= 0 && sourceY >= 0 && sourceX + tileset.tileWidth <= imageWidth && sourceY + tileset.tileHeight <= imageHeight
      if (!isInsideImage || !hasVisibleAlphaPixel(data, imageWidth, sourceX, sourceY, tileset.tileWidth, tileset.tileHeight)) {
        transparentTileIds.add(tileId)
      }
    }

    nextCacheForImage.set(cacheKey, transparentTileIds)
    return transparentTileIds
  } catch {
    nextCacheForImage.set(cacheKey, null)
    return null
  }
}

export function getTransparentTileGids(tilesets: MapTileset[], tilesetImages: Record<number, LoadedTilesetImage>) {
  let inspectedTilesets = 0
  const transparentTileGids = new Set<number>()

  for (const tileset of tilesets) {
    const loadedTileset = tilesetImages[tileset.firstGid]
    if (!loadedTileset) {
      continue
    }

    const transparentTileIds = getTransparentTileIds(loadedTileset)
    if (!transparentTileIds) {
      continue
    }

    inspectedTilesets += 1
    for (const tileId of transparentTileIds) {
      transparentTileGids.add(tileset.firstGid + tileId)
    }
  }

  return inspectedTilesets > 0 ? transparentTileGids : null
}

export function getDefaultViewportState(mapDocument: MapDocument | null) {
  if (!mapDocument) {
    return null
  }

  const worldX = getNumericMapProperty(mapDocument, 'defaultViewportCenterX')
  const worldY = getNumericMapProperty(mapDocument, 'defaultViewportCenterY')
  if (worldX === null || worldY === null) {
    return null
  }

  return {
    worldX,
    worldY,
    zoom: clampZoom(getNumericMapProperty(mapDocument, 'defaultViewportZoom') ?? 1),
  }
}

export function getCanvasRenderScale(logicalWidth: number, logicalHeight: number, pixelRatio: number) {
  const scaledWidth = Math.max(1, logicalWidth * pixelRatio)
  const scaledHeight = Math.max(1, logicalHeight * pixelRatio)
  const dimensionScale = Math.min(1, MAX_RENDER_CANVAS_DIMENSION / scaledWidth, MAX_RENDER_CANVAS_DIMENSION / scaledHeight)
  const areaScale = Math.min(1, Math.sqrt(MAX_RENDER_CANVAS_AREA / (scaledWidth * scaledHeight)))

  return Math.min(dimensionScale, areaScale)
}

export function getCanvasViewportRect(
  scrollLeft: number,
  scrollTop: number,
  viewportWidth: number,
  viewportHeight: number,
  canvasOffsetLeft: number,
  canvasOffsetTop: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  const left = Math.max(0, scrollLeft - canvasOffsetLeft)
  const top = Math.max(0, scrollTop - canvasOffsetTop)
  const right = Math.min(canvasWidth, scrollLeft + viewportWidth - canvasOffsetLeft)
  const bottom = Math.min(canvasHeight, scrollTop + viewportHeight - canvasOffsetTop)

  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  }
}

function hexToRgb(value: string) {
  const normalized = value.replace('#', '')
  const hex =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : normalized
  const parsed = Number.parseInt(hex, 16)

  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  }
}

export function rgbaFromHex(value: string, alpha: number) {
  const { r, g, b } = hexToRgb(value)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function normalizeLayerName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '')
}

export function isForegroundTileLayer(layerName: string) {
  const normalized = normalizeLayerName(layerName)
  return normalized === 'front' || normalized === 'alwaysfront' || normalized.endsWith('front')
}

function getLocalizedImageCacheKey(path: string, locale: LocaleCode) {
  return `${path}::${locale}`
}

export function loadImage(path: string, locale: LocaleCode, errorFactory: (path: string) => string) {
  const cacheKey = getLocalizedImageCacheKey(path, locale)
  const cachedImage = imageCache.get(cacheKey)
  if (cachedImage) {
    return Promise.resolve(cachedImage)
  }

  const pendingImage = imagePromiseCache.get(cacheKey)
  if (pendingImage) {
    return pendingImage
  }

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    void loadImageResourceFromPath(path, locale)
      .then((resource) => {
        if (!resource) {
          imagePromiseCache.delete(cacheKey)
          reject(new Error(errorFactory(path)))
          return
        }
        imageCache.set(cacheKey, resource.image)
        imagePromiseCache.delete(cacheKey)
        resolve(resource.image)
      })
      .catch(() => {
        imagePromiseCache.delete(cacheKey)
        reject(new Error(errorFactory(path)))
      })
  })

  imagePromiseCache.set(cacheKey, promise)
  return promise
}

function hashString(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }

  return hash
}

export function getGroupColor(groupName: string) {
  return `hsl(${hashString(groupName) % 360} 78% 64%)`
}

export function getObjectDisplayLabel(object: MapObject) {
  return object.name || object.type || `Object ${object.id}`
}

function getWarpRoutePalette(route: MapAtlasWarpRoute) {
  const seed = hashString(route.id)
  return {
    hue: seed % 360,
    saturation: 78 + (seed % 18),
    lightness: 58 + ((seed >> 3) % 12),
    accentHue: (seed + 96) % 360,
  }
}

function toCanvasPoint(point: MapAtlasPoint, tileWidth: number, tileHeight: number, zoom: number) {
  return {
    x: point.x * tileWidth * zoom,
    y: point.y * tileHeight * zoom,
  }
}

export function drawWarpRoute(
  context: CanvasRenderingContext2D,
  route: MapAtlasWarpRoute,
  tileWidth: number,
  tileHeight: number,
  zoom: number,
) {
  if (route.path.length < 2) {
    return
  }

  const points = route.path.map((point) => toCanvasPoint(point, tileWidth, tileHeight, zoom))
  const palette = getWarpRoutePalette(route)
  const tracePath = () => {
    context.beginPath()
    context.moveTo(points[0].x, points[0].y)

    if (points.length === 2) {
      context.lineTo(points[1].x, points[1].y)
      return
    }

    for (let index = 1; index < points.length - 1; index += 1) {
      const current = points[index]
      const next = points[index + 1]
      const midpointX = (current.x + next.x) / 2
      const midpointY = (current.y + next.y) / 2
      context.quadraticCurveTo(current.x, current.y, midpointX, midpointY)
    }

    const lastControl = points[points.length - 2]
    const lastPoint = points[points.length - 1]
    context.quadraticCurveTo(lastControl.x, lastControl.y, lastPoint.x, lastPoint.y)
  }

  context.save()
  context.lineJoin = 'round'
  context.lineCap = 'round'

  context.shadowBlur = Math.max(10, 18 * zoom)
  context.shadowColor = `hsla(${palette.hue} ${palette.saturation}% ${palette.lightness}% / 0.55)`
  context.strokeStyle = `hsla(${palette.hue} ${palette.saturation}% ${palette.lightness - 2}% / 0.16)`
  context.lineWidth = Math.max(10, 14 * zoom)
  tracePath()
  context.stroke()

  context.shadowBlur = Math.max(6, 12 * zoom)
  context.shadowColor = `hsla(${palette.hue} ${Math.min(100, palette.saturation + 4)}% ${Math.min(78, palette.lightness + 8)}% / 0.65)`
  context.strokeStyle = `hsla(${palette.hue} ${Math.min(100, palette.saturation + 2)}% ${Math.min(78, palette.lightness + 6)}% / 0.56)`
  context.lineWidth = Math.max(4, 6 * zoom)
  tracePath()
  context.stroke()

  context.shadowBlur = 0
  context.setLineDash([Math.max(6, 12 * zoom), Math.max(4, 10 * zoom)])
  context.lineDashOffset = (hashString(route.id) % 17) * -0.5
  context.strokeStyle = 'rgba(255,255,255,0.9)'
  context.lineWidth = Math.max(1.25, 1.8 * zoom)
  tracePath()
  context.stroke()
  context.setLineDash([])

  const endpoints = [
    {
      point: toCanvasPoint(route.source, tileWidth, tileHeight, zoom),
      color: `hsla(${palette.hue} ${Math.min(100, palette.saturation + 2)}% ${Math.min(82, palette.lightness + 10)}% / 0.98)`,
    },
    {
      point: toCanvasPoint(route.target, tileWidth, tileHeight, zoom),
      color: `hsla(${palette.accentHue} ${Math.min(100, palette.saturation + 4)}% ${Math.min(84, palette.lightness + 12)}% / 0.98)`,
    },
  ]

  for (const endpoint of endpoints) {
    context.beginPath()
    context.fillStyle = endpoint.color
    context.shadowBlur = Math.max(8, 14 * zoom)
    context.shadowColor = endpoint.color
    context.arc(endpoint.point.x, endpoint.point.y, Math.max(2.5, 3.8 * zoom), 0, Math.PI * 2)
    context.fill()

    context.beginPath()
    context.shadowBlur = 0
    context.fillStyle = 'rgba(255,255,255,0.95)'
    context.arc(endpoint.point.x, endpoint.point.y, Math.max(1.2, 1.8 * zoom), 0, Math.PI * 2)
    context.fill()
  }

  context.restore()
}

export function drawAtlasPortal(
  context: CanvasRenderingContext2D,
  portal: MapAtlasPortal,
  tileWidth: number,
  tileHeight: number,
  zoom: number,
  theme: ThemeMode,
  accentColor: string,
) {
  const point = toCanvasPoint(portal.position, tileWidth, tileHeight, zoom)
  const outerRadius = Math.max(6, 8 * zoom)
  const innerRadius = Math.max(2.5, 3.5 * zoom)
  const glowColor = rgbaFromHex(accentColor, theme === 'light' ? 0.28 : 0.36)
  const ringColor = rgbaFromHex(accentColor, theme === 'light' ? 0.94 : 0.98)
  const centerColor = theme === 'light' ? '#ffffff' : rgbaFromHex(accentColor, 0.22)
  const label = portal.label

  context.save()
  context.shadowBlur = Math.max(10, 18 * zoom)
  context.shadowColor = glowColor
  context.beginPath()
  context.fillStyle = glowColor
  context.arc(point.x, point.y, outerRadius + Math.max(3, 5 * zoom), 0, Math.PI * 2)
  context.fill()

  context.shadowBlur = 0
  context.beginPath()
  context.fillStyle = ringColor
  context.arc(point.x, point.y, outerRadius, 0, Math.PI * 2)
  context.fill()

  context.beginPath()
  context.fillStyle = centerColor
  context.arc(point.x, point.y, innerRadius, 0, Math.PI * 2)
  context.fill()

  context.beginPath()
  context.strokeStyle = 'rgba(255,255,255,0.92)'
  context.lineWidth = Math.max(1.5, 2.2 * zoom)
  context.arc(point.x, point.y, outerRadius + Math.max(2, 3 * zoom), 0, Math.PI * 2)
  context.stroke()

  if (zoom >= 0.42) {
    context.font = `${Math.max(10, Math.round(11 * Math.min(zoom, 1.25)))}px "Segoe UI", sans-serif`
    const labelWidth = context.measureText(label).width + 12
    const labelX = point.x + outerRadius + 8
    const labelY = point.y - 11
    context.fillStyle = theme === 'light' ? 'rgba(255,255,255,0.94)' : 'rgba(8,10,16,0.92)'
    context.fillRect(labelX, labelY, labelWidth, 22)
    context.strokeStyle = ringColor
    context.lineWidth = 1
    context.strokeRect(labelX, labelY, labelWidth, 22)
    context.fillStyle = theme === 'light' ? '#0f172a' : '#f8fafc'
    context.fillText(label, labelX + 6, labelY + 14.5)
  }

  context.restore()
}

export function getObjectBounds(object: MapObject, minimumWorldSize: number) {
  const isPoint = object.width === 0 && object.height === 0
  const width = Math.abs(object.width) || minimumWorldSize
  const height = Math.abs(object.height) || minimumWorldSize
  const x = object.width === 0 ? object.x - minimumWorldSize / 2 : object.width > 0 ? object.x : object.x + object.width
  const y = object.height === 0 ? object.y - minimumWorldSize / 2 : object.height > 0 ? object.y : object.y + object.height

  return { x, y, width, height, isPoint }
}

function collectHoveredObjects(mapDocument: MapDocument, visibleObjectGroupIds: ReadonlySet<number>, pixelX: number, pixelY: number) {
  const minimumWorldSize = 12
  const hits: HoverObjectInfo[] = []

  for (const group of mapDocument.objectGroups) {
    if (!group.visible || !visibleObjectGroupIds.has(group.id)) {
      continue
    }

    for (const object of group.objects) {
      const bounds = getObjectBounds(object, minimumWorldSize)
      const withinX = pixelX >= bounds.x && pixelX <= bounds.x + bounds.width
      const withinY = pixelY >= bounds.y && pixelY <= bounds.y + bounds.height
      if (!withinX || !withinY) {
        continue
      }

      hits.push({
        id: object.id,
        name: object.name,
        type: object.type,
        groupName: group.name,
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
      })
    }
  }

  return hits
}

export function buildHoverInfo(
  mapDocument: MapDocument,
  visibleLayerIds: ReadonlySet<number>,
  visibleObjectGroupIds: ReadonlySet<number>,
  pixelX: number,
  pixelY: number,
) {
  const tileX = Math.floor(pixelX / mapDocument.tileWidth)
  const tileY = Math.floor(pixelY / mapDocument.tileHeight)
  const objectHits = collectHoveredObjects(mapDocument, visibleObjectGroupIds, pixelX, pixelY)

  if (tileX < 0 || tileY < 0 || tileX >= mapDocument.width || tileY >= mapDocument.height) {
    return null
  }

  const visibleLayers = mapDocument.layers.filter((layer) => layer.visible && visibleLayerIds.has(layer.id))
  const tileIndex = tileY * mapDocument.width + tileX

  for (let index = visibleLayers.length - 1; index >= 0; index -= 1) {
    const layer = visibleLayers[index]
    const rawGid = layer.gids[tileIndex] >>> 0
    const gid = stripTileGidFlags(rawGid)
    if (gid === 0) {
      continue
    }

    const tileset = findTilesetForGid(mapDocument.tilesets, gid)
    const tileId = tileset ? gid - tileset.firstGid : null

    return {
      tileX,
      tileY,
      pixelX: tileX * mapDocument.tileWidth,
      pixelY: tileY * mapDocument.tileHeight,
      layerName: layer.name,
      gid,
      tilesetName: tileset?.name ?? null,
      tileId,
      tileProperties: tileset && tileId !== null ? (tileset.tileProperties[tileId] ?? null) : null,
      objectHits,
    } satisfies TileHoverInfo
  }

  return {
    tileX,
    tileY,
    pixelX: tileX * mapDocument.tileWidth,
    pixelY: tileY * mapDocument.tileHeight,
    layerName: null,
    gid: null,
    tilesetName: null,
    tileId: null,
    tileProperties: null,
    objectHits,
  } satisfies TileHoverInfo
}

export function rasterizeTileLayers(
  targetCanvas: HTMLCanvasElement,
  mapDocument: MapDocument,
  layers: MapDocument['layers'],
  tilesets: MapTileset[],
  tilesetImages: Record<number, LoadedTilesetImage>,
  options: {
    sourceBounds?: MapContentBounds
    targetWidth?: number
    targetHeight?: number
  } = {},
) {
  const rasterContext = targetCanvas.getContext('2d')
  if (!rasterContext) {
    return false
  }

  const fullWidth = Math.max(1, mapDocument.width * mapDocument.tileWidth)
  const fullHeight = Math.max(1, mapDocument.height * mapDocument.tileHeight)
  const sourceBounds = options.sourceBounds ?? { x: 0, y: 0, width: fullWidth, height: fullHeight }
  const rasterWidth = Math.max(1, Math.round(options.targetWidth ?? fullWidth))
  const rasterHeight = Math.max(1, Math.round(options.targetHeight ?? fullHeight))
  targetCanvas.width = rasterWidth
  targetCanvas.height = rasterHeight

  rasterContext.setTransform(1, 0, 0, 1, 0, 0)
  rasterContext.clearRect(0, 0, rasterWidth, rasterHeight)
  rasterContext.imageSmoothingEnabled = false
  const scale = Math.min(rasterWidth / sourceBounds.width, rasterHeight / sourceBounds.height)
  const offsetX = (rasterWidth - sourceBounds.width * scale) / 2 - sourceBounds.x * scale
  const offsetY = (rasterHeight - sourceBounds.height * scale) / 2 - sourceBounds.y * scale
  rasterContext.setTransform(scale, 0, 0, scale, offsetX, offsetY)

  for (const layer of layers) {
    rasterContext.globalAlpha = layer.opacity

    for (let index = 0; index < layer.gids.length; index += 1) {
      const rawGid = layer.gids[index] >>> 0
      const gid = stripTileGidFlags(rawGid)
      if (gid === 0) {
        continue
      }

      const tileset = findTilesetForGid(tilesets, gid)
      if (!tileset) {
        continue
      }

      const loadedTileset = tilesetImages[tileset.firstGid]
      if (!loadedTileset) {
        continue
      }

      const tileId = gid - tileset.firstGid
      const sourceX = (tileId % tileset.columns) * tileset.tileWidth
      const sourceY = Math.floor(tileId / tileset.columns) * tileset.tileHeight
      const destinationX = (index % layer.width) * mapDocument.tileWidth + layer.offsetX
      const destinationY = Math.floor(index / layer.width) * mapDocument.tileHeight + layer.offsetY

      const flipHorizontally = (rawGid & FLIPPED_HORIZONTALLY_FLAG) !== 0
      const flipVertically = (rawGid & FLIPPED_VERTICALLY_FLAG) !== 0
      const flipDiagonally = (rawGid & FLIPPED_DIAGONALLY_FLAG) !== 0

      if (!flipHorizontally && !flipVertically && !flipDiagonally) {
        rasterContext.drawImage(
          loadedTileset.image,
          sourceX,
          sourceY,
          tileset.tileWidth,
          tileset.tileHeight,
          destinationX,
          destinationY,
          mapDocument.tileWidth,
          mapDocument.tileHeight,
        )
        continue
      }

      rasterContext.save()
      rasterContext.translate(destinationX + mapDocument.tileWidth / 2, destinationY + mapDocument.tileHeight / 2)

      if (flipDiagonally) {
        rasterContext.rotate(-Math.PI / 2)
        rasterContext.scale(flipHorizontally ? -1 : 1, flipVertically ? -1 : 1)
      } else {
        rasterContext.scale(flipHorizontally ? -1 : 1, flipVertically ? -1 : 1)
      }

      rasterContext.drawImage(
        loadedTileset.image,
        sourceX,
        sourceY,
        tileset.tileWidth,
        tileset.tileHeight,
        -mapDocument.tileWidth / 2,
        -mapDocument.tileHeight / 2,
        mapDocument.tileWidth,
        mapDocument.tileHeight,
      )
      rasterContext.restore()
    }
  }

  rasterContext.globalAlpha = 1
  rasterContext.setTransform(1, 0, 0, 1, 0, 0)
  return true
}
