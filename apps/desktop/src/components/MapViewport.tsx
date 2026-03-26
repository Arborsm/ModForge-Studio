import * as ContextMenu from '@radix-ui/react-context-menu'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import { resolveTilesetImagePath, toAssetUrl } from '../lib/maps/assets'
import type { ThemeMode, ViewportLabels } from '../lib/editor-shell'
import type {
  MapAtlasPoint,
  MapAtlasPortal,
  MapAtlasWarpRoute,
  MapDocument,
  MapObject,
  MapPropertyValue,
  MapTileset,
} from '../lib/maps/types'

type MapViewportProps = {
  mapDocument: MapDocument | null
  visibleLayerIds: number[]
  visibleObjectGroupIds: number[]
  onHoverChange?: (info: TileHoverInfo | null) => void
  onAtlasPortalOpen?: (targetMapName: string) => void
  labels: ViewportLabels
  theme: ThemeMode
  accentColor: string
  showGrid: boolean
  onZoomChange?: (zoom: number, mode: 'fit' | 'manual') => void
  showStatsChips?: boolean
  mapOverlay?: ReactNode
  viewportOverlay?: ReactNode
  focusWorldPoint?: ViewportWorldPoint | null
  contextMenuEnabled?: boolean
  initialZoom?: number | null
}

type TilesetImageState = {
  sourcePath: string | null
  items: Record<number, LoadedTilesetImage>
  error: string | null
}

type LoadedTilesetImage = {
  image: HTMLImageElement
  tileset: MapTileset
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

export type MapViewportHandle = {
  zoomIn: () => void
  zoomOut: () => void
  fitToScreen: () => void
  setOneToOne: () => void
  centerView: () => void
  resetPan: () => void
  focusObject: (target: FocusedMapObjectTarget) => void
}

export type FocusedMapObjectTarget = {
  groupId: number
  objectId: number
  nonce: number
}

type DragState = {
  pointerId: number
  startX: number
  startY: number
  scrollLeft: number
  scrollTop: number
}

type ZoomAnchor = {
  viewportX: number
  viewportY: number
  worldX: number
  worldY: number
}

type FocusWorldPoint = {
  worldX: number
  worldY: number
}

export type ViewportWorldPoint = FocusWorldPoint

const imageCache = new Map<string, HTMLImageElement>()
const imagePromiseCache = new Map<string, Promise<HTMLImageElement>>()

const FLIPPED_HORIZONTALLY_FLAG = 0x80000000
const FLIPPED_VERTICALLY_FLAG = 0x40000000
const FLIPPED_DIAGONALLY_FLAG = 0x20000000
const ROTATED_HEXAGONAL_120_FLAG = 0x10000000
const TILE_ID_MASK = ~(
  FLIPPED_HORIZONTALLY_FLAG |
  FLIPPED_VERTICALLY_FLAG |
  FLIPPED_DIAGONALLY_FLAG |
  ROTATED_HEXAGONAL_120_FLAG
)
const MIN_ZOOM = 0.08
const MAX_ZOOM = 8
const VIEWPORT_PADDING = 56
const VIEWPORT_OVERPAN = 160
const TOOLBAR_ZOOM_FACTOR = 1.12
const WHEEL_ZOOM_INTENSITY = 0.0007
const MAX_RENDER_CANVAS_DIMENSION = 4096
const MAX_RENDER_CANVAS_AREA = 16_777_216
const INTERACTIVE_OBJECT_PROPERTY_KEYS = ['Action', 'TouchAction', 'Warp', 'NPCWarp', 'LockedDoorWarp', 'MagicWarp']

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function getNumericMapProperty(mapDocument: MapDocument, key: string) {
  const value = mapDocument.properties[key]
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

function getDefaultViewportState(mapDocument: MapDocument | null) {
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

function getCanvasRenderScale(logicalWidth: number, logicalHeight: number, pixelRatio: number) {
  const scaledWidth = Math.max(1, logicalWidth * pixelRatio)
  const scaledHeight = Math.max(1, logicalHeight * pixelRatio)
  const dimensionScale = Math.min(
    1,
    MAX_RENDER_CANVAS_DIMENSION / scaledWidth,
    MAX_RENDER_CANVAS_DIMENSION / scaledHeight,
  )
  const areaScale = Math.min(1, Math.sqrt(MAX_RENDER_CANVAS_AREA / (scaledWidth * scaledHeight)))

  return Math.min(dimensionScale, areaScale)
}

function getCanvasViewportRect(
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
  const hex = normalized.length === 3 ? normalized.split('').map((char) => `${char}${char}`).join('') : normalized
  const parsed = Number.parseInt(hex, 16)

  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  }
}

function rgbaFromHex(value: string, alpha: number) {
  const { r, g, b } = hexToRgb(value)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function normalizeLayerName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '')
}

function isForegroundTileLayer(layerName: string) {
  const normalized = normalizeLayerName(layerName)
  return normalized === 'front' || normalized === 'alwaysfront' || normalized.endsWith('front')
}

function loadImage(path: string, errorFactory: (path: string) => string) {
  const cachedImage = imageCache.get(path)
  if (cachedImage) {
    return Promise.resolve(cachedImage)
  }

  const pendingImage = imagePromiseCache.get(path)
  if (pendingImage) {
    return pendingImage
  }

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      imageCache.set(path, image)
      imagePromiseCache.delete(path)
      resolve(image)
    }
    image.onerror = () => {
      imagePromiseCache.delete(path)
      reject(new Error(errorFactory(path)))
    }
    image.src = toAssetUrl(path)
  })

  imagePromiseCache.set(path, promise)
  return promise
}

function hashString(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }

  return hash
}

function getGroupColor(groupName: string) {
  return `hsl(${hashString(groupName) % 360} 78% 64%)`
}

function getObjectInteractionTag(object: MapObject) {
  for (const key of INTERACTIVE_OBJECT_PROPERTY_KEYS) {
    if (key in object.properties) {
      return key
    }
  }

  return null
}

function getObjectDisplayLabel(object: MapObject) {
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

function drawWarpRoute(context: CanvasRenderingContext2D, route: MapAtlasWarpRoute, tileWidth: number, tileHeight: number, zoom: number) {
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

function drawAtlasPortal(
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

function getObjectBounds(object: MapObject, minimumWorldSize: number) {
  const isPoint = object.width === 0 && object.height === 0
  const width = Math.abs(object.width) || minimumWorldSize
  const height = Math.abs(object.height) || minimumWorldSize
  const x =
    object.width === 0
      ? object.x - minimumWorldSize / 2
      : object.width > 0
        ? object.x
        : object.x + object.width
  const y =
    object.height === 0
      ? object.y - minimumWorldSize / 2
      : object.height > 0
        ? object.y
        : object.y + object.height

  return { x, y, width, height, isPoint }
}

function collectHoveredObjects(
  mapDocument: MapDocument,
  visibleObjectGroupIds: number[],
  pixelX: number,
  pixelY: number,
) {
  const minimumWorldSize = 12
  const hits: HoverObjectInfo[] = []

  for (const group of mapDocument.objectGroups) {
    if (!group.visible || !visibleObjectGroupIds.includes(group.id)) {
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

function findTileset(tilesets: MapTileset[], gid: number) {
  for (let index = tilesets.length - 1; index >= 0; index -= 1) {
    const tileset = tilesets[index]
    if (gid >= tileset.firstGid) {
      return tileset
    }
  }

  return null
}

function buildHoverInfo(
  mapDocument: MapDocument,
  visibleLayerIds: number[],
  visibleObjectGroupIds: number[],
  pixelX: number,
  pixelY: number,
) {
  const tileX = Math.floor(pixelX / mapDocument.tileWidth)
  const tileY = Math.floor(pixelY / mapDocument.tileHeight)
  const objectHits = collectHoveredObjects(mapDocument, visibleObjectGroupIds, pixelX, pixelY)

  if (tileX < 0 || tileY < 0 || tileX >= mapDocument.width || tileY >= mapDocument.height) {
    return null
  }

  const visibleLayers = mapDocument.layers.filter((layer) => layer.visible && visibleLayerIds.includes(layer.id))
  const tileIndex = tileY * mapDocument.width + tileX

  for (let index = visibleLayers.length - 1; index >= 0; index -= 1) {
    const layer = visibleLayers[index]
    const rawGid = layer.gids[tileIndex] >>> 0
    const gid = rawGid & TILE_ID_MASK
    if (gid === 0) {
      continue
    }

    const tileset = findTileset(mapDocument.tilesets, gid)
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
      tileProperties: tileset && tileId !== null ? tileset.tileProperties[tileId] ?? null : null,
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

function rasterizeTileLayers(
  targetCanvas: HTMLCanvasElement,
  mapDocument: MapDocument,
  layers: MapDocument['layers'],
  tilesets: MapTileset[],
  tilesetImages: Record<number, LoadedTilesetImage>,
) {
  const rasterContext = targetCanvas.getContext('2d')
  if (!rasterContext) {
    return false
  }

  const rasterWidth = Math.max(1, mapDocument.width * mapDocument.tileWidth)
  const rasterHeight = Math.max(1, mapDocument.height * mapDocument.tileHeight)
  targetCanvas.width = rasterWidth
  targetCanvas.height = rasterHeight

  rasterContext.setTransform(1, 0, 0, 1, 0, 0)
  rasterContext.clearRect(0, 0, rasterWidth, rasterHeight)
  rasterContext.imageSmoothingEnabled = false

  for (const layer of layers) {
    rasterContext.globalAlpha = layer.opacity

    for (let index = 0; index < layer.gids.length; index += 1) {
      const rawGid = layer.gids[index] >>> 0
      const gid = rawGid & TILE_ID_MASK
      if (gid === 0) {
        continue
      }

      const tileset = findTileset(tilesets, gid)
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
      rasterContext.translate(
        destinationX + mapDocument.tileWidth / 2,
        destinationY + mapDocument.tileHeight / 2,
      )

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
  return true
}

export const MapViewport = forwardRef<MapViewportHandle, MapViewportProps>(function MapViewport(
  {
    mapDocument,
    visibleLayerIds,
    visibleObjectGroupIds,
    onHoverChange,
    onAtlasPortalOpen,
    labels,
    theme,
    accentColor,
    showGrid,
    onZoomChange,
    showStatsChips = true,
    mapOverlay,
    viewportOverlay,
    focusWorldPoint,
    contextMenuEnabled = true,
    initialZoom = null,
  },
  ref,
) {
  const initialDefaultViewportState = getDefaultViewportState(mapDocument)
  const resolvedInitialZoom = clampZoom(initialZoom ?? initialDefaultViewportState?.zoom ?? 1)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const foregroundCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const mapRasterCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const foregroundRasterCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const pendingZoomAnchorRef = useRef<ZoomAnchor | null>(null)
  const pendingFocusWorldPointRef = useRef<FocusWorldPoint | null>(
    initialDefaultViewportState
      ? {
          worldX: initialDefaultViewportState.worldX,
          worldY: initialDefaultViewportState.worldY,
        }
      : null,
  )
  const wheelZoomFrameRef = useRef<number | null>(null)
  const pendingWheelDeltaRef = useRef(0)
  const zoomRef = useRef(1)
  const [tilesetImageState, setTilesetImageState] = useState<TilesetImageState>({
    sourcePath: null,
    items: {},
    error: null,
  })
  const [manualZoom, setManualZoom] = useState(() => resolvedInitialZoom)
  const [zoomMode, setZoomMode] = useState<'fit' | 'manual'>(() => (initialZoom != null || initialDefaultViewportState ? 'manual' : 'fit'))
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [viewportScroll, setViewportScroll] = useState({ left: 0, top: 0 })
  const [refreshToken, setRefreshToken] = useState(0)
  const [highlightedObjectTarget, setHighlightedObjectTarget] = useState<FocusedMapObjectTarget | null>(null)

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      setViewportSize({
        width: frame.clientWidth,
        height: frame.clientHeight,
      })
    })

    resizeObserver.observe(frame)
    setViewportSize({
      width: frame.clientWidth,
      height: frame.clientHeight,
    })

    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    if (!mapDocument) {
      return
    }

    let disposed = false

    void (async () => {
      try {
        const entries = await Promise.all(
          mapDocument.tilesets.map(async (tileset) => {
            const imagePath = resolveTilesetImagePath(mapDocument, tileset)
            if (!imagePath) {
              return null
            }

            const image = await loadImage(imagePath, labels.failedToLoadTilesetImage)
            return [tileset.firstGid, { image, tileset }] as const
          }),
        )

        if (disposed) {
          return
        }

        setTilesetImageState({
          sourcePath: mapDocument.sourcePath,
          items: Object.fromEntries(
            entries.filter((entry): entry is readonly [number, LoadedTilesetImage] => entry !== null),
          ),
          error: null,
        })
      } catch (error) {
        if (!disposed) {
          setTilesetImageState({
            sourcePath: mapDocument.sourcePath,
            items: {},
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    })()

    return () => {
      disposed = true
    }
  }, [labels.failedToLoadTilesetImage, mapDocument])

  const tilesetImages = useMemo(
    () =>
      mapDocument && tilesetImageState.sourcePath === mapDocument.sourcePath
        ? tilesetImageState.items
        : {},
    [mapDocument, tilesetImageState],
  )
  const imageError = useMemo(
    () =>
      mapDocument && tilesetImageState.sourcePath === mapDocument.sourcePath
        ? tilesetImageState.error
        : null,
    [mapDocument, tilesetImageState],
  )
  const visibleLayers = useMemo(
    () =>
      mapDocument
        ? mapDocument.layers.filter((layer) => layer.visible && visibleLayerIds.includes(layer.id))
        : [],
    [mapDocument, visibleLayerIds],
  )
  const shouldSplitForegroundLayers = Boolean(mapOverlay)
  const backgroundLayers = useMemo(
    () => (shouldSplitForegroundLayers ? visibleLayers.filter((layer) => !isForegroundTileLayer(layer.name)) : visibleLayers),
    [shouldSplitForegroundLayers, visibleLayers],
  )
  const foregroundLayers = useMemo(
    () => (shouldSplitForegroundLayers ? visibleLayers.filter((layer) => isForegroundTileLayer(layer.name)) : []),
    [shouldSplitForegroundLayers, visibleLayers],
  )
  const visibleObjectGroups = useMemo(
    () =>
      mapDocument
        ? mapDocument.objectGroups.filter(
            (group) => group.visible && visibleObjectGroupIds.includes(group.id),
          )
        : [],
    [mapDocument, visibleObjectGroupIds],
  )
  const atlasPlacements = useMemo(() => mapDocument?.atlas?.placements ?? [], [mapDocument])
  const atlasWarpRoutes = useMemo(() => mapDocument?.atlas?.warpRoutes ?? [], [mapDocument])
  const atlasPortals = useMemo(() => mapDocument?.atlas?.portals ?? [], [mapDocument])
  const viewportBackdropStyle = useMemo(() => {
    if (theme === 'light') {
      return {
        backgroundColor: '#ffffff',
        backgroundImage: [
          `linear-gradient(${rgbaFromHex(accentColor, 0.15)} 1px, transparent 1px)`,
          `linear-gradient(90deg, ${rgbaFromHex(accentColor, 0.15)} 1px, transparent 1px)`,
          `linear-gradient(${rgbaFromHex(accentColor, 0.04)} 1px, transparent 1px)`,
          `linear-gradient(90deg, ${rgbaFromHex(accentColor, 0.04)} 1px, transparent 1px)`,
        ].join(', '),
        backgroundSize: ['100px 100px', '100px 100px', '20px 20px', '20px 20px'].join(', '),
        backgroundPosition: ['-1px -1px', '-1px -1px', '-1px -1px', '-1px -1px'].join(', '),
      } satisfies CSSProperties
    }

    return {
      backgroundColor: '#09111d',
      backgroundImage: [
        `radial-gradient(circle at top left, ${rgbaFromHex(accentColor, 0.08)}, transparent 24%)`,
        `linear-gradient(${rgbaFromHex(accentColor, 0.16)} 1px, transparent 1px)`,
        `linear-gradient(90deg, ${rgbaFromHex(accentColor, 0.16)} 1px, transparent 1px)`,
        `linear-gradient(${rgbaFromHex(accentColor, 0.05)} 1px, transparent 1px)`,
        `linear-gradient(90deg, ${rgbaFromHex(accentColor, 0.05)} 1px, transparent 1px)`,
      ].join(', '),
      backgroundSize: ['auto', '100px 100px', '100px 100px', '20px 20px', '20px 20px'].join(', '),
      backgroundPosition: ['0 0', '-1px -1px', '-1px -1px', '-1px -1px', '-1px -1px'].join(', '),
    } satisfies CSSProperties
  }, [accentColor, theme])
  const highlightedObject = useMemo(() => {
    if (!mapDocument || !highlightedObjectTarget) {
      return null
    }

    const group = mapDocument.objectGroups.find((candidate) => candidate.id === highlightedObjectTarget.groupId)
    const object = group?.objects.find((candidate) => candidate.id === highlightedObjectTarget.objectId)
    return group && object ? { group, object } : null
  }, [highlightedObjectTarget, mapDocument])

  function getAtlasPortalAtWorldPoint(pixelX: number, pixelY: number) {
    if (!mapDocument || !atlasPortals.length) {
      return null
    }

    const pointX = pixelX / mapDocument.tileWidth
    const pointY = pixelY / mapDocument.tileHeight
    const hitRadius = Math.max(0.8, 14 / (Math.max(zoom, 0.1) * mapDocument.tileWidth))

    for (const portal of atlasPortals) {
      const deltaX = portal.position.x - pointX
      const deltaY = portal.position.y - pointY
      if (Math.hypot(deltaX, deltaY) <= hitRadius) {
        return portal
      }
    }

    return null
  }

  function getFitZoom(document: MapDocument) {
    if (!viewportSize.width || !viewportSize.height) {
      return 1
    }

    const mapWidth = document.width * document.tileWidth
    const mapHeight = document.height * document.tileHeight
    const availableWidth = Math.max(96, viewportSize.width - VIEWPORT_PADDING * 2)
    const availableHeight = Math.max(96, viewportSize.height - VIEWPORT_PADDING * 2)
    return clampZoom(Math.min(availableWidth / mapWidth, availableHeight / mapHeight))
  }

  const zoom = mapDocument && zoomMode === 'fit' ? getFitZoom(mapDocument) : manualZoom
  const canvasLogicalSize = useMemo(
    () =>
      mapDocument
        ? {
            width: mapDocument.width * mapDocument.tileWidth * zoom,
            height: mapDocument.height * mapDocument.tileHeight * zoom,
          }
        : { width: 0, height: 0 },
    [mapDocument, zoom],
  )
  const stageSize = useMemo(
    () => ({
      width: Math.max(
        viewportSize.width + VIEWPORT_OVERPAN * 2,
        canvasLogicalSize.width + VIEWPORT_PADDING * 2,
      ),
      height: Math.max(
        viewportSize.height + VIEWPORT_OVERPAN * 2,
        canvasLogicalSize.height + VIEWPORT_PADDING * 2,
      ),
    }),
    [canvasLogicalSize.height, canvasLogicalSize.width, viewportSize.height, viewportSize.width],
  )
  const canvasOffset = useMemo(
    () => ({
      left: (stageSize.width - canvasLogicalSize.width) / 2,
      top: (stageSize.height - canvasLogicalSize.height) / 2,
    }),
    [canvasLogicalSize.height, canvasLogicalSize.width, stageSize.height, stageSize.width],
  )
  const viewportCanvasRect = useMemo(
    () =>
      mapDocument
        ? getCanvasViewportRect(
            viewportScroll.left,
            viewportScroll.top,
            viewportSize.width,
            viewportSize.height,
            canvasOffset.left,
            canvasOffset.top,
            canvasLogicalSize.width,
            canvasLogicalSize.height,
          )
        : { left: 0, top: 0, width: 0, height: 0 },
    [
      canvasLogicalSize.height,
      canvasLogicalSize.width,
      canvasOffset.left,
      canvasOffset.top,
      mapDocument,
      viewportScroll.left,
      viewportScroll.top,
      viewportSize.height,
      viewportSize.width,
    ],
  )
  const mapDisplayOffset = useMemo(
    () => ({
      left: canvasOffset.left - viewportScroll.left,
      top: canvasOffset.top - viewportScroll.top,
    }),
    [canvasOffset.left, canvasOffset.top, viewportScroll.left, viewportScroll.top],
  )

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    const syncScrollState = () => {
      setViewportScroll((current) => {
        const nextLeft = viewport.scrollLeft
        const nextTop = viewport.scrollTop
        if (current.left === nextLeft && current.top === nextTop) {
          return current
        }

        return {
          left: nextLeft,
          top: nextTop,
        }
      })
    }

    syncScrollState()
    viewport.addEventListener('scroll', syncScrollState, { passive: true })

    return () => {
      viewport.removeEventListener('scroll', syncScrollState)
    }
  }, [mapDocument, viewportSize.height, viewportSize.width])

  useLayoutEffect(() => {
    if (!mapDocument) {
      mapRasterCanvasRef.current = null
      foregroundRasterCanvasRef.current = null
      return
    }

    const sortedTilesets = [...mapDocument.tilesets].sort((left, right) => left.firstGid - right.firstGid)
    const backgroundRasterCanvas = mapRasterCanvasRef.current ?? document.createElement('canvas')
    const foregroundRasterCanvas = foregroundRasterCanvasRef.current ?? document.createElement('canvas')
    mapRasterCanvasRef.current = backgroundRasterCanvas
    foregroundRasterCanvasRef.current = foregroundRasterCanvas

    rasterizeTileLayers(backgroundRasterCanvas, mapDocument, backgroundLayers, sortedTilesets, tilesetImages)
    rasterizeTileLayers(foregroundRasterCanvas, mapDocument, foregroundLayers, sortedTilesets, tilesetImages)
  }, [backgroundLayers, foregroundLayers, mapDocument, tilesetImages])

  useEffect(() => {
    onZoomChange?.(zoom, zoomMode)
  }, [onZoomChange, zoom, zoomMode])

  const forceViewportRefresh = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    setViewportScroll({
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    })
    setRefreshToken((current) => current + 1)
  }, [])

  const centerViewport = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2)
    viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2)
    forceViewportRefresh()
  }, [forceViewportRefresh])

  const resetViewportToOrigin = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    viewport.scrollLeft = 0
    viewport.scrollTop = 0
    forceViewportRefresh()
  }, [forceViewportRefresh])

  const centerViewportOnWorldPoint = useCallback(
    (worldX: number, worldY: number) => {
      const viewport = viewportRef.current
      if (!viewport) {
        return
      }

      const targetScrollLeft = canvasOffset.left + worldX * zoom - viewport.clientWidth / 2
      const targetScrollTop = canvasOffset.top + worldY * zoom - viewport.clientHeight / 2

      viewport.scrollLeft = Math.max(0, Math.min(targetScrollLeft, viewport.scrollWidth - viewport.clientWidth))
      viewport.scrollTop = Math.max(0, Math.min(targetScrollTop, viewport.scrollHeight - viewport.clientHeight))
      forceViewportRefresh()
    },
    [canvasOffset.left, canvasOffset.top, forceViewportRefresh, zoom],
  )

  useLayoutEffect(() => {
    if (!mapDocument || !focusWorldPoint) {
      return
    }

    centerViewportOnWorldPoint(focusWorldPoint.worldX, focusWorldPoint.worldY)
  }, [centerViewportOnWorldPoint, focusWorldPoint, mapDocument])

  const setZoomAnchorFromClient = useCallback((clientX: number, clientY: number) => {
    const viewport = viewportRef.current
    if (!viewport) {
      pendingZoomAnchorRef.current = null
      return
    }

    const rect = viewport.getBoundingClientRect()
    const viewportX = clientX - rect.left
    const viewportY = clientY - rect.top

    pendingZoomAnchorRef.current = {
      viewportX,
      viewportY,
      worldX: (viewport.scrollLeft + viewportX - canvasOffset.left) / zoom,
      worldY: (viewport.scrollTop + viewportY - canvasOffset.top) / zoom,
    }
  }, [canvasOffset.left, canvasOffset.top, zoom])

  const setZoomAnchorFromViewportCenter = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      pendingZoomAnchorRef.current = null
      return
    }

    const rect = viewport.getBoundingClientRect()
    setZoomAnchorFromClient(rect.left + rect.width / 2, rect.top + rect.height / 2)
  }, [setZoomAnchorFromClient])

  const applyManualZoom = useCallback((nextZoom: number, anchor?: { clientX: number; clientY: number }) => {
    if (anchor) {
      setZoomAnchorFromClient(anchor.clientX, anchor.clientY)
    } else {
      setZoomAnchorFromViewportCenter()
    }

    setZoomMode('manual')
    setManualZoom(clampZoom(nextZoom))
    onHoverChange?.(null)
  }, [onHoverChange, setZoomAnchorFromClient, setZoomAnchorFromViewportCenter])

  const applyFitZoom = useCallback(() => {
    pendingZoomAnchorRef.current = null
    setZoomMode('fit')
    onHoverChange?.(null)
  }, [onHoverChange])

  const zoomInStep = useCallback(() => {
    applyManualZoom(zoom * TOOLBAR_ZOOM_FACTOR)
  }, [applyManualZoom, zoom])

  const zoomOutStep = useCallback(() => {
    applyManualZoom(zoom / TOOLBAR_ZOOM_FACTOR)
  }, [applyManualZoom, zoom])

  const focusObjectTarget = useCallback(
    (target: FocusedMapObjectTarget) => {
      if (!mapDocument) {
        return
      }

      const group = mapDocument.objectGroups.find((candidate) => candidate.id === target.groupId)
      const object = group?.objects.find((candidate) => candidate.id === target.objectId)
      if (!group || !object) {
        return
      }

      const bounds = getObjectBounds(object, 12)
      const worldX = bounds.x + bounds.width / 2
      const worldY = bounds.y + bounds.height / 2

      setHighlightedObjectTarget(target)

      if (zoomMode === 'fit') {
        pendingFocusWorldPointRef.current = { worldX, worldY }
        setManualZoom(zoomRef.current)
        setZoomMode('manual')
        return
      }

      centerViewportOnWorldPoint(worldX, worldY)
    },
    [centerViewportOnWorldPoint, mapDocument, zoomMode],
  )

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: zoomInStep,
      zoomOut: zoomOutStep,
      fitToScreen: applyFitZoom,
      setOneToOne: () => applyManualZoom(1),
      centerView: centerViewport,
      resetPan: resetViewportToOrigin,
      focusObject: focusObjectTarget,
    }),
    [applyFitZoom, applyManualZoom, centerViewport, focusObjectTarget, resetViewportToOrigin, zoomInStep, zoomOutStep],
  )

  useEffect(() => {
    onHoverChange?.(null)
  }, [mapDocument, onHoverChange, zoomMode])

  useLayoutEffect(() => {
    if (!mapDocument || zoomMode !== 'manual') {
      return
    }

    if (pendingZoomAnchorRef.current || pendingFocusWorldPointRef.current) {
      return
    }

    centerViewport()
  }, [centerViewport, mapDocument, zoomMode])

  useLayoutEffect(() => {
    if (!mapDocument || zoomMode !== 'fit') {
      return
    }

    centerViewport()
  }, [centerViewport, mapDocument, zoom, zoomMode])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const anchor = pendingZoomAnchorRef.current
    if (!viewport || !anchor || !mapDocument) {
      return
    }

    const nextAnchor = pendingZoomAnchorRef.current
    if (!nextAnchor) {
      return
    }

    const targetScrollLeft = canvasOffset.left + nextAnchor.worldX * zoom - nextAnchor.viewportX
    const targetScrollTop = canvasOffset.top + nextAnchor.worldY * zoom - nextAnchor.viewportY

    viewport.scrollLeft = Math.max(0, Math.min(targetScrollLeft, viewport.scrollWidth - viewport.clientWidth))
    viewport.scrollTop = Math.max(0, Math.min(targetScrollTop, viewport.scrollHeight - viewport.clientHeight))
    forceViewportRefresh()
    pendingZoomAnchorRef.current = null
  }, [canvasOffset.left, canvasOffset.top, forceViewportRefresh, mapDocument, zoom])

  useLayoutEffect(() => {
    const pendingFocusWorldPoint = pendingFocusWorldPointRef.current
    const viewport = viewportRef.current
    if (!mapDocument || !pendingFocusWorldPoint || !viewport) {
      return
    }

    if (!viewportSize.width || !viewportSize.height || !viewport.clientWidth || !viewport.clientHeight) {
      return
    }

    centerViewportOnWorldPoint(pendingFocusWorldPoint.worldX, pendingFocusWorldPoint.worldY)
    pendingFocusWorldPointRef.current = null
  }, [centerViewportOnWorldPoint, mapDocument, viewportSize.height, viewportSize.width, zoom])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !mapDocument) {
      return
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (event.deltaY === 0) {
        return
      }

      const deltaScale =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? viewport.clientHeight
            : 1
      const anchor = {
        clientX: event.clientX,
        clientY: event.clientY,
      }
      pendingWheelDeltaRef.current += event.deltaY * deltaScale

      if (wheelZoomFrameRef.current !== null) {
        return
      }

      wheelZoomFrameRef.current = requestAnimationFrame(() => {
        wheelZoomFrameRef.current = null
        const delta = pendingWheelDeltaRef.current
        pendingWheelDeltaRef.current = 0

        if (delta === 0) {
          return
        }

        applyManualZoom(zoomRef.current * Math.exp(-delta * WHEEL_ZOOM_INTENSITY), anchor)
      })
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      if (wheelZoomFrameRef.current !== null) {
        cancelAnimationFrame(wheelZoomFrameRef.current)
        wheelZoomFrameRef.current = null
      }
      pendingWheelDeltaRef.current = 0
      viewport.removeEventListener('wheel', handleWheel)
    }
  }, [applyManualZoom, mapDocument])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !mapDocument || !viewportSize.width || !viewportSize.height) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    const pixelRatio =
      typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
        ? window.devicePixelRatio
        : 1
    const logicalWidth = Math.max(1, viewportSize.width)
    const logicalHeight = Math.max(1, viewportSize.height)
    const renderScale = getCanvasRenderScale(logicalWidth, logicalHeight, pixelRatio)
    const width = Math.max(1, Math.ceil(logicalWidth * pixelRatio * renderScale))
    const height = Math.max(1, Math.ceil(logicalHeight * pixelRatio * renderScale))
    const worldLeft = viewportCanvasRect.left / zoom
    const worldTop = viewportCanvasRect.top / zoom
    const worldWidth = viewportCanvasRect.width / zoom
    const worldHeight = viewportCanvasRect.height / zoom

    canvas.width = width
    canvas.height = height

    const canvasFill = theme === 'light' ? '#f8fafc' : '#12151c'
    const overlayLabelFill = theme === 'light' ? '#ffffff' : '#080a10'
    const overlayLabelText = theme === 'light' ? '#101724' : '#eef4ff'
    const visibleMapLeft = mapDisplayOffset.left + viewportCanvasRect.left
    const visibleMapTop = mapDisplayOffset.top + viewportCanvasRect.top
    const visibleMapWidth = viewportCanvasRect.width
    const visibleMapHeight = viewportCanvasRect.height

    context.imageSmoothingEnabled = false
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, width, height)
    context.setTransform(pixelRatio * renderScale, 0, 0, pixelRatio * renderScale, 0, 0)
    context.save()
    context.beginPath()
    context.rect(visibleMapLeft, visibleMapTop, visibleMapWidth, visibleMapHeight)
    context.clip()
    context.fillStyle = canvasFill
    context.fillRect(visibleMapLeft, visibleMapTop, visibleMapWidth, visibleMapHeight)

    const rasterCanvas = mapRasterCanvasRef.current
    if (rasterCanvas && worldWidth > 0 && worldHeight > 0) {
      context.drawImage(
        rasterCanvas,
        worldLeft,
        worldTop,
        worldWidth,
        worldHeight,
        mapDisplayOffset.left + viewportCanvasRect.left,
        mapDisplayOffset.top + viewportCanvasRect.top,
        viewportCanvasRect.width,
        viewportCanvasRect.height,
      )
    }

    if (showGrid) {
      const gridColor = theme === 'light' ? 'rgba(20, 28, 40, 0.22)' : 'rgba(244, 244, 245, 0.18)'
      const hairline = 1 / Math.max(pixelRatio * renderScale, 1)
      const tileWidth = mapDocument.tileWidth * zoom
      const tileHeight = mapDocument.tileHeight * zoom

      context.fillStyle = gridColor

      for (
        let x = Math.max(tileWidth, Math.ceil(viewportCanvasRect.left / tileWidth) * tileWidth);
        x < viewportCanvasRect.left + viewportCanvasRect.width;
        x += tileWidth
      ) {
        context.fillRect(mapDisplayOffset.left + x - hairline / 2, visibleMapTop, hairline, visibleMapHeight)
      }

      for (
        let y = Math.max(tileHeight, Math.ceil(viewportCanvasRect.top / tileHeight) * tileHeight);
        y < viewportCanvasRect.top + viewportCanvasRect.height;
        y += tileHeight
      ) {
        context.fillRect(visibleMapLeft, mapDisplayOffset.top + y - hairline / 2, visibleMapWidth, hairline)
      }
    }
    context.restore()

    context.globalAlpha = 1
    context.save()
    context.beginPath()
    context.rect(mapDisplayOffset.left, mapDisplayOffset.top, canvasLogicalSize.width, canvasLogicalSize.height)
    context.clip()
    context.translate(mapDisplayOffset.left, mapDisplayOffset.top)

    for (const group of visibleObjectGroups) {
      const color = getGroupColor(group.name)

      for (const object of group.objects) {
        const interactionTag = getObjectInteractionTag(object)
        const label = getObjectDisplayLabel(object)
        const bounds = getObjectBounds(object, 12 / zoom)
        const destinationX = bounds.x * zoom
        const destinationY = bounds.y * zoom
        const destinationWidth = bounds.width * zoom
        const destinationHeight = bounds.height * zoom
        const centerX = (bounds.x + bounds.width / 2) * zoom
        const centerY = (bounds.y + bounds.height / 2) * zoom
        const fillAlpha = interactionTag ? Math.max(0.22, Math.min(0.42, group.opacity * 0.42)) : Math.max(0.12, Math.min(0.28, group.opacity * 0.24))
        const strokeAlpha = interactionTag ? Math.max(0.76, Math.min(0.98, group.opacity + 0.12)) : Math.max(0.48, Math.min(0.82, group.opacity * 0.84))

        context.save()
        context.strokeStyle = color
        context.fillStyle = color
        context.globalAlpha = fillAlpha
        context.fillRect(destinationX, destinationY, destinationWidth, destinationHeight)
        context.globalAlpha = strokeAlpha
        context.lineWidth = Math.max(interactionTag ? 1.8 : 1.25, zoom * (interactionTag ? 0.18 : 0.1))
        if (interactionTag) {
          context.setLineDash([Math.max(5, 8 * zoom), Math.max(3, 5 * zoom)])
        }
        context.strokeRect(destinationX, destinationY, destinationWidth, destinationHeight)
        context.setLineDash([])

        if (bounds.isPoint) {
          context.beginPath()
          context.globalAlpha = interactionTag ? 1 : 0.92
          context.shadowBlur = interactionTag ? Math.max(8, 14 * zoom) : 0
          context.shadowColor = interactionTag ? color : 'transparent'
          context.arc(object.x * zoom, object.y * zoom, Math.max(interactionTag ? 5 : 4, 5.5 * zoom), 0, Math.PI * 2)
          context.fill()
          context.shadowBlur = 0
        } else {
          context.beginPath()
          context.globalAlpha = interactionTag ? 0.94 : 0.72
          context.arc(centerX, centerY, Math.max(interactionTag ? 3.5 : 2.5, 3.5 * zoom), 0, Math.PI * 2)
          context.fill()
        }

        if (interactionTag) {
          const markerRadius = Math.max(6, 8 * zoom)

          context.globalAlpha = 0.92
          context.strokeStyle = 'rgba(255,255,255,0.96)'
          context.lineWidth = Math.max(1.2, 1.8 * zoom)
          context.beginPath()
          context.moveTo(centerX, centerY - markerRadius)
          context.lineTo(centerX + markerRadius, centerY)
          context.lineTo(centerX, centerY + markerRadius)
          context.lineTo(centerX - markerRadius, centerY)
          context.closePath()
          context.stroke()
        }

        const labelThreshold = interactionTag || bounds.isPoint ? 0.28 : 0.45
        if (zoom >= labelThreshold) {
          const secondaryLabel = interactionTag ?? object.type
          context.font = `${Math.max(10, Math.round(11 * Math.min(zoom, 1.3)))}px "Segoe UI", sans-serif`
          const primaryWidth = context.measureText(label).width
          const secondaryWidth = secondaryLabel ? context.measureText(secondaryLabel).width : 0
          const labelWidth = Math.max(primaryWidth, secondaryWidth) + 12
          const labelHeight = secondaryLabel ? 30 : 18
          const labelX = bounds.isPoint ? centerX + 10 : destinationX
          const labelY = bounds.isPoint ? centerY - labelHeight / 2 : Math.max(4, destinationY - labelHeight)

          context.globalAlpha = 0.88
          context.fillStyle = overlayLabelFill
          context.fillRect(labelX, labelY, labelWidth, labelHeight)
          context.globalAlpha = 1
          context.strokeStyle = color
          context.strokeRect(labelX, labelY, labelWidth, labelHeight)
          context.fillStyle = overlayLabelText
          context.fillText(label, labelX + 5, labelY + 12.5)
          if (secondaryLabel) {
            context.fillStyle = theme === 'light' ? '#475569' : '#cbd5e1'
            context.fillText(secondaryLabel, labelX + 5, labelY + 24)
          }
        }
        context.restore()
      }
    }

    if (atlasWarpRoutes.length) {
      for (const route of atlasWarpRoutes) {
        drawWarpRoute(context, route, mapDocument.tileWidth, mapDocument.tileHeight, zoom)
      }
    }

    if (highlightedObject) {
      const bounds = getObjectBounds(highlightedObject.object, 12 / zoom)
      const destinationX = bounds.x * zoom
      const destinationY = bounds.y * zoom
      const destinationWidth = bounds.width * zoom
      const destinationHeight = bounds.height * zoom
      const centerX = (bounds.x + bounds.width / 2) * zoom
      const centerY = (bounds.y + bounds.height / 2) * zoom
      const highlightColor = theme === 'light' ? 'rgba(245, 158, 11, 0.96)' : 'rgba(250, 204, 21, 0.98)'
      const haloColor = theme === 'light' ? 'rgba(249, 115, 22, 0.24)' : 'rgba(250, 204, 21, 0.28)'

      context.save()
      context.globalAlpha = 1
      context.shadowBlur = Math.max(14, 22 * zoom)
      context.shadowColor = haloColor
      context.fillStyle = haloColor
      context.fillRect(destinationX - 4, destinationY - 4, destinationWidth + 8, destinationHeight + 8)
      context.shadowBlur = 0
      context.strokeStyle = highlightColor
      context.lineWidth = Math.max(2, 3 * zoom)
      context.setLineDash([Math.max(8, 10 * zoom), Math.max(4, 6 * zoom)])
      context.strokeRect(destinationX - 2, destinationY - 2, destinationWidth + 4, destinationHeight + 4)
      context.setLineDash([])

      context.beginPath()
      context.fillStyle = highlightColor
      context.arc(centerX, centerY, Math.max(4.5, 6 * zoom), 0, Math.PI * 2)
      context.fill()

      context.beginPath()
      context.strokeStyle = 'rgba(255,255,255,0.96)'
      context.lineWidth = Math.max(1.5, 2 * zoom)
      context.moveTo(centerX - Math.max(8, 12 * zoom), centerY)
      context.lineTo(centerX + Math.max(8, 12 * zoom), centerY)
      context.moveTo(centerX, centerY - Math.max(8, 12 * zoom))
      context.lineTo(centerX, centerY + Math.max(8, 12 * zoom))
      context.stroke()
      context.restore()
    }

    if (atlasPortals.length) {
      for (const portal of atlasPortals) {
        drawAtlasPortal(context, portal, mapDocument.tileWidth, mapDocument.tileHeight, zoom, theme, accentColor)
      }
    }

    if (atlasPlacements.length && mapDocument.format === 'atlas') {
      context.save()
      context.textBaseline = 'top'
      context.setLineDash([8, 8])

      for (const placement of atlasPlacements) {
        const x = placement.offsetX * mapDocument.tileWidth * zoom
        const y = placement.offsetY * mapDocument.tileHeight * zoom
        const width = placement.width * mapDocument.tileWidth * zoom
        const height = placement.height * mapDocument.tileHeight * zoom

        context.globalAlpha = 0.04
        context.fillStyle = theme === 'light' ? '#3b82f6' : '#60a5fa'
        context.fillRect(x, y, width, height)

        context.globalAlpha = 0.38
        context.lineWidth = Math.max(1.5, zoom * 0.12)
        context.strokeStyle = theme === 'light' ? 'rgba(15,23,42,0.4)' : 'rgba(255,255,255,0.28)'
        context.strokeRect(x, y, width, height)

        if (zoom >= 0.28) {
          const label = placement.mapName
          context.font = `${Math.max(10, Math.round(12 * Math.min(zoom, 1.2)))}px "Segoe UI", sans-serif`
          const labelWidth = context.measureText(label).width + 12
          context.fillStyle = theme === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(8,10,16,0.9)'
          context.fillRect(x + 4, y + 4, labelWidth, 20)
          context.strokeStyle = theme === 'light' ? 'rgba(15,23,42,0.4)' : 'rgba(255,255,255,0.28)'
          context.strokeRect(x + 4, y + 4, labelWidth, 20)
          context.fillStyle = theme === 'light' ? '#0f172a' : '#f8fafc'
          context.fillText(label, x + 10, y + 8)
        }
      }

      context.restore()
    }

    context.globalAlpha = 1
    context.restore()
  }, [
    accentColor,
    atlasPlacements,
    highlightedObject,
    atlasPortals,
    atlasWarpRoutes,
    mapDocument,
    showGrid,
    theme,
    tilesetImages,
    viewportCanvasRect.height,
    viewportCanvasRect.left,
    viewportCanvasRect.top,
    viewportCanvasRect.width,
    visibleLayers,
    visibleObjectGroups,
    viewportSize.height,
    viewportSize.width,
    zoom,
    canvasLogicalSize.height,
    canvasLogicalSize.width,
    mapDisplayOffset.left,
    mapDisplayOffset.top,
    refreshToken,
  ])

  useLayoutEffect(() => {
    const canvas = foregroundCanvasRef.current
    if (!canvas || !mapDocument) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    const pixelRatio = window.devicePixelRatio || 1
    const renderScale = getCanvasRenderScale(viewportSize.width, viewportSize.height, pixelRatio)
    const width = Math.max(1, Math.round(viewportSize.width * pixelRatio * renderScale))
    const height = Math.max(1, Math.round(viewportSize.height * pixelRatio * renderScale))
    const worldLeft = viewportCanvasRect.left / zoom
    const worldTop = viewportCanvasRect.top / zoom
    const worldWidth = viewportCanvasRect.width / zoom
    const worldHeight = viewportCanvasRect.height / zoom

    canvas.width = width
    canvas.height = height
    context.imageSmoothingEnabled = false
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, width, height)

    const rasterCanvas = foregroundRasterCanvasRef.current
    if (!rasterCanvas || foregroundLayers.length === 0 || worldWidth <= 0 || worldHeight <= 0) {
      return
    }

    context.setTransform(pixelRatio * renderScale, 0, 0, pixelRatio * renderScale, 0, 0)
    context.save()
    context.beginPath()
    context.rect(
      mapDisplayOffset.left + viewportCanvasRect.left,
      mapDisplayOffset.top + viewportCanvasRect.top,
      viewportCanvasRect.width,
      viewportCanvasRect.height,
    )
    context.clip()
    context.drawImage(
      rasterCanvas,
      worldLeft,
      worldTop,
      worldWidth,
      worldHeight,
      mapDisplayOffset.left + viewportCanvasRect.left,
      mapDisplayOffset.top + viewportCanvasRect.top,
      viewportCanvasRect.width,
      viewportCanvasRect.height,
    )
    context.restore()
  }, [
    foregroundLayers.length,
    mapDisplayOffset.left,
    mapDisplayOffset.top,
    mapDocument,
    viewportCanvasRect.height,
    viewportCanvasRect.left,
    viewportCanvasRect.top,
    viewportCanvasRect.width,
    viewportSize.height,
    viewportSize.width,
    zoom,
  ])

  function updateHover(event: PointerEvent<HTMLDivElement>) {
    const worldPoint = getCanvasWorldPoint(event.clientX, event.clientY)
    if (!mapDocument || !worldPoint) {
      return
    }

    onHoverChange?.(buildHoverInfo(mapDocument, visibleLayerIds, visibleObjectGroupIds, worldPoint.pixelX, worldPoint.pixelY))
  }

  function getCanvasWorldPoint(clientX: number, clientY: number) {
    const viewport = viewportRef.current
    if (!mapDocument || !viewport) {
      return null
    }

    const rect = viewport.getBoundingClientRect()
    const viewportX = clientX - rect.left
    const viewportY = clientY - rect.top
    const pixelX = (viewport.scrollLeft + viewportX - canvasOffset.left) / zoom
    const pixelY = (viewport.scrollTop + viewportY - canvasOffset.top) / zoom

    return {
      pixelX,
      pixelY,
      tileX: Math.floor(pixelX / mapDocument.tileWidth),
      tileY: Math.floor(pixelY / mapDocument.tileHeight),
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    if (event.button !== 0 && event.button !== 1) {
      return
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    }

    viewport.setPointerCapture(event.pointerId)
    viewport.style.cursor = 'grabbing'
    event.preventDefault()
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current
    if (!viewport || !mapDocument) {
      return
    }

    const dragState = dragStateRef.current
    if (dragState && dragState.pointerId === event.pointerId) {
      const deltaX = event.clientX - dragState.startX
      const deltaY = event.clientY - dragState.startY
      viewport.scrollLeft = dragState.scrollLeft - deltaX
      viewport.scrollTop = dragState.scrollTop - deltaY
      forceViewportRefresh()
      return
    }

    updateHover(event)
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current
    const dragState = dragStateRef.current
    if (!viewport || !dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    dragStateRef.current = null
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId)
    }
    viewport.style.cursor = 'grab'

    const moved = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY)
    if (event.button === 0 && moved <= 6) {
      const worldPoint = getCanvasWorldPoint(event.clientX, event.clientY)
      const portal = worldPoint ? getAtlasPortalAtWorldPoint(worldPoint.pixelX, worldPoint.pixelY) : null
      if (portal) {
        onAtlasPortalOpen?.(portal.targetMap)
        onHoverChange?.(null)
        return
      }
    }

    updateHover(event)
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current
    const dragState = dragStateRef.current
    if (!viewport || !dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    dragStateRef.current = null
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId)
    }
    viewport.style.cursor = 'grab'
    onHoverChange?.(null)
  }

  function handlePointerLeave() {
    if (!dragStateRef.current) {
      onHoverChange?.(null)
    }
  }

  if (!mapDocument) {
    return (
      <div className="relative h-full overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-viewport)]" style={viewportBackdropStyle}>
        <div
          className="absolute inset-0"
          style={{
            background:
                theme === 'light'
                ? `radial-gradient(circle at center, ${rgbaFromHex(accentColor, 0.06)}, transparent 38%)`
                : `radial-gradient(circle at center, ${rgbaFromHex(accentColor, 0.08)}, transparent 38%)`,
          }}
        />
        <div className="relative flex h-full items-center justify-center p-10">
          <div className="max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-6 py-5 text-center shadow-[var(--shadow-panel)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]">{labels.fitMap}</p>
            <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">{labels.loadPrompt}</p>
          </div>
        </div>
      </div>
    )
  }

  const viewportContent = (
    <div className="relative h-full overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-viewport)] shadow-[var(--shadow-panel)]" style={viewportBackdropStyle}>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                theme === 'light'
                  ? `radial-gradient(circle at top left, ${rgbaFromHex(accentColor, 0.05)}, transparent 28%)`
                  : `radial-gradient(circle at top left, ${rgbaFromHex(accentColor, 0.08)}, transparent 28%)`,
            }}
          />

          {showStatsChips ? (
            <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
              <span className="dock-chip">
                {mapDocument.width} x {mapDocument.height} {labels.tilesLabel}
              </span>
              <span className="dock-chip">
                {labels.tilesetsLoadedLabel(Object.keys(tilesetImages).length, mapDocument.tilesets.length)}
              </span>
              <span className="dock-chip">{labels.layersVisibleLabel(visibleLayers.length, mapDocument.layers.length)}</span>
              <span className="dock-chip">
                {labels.objectGroupsVisibleLabel(visibleObjectGroups.length, mapDocument.objectGroups.length)}
              </span>
              <span className="dock-chip">{labels.zoomLabel(zoom)}</span>
            </div>
          ) : null}

          {imageError ? (
            <div className="absolute bottom-4 left-4 z-10 rounded-lg border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-2 text-xs text-[var(--danger)]">
              {imageError}
            </div>
          ) : null}

          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 z-[1] [image-rendering:pixelated]"
            style={{
              width: `${viewportSize.width}px`,
              height: `${viewportSize.height}px`,
              display: viewportSize.width > 0 && viewportSize.height > 0 ? 'block' : 'none',
            }}
          />

          <canvas
            ref={foregroundCanvasRef}
            className="pointer-events-none absolute inset-0 z-[3] [image-rendering:pixelated]"
            style={{
              width: `${viewportSize.width}px`,
              height: `${viewportSize.height}px`,
              display: viewportSize.width > 0 && viewportSize.height > 0 && foregroundLayers.length > 0 ? 'block' : 'none',
            }}
          />

          {viewportOverlay ? <div className="pointer-events-none absolute inset-0 z-[4]">{viewportOverlay}</div> : null}

          <div ref={frameRef} className="absolute inset-0">
            <div
              ref={viewportRef}
              className={`viewport-scroll-hidden h-full w-full cursor-grab ${zoomMode === 'fit' ? 'overflow-hidden' : 'overflow-auto'}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onPointerLeave={handlePointerLeave}
            >
              <div
                className="relative shrink-0"
                style={{
                  width: `${stageSize.width}px`,
                  height: `${stageSize.height}px`,
                }}
              >
                <div
                  className="pointer-events-none absolute border border-white/10"
                  style={{
                    left: `${canvasOffset.left}px`,
                    top: `${canvasOffset.top}px`,
                    width: `${canvasLogicalSize.width}px`,
                    height: `${canvasLogicalSize.height}px`,
                  }}
                />
                {mapOverlay ? (
                  <div
                    className="pointer-events-none absolute z-[2]"
                    style={{
                      left: `${canvasOffset.left}px`,
                      top: `${canvasOffset.top}px`,
                      width: `${canvasLogicalSize.width}px`,
                      height: `${canvasLogicalSize.height}px`,
                    }}
                  >
                    {mapOverlay}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
  )

  if (!contextMenuEnabled) {
    return viewportContent
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{viewportContent}</ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
          <ContextMenu.Item className="context-menu-item" onSelect={applyFitZoom}>
            {labels.fitMap}
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={() => applyManualZoom(1)}>
            {labels.setOneToOne}
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={zoomInStep}>
            {labels.zoomIn}
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={zoomOutStep}>
            {labels.zoomOut}
          </ContextMenu.Item>
          <ContextMenu.Separator className="context-menu-separator" />
          <ContextMenu.Item className="context-menu-item" onSelect={centerViewport}>
            {labels.centerView}
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={resetViewportToOrigin}>
            {labels.resetPan}
          </ContextMenu.Item>
          <ContextMenu.Separator className="context-menu-separator" />
          <ContextMenu.Item className="context-menu-item" disabled>
            {labels.addObjectHere} · {labels.unavailable}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
})
