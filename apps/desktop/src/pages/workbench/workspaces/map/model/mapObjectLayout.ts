import type { MapCatalogObject } from '@entities/map'

/** 对象库网格固定列数：每列 16px（1 tile），基准行宽 4×16=64px。 */
export const MAP_OBJECT_LAYOUT_COLUMNS = 4

/** 装箱后的一行：行内对象与行高（tile 单位，取行内对象最大 height）。 */
export type MapObjectRow = {
  key: string
  heightUnits: number
  items: MapCatalogObject[]
}

/**
 * 把对象按顺序装箱成固定列数的行：每个对象按 `min(width, columns)`
 * 占用列数，逐个放入首个剩余列数放得下的行，放不下则新起一行；
 * `heightUnits` 取行内对象的最大 height（tile 单位）。纯函数，无副作用。
 */
export function packMapObjectsIntoRows(objects: readonly MapCatalogObject[], columns = MAP_OBJECT_LAYOUT_COLUMNS): MapObjectRow[] {
  const rows: Array<{ key: string; heightUnits: number; items: MapCatalogObject[]; remaining: number }> = []
  for (const object of objects) {
    const unitWidth = Math.min(object.rect.width, columns)
    const target = rows.find((row) => row.remaining >= unitWidth)
    if (target) {
      target.items.push(object)
      target.remaining -= unitWidth
      target.heightUnits = Math.max(target.heightUnits, object.rect.height)
    } else {
      rows.push({
        key: `row-${rows.length}`,
        heightUnits: object.rect.height,
        items: [object],
        remaining: columns - unitWidth,
      })
    }
  }
  return rows.map(({ key, heightUnits, items }) => ({ key, heightUnits, items }))
}
