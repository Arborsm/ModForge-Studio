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
import { getObjectInteractionTag } from '@entities/map'
import { resolveTilesetImagePath } from '../lib/assets'
import type { LocaleCode, ThemeMode } from '@locales/api'
import { useEditorCopy } from '@locales/provider'
import { PAN_ZOOM_TOOLBAR_ZOOM_FACTOR, PAN_ZOOM_WHEEL_INTENSITY } from '@shared/lib/viewports'
import type { FocusedMapObjectTarget, TileHoverInfo, ViewportWorldPoint } from '@entities/map'
import type { MapDocument } from '@entities/map'
import {
  VIEWPORT_OVERPAN,
  VIEWPORT_PADDING,
  buildHoverInfo,
  clampZoom,
  drawAtlasPortal,
  drawWarpRoute,
  getCanvasRenderScale,
  getCanvasViewportRect,
  getDefaultViewportState,
  getGroupColor,
  getObjectBounds,
  getObjectDisplayLabel,
  isForegroundTileLayer,
  loadImage,
  rasterizeTileLayers,
  rgbaFromHex,
} from './mapViewportHelpers'
import type { LoadedTilesetImage } from './mapViewportTypes'
import {
  MapViewportCanvasLayers,
  MapViewportContextMenu,
  MapViewportEmptyState,
  MapViewportImageError,
  MapViewportStatsChips,
} from './MapViewportChrome'

type MapViewportProps = {
  locale: LocaleCode
  mapDocument: MapDocument | null
  visibleLayerIds: number[]
  visibleObjectGroupIds: number[]
  onHoverChange?: (info: TileHoverInfo | null) => void
  onAtlasPortalOpen?: (targetMapName: string) => void
  theme: ThemeMode
  accentColor: string
  showGrid: boolean
  onZoomChange?: (zoom: number, mode: 'fit' | 'manual') => void
  showStatsChips?: boolean
  mapOverlay?: ReactNode
  scaleMapOverlayWithViewport?: boolean
  viewportOverlay?: ReactNode
  focusWorldPoint?: ViewportWorldPoint | null
  contextMenuEnabled?: boolean
  contextMenuExtraItems?: ReactNode
  onAddObjectHere?: (tileX: number, tileY: number) => void
  onTileClick?: (tileX: number, tileY: number) => void
  initialZoom?: number | null
}

type TilesetImageState = {
  sourcePath: string | null
  items: Record<number, LoadedTilesetImage>
  error: string | null
}

type FocusWorldPoint = ViewportWorldPoint

export type MapViewportHandle = {
  zoomIn: () => void
  zoomOut: () => void
  fitToScreen: () => void
  setOneToOne: () => void
  centerView: () => void
  resetPan: () => void
  focusObject: (target: FocusedMapObjectTarget) => void
}

type DragState = {
  pointerId: number
  startX: number
  startY: number
  scrollLeft: number
  scrollTop: number
}

type LeftPressState = {
  pointerId: number
  startX: number
  startY: number
  button: number
}

type TilePoint = {
  tileX: number
  tileY: number
}

type PickFlashState = TilePoint & {
  token: number
}

type ZoomAnchor = {
  viewportX: number
  viewportY: number
  worldX: number
  worldY: number
}

export const MapViewport = forwardRef<MapViewportHandle, MapViewportProps>(function MapViewport(
  {
    locale,
    mapDocument,
    visibleLayerIds,
    visibleObjectGroupIds,
    onHoverChange,
    onAtlasPortalOpen,
    theme,
    accentColor,
    showGrid,
    onZoomChange,
    showStatsChips = true,
    mapOverlay,
    scaleMapOverlayWithViewport = false,
    viewportOverlay,
    focusWorldPoint,
    contextMenuEnabled = true,
    contextMenuExtraItems,
    onAddObjectHere,
    onTileClick,
    initialZoom = null,
  },
  ref,
) {
  const labels = useEditorCopy().viewportLabels
  const initialDefaultViewportState = useMemo(() => getDefaultViewportState(mapDocument), [mapDocument])
  const resolvedInitialZoom = clampZoom(initialZoom ?? initialDefaultViewportState?.zoom ?? 1)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const foregroundCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const mapRasterCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const lastHoverRef = useRef<TileHoverInfo | null>(null)
  const [contextMenuHover, setContextMenuHover] = useState<TileHoverInfo | null>(null)
  const foregroundRasterCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const leftPressStateRef = useRef<LeftPressState | null>(null)
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
  const [hoveredTile, setHoveredTile] = useState<TilePoint | null>(null)
  const [pickFlash, setPickFlash] = useState<PickFlashState | null>(null)

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

            const image = await loadImage(imagePath, locale, labels.failedToLoadTilesetImage)
            return [tileset.firstGid, { image, tileset }] as const
          }),
        )

        if (disposed) {
          return
        }

        setTilesetImageState({
          sourcePath: mapDocument.sourcePath,
          items: Object.fromEntries(entries.filter((entry): entry is readonly [number, LoadedTilesetImage] => entry !== null)),
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
  }, [labels.failedToLoadTilesetImage, locale, mapDocument])

  const tilesetImages = useMemo(
    () => (mapDocument && tilesetImageState.sourcePath === mapDocument.sourcePath ? tilesetImageState.items : {}),
    [mapDocument, tilesetImageState],
  )
  const imageError = useMemo(
    () => (mapDocument && tilesetImageState.sourcePath === mapDocument.sourcePath ? tilesetImageState.error : null),
    [mapDocument, tilesetImageState],
  )
  const visibleLayerIdSet = useMemo(() => new Set(visibleLayerIds), [visibleLayerIds])
  const visibleObjectGroupIdSet = useMemo(() => new Set(visibleObjectGroupIds), [visibleObjectGroupIds])
  const visibleLayers = useMemo(
    () => (mapDocument ? mapDocument.layers.filter((layer) => layer.visible && visibleLayerIdSet.has(layer.id)) : []),
    [mapDocument, visibleLayerIdSet],
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
    () => (mapDocument ? mapDocument.objectGroups.filter((group) => group.visible && visibleObjectGroupIdSet.has(group.id)) : []),
    [mapDocument, visibleObjectGroupIdSet],
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
      width: Math.max(viewportSize.width + VIEWPORT_OVERPAN * 2, canvasLogicalSize.width + VIEWPORT_PADDING * 2),
      height: Math.max(viewportSize.height + VIEWPORT_OVERPAN * 2, canvasLogicalSize.height + VIEWPORT_PADDING * 2),
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
  const tileInteractionEnabled = Boolean(onTileClick)
  const viewportCursorClass = tileInteractionEnabled ? 'cursor-crosshair' : 'cursor-default'

  useEffect(() => {
    if (!pickFlash) {
      return
    }

    const timeout = window.setTimeout(() => {
      setPickFlash((current) => (current?.token === pickFlash.token ? null : current))
    }, 520)

    return () => window.clearTimeout(timeout)
  }, [pickFlash])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    lastHoverRef.current = null
    leftPressStateRef.current = null
    dragStateRef.current = null
    setHoveredTile(null)
    setPickFlash(null)
  }, [mapDocument?.sourcePath])

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
    pendingFocusWorldPointRef.current = focusWorldPoint
      ? {
          worldX: focusWorldPoint.worldX,
          worldY: focusWorldPoint.worldY,
        }
      : initialDefaultViewportState
        ? {
            worldX: initialDefaultViewportState.worldX,
            worldY: initialDefaultViewportState.worldY,
          }
        : null
  }, [focusWorldPoint, initialDefaultViewportState])

  const setZoomAnchorFromClient = useCallback(
    (clientX: number, clientY: number) => {
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
    },
    [canvasOffset.left, canvasOffset.top, zoom],
  )

  const setZoomAnchorFromViewportCenter = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      pendingZoomAnchorRef.current = null
      return
    }

    const rect = viewport.getBoundingClientRect()
    setZoomAnchorFromClient(rect.left + rect.width / 2, rect.top + rect.height / 2)
  }, [setZoomAnchorFromClient])

  const applyManualZoom = useCallback(
    (nextZoom: number, anchor?: { clientX: number; clientY: number }) => {
      if (anchor) {
        setZoomAnchorFromClient(anchor.clientX, anchor.clientY)
      } else {
        setZoomAnchorFromViewportCenter()
      }

      setZoomMode('manual')
      setManualZoom(clampZoom(nextZoom))
      onHoverChange?.(null)
    },
    [onHoverChange, setZoomAnchorFromClient, setZoomAnchorFromViewportCenter],
  )

  const applyFitZoom = useCallback(() => {
    pendingZoomAnchorRef.current = null
    setZoomMode('fit')
    onHoverChange?.(null)
  }, [onHoverChange])

  const zoomInStep = useCallback(() => {
    applyManualZoom(zoom * PAN_ZOOM_TOOLBAR_ZOOM_FACTOR)
  }, [applyManualZoom, zoom])

  const zoomOutStep = useCallback(() => {
    applyManualZoom(zoom / PAN_ZOOM_TOOLBAR_ZOOM_FACTOR)
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

    if (focusWorldPoint || pendingZoomAnchorRef.current || pendingFocusWorldPointRef.current) {
      return
    }

    centerViewport()
  }, [centerViewport, focusWorldPoint, mapDocument, zoomMode])

  useLayoutEffect(() => {
    if (!mapDocument || zoomMode !== 'fit') {
      return
    }

    if (focusWorldPoint || pendingFocusWorldPointRef.current) {
      return
    }

    centerViewport()
  }, [centerViewport, focusWorldPoint, mapDocument, zoom, zoomMode])

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

    const frameId = window.requestAnimationFrame(() => {
      centerViewportOnWorldPoint(pendingFocusWorldPoint.worldX, pendingFocusWorldPoint.worldY)
      pendingFocusWorldPointRef.current = null
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [
    centerViewportOnWorldPoint,
    focusWorldPoint,
    initialDefaultViewportState,
    mapDocument,
    stageSize.height,
    stageSize.width,
    viewportSize.height,
    viewportSize.width,
    zoom,
  ])

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
        event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? viewport.clientHeight : 1
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

        applyManualZoom(zoomRef.current * Math.exp(-delta * PAN_ZOOM_WHEEL_INTENSITY), anchor)
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
      typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
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
        const fillAlpha = interactionTag
          ? Math.max(0.22, Math.min(0.42, group.opacity * 0.42))
          : Math.max(0.12, Math.min(0.28, group.opacity * 0.24))
        const strokeAlpha = interactionTag
          ? Math.max(0.76, Math.min(0.98, group.opacity + 0.12))
          : Math.max(0.48, Math.min(0.82, group.opacity * 0.84))

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
    foregroundLayers,
    mapDisplayOffset.left,
    mapDisplayOffset.top,
    mapDocument,
    refreshToken,
    tilesetImages,
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
      lastHoverRef.current = null
      setHoveredTile(null)
      return
    }

    const info = buildHoverInfo(mapDocument, visibleLayerIdSet, visibleObjectGroupIdSet, worldPoint.pixelX, worldPoint.pixelY)
    lastHoverRef.current = info
    setHoveredTile(tileInteractionEnabled && info ? { tileX: info.tileX, tileY: info.tileY } : null)
    onHoverChange?.(info)
  }

  function handleTilePick(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !mapDocument) {
      return
    }

    const worldPoint = getCanvasWorldPoint(event.clientX, event.clientY)
    if (!worldPoint) {
      return
    }

    const portal = getAtlasPortalAtWorldPoint(worldPoint.pixelX, worldPoint.pixelY)
    if (portal) {
      onAtlasPortalOpen?.(portal.targetMap)
      onHoverChange?.(null)
      setHoveredTile(null)
      return
    }

    const tileX = Math.floor(worldPoint.pixelX / mapDocument.tileWidth)
    const tileY = Math.floor(worldPoint.pixelY / mapDocument.tileHeight)
    if (tileX < 0 || tileY < 0 || tileX >= mapDocument.width || tileY >= mapDocument.height) {
      return
    }

    setPickFlash({ tileX, tileY, token: window.performance.now() })
    onTileClick?.(tileX, tileY)
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

    if (event.button === 0) {
      leftPressStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        button: event.button,
      }
      updateHover(event)
      return
    }

    if (event.button !== 1) {
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
      const leftPressState = leftPressStateRef.current
      leftPressStateRef.current = null
      if (leftPressState && leftPressState.pointerId === event.pointerId) {
        const moved = Math.hypot(event.clientX - leftPressState.startX, event.clientY - leftPressState.startY)
        if (moved <= 6 && leftPressState.button === event.button) {
          handleTilePick(event)
          return
        }
      }
      updateHover(event)
      return
    }

    dragStateRef.current = null
    leftPressStateRef.current = null
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId)
    }
    viewport.style.cursor = ''

    updateHover(event)
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current
    const dragState = dragStateRef.current
    if (!viewport || !dragState || dragState.pointerId !== event.pointerId) {
      const leftPressState = leftPressStateRef.current
      if (leftPressState?.pointerId === event.pointerId) {
        leftPressStateRef.current = null
      }
      return
    }

    dragStateRef.current = null
    leftPressStateRef.current = null
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId)
    }
    viewport.style.cursor = ''
    onHoverChange?.(null)
    setHoveredTile(null)
  }

  function handlePointerLeave() {
    leftPressStateRef.current = null
    if (!dragStateRef.current) {
      onHoverChange?.(null)
      setHoveredTile(null)
    }
  }

  if (!mapDocument) {
    return <MapViewportEmptyState theme={theme} accentColor={accentColor} viewportBackdropStyle={viewportBackdropStyle} />
  }

  const viewportContent = (
    <div className="panel-canvas relative h-full shadow-(--shadow-panel)" style={viewportBackdropStyle}>
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
        <MapViewportStatsChips
          mapDocument={mapDocument}
          tilesetImageCount={Object.keys(tilesetImages).length}
          visibleLayers={visibleLayers}
          visibleObjectGroups={visibleObjectGroups}
          zoom={zoom}
        />
      ) : null}

      {imageError ? <MapViewportImageError error={imageError} /> : null}

      <MapViewportCanvasLayers
        canvasRef={canvasRef}
        foregroundCanvasRef={foregroundCanvasRef}
        viewportSize={viewportSize}
        foregroundLayerCount={foregroundLayers.length}
      />

      {scaleMapOverlayWithViewport && mapOverlay ? (
        <div
          className="pointer-events-none absolute z-2"
          style={{
            left: `${mapDisplayOffset.left}px`,
            top: `${mapDisplayOffset.top}px`,
            width: `${mapDocument.width * mapDocument.tileWidth}px`,
            height: `${mapDocument.height * mapDocument.tileHeight}px`,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
          }}
        >
          {mapOverlay}
        </div>
      ) : null}

      {viewportOverlay ? <div className="pointer-events-none absolute inset-0 z-4">{viewportOverlay}</div> : null}

      <div ref={frameRef} className="absolute inset-0">
        <div
          ref={viewportRef}
          className={`viewport-scroll-hidden h-full w-full ${viewportCursorClass} ${zoomMode === 'fit' ? 'overflow-hidden' : 'overflow-auto'}`}
          data-map-viewport-scroll="true"
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
                boxShadow: tileInteractionEnabled ? `0 0 0 1px ${rgbaFromHex(accentColor, 0.22)}` : undefined,
              }}
            />
            {mapOverlay && !scaleMapOverlayWithViewport ? (
              <div
                className="pointer-events-none absolute z-2"
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
            {tileInteractionEnabled && (hoveredTile || pickFlash) ? (
              <div
                className="pointer-events-none absolute z-5"
                style={{
                  left: `${canvasOffset.left}px`,
                  top: `${canvasOffset.top}px`,
                  width: `${canvasLogicalSize.width}px`,
                  height: `${canvasLogicalSize.height}px`,
                }}
              >
                {hoveredTile ? (
                  <div
                    className="absolute"
                    data-map-tile-hover="true"
                    style={{
                      left: `${hoveredTile.tileX * mapDocument.tileWidth * zoom}px`,
                      top: `${hoveredTile.tileY * mapDocument.tileHeight * zoom}px`,
                      width: `${mapDocument.tileWidth * zoom}px`,
                      height: `${mapDocument.tileHeight * zoom}px`,
                      backgroundColor: rgbaFromHex(accentColor, theme === 'light' ? 0.14 : 0.18),
                      border: `1px solid ${rgbaFromHex(accentColor, 0.88)}`,
                      boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.55), 0 0 0 1px ${rgbaFromHex(accentColor, 0.26)}`,
                    }}
                  />
                ) : null}
                {pickFlash ? (
                  <div
                    className="absolute"
                    data-map-tile-pick="true"
                    style={{
                      left: `${pickFlash.tileX * mapDocument.tileWidth * zoom}px`,
                      top: `${pickFlash.tileY * mapDocument.tileHeight * zoom}px`,
                      width: `${mapDocument.tileWidth * zoom}px`,
                      height: `${mapDocument.tileHeight * zoom}px`,
                      backgroundColor: rgbaFromHex(accentColor, theme === 'light' ? 0.22 : 0.26),
                      border: `2px solid ${rgbaFromHex(accentColor, 0.98)}`,
                      boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.78), 0 0 0 3px ${rgbaFromHex(accentColor, 0.2)}`,
                    }}
                  />
                ) : null}
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
    <MapViewportContextMenu
      viewportContent={viewportContent}
      contextMenuHover={contextMenuHover}
      contextMenuExtraItems={contextMenuExtraItems}
      onOpen={() => setContextMenuHover(lastHoverRef.current)}
      onFitZoom={applyFitZoom}
      onOneToOneZoom={() => applyManualZoom(1)}
      onZoomIn={zoomInStep}
      onZoomOut={zoomOutStep}
      onCenterView={centerViewport}
      onResetPan={resetViewportToOrigin}
      onAddObjectHere={onAddObjectHere}
    />
  )
})
