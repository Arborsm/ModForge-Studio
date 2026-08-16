import { describe, expect, it } from 'vite-plus/test'
import type { MapCatalogObject } from '@entities/map'
import { packMapObjectsIntoRows } from '@pages/workbench/workspaces/map/model/mapObjectLayout'

function object(id: string, width: number, height = 1): MapCatalogObject {
  return {
    id,
    sheet: 'TileSheets/furniture',
    rect: { x: 0, y: 0, width, height },
    category: 'other',
    names: { 'en-US': id },
  }
}

describe('packMapObjectsIntoRows', () => {
  it('空数组返回空行集', () => {
    expect(packMapObjectsIntoRows([])).toEqual([])
  })

  it('1×1 对象每行装 4 个并回填高度', () => {
    const rows = packMapObjectsIntoRows([0, 1, 2, 3, 4, 5].map((index) => object(`o${index}`, 1)))
    expect(rows).toHaveLength(2)
    expect(rows[0]!.items.map((item) => item.id)).toEqual(['o0', 'o1', 'o2', 'o3'])
    expect(rows[1]!.items.map((item) => item.id)).toEqual(['o4', 'o5'])
    expect(rows[0]!.heightUnits).toBe(1)
    expect(rows[1]!.heightUnits).toBe(1)
  })

  it('宽对象按 min(width, columns) 占列，剩余列可回填', () => {
    const rows = packMapObjectsIntoRows([object('a', 3), object('b', 1), object('c', 1)])
    expect(rows[0]!.items.map((item) => item.id)).toEqual(['a', 'b'])
    expect(rows[1]!.items.map((item) => item.id)).toEqual(['c'])
  })

  it('超宽对象独占一行（占满 4 列）', () => {
    const rows = packMapObjectsIntoRows([object('big', 5), object('small', 1)])
    expect(rows[0]!.items.map((item) => item.id)).toEqual(['big'])
    expect(rows[1]!.items.map((item) => item.id)).toEqual(['small'])
  })

  it('heightUnits 取行内对象最大高度', () => {
    const rows = packMapObjectsIntoRows([object('tall', 1, 3), object('short', 1), object('a', 1, 2), object('b', 1), object('c', 1)])
    expect(rows[0]!.heightUnits).toBe(3)
    expect(rows[0]!.items.map((item) => item.id)).toEqual(['tall', 'short', 'a', 'b'])
    expect(rows[1]!.heightUnits).toBe(1)
    expect(rows[1]!.items.map((item) => item.id)).toEqual(['c'])
  })

  it('3 列宽对象不能与另一个 3 列宽对象同行', () => {
    const rows = packMapObjectsIntoRows([object('a', 3), object('b', 3)])
    expect(rows).toHaveLength(2)
    expect(rows[0]!.items.map((item) => item.id)).toEqual(['a'])
    expect(rows[1]!.items.map((item) => item.id)).toEqual(['b'])
  })

  it('columns 参数可自定义', () => {
    const rows = packMapObjectsIntoRows([object('a', 2), object('b', 2)], 2)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.items.map((item) => item.id)).toEqual(['a'])
    expect(rows[1]!.items.map((item) => item.id)).toEqual(['b'])
    expect(rows[0]!.heightUnits).toBe(1)
  })
})
