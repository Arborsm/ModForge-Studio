/**
 * @file Tileset palette component: interactive tileset sheet grid for picking
 * tiles, managing favorite/recent selections, and uploading custom tilesheets.
 */

import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Download, ImageOff, LayoutGrid, Star, Upload } from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import type { LocaleCode } from '@locales/api'
import { appEvent } from '@platform/observability'
import { useEditorCopy } from '@locales/provider'
import { usePreferencesStore, type PaletteRecentSelection } from '@shared/lib/app-state'
import { cx } from '@shared/lib/helper'
import type { MapDocument, MapTileset } from '../lib/types'
import { resolveTilesetImagePath } from '../lib/assets'
import { extractAnimationGroups } from '../lib/animationGroups'
import { type MapTilesheetPickerProjectOption } from './MapTilesheetPicker'
import { MapTilesheetGallery } from './MapTilesheetGallery'
import { SheetGridCanvas } from './SheetGridCanvas'
import type { VanillaTilesheetEntry } from '../model/vanillaTilesheets'
import {
  isFavoriteSelection,
  mergeFavoriteSelections,
  normalizeSelectionRect,
  pushFavoriteSelection,
  pushRecentSelection,
  removeFavoriteSelection,
  removeRecentSelection,
  rememberTilesetSelection,
  selectionRectForSelection,
  tilesetSelectionFromRect,
  type NormalizedSelectionRect,
  type TilesetSelectionRect,
} from '../lib/paletteSelection'
import { loadImage } from './mapViewportHelpers'

export type MapTilesetPaletteSelection = PaletteRecentSelection

type MapTilesetPaletteProps = {
  document: MapDocument
  locale: LocaleCode
  selection: MapTilesetPaletteSelection | null
  onSelectionChange: (selection: MapTilesetPaletteSelection | null) => void
  /** Game root used to resolve dynamically referenced vanilla sheets; null disables their images and catalog rows. */
  gameRootPath?: string | null
  /** Attaches a vanilla catalog sheet as a dynamic reference; enables the catalog groups in the sheet picker. */
  onAttachGameSheet?: ((sheet: VanillaTilesheetEntry) => void) | null
  /** Project image choices for the sheet picker; omit to hide the project group. */
  projectImageOptions?: readonly MapTilesheetPickerProjectOption[]
  /** Attaches a project image as a new tileset. */
  onAddProjectImage?: ((relativePath: string) => void) | null
  /** Removes a tileset by name; omitted in session modes without tileset management. */
  onRemoveTileset?: ((name: string) => void) | null
  /** Replaces a tileset's image; reuses the add-tileset flow with a replaceName. */
  onReplaceTilesetImage?: ((relativePath: string, replaceName: string) => void) | null
  /** Requests the host to switch the Inspector to the tilesets tab for this sheet. */
  onEditTilesetInInspector?: ((name: string) => void) | null
  /** Notifies the host that a sheet is being hovered in the gallery; null clears the preview. */
  onHoverTileset?: ((imageSrc: string | null) => void) | null
  /** Notifies the host that the gallery selection mode is active (overlay backdrop). */
  onGalleryModeChange?: ((active: boolean) => void) | null
}

type RecentCellProps = {
  document: MapDocument
  tileset: MapTileset
  entry: PaletteRecentSelection
  locale: LocaleCode
  gameRootPath: string | null
  errorFactory: (path: string) => string
  onRestore: (entry: PaletteRecentSelection) => void
  isFavorite: boolean
  onToggleFavorite: (entry: PaletteRecentSelection) => void
  /** Tile pixel size for each cell; 28 for recent strip, 40 for favorites grid. */
  cellPx?: number
  /** Whether to show the tileset name label below the thumbnail (favorites page). */
  showLabel?: boolean
}

/** One thumbnail in the recent-use strip: the selection's tiles rendered as a mini grid. */
function RecentCell({
  document,
  tileset,
  entry,
  locale,
  gameRootPath,
  errorFactory,
  onRestore,
  isFavorite,
  onToggleFavorite,
  cellPx = 28,
  showLabel = false,
}: RecentCellProps) {
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
      .catch((error) => {
        if (current) {
          appEvent('warning', 'Failed to load tileset palette image')
            .error(error)
            .context({ source: 'map-tileset-palette', operation: 'load-image', path: imagePath })
            .emit({ notify: false })
          setImageState({ status: 'error', image: null })
        }
      })
    return () => {
      current = false
    }
  }, [errorFactory, imagePath, locale])

  const spacing = tileset.spacing ?? 0
  const margin = tileset.margin ?? 0
  const startCol = entry.startIndex % tileset.columns
  const startRow = Math.floor(entry.startIndex / tileset.columns)
  // Crop origin in source pixels (top-left of the selection rect).
  const cropX = margin + startCol * (tileset.tileWidth + spacing)
  const cropY = margin + startRow * (tileset.tileHeight + spacing)

  // Render the entire selection as a single background-cropped element so
  // multi-tile selections appear seamless — no gaps between cells.
  // For 1x1 selections in the recent strip, scale up for better visibility.
  // For large selections, cap the per-cell size so the thumbnail fits the strip.
  const MAX_CELL_PX = cellPx === 28 ? 48 : cellPx
  const baseCellPx = cellPx === 28 && entry.width === 1 && entry.height === 1 ? 48 : cellPx
  // Cap: if the total render width/height exceeds 2.5x the strip height, shrink.
  const maxRenderDim = MAX_CELL_PX * 2.5
  const naturalRenderW = entry.width * baseCellPx
  const naturalRenderH = entry.height * baseCellPx
  const capScale = Math.min(1, maxRenderDim / Math.max(naturalRenderW, naturalRenderH))
  const CELL_PX = Math.round(baseCellPx * capScale)
  const scale = CELL_PX / tileset.tileWidth
  const scaledW = imageState.image ? imageState.image.naturalWidth * scale : 0
  const scaledH = imageState.image ? imageState.image.naturalHeight * scale : 0
  const renderW = entry.width * CELL_PX
  const renderH = entry.height * CELL_PX

  return (
    <span className={cx('map-tileset-palette-recent-wrapper', showLabel && 'has-label')}>
      <button
        type="button"
        className={cx('map-tileset-palette-recent-star', isFavorite && 'is-active')}
        onClick={(e) => {
          e.stopPropagation()
          onToggleFavorite(entry)
        }}
        aria-label={isFavorite ? 'Unstar' : 'Star'}
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Star className="h-3 w-3" aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
      <button
        type="button"
        className="map-tileset-palette-recent"
        style={{
          width: `${renderW + 2}px`,
          height: `${renderH + 2}px`,
        }}
        onClick={() => onRestore(entry)}
      >
        {imageState.status === 'ready' && imageState.image ? (
          <i
            style={{
              width: `${renderW}px`,
              height: `${renderH}px`,
              backgroundImage: `url(${JSON.stringify(imageState.image!.src)})`,
              backgroundSize: `${scaledW}px ${scaledH}px`,
              backgroundPosition: `-${cropX * scale}px -${cropY * scale}px`,
            }}
            aria-hidden="true"
          />
        ) : (
          <span className="map-tileset-palette-recent-fallback">
            {entry.width}×{entry.height}
          </span>
        )}
      </button>
      {showLabel ? <span className="map-tileset-palette-recent-label">{entry.tilesetName}</span> : null}
    </span>
  )
}

/** Renders the docked whole-sheet palette: sheet tabs, recents, draggable sheet image with hover magnifier, and zoom footer. */
export function MapTilesetPalette({
  document,
  locale,
  selection,
  onSelectionChange,
  gameRootPath = null,
  onAttachGameSheet = null,
  projectImageOptions = [],
  onAddProjectImage = null,
  onRemoveTileset = null,
  onReplaceTilesetImage = null,
  onEditTilesetInInspector = null,
  onHoverTileset = null,
  onGalleryModeChange = null,
}: MapTilesetPaletteProps) {
  const editorCopy = useEditorCopy()
  const labels = editorCopy.studioDesk.mapPatchEditor
  const palettePrefs = usePreferencesStore((state) => state.mapEditorPalette)
  const setPalettePrefs = usePreferencesStore((state) => state.setMapEditorPalette)
  const availableTilesets = document.tilesets.filter((tileset) => tileset.columns > 0 && tileset.tileCount > 0)
  const fallbackName = availableTilesets[0]?.name ?? ''
  const requestedName = selection?.tilesetName ?? fallbackName
  const activeTileset = availableTilesets.find((tileset) => tileset.name === requestedName) ?? availableTilesets[0] ?? null
  const animationGroups = useMemo(() => (activeTileset ? extractAnimationGroups(activeTileset) : []), [activeTileset])
  const [dragRect, setDragRect] = useState<TilesetSelectionRect | null>(null)
  // Sheet gallery view: replaces the palette scroll area with a grid of sheet thumbnails.
  const [showGallery, setShowGallery] = useState(false)
  // Favorites tab: when active, shows a grid of starred selections instead of a sheet.
  const [showFavorites, setShowFavorites] = useState(false)

  useEffect(() => {
    onGalleryModeChange?.(showGallery)
    if (!showGallery) onHoverTileset?.(null)
  }, [showGallery, onGalleryModeChange, onHoverTileset])

  // Switching to favorites or gallery clears the active sheet view.
  function activateFavorites() {
    setShowFavorites((current) => !current)
    setShowGallery(false)
  }

  function activateTileset(name: string) {
    setShowFavorites(false)
    setShowGallery(false)
    switchTileset(name)
  }
  const zoom = palettePrefs.zoom
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
  const favoriteEntries = palettePrefs.favorites.filter((entry) => availableTilesets.some((tileset) => tileset.name === entry.tilesetName))

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

  /** Removes a recent selection from the preferences store. */
  function removeRecentEntry(entry: PaletteRecentSelection) {
    const prefs = usePreferencesStore.getState().mapEditorPalette
    setPalettePrefs({ recents: removeRecentSelection(prefs.recents, entry) })
  }

  /** Toggles favorite status for a selection entry. */
  function toggleFavorite(entry: PaletteRecentSelection) {
    const prefs = usePreferencesStore.getState().mapEditorPalette
    const favorites = isFavoriteSelection(prefs.favorites, entry)
      ? removeFavoriteSelection(prefs.favorites, entry)
      : pushFavoriteSelection(prefs.favorites, entry)
    setPalettePrefs({ favorites })
  }

  /** Removes a favorite entry by identity. */
  function removeFavoriteEntry(entry: PaletteRecentSelection) {
    const prefs = usePreferencesStore.getState().mapEditorPalette
    setPalettePrefs({ favorites: removeFavoriteSelection(prefs.favorites, entry) })
  }

  /** Exports favorites as a downloadable JSON file. */
  function exportFavorites() {
    const prefs = usePreferencesStore.getState().mapEditorPalette
    const json = JSON.stringify({ version: 1, favorites: prefs.favorites }, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = globalThis.document.createElement('a')
    a.href = url
    a.download = 'map-palette-favorites.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  /** Imports favorites from a JSON file selected by the user. */
  function importFavorites() {
    const input = globalThis.document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      void file.text().then((text) => {
        try {
          const parsed = JSON.parse(text) as unknown
          if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as Record<string, unknown>).favorites)) {
            return
          }
          const imported = (parsed as { favorites: unknown[] }).favorites
            .map((entry) => {
              if (typeof entry !== 'object' || entry === null) return null
              const e = entry as Record<string, unknown>
              if (
                typeof e.tilesetName !== 'string' ||
                typeof e.startIndex !== 'number' ||
                typeof e.width !== 'number' ||
                typeof e.height !== 'number'
              )
                return null
              return { tilesetName: e.tilesetName, startIndex: e.startIndex, width: e.width, height: e.height } as PaletteRecentSelection
            })
            .filter((entry): entry is PaletteRecentSelection => entry !== null)
          if (imported.length === 0) return
          const prefs = usePreferencesStore.getState().mapEditorPalette
          setPalettePrefs({ favorites: mergeFavoriteSelections(prefs.favorites, imported) })
          // observability-exempt: 导入的调色板收藏 JSON 或条目字段非法时跳过本次导入，避免覆盖现有 favorites
        } catch {
          // Ignore malformed JSON
        }
      })
    }
    input.click()
  }

  /** Whether the sheet tab context menu should show management items. */
  const tabManagementEnabled = Boolean(onRemoveTileset || onReplaceTilesetImage || onEditTilesetInInspector)

  return (
    <section className="map-tileset-palette" aria-label={labels.tilesetPalette} data-guide="map-tileset-palette">
      <div className="map-tileset-palette-head">
        <div className="map-tileset-palette-tabs" role="tablist" aria-label={labels.tilesetPalette}>
          {availableTilesets.map((tileset) => {
            const isActive = tileset.name === activeTileset.name
            const tabContextMenu = tabManagementEnabled ? (
              <ContextMenu.Portal>
                <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
                  {onEditTilesetInInspector ? (
                    <ContextMenu.Item className="context-menu-item" onSelect={() => onEditTilesetInInspector(tileset.name)}>
                      {labels.sheetTabEditInInspector}
                    </ContextMenu.Item>
                  ) : null}
                  {onReplaceTilesetImage && projectImageOptions.length > 0 ? (
                    <ContextMenu.Sub>
                      <ContextMenu.SubTrigger className="context-menu-item context-menu-subtrigger">
                        {labels.sheetTabReplaceImage}
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </ContextMenu.SubTrigger>
                      <ContextMenu.Portal>
                        <ContextMenu.SubContent className="context-menu-content context-menu-subcontent" collisionPadding={12}>
                          {projectImageOptions.map((option) => (
                            <ContextMenu.Item
                              key={option.value}
                              className="context-menu-item"
                              onSelect={() => onReplaceTilesetImage(option.value, tileset.name)}
                            >
                              {option.label}
                            </ContextMenu.Item>
                          ))}
                        </ContextMenu.SubContent>
                      </ContextMenu.Portal>
                    </ContextMenu.Sub>
                  ) : null}
                  {onRemoveTileset ? (
                    <>
                      <ContextMenu.Separator className="context-menu-separator" />
                      <ContextMenu.Item
                        className="context-menu-item is-danger"
                        onSelect={() => {
                          if (globalThis.confirm(labels.sheetTabRemoveConfirm(tileset.name))) {
                            onRemoveTileset(tileset.name)
                          }
                        }}
                      >
                        {labels.sheetTabRemove}
                      </ContextMenu.Item>
                    </>
                  ) : null}
                </ContextMenu.Content>
              </ContextMenu.Portal>
            ) : null
            return (
              <ContextMenu.Root key={tileset.name}>
                <ContextMenu.Trigger asChild>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={cx('map-tileset-palette-tab', isActive && 'is-active')}
                    title={labels.sheetTabSwitch}
                    onClick={() => activateTileset(tileset.name)}
                  >
                    <span className="map-tileset-palette-tab-label">{tileset.name}</span>
                  </button>
                </ContextMenu.Trigger>
                {tabContextMenu}
              </ContextMenu.Root>
            )
          })}
        </div>
        <div className="map-tileset-palette-head-actions">
          {/* Favorites tab */}
          <button
            type="button"
            role="tab"
            aria-selected={showFavorites}
            className={cx('map-tileset-palette-tab-favorites', showFavorites && 'is-active')}
            title={labels.favoritesSection}
            onClick={activateFavorites}
          >
            <Star className="h-3.5 w-3.5" aria-hidden="true" fill={showFavorites ? 'currentColor' : 'none'} />
          </button>
          {/* Add-sheet gallery trigger */}
          <button
            type="button"
            className={cx('map-tileset-palette-tab-add', showGallery && 'is-active')}
            aria-label={labels.sheetTabAdd}
            title={labels.sheetTabAdd}
            aria-pressed={showGallery}
            onClick={() => setShowGallery((current) => !current)}
          >
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      {showFavorites ? (
        <div className="map-tileset-palette-favorites-page">
          <div className="map-tileset-palette-favorites-toolbar">
            <span className="map-tileset-palette-favorites-count">{labels.favoritesCount(favoriteEntries.length)}</span>
            <span className="map-tileset-palette-favorites-actions">
              <button
                type="button"
                className="icon-button"
                onClick={exportFavorites}
                aria-label={labels.favoritesExport}
                title={labels.favoritesExport}
                disabled={palettePrefs.favorites.length === 0}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={importFavorites}
                aria-label={labels.favoritesImport}
                title={labels.favoritesImport}
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          </div>
          {favoriteEntries.length > 0 ? (
            <div className="map-tileset-palette-favorites-grid">
              {favoriteEntries.map((entry) => {
                const tileset = availableTilesets.find((candidate) => candidate.name === entry.tilesetName)
                if (!tileset) return null
                return (
                  <ContextMenu.Root key={`fav:${entry.tilesetName}:${entry.startIndex}:${entry.width}:${entry.height}`}>
                    <ContextMenu.Trigger asChild>
                      <span>
                        <RecentCell
                          document={document}
                          tileset={tileset}
                          entry={entry}
                          locale={locale}
                          gameRootPath={gameRootPath}
                          errorFactory={labels.tilesetImageError}
                          onRestore={restoreRecent}
                          isFavorite
                          onToggleFavorite={toggleFavorite}
                          cellPx={40}
                          showLabel
                        />
                      </span>
                    </ContextMenu.Trigger>
                    <ContextMenu.Portal>
                      <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
                        <ContextMenu.Item className="context-menu-item" onSelect={() => restoreRecent(entry)}>
                          {labels.tilesetSelection(entry.startIndex, entry.width, entry.height)}
                        </ContextMenu.Item>
                        <ContextMenu.Separator className="context-menu-separator" />
                        <ContextMenu.Item className="context-menu-item is-danger" onSelect={() => removeFavoriteEntry(entry)}>
                          {labels.favoriteRemove}
                        </ContextMenu.Item>
                      </ContextMenu.Content>
                    </ContextMenu.Portal>
                  </ContextMenu.Root>
                )
              })}
            </div>
          ) : (
            <div className="map-tileset-palette-favorites-empty">
              <Star className="h-5 w-5" aria-hidden="true" />
              <span>{labels.favoritesEmpty}</span>
            </div>
          )}
        </div>
      ) : showGallery ? (
        <MapTilesheetGallery
          document={document}
          locale={locale}
          gameRootPath={gameRootPath}
          attachedTilesets={availableTilesets}
          activeTilesetName={activeTileset.name}
          projectImageOptions={projectImageOptions}
          gameSheetsEnabled={gameRootPath !== null}
          onPickAttached={activateTileset}
          onPickGameSheet={onAttachGameSheet}
          onPickProjectImage={onAddProjectImage}
          onClose={() => setShowGallery(false)}
          onHoverTileset={onHoverTileset}
        />
      ) : (
        <>
          <SheetGridCanvas
            document={document}
            tileset={activeTileset}
            locale={locale}
            gameRootPath={gameRootPath}
            zoomState={{ zoom, setZoom: (next) => setPalettePrefs({ zoom: next }) }}
            overlay={
              animationGroups.length > 0 ? (
                <>
                  {animationGroups.map((group, index) => {
                    const col = group.ownerTileId % activeTileset.columns
                    const row = Math.floor(group.ownerTileId / activeTileset.columns)
                    const sheetRows = Math.ceil(activeTileset.tileCount / activeTileset.columns)
                    return (
                      <span
                        key={index}
                        className="map-palette-anim-badge"
                        style={{
                          left: `${(col / activeTileset.columns) * 100}%`,
                          top: `${(row / sheetRows) * 100}%`,
                          width: `${(group.width / activeTileset.columns) * 100}%`,
                          height: `${(group.height / sheetRows) * 100}%`,
                        }}
                        aria-hidden="true"
                      />
                    )
                  })}
                </>
              ) : null
            }
            selectionRect={
              normalized
                ? {
                    startTileId: normalized.top * activeTileset.columns + normalized.left,
                    endTileId: normalized.bottom * activeTileset.columns + normalized.right,
                  }
                : null
            }
            onDragSelectionChange={(startTileId, endTileId) => {
              const startCol = startTileId % activeTileset.columns
              const startRow = Math.floor(startTileId / activeTileset.columns)
              const endCol = endTileId % activeTileset.columns
              const endRow = Math.floor(endTileId / activeTileset.columns)
              setDragRect({ startColumn: startCol, startRow, endColumn: endCol, endRow })
            }}
            onTileClick={(tileId) => {
              const col = tileId % activeTileset.columns
              const row = Math.floor(tileId / activeTileset.columns)
              commitSelection({ startColumn: col, startRow: row, endColumn: col, endRow: row })
            }}
            onDragSelectionEnd={(startTileId, endTileId) => {
              const startCol = startTileId % activeTileset.columns
              const startRow = Math.floor(startTileId / activeTileset.columns)
              const endCol = endTileId % activeTileset.columns
              const endRow = Math.floor(endTileId / activeTileset.columns)
              setDragRect(null)
              commitSelection({ startColumn: startCol, startRow, endColumn: endCol, endRow })
            }}
          />
          {/* Recent section — fixed height strip at the bottom */}
          {recentEntries.length > 0 ? (
            <div className="map-tileset-palette-recents">
              <span className="map-tileset-palette-recents-label">{labels.recentTilesets}</span>
              {recentEntries.map((entry) => {
                const tileset = availableTilesets.find((candidate) => candidate.name === entry.tilesetName)
                if (!tileset) return null
                const fav = isFavoriteSelection(palettePrefs.favorites, entry)
                return (
                  <ContextMenu.Root key={`recent:${entry.tilesetName}:${entry.startIndex}:${entry.width}:${entry.height}`}>
                    <ContextMenu.Trigger asChild>
                      <span>
                        <RecentCell
                          document={document}
                          tileset={tileset}
                          entry={entry}
                          locale={locale}
                          gameRootPath={gameRootPath}
                          errorFactory={labels.tilesetImageError}
                          onRestore={restoreRecent}
                          isFavorite={fav}
                          onToggleFavorite={toggleFavorite}
                        />
                      </span>
                    </ContextMenu.Trigger>
                    <ContextMenu.Portal>
                      <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
                        <ContextMenu.Item className="context-menu-item" onSelect={() => restoreRecent(entry)}>
                          {labels.tilesetSelection(entry.startIndex, entry.width, entry.height)}
                        </ContextMenu.Item>
                        <ContextMenu.Item className="context-menu-item" onSelect={() => toggleFavorite(entry)}>
                          {fav ? labels.favoriteRemove : labels.favoriteAdd}
                        </ContextMenu.Item>
                        <ContextMenu.Separator className="context-menu-separator" />
                        <ContextMenu.Item className="context-menu-item is-danger" onSelect={() => removeRecentEntry(entry)}>
                          {labels.recentRemove}
                        </ContextMenu.Item>
                      </ContextMenu.Content>
                    </ContextMenu.Portal>
                  </ContextMenu.Root>
                )
              })}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
