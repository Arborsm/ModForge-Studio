/**
 * @file Sheet grid canvas component: reusable scrollable, zoomable tile grid
 * for tileset sheets, supporting pointer-based selection and hover highlighting.
 */

import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { ImageOff, Loader2 } from 'lucide-react'
import type { LocaleCode } from '@locales/api'
import { appEvent } from '@platform/observability'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { MapDocument, MapTileset } from '../lib/types'
import { resolveTilesetImagePath } from '../lib/assets'
import { loadImage } from './mapViewportHelpers'
import { ViewportZoomToolbar } from './ViewportZoomToolbar'

type ImageState = {
  key: string
  status: 'loading' | 'ready' | 'error'
  image: HTMLImageElement | null
}

export type SheetGridCanvasHandle = {
  /** Pan + zoom the canvas so the given tile is centered. */
  locateTile: (tileId: number) => void
  /** Reset pan to origin and zoom to 1. */
  resetView: () => void
}

export type SheetGridZoomState = {
  zoom: number
  setZoom: (zoom: number) => void
}

type SheetGridCanvasProps = {
  document: MapDocument
  tileset: MapTileset
  locale: LocaleCode
  gameRootPath?: string | null
  /** Ref handle for imperative actions (locate, reset). */
  canvasRef?: React.RefObject<SheetGridCanvasHandle | null>
  /** Controlled zoom; if omitted, zoom is internal state initialized to 1. */
  zoomState?: SheetGridZoomState
  /**
   * Called when the user clicks (pointer down + up without drag) a tile.
   * In drag mode, `onDragSelectionEnd` is called instead.
   */
  onTileClick?: (tileId: number) => void
  /**
   * Called continuously during a drag selection with the live start/end
   * tile ids. Useful for showing a drag rectangle preview.
   */
  onDragSelectionChange?: (startTileId: number, endTileId: number) => void
  /**
   * Called when a drag selection completes (pointer up). The rect is in
   * tile coordinates; startTileId is the top-left, endTileId is the
   * bottom-right of the drag rectangle.
   */
  onDragSelectionEnd?: (startTileId: number, endTileId: number) => void
  /** Optional overlay rendered on top of the sheet image (e.g. badges). */
  overlay?: ReactNode
  /** Optional selection highlight rect in tile coordinates. */
  selectionRect?: { startTileId: number; endTileId: number } | null
  /** Whether to show the hover magnifier. Defaults to true. */
  showMagnifier?: boolean
  /** Whether to show the zoom footer. Defaults to true. */
  showZoomFooter?: boolean
  /** Whether drag-select is enabled (vs single-click only). Defaults to true. */
  enableDragSelect?: boolean
  /** Optional extra className on the canvas container. */
  className?: string
  /** Stamp preview: a thumbnail image that follows the cursor, used in
   * frame-pick modes to show what region will be placed. `tileWidth`/
   * `tileHeight` are in tile units (how many tiles the stamp spans). */
  stampPreview?: { src: string; tileWidth: number; tileHeight: number } | null
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 8

/**
 * Reusable sheet image viewer as a modern canvas: transform-based pan/zoom
 * with no scrollbars. Interactions:
 *
 * - **Wheel**: zoom centered on the cursor position.
 * - **Middle mouse drag**: pan the view.
 * - **Left mouse drag**: drag-select a rectangle of tiles (calls
 *   `onDragSelectionEnd`); a click without drag calls `onTileClick`.
 *
 * The component owns image loading; callers plug in interaction callbacks
 * and optional overlays (badges, highlights). Use `canvasRef` for
 * imperative `locateTile` / `resetView`.
 */
export function SheetGridCanvas({
  document,
  tileset,
  locale,
  gameRootPath = null,
  canvasRef,
  zoomState,
  onTileClick,
  onDragSelectionChange,
  onDragSelectionEnd,
  overlay,
  selectionRect,
  showMagnifier = true,
  showZoomFooter = true,
  enableDragSelect = true,
  className,
  stampPreview = null,
}: SheetGridCanvasProps) {
  const editorCopy = useEditorCopy()
  const labels = editorCopy.studioDesk.mapPatchEditor
  const [internalZoom, setInternalZoom] = useState(1)
  const zoom = zoomState?.zoom ?? internalZoom
  const setZoom = zoomState?.setZoom ?? setInternalZoom

  // Pan offset in screen pixels (before zoom transform).
  const [pan, setPan] = useState({ x: 0, y: 0 })

  const imagePath = resolveTilesetImagePath(document, tileset, gameRootPath)
  const imageKey = `${locale}:${gameRootPath ?? ''}:${imagePath ?? ''}`
  const [imageState, setImageState] = useState<ImageState>({ key: imageKey, status: 'loading', image: null })

  // Left-drag state: null = not dragging; otherwise tracks the start cell and
  // whether the pointer moved beyond a threshold (distinguishes click vs drag).
  const leftDragRef = useRef<{ startCol: number; startRow: number; moved: boolean; pointerId: number } | null>(null)
  // Middle-drag state for panning.
  const panDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Cached container rect — pointermove reads this instead of calling
  // getBoundingClientRect every frame (which forces a synchronous layout
  // flush). Refreshed on scroll, resize and after layout-affecting renders.
  const containerRectRef = useRef<DOMRect | null>(null)
  // rAF-coalesced hover: pointermove stores the latest event and schedules a
  // single rAF that runs pointerToCell + magnifier/stamp positioning at most
  // once per frame. A cell-coordinate debounce skips all work when the
  // pointer stays within the same tile.
  const pendingHoverEventRef = useRef<PointerEvent<HTMLDivElement> | null>(null)
  const hoverRafIdRef = useRef<number | null>(null)
  const lastHoverCellRef = useRef<{ column: number; row: number } | null>(null)
  // Refs to the magnifier and stamp DOM nodes so the rAF callback can write
  // their styles directly without triggering React re-renders.
  const magnifierRef = useRef<HTMLDivElement | null>(null)
  const stampRef = useRef<HTMLDivElement | null>(null)

  const rows = Math.max(1, Math.ceil(tileset.tileCount / tileset.columns))

  useEffect(() => {
    if (!imagePath) {
      setImageState({ key: imageKey, status: 'error', image: null })
      return
    }
    let current = true
    setImageState({ key: imageKey, status: 'loading', image: null })
    void loadImage(imagePath, locale, labels.tilesetImageError)
      .then((image) => {
        if (current) setImageState({ key: imageKey, status: 'ready', image })
      })
      .catch((error) => {
        if (current) {
          appEvent('warning', 'Failed to load tilesheet grid image')
            .error(error)
            .context({ source: 'map-tilesheet-grid', operation: 'load-image', path: imagePath })
            .emit({ notify: false })
          setImageState({ key: imageKey, status: 'error', image: null })
        }
      })
    return () => {
      current = false
    }
  }, [imageKey, imagePath, labels.tilesetImageError, locale])

  const currentImageState = imageState.key === imageKey ? imageState : { key: imageKey, status: 'loading' as const, image: null }
  const image = currentImageState.image

  // Keep the cached container rect fresh after layout-affecting renders
  // (zoom/pan changes, image load, tileset swaps). scroll and resize are
  // handled by their own listeners below.
  useLayoutEffect(() => {
    const container = containerRef.current
    containerRectRef.current = container ? container.getBoundingClientRect() : null
  })

  // Refresh cached rect on scroll and resize — these don't always trigger
  // a render but do change the container's screen position.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const update = () => {
      containerRectRef.current = container.getBoundingClientRect()
    }
    container.addEventListener('scroll', update, { passive: true })
    globalThis.window.addEventListener('resize', update, { passive: true })
    return () => {
      container.removeEventListener('scroll', update)
      globalThis.window.removeEventListener('resize', update)
    }
  }, [])

  /** Center the image in the container at the current zoom level. */
  function fitView() {
    const container = containerRef.current
    if (!container || !image) return
    const targetX = (container.clientWidth - image.naturalWidth * zoom) / 2
    const targetY = (container.clientHeight - image.naturalHeight * zoom) / 2
    setPan({ x: targetX, y: targetY })
  }

  // Auto-center when the image first loads or the tileset changes.
  useEffect(() => {
    if (currentImageState.status === 'ready' && image) {
      fitView()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentImageState.status, image?.naturalWidth, image?.naturalHeight])

  // Imperative handle: locateTile pans so the given tile is centered.
  useImperativeHandle(
    canvasRef,
    () => ({
      locateTile: (tileId: number) => {
        const container = containerRef.current
        if (!container) return
        const col = tileId % tileset.columns
        const row = Math.floor(tileId / tileset.columns)
        const tileW = tileset.tileWidth * zoom
        const tileH = tileset.tileHeight * zoom
        // Target: center the tile in the container.
        const targetX = container.clientWidth / 2 - (col * tileW + tileW / 2)
        const targetY = container.clientHeight / 2 - (row * tileH + tileH / 2)
        setPan({ x: targetX, y: targetY })
      },
      resetView: () => {
        setZoom(1)
        requestAnimationFrame(fitView)
      },
    }),
    [zoom, setZoom, tileset.columns, tileset.tileWidth, tileset.tileHeight],
  )

  // Map a pointer event to a tile cell, accounting for pan + zoom.
  function pointerToCell(event: PointerEvent<HTMLDivElement>) {
    const container = event.currentTarget
    // Use the cached rect to avoid forcing a synchronous layout flush on
    // every pointermove. The rect is refreshed on scroll, resize and after
    // layout-affecting renders (see containerRectRef update sites).
    const rect = containerRectRef.current ?? container.getBoundingClientRect()
    // The sheet image is rendered at naturalWidth * zoom, translated by pan.
    // Pointer position relative to the un-transformed image:
    const imgX = (event.clientX - rect.left - pan.x) / zoom
    const imgY = (event.clientY - rect.top - pan.y) / zoom
    const spacing = tileset.spacing ?? 0
    const margin = tileset.margin ?? 0
    const col = Math.floor((imgX - margin) / (tileset.tileWidth + spacing))
    const row = Math.floor((imgY - margin) / (tileset.tileHeight + spacing))
    return {
      column: Math.max(0, Math.min(tileset.columns - 1, col)),
      row: Math.max(0, Math.min(rows - 1, row)),
    }
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault()
    const rect = containerRectRef.current ?? event.currentTarget.getBoundingClientRect()
    // Mouse position relative to container.
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top
    // Image position under mouse before zoom change:
    const imgX = (mouseX - pan.x) / zoom
    const imgY = (mouseY - pan.y) / zoom
    const delta = -event.deltaY
    const factor = delta > 0 ? 1.15 : 1 / 1.15
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor))
    // Adjust pan so the image point under the mouse stays fixed.
    const nextPanX = mouseX - imgX * nextZoom
    const nextPanY = mouseY - imgY * nextZoom
    setZoom(nextZoom)
    setPan({ x: nextPanX, y: nextPanY })
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button === 1) {
      // Middle mouse: start panning.
      event.currentTarget.setPointerCapture(event.pointerId)
      panDragRef.current = { startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y }
      return
    }
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const cell = pointerToCell(event)
    leftDragRef.current = { startCol: cell.column, startRow: cell.row, moved: false, pointerId: event.pointerId }
  }

  // Position the magnifier and stamp preview DOM nodes directly from the
  // rAF callback — no React state, no re-render. Reads the cached container
  // rect so no synchronous layout flush is triggered.
  function flushHoverUpdate() {
    hoverRafIdRef.current = null
    const event = pendingHoverEventRef.current
    pendingHoverEventRef.current = null
    if (!event) return
    const cell = pointerToCell(event)
    // Cell-coordinate debounce: skip all DOM writes when the pointer hasn't
    // crossed into a new tile. The magnifier and stamp are already positioned
    // for this cell.
    const prev = lastHoverCellRef.current
    if (prev !== null && prev.column === cell.column && prev.row === cell.row) return
    lastHoverCellRef.current = { column: cell.column, row: cell.row }
    updateMagnifierNode(cell, event.clientX, event.clientY)
    updateStampNode(cell)
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

  // Write magnifier styles directly to the DOM node. The magnifier is a
  // portal child of document.body, so its position is fixed and uses
  // viewport coordinates (clientX/clientY).
  function updateMagnifierNode(cell: { column: number; row: number }, pointerX: number, pointerY: number) {
    const node = magnifierRef.current
    if (!node || !image || !showMagnifier) {
      if (node) node.style.display = 'none'
      return
    }
    const MAGNIFIER_TILES_X = 6
    const MAGNIFIER_TILES_Y = 4
    const SCALE = 4
    const spacing = tileset.spacing ?? 0
    const margin = tileset.margin ?? 0
    const tileW = tileset.tileWidth
    const tileH = tileset.tileHeight
    const cropStartCol = Math.max(0, Math.min(tileset.columns - MAGNIFIER_TILES_X, cell.column - Math.floor(MAGNIFIER_TILES_X / 2)))
    const cropStartRow = Math.max(0, Math.min(rows - MAGNIFIER_TILES_Y, cell.row - Math.floor(MAGNIFIER_TILES_Y / 2)))
    const cropX = margin + cropStartCol * (tileW + spacing)
    const cropY = margin + cropStartRow * (tileH + spacing)
    const cropW = Math.min(MAGNIFIER_TILES_X, tileset.columns - cropStartCol) * (tileW + spacing) - spacing
    const cropH = Math.min(MAGNIFIER_TILES_Y, rows - cropStartRow) * (tileH + spacing) - spacing
    const displayW = cropW * SCALE
    const displayH = cropH * SCALE
    const viewportW = globalThis.window.innerWidth
    const viewportH = globalThis.window.innerHeight
    const GAP = 16
    const placeRight = pointerX + GAP + displayW <= viewportW
    const placeLeft = !placeRight && pointerX - GAP - displayW >= 0
    const placeBottom = pointerY + GAP + displayH <= viewportH
    const placeTop = !placeBottom && pointerY - GAP - displayH >= 0
    let left: number
    if (placeRight) left = pointerX + GAP
    else if (placeLeft) left = pointerX - GAP - displayW
    else left = Math.max(GAP, Math.min(viewportW - GAP - displayW, pointerX + GAP))
    let top: number
    if (placeBottom) top = pointerY + GAP
    else if (placeTop) top = pointerY - GAP - displayH
    else top = Math.max(GAP, Math.min(viewportH - GAP - displayH, pointerY + GAP))
    const tileIndex = cell.row * tileset.columns + cell.column
    node.style.display = ''
    node.style.left = `${left}px`
    node.style.top = `${top}px`
    node.style.width = `${displayW}px`
    node.style.height = `${displayH}px`
    node.style.backgroundImage = `url(${JSON.stringify(image.src)})`
    node.style.backgroundRepeat = 'no-repeat'
    node.style.backgroundSize = `${image.naturalWidth * SCALE}px ${image.naturalHeight * SCALE}px`
    node.style.backgroundPosition = `-${cropX * SCALE}px -${cropY * SCALE}px`
    const highlight = node.firstElementChild as HTMLSpanElement | null
    if (highlight) {
      highlight.style.left = `${(cell.column - cropStartCol) * tileW * SCALE}px`
      highlight.style.top = `${(cell.row - cropStartRow) * tileH * SCALE}px`
      highlight.style.width = `${tileW * SCALE}px`
      highlight.style.height = `${tileH * SCALE}px`
    }
    const label = highlight?.nextElementSibling as HTMLSpanElement | null
    if (label) label.textContent = labels.tileTooltip(tileIndex, tileset.name)
  }

  // Write stamp preview styles directly to the DOM node.
  function updateStampNode(cell: { column: number; row: number }) {
    const node = stampRef.current
    if (!node || !stampPreview) {
      if (node) node.style.display = 'none'
      return
    }
    const spacing = tileset.spacing ?? 0
    const margin = tileset.margin ?? 0
    const tileW = tileset.tileWidth + spacing
    const tileH = tileset.tileHeight + spacing
    const screenX = pan.x + (margin + cell.column * tileW) * zoom
    const screenY = pan.y + (margin + cell.row * tileH) * zoom
    const w = stampPreview.tileWidth * tileset.tileWidth * zoom
    const h = stampPreview.tileHeight * tileset.tileHeight * zoom
    node.style.display = ''
    node.style.left = `${screenX}px`
    node.style.top = `${screenY}px`
    node.style.width = `${w}px`
    node.style.height = `${h}px`
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    // Middle-drag pan.
    const panDrag = panDragRef.current
    if (panDrag) {
      setPan({ x: panDrag.panX + (event.clientX - panDrag.startX), y: panDrag.panY + (event.clientY - panDrag.startY) })
      return
    }
    // Left-drag: track movement for click vs drag detection.
    const leftDrag = leftDragRef.current
    if (leftDrag) {
      const cell = pointerToCell(event)
      if (cell.column !== leftDrag.startCol || cell.row !== leftDrag.startRow) {
        leftDrag.moved = true
        if (enableDragSelect) {
          const startTileId = leftDrag.startRow * tileset.columns + leftDrag.startCol
          const endTileId = cell.row * tileset.columns + cell.column
          onDragSelectionChange?.(startTileId, endTileId)
        }
      }
    }
    // Hover magnifier — coalesce into a single rAF and debounce by cell so
    // mouse travel within the same tile costs zero React renders.
    if (!panDragRef.current) {
      scheduleHoverUpdate(event)
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const panDrag = panDragRef.current
    if (panDrag) {
      panDragRef.current = null
      return
    }
    const leftDrag = leftDragRef.current
    leftDragRef.current = null
    if (!leftDrag) return
    const cell = pointerToCell(event)
    const startTileId = leftDrag.startRow * tileset.columns + leftDrag.startCol
    const endTileId = cell.row * tileset.columns + cell.column
    if (leftDrag.moved && enableDragSelect) {
      onDragSelectionEnd?.(startTileId, endTileId)
    } else {
      onTileClick?.(startTileId)
    }
  }

  function handlePointerLeave() {
    cancelPendingHoverRaf()
    lastHoverCellRef.current = null
    const mag = magnifierRef.current
    if (mag) mag.style.display = 'none'
    const stamp = stampRef.current
    if (stamp) stamp.style.display = 'none'
  }

  // Cancel any pending rAF hover update on unmount so the callback never
  // runs after the component (and its refs) are gone.
  useEffect(
    () => () => {
      cancelPendingHoverRaf()
    },
    [],
  )

  if (currentImageState.status === 'loading') {
    return (
      <div className={cx('map-sheet-canvas is-state', className)}>
        <Loader2 className="h-4 w-4 animate-spin" aria-label={labels.loadingTileset} />
      </div>
    )
  }

  if (currentImageState.status === 'error' || !image) {
    return (
      <div className={cx('map-sheet-canvas is-state', className)}>
        <span className="map-sheet-canvas-error">
          <ImageOff className="h-4 w-4" aria-hidden="true" />
          {imagePath ? labels.tilesetImageError(imagePath) : labels.tilesetImageMissing}
        </span>
      </div>
    )
  }

  // Selection overlay rendered from the controlled selectionRect prop.
  let selectionOverlay: ReactNode = null
  if (selectionRect) {
    const startCol = selectionRect.startTileId % tileset.columns
    const startRow = Math.floor(selectionRect.startTileId / tileset.columns)
    const endCol = selectionRect.endTileId % tileset.columns
    const endRow = Math.floor(selectionRect.endTileId / tileset.columns)
    const left = Math.min(startCol, endCol)
    const top = Math.min(startRow, endRow)
    const right = Math.max(startCol, endCol)
    const bottom = Math.max(startRow, endRow)
    selectionOverlay = (
      <span
        className="map-tileset-palette-selection"
        style={{
          left: `${(left / tileset.columns) * 100}%`,
          top: `${(top / rows) * 100}%`,
          width: `${((right - left + 1) / tileset.columns) * 100}%`,
          height: `${((bottom - top + 1) / rows) * 100}%`,
        }}
        aria-hidden="true"
      />
    )
  }

  return (
    <>
      <div
        ref={containerRef}
        className={cx('map-sheet-canvas', className)}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        <div
          className="map-sheet-canvas-content"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            width: image.naturalWidth,
            height: image.naturalHeight,
          }}
        >
          <img src={image.src} alt={tileset.name} draggable={false} />
          <span
            className="map-tileset-palette-grid"
            style={{
              backgroundSize: `${100 / tileset.columns}% ${100 / rows}%`,
            }}
            aria-hidden="true"
          />
          {selectionOverlay}
          {overlay}
        </div>
        {showMagnifier && image
          ? createPortal(
              <div
                ref={magnifierRef}
                className="map-tileset-magnifier"
                role="img"
                aria-label={labels.tilesetMagnifier}
                style={{ display: 'none' }}
              >
                <span className="map-tileset-magnifier-highlight" aria-hidden="true" />
                <span className="map-tileset-magnifier-label" />
              </div>,
              globalThis.document.body,
            )
          : null}
        {stampPreview && image ? (
          <div ref={stampRef} className="map-sheet-canvas-stamp" style={{ display: 'none' }} aria-hidden="true">
            <img src={stampPreview.src} alt="" draggable={false} />
          </div>
        ) : null}
        {showZoomFooter ? (
          <ViewportZoomToolbar
            zoom={zoom}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            onZoomOut={() => setZoom(Math.max(MIN_ZOOM, zoom / 1.5))}
            onZoomIn={() => setZoom(Math.min(MAX_ZOOM, zoom * 1.5))}
            onOneToOne={() => {
              setZoom(1)
              requestAnimationFrame(fitView)
            }}
            onFit={fitView}
          />
        ) : null}
      </div>
    </>
  )
}
