import { afterEach, describe, expect, it } from 'vite-plus/test'
import {
  BUNDLED_MAP_OBJECTS_SOURCE,
  GAME_FURNITURE_SOURCE,
  MAP_OBJECT_CATEGORIES,
  PROJECT_MAP_OBJECTS_SOURCE,
  getMapObjects,
  mapObjectDisplayName,
  parseMapObjectsJson,
  registerMapObjects,
  subscribeMapObjects,
  unregisterMapObjects,
  type MapCatalogObject,
} from '@entities/map/model/mapObjects'

/** 合法对象条目的最小 fixture，overrides 可覆盖任意字段。 */
const fixture = (overrides: Record<string, unknown> = {}): MapCatalogObject =>
  ({
    id: 'test:item',
    sheet: 'TileSheets/furniture',
    rect: { x: 0, y: 0, width: 2, height: 1 },
    category: 'tables',
    names: { 'en-US': 'Table', 'zh-CN': '桌子' },
    ...overrides,
  }) as MapCatalogObject

describe('MAP_OBJECT_CATEGORIES', () => {
  it('按固定顺序列出全部分类', () => {
    expect(MAP_OBJECT_CATEGORIES).toEqual([
      'seating',
      'tables',
      'beds',
      'rugs',
      'lighting',
      'electronics',
      'plants',
      'decor',
      'storage',
      'windows',
      'structure',
      'walls-floors',
      'outdoor',
      'festival',
      'other',
    ])
  })
})

describe('parseMapObjectsJson', () => {
  it('解析合法文档（缺省 version、多 locale names）', () => {
    const result = parseMapObjectsJson(
      JSON.stringify({
        objects: [
          {
            id: 'mod:sofa',
            sheet: 'Maps/townInterior',
            rect: { x: 16, y: 0, width: 2, height: 1 },
            category: 'seating',
            names: { 'en-US': 'Sofa', 'zh-CN': '沙发' },
          },
        ],
      }),
      'test.json',
    )
    expect(result).toEqual({
      ok: true,
      objects: [
        {
          id: 'mod:sofa',
          sheet: 'Maps/townInterior',
          rect: { x: 16, y: 0, width: 2, height: 1 },
          category: 'seating',
          names: { 'en-US': 'Sofa', 'zh-CN': '沙发' },
        },
      ],
    })
  })

  it('拒绝非法 JSON 与根非对象', () => {
    expect(parseMapObjectsJson('{nope', 'x.json').ok).toBe(false)
    expect(parseMapObjectsJson('[]', 'x.json').ok).toBe(false)
    expect(parseMapObjectsJson('"str"', 'x.json').ok).toBe(false)
    expect(parseMapObjectsJson('null', 'x.json').ok).toBe(false)
  })

  it('拒绝 version 2 与缺失 objects', () => {
    expect(parseMapObjectsJson('{"version":2,"objects":[]}', 'x.json').ok).toBe(false)
    expect(parseMapObjectsJson('{"version":1}', 'x.json').ok).toBe(false)
  })

  it('拒绝大小写不同的重复 id', () => {
    const result = parseMapObjectsJson(
      JSON.stringify({
        version: 1,
        objects: [fixture({ id: 'Mod:Sofa' }), fixture({ id: 'mod:sofa', rect: { x: 1, y: 0, width: 1, height: 1 } })],
      }),
      'x.json',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('x.json')
      expect(result.error).toContain('objects[1]')
    }
  })

  it('拒绝无斜杠的 sheet', () => {
    const result = parseMapObjectsJson(JSON.stringify({ objects: [fixture({ sheet: 'noslash' })] }), 'x.json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('objects[0].sheet')
  })

  it('拒绝 rect 非整数、负坐标与 width 0', () => {
    expect(parseMapObjectsJson(JSON.stringify({ objects: [fixture({ rect: { x: 0.5, y: 0, width: 1, height: 1 } })] }), 'x.json').ok).toBe(
      false,
    )
    expect(parseMapObjectsJson(JSON.stringify({ objects: [fixture({ rect: { x: 0, y: 0, width: 0, height: 1 } })] }), 'x.json').ok).toBe(
      false,
    )
    expect(parseMapObjectsJson(JSON.stringify({ objects: [fixture({ rect: { x: -1, y: 0, width: 1, height: 1 } })] }), 'x.json').ok).toBe(
      false,
    )
    expect(parseMapObjectsJson(JSON.stringify({ objects: [fixture({ rect: { x: 0, y: 0, width: 1, height: 1.5 } })] }), 'x.json').ok).toBe(
      false,
    )
  })

  it('拒绝未知 category', () => {
    const result = parseMapObjectsJson(JSON.stringify({ objects: [fixture({ category: 'nope' })] }), 'x.json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('objects[0].category')
  })

  it('拒绝空 names 或非字符串显示名', () => {
    expect(parseMapObjectsJson(JSON.stringify({ objects: [fixture({ names: {} })] }), 'x.json').ok).toBe(false)
    expect(parseMapObjectsJson(JSON.stringify({ objects: [fixture({ names: { 'en-US': '' } })] }), 'x.json').ok).toBe(false)
    expect(parseMapObjectsJson(JSON.stringify({ objects: [fixture({ names: { 'en-US': 5 } })] }), 'x.json').ok).toBe(false)
  })
})

describe('mapObjectDisplayName', () => {
  const object = {
    id: 'test:item',
    sheet: 'TileSheets/furniture',
    rect: { x: 0, y: 0, width: 1, height: 1 },
    category: 'decor' as const,
    names: { 'en-US': 'Vase', 'zh-CN': '花瓶' },
  }

  it('优先精确命中 locale，否则回退 en-US', () => {
    expect(mapObjectDisplayName(object, 'zh-CN')).toBe('花瓶')
    expect(mapObjectDisplayName(object, 'fr-FR')).toBe('Vase')
  })

  it('names 无 en-US 时取首个非空名称，全空时回退 id', () => {
    expect(mapObjectDisplayName({ ...object, names: { 'zh-CN': '花瓶' } }, 'de-DE')).toBe('花瓶')
    expect(mapObjectDisplayName({ ...object, names: { 'fr-FR': 'Pot' } }, 'de-DE')).toBe('Pot')
    expect(mapObjectDisplayName({ ...object, names: {} }, 'de-DE')).toBe('test:item')
  })
})

describe('map object registry', () => {
  afterEach(() => {
    unregisterMapObjects('test-source')
  })

  it('合并内置 bundled 与注册对象', () => {
    const base = getMapObjects()
    expect(base.some((object) => object.id === 'curated:towninterior:wooden-door')).toBe(true)
    const before = base.length
    registerMapObjects('test-source', [fixture()])
    const merged = getMapObjects()
    expect(merged.length).toBe(before + 1)
    expect(merged.some((object) => object.id === 'test:item')).toBe(true)
  })

  it('同 id 后注册覆盖先注册', () => {
    registerMapObjects('test-source', [fixture({ names: { 'en-US': 'First' } })])
    registerMapObjects('test-source', [fixture({ names: { 'en-US': 'Second' } })])
    const matched = getMapObjects().filter((object) => object.id === 'test:item')
    expect(matched).toHaveLength(1)
    expect(matched[0]?.names['en-US']).toBe('Second')
  })

  it('unregister 移除贡献，不存在时无副作用', () => {
    registerMapObjects('test-source', [fixture()])
    expect(getMapObjects().some((object) => object.id === 'test:item')).toBe(true)
    unregisterMapObjects('test-source')
    expect(getMapObjects().some((object) => object.id === 'test:item')).toBe(false)
    expect(() => unregisterMapObjects('test-source')).not.toThrow()
    expect(getMapObjects().some((object) => object.id === 'curated:towninterior:wooden-door')).toBe(true)
  })

  it('getMapObjects 返回稳定引用，subscribe 随注册变化触发', () => {
    const first = getMapObjects()
    expect(getMapObjects()).toBe(first)

    let calls = 0
    const unsubscribe = subscribeMapObjects(() => {
      calls += 1
    })
    registerMapObjects('test-source', [fixture()])
    unregisterMapObjects('test-source')
    expect(calls).toBe(2)
    unsubscribe()
    registerMapObjects('test-source', [fixture()])
    expect(calls).toBe(2)
  })
})

describe('source constants', () => {
  it('固定 source 标识', () => {
    expect(BUNDLED_MAP_OBJECTS_SOURCE).toBe('bundled')
    expect(GAME_FURNITURE_SOURCE).toBe('game-furniture')
    expect(PROJECT_MAP_OBJECTS_SOURCE).toBe('project:assets/map-objects.json')
  })
})
