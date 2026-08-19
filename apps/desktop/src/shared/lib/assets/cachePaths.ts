/** @file Cache key helpers for localized asset paths. */

/** Normalizes a path segment for cache key consistency (trims and unifies separators to backslash). */
export function normalizeCachePathSegment(value: string) {
  return value.trim().replaceAll('/', '\\')
}

/** Builds a locale-tagged cache key from a path and optional locale. */
export function getLocalizedPathCacheKey(path: string, locale?: string) {
  return `${normalizeCachePathSegment(path)}::${locale?.trim() || 'default'}`
}
