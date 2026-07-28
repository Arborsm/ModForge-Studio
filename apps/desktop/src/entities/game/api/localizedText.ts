/**
 * Shared `[LocalizedText Strings\X:key]` resolver.
 *
 * The game writes localizable strings as references into data assets; every
 * authoring and browsing surface needs the *readable* text. This module is the
 * single implementation — previously the same ~70 lines lived in three entity
 * loaders, which is why the authoring pages silently showed raw tokens while
 * the codex pages resolved them.
 *
 * Semantics preserved from the original copies: anything that is not a
 * reference passes through unchanged, recursion stops after three
 * indirections, and string tables are cached per (root, locale, asset). The
 * one behavioral change: table load failures are *reported* (the old copies
 * silently fell back to showing the raw token).
 */

import type { LocaleCode } from '@locales/api'
import { loadTextAsset } from './gameAssets'

export type StringAssetReference = {
  /** XNB path under the game root, e.g. `Content\Strings\Objects.xnb`. */
  assetPath: string
  key: string
}

/** Parses `[LocalizedText path:key]` (or a bare `path:key`) into its table reference. */
export function tryParseStringAssetReference(value: string | null | undefined): StringAssetReference | null {
  const rawValue = value?.trim() ?? ''
  if (!rawValue) {
    return null
  }

  const localizedTextMatch = /^\[LocalizedText\s+(.+)\]$/u.exec(rawValue)
  const trimmed = localizedTextMatch?.[1]?.trim() ?? rawValue
  const separatorIndex = trimmed.indexOf(':')
  if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) {
    return null
  }

  const assetName = trimmed.slice(0, separatorIndex).replaceAll('/', '\\')
  const key = trimmed.slice(separatorIndex + 1)
  if (!/[\\/]/u.test(assetName)) {
    return null
  }

  return {
    assetPath: `Content\\${assetName}.xnb`,
    key,
  }
}

export type StringTableResult = {
  table: Record<string, string>
  /** False when the table asset could not be read at all. */
  loaded: boolean
}

const stringTableCache = new Map<string, Promise<StringTableResult>>()

/** Loads one `Strings/*` table, cached per (root, locale, asset). */
export function loadStringTable(rootPath: string, assetPath: string, locale: LocaleCode): Promise<StringTableResult> {
  const cacheKey = `${rootPath}::${locale}::${assetPath}`
  const cached = stringTableCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const pending: Promise<StringTableResult> = loadTextAsset(rootPath, assetPath, locale)
    .then((asset) => {
      const parsed = JSON.parse(asset.content) as Record<string, unknown>
      const table = Object.fromEntries(
        Object.entries(parsed).flatMap(([key, value]) => (typeof value === 'string' ? ([[key, value]] as const) : [])),
      )
      return { table, loaded: true }
    })
    .catch(() => ({ table: {}, loaded: false }))

  stringTableCache.set(cacheKey, pending)
  return pending
}

/** Drops cached string tables, e.g. after the game directory changes. */
export function invalidateLocalizedTextCache(rootPath?: string): void {
  if (rootPath === undefined) {
    stringTableCache.clear()
    return
  }
  for (const key of stringTableCache.keys()) {
    if (key.startsWith(`${rootPath}::`)) {
      stringTableCache.delete(key)
    }
  }
}

export type LocalizedTextResolution = {
  /** Display text: the resolved value, or the raw input when not resolvable. */
  text: string
  /** The input was a `[LocalizedText ...]` reference. */
  isReference: boolean
  /** The reference resolved against its string table. */
  resolved: boolean
  /** The string table needed for resolution failed to load. */
  tableLoadFailed: boolean
  reference: StringAssetReference | null
}

async function resolveDetailed(rootPath: string, locale: LocaleCode, value: string, depth: number): Promise<LocalizedTextResolution> {
  const reference = tryParseStringAssetReference(value)
  if (reference === null) {
    return { text: value, isReference: false, resolved: false, tableLoadFailed: false, reference: null }
  }

  const { table, loaded } = await loadStringTable(rootPath, reference.assetPath, locale)
  const resolved = table[reference.key]
  if (resolved === undefined) {
    return { text: value, isReference: true, resolved: false, tableLoadFailed: !loaded, reference }
  }
  if (depth >= 3) {
    return { text: resolved, isReference: true, resolved: true, tableLoadFailed: false, reference }
  }

  const nested = await resolveDetailed(rootPath, locale, resolved, depth + 1)
  // Keep the outermost reference's identity; the text comes from the innermost hit.
  return { ...nested, isReference: true, resolved: true, reference }
}

/** Resolves one value to readable text with full diagnostics. */
export function resolveLocalizedTextDetailed(
  rootPath: string,
  locale: LocaleCode,
  value: string | null | undefined,
): Promise<LocalizedTextResolution> {
  const trimmed = value?.trim() ?? ''
  return resolveDetailed(rootPath, locale, trimmed, 0)
}

/**
 * Compatibility wrapper matching the original per-entity signature: null for
 * empty input, input unchanged when not a reference or unresolved.
 */
export async function resolveLocalizedText(rootPath: string, locale: LocaleCode, value: string | null | undefined): Promise<string | null> {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) {
    return null
  }
  return (await resolveLocalizedTextDetailed(rootPath, locale, trimmed)).text
}

/** Resolves several values in parallel, preserving order. */
export function localizeValues(rootPath: string, locale: LocaleCode, values: readonly string[]): Promise<string[]> {
  return Promise.all(values.map(async (value) => (await resolveLocalizedTextDetailed(rootPath, locale, value)).text))
}
