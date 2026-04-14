import type { LauncherLibraryItem } from './types'

export const normalizeLookupKey = (value: string) => value.trim().toLowerCase()
export const normalizeModKey = (value: string) => value.trim()

export function getModKey(item: LauncherLibraryItem) {
  return normalizeModKey(item.uniqueId || item.labelKey || item.id)
}

function getFilterCandidates(item: LauncherLibraryItem) {
  return [
    item.name,
    item.author,
    item.version,
    item.uniqueId,
    item.description,
    item.folderName,
    item.absolutePath,
    item.labelKey,
  ] as const
}

function matchesNormalizedFilter(item: LauncherLibraryItem, normalizedFilter: string) {
  if (!normalizedFilter) {
    return true
  }

  return getFilterCandidates(item)
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalizedFilter))
}

export function includesFilter(item: LauncherLibraryItem, normalizedFilter: string) {
  return matchesNormalizedFilter(item, normalizedFilter)
}

export function includesLibraryFilter(item: LauncherLibraryItem, filterText: string) {
  return matchesNormalizedFilter(item, filterText.trim().toLowerCase())
}
