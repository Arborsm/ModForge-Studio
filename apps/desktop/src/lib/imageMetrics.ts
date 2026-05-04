import { getLocalizedPathCacheKey } from './cachePaths'
import { loadImageDataUrl } from './desktop'

export { getLocalizedPathCacheKey, normalizeCachePathSegment } from './cachePaths'

export type LoadedImageResource = {
  image: HTMLImageElement
  url: string
  width: number
  height: number
}

const MAX_IMAGE_RESOURCE_CACHE_ENTRIES = 64
const MAX_PATH_IMAGE_RESOURCE_CACHE_ENTRIES = 128

const imageResourceCache = new Map<string, Promise<LoadedImageResource>>()
const pathImageResourceCache = new Map<string, Promise<LoadedImageResource | null>>()

export function getLocalizedImagePathCandidates(path: string, locale?: string) {
  if (!locale || locale === 'en-US') {
    return [path]
  }

  return [path.replace(/\.xnb$/iu, `.${locale}.xnb`), path]
}

function trimCache<K, V>(cache: Map<K, V>, maxEntries: number) {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value
    if (oldestKey == null) {
      return
    }
    cache.delete(oldestKey)
  }
}

export async function loadImageResource(url: string) {
  const cached = imageResourceCache.get(url)
  if (cached) {
    return cached
  }

  const pending = new Promise<LoadedImageResource>((resolve, reject) => {
    const image = new Image()
    image.onload = () =>
      resolve({
        image,
        url,
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    image.onerror = () => reject(new Error('Failed to decode image asset.'))
    image.src = url
  }).catch((error) => {
    imageResourceCache.delete(url)
    throw error
  })

  imageResourceCache.set(url, pending)
  trimCache(imageResourceCache, MAX_IMAGE_RESOURCE_CACHE_ENTRIES)
  return pending
}

export async function loadImageResourceFromPath(path: string, locale?: string) {
  const cacheKey = getLocalizedPathCacheKey(path, locale)
  const cached = pathImageResourceCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const pending = loadImageDataUrl(path, locale)
    .then((url) => loadImageResource(url))
    .catch(() => {
      pathImageResourceCache.delete(cacheKey)
      return null
    })

  pathImageResourceCache.set(cacheKey, pending)
  trimCache(pathImageResourceCache, MAX_PATH_IMAGE_RESOURCE_CACHE_ENTRIES)
  return pending
}

export function loadImageUrlFromPath(path: string, locale?: string) {
  return loadImageDataUrl(path, locale)
}

export function clearImageMetricsLocaleCache(locale: string) {
  const normalizedLocale = locale.trim()
  if (!normalizedLocale) {
    return
  }

  const suffix = `::${normalizedLocale}`
  for (const key of pathImageResourceCache.keys()) {
    if (key.endsWith(suffix)) {
      pathImageResourceCache.delete(key)
    }
  }

  // Resource cache keys are data URLs, not locale-tagged paths.
  imageResourceCache.clear()
}

export async function measureImageDimensions(url: string) {
  const resource = await loadImageResource(url)
  return {
    width: resource.width,
    height: resource.height,
  }
}
