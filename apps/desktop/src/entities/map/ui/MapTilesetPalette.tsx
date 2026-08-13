import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Grid2X2, GripVertical, Image, ImageOff, Loader2, Minus, Plus, ScanLine, Search, X } from 'lucide-react'
import type { LocaleCode } from '@locales/api'
import { useEditorCopy } from '@locales/provider'
import { usePreferencesStore, type PaletteRecentSelection } from '@shared/lib/app-state'
import { cx } from '@shared/lib/helper'
import type { MapDocument, MapTileset } from '../lib/types'
import { resolveTilesetImagePath } from '../lib/assets'
import {
  cellFromGridPointer,
  cellFromSheetPointer,
  normalizeSelectionRect,
  pushRecentSelection,
  rememberTilesetSelection,
  selectionRectForSelection,
  tileIndexInSelection,
  tilesetSelectionFromRect,
  type NormalizedSelectionRect,
  type TilesetSelectionRect,
} from '../lib/paletteSelection'
import { loadImage } from './mapViewportHelpers'

export type MapTilesetPaletteSelection = PaletteRecentSelection

type ImageState = {
  key: string
  status: 'loading' | 'ready' | 'error'
  image: HTMLImageElement | null
}

/** In-flight header drag: pointer identity, start cursor position, and the panel origin inside its offset parent. */
type DragSession = {
  pointerId: number
  startX: number
  startY: number
  originLeft: number
  originTop: number
}

/** Which panel edge a resize drag affects: left edge (width), bottom edge (height), or bottom-left corner (both). */
type ResizeAxis = 'width' | 'height' | 'both'

/** In-flight resize drag: pointer identity, affected axes, start cursor position, and the panel geometry inside its offset parent. */
type ResizeSession = {
  pointerId: number
  axis: ResizeAxis
  startX: number
  startY: number
  originLeft: number
  originTop: number
  originWidth: number
  originHeight: number
}

type MapTilesetPaletteProps = {
  document: MapDocument
  locale: LocaleCode
  selection: MapTilesetPaletteSelection | null
  onSelectionChange: (selection: MapTilesetPaletteSelection) => void
  /** Smaller chips without name labels for narrow panels. */
  compact?: boolean
  /** When provided, renders a close button in the floating panel header. */
  onClose?: () => void
  /** When provided, renders edge/corner drag handles so the floating panel can be resized. */
  resizeLabel?: string
}

/** Hover tooltip content: the hovered tile index plus the anchor cell's viewport position. */
type HoveredCell = {
  index: number
  left: number
  top: number
}

type RecentCellProps = {
  document: MapDocument
  tileset: MapTileset
  entry: PaletteRecentSelection
  locale: LocaleCode
  errorFactory: (path: string) => string
  onRestore: (entry: PaletteRecentSelection) => void
}

/** One thumbnail in the recent-use strip: the selection's tiles rendered as a mini grid. */
function RecentCell({ document, tileset, entry, locale, errorFactory, onRestore }: RecentCellProps) {
  const imagePath = resolveTilesetImagePath(document, tileset)
  const [imageState, setImageState] = useState<{ status: 'loading' | 'ready' | 'error'; image: HTMLImageElement | null }>({
    status: 'loading',
    image: null,
  })

  useEffect(() => {
    if (!imagePath) {
      setImageState({ status: 'error', image: null })
      return
    }
    let current = true
    setImageState({ status: 'loading', image: null })
    void loadImage(imagePath, locale, errorFactory)
      .then((image) => {
        if (current) setImageState({ status: 'ready', image })
      })
      .catch(() => {
        if (current) setImageState({ status: 'error', image: null })
      })
    return () => {
      current = false
    }
  }, [errorFactory, imagePath, locale])

  const spacing = tileset.spacing ?? 0
  const margin = tileset.margin ?? 0
  const cells: Array<{ index: number; x: number; y: number }> = []
  for (let row = 0; row < entry.height; row += 1) {
    for (let column = 0; column < entry.width; column += 1) {
      const tileIndex = entry.startIndex + row * tileset.columns + column
      if (tileIndex < 0 || tileIndex >= tileset.tileCount) continue
      cells.push({
        index: tileIndex,
        x: margin + (tileIndex % tileset.columns) * (tileset.tileWidth + spacing),
        y: margin + Math.floor(tileIndex / tileset.columns) * (tileset.tileHeight + spacing),
      })
    }
  }

  return (
    <button
      type="button"
      className="map-tileset-palette-recent"
      style={{ gridTemplateColumns: `repeat(${entry.width}, 1fr)` }}
      onClick={() => onRestore(entry)}
    >
      {imageState.status === 'ready' && imageState.image && cells.length > 0 ? (
        cells.map((cell) => (
          <i
            key={cell.index}
            style={{
              backgroundImage: `url(${JSON.stringify(imageState.image!.src)})`,
              backgroundSize: `${imageState.image!.naturalWidth}px ${imageState.image!.naturalHeight}px`,
              backgroundPosition: `-${cell.x}px -${cell.y}px`,
            }}
            aria-hidden="true"
          />
        ))
      ) : (
        <span className="map-tileset-palette-recent-fallback">
          {entry.width}×{entry.height}
        </span>
      )}
    </button>
  )
}

function readRootFontSize() {
  if (typeof document === 'undefined') return 16
  return Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16
}

/** Renders a real tileset image and commits a bounded rectangular stamp selection. */
export function MapTilesetPalette({
  document,
  locale,
  selection,
  onSelectionChange,
  compact,
  onClose,
  resizeLabel,
}: MapTilesetPaletteProps) {
  const editorCopy = useEditorCopy()
  const labels = editorCopy.studioDesk.mapPatchEditor
  const viewportLabels = editorCopy.viewportLabels
  const closeLabel = editorCopy.buildAssetDialog.closeAction
  const palettePrefs = usePreferencesStore((state) => state.mapEditorPalette)
  const setPalettePrefs = usePreferencesStore((state) => state.setMapEditorPalette)
  const availableTilesets = document.tilesets.filter((tileset) => tileset.columns > 0 && tileset.tileCount > 0)
  const fallbackName = availableTilesets[0]?.name ?? ''
  const requestedName = selection?.tilesetName ?? fallbackName
  const activeTileset = availableTilesets.find((tileset) => tileset.name === requestedName) ?? availableTilesets[0] ?? null
  const imagePath = activeTileset ? resolveTilesetImagePath(document, activeTileset) : null
  const imageKey = `${locale}:${imagePath ?? ''}`
  const [imageState, setImageState] = useState<ImageState>({ key: imageKey, status: 'loading', image: null })
  const [dragRect, setDragRect] = useState<TilesetSelectionRect | null>(null)
  const dragRef = useRef<TilesetSelectionRect | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewOverrides, setViewOverrides] = useState<Record<string, 'grid' | 'sheet'>>({})
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const [virtualElement, setVirtualElement] = useState<HTMLDivElement | null>(null)
  const [rootFontSize, setRootFontSize] = useState(readRootFontSize)
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null)
  const hoveredIndexRef = useRef<number | null>(null)
  const [dragPosition, setDragPosition] = useState<{ left: number; top: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragSessionRef = useRef<DragSession | null>(null)
  const [paletteSize, setPaletteSize] = useState<{ width: number; height: number } | null>(null)
  const [activeResize, setActiveResize] = useState<ResizeAxis | null>(null)
  const resizeSessionRef = useRef<ResizeSession | null>(null)

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
      .catch(() => {
        if (current) setImageState({ key: imageKey, status: 'error', image: null })
      })
    return () => {
      current = false
    }
  }, [imageKey, imagePath, labels.tilesetImageError, locale])

  useEffect(() => {
    if (!scrollElement) return
    const updateLayout = () => {
      setRootFontSize(readRootFontSize())
    }
    const observer = new ResizeObserver(updateLayout)
    observer.observe(scrollElement)
    updateLayout()
    return () => observer.disconnect()
  }, [scrollElement])

  const currentImageState = imageState.key === imageKey ? imageState : { key: imageKey, status: 'loading' as const, image: null }
  const paletteImage = currentImageState.image
  const zoom = palettePrefs.zoom
  const scale = Math.max(0.5, zoom)
  const gridGap = rootFontSize * 0.25
  const gridCellWidth = Math.max(rootFontSize * 2, (activeTileset?.tileWidth ?? 16) * scale + 2)
  const gridRowContentHeight = Math.max(rootFontSize, (activeTileset?.tileHeight ?? 16) * scale) + rootFontSize * 1.125
  const rows = activeTileset ? Math.max(1, Math.ceil(activeTileset.tileCount / activeTileset.columns)) : 1
  const paletteView = activeTileset ? (viewOverrides[activeTileset.name] ?? 'grid') : 'grid'
  const currentSelection =
    selection?.tilesetName === activeTileset?.name ? selection : (palettePrefs.perTilesetSelections[activeTileset?.name ?? ''] ?? null)
  const visibleRect: TilesetSelectionRect | null =
    dragRect ?? (activeTileset && currentSelection ? selectionRectForSelection(currentSelection, activeTileset.columns) : null)
  const normalized: NormalizedSelectionRect | null = visibleRect ? normalizeSelectionRect(visibleRect) : null
  const gridVirtualizer = useVirtualizer({
    count: paletteView === 'grid' ? rows : 0,
    getScrollElement: () => scrollElement,
    estimateSize: () => gridRowContentHeight + gridGap,
    overscan: 1,
  })

  useEffect(() => {
    gridVirtualizer.measure()
  }, [activeTileset?.columns, gridCellWidth, gridRowContentHeight, gridVirtualizer])

  useEffect(() => {
    if (!activeTileset || paletteView !== 'grid' || selection?.tilesetName !== activeTileset.name) return
    gridVirtualizer.scrollToIndex(Math.floor(selection.startIndex / activeTileset.columns), { align: 'auto' })
  }, [activeTileset, gridVirtualizer, paletteView, selection])

  if (!activeTileset) {
    return (
      <div className="map-tileset-palette-empty">
        <ImageOff className="h-4 w-4" aria-hidden="true" />
        <span>{labels.noTilesets}</span>
      </div>
    )
  }

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredTilesets = normalizedQuery
    ? availableTilesets.filter((tileset) => tileset.name.toLowerCase().includes(normalizedQuery))
    : availableTilesets
  const recentEntries = palettePrefs.recents.filter((entry) => availableTilesets.some((tileset) => tileset.name === entry.tilesetName))

  function commitSelection(rect: TilesetSelectionRect) {
    const next = tilesetSelectionFromRect(rect, activeTileset.columns, activeTileset.tileCount)
    const entry: PaletteRecentSelection = { tilesetName: activeTileset.name, ...next }
    const prefs = usePreferencesStore.getState().mapEditorPalette
    onSelectionChange(entry)
    setPalettePrefs({
      perTilesetSelections: rememberTilesetSelection(prefs.perTilesetSelections, activeTileset.name, next),
      recents: pushRecentSelection(prefs.recents, entry),
    })
  }

  function switchTileset(name: string) {
    const remembered = usePreferencesStore.getState().mapEditorPalette.perTilesetSelections[name]
    onSelectionChange(remembered ? { tilesetName: name, ...remembered } : { tilesetName: name, startIndex: 0, width: 1, height: 1 })
  }

  function restoreRecent(entry: PaletteRecentSelection) {
    const prefs = usePreferencesStore.getState().mapEditorPalette
    const selection = { startIndex: entry.startIndex, width: entry.width, height: entry.height }
    onSelectionChange({ tilesetName: entry.tilesetName, ...selection })
    setPalettePrefs({ perTilesetSelections: rememberTilesetSelection(prefs.perTilesetSelections, entry.tilesetName, selection) })
  }

  function showCellTip(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (hoveredIndexRef.current === index) return
    hoveredIndexRef.current = index
    const rect = event.currentTarget.getBoundingClientRect()
    setHoveredCell({ index, left: rect.left, top: rect.top })
  }

  function hideCellTip() {
    hoveredIndexRef.current = null
    setHoveredCell(null)
  }

  function handleHeadPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    // Clicks on the search box (label padding included), view toggles, or the
    // close button must not start a header drag.
    if (event.target instanceof Element && event.target.closest('button, input, .map-tileset-palette-search')) return
    const panel = event.currentTarget.parentElement
    const offsetParent = panel?.offsetParent as HTMLElement | null
    if (!panel || !offsetParent) return
    const parentBounds = offsetParent.getBoundingClientRect()
    const panelBounds = panel.getBoundingClientRect()
    dragSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: panelBounds.left - parentBounds.left,
      originTop: panelBounds.top - parentBounds.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDragging(true)
  }

  function handleHeadPointerMove(event: PointerEvent<HTMLDivElement>) {
    const session = dragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    const panel = event.currentTarget.parentElement as HTMLElement | null
    const offsetParent = panel?.offsetParent as HTMLElement | null
    if (!panel || !offsetParent) return
    const maxLeft = Math.max(0, offsetParent.clientWidth - panel.offsetWidth)
    const maxTop = Math.max(0, offsetParent.clientHeight - panel.offsetHeight)
    setDragPosition({
      left: Math.min(Math.max(0, session.originLeft + event.clientX - session.startX), maxLeft),
      top: Math.min(Math.max(0, session.originTop + event.clientY - session.startY), maxTop),
    })
  }

  function handleHeadPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const session = dragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    dragSessionRef.current = null
    setIsDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function startResize(event: PointerEvent<HTMLDivElement>, axis: ResizeAxis) {
    if (event.button !== 0) return
    const panel = event.currentTarget.parentElement as HTMLElement | null
    const offsetParent = panel?.offsetParent as HTMLElement | null
    if (!panel || !offsetParent) return
    const parentBounds = offsetParent.getBoundingClientRect()
    const panelBounds = panel.getBoundingClientRect()
    resizeSessionRef.current = {
      pointerId: event.pointerId,
      axis,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: panelBounds.left - parentBounds.left,
      originTop: panelBounds.top - parentBounds.top,
      originWidth: panelBounds.width,
      originHeight: panelBounds.height,
    }
    setActiveResize(axis)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleResizePointerMove(event: PointerEvent<HTMLDivElement>) {
    const session = resizeSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    const panel = event.currentTarget.parentElement as HTMLElement | null
    const offsetParent = panel?.offsetParent as HTMLElement | null
    if (!panel || !offsetParent) return
    const parentBounds = offsetParent.getBoundingClientRect()
    const margin = rootFontSize * 0.75
    const minWidth = rootFontSize * 16
    const minHeight = rootFontSize * 12
    const deltaX = event.clientX - session.startX
    const deltaY = event.clientY - session.startY

    let width = session.originWidth
    let height = session.originHeight
    if (session.axis !== 'height') {
      // The left edge follows the pointer so the panel's right edge stays fixed.
      const left = Math.min(Math.max(session.originLeft + deltaX, margin), Math.max(margin, parentBounds.width - margin - minWidth))
      width = Math.min(Math.max(session.originWidth - deltaX, minWidth), Math.max(minWidth, parentBounds.width - left - margin))
      setDragPosition({ left, top: session.originTop })
    }
    if (session.axis !== 'width') {
      // The bottom edge follows the pointer; the panel's top edge stays fixed.
      height = Math.min(
        Math.max(session.originHeight + deltaY, minHeight),
        Math.max(minHeight, parentBounds.height - session.originTop - margin),
      )
    }
    setPaletteSize({ width, height })
  }

  function handleResizePointerEnd(event: PointerEvent<HTMLDivElement>) {
    const session = resizeSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    resizeSessionRef.current = null
    setActiveResize(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function gridPointerCell(event: PointerEvent<HTMLDivElement>, gridElement: HTMLDivElement) {
    const bounds = gridElement.getBoundingClientRect()
    return cellFromGridPointer({
      x: event.clientX,
      y: event.clientY,
      originX: bounds.left,
      originY: bounds.top,
      cellWidth: gridCellWidth,
      cellHeight: gridRowContentHeight,
      gap: gridGap,
      columns: activeTileset.columns,
      rows,
    })
  }

  function sheetPointerCell(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return cellFromSheetPointer({
      x: event.clientX,
      y: event.clientY,
      originX: bounds.left,
      originY: bounds.top,
      width: bounds.width,
      height: bounds.height,
      columns: activeTileset.columns,
      rows,
    })
  }

  function handleScrollPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (paletteView !== 'grid' || currentImageState.status !== 'ready' || !virtualElement) return
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const cell = gridPointerCell(event, virtualElement)
    const next = { startColumn: cell.column, startRow: cell.row, endColumn: cell.column, endRow: cell.row }
    dragRef.current = next
    setDragRect(next)
    hideCellTip()
  }

  function handleScrollPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !virtualElement) return
    const cell = gridPointerCell(event, virtualElement)
    const next = { ...dragRef.current, endColumn: cell.column, endRow: cell.row }
    dragRef.current = next
    setDragRect(next)
  }

  function handleScrollPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !virtualElement) return
    const cell = gridPointerCell(event, virtualElement)
    const next = { ...dragRef.current, endColumn: cell.column, endRow: cell.row }
    dragRef.current = null
    setDragRect(null)
    commitSelection(next)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleScrollPointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    dragRef.current = null
    setDragRect(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleSheetPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const cell = sheetPointerCell(event)
    const next = { startColumn: cell.column, startRow: cell.row, endColumn: cell.column, endRow: cell.row }
    dragRef.current = next
    setDragRect(next)
    hideCellTip()
  }

  function handleSheetPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    const cell = sheetPointerCell(event)
    const next = { ...dragRef.current, endColumn: cell.column, endRow: cell.row }
    dragRef.current = next
    setDragRect(next)
  }

  function handleSheetPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    const cell = sheetPointerCell(event)
    const next = { ...dragRef.current, endColumn: cell.column, endRow: cell.row }
    dragRef.current = null
    setDragRect(null)
    commitSelection(next)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleSheetPointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    dragRef.current = null
    setDragRect(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const tipScale = 64 / Math.max(activeTileset.tileWidth, activeTileset.tileHeight)
  const tipTileWidth = activeTileset.tileWidth * tipScale
  const tipTileHeight = activeTileset.tileHeight * tipScale
  const tipWidth = rootFontSize * 6
  const tipHeight = rootFontSize * 6.75
  const tipLeft = hoveredCell ? Math.max(rootFontSize * 0.5, hoveredCell.left - tipWidth - rootFontSize * 0.625) : 0
  const tipTop = hoveredCell
    ? Math.min(window.innerHeight - tipHeight - rootFontSize * 0.5, Math.max(rootFontSize * 0.5, hoveredCell.top - rootFontSize * 1.25))
    : 0
  const hoveredTileSourceX = hoveredCell
    ? (activeTileset.margin ?? 0) + (hoveredCell.index % activeTileset.columns) * (activeTileset.tileWidth + (activeTileset.spacing ?? 0))
    : 0
  const hoveredTileSourceY = hoveredCell
    ? (activeTileset.margin ?? 0) +
      Math.floor(hoveredCell.index / activeTileset.columns) * (activeTileset.tileHeight + (activeTileset.spacing ?? 0))
    : 0

  return (
    <section
      className={cx('map-tileset-palette', activeResize && 'is-resizing')}
      aria-label={labels.tilesetPalette}
      style={
        dragPosition || paletteSize
          ? {
              ...(dragPosition ? { left: dragPosition.left, top: dragPosition.top, right: 'auto' as const } : null),
              ...(paletteSize ? { width: paletteSize.width, height: paletteSize.height } : null),
            }
          : undefined
      }
    >
      <div
        className={cx('map-tileset-palette-head', isDragging && 'is-dragging')}
        onPointerDown={handleHeadPointerDown}
        onPointerMove={handleHeadPointerMove}
        onPointerUp={handleHeadPointerEnd}
        onPointerCancel={handleHeadPointerEnd}
      >
        <GripVertical className="map-tileset-palette-head-grip h-3.5 w-3.5" aria-hidden="true" />
        <label className="map-tileset-palette-search">
          <Search className="map-tileset-palette-search-icon h-3.5 w-3.5" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={labels.searchTilesets}
            aria-label={labels.searchTilesets}
            spellCheck={false}
          />
        </label>
        <div className="map-tileset-palette-view" role="group" aria-label={labels.tilesetView}>
          {(
            [
              ['grid', Grid2X2, labels.tilesetGridView],
              ['sheet', Image, labels.tilesetSheetView],
            ] as const
          ).map(([view, Icon, label]) => (
            <button
              key={view}
              type="button"
              className={cx('icon-button', paletteView === view && 'is-active')}
              aria-label={label}
              title={label}
              aria-pressed={paletteView === view}
              onClick={() => setViewOverrides((current) => ({ ...current, [activeTileset.name]: view }))}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ))}
        </div>
        {onClose ? (
          <button type="button" className="map-tileset-palette-close" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div
        className={cx('map-tileset-palette-sheets', compact && 'is-compact')}
        role="group"
        aria-label={labels.tileTileset(activeTileset.name)}
      >
        {filteredTilesets.map((tileset) => {
          const isActive = tileset.name === activeTileset.name
          const hasRememberedSelection = Boolean(palettePrefs.perTilesetSelections[tileset.name])
          return (
            <button
              key={`${tileset.firstGid}:${tileset.name}`}
              type="button"
              className={cx('map-tileset-palette-chip', isActive && 'is-active')}
              aria-pressed={isActive}
              onClick={() => switchTileset(tileset.name)}
            >
              <span className="map-tileset-palette-chip-name">{tileset.name}</span>
              {hasRememberedSelection ? <span className="map-tileset-palette-chip-mem" aria-hidden="true" /> : null}
            </button>
          )
        })}
      </div>
      {recentEntries.length > 0 ? (
        <div className="map-tileset-palette-recents">
          <span className="map-tileset-palette-recents-label">{labels.recentTilesets}</span>
          {recentEntries.map((entry) => {
            const tileset = availableTilesets.find((candidate) => candidate.name === entry.tilesetName)
            if (!tileset) return null
            return (
              <RecentCell
                key={`${entry.tilesetName}:${entry.startIndex}:${entry.width}:${entry.height}`}
                document={document}
                tileset={tileset}
                entry={entry}
                locale={locale}
                errorFactory={labels.tilesetImageError}
                onRestore={restoreRecent}
              />
            )
          })}
        </div>
      ) : null}
      <div
        ref={setScrollElement}
        className={cx('map-tileset-palette-scroll', currentImageState.status !== 'ready' && 'is-state')}
        onScroll={hideCellTip}
        onPointerDown={handleScrollPointerDown}
        onPointerMove={handleScrollPointerMove}
        onPointerUp={handleScrollPointerUp}
        onPointerCancel={handleScrollPointerCancel}
      >
        {currentImageState.status === 'loading' ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-label={labels.loadingTileset} />
        ) : currentImageState.status === 'error' || !paletteImage ? (
          <span className="map-tileset-palette-error">
            <ImageOff className="h-4 w-4" aria-hidden="true" />
            {imagePath ? labels.tilesetImageError(imagePath) : labels.tilesetImageMissing}
          </span>
        ) : paletteView === 'grid' ? (
          <div
            ref={setVirtualElement}
            className="map-tileset-palette-virtual"
            style={
              {
                height: `${gridVirtualizer.getTotalSize()}px`,
                '--map-tileset-image': `url(${JSON.stringify(paletteImage.src)})`,
                '--map-tileset-image-size': `${paletteImage.naturalWidth * zoom}px ${paletteImage.naturalHeight * zoom}px`,
              } as CSSProperties
            }
          >
            {gridVirtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                className="map-tileset-palette-virtual-row"
                style={{
                  height: `${gridRowContentHeight}px`,
                  gridTemplateColumns: `repeat(${activeTileset.columns}, ${gridCellWidth}px)`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {Array.from({ length: activeTileset.columns }, (_, columnIndex) => {
                  const tileIndex = virtualRow.index * activeTileset.columns + columnIndex
                  if (tileIndex >= activeTileset.tileCount) return null
                  const sourceX =
                    (activeTileset.margin ?? 0) +
                    (tileIndex % activeTileset.columns) * (activeTileset.tileWidth + (activeTileset.spacing ?? 0))
                  const sourceY =
                    (activeTileset.margin ?? 0) +
                    Math.floor(tileIndex / activeTileset.columns) * (activeTileset.tileHeight + (activeTileset.spacing ?? 0))
                  const isSelected = normalized ? tileIndexInSelection(tileIndex, normalized, activeTileset.columns) : false
                  return (
                    <button
                      key={tileIndex}
                      type="button"
                      className={cx('map-tileset-palette-cell', isSelected && 'is-sel')}
                      aria-label={labels.tileId(tileIndex)}
                      aria-pressed={isSelected}
                      onClick={() =>
                        commitSelection({
                          startColumn: columnIndex,
                          startRow: virtualRow.index,
                          endColumn: columnIndex,
                          endRow: virtualRow.index,
                        })
                      }
                      onPointerEnter={(event) => showCellTip(event, tileIndex)}
                      onPointerLeave={hideCellTip}
                    >
                      <span
                        style={{
                          width: `${activeTileset.tileWidth * scale}px`,
                          height: `${activeTileset.tileHeight * scale}px`,
                          backgroundPosition: `${-sourceX * scale}px ${-sourceY * scale}px`,
                        }}
                        aria-hidden="true"
                      />
                      <small>{tileIndex}</small>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          <div
            className="map-tileset-palette-image"
            style={{
              width: `${paletteImage.naturalWidth * zoom}px`,
              height: `${paletteImage.naturalHeight * zoom}px`,
            }}
            onPointerDown={handleSheetPointerDown}
            onPointerMove={handleSheetPointerMove}
            onPointerUp={handleSheetPointerUp}
            onPointerCancel={handleSheetPointerCancel}
          >
            <img src={paletteImage.src} alt={activeTileset.name} draggable={false} />
            <span
              className="map-tileset-palette-grid"
              style={{
                backgroundSize: `${100 / activeTileset.columns}% ${100 / rows}%`,
              }}
              aria-hidden="true"
            />
            {normalized ? (
              <span
                className="map-tileset-palette-selection"
                style={{
                  left: `${(normalized.left / activeTileset.columns) * 100}%`,
                  top: `${(normalized.top / rows) * 100}%`,
                  width: `${((normalized.right - normalized.left + 1) / activeTileset.columns) * 100}%`,
                  height: `${((normalized.bottom - normalized.top + 1) / rows) * 100}%`,
                }}
                aria-hidden="true"
              />
            ) : null}
          </div>
        )}
      </div>
      <div className="map-tileset-palette-foot">
        <span className="map-tileset-palette-foot-selection">
          {currentSelection
            ? `${labels.tilesetSelection(currentSelection.startIndex, currentSelection.width, currentSelection.height)} · ${activeTileset.name}`
            : `${labels.noTileSelection} · ${activeTileset.name}`}
        </span>
        <div className="map-tileset-palette-zoom" role="group" aria-label={viewportLabels.zoomLabel(zoom)}>
          <button
            type="button"
            className="icon-button"
            aria-label={viewportLabels.zoomOut}
            title={viewportLabels.zoomOut}
            disabled={zoom <= 0.5}
            onClick={() => setPalettePrefs({ zoom: Math.max(0.5, zoom - 0.5) })}
          >
            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="map-tileset-palette-zoom-value"
            aria-label={viewportLabels.setOneToOne}
            title={viewportLabels.setOneToOne}
            onClick={() => setPalettePrefs({ zoom: 1 })}
          >
            <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={viewportLabels.zoomIn}
            title={viewportLabels.zoomIn}
            disabled={zoom >= 4}
            onClick={() => setPalettePrefs({ zoom: Math.min(4, zoom + 0.5) })}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      {resizeLabel ? (
        <>
          <div
            className={cx('map-tileset-palette-resize-left', activeResize === 'width' && 'is-active')}
            role="separator"
            aria-orientation="vertical"
            aria-label={resizeLabel}
            title={resizeLabel}
            onPointerDown={(event) => startResize(event, 'width')}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerEnd}
            onPointerCancel={handleResizePointerEnd}
          />
          <div
            className={cx('map-tileset-palette-resize-bottom', activeResize === 'height' && 'is-active')}
            role="separator"
            aria-orientation="horizontal"
            aria-label={resizeLabel}
            title={resizeLabel}
            onPointerDown={(event) => startResize(event, 'height')}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerEnd}
            onPointerCancel={handleResizePointerEnd}
          />
          <div
            className={cx('map-tileset-palette-resize-corner', activeResize === 'both' && 'is-active')}
            role="separator"
            aria-label={resizeLabel}
            title={resizeLabel}
            onPointerDown={(event) => startResize(event, 'both')}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerEnd}
            onPointerCancel={handleResizePointerEnd}
          />
        </>
      ) : null}
      {hoveredCell && paletteImage ? (
        <div className="map-tileset-palette-tip" style={{ left: tipLeft, top: tipTop }} role="tooltip">
          <span
            className="map-tileset-palette-tip-image"
            style={{
              width: `${tipTileWidth}px`,
              height: `${tipTileHeight}px`,
              backgroundImage: `url(${JSON.stringify(paletteImage.src)})`,
              backgroundSize: `${paletteImage.naturalWidth * tipScale}px ${paletteImage.naturalHeight * tipScale}px`,
              backgroundPosition: `${-hoveredTileSourceX * tipScale}px ${-hoveredTileSourceY * tipScale}px`,
            }}
            aria-hidden="true"
          />
          <span className="map-tileset-palette-tip-label">{labels.tileTooltip(hoveredCell.index, activeTileset.name)}</span>
        </div>
      ) : null}
    </section>
  )
}
