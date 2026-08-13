/**
 * Catalog of the game's `Strings/*` tables, grouped for the text library.
 *
 * Authors writing a data asset almost never want to invent a display string:
 * they want the one the game already ships, referenced as
 * `[LocalizedText Strings\Objects:Key]` so it stays translated in every
 * language. This module names the tables, groups them into the categories the
 * library dialog shows, and loads one table's entries on demand — the tables
 * total tens of thousands of rows, so nothing is loaded until a category is
 * opened.
 *
 * The asset list mirrors `Content/Strings` in Stardew Valley 1.6.
 */

import type { AssetTextCategoryKey, LocaleCode } from '@locales/api'
import { loadStringTable } from './localizedText'

/**
 * Category buckets shown in the library sidebar. The union lives in the locale
 * contract so its label record stays exhaustive; this alias is the name the
 * game entity and its consumers use.
 */
export type StringCatalogCategory = AssetTextCategoryKey

export type StringCatalogAsset = {
  /** Asset name under `Strings`, e.g. `Objects`. */
  name: string
  /** Reference name used inside `[LocalizedText ...]`, e.g. `Strings\Objects`. */
  referenceName: string
  /** XNB path passed to the string table loader. */
  assetPath: string
  category: StringCatalogCategory
}

const CATALOG_LAYOUT: ReadonlyArray<readonly [StringCatalogCategory, readonly string[]]> = [
  ['items', ['Objects', 'BigCraftables', 'Furniture', 'Tools', 'Weapons', 'Shirts', 'Pants', 'EnchantmentNames']],
  ['characters', ['Characters', 'NPCNames', 'FarmAnimals', 'SpeechBubbles', 'SimpleNonVillagerDialogues']],
  ['locations', ['Locations', 'Buildings', 'WorldMap', 'StringsFromMaps', 'Notes']],
  ['dialogue', ['Lexicon', 'Movies', 'MovieReactions', 'MovieConcessions', 'animationDescriptions']],
  ['events', ['Events']],
  ['quests', ['Quests', 'SpecialOrderStrings', 'BundleNames']],
  ['ui', ['UI', 'StringsFromCSFiles', '1_6_Strings']],
  ['misc', ['credits']],
]

/** Every `Strings/*` table the library can browse, in category order. */
export const STRING_CATALOG_ASSETS: readonly StringCatalogAsset[] = CATALOG_LAYOUT.flatMap(([category, names]) =>
  names.map((name) => ({
    name,
    referenceName: `Strings\\${name}`,
    assetPath: `Content\\Strings\\${name}.xnb`,
    category,
  })),
)

/** Categories in display order. */
export const STRING_CATALOG_CATEGORIES: readonly StringCatalogCategory[] = CATALOG_LAYOUT.map(([category]) => category)

const ASSETS_BY_NAME = new Map(STRING_CATALOG_ASSETS.map((asset) => [asset.name.toLowerCase(), asset]))

/** Looks up a catalog asset by its `Strings` name or `Strings\Name` reference. */
export function findStringCatalogAsset(name: string | null | undefined): StringCatalogAsset | null {
  const trimmed = name?.trim() ?? ''
  if (trimmed === '') {
    return null
  }
  const bare = trimmed.replaceAll('/', '\\').replace(/^Strings\\/iu, '')
  return ASSETS_BY_NAME.get(bare.toLowerCase()) ?? null
}

/** Catalog assets belonging to one category. */
export function stringCatalogAssetsInCategory(category: StringCatalogCategory): readonly StringCatalogAsset[] {
  return STRING_CATALOG_ASSETS.filter((asset) => asset.category === category)
}

/** Builds the `[LocalizedText Strings\Name:key]` token the game resolves. */
export function buildLocalizedTextToken(referenceName: string, key: string): string {
  return `[LocalizedText ${referenceName.replaceAll('/', '\\')}:${key}]`
}

export type StringCatalogEntry = {
  /** Stable id for list keys: `Strings\Objects:Key`. */
  id: string
  assetName: string
  category: StringCatalogCategory
  key: string
  value: string
  /** Ready-to-commit `[LocalizedText ...]` token. */
  token: string
}

export type StringCatalogAssetEntries = {
  asset: StringCatalogAsset
  entries: readonly StringCatalogEntry[]
  /** False when the table could not be read (missing game dir, unpackable asset). */
  loaded: boolean
}

/**
 * Loads one table's entries. The underlying string table is cached per
 * (root, locale, asset), so re-opening a category is free.
 */
export async function loadStringCatalogAsset(
  rootPath: string,
  asset: StringCatalogAsset,
  locale: LocaleCode,
): Promise<StringCatalogAssetEntries> {
  const { table, loaded } = await loadStringTable(rootPath, asset.assetPath, locale)
  const entries = Object.entries(table).map(([key, value]) => ({
    id: `${asset.referenceName}:${key}`,
    assetName: asset.name,
    category: asset.category,
    key,
    value,
    token: buildLocalizedTextToken(asset.referenceName, key),
  }))
  entries.sort((left, right) => left.key.localeCompare(right.key))
  return { asset, entries, loaded }
}

/** Loads every table in one category, skipping tables that fail to read. */
export async function loadStringCatalogCategory(
  rootPath: string,
  category: StringCatalogCategory,
  locale: LocaleCode,
): Promise<StringCatalogAssetEntries[]> {
  return Promise.all(stringCatalogAssetsInCategory(category).map((asset) => loadStringCatalogAsset(rootPath, asset, locale)))
}

/** Case-insensitive match over key and value; an empty query matches everything. */
export function stringCatalogEntryMatches(entry: StringCatalogEntry, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (normalized === '') {
    return true
  }
  return entry.key.toLowerCase().includes(normalized) || entry.value.toLowerCase().includes(normalized)
}

/** Filters and caps a result set so the dialog never renders tens of thousands of rows. */
export function searchStringCatalog(
  entries: readonly StringCatalogEntry[],
  query: string,
  limit = 200,
): { results: readonly StringCatalogEntry[]; total: number } {
  const matched: StringCatalogEntry[] = []
  let total = 0
  for (const entry of entries) {
    if (!stringCatalogEntryMatches(entry, query)) {
      continue
    }
    total += 1
    if (matched.length < limit) {
      matched.push(entry)
    }
  }
  return { results: matched, total }
}
