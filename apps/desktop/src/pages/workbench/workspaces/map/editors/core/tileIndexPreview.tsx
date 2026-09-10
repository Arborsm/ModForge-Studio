import { useEffect, useRef, useState } from 'react'
import { findTilesetForGid, resolveTilesetImagePath, stripTileGidFlags, type MapDocument, type MapTileset } from '@entities/map'
import { useEditorCopy, useLocale, useMapAuthoringCopy } from '@locales/provider'
import { appEvent } from '@platform/observability'
import { loadImage } from '@entities/map/ui/mapViewportHelpers'

/**
 * Capture row shared by the door/day-night dialogs: shows the cell or
 * rectangle picked on the canvas (or a hint when none was picked yet) plus a
 * small pick hint.
 */
export function PickedCellRow({
  layerName,
  selectedTile,
  selectedRect,
  label,
  hint,
}: {
  layerName: string
  selectedTile: { x: number; y: number } | null
  /** Picked rectangle; takes precedence over `selectedTile` when set. */
  selectedRect?: { x: number; y: number; width: number; height: number } | null
  /** Optional row label shown before the picked-cell summary. */
  label?: string
  /** Dialog-specific pick hint replacing the generic canvas hint. */
  hint?: string
}) {
  const copy = useMapAuthoringCopy().assetEditor.mapCards
  const summary = selectedRect
    ? copy.pickedRect(layerName, selectedRect.x, selectedRect.y, selectedRect.width, selectedRect.height)
    : selectedTile
      ? copy.pickedCell(layerName, selectedTile.x, selectedTile.y)
      : copy.pickedCellNone
  return (
    <div className="map-asset-picked-cell">
      {label ? <span className="map-asset-picked-cell-label">{label}</span> : null}
      <span>{summary}</span>
      <small>{hint ?? copy.pickCellHint}</small>
    </div>
  )
}

/**
 * Resolves the tileset a tile-index preview should crop from: the tileset
 * owning the layer's (x, y) gid when that layer exists and holds a tile and
 * can contain `tileIndex`; otherwise the first tileset whose tile count can
 * hold the index. Returns null when nothing can host it.
 */
export function resolveTileIndexTileset(
  renderDocument: MapDocument,
  layerName: string,
  x: number,
  y: number,
  tileIndex: number,
): MapTileset | null {
  const normalizedLayerName = layerName.trim().toLowerCase()
  const layer = renderDocument.layers.find((candidate) => candidate.name.trim().toLowerCase() === normalizedLayerName)
  if (layer && x >= 0 && y >= 0 && x < layer.width && y < layer.height) {
    const gid = stripTileGidFlags(layer.gids[y * layer.width + x] >>> 0)
    if (gid !== 0) {
      const owningTileset = findTilesetForGid(renderDocument.tilesets, gid)
      if (owningTileset && tileIndex >= 0 && tileIndex < owningTileset.tileCount) {
        return owningTileset
      }
    }
  }
  return renderDocument.tilesets.find((tileset) => tileIndex >= 0 && tileIndex < tileset.tileCount) ?? null
}

/** Crops one tileset-local tile (or a width×height tile region starting at it) into a 3x data URL; null when the canvas is unavailable. */
function renderTileIndexDataUrl(
  image: HTMLImageElement,
  tileset: MapTileset,
  tileIndex: number,
  regionWidth = 1,
  regionHeight = 1,
): string | null {
  const canvas = globalThis.document.createElement('canvas')
  const scale = 3
  canvas.width = tileset.tileWidth * regionWidth * scale
  canvas.height = tileset.tileHeight * regionHeight * scale
  const context = canvas.getContext('2d')
  if (!context) return null
  const sourceX = (tileset.margin ?? 0) + (tileIndex % tileset.columns) * (tileset.tileWidth + (tileset.spacing ?? 0))
  const sourceY = (tileset.margin ?? 0) + Math.floor(tileIndex / tileset.columns) * (tileset.tileHeight + (tileset.spacing ?? 0))
  const sourceWidth = tileset.tileWidth * regionWidth + (tileset.spacing ?? 0) * (regionWidth - 1)
  const sourceHeight = tileset.tileHeight * regionHeight + (tileset.spacing ?? 0) * (regionHeight - 1)
  context.imageSmoothingEnabled = false
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

export type TileIndexPreviewProps = {
  /** Render document whose tileset image paths are loadable data URLs. */
  renderDocument: MapDocument
  /** Layer whose (x, y) cell selects the owning tileset; may be missing in the document. */
  layerName: string
  /** Tile X of the referenced cell. */
  x: number
  /** Tile Y of the referenced cell. */
  y: number
  /** Tileset-local tile index to crop (day/night swap or door tile). */
  tileIndex: number
  /** Accessible label and tooltip for the preview image. */
  label: string
  /** When set, crops from the named tileset directly instead of resolving the owner from the layer cell. */
  tilesetName?: string
  /** Region size in tiles starting at `tileIndex`; defaults to a single tile. */
  region?: { width: number; height: number }
  /** Game root used to resolve dynamically referenced vanilla sheets; null leaves their previews blank. */
  gameRootPath?: string | null
}

/**
 * Hover-preview for one tileset-local tile index: crops the tile from the
 * tileset that owns the referenced layer cell (falling back to the first
 * tileset that can hold the index) and renders it at 3x as a data URL. When
 * `tilesetName` is set, that tileset is used directly instead of resolving
 * the owner from the layer cell. The tileset re-resolves on every
 * document/prop change, so tile edits and property edits reflect
 * immediately; loading and failure render a placeholder square.
 */
export function TileIndexPreview({
  renderDocument,
  layerName,
  x,
  y,
  tileIndex,
  label,
  tilesetName,
  region,
  gameRootPath = null,
}: TileIndexPreviewProps) {
  const locale = useLocale()
  const viewportCopy = useEditorCopy().viewportLabels
  const tileset = tilesetName
    ? (renderDocument.tilesets.find((candidate) => candidate.name === tilesetName) ?? null)
    : resolveTileIndexTileset(renderDocument, layerName, x, y, tileIndex)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  /** Identity of the image currently on screen; redundant reloads (parent re-renders from canvas hover etc.) are skipped instead of blanking the preview for a frame. */
  const loadedKeyRef = useRef<string | null>(null)

  const regionWidth = region?.width ?? 1
  const regionHeight = region?.height ?? 1
  useEffect(() => {
    if (!tileset) return undefined
    const imagePath = resolveTilesetImagePath(renderDocument, tileset, gameRootPath)
    if (!imagePath) return undefined
    const loadKey = `${imagePath}#${tileIndex}:${regionWidth}x${regionHeight}`
    if (loadedKeyRef.current === loadKey) return undefined
    let cancelled = false
    void loadImage(imagePath, locale, (failedPath) => viewportCopy.failedToLoadTilesetImage(failedPath))
      .then((image) => {
        if (cancelled) return
        const dataUrl = renderTileIndexDataUrl(image, tileset, tileIndex, regionWidth, regionHeight)
        if (cancelled || !dataUrl) return
        loadedKeyRef.current = loadKey
        setImageUrl(dataUrl)
      })
      .catch((error) => {
        if (!cancelled) {
          appEvent('warning', 'Failed to load map tile preview')
            .error(error)
            .context({ source: 'map-asset-map-cards', operation: 'load-tile-preview', path: imagePath })
            .emit({ notify: false })
        }
      })
    return () => {
      cancelled = true
    }
  }, [gameRootPath, locale, regionHeight, regionWidth, renderDocument, tileIndex, tileset, viewportCopy])

  if (!tileset || !imageUrl) {
    return <span className="map-asset-tile-ref-ph" aria-hidden="true" />
  }
  return <img className="map-asset-tile-ref-img" src={imageUrl} alt={label} title={label} draggable={false} />
}

/** One cell of a composed region preview: region-relative offset plus the tileset-local tile to draw. */
export type TileRegionPreviewCell = { dx: number; dy: number; tileIndex: number }

/** Composes per-cell tile crops into one width×height region image at 3x; cells omitted from `cells` stay transparent. */
function renderTileRegionDataUrl(
  image: HTMLImageElement,
  tileset: MapTileset,
  cells: readonly TileRegionPreviewCell[],
  width: number,
  height: number,
): string | null {
  const canvas = globalThis.document.createElement('canvas')
  const scale = 3
  canvas.width = tileset.tileWidth * width * scale
  canvas.height = tileset.tileHeight * height * scale
  const context = canvas.getContext('2d')
  if (!context) return null
  context.imageSmoothingEnabled = false
  const margin = tileset.margin ?? 0
  const spacing = tileset.spacing ?? 0
  for (const cell of cells) {
    const sourceX = margin + (cell.tileIndex % tileset.columns) * (tileset.tileWidth + spacing)
    const sourceY = margin + Math.floor(cell.tileIndex / tileset.columns) * (tileset.tileHeight + spacing)
    context.drawImage(
      image,
      sourceX,
      sourceY,
      tileset.tileWidth,
      tileset.tileHeight,
      cell.dx * tileset.tileWidth * scale,
      cell.dy * tileset.tileHeight * scale,
      tileset.tileWidth * scale,
      tileset.tileHeight * scale,
    )
  }
  return canvas.toDataURL('image/png')
}

/**
 * Composed preview of a width×height tile region: draws each cell's tile at
 * its region offset (unlike TileIndexPreview's contiguous crop, cells may
 * hold unrelated tiles and may be sparse — holes stay transparent). Used by
 * the day/night studio and card list to show a whole swapped area as one
 * image, the same way the animation editor shows composed frame regions.
 */
export function TileRegionPreview({
  renderDocument,
  tileset,
  width,
  height,
  cells,
  label,
  gameRootPath = null,
}: {
  /** Render document whose tileset image paths are loadable data URLs. */
  renderDocument: MapDocument
  /** Tileset all cell indices address; null renders the placeholder. */
  tileset: MapTileset | null
  /** Region size in tiles. */
  width: number
  height: number
  /** Cells to draw, addressed by region-relative offsets. */
  cells: readonly TileRegionPreviewCell[]
  /** Accessible label and tooltip for the preview image. */
  label: string
  /** Game root used to resolve dynamically referenced vanilla sheets; null leaves their previews blank. */
  gameRootPath?: string | null
}) {
  const locale = useLocale()
  const viewportCopy = useEditorCopy().viewportLabels
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  /** Identity of the region image currently on screen; identical re-renders skip the reload instead of blanking the preview. */
  const loadedKeyRef = useRef<string | null>(null)
  // Cell identity key so the effect only re-runs when the actual tiles change.
  const cellsKey = cells.map((cell) => `${cell.dx},${cell.dy}:${cell.tileIndex}`).join('|')

  useEffect(() => {
    if (!tileset) return undefined
    const imagePath = resolveTilesetImagePath(renderDocument, tileset, gameRootPath)
    if (!imagePath) return undefined
    const loadKey = `${imagePath}#${width}x${height}:${cellsKey}`
    if (loadedKeyRef.current === loadKey) return undefined
    let cancelled = false
    void loadImage(imagePath, locale, (failedPath) => viewportCopy.failedToLoadTilesetImage(failedPath))
      .then((image) => {
        if (cancelled) return
        const dataUrl = renderTileRegionDataUrl(image, tileset, cells, width, height)
        if (cancelled || !dataUrl) return
        loadedKeyRef.current = loadKey
        setImageUrl(dataUrl)
      })
      .catch((error) => {
        if (!cancelled) {
          appEvent('warning', 'Failed to load map tile region preview')
            .error(error)
            .context({ source: 'map-asset-map-cards', operation: 'load-tile-region-preview', path: imagePath })
            .emit({ notify: false })
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cells are tracked through cellsKey
  }, [cellsKey, gameRootPath, height, locale, renderDocument, tileset, viewportCopy, width])

  if (!tileset || !imageUrl) {
    return <span className="map-asset-tile-ref-ph" style={{ aspectRatio: `${width} / ${height}` }} aria-hidden="true" />
  }
  return <img className="map-asset-tile-ref-img" src={imageUrl} alt={label} title={label} draggable={false} />
}
