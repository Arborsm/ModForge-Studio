import { gameSheetKeyOfTileset, type MapCatalogObject, type MapDocument, type MapTilesetPaletteSelection } from '@entities/map'

/**
 * 把对象目录条目解析为调色板选区：在文档已附着的 tileset 中按
 * `object.sheet`（大小写不敏感）查找动态游戏 sheet 引用，并校验对象矩形
 * 完整落在该 tileset 的 tile 网格内（行数按 tileCount/columns 向上取整）。
 * 找不到引用或矩形越界时返回 null；纯查询，不产生任何副作用。
 */
export function catalogObjectSelection(document: MapDocument, object: MapCatalogObject): MapTilesetPaletteSelection | null {
  const tileset = document.tilesets.find((candidate) => gameSheetKeyOfTileset(candidate)?.toLowerCase() === object.sheet.toLowerCase())
  if (!tileset) return null
  const rows = Math.ceil(tileset.tileCount / tileset.columns)
  const { x, y, width, height } = object.rect
  if (x < 0 || y < 0 || x + width > tileset.columns || y + height > rows) return null
  return { tilesetName: tileset.name, startIndex: y * tileset.columns + x, width, height }
}
