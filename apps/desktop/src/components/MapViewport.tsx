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
  type PointerEvent,
} from 'react'
import { resolveTilesetImagePath, toAssetUrl } from '../lib/maps/assets'
import type { ThemeMode, ViewportLabels } from '../lib/editor-shell'
import type { MapDocument, MapObject, MapPropertyValue, MapTileset } from '../lib/maps/types'

type MapViewportProps = {
  mapDocument: MapDocument | null
  visibleLayerIds: number[]
  visibleObjectGroupIds: number[]
  onHoverChange?: (info: TileHoverInfo | null) => void
  labels: ViewportLabels
  theme: ThemeMode
  showGrid: boolean
  onZoomChange?: (zoom: number, mode: 'fit' | 'manual') => void
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
const BACKDROP_MINOR_GRID_SIZE = 24
const BACKDROP_MAJOR_GRID_SIZE = 96

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function loadImage(path: string, errorFactory: (path: string) => string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(errorFactory(path)))
    image.src = toAssetUrl(path)
  })
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

export const MapViewport = forwardRef<MapViewportHandle, MapViewportProps>(function MapViewport(
  { mapDocument, visibleLayerIds, visibleObjectGroupIds, onHoverChange, labels, theme, showGrid, onZoomChange },
  ref,
) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const mapRasterCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const pendingZoomAnchorRef = useRef<ZoomAnchor | null>(null)
  const wheelZoomFrameRef = useRef<number | null>(null)
  const pendingWheelDeltaRef = useRef(0)
  const zoomRef = useRef(1)
  const [tilesetImageState, setTilesetImageState] = useState<TilesetImageState>({
    sourcePath: null,
    items: {},
    error: null,
  })
  const [manualZoom, setManualZoom] = useState(1)
  const [zoomMode, setZoomMode] = useState<'fit' | 'manual'>('fit')
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
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
  const visibleObjectGroups = useMemo(
    () =>
      mapDocument
        ? mapDocument.objectGroups.filter(
            (group) => group.visible && visibleObjectGroupIds.includes(group.id),
          )
        : [],
    [mapDocument, visibleObjectGroupIds],
  )

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

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    const gridCanvas = gridCanvasRef.current
    if (!gridCanvas || !viewportSize.width || !viewportSize.height) {
      return
    }

    const context = gridCanvas.getContext('2d')
    if (!context) {
      return
    }

    const pixelRatio =
      typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
        ? window.devicePixelRatio
        : 1
    const width = Math.max(1, Math.ceil(viewportSize.width * pixelRatio))
    const height = Math.max(1, Math.ceil(viewportSize.height * pixelRatio))

    gridCanvas.width = width
    gridCanvas.height = height

    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, width, height)

    const minorColor = theme === 'light' ? 'rgba(92, 104, 124, 0.15)' : 'rgba(255, 255, 255, 0.05)'
    const majorColor = theme === 'light' ? 'rgba(92, 104, 124, 0.22)' : 'rgba(255, 255, 255, 0.09)'
    const hairline = 1 / pixelRatio

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

    for (let x = 0; x <= viewportSize.width; x += BACKDROP_MINOR_GRID_SIZE) {
      context.fillStyle = x % BACKDROP_MAJOR_GRID_SIZE === 0 ? majorColor : minorColor
      context.fillRect(x, 0, hairline, viewportSize.height)
    }

    for (let y = 0; y <= viewportSize.height; y += BACKDROP_MINOR_GRID_SIZE) {
      context.fillStyle = y % BACKDROP_MAJOR_GRID_SIZE === 0 ? majorColor : minorColor
      context.fillRect(0, y, viewportSize.width, hairline)
    }
  }, [theme, viewportSize.height, viewportSize.width])

  useEffect(() => {
    if (!mapDocument) {
      mapRasterCanvasRef.current = null
      return
    }

    const rasterCanvas = mapRasterCanvasRef.current ?? document.createElement('canvas')
    const rasterContext = rasterCanvas.getContext('2d')
    if (!rasterContext) {
      return
    }

    const rasterWidth = Math.max(1, mapDocument.width * mapDocument.tileWidth)
    const rasterHeight = Math.max(1, mapDocument.height * mapDocument.tileHeight)
    rasterCanvas.width = rasterWidth
    rasterCanvas.height = rasterHeight
    mapRasterCanvasRef.current = rasterCanvas

    rasterContext.setTransform(1, 0, 0, 1, 0, 0)
    rasterContext.clearRect(0, 0, rasterWidth, rasterHeight)
    rasterContext.imageSmoothingEnabled = false

    const sortedTilesets = [...mapDocument.tilesets].sort((left, right) => left.firstGid - right.firstGid)

    for (const layer of visibleLayers) {
      rasterContext.globalAlpha = layer.opacity

      for (let index = 0; index < layer.gids.length; index += 1) {
        const rawGid = layer.gids[index] >>> 0
        const gid = rawGid & TILE_ID_MASK
        if (gid === 0) {
          continue
        }

        const tileset = findTileset(sortedTilesets, gid)
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
  }, [mapDocument, tilesetImages, visibleLayers])

  useEffect(() => {
    onZoomChange?.(zoom, zoomMode)
  }, [onZoomChange, zoom, zoomMode])

  const centerViewport = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2)
    viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2)
  }, [])

  const resetViewportToOrigin = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    viewport.scrollLeft = 0
    viewport.scrollTop = 0
  }, [])

  const setZoomAnchorFromClient = useCallback((clientX: number, clientY: number) => {
    const viewport = viewportRef.current
    if (!viewport) {
      pendingZoomAnchorRef.current = null
      return
    }

    const rect = viewport.getBoundingClientRect()
    const viewportX = clientX - rect.left
    const viewportY = clientY - rect.top
    const canvasOffsetX = (stageSize.width - canvasLogicalSize.width) / 2
    const canvasOffsetY = (stageSize.height - canvasLogicalSize.height) / 2

    pendingZoomAnchorRef.current = {
      viewportX,
      viewportY,
      worldX: (viewport.scrollLeft + viewportX - canvasOffsetX) / zoom,
      worldY: (viewport.scrollTop + viewportY - canvasOffsetY) / zoom,
    }
  }, [canvasLogicalSize.height, canvasLogicalSize.width, stageSize.height, stageSize.width, zoom])

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

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: zoomInStep,
      zoomOut: zoomOutStep,
      fitToScreen: applyFitZoom,
      setOneToOne: () => applyManualZoom(1),
      centerView: centerViewport,
      resetPan: resetViewportToOrigin,
    }),
    [applyFitZoom, applyManualZoom, centerViewport, resetViewportToOrigin, zoomInStep, zoomOutStep],
  )

  useEffect(() => {
    onHoverChange?.(null)
  }, [mapDocument, onHoverChange, zoomMode])

  useLayoutEffect(() => {
    if (!mapDocument || zoomMode !== 'manual') {
      return
    }

    if (pendingZoomAnchorRef.current) {
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

    const canvasOffsetX = (stageSize.width - canvasLogicalSize.width) / 2
    const canvasOffsetY = (stageSize.height - canvasLogicalSize.height) / 2
    const targetScrollLeft = canvasOffsetX + nextAnchor.worldX * zoom - nextAnchor.viewportX
    const targetScrollTop = canvasOffsetY + nextAnchor.worldY * zoom - nextAnchor.viewportY

    viewport.scrollLeft = Math.max(0, Math.min(targetScrollLeft, viewport.scrollWidth - viewport.clientWidth))
    viewport.scrollTop = Math.max(0, Math.min(targetScrollTop, viewport.scrollHeight - viewport.clientHeight))
    pendingZoomAnchorRef.current = null
  }, [canvasLogicalSize.height, canvasLogicalSize.width, mapDocument, stageSize.height, stageSize.width, zoom])

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

        applyManualZoom(zoomRef.current * Math.exp(-delta * WHEEL_ZOOM_INTENSITY))
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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !mapDocument) {
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
    const logicalWidth = canvasLogicalSize.width
    const logicalHeight = canvasLogicalSize.height
    const width = Math.max(1, Math.ceil(logicalWidth * pixelRatio))
    const height = Math.max(1, Math.ceil(logicalHeight * pixelRatio))

    canvas.width = width
    canvas.height = height

    const canvasFill = theme === 'light' ? '#f8fafc' : '#12151c'
    const overlayLabelFill = theme === 'light' ? '#ffffff' : '#080a10'
    const overlayLabelText = theme === 'light' ? '#101724' : '#eef4ff'

    context.imageSmoothingEnabled = false
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, width, height)
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.fillStyle = canvasFill
    context.fillRect(0, 0, logicalWidth, logicalHeight)

    const rasterCanvas = mapRasterCanvasRef.current
    if (rasterCanvas) {
      context.drawImage(rasterCanvas, 0, 0, logicalWidth, logicalHeight)
    }

    if (showGrid) {
      const gridColor = theme === 'light' ? 'rgba(20, 28, 40, 0.22)' : 'rgba(244, 244, 245, 0.18)'
      const hairline = 1 / pixelRatio
      const tileWidth = mapDocument.tileWidth * zoom
      const tileHeight = mapDocument.tileHeight * zoom

      context.fillStyle = gridColor

      for (let x = tileWidth; x < logicalWidth; x += tileWidth) {
        context.fillRect(x - hairline / 2, 0, hairline, logicalHeight)
      }

      for (let y = tileHeight; y < logicalHeight; y += tileHeight) {
        context.fillRect(0, y - hairline / 2, logicalWidth, hairline)
      }
    }

    context.globalAlpha = 1

    for (const group of visibleObjectGroups) {
      const color = getGroupColor(group.name)
      context.strokeStyle = color
      context.fillStyle = color
      context.globalAlpha = Math.max(0.18, Math.min(0.45, group.opacity * 0.32))
      context.lineWidth = Math.max(1.25, zoom * 0.1)

      for (const object of group.objects) {
        const bounds = getObjectBounds(object, 12 / zoom)
        const destinationX = bounds.x * zoom
        const destinationY = bounds.y * zoom
        const destinationWidth = bounds.width * zoom
        const destinationHeight = bounds.height * zoom

        context.fillRect(destinationX, destinationY, destinationWidth, destinationHeight)
        context.globalAlpha = Math.max(0.5, Math.min(0.9, group.opacity))
        context.strokeRect(destinationX, destinationY, destinationWidth, destinationHeight)

        if (bounds.isPoint) {
          context.beginPath()
          context.arc(object.x * zoom, object.y * zoom, Math.max(4, 5 * zoom), 0, Math.PI * 2)
          context.fill()
        }

        if (zoom >= 0.45) {
          const label = object.name || object.type || `Object ${object.id}`
          context.font = `${Math.max(10, Math.round(11 * Math.min(zoom, 1.3)))}px "Segoe UI", sans-serif`
          const labelWidth = context.measureText(label).width + 10
          const labelHeight = 18
          const labelX = destinationX
          const labelY = Math.max(4, destinationY - labelHeight)

          context.globalAlpha = 0.88
          context.fillStyle = overlayLabelFill
          context.fillRect(labelX, labelY, labelWidth, labelHeight)
          context.globalAlpha = 1
          context.strokeStyle = color
          context.strokeRect(labelX, labelY, labelWidth, labelHeight)
          context.fillStyle = overlayLabelText
          context.fillText(label, labelX + 5, labelY + 12.5)
          context.fillStyle = color
        }

        context.globalAlpha = Math.max(0.18, Math.min(0.45, group.opacity * 0.32))
      }
    }

    context.globalAlpha = 1
  }, [canvasLogicalSize.height, canvasLogicalSize.width, mapDocument, showGrid, theme, tilesetImages, visibleLayers, visibleObjectGroups, zoom])

  function updateHover(event: PointerEvent<HTMLDivElement>) {
    if (!mapDocument) {
      return
    }

    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }

    const canvasX = (event.clientX - rect.left) / zoom
    const canvasY = (event.clientY - rect.top) / zoom
    onHoverChange?.(buildHoverInfo(mapDocument, visibleLayerIds, visibleObjectGroupIds, canvasX, canvasY))
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
      <div className="relative h-full overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-viewport)]">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'linear-gradient(var(--grid-minor) 1px, transparent 1px), linear-gradient(90deg, var(--grid-minor) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.14),transparent_38%)]" />
        <div className="relative flex h-full items-center justify-center p-10">
          <div className="max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-6 py-5 text-center shadow-[var(--shadow-panel)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]">{labels.fitMap}</p>
            <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">{labels.loadPrompt}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className="relative h-full overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-viewport)] shadow-[var(--shadow-panel)]">
          <canvas ref={gridCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.12),transparent_28%)]" />

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

          {imageError ? (
            <div className="absolute bottom-4 left-4 z-10 rounded-lg border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-2 text-xs text-[var(--danger)]">
              {imageError}
            </div>
          ) : null}

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
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <canvas
                    ref={canvasRef}
                    className="border border-white/10 shadow-2xl [image-rendering:pixelated]"
                    style={{
                      width: `${canvasLogicalSize.width}px`,
                      height: `${canvasLogicalSize.height}px`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </ContextMenu.Trigger>

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
