import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { ImageOff, Loader2, Minus, Plus, ScanLine } from 'lucide-react'
import type { LocaleCode } from '@locales/api'
import { useEditorCopy } from '@locales/provider'
import { usePreferencesStore, type PaletteRecentSelection } from '@shared/lib/app-state'
import { cx } from '@shared/lib/helper'
import type { MapDocument, MapTileset } from '../lib/types'
import { resolveTilesetImagePath } from '../lib/assets'
import { MapTilesheetPicker, type MapTilesheetPickerProjectOption } from './MapTilesheetPicker'
import type { VanillaTilesheetEntry } from '../model/vanillaTilesheets'
import {
  cellFromSheetPointer,
  normalizeSelectionRect,
  pushRecentSelection,
  rememberTilesetSelection,
  selectionRectForSelection,
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

type MapTilesetPaletteProps = {
  document: MapDocument
  locale: LocaleCode
  selection: MapTilesetPaletteSelection | null
  onSelectionChange: (selection: MapTilesetPaletteSelection) => void
  /** Game root used to resolve dynamically referenced vanilla sheets; null disables their images and catalog rows. */
  gameRootPath?: string | null
  /** Attaches a vanilla catalog sheet as a dynamic reference; enables the catalog groups in the sheet picker. */
  onAttachGameSheet?: ((sheet: VanillaTilesheetEntry) => void) | null
  /** Project image choices for the sheet picker; omit to hide the project group. */
  projectImageOptions?: readonly MapTilesheetPickerProjectOption[]
  /** Attaches a project image as a new tileset. */
  onAddProjectImage?: ((relativePath: string) => void) | null
}

type RecentCellProps = {
  document: MapDocument
  tileset: MapTileset
  entry: PaletteRecentSelection
  locale: LocaleCode
  gameRootPath: string | null
  errorFactory: (path: string) => string
  onRestore: (entry: PaletteRecentSelection) => void
}

/** One thumbnail in the recent-use strip: the selection's tiles rendered as a mini grid. */
function RecentCell({ document, tileset, entry, locale, gameRootPath, errorFactory, onRestore }: RecentCellProps) {
  const imagePath = resolveTilesetImagePath(document, tileset, gameRootPath)
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

/** Renders the docked whole-sheet palette: picker, recents, draggable sheet image, and zoom footer. */
export function MapTilesetPalette({
  document,
  locale,
  selection,
  onSelectionChange,
  gameRootPath = null,
  onAttachGameSheet = null,
  projectImageOptions = [],
  onAddProjectImage = null,
}: MapTilesetPaletteProps) {
  const editorCopy = useEditorCopy()
  const labels = editorCopy.studioDesk.mapPatchEditor
  const viewportLabels = editorCopy.viewportLabels
  const palettePrefs = usePreferencesStore((state) => state.mapEditorPalette)
  const setPalettePrefs = usePreferencesStore((state) => state.setMapEditorPalette)
  const availableTilesets = document.tilesets.filter((tileset) => tileset.columns > 0 && tileset.tileCount > 0)
  const fallbackName = availableTilesets[0]?.name ?? ''
  const requestedName = selection?.tilesetName ?? fallbackName
  const activeTileset = availableTilesets.find((tileset) => tileset.name === requestedName) ?? availableTilesets[0] ?? null
  const imagePath = activeTileset ? resolveTilesetImagePath(document, activeTileset, gameRootPath) : null
  const imageKey = `${locale}:${gameRootPath ?? ''}:${imagePath ?? ''}`
  const [imageState, setImageState] = useState<ImageState>({ key: imageKey, status: 'loading', image: null })
  const [dragRect, setDragRect] = useState<TilesetSelectionRect | null>(null)
  const dragRef = useRef<TilesetSelectionRect | null>(null)

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

  const currentImageState = imageState.key === imageKey ? imageState : { key: imageKey, status: 'loading' as const, image: null }
  const paletteImage = currentImageState.image
  const zoom = palettePrefs.zoom
  const rows = activeTileset ? Math.max(1, Math.ceil(activeTileset.tileCount / activeTileset.columns)) : 1
  const currentSelection =
    selection?.tilesetName === activeTileset?.name ? selection : (palettePrefs.perTilesetSelections[activeTileset?.name ?? ''] ?? null)
  const visibleRect: TilesetSelectionRect | null =
    dragRect ?? (activeTileset && currentSelection ? selectionRectForSelection(currentSelection, activeTileset.columns) : null)
  const normalized: NormalizedSelectionRect | null = visibleRect ? normalizeSelectionRect(visibleRect) : null

  if (!activeTileset) {
    return (
      <div className="map-tileset-palette-empty">
        <ImageOff className="h-4 w-4" aria-hidden="true" />
        <span>{labels.noTilesets}</span>
      </div>
    )
  }

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

  function handleSheetPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const cell = sheetPointerCell(event)
    const next = { startColumn: cell.column, startRow: cell.row, endColumn: cell.column, endRow: cell.row }
    dragRef.current = next
    setDragRect(next)
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

  return (
    <section className="map-tileset-palette" aria-label={labels.tilesetPalette}>
      <div className="map-tileset-palette-head">
        <div className="map-tileset-palette-sheets" role="group" aria-label={labels.tileTileset(activeTileset.name)}>
          <MapTilesheetPicker
            attachedTilesets={availableTilesets}
            activeTilesetName={activeTileset.name}
            projectImageOptions={projectImageOptions}
            gameSheetsEnabled={gameRootPath !== null}
            onPickAttached={switchTileset}
            onPickGameSheet={onAttachGameSheet ?? undefined}
            onPickProjectImage={onAddProjectImage ?? undefined}
            triggerLabel={activeTileset.name}
            triggerTitle={labels.sheetPickerSwitch}
          />
        </div>
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
                gameRootPath={gameRootPath}
                errorFactory={labels.tilesetImageError}
                onRestore={restoreRecent}
              />
            )
          })}
        </div>
      ) : null}
      <div className={cx('map-tileset-palette-scroll', currentImageState.status !== 'ready' && 'is-state')}>
        {currentImageState.status === 'loading' ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-label={labels.loadingTileset} />
        ) : currentImageState.status === 'error' || !paletteImage ? (
          <span className="map-tileset-palette-error">
            <ImageOff className="h-4 w-4" aria-hidden="true" />
            {imagePath ? labels.tilesetImageError(imagePath) : labels.tilesetImageMissing}
          </span>
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
    </section>
  )
}
