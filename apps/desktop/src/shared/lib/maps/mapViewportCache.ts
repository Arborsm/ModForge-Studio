/** @file Locale-aware caches for decoded map viewport images (sync + promise). */

/** Synchronous cache of decoded viewport images keyed by locale-tagged path. */
export const viewportImageCache = new Map<string, HTMLImageElement>()
/** In-flight viewport image decode promises, deduplicated by locale-tagged path. */
export const viewportImagePromiseCache = new Map<string, Promise<HTMLImageElement>>()

/** Evicts locale-tagged entries from both viewport caches after a locale change. */
export function clearMapViewportLocaleCache(locale: string) {
  const normalizedLocale = locale.trim()
  if (!normalizedLocale) {
    return
  }

  const suffix = `::${normalizedLocale}`
  for (const key of viewportImageCache.keys()) {
    if (key.endsWith(suffix)) {
      viewportImageCache.delete(key)
    }
  }
  for (const key of viewportImagePromiseCache.keys()) {
    if (key.endsWith(suffix)) {
      viewportImagePromiseCache.delete(key)
    }
  }
}

/** Returns entry counts for both viewport caches (for debug panels and tests). */
export function getMapViewportCacheStats() {
  return {
    images: viewportImageCache.size,
    pendingImages: viewportImagePromiseCache.size,
  }
}
