import { normalizeCachePathSegment } from '@shared/lib/assets'

export function createPromiseCache<T>() {
  const cache = new Map<string, Promise<T>>()

  return {
    get(key: string) {
      return cache.get(key)
    },
    set(key: string, promise: Promise<T>) {
      cache.set(key, promise)
    },
    delete(key: string) {
      cache.delete(key)
    },
    deleteWhere(predicate: (key: string) => boolean) {
      for (const key of cache.keys()) {
        if (predicate(key)) {
          cache.delete(key)
        }
      }
    },
    clear() {
      cache.clear()
    },
    size() {
      return cache.size
    },
  }
}

export function getRootedAssetCacheKey(rootPath: string, assetPath: string) {
  return `${normalizeCachePathSegment(rootPath)}::${normalizeCachePathSegment(assetPath)}`
}

export function getLocalizedRootedAssetCacheKey(rootPath: string, assetPath: string, locale?: string) {
  return `${getRootedAssetCacheKey(rootPath, assetPath)}::${locale?.trim() || 'default'}`
}

export async function readCached<T>(cache: ReturnType<typeof createPromiseCache<T>>, key: string, loader: () => Promise<T>) {
  const cachedValue = cache.get(key)
  if (cachedValue) {
    return cachedValue
  }

  const pendingValue = loader().catch((error) => {
    cache.delete(key)
    throw error
  })

  cache.set(key, pendingValue)
  return pendingValue
}

export async function readPending<T>(cache: ReturnType<typeof createPromiseCache<T>>, key: string, loader: () => Promise<T>) {
  const cachedValue = cache.get(key)
  if (cachedValue) {
    return cachedValue
  }

  const pendingValue = loader().finally(() => {
    cache.delete(key)
  })

  cache.set(key, pendingValue)
  return pendingValue
}
