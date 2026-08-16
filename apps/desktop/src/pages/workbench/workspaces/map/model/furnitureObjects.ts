import { createFurnitureEntryIndex } from '@entities/item'
import { loadTextAsset } from '@entities/game/api'
import { findTilesheetByKey, VANILLA_TILESHEET_TILE_SIZE } from '@entities/map'
import type { MapCatalogObject, MapObjectCategory } from '@entities/map'

/**
 * 从游戏实时数据派生"家具类对象目录"（不含 UI）：解析 `Data/Furniture`
 * 与 `Strings/Furniture` 的 JSON 文本，把每条家具换算成 tilesheet 上的
 * 矩形 stamp，产出可直接进 `registerMapObjects` 的对象目录条目。
 */

const SEATING_FURNITURE_TYPES = new Set(['chair', 'armchair', 'bench', 'stool', 'couch'])
const TABLE_FURNITURE_TYPES = new Set(['table', 'long table'])
const STORAGE_FURNITURE_TYPES = new Set(['dresser', 'bookcase'])
const BED_FURNITURE_TYPES = new Set(['bed', 'bed child', 'bed double'])
const LIGHTING_FURNITURE_TYPES = new Set(['lamp', 'sconce', 'torch'])
const PLANT_FURNITURE_TYPES = new Set(['plant', 'randomized_plant'])
const DECOR_FURNITURE_TYPES = new Set(['painting', 'decor', 'fishtank', 'fireplace'])

/**
 * 把游戏家具类型名（如 `chair`、`long table`）映射到对象目录分类；
 * 比较前做小写归一并容忍首尾空白，未知类型（含 `other`）一律落入
 * `'other'`。
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

/** 匹配 `[LocalizedText Strings\Furniture:<key>]` 显示名 token。 */
const FURNITURE_DISPLAY_NAME_TOKEN = /^\[LocalizedText Strings\\Furniture:(.+)\]$/u

/** 家具 internalName 的小写 slug：非 [a-z0-9] 序列折叠为 '-'，空结果回退 'item'。 */
function furnitureObjectId(internalName: string): string {
  const slug = internalName
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  return `furniture:${slug || 'item'}`
}

/** 解析 Strings/* 表的 JSON 文本；缺失或畸形内容返回 null（names 回退 internalName）。 */
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
 * 解析一条家具的显示名：token 命中字符串表取对应 locale 名，任一表缺失
 * 或未命中时回退 internalName；非 token 显示名直接作为两个 locale 的名。
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
 * 从 `Data/Furniture` 与 `Strings/Furniture` 的 JSON 文本派生对象目录条目。
 * 每条家具以 `textureAssetName` 查 tilesheet 目录、按 `spriteIndex` 换算
 * tile 矩形；查不到目录、spriteIndex 无效（null/非有限/负数）或矩形越界
 * 的条目跳过（未知贴图会 console.warn）。字符串表缺失或畸形时显示名回退
 * internalName。纯函数，无缓存、无 I/O。
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
      console.warn(`[furnitureObjects] 家具 "${entry.internalName}" 的贴图 "${textureAssetName}" 不在 tilesheet 目录中，已跳过`)
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

    objects.push({
      id: furnitureObjectId(entry.internalName),
      sheet: sheet.key,
      rect: { x, y, width: sourceSize.width, height: sourceSize.height },
      category: furnitureTypeToCategory(entry.furnitureStats?.furnitureType ?? ''),
      names: resolveFurnitureNames(entry.rawDisplayName, entry.internalName, enTable, localizedTable, locale),
    })
  }

  return objects
}

/**
 * 加载游戏目录中的家具数据并派生对象目录：并行读取
 * `Content/Data/Furniture.xnb` 与带 locale 的 `Content/Strings/Furniture.xnb`，
 * locale 非 en-US 时再读一份无 locale 的字符串表作英文名（en-US 时本地化
 * 表即英文表，不重复请求）。字符串表加载失败容忍（显示名回退
 * internalName），Data/Furniture 加载失败则向上抛出。
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
