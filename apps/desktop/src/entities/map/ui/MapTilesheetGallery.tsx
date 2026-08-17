import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, ImageOff, Loader2, Search } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { LocaleCode } from '@locales/api'
import type { MapDocument, MapTileset } from '../lib/types'
import { resolveTilesetImagePath } from '../lib/assets'
import { gameSheetImagePath, gameSheetKeyOfTileset } from '../lib/gameSheets'
import { loadImage } from './mapViewportHelpers'
import {
  getTilesheetCatalog,
  subscribeTilesheetCatalog,
  vanillaTilesheetHasEvenSplit,
  vanillaTilesheetSplit,
  type VanillaTilesheetEntry,
} from '../model/vanillaTilesheets'
import type { MapTilesheetPickerProjectOption } from './MapTilesheetPicker'

type MapTilesheetGalleryProps = {
  document: MapDocument
  locale: LocaleCode
  gameRootPath: string | null
  attachedTilesets: readonly MapTileset[]
  activeTilesetName: string | null
  projectImageOptions: readonly MapTilesheetPickerProjectOption[]
  gameSheetsEnabled: boolean
  onPickAttached: (name: string) => void
  onPickGameSheet: ((sheet: VanillaTilesheetEntry) => void) | null
  onPickProjectImage: ((relativePath: string) => void) | null
  onClose: () => void
  onHoverTileset?: ((imageSrc: string | null) => void) | null
}

type ThumbnailState = {
  status: 'loading' | 'ready' | 'error'
  image: HTMLImageElement | null
}

/** One sheet card in the gallery: thumbnail + name + metadata. */
function SheetCard({
  imagePath,
  locale,
  errorFactory,
  name,
  meta,
  badge,
  isActive,
  disabledTitle,
  onClick,
  onHover,
}: {
  imagePath: string | null
  locale: LocaleCode
  errorFactory: (path: string) => string
  name: string
  meta: string | null
  badge: string | null
  isActive: boolean
  disabledTitle: string | null
  onClick: () => void
  onHover?: (hovering: boolean, imageSrc: string | null) => void
}) {
  const [state, setState] = useState<ThumbnailState>({ status: 'loading', image: null })

  useEffect(() => {
    if (!imagePath) {
      setState({ status: 'error', image: null })
      return
    }
    let current = true
    setState({ status: 'loading', image: null })
    void loadImage(imagePath, locale, errorFactory)
      .then((image) => {
        if (current) setState({ status: 'ready', image })
      })
      .catch(() => {
        if (current) setState({ status: 'error', image: null })
      })
    return () => {
      current = false
    }
  }, [errorFactory, imagePath, locale])

  return (
    <button
      type="button"
      className={cx('map-tilesheet-gallery-card', isActive && 'is-active', disabledTitle && 'is-disabled')}
      disabled={Boolean(disabledTitle)}
      title={disabledTitle ?? undefined}
      onClick={onClick}
      onPointerEnter={() => onHover?.(true, state.status === 'ready' && state.image ? state.image.src : null)}
      onPointerLeave={() => onHover?.(false, null)}
    >
      <span className="map-tilesheet-gallery-card-thumb">
        {state.status === 'loading' ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : state.status === 'error' || !state.image ? (
          <ImageOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <img src={state.image.src} alt={name} draggable={false} />
        )}
      </span>
      <span className="map-tilesheet-gallery-card-info">
        <span className="map-tilesheet-gallery-card-name">{name}</span>
        {meta ? <small>{meta}</small> : null}
        {badge ? <span className={cx('map-tilesheet-gallery-card-badge', isActive && 'is-active')}>{badge}</span> : null}
      </span>
    </button>
  )
}

/**
 * Inline sheet gallery: replaces the palette scroll area with a scrollable
 * grid of sheet thumbnails. Attached sheets show their actual image; game
 * catalog and project image cards show metadata. Search filters by name.
 */
export function MapTilesheetGallery({
  document,
  locale,
  gameRootPath,
  attachedTilesets,
  activeTilesetName,
  projectImageOptions,
  gameSheetsEnabled,
  onPickAttached,
  onPickGameSheet,
  onPickProjectImage,
  onClose,
  onHoverTileset = null,
}: MapTilesheetGalleryProps) {
  const labels = useEditorCopy().studioDesk.mapPatchEditor
  const catalog = useSyncExternalStore(subscribeTilesheetCatalog, getTilesheetCatalog)
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()

  function matches(text: string) {
    return normalizedQuery === '' || text.toLowerCase().includes(normalizedQuery)
  }

  const attachedGameSheets = useMemo(() => {
    const index = new Map<string, string>()
    for (const tileset of attachedTilesets) {
      const key = gameSheetKeyOfTileset(tileset)
      if (key) index.set(key.toLowerCase(), tileset.name)
    }
    return index
  }, [attachedTilesets])

  const hasCatalogGroups = Boolean(onPickGameSheet)

  const gameMaps = useMemo(
    () => (hasCatalogGroups ? catalog.filter((sheet) => sheet.group === 'maps' && matches(sheet.name)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, hasCatalogGroups, normalizedQuery],
  )
  const gameTilesheets = useMemo(
    () => (hasCatalogGroups ? catalog.filter((sheet) => sheet.group === 'tilesheets' && matches(sheet.name)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, hasCatalogGroups, normalizedQuery],
  )
  const projectRows = useMemo(
    () => projectImageOptions.filter((option) => matches(option.label) || matches(option.value)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectImageOptions, normalizedQuery],
  )
  const attachedRows = useMemo(
    () => attachedTilesets.filter((tileset) => matches(tileset.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attachedTilesets, normalizedQuery],
  )

  const totalRows = attachedRows.length + gameMaps.length + gameTilesheets.length + projectRows.length

  return (
    <div className="map-tilesheet-gallery">
      <div className="map-tilesheet-gallery-head">
        <button
          type="button"
          className="icon-button"
          aria-label={labels.sheetGalleryBack}
          title={labels.sheetGalleryBack}
          onClick={onClose}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <label className="map-tilesheet-gallery-search">
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder={labels.searchTilesets}
            aria-label={labels.searchTilesets}
            spellCheck={false}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="map-tilesheet-gallery-scroll">
        {totalRows === 0 ? (
          <p className="map-tilesheet-gallery-empty">{labels.sheetPickerEmpty}</p>
        ) : (
          <>
            {attachedRows.length > 0 ? (
              <section className="map-tilesheet-gallery-group">
                <strong>{labels.sheetPickerAttachedGroup}</strong>
                <div className="map-tilesheet-gallery-grid">
                  {attachedRows.map((tileset) => (
                    <SheetCard
                      key={`attached:${tileset.name}`}
                      imagePath={resolveTilesetImagePath(document, tileset, gameRootPath)}
                      locale={locale}
                      errorFactory={labels.tilesetImageError}
                      name={tileset.name}
                      meta={labels.sheetPickerTileCount(tileset.tileCount)}
                      badge={gameSheetKeyOfTileset(tileset) ? labels.sheetPickerGameBadge : null}
                      isActive={tileset.name === activeTilesetName}
                      disabledTitle={null}
                      onClick={() => {
                        onPickAttached(tileset.name)
                        onClose()
                      }}
                      onHover={(hovering, imageSrc) => onHoverTileset?.(hovering ? imageSrc : null)}
                    />
                  ))}
                </div>
              </section>
            ) : null}
            {gameMaps.length > 0 ? (
              <section className="map-tilesheet-gallery-group">
                <strong>{labels.sheetPickerGameMapsGroup}</strong>
                <div className="map-tilesheet-gallery-grid">
                  {gameMaps.map((sheet) => {
                    const attachedName = attachedGameSheets.get(sheet.key.toLowerCase())
                    const evenSplit = vanillaTilesheetHasEvenSplit(sheet)
                    const split = vanillaTilesheetSplit(sheet)
                    const disabled = !evenSplit ? labels.sheetPickerUnevenSplit : !gameSheetsEnabled ? labels.sheetPickerNoGameRoot : null
                    return (
                      <SheetCard
                        key={`game:${sheet.key}`}
                        imagePath={gameSheetsEnabled ? gameSheetImagePath(sheet.key, gameRootPath!) : null}
                        locale={locale}
                        errorFactory={labels.tilesetImageError}
                        name={sheet.name}
                        meta={labels.sheetPickerSheetMeta(sheet.imageWidth, sheet.imageHeight, split.columns, split.rows)}
                        badge={attachedName != null ? labels.sheetPickerAttachedBadge : null}
                        isActive={attachedName === activeTilesetName}
                        disabledTitle={disabled}
                        onClick={() => {
                          if (attachedName != null) {
                            onPickAttached(attachedName)
                          } else if (evenSplit && gameSheetsEnabled && onPickGameSheet) {
                            onPickGameSheet(sheet)
                          }
                          onClose()
                        }}
                        onHover={(hovering, imageSrc) => onHoverTileset?.(hovering ? imageSrc : null)}
                      />
                    )
                  })}
                </div>
              </section>
            ) : null}
            {gameTilesheets.length > 0 ? (
              <section className="map-tilesheet-gallery-group">
                <strong>{labels.sheetPickerGameTilesheetsGroup}</strong>
                <div className="map-tilesheet-gallery-grid">
                  {gameTilesheets.map((sheet) => {
                    const attachedName = attachedGameSheets.get(sheet.key.toLowerCase())
                    const evenSplit = vanillaTilesheetHasEvenSplit(sheet)
                    const split = vanillaTilesheetSplit(sheet)
                    const disabled = !evenSplit ? labels.sheetPickerUnevenSplit : !gameSheetsEnabled ? labels.sheetPickerNoGameRoot : null
                    return (
                      <SheetCard
                        key={`game:${sheet.key}`}
                        imagePath={gameSheetsEnabled ? gameSheetImagePath(sheet.key, gameRootPath!) : null}
                        locale={locale}
                        errorFactory={labels.tilesetImageError}
                        name={sheet.name}
                        meta={labels.sheetPickerSheetMeta(sheet.imageWidth, sheet.imageHeight, split.columns, split.rows)}
                        badge={attachedName != null ? labels.sheetPickerAttachedBadge : null}
                        isActive={attachedName === activeTilesetName}
                        disabledTitle={disabled}
                        onClick={() => {
                          if (attachedName != null) {
                            onPickAttached(attachedName)
                          } else if (evenSplit && gameSheetsEnabled && onPickGameSheet) {
                            onPickGameSheet(sheet)
                          }
                          onClose()
                        }}
                        onHover={(hovering, imageSrc) => onHoverTileset?.(hovering ? imageSrc : null)}
                      />
                    )
                  })}
                </div>
              </section>
            ) : null}
            {projectRows.length > 0 && onPickProjectImage ? (
              <section className="map-tilesheet-gallery-group">
                <strong>{labels.sheetPickerProjectGroup}</strong>
                <div className="map-tilesheet-gallery-grid">
                  {projectRows.map((option) => (
                    <SheetCard
                      key={`project:${option.value}`}
                      imagePath={null}
                      locale={locale}
                      errorFactory={labels.tilesetImageError}
                      name={option.label}
                      meta={null}
                      badge={null}
                      isActive={false}
                      disabledTitle={null}
                      onClick={() => {
                        onPickProjectImage(option.value)
                        onClose()
                      }}
                      onHover={(hovering, imageSrc) => onHoverTileset?.(hovering ? imageSrc : null)}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
