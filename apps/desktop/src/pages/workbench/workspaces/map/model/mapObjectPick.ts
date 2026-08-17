import {
  findTilesetForGid,
  gameSheetKeyOfTileset,
  getMapObjects,
  mapObjectDisplayName,
  stripTileGidFlags,
  type MapCatalogObject,
  type MapDocument,
  type MapTileset,
} from '@entities/map'

/**
 * 反向查找：给定地图上一个 raw gid（含翻转标志），在对象目录注册表中
 * 查找包含该 tile 的 `MapCatalogObject`。用于 Inspector 面板将地图上
 * 已放置的贴图匹配到家具/结构物目录条目。
 *
 * 查找逻辑：
 * 1. 从 gid 解析出所属 tileset 和 tileId
 * 2. 从 tileset 属性获取对应的游戏 sheet key
 * 3. 将 tileId 转为 sheet 上的 (tileX, tileY) 坐标
 * 4. 遍历对象目录，查找 sheet 匹配且 rect 包含 (tileX, tileY) 的条目
 *
 * 返回第一个匹配的目录条目，或 null。
 */
export function matchTileToCatalogObject(rawGid: number, tilesets: readonly MapTileset[]): MapCatalogObject | null {
  const gid = stripTileGidFlags(rawGid)
  if (gid === 0) return null

  const tileset = findTilesetForGid(tilesets as MapTileset[], gid)
  if (!tileset) return null

  const sheetKey = gameSheetKeyOfTileset(tileset)
  if (!sheetKey) return null

  const tileId = gid - tileset.firstGid
  const tileX = tileId % tileset.columns
  const tileY = Math.floor(tileId / tileset.columns)

  const sheetKeyLower = sheetKey.toLowerCase()
  const objects = getMapObjects()
  for (const obj of objects) {
    if (obj.sheet.toLowerCase() !== sheetKeyLower) continue
    const { x, y, width, height } = obj.rect
    if (tileX >= x && tileX < x + width && tileY >= y && tileY < y + height) {
      return obj
    }
  }
  return null
}

// ── Placed furniture scanning ─────────────────────────────────────────

/** 一个被扫描识别出的已放置家具实例。 */
export type PlacedFurnitureEntry = {
  /** 目录条目。 */
  catalogObject: MapCatalogObject
  /** 家具左上角在地图上的 tile 坐标。 */
  tileX: number
  tileY: number
  /** 所在图层名称。 */
  layerName: string
}

/**
 * 扫描文档所有 tile 层，将每个非零 gid 匹配到对象目录，识别出已
 * 放置的家具并推导其左上角位置。同一家具在同一位置只记录一次。
 *
 * 算法：
 * 1. 为文档中有 game-sheet 映射的 tileset 预构建 sheetKey 查找表
 * 2. 将对象目录按 sheet key 分桶
 * 3. 遍历每层每个 cell：gid → tileset → sheetKey → 桶内查找
 * 4. 命中后计算家具在地图上的左上角 tile 坐标，以 `id+x+y+layer`
 *    去重（同一家具的多个 tile 只产出一条记录）
 *
 * 纯函数，无副作用。对象目录由调用方传入。
 */
export function scanPlacedFurniture(document: MapDocument, catalogObjects: readonly MapCatalogObject[]): PlacedFurnitureEntry[] {
  if (catalogObjects.length === 0 || document.layers.length === 0) return []

  // 为每个 tileset 预解析 sheetKey
  const tilesetSheetKeys = new Map<MapTileset, string>()
  for (const tileset of document.tilesets) {
    const key = gameSheetKeyOfTileset(tileset)
    if (key) tilesetSheetKeys.set(tileset, key.toLowerCase())
  }
  if (tilesetSheetKeys.size === 0) return []

  // 按 sheet key 分桶建索引
  const objectsBySheet = new Map<string, MapCatalogObject[]>()
  for (const obj of catalogObjects) {
    const sheetLower = obj.sheet.toLowerCase()
    let bucket = objectsBySheet.get(sheetLower)
    if (!bucket) {
      bucket = []
      objectsBySheet.set(sheetLower, bucket)
    }
    bucket.push(obj)
  }

  const results: PlacedFurnitureEntry[] = []
  const seen = new Set<string>()

  for (const layer of document.layers) {
    const gids = layer.gids
    for (let cellIndex = 0; cellIndex < gids.length; cellIndex++) {
      const gid = stripTileGidFlags(gids[cellIndex])
      if (gid === 0) continue

      const tileset = findTilesetForGid(document.tilesets as MapTileset[], gid)
      if (!tileset) continue

      const sheetKey = tilesetSheetKeys.get(tileset)
      if (!sheetKey) continue

      const bucket = objectsBySheet.get(sheetKey)
      if (!bucket) continue

      const tileId = gid - tileset.firstGid
      const sheetTileX = tileId % tileset.columns
      const sheetTileY = Math.floor(tileId / tileset.columns)

      for (const obj of bucket) {
        const { x, y, width, height } = obj.rect
        if (sheetTileX < x || sheetTileX >= x + width || sheetTileY < y || sheetTileY >= y + height) continue

        // 从 cell 坐标和 tile 在家具 rect 内的偏移推算家具左上角
        const cellX = cellIndex % layer.width
        const cellY = Math.floor(cellIndex / layer.width)
        const furnitureX = cellX - (sheetTileX - x)
        const furnitureY = cellY - (sheetTileY - y)
        const dedupeKey = `${obj.id}\0${furnitureX}\0${furnitureY}\0${layer.name}`
        if (seen.has(dedupeKey)) break
        seen.add(dedupeKey)

        results.push({ catalogObject: obj, tileX: furnitureX, tileY: furnitureY, layerName: layer.name })
        break
      }
    }
  }

  // 按 y → x → 图层名排序，方便阅读
  results.sort((a, b) => a.tileY - b.tileY || a.tileX - b.tileX || a.layerName.localeCompare(b.layerName))
  return results
}

/** 已放置家具的显示标签。 */
export function placedFurnitureLabel(entry: PlacedFurnitureEntry, locale: string): string {
  return mapObjectDisplayName(entry.catalogObject, locale)
}
