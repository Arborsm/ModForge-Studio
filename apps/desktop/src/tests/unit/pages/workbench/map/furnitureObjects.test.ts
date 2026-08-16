import { describe, expect, it } from 'vite-plus/test'
import { deriveFurnitureObjects, furnitureTypeToCategory } from '@pages/workbench/workspaces/map/model/furnitureObjects'

// Data/Furniture JSON 片段，行格式对齐真实游戏数据：texture 字段可省略
// （createFurnitureEntryIndex 兜底 'TileSheets/furniture'），名字型 key 的
// spriteIndex 走显式字段。覆盖：Oak Chair（-1 尺寸走类型默认）+ 一条显式
// '2 3' 尺寸 + 一条无 token 的纯名 + 一条未知 texture + 一条 spriteIndex
// 越界。
const FURNITURE_CONTENT = JSON.stringify({
  'Oak Chair': 'Oak Chair/chair/-1/-1/1/250/-1/[LocalizedText Strings\\Furniture:OakChair]/0',
  Dresser: 'Dresser/dresser/2 3/-1/1/1000/-1/[LocalizedText Strings\\Furniture:Dresser]/10',
  'Mystery Rug': 'Mystery Rug/rug/-1/-1/1/300/-1/Mystery Rug/15',
  'Unknown Sheet': 'Unknown Sheet/other/-1/-1/1/1/-1/[LocalizedText Strings\\Furniture:UnknownSheet]/0/Custom\\UnknownSheet',
  'Huge Table': 'Huge Table/table/3 3/-1/1/1/-1/[LocalizedText Strings\\Furniture:HugeTable]/9999',
})

const EN_STRINGS = JSON.stringify({ OakChair: 'Oak Chair', Dresser: 'Dresser' })
const ZH_STRINGS = JSON.stringify({ OakChair: '橡木椅子' })

describe('furnitureTypeToCategory', () => {
  it('maps every furniture type group to its catalog category', () => {
    expect(furnitureTypeToCategory('chair')).toBe('seating')
    expect(furnitureTypeToCategory('armchair')).toBe('seating')
    expect(furnitureTypeToCategory('bench')).toBe('seating')
    expect(furnitureTypeToCategory('stool')).toBe('seating')
    expect(furnitureTypeToCategory('couch')).toBe('seating')

    expect(furnitureTypeToCategory('table')).toBe('tables')
    expect(furnitureTypeToCategory('long table')).toBe('tables')

    expect(furnitureTypeToCategory('dresser')).toBe('storage')
    expect(furnitureTypeToCategory('bookcase')).toBe('storage')

    expect(furnitureTypeToCategory('bed')).toBe('beds')
    expect(furnitureTypeToCategory('bed child')).toBe('beds')
    expect(furnitureTypeToCategory('bed double')).toBe('beds')

    expect(furnitureTypeToCategory('rug')).toBe('rugs')

    expect(furnitureTypeToCategory('lamp')).toBe('lighting')
    expect(furnitureTypeToCategory('sconce')).toBe('lighting')
    expect(furnitureTypeToCategory('torch')).toBe('lighting')

    expect(furnitureTypeToCategory('plant')).toBe('plants')
    expect(furnitureTypeToCategory('randomized_plant')).toBe('plants')

    expect(furnitureTypeToCategory('window')).toBe('windows')

    expect(furnitureTypeToCategory('painting')).toBe('decor')
    expect(furnitureTypeToCategory('decor')).toBe('decor')
    expect(furnitureTypeToCategory('fishtank')).toBe('decor')
    expect(furnitureTypeToCategory('fireplace')).toBe('decor')
  })

  it('normalizes case and whitespace, and sends unknown types to other', () => {
    expect(furnitureTypeToCategory('  CHAIR ')).toBe('seating')
    expect(furnitureTypeToCategory('Long Table')).toBe('tables')
    expect(furnitureTypeToCategory('other')).toBe('other')
    expect(furnitureTypeToCategory('')).toBe('other')
    expect(furnitureTypeToCategory('telephone')).toBe('other')
  })
})

describe('deriveFurnitureObjects', () => {
  it('derives catalog entries with ids, sheets, rects, categories and localized names', () => {
    const objects = deriveFurnitureObjects(FURNITURE_CONTENT, EN_STRINGS, ZH_STRINGS, 'zh-CN')
    const byId = new Map(objects.map((object) => [object.id, object]))

    expect(objects).toHaveLength(3)

    // -1 尺寸走 chair 类型默认 {1,2}；en/zh 均命中字符串表。
    expect(byId.get('furniture:oak-chair')).toMatchObject({
      id: 'furniture:oak-chair',
      sheet: 'TileSheets/furniture',
      rect: { x: 0, y: 0, width: 1, height: 2 },
      category: 'seating',
      names: { 'zh-CN': '橡木椅子', 'en-US': 'Oak Chair' },
    })

    // 显式 '2 3' 尺寸；zh 表未命中回退 internalName。
    expect(byId.get('furniture:dresser')).toMatchObject({
      id: 'furniture:dresser',
      sheet: 'TileSheets/furniture',
      rect: { x: 10, y: 0, width: 2, height: 3 },
      category: 'storage',
      names: { 'zh-CN': 'Dresser', 'en-US': 'Dresser' },
    })

    // 无 token 的纯名作为两个 locale 的名原样保留。
    expect(byId.get('furniture:mystery-rug')).toMatchObject({
      id: 'furniture:mystery-rug',
      sheet: 'TileSheets/furniture',
      rect: { x: 15, y: 0, width: 3, height: 2 },
      category: 'rugs',
      names: { 'zh-CN': 'Mystery Rug', 'en-US': 'Mystery Rug' },
    })
  })

  it('skips furniture with an unknown texture or an out-of-bounds sprite', () => {
    const objects = deriveFurnitureObjects(FURNITURE_CONTENT, EN_STRINGS, ZH_STRINGS, 'zh-CN')
    const ids = objects.map((object) => object.id)

    expect(ids).not.toContain('furniture:unknown-sheet')
    expect(ids).not.toContain('furniture:huge-table')
  })

  it('falls back to the internal name when string tables are missing', () => {
    const objects = deriveFurnitureObjects(FURNITURE_CONTENT, null, null, 'zh-CN')
    const oakChair = objects.find((object) => object.id === 'furniture:oak-chair')

    expect(oakChair?.names).toEqual({ 'zh-CN': 'Oak Chair', 'en-US': 'Oak Chair' })
  })

  it('keeps non-token display names verbatim for the en-US locale', () => {
    const objects = deriveFurnitureObjects(FURNITURE_CONTENT, EN_STRINGS, ZH_STRINGS, 'en-US')
    const rug = objects.find((object) => object.id === 'furniture:mystery-rug')

    expect(rug?.names).toEqual({ 'en-US': 'Mystery Rug' })
  })
})
