import { useEffect, useRef, useState } from 'react'
import { Grid3X3 } from 'lucide-react'
import type { LocaleCode } from '@locales/api'
import { resolveTilesetImagePath } from '../lib/assets'
import { getMapContentBounds } from '../lib/mapContentBounds'
import type { MapDocument, MapLayer } from '../lib/types'
import { loadImage, rasterizeTileLayers } from './mapViewportHelpers'
import type { LoadedTilesetImage } from './mapViewportTypes'

const THUMBNAIL_WIDTH = 64
const THUMBNAIL_HEIGHT = 48

type MapLayerThumbnailProps = {
  /** Render document whose tileset imagePath values are loadable (project-relative paths replaced with data URLs). */
  document: MapDocument
  /** The single tile layer rendered into the preview; bounds follow its own gids. */
  layer: MapLayer
  /** Locale used for localized tileset image resolution. */
  locale: LocaleCode
}

type RenderInput = {
  layer: MapLayer
  tilesets: MapDocument['tilesets']
  locale: LocaleCode
}

async function renderLayerThumbnail(document: MapDocument, layer: MapLayer, locale: LocaleCode) {
  const sortedTilesets = [...document.tilesets].sort((left, right) => left.firstGid - right.firstGid)
  const results = await Promise.allSettled(
    sortedTilesets.map(async (tileset) => {
      const path = resolveTilesetImagePath(document, tileset)
      if (!path) return null
      const image = await loadImage(path, locale, (failedPath) => `Failed to load tileset image: ${failedPath}`)
      return [tileset.firstGid, { image, tileset }] as const
    }),
  )
  const loadedTilesets: Array<readonly [number, LoadedTilesetImage]> = []
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) loadedTilesets.push(result.value)
  }
  if (loadedTilesets.length === 0) throw new Error('Map layer thumbnail has no loadable tilesets')

  const tilesetImages = Object.fromEntries(loadedTilesets)
  const contentBounds = getMapContentBounds(document, {
    layerIds: [layer.id],
    includeObjects: false,
    includeHiddenLayers: true,
    paddingTiles: 0,
  })
  const sourceBounds =
    contentBounds.width > 0 && contentBounds.height > 0
      ? contentBounds
      : {
          x: 0,
          y: 0,
          width: document.width * document.tileWidth,
          height: document.height * document.tileHeight,
        }
  const canvas = globalThis.document.createElement('canvas')
  if (
    !rasterizeTileLayers(canvas, document, [layer], sortedTilesets, tilesetImages, {
      sourceBounds,
      targetWidth: THUMBNAIL_WIDTH,
      targetHeight: THUMBNAIL_HEIGHT,
    })
  ) {
    throw new Error('Map layer thumbnail canvas is unavailable')
  }
  return canvas.toDataURL('image/png')
}

/**
 * Renders a single tile layer into a small pixelated preview (64×48 CSS px,
 * fit keep-ratio centered) through the shared viewport rasterizer. The source
 * crop follows the layer's own content bounds and falls back to the full map
 * when the bounds come back empty. Rasterization is skipped when no tileset
 * image loads or the layer has no non-empty tiles, leaving the placeholder.
 *
 * The document identity changes on every edit, so invalidation compares the
 * recorded render inputs (layer reference, document.tilesets reference,
 * locale) instead of re-rasterizing on every document mutation; unchanged
 * layers keep their previous data URL. The skip guard only applies once the
 * render for those inputs actually committed: under StrictMode the mount
 * effect runs twice and its first cleanup discards the in-flight promise, so
 * without the settled check the second run would skip re-rendering and the
 * thumbnail would stay on the placeholder forever.
 */
export function MapLayerThumbnail({ document, layer, locale }: MapLayerThumbnailProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const lastInputRef = useRef<RenderInput | null>(null)
  /** Whether the render for the recorded input committed (success or failure); a discarded in-flight render leaves this false and is retried. */
  const settledRef = useRef(false)

  useEffect(() => {
    const lastInput = lastInputRef.current
    if (
      settledRef.current &&
      lastInput &&
      lastInput.layer === layer &&
      lastInput.tilesets === document.tilesets &&
      lastInput.locale === locale
    ) {
      return
    }
    lastInputRef.current = { layer, tilesets: document.tilesets, locale }
    if (layer.nonEmptyTiles === 0) {
      settledRef.current = true
      setDataUrl(null)
      return
    }
    settledRef.current = false
    let cancelled = false
    void renderLayerThumbnail(document, layer, locale)
      .then((nextDataUrl) => {
        if (!cancelled) {
          settledRef.current = true
          setDataUrl(nextDataUrl)
        }
      })
      .catch(() => {
        if (!cancelled) {
          settledRef.current = true
          setDataUrl(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [document, layer, locale])

  if (dataUrl) {
    return <img className="map-asset-layer-thumbnail" src={dataUrl} alt="" draggable={false} />
  }
  return <Grid3X3 className="h-3.5 w-3.5" />
}
