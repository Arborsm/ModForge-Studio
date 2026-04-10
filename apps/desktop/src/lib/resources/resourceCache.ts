type CacheLoaderResult<TValue> = {
  value: TValue
  size?: number
  dispose?: () => void
}

type CompletedCacheEntry<TValue> = {
  kind: 'completed'
  value: TValue
  size: number
  dispose?: () => void
}

type InflightCacheEntry<TValue> = {
  kind: 'inflight'
  promise: Promise<TValue>
}

type CacheEntry<TValue> = CompletedCacheEntry<TValue> | InflightCacheEntry<TValue>

type CreateResourceCacheOptions<TValue> = {
  maxEntries: number
  maxBytes?: number
  getSize?: (value: TValue) => number
}

type ResourceCacheStats = {
  entries: number
  inflight: number
  totalBytes: number
}

function isCompletedEntry<TValue>(entry: CacheEntry<TValue> | undefined): entry is CompletedCacheEntry<TValue> {
  return entry?.kind === 'completed'
}

export function createResourceCache<TValue>({
  maxEntries,
  maxBytes = Number.POSITIVE_INFINITY,
  getSize,
}: CreateResourceCacheOptions<TValue>) {
  const entries = new Map<string, CacheEntry<TValue>>()
  let totalBytes = 0

  function estimateSize(result: CacheLoaderResult<TValue>) {
    if (typeof result.size === 'number' && Number.isFinite(result.size) && result.size >= 0) {
      return result.size
    }

    return getSize?.(result.value) ?? 1
  }

  function touchCompletedEntry(key: string, entry: CompletedCacheEntry<TValue>) {
    entries.delete(key)
    entries.set(key, entry)
  }

  function evictIfNeeded() {
    while (entries.size > maxEntries || totalBytes > maxBytes) {
      const oldest = entries.entries().next().value as [string, CacheEntry<TValue>] | undefined
      if (!oldest) {
        return
      }

      const [key, entry] = oldest
      entries.delete(key)
      if (entry.kind === 'completed') {
        totalBytes -= entry.size
        entry.dispose?.()
      }
    }
  }

  return {
    async load(key: string, loader: () => Promise<CacheLoaderResult<TValue>>) {
      const current = entries.get(key)
      if (current?.kind === 'inflight') {
        return current.promise
      }
      if (isCompletedEntry(current)) {
        touchCompletedEntry(key, current)
        return current.value
      }

      const promise = loader()
        .then((result) => {
          const completed: CompletedCacheEntry<TValue> = {
            kind: 'completed',
            value: result.value,
            size: estimateSize(result),
            dispose: result.dispose,
          }

          const latest = entries.get(key)
          if (latest?.kind === 'inflight' && latest.promise === promise) {
            entries.set(key, completed)
            totalBytes += completed.size
            evictIfNeeded()
          }

          return completed.value
        })
        .catch((error) => {
          const latest = entries.get(key)
          if (latest?.kind === 'inflight' && latest.promise === promise) {
            entries.delete(key)
          }
          throw error
        })

      entries.set(key, {
        kind: 'inflight',
        promise,
      })

      return promise
    },
    has(key: string) {
      return isCompletedEntry(entries.get(key))
    },
    get(key: string) {
      const current = entries.get(key)
      if (!isCompletedEntry(current)) {
        return null
      }

      touchCompletedEntry(key, current)
      return current.value
    },
    invalidate(key: string) {
      const current = entries.get(key)
      entries.delete(key)
      if (isCompletedEntry(current)) {
        totalBytes -= current.size
        current.dispose?.()
      }
    },
    clear() {
      for (const entry of entries.values()) {
        if (entry.kind === 'completed') {
          entry.dispose?.()
        }
      }
      entries.clear()
      totalBytes = 0
    },
    getStats(): ResourceCacheStats {
      let inflight = 0
      let completed = 0
      for (const entry of entries.values()) {
        if (entry.kind === 'inflight') {
          inflight += 1
        } else {
          completed += 1
        }
      }

      return {
        entries: completed,
        inflight,
        totalBytes,
      }
    },
  }
}

export type { CacheLoaderResult, CreateResourceCacheOptions, ResourceCacheStats }
