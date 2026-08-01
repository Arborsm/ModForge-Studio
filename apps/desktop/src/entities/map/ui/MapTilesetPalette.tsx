import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Grid2X2, Image, ImageOff, Loader2, Minus, Plus, ScanLine } from 'lucide-react'
import type { LocaleCode } from '@locales/api'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { MapDocument, MapTileset } from '../lib/types'
import { resolveTilesetImagePath } from '../lib/assets'
import { loadImage } from './mapViewportHelpers'

export type MapTilesetPaletteSelection = {
  tilesetName: string
  startIndex: number
  width: number
  height: number
}

type SelectionRect = {
  startColumn: number
  startRow: number
  endColumn: number
  endRow: number
}

type ImageState = {
  key: string
  status: 'loading' | 'ready' | 'error'
  image: HTMLImageElement | null
}

type MapTilesetPaletteProps = {
  document: MapDocument
  locale: LocaleCode
  selection: MapTilesetPaletteSelection | null
  onSelectionChange: (selection: MapTilesetPaletteSelection) => void
  /** Smaller thumbnails without name labels for narrow panels. */
  compact?: boolean
}

function normalizeRect(rect: SelectionRect) {
  return {
    left: Math.min(rect.startColumn, rect.endColumn),
    top: Math.min(rect.startRow, rect.endRow),
    right: Math.max(rect.startColumn, rect.endColumn),
    bottom: Math.max(rect.startRow, rect.endRow),
  }
}

function selectionRect(selection: MapTilesetPaletteSelection, tileset: MapTileset): SelectionRect {
  const startColumn = selection.startIndex % tileset.columns
  const startRow = Math.floor(selection.startIndex / tileset.columns)
  return {
    startColumn,
    startRow,
    endColumn: startColumn + selection.width - 1,
    endRow: startRow + selection.height - 1,
  }
}

function pointerCell(event: PointerEvent<HTMLDivElement>, tileset: MapTileset) {
  const bounds = event.currentTarget.getBoundingClientRect()
  const column = Math.floor(((event.clientX - bounds.left) / bounds.width) * tileset.columns)
  const rows = Math.max(1, Math.ceil(tileset.tileCount / tileset.columns))
  const row = Math.floor(((event.clientY - bounds.top) / bounds.height) * rows)
  return {
    column: Math.min(tileset.columns - 1, Math.max(0, column)),
    row: Math.min(rows - 1, Math.max(0, row)),
  }
}

function prefersGridView(tileset: MapTileset) {
  const rows = Math.max(1, Math.ceil(tileset.tileCount / tileset.columns))
  return tileset.columns <= 2 || rows <= 2 || Math.max(tileset.columns / rows, rows / tileset.columns) >= 6
}

type TilesetThumbProps = {
  name: string
  imagePath: string | null
  active: boolean
  locale: LocaleCode
  errorFactory: (path: string) => string
  onSelect: () => void
}

/** One tileset chip in the switcher strip: whole-sheet thumbnail or name fallback. */
function TilesetThumb({ name, imagePath, active, locale, errorFactory, onSelect }: TilesetThumbProps) {
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

  return (
    <button
      type="button"
      className={cx('map-tileset-palette-thumb', active && 'is-active')}
      aria-pressed={active}
      title={name}
      onClick={onSelect}
    >
      <span className="map-tileset-palette-thumb-image">
        {imageState.status === 'ready' && imageState.image ? (
          <img src={imageState.image.src} alt="" draggable={false} />
        ) : (
          <span className="map-tileset-palette-thumb-fallback">{name}</span>
        )}
      </span>
      <span className="map-tileset-palette-thumb-name">{name}</span>
    </button>
  )
}

function readRootFontSize() {
  if (typeof document === 'undefined') return 16
  return Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16
}

/** Renders a real tileset image and commits a bounded rectangular stamp selection. */
export function MapTilesetPalette({ document, locale, selection, onSelectionChange, compact }: MapTilesetPaletteProps) {
  const editorCopy = useEditorCopy()
  const labels = editorCopy.studioDesk.mapPatchEditor
  const viewportLabels = editorCopy.viewportLabels
  const availableTilesets = document.tilesets.filter((tileset) => tileset.columns > 0 && tileset.tileCount > 0)
  const fallbackName = availableTilesets[0]?.name ?? ''
  const requestedName = selection?.tilesetName ?? fallbackName
  const activeTileset = availableTilesets.find((tileset) => tileset.name === requestedName) ?? availableTilesets[0] ?? null
  const imagePath = activeTileset ? resolveTilesetImagePath(document, activeTileset) : null
  const imageKey = `${locale}:${imagePath ?? ''}`
  const [imageState, setImageState] = useState<ImageState>({ key: imageKey, status: 'loading', image: null })
  const [dragRect, setDragRect] = useState<SelectionRect | null>(null)
  const [paletteZoom, setPaletteZoom] = useState(1)
  const [viewOverrides, setViewOverrides] = useState<Record<string, 'grid' | 'sheet'>>({})
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const [gridWidth, setGridWidth] = useState(0)
  const [rootFontSize, setRootFontSize] = useState(readRootFontSize)
  const dragRef = useRef<SelectionRect | null>(null)

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
      setGridWidth(scrollElement.clientWidth)
      setRootFontSize(readRootFontSize())
    }
    const observer = new ResizeObserver(updateLayout)
    observer.observe(scrollElement)
    updateLayout()
    return () => observer.disconnect()
  }, [scrollElement])

  const currentImageState = imageState.key === imageKey ? imageState : { key: imageKey, status: 'loading' as const, image: null }
  const paletteImage = currentImageState.image
  const visibleRect =
    dragRect ?? (activeTileset && selection?.tilesetName === activeTileset.name ? selectionRect(selection, activeTileset) : null)
  const normalized = visibleRect ? normalizeRect(visibleRect) : null
  const rows = activeTileset ? Math.max(1, Math.ceil(activeTileset.tileCount / activeTileset.columns)) : 1
  const paletteView = activeTileset ? (viewOverrides[activeTileset.name] ?? (prefersGridView(activeTileset) ? 'grid' : 'sheet')) : 'sheet'
  const scale = Math.max(0.5, paletteZoom)
  const gridGap = rootFontSize * 0.25
  const gridCellWidth = Math.max(rootFontSize * 2, (activeTileset?.tileWidth ?? 16) * scale + 2)
  const gridColumnCount = Math.max(1, Math.floor((Math.max(gridWidth, gridCellWidth) + gridGap) / (gridCellWidth + gridGap)))
  const gridRowContentHeight = Math.max(rootFontSize, (activeTileset?.tileHeight ?? 16) * scale) + rootFontSize * 1.125
  const gridRowCount = activeTileset ? Math.ceil(activeTileset.tileCount / gridColumnCount) : 0
  const gridVirtualizer = useVirtualizer({
    count: paletteView === 'grid' ? gridRowCount : 0,
    getScrollElement: () => scrollElement,
    estimateSize: () => gridRowContentHeight + gridGap,
    overscan: 1,
  })

  useEffect(() => {
    gridVirtualizer.measure()
  }, [gridCellWidth, gridColumnCount, gridRowContentHeight, gridVirtualizer])

  useEffect(() => {
    if (!activeTileset || paletteView !== 'grid' || selection?.tilesetName !== activeTileset.name) return
    gridVirtualizer.scrollToIndex(Math.floor(selection.startIndex / gridColumnCount), { align: 'auto' })
  }, [activeTileset, gridColumnCount, gridVirtualizer, paletteView, selection])

  if (!activeTileset) {
    return (
      <div className="map-tileset-palette-empty">
        <ImageOff className="h-4 w-4" aria-hidden="true" />
        <span>{labels.noTilesets}</span>
      </div>
    )
  }

  function commitRect(rect: SelectionRect) {
    const next = normalizeRect(rect)
    const startIndex = next.top * activeTileset.columns + next.left
    const maximumBottom = Math.floor((activeTileset.tileCount - 1) / activeTileset.columns)
    onSelectionChange({
      tilesetName: activeTileset.name,
      startIndex,
      width: next.right - next.left + 1,
      height: Math.min(next.bottom, maximumBottom) - next.top + 1,
    })
  }

  return (
    <section className="map-tileset-palette" aria-label={labels.tilesetPalette}>
      <div className="map-tileset-palette-heading">
        <div className="map-tileset-palette-title">
          <strong>{labels.tilesetPalette}</strong>
          {selection?.tilesetName === activeTileset.name ? (
            <span>{labels.tilesetSelection(selection.startIndex, selection.width, selection.height)}</span>
          ) : null}
        </div>
        <div
          className={cx('map-tileset-palette-switcher', compact && 'is-compact')}
          role="group"
          aria-label={labels.tileTileset(activeTileset.name)}
        >
          {availableTilesets.map((tileset) => (
            <TilesetThumb
              key={`${tileset.firstGid}:${tileset.name}`}
              name={tileset.name}
              imagePath={resolveTilesetImagePath(document, tileset)}
              active={tileset.name === activeTileset.name}
              locale={locale}
              errorFactory={labels.tilesetImageError}
              onSelect={() => onSelectionChange({ tilesetName: tileset.name, startIndex: 0, width: 1, height: 1 })}
            />
          ))}
        </div>
        <div className="map-tileset-palette-controls">
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
          <div className="map-tileset-palette-zoom" role="group" aria-label={viewportLabels.zoomLabel(paletteZoom)}>
            <button
              type="button"
              className="icon-button"
              aria-label={viewportLabels.zoomOut}
              title={viewportLabels.zoomOut}
              disabled={paletteZoom <= 0.5}
              onClick={() => setPaletteZoom((current) => Math.max(0.5, current - 0.5))}
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="map-tileset-palette-zoom-value"
              aria-label={viewportLabels.setOneToOne}
              title={viewportLabels.setOneToOne}
              onClick={() => setPaletteZoom(1)}
            >
              <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
              {Math.round(paletteZoom * 100)}%
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={viewportLabels.zoomIn}
              title={viewportLabels.zoomIn}
              disabled={paletteZoom >= 4}
              onClick={() => setPaletteZoom((current) => Math.min(4, current + 0.5))}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <div ref={setScrollElement} className={cx('map-tileset-palette-scroll', currentImageState.status !== 'ready' && 'is-state')}>
        {currentImageState.status === 'loading' ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-label={labels.loadingTileset} />
        ) : currentImageState.status === 'error' || !paletteImage ? (
          <span className="map-tileset-palette-error">
            <ImageOff className="h-4 w-4" aria-hidden="true" />
            {imagePath ? labels.tilesetImageError(imagePath) : labels.tilesetImageMissing}
          </span>
        ) : paletteView === 'grid' ? (
          <div
            className="map-tileset-palette-virtual"
            style={
              {
                height: `${gridVirtualizer.getTotalSize()}px`,
                '--map-tileset-image': `url(${JSON.stringify(paletteImage.src)})`,
                '--map-tileset-image-size': `${paletteImage.naturalWidth * paletteZoom}px ${paletteImage.naturalHeight * paletteZoom}px`,
              } as CSSProperties
            }
          >
            {gridVirtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                className="map-tileset-palette-virtual-row"
                style={{
                  height: `${gridRowContentHeight}px`,
                  gridTemplateColumns: `repeat(${gridColumnCount}, ${gridCellWidth}px)`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {Array.from({ length: gridColumnCount }, (_, columnIndex) => {
                  const tileIndex = virtualRow.index * gridColumnCount + columnIndex
                  if (tileIndex >= activeTileset.tileCount) return null
                  const sourceX =
                    (activeTileset.margin ?? 0) +
                    (tileIndex % activeTileset.columns) * (activeTileset.tileWidth + (activeTileset.spacing ?? 0))
                  const sourceY =
                    (activeTileset.margin ?? 0) +
                    Math.floor(tileIndex / activeTileset.columns) * (activeTileset.tileHeight + (activeTileset.spacing ?? 0))
                  const selected =
                    selection?.tilesetName === activeTileset.name &&
                    selection.startIndex === tileIndex &&
                    selection.width === 1 &&
                    selection.height === 1
                  return (
                    <button
                      key={tileIndex}
                      type="button"
                      className={cx('map-tileset-palette-cell', selected && 'is-selected')}
                      aria-label={labels.tileId(tileIndex)}
                      title={labels.tileId(tileIndex)}
                      aria-pressed={selected}
                      onClick={() => onSelectionChange({ tilesetName: activeTileset.name, startIndex: tileIndex, width: 1, height: 1 })}
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
              width: `${paletteImage.naturalWidth * paletteZoom}px`,
              height: `${paletteImage.naturalHeight * paletteZoom}px`,
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              event.currentTarget.setPointerCapture(event.pointerId)
              const cell = pointerCell(event, activeTileset)
              const next = { startColumn: cell.column, startRow: cell.row, endColumn: cell.column, endRow: cell.row }
              dragRef.current = next
              setDragRect(next)
            }}
            onPointerMove={(event) => {
              if (!dragRef.current) return
              const cell = pointerCell(event, activeTileset)
              const next = { ...dragRef.current, endColumn: cell.column, endRow: cell.row }
              dragRef.current = next
              setDragRect(next)
            }}
            onPointerUp={(event) => {
              if (!dragRef.current) return
              const cell = pointerCell(event, activeTileset)
              const next = { ...dragRef.current, endColumn: cell.column, endRow: cell.row }
              dragRef.current = null
              setDragRect(null)
              commitRect(next)
            }}
            onPointerCancel={() => {
              dragRef.current = null
              setDragRect(null)
            }}
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
    </section>
  )
}
