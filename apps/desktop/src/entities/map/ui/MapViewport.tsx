/**
 * @file Map viewport component: the core interactive canvas for editing map
 * documents — tile painting, object placement, overlay rendering, and pan/zoom.
 */

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
import { isLightMarkerObject, stripTileGidFlags } from '@entities/map'
import { createMapTileRect, type MapTileRect } from '../model/tileSelection'
import { resolveTilesetImagePath } from '../lib/assets'
import { getMapContentBounds, getMapPreviewBounds, type MapContentBounds } from '../lib/mapContentBounds'
import type { LocaleCode, ThemeMode } from '@locales/api'
import { appEvent } from '@platform/observability'
import { useEditorCopy } from '@locales/provider'
import { ImageSkeleton } from '@shared/ui/ImageSkeleton'
import { PAN_ZOOM_TOOLBAR_ZOOM_FACTOR, PAN_ZOOM_WHEEL_INTENSITY } from '@shared/lib/viewports'
import type {
  CellOverlayCell,
  FocusedMapObjectTarget,
  MapInspectorHighlight,
  MapObject,
  TileHoverInfo,
  ViewportWorldPoint,
} from '@entities/map'
import type { MapDocument } from '@entities/map'
import {
  VIEWPORT_OVERPAN,
  VIEWPORT_PADDING,
  buildHoverInfo,
  clampZoom,
  getCanvasRenderScale,
  getCanvasViewportRect,
  getDefaultViewportState,
  getObjectBounds,
  getRasterAlphaBounds,
  getTransparentTileGids,
  hitTestMapObject,
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
  MapViewportLightingOverlay,
  MapViewportStatsChips,
} from './MapViewportChrome'
import { bakeWorldLightingCanvas, preloadWorldLightingTextures } from './worldLightingOverlay'
import { drawMapCanvas } from './mapViewportCanvasDraw'
import { GAME_TILE_SIZE, type WorldLightingState } from '../model/lighting'

/** TileData rule objects whose rectangle markers overlay-driven editors hide from the canvas. */
function isRuleTileDataObject(object: MapObject) {
  return object.name === 'TileData' && !isLightMarkerObject(object)
}

type MapViewportProps = {
  mapState: {
    mapDocument: MapDocument | null
    visibleLayerIds: number[]
    visibleObjectGroupIds: number[]
    /**
     * When true, skips rectangle rendering and hit-testing for `TileData`
     * objects that are not light markers — their rules are presented through
     * the overlay mode instead. Defaults to false; other consumers are
     * unaffected.
     */
    hideRuleTileDataObjects?: boolean
  }
  display: {
    locale: LocaleCode
    theme: ThemeMode
    accentColor: string
    showGrid: boolean
    showStatsChips?: boolean
  }
  overlays?: {
    mapOverlay?: ReactNode
    scaleMapOverlayWithViewport?: boolean
    mapOverlayLayer?: 'between' | 'top'
    viewportOverlay?: ReactNode
  }
  lighting?: {
    /** Static world lightmap (time-of-day base + light glows); baked to a multiply overlay over the map. */
    worldLighting?: WorldLightingState | null
    /** Installed Stardew Valley root used to load LooseSprites/Lighting glow textures. */
    gameRootPath?: string | null
  }
  editing?: {
    /**
     * Paint preview: a semi-transparent ghost of the current palette selection
     * rendered at the hovered tile position while a brush/stamp tool is active.
     * Null clears the preview. The tileset image is resolved from the document's
     * tilesets by the viewport (it already loads them for rendering).
     */
    paintPreview?: {
      tilesetName: string
      startIndex: number
      width: number
      height: number
    } | null
    /**
     * Tileset hover preview: a full-sheet image rendered centered over the
     * entire viewport with a dimming backdrop while the user hovers a sheet
     * card in the palette gallery. `mode` true keeps the overlay backdrop
     * always visible (gallery open); `imageSrc` controls the preview image.
     */
    tilesetPreview?: { imageSrc: string | null; mode?: boolean } | null
    /**
     * Cell-rule overlay coloring: colored tiles of the active layer's cell
     * properties, drawn over the map (cell index → display rule). Usually active
     * only while the overlay paint mode is on; the object markers render above it.
     */
    cellOverlay?: { layerId: number; width: number; height: number; cells: Record<number, CellOverlayCell> } | null
    /**
     * Day/night swap highlight: cells with registered DayTiles/NightTiles
     * properties, drawn as purple dashed borders over the map. Independent of
     * the cellOverlay paint mode; null or empty clears the highlight.
     */
    dayNightHighlight?: { width: number; height: number; cells: Array<{ x: number; y: number }> } | null
    /** Persisted tile rectangle drawn over the map when no drag is active. */
    selectedTileRect?: MapTileRect | null
    /**
     * Inspector hover highlight: tile rectangles drawn as dashed accent frames
     * (independent of the active layer) plus object-group markers stroked with
     * the accent color. Null or empty clears the highlight.
     */
    inspectorHighlight?: MapInspectorHighlight | null
  }
  contextMenu?: {
    enabled?: boolean
    /** Adds editor-specific commands using the tile under the context-menu pointer. */
    extraItems?: ReactNode | ((hover: TileHoverInfo | null) => ReactNode)
  }
  fit?: {
    focusWorldPoint?: ViewportWorldPoint | null
    initialZoom?: number | null
    includeHiddenLayers?: boolean
    fitContentBounds?: boolean
    fitContentOptions?: {
      mode?: 'content' | 'preview'
      includeObjects?: boolean
      paddingTiles?: number
      minimumCoverageRatio?: number
      targetAspectRatio?: number
      ignoreTransparentTiles?: boolean
      includeHiddenLayers?: boolean
    }
    fitBounds?: MapContentBounds | null
    fitPadding?: number
    maxFitZoom?: number | null
    minimumFitViewportSize?: number
    viewportOverpan?: number
  }
  /** Enables dragging object-layer markers on the canvas. Coordinates are tile units. */
  objectDrag?: {
    onStart: (objectId: number) => void
    onPreview: (objectId: number, tileX: number, tileY: number) => void
    onEnd: () => void
  }
  actions?: {
    onHoverChange?: (info: TileHoverInfo | null) => void
    onAtlasPortalOpen?: (targetMapName: string) => void
    onZoomChange?: (zoom: number, mode: 'fit' | 'manual') => void
    onExportPng?: () => void
    onAddObjectHere?: (tileX: number, tileY: number) => void
    onTileClick?: (tileX: number, tileY: number) => void
    /** Enables a left-button tile stroke and commits its unique points on pointerup. */
    onTileStroke?: (points: readonly { tileX: number; tileY: number }[]) => void
    /** Receives the accumulated unique points while a tile stroke drags, for live previews. */
    onTileStrokeLive?: (points: readonly { tileX: number; tileY: number }[]) => void
    /** Enables left-button rectangle selection and receives the committed tile bounds. */
    onTileRectSelect?: (rect: MapTileRect) => void
  }
}

type TilesetImageState = {
  sourcePath: string | null
  items: Record<number, LoadedTilesetImage>
  error: string | null
  loading: boolean
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
  /** Scrolls so the given world pixel point lands at the viewport center. */
  centerOnWorldPoint: (worldX: number, worldY: number) => void
  exportPng: () => Promise<string>
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

type ObjectDragState = {
  pointerId: number
  objectId: number
  grabOffsetX: number
  grabOffsetY: number
}

type TileRectDragState = {
  pointerId: number
  startTileX: number
  startTileY: number
  currentTileX: number
  currentTileY: number
}

type TileStrokeDragState = {
  pointerId: number
  points: TilePoint[]
  keys: Set<string>
}

type TilePoint = {
  tileX: number
  tileY: number
}

type PickFlashState = TilePoint & {
  token: number
}

/** Positions the hover-highlight element directly; display:none when tile is null. Pure DOM writes, no React state. */
function positionHoverTileElement(
  element: HTMLDivElement | null,
  tile: TilePoint | null,
  tileWidth: number,
  tileHeight: number,
  zoom: number,
) {
  if (!element) {
    return
  }
  if (!tile) {
    element.style.display = 'none'
    return
  }
  element.style.display = 'block'
  element.style.left = `${tile.tileX * tileWidth * zoom}px`
  element.style.top = `${tile.tileY * tileHeight * zoom}px`
  element.style.width = `${tileWidth * zoom}px`
  element.style.height = `${tileHeight * zoom}px`
}

/** Positions the paint-preview ghost tile at the hovered tile, sized to the palette selection rect. */
function positionPaintPreviewElement(
  element: HTMLDivElement | null,
  tile: TilePoint | null,
  tileWidth: number,
  tileHeight: number,
  zoom: number,
  selectionWidth: number,
  selectionHeight: number,
) {
  if (!element) {
    return
  }
  if (!tile) {
    element.style.display = 'none'
    return
  }
  element.style.display = 'block'
  element.style.left = `${tile.tileX * tileWidth * zoom}px`
  element.style.top = `${tile.tileY * tileHeight * zoom}px`
  element.style.width = `${selectionWidth * tileWidth * zoom}px`
  element.style.height = `${selectionHeight * tileHeight * zoom}px`
}

/** Positions the tile-rect selection element directly from a tile-space rect. Pure DOM writes, no React state. */
function positionTileRectElement(
  element: HTMLDivElement | null,
  rect: MapTileRect | null,
  tileWidth: number,
  tileHeight: number,
  zoom: number,
) {
  if (!element) {
    return
  }
  if (!rect) {
    element.style.display = 'none'
    return
  }
  element.style.display = 'block'
  element.style.left = `${rect.x * tileWidth * zoom}px`
  element.style.top = `${rect.y * tileHeight * zoom}px`
  element.style.width = `${rect.width * tileWidth * zoom}px`
  element.style.height = `${rect.height * tileHeight * zoom}px`
}

type ZoomAnchor = {
  viewportX: number
  viewportY: number
  worldX: number
  worldY: number
}

function sameContentBounds(left: MapContentBounds | null | undefined, right: MapContentBounds | null | undefined) {
  return (
    left === right ||
    (left != null &&
      right != null &&
      left.x === right.x &&
      left.y === right.y &&
      left.width === right.width &&
      left.height === right.height)
  )
}

function includeContentBounds(current: MapContentBounds | null, next: MapContentBounds | null) {
  if (!next) {
    return current
  }

  if (!current) {
    return next
  }

  const left = Math.min(current.x, next.x)
  const top = Math.min(current.y, next.y)
  const right = Math.max(current.x + current.width, next.x + next.width)
  const bottom = Math.max(current.y + current.height, next.y + next.height)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export const MapViewport = forwardRef<MapViewportHandle, MapViewportProps>(function MapViewport(
  { mapState, display, overlays, lighting, editing, contextMenu, fit, objectDrag, actions },
  ref,
) {
  const { mapDocument, visibleLayerIds, visibleObjectGroupIds, hideRuleTileDataObjects = false } = mapState
  const { locale, theme, accentColor, showGrid, showStatsChips = true } = display
  const { mapOverlay, scaleMapOverlayWithViewport = false, mapOverlayLayer = 'between', viewportOverlay } = overlays ?? {}
  const { worldLighting = null, gameRootPath = null } = lighting ?? {}
  const {
    paintPreview = null,
    tilesetPreview = null,
    cellOverlay,
    dayNightHighlight = null,
    selectedTileRect = null,
    inspectorHighlight = null,
  } = editing ?? {}
  const { enabled: contextMenuEnabled = true, extraItems: contextMenuExtraItems } = contextMenu ?? {}
  const {
    focusWorldPoint,
    initialZoom = null,
    includeHiddenLayers = false,
    fitContentBounds = false,
    fitContentOptions = {},
    fitBounds: fitBoundsOverride = null,
    fitPadding = VIEWPORT_PADDING,
    maxFitZoom = null,
    minimumFitViewportSize = 96,
    viewportOverpan = VIEWPORT_OVERPAN,
  } = fit ?? {}
  const {
    onHoverChange,
    onAtlasPortalOpen,
    onZoomChange,
    onExportPng,
    onAddObjectHere,
    onTileClick,
    onTileStroke,
    onTileStrokeLive,
    onTileRectSelect,
  } = actions ?? {}
  const labels = useEditorCopy().viewportLabels
  const initialDefaultViewportState = useMemo(() => getDefaultViewportState(mapDocument), [mapDocument])
  const resolvedInitialZoom = clampZoom(initialZoom ?? initialDefaultViewportState?.zoom ?? 1)
  const defaultFocusWorldPoint = useMemo(
    () =>
      !fitContentBounds && initialDefaultViewportState
        ? {
            worldX: initialDefaultViewportState.worldX,
            worldY: initialDefaultViewportState.worldY,
          }
        : null,
    [fitContentBounds, initialDefaultViewportState],
  )
  const frameRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const foregroundCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const mapRasterCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const lastHoverRef = useRef<TileHoverInfo | null>(null)
  const [contextMenuHover, setContextMenuHover] = useState<TileHoverInfo | null>(null)
  const foregroundRasterCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  // Cached viewport.getBoundingClientRect() — updated on scroll, resize and
  // after layout-affecting renders. pointermove reads this instead of calling
  // getBoundingClientRect every frame, which forces a synchronous layout
  // flush (reflow) and is a major source of jank during fast mouse travel.
  const viewportRectRef = useRef<DOMRect | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const leftPressStateRef = useRef<LeftPressState | null>(null)
  const [tileRectDrag, setTileRectDrag] = useState<TileRectDragState | null>(null)
  const tileRectDragRef = useRef<TileRectDragState | null>(null)
  // ref-driven tile-rect selection: pointermove updates tileRectDragRef and
  // schedules a rAF that repositions the selection box via direct DOM writes,
  // so dragging costs zero React renders until pointerup commits the rect.
  const tileRectElementRef = useRef<HTMLDivElement | null>(null)
  const tileRectRafIdRef = useRef<number | null>(null)
  const tileStrokeDragRef = useRef<TileStrokeDragState | null>(null)
  const objectDragStateRef = useRef<ObjectDragState | null>(null)
  const pendingZoomAnchorRef = useRef<ZoomAnchor | null>(null)
  const pendingFocusWorldPointRef = useRef<FocusWorldPoint | null>(defaultFocusWorldPoint)
  const wheelZoomFrameRef = useRef<number | null>(null)
  const pendingWheelDeltaRef = useRef(0)
  const zoomRef = useRef(1)
  const [tilesetImageState, setTilesetImageState] = useState<TilesetImageState>({
    sourcePath: null,
    items: {},
    error: null,
    loading: false,
  })
  const [manualZoom, setManualZoom] = useState(() => resolvedInitialZoom)
  const [zoomMode, setZoomMode] = useState<'fit' | 'manual'>(() =>
    fitContentBounds ? 'fit' : initialZoom != null || initialDefaultViewportState ? 'manual' : 'fit',
  )
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [viewportScroll, setViewportScroll] = useState({ left: 0, top: 0 })
  const [refreshToken, setRefreshToken] = useState(0)
  // Animation clock lives in a ref so the rAF loop can advance it without
  // triggering React re-renders 60 times per second. The rasterize + canvas
  // draw functions read this ref directly and are invoked from the same rAF
  // callback, keeping animation playback entirely off the React render path.
  const animationTimeRef = useRef(0)
  const [renderedContentBounds, setRenderedContentBounds] = useState<MapContentBounds | null | undefined>(undefined)
  const [highlightedObjectTarget, setHighlightedObjectTarget] = useState<FocusedMapObjectTarget | null>(null)
  // Ref-driven hover highlight: positioned via direct DOM writes on pointermove
  // so mouse travel costs zero React renders. lastHoverTileRef keeps the tile
  // for repositioning after zoom/document changes.
  const hoverTileElementRef = useRef<HTMLDivElement | null>(null)
  const paintPreviewElementRef = useRef<HTMLDivElement | null>(null)
  const lastHoverTileRef = useRef<TilePoint | null>(null)
  // rAF-coalesced hover updates: pointermove stores the latest event and
  // schedules a single rAF that runs buildHoverInfo + onHoverChange at most
  // once per frame. A tile-coordinate debounce skips the expensive hit
  // detection when the pointer stays within the same tile.
  const pendingHoverEventRef = useRef<PointerEvent<HTMLDivElement> | null>(null)
  const hoverRafIdRef = useRef<number | null>(null)
  const [pickFlash, setPickFlash] = useState<PickFlashState | null>(null)
  const tilesetLoadKey = mapDocument
    ? JSON.stringify({
        sourcePath: mapDocument.sourcePath,
        tilesets: mapDocument.tilesets.map((tileset) => ({
          firstGid: tileset.firstGid,
          imagePath: tileset.imagePath,
          imageSource: tileset.imageSource,
          tileWidth: tileset.tileWidth,
          tileHeight: tileset.tileHeight,
          tileCount: tileset.tileCount,
          columns: tileset.columns,
          imageWidth: tileset.imageWidth,
          imageHeight: tileset.imageHeight,
        })),
      })
    : null
  const tilesetLoadDocument = useMemo(() => mapDocument, [tilesetLoadKey])

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
      const viewport = viewportRef.current
      viewportRectRef.current = viewport ? viewport.getBoundingClientRect() : null
    })

    resizeObserver.observe(frame)
    setViewportSize({
      width: frame.clientWidth,
      height: frame.clientHeight,
    })
    const viewport = viewportRef.current
    viewportRectRef.current = viewport ? viewport.getBoundingClientRect() : null

    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    if (!tilesetLoadDocument) {
      return
    }

    let disposed = false

    setTilesetImageState((current) => ({ ...current, sourcePath: tilesetLoadDocument.sourcePath, loading: true }))

    void (async () => {
      try {
        const results = await Promise.allSettled(
          tilesetLoadDocument.tilesets.map(async (tileset) => {
            const imagePath = resolveTilesetImagePath(tilesetLoadDocument, tileset, gameRootPath)
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

        const entries: Array<readonly [number, LoadedTilesetImage]> = []
        const errors: string[] = []
        for (const result of results) {
          if (result.status === 'fulfilled') {
            if (result.value) {
              entries.push(result.value)
            }
          } else {
            errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
          }
        }

        setTilesetImageState({
          sourcePath: tilesetLoadDocument.sourcePath,
          items: Object.fromEntries(entries),
          error: errors.length > 0 ? errors.join('\n') : null,
          loading: false,
        })
      } catch (error) {
        if (!disposed) {
          appEvent('warning', 'Failed to load map tileset images')
            .error(error)
            .context({ source: 'map-viewport', operation: 'load-tileset-images' })
            .emit({ notify: false })
          setTilesetImageState({
            sourcePath: tilesetLoadDocument.sourcePath,
            items: {},
            error: error instanceof Error ? error.message : String(error),
            loading: false,
          })
        }
      }
    })()

    return () => {
      disposed = true
    }
  }, [gameRootPath, labels.failedToLoadTilesetImage, locale, tilesetLoadDocument])

  const tilesetImages = useMemo(
    () => (mapDocument && tilesetImageState.sourcePath === mapDocument.sourcePath ? tilesetImageState.items : {}),
    [mapDocument, tilesetImageState],
  )
  const sortedTilesets = useMemo(
    () => (mapDocument ? [...mapDocument.tilesets].sort((left, right) => left.firstGid - right.firstGid) : []),
    [mapDocument],
  )
  const imageError = useMemo(
    () => (mapDocument && tilesetImageState.sourcePath === mapDocument.sourcePath ? tilesetImageState.error : null),
    [mapDocument, tilesetImageState],
  )
  const tilesetLoading = useMemo(
    () => Boolean(mapDocument && tilesetImageState.sourcePath === mapDocument.sourcePath && tilesetImageState.loading),
    [mapDocument, tilesetImageState],
  )
  // Callers rebuild these id arrays every render; key the memoized sets on
  // their contents so downstream layer memos and the raster-bake effect only
  // recompute when visibility actually changes.
  const visibleLayerIdsKey = visibleLayerIds.join('')
  const visibleObjectGroupIdsKey = visibleObjectGroupIds.join('')
  const visibleLayerIdSet = useMemo(() => new Set(visibleLayerIdsKey ? visibleLayerIdsKey.split('').map(Number) : []), [visibleLayerIdsKey])
  const visibleObjectGroupIdSet = useMemo(
    () => new Set(visibleObjectGroupIdsKey ? visibleObjectGroupIdsKey.split('').map(Number) : []),
    [visibleObjectGroupIdsKey],
  )
  const visibleLayers = useMemo(
    () =>
      mapDocument ? mapDocument.layers.filter((layer) => (includeHiddenLayers || layer.visible) && visibleLayerIdSet.has(layer.id)) : [],
    [includeHiddenLayers, mapDocument, visibleLayerIdSet],
  )
  // Pre-compute the set of animated-tile gids (firstGid + tileId) so the
  // viewport-visibility scan below stays a cheap Set lookup instead of
  // re-reading every tileset's animation table per tile.
  const animatedTileGidSet = useMemo(() => {
    if (!mapDocument) return null
    const set = new Set<number>()
    for (const tileset of mapDocument.tilesets) {
      for (const tileId of Object.keys(tileset.animations)) {
        set.add(tileset.firstGid + Number(tileId))
      }
    }
    return set.size > 0 ? set : null
  }, [mapDocument])
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
  const transparentTileGids = useMemo(
    () => (fitContentBounds && fitContentOptions.ignoreTransparentTiles ? getTransparentTileGids(sortedTilesets, tilesetImages) : null),
    [fitContentBounds, fitContentOptions.ignoreTransparentTiles, sortedTilesets, tilesetImages],
  )
  const fitBounds = useMemo(() => {
    if (fitBoundsOverride) {
      return fitBoundsOverride
    }
    if (!fitContentBounds || !mapDocument) {
      return null
    }

    const options = {
      layerIds: visibleLayerIds,
      objectGroupIds: visibleObjectGroupIds,
      includeObjects: fitContentOptions.includeObjects,
      includeHiddenLayers: fitContentOptions.includeHiddenLayers,
      paddingTiles: fitContentOptions.paddingTiles ?? 1,
      transparentTileGids: transparentTileGids ?? undefined,
    }

    if (renderedContentBounds !== undefined) {
      return renderedContentBounds
    }

    return fitContentOptions.mode === 'preview'
      ? getMapPreviewBounds(mapDocument, {
          ...options,
          minimumCoverageRatio: fitContentOptions.minimumCoverageRatio,
          targetAspectRatio: fitContentOptions.targetAspectRatio,
        })
      : getMapContentBounds(mapDocument, options)
  }, [
    fitBoundsOverride,
    fitContentBounds,
    fitContentOptions.includeObjects,
    fitContentOptions.includeHiddenLayers,
    fitContentOptions.minimumCoverageRatio,
    fitContentOptions.mode,
    fitContentOptions.paddingTiles,
    fitContentOptions.targetAspectRatio,
    mapDocument,
    renderedContentBounds,
    transparentTileGids,
    visibleLayerIds,
    visibleObjectGroupIds,
  ])
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
        backgroundSize: ['6.25rem 6.25rem', '6.25rem 6.25rem', '1.25rem 1.25rem', '1.25rem 1.25rem'].join(', '),
        backgroundPosition: ['-0.0625rem -0.0625rem', '-0.0625rem -0.0625rem', '-0.0625rem -0.0625rem', '-0.0625rem -0.0625rem'].join(', '),
      } satisfies CSSProperties
    }

    return {
      backgroundColor: '#09111d',
      backgroundImage: [
        `linear-gradient(${rgbaFromHex(accentColor, 0.16)} 1px, transparent 1px)`,
        `linear-gradient(90deg, ${rgbaFromHex(accentColor, 0.16)} 1px, transparent 1px)`,
        `linear-gradient(${rgbaFromHex(accentColor, 0.05)} 1px, transparent 1px)`,
        `linear-gradient(90deg, ${rgbaFromHex(accentColor, 0.05)} 1px, transparent 1px)`,
      ].join(', '),
      backgroundSize: ['6.25rem 6.25rem', '6.25rem 6.25rem', '1.25rem 1.25rem', '1.25rem 1.25rem'].join(', '),
      backgroundPosition: ['-0.0625rem -0.0625rem', '-0.0625rem -0.0625rem', '-0.0625rem -0.0625rem', '-0.0625rem -0.0625rem'].join(', '),
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

    const mapWidth = fitBounds?.width ?? document.width * document.tileWidth
    const mapHeight = fitBounds?.height ?? document.height * document.tileHeight
    const availableWidth = Math.max(minimumFitViewportSize, viewportSize.width - fitPadding * 2)
    const availableHeight = Math.max(minimumFitViewportSize, viewportSize.height - fitPadding * 2)
    const nextZoom = Math.min(availableWidth / mapWidth, availableHeight / mapHeight)
    return clampZoom(maxFitZoom === null ? nextZoom : Math.min(nextZoom, maxFitZoom))
  }

  const zoom = mapDocument && zoomMode === 'fit' ? getFitZoom(mapDocument) : manualZoom
  const directFitDisplayRect = useMemo(() => {
    if (!fitContentBounds || zoomMode !== 'fit' || !fitBounds || !viewportSize.width || !viewportSize.height) {
      return null
    }

    const width = fitBounds.width * zoom
    const height = fitBounds.height * zoom
    return {
      left: (viewportSize.width - width) / 2,
      top: (viewportSize.height - height) / 2,
      width,
      height,
    }
  }, [fitBounds, fitContentBounds, viewportSize.height, viewportSize.width, zoom, zoomMode])
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
  const stageSize = useMemo(() => {
    if (zoomMode === 'fit' && fitBounds) {
      return {
        width: Math.max(1, viewportSize.width + viewportOverpan * 2),
        height: Math.max(1, viewportSize.height + viewportOverpan * 2),
      }
    }

    return {
      width: Math.max(viewportSize.width + viewportOverpan * 2, canvasLogicalSize.width + fitPadding * 2),
      height: Math.max(viewportSize.height + viewportOverpan * 2, canvasLogicalSize.height + fitPadding * 2),
    }
  }, [
    canvasLogicalSize.height,
    canvasLogicalSize.width,
    fitBounds,
    fitPadding,
    viewportOverpan,
    viewportSize.height,
    viewportSize.width,
    zoomMode,
  ])
  const canvasOffset = useMemo(() => {
    if (zoomMode === 'fit' && fitBounds && viewportSize.width > 0 && viewportSize.height > 0) {
      return {
        left: viewportSize.width / 2 - (fitBounds.x + fitBounds.width / 2) * zoom,
        top: viewportSize.height / 2 - (fitBounds.y + fitBounds.height / 2) * zoom,
      }
    }

    return {
      left: (stageSize.width - canvasLogicalSize.width) / 2,
      top: (stageSize.height - canvasLogicalSize.height) / 2,
    }
  }, [
    canvasLogicalSize.height,
    canvasLogicalSize.width,
    fitBounds,
    stageSize.height,
    stageSize.width,
    viewportSize.height,
    viewportSize.width,
    zoom,
    zoomMode,
  ])
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
  // Whether any animated tile is currently inside the viewport. Scans the
  // visible tile range of visible layers; bails on the first animated gid so
  // the cost is proportional to the distance to the first animated tile (and
  // zero when the map has no animations at all). Drives the animation clock
  // so scrolling away from animated tiles stops the 60fps raster loop.
  const viewportHasAnimatedTiles = useMemo(() => {
    if (!mapDocument || !animatedTileGidSet || visibleLayers.length === 0) return false
    const tileWidth = mapDocument.tileWidth
    const tileHeight = mapDocument.tileHeight
    const worldLeft = directFitDisplayRect && fitBounds ? fitBounds.x : viewportCanvasRect.left / zoom
    const worldTop = directFitDisplayRect && fitBounds ? fitBounds.y : viewportCanvasRect.top / zoom
    const worldWidth = directFitDisplayRect && fitBounds ? fitBounds.width : viewportCanvasRect.width / zoom
    const worldHeight = directFitDisplayRect && fitBounds ? fitBounds.height : viewportCanvasRect.height / zoom
    if (worldWidth <= 0 || worldHeight <= 0) return false
    const startTileX = Math.max(0, Math.floor(worldLeft / tileWidth))
    const startTileY = Math.max(0, Math.floor(worldTop / tileHeight))
    const endTileX = Math.min(mapDocument.width, Math.ceil((worldLeft + worldWidth) / tileWidth))
    const endTileY = Math.min(mapDocument.height, Math.ceil((worldTop + worldHeight) / tileHeight))
    for (const layer of visibleLayers) {
      for (let tileY = startTileY; tileY < endTileY; tileY += 1) {
        const rowBase = tileY * mapDocument.width
        for (let tileX = startTileX; tileX < endTileX; tileX += 1) {
          const gid = stripTileGidFlags(layer.gids[rowBase + tileX] >>> 0)
          if (gid !== 0 && animatedTileGidSet.has(gid)) return true
        }
      }
    }
    return false
  }, [animatedTileGidSet, directFitDisplayRect, fitBounds, mapDocument, viewportCanvasRect, visibleLayers, zoom])
  // The lighting model works in game pixels (64px per tile); the baked overlay
  // stretches over the map display rect, so the spaces stay aligned.
  // Glow textures decode asynchronously; the version bump re-bakes once ready.
  const [lightingTexturesVersion, setLightingTexturesVersion] = useState(0)
  useEffect(() => preloadWorldLightingTextures(gameRootPath, () => setLightingTexturesVersion((version) => version + 1)), [gameRootPath])
  const bakedWorldLighting = useMemo(
    () =>
      mapDocument && worldLighting
        ? bakeWorldLightingCanvas(mapDocument.width * GAME_TILE_SIZE, mapDocument.height * GAME_TILE_SIZE, worldLighting, gameRootPath)
        : null,
    [mapDocument, worldLighting, gameRootPath, lightingTexturesVersion],
  )
  const tileInteractionEnabled = Boolean(onTileClick || onTileRectSelect || onTileStroke)
  const viewportCursorClass = tileInteractionEnabled ? 'cursor-crosshair' : 'cursor-default'
  const activeTileRect =
    tileRectDrag && mapDocument
      ? createMapTileRect(
          { x: tileRectDrag.startTileX, y: tileRectDrag.startTileY },
          { x: tileRectDrag.currentTileX, y: tileRectDrag.currentTileY },
          mapDocument,
        )
      : selectedTileRect

  useEffect(() => {
    if (!pickFlash) {
      return
    }

    const timeout = window.setTimeout(() => {
      setPickFlash((current) => (current?.token === pickFlash.token ? null : current))
    }, 520)

    return () => window.clearTimeout(timeout)
  }, [pickFlash])

  // Resolve the paint-preview ghost tile: find the tileset image by name, then
  // compute the background crop for the palette selection rect.
  const paintPreviewStyle = useMemo(() => {
    if (!paintPreview || !mapDocument) return null
    const tileset = mapDocument.tilesets.find((candidate) => candidate.name === paintPreview.tilesetName)
    if (!tileset) return null
    const loaded = Object.values(tilesetImages).find((entry) => entry.tileset === tileset)
    if (!loaded) return null
    const spacing = tileset.spacing ?? 0
    const margin = tileset.margin ?? 0
    const srcCol = paintPreview.startIndex % tileset.columns
    const srcRow = Math.floor(paintPreview.startIndex / tileset.columns)
    const cropX = margin + srcCol * (tileset.tileWidth + spacing)
    const cropY = margin + srcRow * (tileset.tileHeight + spacing)
    return {
      backgroundImage: `url(${JSON.stringify(loaded.image.src)})`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: `${loaded.image.naturalWidth * zoom}px ${loaded.image.naturalHeight * zoom}px`,
      backgroundPosition: `-${cropX * zoom}px -${cropY * zoom}px`,
    } as const
  }, [paintPreview, mapDocument, tilesetImages, zoom])

  // Resolve the tileset hover preview: the caller provides the image src
  // (already loaded as a data URL by the gallery). We decode it to get
  // natural dimensions, then scale to fit ~80% of the canvas, centered.
  // Tileset preview overlay: backdrop stays visible while gallery mode is on;
  // the <img> src swaps directly without remounting, so hovering between sheets
  // doesn't flash. We track the frame element size and the decoded image's
  // natural dimensions to compute a display size that fills up to 90% of the
  // frame, scaling up small sheets for a clear preview.
  const showPreviewOverlay = tilesetPreview?.mode === true
  const previewImageSrc = tilesetPreview?.imageSrc ?? null
  const [previewImageSize, setPreviewImageSize] = useState<{ w: number; h: number } | null>(null)
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    if (!showPreviewOverlay) {
      setPreviewImageSize(null)
      return
    }
    const frame = frameRef.current
    if (!frame) return
    const update = () => setFrameSize({ w: frame.clientWidth, h: frame.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [showPreviewOverlay])

  useEffect(() => {
    if (!previewImageSrc) {
      setPreviewImageSize(null)
      return
    }
    const img = new Image()
    img.onload = () => setPreviewImageSize({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => setPreviewImageSize(null)
    img.src = previewImageSrc
  }, [previewImageSrc])

  const previewDisplaySize = useMemo(() => {
    if (!previewImageSize || frameSize.w === 0 || frameSize.h === 0) return null
    const maxW = frameSize.w * 0.9
    const maxH = frameSize.h * 0.9
    const scale = Math.min(maxW / previewImageSize.w, maxH / previewImageSize.h)
    return { w: previewImageSize.w * scale, h: previewImageSize.h * scale }
  }, [previewImageSize, frameSize])

  // Re-position the ref-driven hover highlight after zoom/document changes;
  // pointermove writes the same styles directly without involving React.
  useEffect(() => {
    const tile = tileInteractionEnabled ? lastHoverTileRef.current : null
    positionHoverTileElement(hoverTileElementRef.current, tile, mapDocument?.tileWidth ?? 0, mapDocument?.tileHeight ?? 0, zoom)
    if (paintPreview && paintPreviewStyle && tile) {
      positionPaintPreviewElement(
        paintPreviewElementRef.current,
        tile,
        mapDocument?.tileWidth ?? 0,
        mapDocument?.tileHeight ?? 0,
        zoom,
        paintPreview.width,
        paintPreview.height,
      )
    } else {
      positionPaintPreviewElement(paintPreviewElementRef.current, null, 0, 0, 1, 0, 0)
    }
  }, [mapDocument, tileInteractionEnabled, zoom, paintPreview, paintPreviewStyle])

  // Re-apply paint preview display after every render (animation clock causes
  // frequent re-renders that reset inline display, hiding the preview).
  useLayoutEffect(() => {
    if (!paintPreview || !paintPreviewStyle) {
      positionPaintPreviewElement(paintPreviewElementRef.current, null, 0, 0, 1, 0, 0)
    } else {
      const tile = tileInteractionEnabled ? lastHoverTileRef.current : null
      positionPaintPreviewElement(
        paintPreviewElementRef.current,
        tile,
        mapDocument?.tileWidth ?? 0,
        mapDocument?.tileHeight ?? 0,
        zoom,
        paintPreview.width,
        paintPreview.height,
      )
    }
  })

  // Keep the cached viewport rect fresh after layout-affecting renders (zoom
  // changes, document swaps, stage size adjustments). scroll and resize are
  // handled by their own listeners; this covers the remaining cases so
  // pointermove never needs to call getBoundingClientRect synchronously.
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    viewportRectRef.current = viewport ? viewport.getBoundingClientRect() : null
  })

  // Re-position the ref-driven tile-rect selection after zoom/document changes;
  // pointermove writes the same styles directly without involving React.
  useEffect(() => {
    if (!mapDocument) {
      positionTileRectElement(tileRectElementRef.current, null, 0, 0, 1)
      return
    }
    const drag = tileRectDragRef.current
    const rect = drag
      ? createMapTileRect({ x: drag.startTileX, y: drag.startTileY }, { x: drag.currentTileX, y: drag.currentTileY }, mapDocument)
      : selectedTileRect
    positionTileRectElement(tileRectElementRef.current, rect, mapDocument.tileWidth, mapDocument.tileHeight, zoom)
  }, [mapDocument, selectedTileRect, zoom])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useLayoutEffect(() => {
    if (!fitContentBounds) {
      return
    }

    pendingZoomAnchorRef.current = null
    pendingFocusWorldPointRef.current = null
    setZoomMode((current) => (current === 'fit' ? current : 'fit'))
  }, [fitContentBounds, mapDocument?.sourcePath])

  useEffect(() => {
    lastHoverRef.current = null
    leftPressStateRef.current = null
    dragStateRef.current = null
    objectDragStateRef.current = null
    lastHoverTileRef.current = null
    positionHoverTileElement(hoverTileElementRef.current, null, 0, 0, 1)
    setPickFlash(null)
    setRenderedContentBounds(undefined)
  }, [mapDocument?.sourcePath])

  // Cancel any pending rAF hover/tile-rect updates on unmount so the callbacks
  // never run after the viewport (and its refs) are gone.
  useEffect(
    () => () => {
      cancelPendingHoverRaf()
      cancelPendingTileRectRaf()
    },
    [],
  )

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    const syncScrollState = () => {
      viewportRectRef.current = viewport.getBoundingClientRect()
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

  // Animation clock: drive periodic re-rasterization only while animated
  // tiles are visible in the viewport. Scrolling away from animated tiles
  // stops the 60fps raster loop entirely instead of keeping it running for
  // off-screen content. The clock lives in a ref and the rAF callback invokes
  // rasterize + canvas draw directly, so animation playback never triggers
  // React re-renders.
  useEffect(() => {
    if (!mapDocument || !viewportHasAnimatedTiles) return
    const startTime = performance.now()
    let rafId = 0
    let lastTick = 0
    const tick = (now: number) => {
      const elapsed = now - startTime
      // Throttle to ~60fps max; most animations are 100-250ms so this is plenty.
      if (now - lastTick >= 16) {
        lastTick = now
        animationTimeRef.current = elapsed
        performRasterizeRef.current()
        performCanvasDrawRef.current()
        performForegroundCanvasDrawRef.current()
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [mapDocument, viewportHasAnimatedTiles])

  // Refs holding the latest rasterize / canvas-draw closures so the animation
  // rAF loop can invoke them directly without going through React state.
  const performRasterizeRef = useRef<() => void>(() => {})
  const performCanvasDrawRef = useRef<() => void>(() => {})
  const performForegroundCanvasDrawRef = useRef<() => void>(() => {})

  function performRasterize() {
    if (!mapDocument) {
      mapRasterCanvasRef.current = null
      foregroundRasterCanvasRef.current = null
      return
    }

    const backgroundRasterCanvas = mapRasterCanvasRef.current ?? document.createElement('canvas')
    const foregroundRasterCanvas = foregroundRasterCanvasRef.current ?? document.createElement('canvas')
    mapRasterCanvasRef.current = backgroundRasterCanvas
    foregroundRasterCanvasRef.current = foregroundRasterCanvas

    rasterizeTileLayers(backgroundRasterCanvas, mapDocument, backgroundLayers, sortedTilesets, tilesetImages, {
      animationTime: animationTimeRef.current,
    })
    rasterizeTileLayers(foregroundRasterCanvas, mapDocument, foregroundLayers, sortedTilesets, tilesetImages, {
      animationTime: animationTimeRef.current,
    })

    const nextRenderedContentBounds =
      fitContentBounds && fitContentOptions.ignoreTransparentTiles
        ? includeContentBounds(getRasterAlphaBounds(backgroundRasterCanvas), getRasterAlphaBounds(foregroundRasterCanvas))
        : undefined
    setRenderedContentBounds((current) => (sameContentBounds(current, nextRenderedContentBounds) ? current : nextRenderedContentBounds))
  }
  performRasterizeRef.current = performRasterize

  useLayoutEffect(() => {
    performRasterize()
  }, [
    backgroundLayers,
    fitContentBounds,
    fitContentOptions.ignoreTransparentTiles,
    foregroundLayers,
    mapDocument,
    sortedTilesets,
    tilesetImages,
  ])

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
      : defaultFocusWorldPoint
  }, [defaultFocusWorldPoint, focusWorldPoint])

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

  const exportPng = useCallback(async () => {
    if (!mapDocument) {
      throw new Error(labels.failedToExportPng)
    }

    const width = mapDocument.width * mapDocument.tileWidth
    const height = mapDocument.height * mapDocument.tileHeight
    const backgroundRaster = mapRasterCanvasRef.current
    const foregroundRaster = foregroundRasterCanvasRef.current
    if (!backgroundRaster || !foregroundRaster || width < 1 || height < 1) {
      throw new Error(labels.failedToExportPng)
    }

    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = width
    exportCanvas.height = height
    const context = exportCanvas.getContext('2d')
    if (!context) {
      throw new Error(labels.failedToExportPng)
    }

    context.imageSmoothingEnabled = false
    context.drawImage(backgroundRaster, 0, 0)
    context.drawImage(foregroundRaster, 0, 0)

    const blob = await new Promise<Blob | null>((resolve) => exportCanvas.toBlob(resolve, 'image/png'))
    if (!blob) {
      throw new Error(labels.failedToExportPng)
    }

    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    const chunkSize = 0x8000
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
    }
    return btoa(binary)
  }, [labels.failedToExportPng, mapDocument])

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
      centerOnWorldPoint: centerViewportOnWorldPoint,
      exportPng,
    }),
    [
      applyFitZoom,
      applyManualZoom,
      centerViewport,
      centerViewportOnWorldPoint,
      exportPng,
      focusObjectTarget,
      resetViewportToOrigin,
      zoomInStep,
      zoomOutStep,
    ],
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
  }, [centerViewport, fitBounds, focusWorldPoint, mapDocument, viewportSize.height, viewportSize.width, zoom, zoomMode])

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

  function performCanvasDraw() {
    const canvas = canvasRef.current
    if (!canvas) return
    drawMapCanvas({
      canvas,
      rasterCanvas: mapRasterCanvasRef.current,
      mapDocument,
      viewportSize,
      directFitDisplayRect,
      fitBounds,
      viewportCanvasRect,
      zoom,
      mapDisplayOffset,
      canvasLogicalSize,
      theme,
      accentColor,
      showGrid,
      hideRuleTileDataObjects,
      cellOverlay,
      dayNightHighlight,
      inspectorHighlight,
      visibleObjectGroups,
      atlasPlacements,
      atlasPortals,
      atlasWarpRoutes,
      highlightedObject,
    })
  }
  performCanvasDrawRef.current = performCanvasDraw

  useLayoutEffect(() => {
    performCanvasDraw()
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
    directFitDisplayRect,
    fitBounds,
    hideRuleTileDataObjects,
    mapDisplayOffset.left,
    mapDisplayOffset.top,
    refreshToken,
    cellOverlay,
    dayNightHighlight,
    inspectorHighlight,
  ])

  function performForegroundCanvasDraw() {
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
    const worldLeft = directFitDisplayRect && fitBounds ? fitBounds.x : viewportCanvasRect.left / zoom
    const worldTop = directFitDisplayRect && fitBounds ? fitBounds.y : viewportCanvasRect.top / zoom
    const worldWidth = directFitDisplayRect && fitBounds ? fitBounds.width : viewportCanvasRect.width / zoom
    const worldHeight = directFitDisplayRect && fitBounds ? fitBounds.height : viewportCanvasRect.height / zoom

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
    const destinationLeft = directFitDisplayRect?.left ?? mapDisplayOffset.left + viewportCanvasRect.left
    const destinationTop = directFitDisplayRect?.top ?? mapDisplayOffset.top + viewportCanvasRect.top
    const destinationWidth = directFitDisplayRect?.width ?? viewportCanvasRect.width
    const destinationHeight = directFitDisplayRect?.height ?? viewportCanvasRect.height
    context.rect(destinationLeft, destinationTop, destinationWidth, destinationHeight)
    context.clip()
    context.drawImage(
      rasterCanvas,
      worldLeft,
      worldTop,
      worldWidth,
      worldHeight,
      destinationLeft,
      destinationTop,
      destinationWidth,
      destinationHeight,
    )
    context.restore()
  }
  performForegroundCanvasDrawRef.current = performForegroundCanvasDraw

  useLayoutEffect(() => {
    performForegroundCanvasDraw()
  }, [
    directFitDisplayRect,
    fitBounds,
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
      lastHoverTileRef.current = null
      positionHoverTileElement(hoverTileElementRef.current, null, 0, 0, 1)
      positionPaintPreviewElement(paintPreviewElementRef.current, null, 0, 0, 1, 0, 0)
      return
    }

    if (!objectDragStateRef.current && !tileRectDragRef.current && !tileStrokeDragRef.current && !dragStateRef.current) {
      const viewport = viewportRef.current
      if (viewport) {
        if (objectDrag) {
          const hit = hitTestMapObject(
            mapDocument,
            visibleObjectGroupIdSet,
            worldPoint.pixelX,
            worldPoint.pixelY,
            hideRuleTileDataObjects ? { skipObject: isRuleTileDataObject } : undefined,
          )
          viewport.style.cursor = hit ? 'grab' : ''
        } else {
          viewport.style.cursor = ''
        }
      }
    }

    const info = buildHoverInfo(mapDocument, visibleLayerIdSet, visibleObjectGroupIdSet, worldPoint.pixelX, worldPoint.pixelY)
    lastHoverRef.current = info
    const nextTile = tileInteractionEnabled && info ? { tileX: info.tileX, tileY: info.tileY } : null
    lastHoverTileRef.current = nextTile
    positionHoverTileElement(hoverTileElementRef.current, nextTile, mapDocument.tileWidth, mapDocument.tileHeight, zoomRef.current)
    if (paintPreview && nextTile) {
      positionPaintPreviewElement(
        paintPreviewElementRef.current,
        nextTile,
        mapDocument.tileWidth,
        mapDocument.tileHeight,
        zoomRef.current,
        paintPreview.width,
        paintPreview.height,
      )
    } else {
      positionPaintPreviewElement(paintPreviewElementRef.current, null, 0, 0, 1, 0, 0)
    }
    onHoverChange?.(info)
  }

  // Runs the hover update for the latest pending pointermove, coalesced to
  // one rAF. A tile-coordinate debounce skips buildHoverInfo + hitTestMapObject
  // + onHoverChange when the pointer stays within the same tile, so mouse
  // travel inside a single tile costs only a cheap coordinate computation.
  function flushHoverUpdate() {
    hoverRafIdRef.current = null
    const event = pendingHoverEventRef.current
    pendingHoverEventRef.current = null
    if (!event) return
    const worldPoint = getCanvasWorldPoint(event.clientX, event.clientY)
    if (!mapDocument || !worldPoint) {
      lastHoverRef.current = null
      lastHoverTileRef.current = null
      positionHoverTileElement(hoverTileElementRef.current, null, 0, 0, 1)
      positionPaintPreviewElement(paintPreviewElementRef.current, null, 0, 0, 1, 0, 0)
      onHoverChange?.(null)
      return
    }

    // Tile-coordinate debounce: when the pointer hasn't crossed into a new
    // tile, skip all expensive work (hitTest, buildHoverInfo, onHoverChange).
    // The cursor and hover highlight are already correct for this tile.
    const nextTileX = Math.floor(worldPoint.pixelX / mapDocument.tileWidth)
    const nextTileY = Math.floor(worldPoint.pixelY / mapDocument.tileHeight)
    const prevTile = lastHoverTileRef.current
    const sameTile = prevTile !== null && prevTile.tileX === nextTileX && prevTile.tileY === nextTileY
    if (tileInteractionEnabled && sameTile) {
      return
    }

    // Crossed into a new tile: update cursor (hitTest) + hover info + DOM.
    if (!objectDragStateRef.current && !tileRectDragRef.current && !tileStrokeDragRef.current && !dragStateRef.current) {
      const viewport = viewportRef.current
      if (viewport) {
        if (objectDrag) {
          const hit = hitTestMapObject(
            mapDocument,
            visibleObjectGroupIdSet,
            worldPoint.pixelX,
            worldPoint.pixelY,
            hideRuleTileDataObjects ? { skipObject: isRuleTileDataObject } : undefined,
          )
          viewport.style.cursor = hit ? 'grab' : ''
        } else {
          viewport.style.cursor = ''
        }
      }
    }

    const info = buildHoverInfo(mapDocument, visibleLayerIdSet, visibleObjectGroupIdSet, worldPoint.pixelX, worldPoint.pixelY)
    lastHoverRef.current = info
    const nextTile = tileInteractionEnabled && info ? { tileX: info.tileX, tileY: info.tileY } : null
    lastHoverTileRef.current = nextTile
    positionHoverTileElement(hoverTileElementRef.current, nextTile, mapDocument.tileWidth, mapDocument.tileHeight, zoomRef.current)
    if (paintPreview && nextTile) {
      positionPaintPreviewElement(
        paintPreviewElementRef.current,
        nextTile,
        mapDocument.tileWidth,
        mapDocument.tileHeight,
        zoomRef.current,
        paintPreview.width,
        paintPreview.height,
      )
    } else {
      positionPaintPreviewElement(paintPreviewElementRef.current, null, 0, 0, 1, 0, 0)
    }
    onHoverChange?.(info)
  }

  function scheduleHoverUpdate(event: PointerEvent<HTMLDivElement>) {
    pendingHoverEventRef.current = event
    if (hoverRafIdRef.current !== null) return
    hoverRafIdRef.current = requestAnimationFrame(flushHoverUpdate)
  }

  function cancelPendingHoverRaf() {
    if (hoverRafIdRef.current !== null) {
      cancelAnimationFrame(hoverRafIdRef.current)
      hoverRafIdRef.current = null
    }
    pendingHoverEventRef.current = null
  }

  // Repositions the tile-rect selection box from the latest drag ref. Pure
  // DOM writes — no React state, no re-render. Runs inside a rAF so multiple
  // pointermove events in one frame coalesce into a single positioning pass.
  function flushTileRectUpdate() {
    tileRectRafIdRef.current = null
    const drag = tileRectDragRef.current
    if (!drag || !mapDocument) {
      positionTileRectElement(tileRectElementRef.current, null, 0, 0, 1)
      return
    }
    const rect = createMapTileRect({ x: drag.startTileX, y: drag.startTileY }, { x: drag.currentTileX, y: drag.currentTileY }, mapDocument)
    positionTileRectElement(tileRectElementRef.current, rect, mapDocument.tileWidth, mapDocument.tileHeight, zoomRef.current)
  }

  function scheduleTileRectUpdate() {
    if (tileRectRafIdRef.current !== null) return
    tileRectRafIdRef.current = requestAnimationFrame(flushTileRectUpdate)
  }

  function cancelPendingTileRectRaf() {
    if (tileRectRafIdRef.current !== null) {
      cancelAnimationFrame(tileRectRafIdRef.current)
      tileRectRafIdRef.current = null
    }
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
      lastHoverTileRef.current = null
      positionHoverTileElement(hoverTileElementRef.current, null, 0, 0, 1)
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

    // Use the cached rect to avoid forcing a synchronous layout flush on
    // every pointermove. The rect is refreshed on scroll, resize and after
    // layout-affecting renders (see viewportRectRef update sites).
    const rect = viewportRectRef.current ?? viewport.getBoundingClientRect()
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
      if (objectDrag && mapDocument) {
        const point = getCanvasWorldPoint(event.clientX, event.clientY)
        if (point) {
          const hit = hitTestMapObject(
            mapDocument,
            visibleObjectGroupIdSet,
            point.pixelX,
            point.pixelY,
            hideRuleTileDataObjects ? { skipObject: isRuleTileDataObject } : undefined,
          )
          if (hit) {
            objectDragStateRef.current = {
              pointerId: event.pointerId,
              objectId: hit.id,
              grabOffsetX: point.pixelX - hit.x,
              grabOffsetY: point.pixelY - hit.y,
            }
            viewport.setPointerCapture(event.pointerId)
            viewport.style.cursor = 'grabbing'
            objectDrag.onStart(hit.id)
            event.preventDefault()
            return
          }
        }
      }
      if (onTileStroke && mapDocument) {
        const point = getCanvasWorldPoint(event.clientX, event.clientY)
        if (!point || point.tileX < 0 || point.tileY < 0 || point.tileX >= mapDocument.width || point.tileY >= mapDocument.height) {
          return
        }
        tileStrokeDragRef.current = {
          pointerId: event.pointerId,
          points: [{ tileX: point.tileX, tileY: point.tileY }],
          keys: new Set([`${point.tileX}:${point.tileY}`]),
        }
        viewport.setPointerCapture(event.pointerId)
        onTileStrokeLive?.(tileStrokeDragRef.current.points)
        updateHover(event)
        event.preventDefault()
        return
      }
      if (onTileRectSelect && mapDocument) {
        const point = getCanvasWorldPoint(event.clientX, event.clientY)
        if (!point || point.tileX < 0 || point.tileY < 0 || point.tileX >= mapDocument.width || point.tileY >= mapDocument.height) {
          return
        }
        const next: TileRectDragState = {
          pointerId: event.pointerId,
          startTileX: point.tileX,
          startTileY: point.tileY,
          currentTileX: point.tileX,
          currentTileY: point.tileY,
        }
        tileRectDragRef.current = next
        setTileRectDrag(next)
        viewport.setPointerCapture(event.pointerId)
        updateHover(event)
        event.preventDefault()
        return
      }
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

    const objectDragState = objectDragStateRef.current
    if (objectDrag && objectDragState?.pointerId === event.pointerId) {
      const point = getCanvasWorldPoint(event.clientX, event.clientY)
      if (point) {
        const tileWidth = mapDocument.tileWidth || 16
        const tileHeight = mapDocument.tileHeight || 16
        const newLeft = point.pixelX - objectDragState.grabOffsetX
        const newTop = point.pixelY - objectDragState.grabOffsetY
        objectDrag.onPreview(objectDragState.objectId, Math.round(newLeft / tileWidth), Math.round(newTop / tileHeight))
      }
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

    const tileSelection = tileRectDragRef.current
    if (tileSelection?.pointerId === event.pointerId) {
      const point = getCanvasWorldPoint(event.clientX, event.clientY)
      if (point) {
        tileRectDragRef.current = { ...tileSelection, currentTileX: point.tileX, currentTileY: point.tileY }
        scheduleTileRectUpdate()
      }
      scheduleHoverUpdate(event)
      return
    }

    const tileStroke = tileStrokeDragRef.current
    if (tileStroke?.pointerId === event.pointerId) {
      const point = getCanvasWorldPoint(event.clientX, event.clientY)
      if (point && point.tileX >= 0 && point.tileY >= 0 && point.tileX < mapDocument.width && point.tileY < mapDocument.height) {
        const key = `${point.tileX}:${point.tileY}`
        if (!tileStroke.keys.has(key)) {
          tileStroke.keys.add(key)
          tileStroke.points.push({ tileX: point.tileX, tileY: point.tileY })
          onTileStrokeLive?.(tileStroke.points)
        }
      }
      scheduleHoverUpdate(event)
      return
    }

    scheduleHoverUpdate(event)
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    cancelPendingHoverRaf()
    cancelPendingTileRectRaf()
    const viewport = viewportRef.current
    const objectDragState = objectDragStateRef.current
    if (objectDrag && objectDragState?.pointerId === event.pointerId) {
      objectDragStateRef.current = null
      if (viewport) {
        if (viewport.hasPointerCapture(event.pointerId)) {
          viewport.releasePointerCapture(event.pointerId)
        }
        viewport.style.cursor = ''
      }
      objectDrag.onEnd()
      updateHover(event)
      return
    }
    const tileStroke = tileStrokeDragRef.current
    if (viewport && tileStroke?.pointerId === event.pointerId) {
      tileStrokeDragRef.current = null
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId)
      onTileStroke?.(tileStroke.points)
      updateHover(event)
      return
    }
    const tileSelection = tileRectDragRef.current
    if (viewport && mapDocument && tileSelection?.pointerId === event.pointerId) {
      const point = getCanvasWorldPoint(event.clientX, event.clientY)
      const end = point ?? { tileX: tileSelection.currentTileX, tileY: tileSelection.currentTileY }
      const rect = createMapTileRect(
        { x: tileSelection.startTileX, y: tileSelection.startTileY },
        { x: end.tileX, y: end.tileY },
        mapDocument,
      )
      tileRectDragRef.current = null
      setTileRectDrag(null)
      if (viewport.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId)
      }
      onTileRectSelect?.(rect)
      updateHover(event)
      return
    }
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
    cancelPendingHoverRaf()
    cancelPendingTileRectRaf()
    const viewport = viewportRef.current
    const objectDragState = objectDragStateRef.current
    if (objectDrag && objectDragState?.pointerId === event.pointerId) {
      objectDragStateRef.current = null
      if (viewport) {
        if (viewport.hasPointerCapture(event.pointerId)) {
          viewport.releasePointerCapture(event.pointerId)
        }
        viewport.style.cursor = ''
      }
      objectDrag.onEnd()
      onHoverChange?.(null)
      lastHoverTileRef.current = null
      positionHoverTileElement(hoverTileElementRef.current, null, 0, 0, 1)
      return
    }
    const tileStroke = tileStrokeDragRef.current
    if (viewport && tileStroke?.pointerId === event.pointerId) {
      tileStrokeDragRef.current = null
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId)
      onHoverChange?.(null)
      lastHoverTileRef.current = null
      positionHoverTileElement(hoverTileElementRef.current, null, 0, 0, 1)
      return
    }
    const tileSelection = tileRectDragRef.current
    if (viewport && tileSelection?.pointerId === event.pointerId) {
      tileRectDragRef.current = null
      setTileRectDrag(null)
      if (viewport.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId)
      }
      onHoverChange?.(null)
      lastHoverTileRef.current = null
      positionHoverTileElement(hoverTileElementRef.current, null, 0, 0, 1)
      return
    }
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
    lastHoverTileRef.current = null
    positionHoverTileElement(hoverTileElementRef.current, null, 0, 0, 1)
  }

  function handlePointerLeave() {
    cancelPendingHoverRaf()
    leftPressStateRef.current = null
    if (!dragStateRef.current && !objectDragStateRef.current) {
      onHoverChange?.(null)
      lastHoverTileRef.current = null
      positionHoverTileElement(hoverTileElementRef.current, null, 0, 0, 1)
      positionPaintPreviewElement(paintPreviewElementRef.current, null, 0, 0, 1, 0, 0)
    }
  }

  if (!mapDocument) {
    return <MapViewportEmptyState theme={theme} accentColor={accentColor} viewportBackdropStyle={viewportBackdropStyle} />
  }

  const viewportContent = (
    <div
      className="panel-canvas shadow-panel relative isolate h-full"
      style={viewportBackdropStyle}
      aria-busy={tilesetLoading ? 'true' : undefined}
    >
      {tilesetLoading ? <ImageSkeleton overlay rounded={false} className="map-viewport-skeleton" /> : null}

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

      {bakedWorldLighting ? (
        <MapViewportLightingOverlay
          bakedCanvas={bakedWorldLighting}
          left={mapDisplayOffset.left}
          top={mapDisplayOffset.top}
          width={canvasLogicalSize.width}
          height={canvasLogicalSize.height}
        />
      ) : null}

      {scaleMapOverlayWithViewport && mapOverlay ? (
        <div
          className={`pointer-events-none absolute ${mapOverlayLayer === 'top' ? 'z-4' : 'z-2'}`}
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
        {showPreviewOverlay ? (
          <div className="map-viewport-tileset-preview-overlay">
            {previewImageSrc && previewDisplaySize ? (
              <img
                key={previewImageSrc}
                src={previewImageSrc}
                alt=""
                draggable={false}
                className="map-viewport-tileset-preview-img"
                style={{
                  width: `${previewDisplaySize.w}px`,
                  height: `${previewDisplaySize.h}px`,
                }}
              />
            ) : (
              <span className="map-viewport-tileset-preview-placeholder" />
            )}
          </div>
        ) : null}
        <div
          ref={viewportRef}
          className={`viewport-scroll-hidden h-full w-full ${viewportCursorClass} ${zoomMode === 'fit' ? 'overflow-hidden' : 'overflow-auto'}`}
          data-map-viewport-scroll="true"
          data-map-cell-overlay-count={cellOverlay ? Object.keys(cellOverlay.cells).length : undefined}
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
            {!fitContentBounds ? (
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
            ) : null}
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
            {tileInteractionEnabled ? (
              <div
                className="pointer-events-none absolute z-5"
                style={{
                  left: `${canvasOffset.left}px`,
                  top: `${canvasOffset.top}px`,
                  width: `${canvasLogicalSize.width}px`,
                  height: `${canvasLogicalSize.height}px`,
                }}
              >
                <div
                  ref={hoverTileElementRef}
                  className="absolute"
                  data-map-tile-hover="true"
                  style={{
                    display: 'none',
                    backgroundColor: rgbaFromHex(accentColor, theme === 'light' ? 0.14 : 0.18),
                    border: `1px solid ${rgbaFromHex(accentColor, 0.88)}`,
                    boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.55), 0 0 0 1px ${rgbaFromHex(accentColor, 0.26)}`,
                  }}
                />
                <div
                  ref={paintPreviewElementRef}
                  className="map-paint-preview absolute"
                  data-map-paint-preview="true"
                  style={{
                    opacity: 0.55,
                    imageRendering: 'pixelated',
                    border: `1px solid ${rgbaFromHex(accentColor, 0.6)}`,
                    boxShadow: `0 0 0 1px ${rgbaFromHex(accentColor, 0.2)}`,
                    ...paintPreviewStyle,
                  }}
                />
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
                {activeTileRect ? (
                  <div
                    ref={tileRectElementRef}
                    className="absolute"
                    data-map-tile-rect-selection="true"
                    style={{
                      left: `${activeTileRect.x * mapDocument.tileWidth * zoom}px`,
                      top: `${activeTileRect.y * mapDocument.tileHeight * zoom}px`,
                      width: `${activeTileRect.width * mapDocument.tileWidth * zoom}px`,
                      height: `${activeTileRect.height * mapDocument.tileHeight * zoom}px`,
                      backgroundColor: rgbaFromHex(accentColor, theme === 'light' ? 0.2 : 0.24),
                      border: `2px solid ${rgbaFromHex(accentColor, 0.98)}`,
                      boxShadow: `inset 0 0 0 1px ${rgbaFromHex(accentColor, 0.24)}, 0 0 0 3px ${rgbaFromHex(accentColor, 0.18)}`,
                    }}
                  />
                ) : null}
              </div>
            ) : null}
            {inspectorHighlight && inspectorHighlight.tileRects.length > 0 ? (
              <div
                className="pointer-events-none absolute z-5"
                data-map-inspector-highlight="true"
                style={{
                  left: `${canvasOffset.left}px`,
                  top: `${canvasOffset.top}px`,
                  width: `${canvasLogicalSize.width}px`,
                  height: `${canvasLogicalSize.height}px`,
                }}
              >
                {inspectorHighlight.tileRects.map((rect, index) => (
                  <div
                    key={`${rect.x},${rect.y},${rect.width},${rect.height},${index}`}
                    className="absolute"
                    style={{
                      left: `${rect.x * mapDocument.tileWidth * zoom}px`,
                      top: `${rect.y * mapDocument.tileHeight * zoom}px`,
                      width: `${rect.width * mapDocument.tileWidth * zoom}px`,
                      height: `${rect.height * mapDocument.tileHeight * zoom}px`,
                      backgroundColor: rgbaFromHex(accentColor, theme === 'light' ? 0.1 : 0.14),
                      border: `2px solid ${rgbaFromHex(accentColor, 0.95)}`,
                      borderRadius: '2px',
                    }}
                  />
                ))}
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
      onExportPng={onExportPng}
      onAddObjectHere={onAddObjectHere}
    />
  )
})
