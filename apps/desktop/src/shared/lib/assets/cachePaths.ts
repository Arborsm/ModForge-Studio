export function normalizeCachePathSegment(value: string) {
  return value.trim().replaceAll('/', '\\')
}

export function getLocalizedPathCacheKey(path: string, locale?: string) {
  return `${normalizeCachePathSegment(path)}::${locale?.trim() || 'default'}`
}
