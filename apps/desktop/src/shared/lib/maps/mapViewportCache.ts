export const viewportImageCache = new Map<string, HTMLImageElement>()
export const viewportImagePromiseCache = new Map<string, Promise<HTMLImageElement>>()

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

export function getMapViewportCacheStats() {
  return {
    images: viewportImageCache.size,
    pendingImages: viewportImagePromiseCache.size,
  }
}
