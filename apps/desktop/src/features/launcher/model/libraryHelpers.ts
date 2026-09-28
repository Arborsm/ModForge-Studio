/**
 * @file Shared library helper functions: mod key normalization, filter
 * extraction, and text matching.
 */
import type { LauncherLibraryItem } from './types'

/** Trims a raw mod key value to its canonical form. */
export const normalizeModKey = (value: string) => value.trim()
export { normalizeLookupKey } from '@shared/lib/helper'

/** Returns the canonical mod key for a library item (unique id > label key > id). */
export function getModKey(item: LauncherLibraryItem) {
  return normalizeModKey(item.uniqueId || item.labelKey || item.id)
}

function getFilterCandidates(item: LauncherLibraryItem) {
  return [item.name, item.author, item.version, item.uniqueId, item.description, item.folderName, item.absolutePath, item.labelKey] as const
}

function matchesNormalizedFilter(item: LauncherLibraryItem, normalizedFilter: string) {
  if (!normalizedFilter) {
    return true
  }

  return getFilterCandidates(item)
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalizedFilter))
}

/** Returns true when the item matches a pre-normalized (lowercased) filter string. */
export function includesFilter(item: LauncherLibraryItem, normalizedFilter: string) {
  return matchesNormalizedFilter(item, normalizedFilter)
}

/** Returns true when the item matches a raw filter text (trimmed and lowercased). */
export function includesLibraryFilter(item: LauncherLibraryItem, filterText: string) {
  return matchesNormalizedFilter(item, filterText.trim().toLowerCase())
}
