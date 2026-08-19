import { createFurnitureEntryIndex } from '@entities/item'
import { loadTextAsset } from '@entities/game/api'
import { findTilesheetByKey, VANILLA_TILESHEET_TILE_SIZE } from '@entities/map'
import type { MapCatalogObject, MapCatalogObjectFrameInfo, MapObjectCategory } from '@entities/map'

/**
 * @file Derives the furniture object catalog from live game data (no UI):
 * parses `Data/Furniture` and `Strings/Furniture` JSON text, converts each
 * furniture entry into a tilesheet rectangle stamp, and produces catalog
 * entries ready for `registerMapObjects`.
 */

const SEATING_FURNITURE_TYPES = new Set(['chair', 'armchair', 'bench', 'stool', 'couch'])
const TABLE_FURNITURE_TYPES = new Set(['table', 'long table'])
const STORAGE_FURNITURE_TYPES = new Set(['dresser', 'bookcase'])
const BED_FURNITURE_TYPES = new Set(['bed', 'bed child', 'bed double'])
const LIGHTING_FURNITURE_TYPES = new Set(['lamp', 'sconce', 'torch'])
const PLANT_FURNITURE_TYPES = new Set(['plant', 'randomized_plant'])
const DECOR_FURNITURE_TYPES = new Set(['painting', 'decor', 'fishtank', 'fireplace'])

/**
 * Maps game furniture type names to numeric IDs returned by
 * `Furniture.getTypeNumberFromName`. These IDs determine sourceRect
 * conversion during rotation and day/night/weather alternate frame behavior.
 * "bed" variants all return 15; unknown types return 9 (game default case).
 */
const FURNITURE_TYPE_ID_MAP: Record<string, number> = {
  chair: 0,
  bench: 1,
  couch: 2,
  armchair: 3,
  dresser: 4,
  'long table': 5,
  painting: 6,
  lamp: 7,
  decor: 8,
  bookcase: 10,
  table: 11,
  rug: 12,
  window: 13,
  fireplace: 14,
  'bed child': 15,
  'bed double': 15,
  bed: 15,
  torch: 16,
  sconce: 17,
}

function furnitureTypeNameToId(typeName: string): number {
  const normalized = typeName.trim().toLowerCase()
  if (normalized.startsWith('bed')) return 15
  return FURNITURE_TYPE_ID_MAP[normalized] ?? 9
}

/** Lighting (lamp=7/sconce=17/torch=16) and windows (window=13) have day/night/weather alternate frames. */
function furnitureHasAlternateState(typeId: number): boolean {
  return typeId === 7 || typeId === 13 || typeId === 16 || typeId === 17
}

/**
 * Maps game furniture type names (e.g. `chair`, `long table`) to catalog
 * categories; comparison is case-insensitive with trimmed whitespace,
 * unknown types (including `other`) fall back to `'other'`.
 */
export function furnitureTypeToCategory(type: string): MapObjectCategory {
  const normalized = type.trim().toLowerCase()
  if (SEATING_FURNITURE_TYPES.has(normalized)) return 'seating'
  if (TABLE_FURNITURE_TYPES.has(normalized)) return 'tables'
  if (STORAGE_FURNITURE_TYPES.has(normalized)) return 'storage'
  if (BED_FURNITURE_TYPES.has(normalized)) return 'beds'
  if (normalized === 'rug') return 'rugs'
  if (LIGHTING_FURNITURE_TYPES.has(normalized)) return 'lighting'
  if (PLANT_FURNITURE_TYPES.has(normalized)) return 'plants'
  if (normalized === 'window') return 'windows'
  if (DECOR_FURNITURE_TYPES.has(normalized)) return 'decor'
  return 'other'
}

/** Matches `[LocalizedText Strings\\Furniture:<key>]` display name tokens. */
const FURNITURE_DISPLAY_NAME_TOKEN = /^\[LocalizedText Strings\\Furniture:(.+)\]$/u

/** Lowercase slug from furniture internalName: non-[a-z0-9] sequences collapse to '-', empty result falls back to 'item'. */
function furnitureObjectId(internalName: string): string {
  const slug = internalName
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  return `furniture:${slug || 'item'}`
}

/** Parses JSON text of Strings/* tables; returns null on missing or malformed content (names fall back to internalName). */
function parseStringTable(content: string | null): Record<string, string> | null {
  if (!content) return null
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    const table: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') table[key] = value
    }
    return table
  } catch {
    return null
  }
}

/**
 * Resolves a furniture entry's display name: when the token matches a string
 * table key, the corresponding locale name is used; on missing table or key
 * mismatch, falls back to internalName. Non-token display names are used
 * directly as names for both locales.
 */
function resolveFurnitureNames(
  rawDisplayName: string,
  internalName: string,
  enTable: Record<string, string> | null,
  localizedTable: Record<string, string> | null,
  locale: string,
): Record<string, string> {
  const tokenMatch = FURNITURE_DISPLAY_NAME_TOKEN.exec(rawDisplayName)
  if (!tokenMatch) {
    return { [locale]: rawDisplayName, 'en-US': rawDisplayName }
  }
  const key = tokenMatch[1]?.trim() ?? ''
  if (!key) {
    return { [locale]: internalName, 'en-US': internalName }
  }
  return {
    [locale]: localizedTable?.[key] ?? internalName,
    'en-US': enTable?.[key] ?? internalName,
  }
}

/**
 * Derives catalog entries from `Data/Furniture` and `Strings/Furniture` JSON
 * text. Each furniture entry looks up its tilesheet by `textureAssetName` and
 * converts `spriteIndex` to a tile rectangle; entries with no matching sheet,
 * invalid spriteIndex (null/non-finite/negative), or out-of-bounds rectangles
 * are skipped (unknown textures log a console.warn). On missing or malformed
 * string tables, display names fall back to internalName. Pure function, no
 * caching, no I/O.
 */
export function deriveFurnitureObjects(
  furnitureContent: string,
  stringsEnContent: string | null,
  stringsLocalizedContent: string | null,
  locale: string,
): MapCatalogObject[] {
  const entries = createFurnitureEntryIndex(furnitureContent)
  const enTable = parseStringTable(stringsEnContent)
  const localizedTable = parseStringTable(stringsLocalizedContent)
  const objects: MapCatalogObject[] = []

  for (const entry of entries) {
    const textureAssetName = entry.textureAssetName
    if (!textureAssetName) continue
    const sheet = findTilesheetByKey(textureAssetName)
    if (!sheet) {
      console.warn(
        `[furnitureObjects] Furniture "${entry.internalName}" texture "${textureAssetName}" not found in tilesheet catalog, skipped`,
      )
      continue
    }

    const spriteIndex = entry.spriteIndex
    if (spriteIndex == null || !Number.isFinite(spriteIndex) || spriteIndex < 0) continue
    const sourceSize = entry.furnitureStats?.sourceSize
    if (!sourceSize) continue

    const columns = Math.floor(sheet.imageWidth / VANILLA_TILESHEET_TILE_SIZE)
    const rows = Math.floor(sheet.imageHeight / VANILLA_TILESHEET_TILE_SIZE)
    const x = spriteIndex % columns
    const y = Math.floor(spriteIndex / columns)
    if (x + sourceSize.width > columns || y + sourceSize.height > rows) continue

    const furnitureType = entry.furnitureStats?.furnitureType ?? ''
    const rotations = entry.furnitureStats?.rotations ?? 1
    const furnitureTypeId = furnitureTypeNameToId(furnitureType)
    const hasAlternateState = furnitureHasAlternateState(furnitureTypeId)

    const frameInfo: MapCatalogObjectFrameInfo | undefined =
      rotations > 1 || hasAlternateState ? { rotations, furnitureTypeId, hasAlternateState } : undefined

    objects.push({
      id: furnitureObjectId(entry.internalName),
      sheet: sheet.key,
      rect: { x, y, width: sourceSize.width, height: sourceSize.height },
      category: furnitureTypeToCategory(furnitureType),
      names: resolveFurnitureNames(entry.rawDisplayName, entry.internalName, enTable, localizedTable, locale),
      frameInfo,
    })
  }

  return objects
}

/**
 * Loads furniture data from the game directory and derives the object catalog:
 * reads `Content/Data/Furniture.xnb` and locale-suffixed
 * `Content/Strings/Furniture.xnb` in parallel; for non-en-US locales, also
 * reads the unsuffixed string table for English names (en-US skips the
 * duplicate request since the localized table is the English table). String
 * table load failures are tolerated (display names fall back to
 * internalName); Data/Furniture load failures propagate upward.
 */
export async function loadGameFurnitureObjects(gameRootPath: string, locale: string): Promise<MapCatalogObject[]> {
  const furnitureAssetPath = `${gameRootPath}/Content/Data/Furniture.xnb`
  const stringsAssetPath = `${gameRootPath}/Content/Strings/Furniture.xnb`

  const [furnitureAsset, localizedStrings, enStrings] = await Promise.all([
    loadTextAsset(gameRootPath, furnitureAssetPath),
    loadTextAsset(gameRootPath, stringsAssetPath, locale).catch(() => null),
    locale === 'en-US' ? Promise.resolve(null) : loadTextAsset(gameRootPath, stringsAssetPath).catch(() => null),
  ])

  const enContent = locale === 'en-US' ? (localizedStrings?.content ?? null) : (enStrings?.content ?? null)
  return deriveFurnitureObjects(furnitureAsset.content, enContent, localizedStrings?.content ?? null, locale)
}
