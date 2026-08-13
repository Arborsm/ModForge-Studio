import { getLocalizedPathCacheKey } from '@shared/lib/assets'

export { getLocalizedPathCacheKey, normalizeCachePathSegment } from '@shared/lib/assets'

type ImageDataUrlLoader = (path: string, locale?: string) => Promise<string>

let imageDataUrlLoader: ImageDataUrlLoader | null = null

const IMAGE_RESOURCE_LOAD_TIMEOUT_MS = 10_000

/** Configures how local image paths are loaded as data URLs. */
export function configureImageDataUrlLoader(loader: ImageDataUrlLoader) {
  imageDataUrlLoader = loader
}

function withImageLoadTimeout<T>(promise: Promise<T>, path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`Image load timed out after ${IMAGE_RESOURCE_LOAD_TIMEOUT_MS}ms: ${path}`))
    }, IMAGE_RESOURCE_LOAD_TIMEOUT_MS)

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeoutId)
        reject(error)
      },
    )
  })
}

/** Decoded browser image plus natural dimensions. */
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

/** Returns locale-specific image path candidates, falling back to the base path. */
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

function loadConfiguredImageDataUrl(path: string, locale?: string) {
  if (/^data:image\//iu.test(path)) {
    return Promise.resolve(path)
  }
  if (!imageDataUrlLoader) {
    return Promise.reject(new Error('Image data URL loader has not been configured.'))
  }

  return imageDataUrlLoader(path, locale)
}

/** Decodes an image URL and caches the pending/completed browser image resource. */
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

/** Loads a local image path through the configured data URL loader and decodes it. */
export async function loadImageResourceFromPath(path: string, locale?: string) {
  const cacheKey = getLocalizedPathCacheKey(path, locale)
  const cached = pathImageResourceCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const pending = withImageLoadTimeout(
    loadConfiguredImageDataUrl(path, locale).then((url) => loadImageResource(url)),
    path,
  ).catch(() => {
    pathImageResourceCache.delete(cacheKey)
    return null
  })

  pathImageResourceCache.set(cacheKey, pending)
  trimCache(pathImageResourceCache, MAX_PATH_IMAGE_RESOURCE_CACHE_ENTRIES)
  return pending
}

/** Loads only the data URL for a local image path without decoding dimensions. */
export function loadImageUrlFromPath(path: string, locale?: string) {
  return loadConfiguredImageDataUrl(path, locale)
}

/** Clears localized path image metrics after the active locale changes. */
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

/** Measures a decoded image URL using the shared image resource cache. */
export async function measureImageDimensions(url: string) {
  const resource = await loadImageResource(url)
  return {
    width: resource.width,
    height: resource.height,
  }
}
