import type { LocaleCode } from '@locales/api'
import { createResourceCache } from '@shared/lib/resources'
import { getMapContentBounds } from '../lib/mapContentBounds'
import { resolveTilesetImagePath } from '../lib/assets'
import type { MapDocument } from '../lib/types'
import { getTransparentTileGids, loadImage, rasterizeTileLayers } from './mapViewportHelpers'
import type { LoadedTilesetImage } from './mapViewportTypes'

type MapThumbnailOptions = {
  cacheKey: string
  locale: LocaleCode
  width: number
  height: number
  /** Game root used to resolve dynamically referenced vanilla sheets; null leaves them out. */
  gameRootPath?: string | null
}

const thumbnailCache = createResourceCache<string>({
  maxEntries: 96,
  maxBytes: 96 * 240 * 176 * 4,
})

const pendingTasks: Array<() => void> = []
let activeTasks = 0
const MAX_CONCURRENT_THUMBNAILS = 2

function scheduleThumbnail<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeTasks += 1
      void task()
        .then(resolve, reject)
        .finally(() => {
          activeTasks -= 1
          pendingTasks.shift()?.()
        })
    }
    if (activeTasks < MAX_CONCURRENT_THUMBNAILS) run()
    else pendingTasks.push(run)
  })
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Map thumbnail encoding failed'))
    }, 'image/png')
  })
}

async function renderMapThumbnail(
  mapDocument: MapDocument,
  locale: LocaleCode,
  width: number,
  height: number,
  gameRootPath: string | null,
) {
  const sortedTilesets = [...mapDocument.tilesets].sort((left, right) => left.firstGid - right.firstGid)
  const results = await Promise.allSettled(
    sortedTilesets.map(async (tileset) => {
      const path = resolveTilesetImagePath(mapDocument, tileset, gameRootPath)
      if (!path) return null
      const image = await loadImage(path, locale, (failedPath) => `Failed to load tileset image: ${failedPath}`)
      return [tileset.firstGid, { image, tileset }] as const
    }),
  )
  const loadedTilesets: Array<readonly [number, LoadedTilesetImage]> = []
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) loadedTilesets.push(result.value)
  }
  if (loadedTilesets.length === 0) throw new Error('Map thumbnail has no loadable tilesets')

  const tilesetImages = Object.fromEntries(loadedTilesets)
  const visibleLayers = mapDocument.layers.filter((layer) => layer.visible)
  const layers = visibleLayers.length > 0 ? visibleLayers : mapDocument.layers
  const includeHiddenLayers = visibleLayers.length === 0
  const transparentTileGids = getTransparentTileGids(sortedTilesets, tilesetImages) ?? undefined
  const bounds = getMapContentBounds(mapDocument, {
    layerIds: layers.map((layer) => layer.id),
    includeObjects: false,
    includeHiddenLayers,
    paddingTiles: 1,
    transparentTileGids,
  })
  const canvas = document.createElement('canvas')
  if (
    !rasterizeTileLayers(canvas, mapDocument, layers, sortedTilesets, tilesetImages, {
      sourceBounds: bounds,
      targetWidth: width,
      targetHeight: height,
    })
  ) {
    throw new Error('Map thumbnail canvas is unavailable')
  }
  const blob = await canvasToBlob(canvas)
  return { blob, byteSize: width * height * 4 }
}

/** Renders a centered, bounded map preview through the viewport tile renderer and caches its Blob URL. */
export function loadMapThumbnail(mapDocument: MapDocument, options: MapThumbnailOptions) {
  const gameRootPath = options.gameRootPath ?? null
  const key = `${options.cacheKey}::${options.locale}::${gameRootPath ?? ''}::${options.width}x${options.height}`
  return thumbnailCache.load(key, async () => {
    const { blob, byteSize } = await scheduleThumbnail(() =>
      renderMapThumbnail(mapDocument, options.locale, options.width, options.height, gameRootPath),
    )
    const url = URL.createObjectURL(blob)
    return {
      value: url,
      size: byteSize,
      dispose: () => URL.revokeObjectURL(url),
    }
  })
}
