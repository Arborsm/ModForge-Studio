import { describe, expect, it } from 'vite-plus/test'
import {
  isExteriorWarp,
  parseDoorGroups,
  parseWarpEntries,
  parseWarpGroups,
  parseWarpProperty,
  serializeDoorGroups,
  serializeWarpGroups,
} from '@entities/map/lib/warps'
import type { MapDocument } from '@entities/map'

function createMapDocument(overrides: Partial<MapDocument> = {}): MapDocument {
  return {
    name: 'TestMap',
    format: 'tmx',
    sourcePath: 'maps/TestMap.tmx',
    relativePath: 'maps/TestMap.tmx',
    width: 10,
    height: 10,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    properties: {},
    tilesets: [],
    layers: [],
    objectGroups: [],
    ...overrides,
  }
}

describe('parseWarpProperty', () => {
  it('parses a single warp entry', () => {
    const entries = parseWarpProperty('1 2 Farm 10 11')
    expect(entries).toEqual([{ sourceX: 1, sourceY: 2, targetMap: 'Farm', targetX: 10, targetY: 11 }])
  })

  it('parses multiple warp entries', () => {
    const entries = parseWarpProperty('1 2 Farm 10 11  3 4 Town 5 6')
    expect(entries).toEqual([
      { sourceX: 1, sourceY: 2, targetMap: 'Farm', targetX: 10, targetY: 11 },
      { sourceX: 3, sourceY: 4, targetMap: 'Town', targetX: 5, targetY: 6 },
    ])
  })

  it('skips entries with incomplete tokens', () => {
    const entries = parseWarpProperty('1 2 Farm 10')
    expect(entries).toEqual([])
  })

  it('skips entries with non-numeric coordinates', () => {
    const entries = parseWarpProperty('a b Farm 10 11')
    expect(entries).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(parseWarpProperty('')).toEqual([])
  })

  it('returns empty array for whitespace-only input', () => {
    expect(parseWarpProperty('   ')).toEqual([])
  })

  it('handles extra whitespace between entries', () => {
    const entries = parseWarpProperty('1 2 Farm 10 11    3 4 Town 5 6')
    expect(entries).toEqual([
      { sourceX: 1, sourceY: 2, targetMap: 'Farm', targetX: 10, targetY: 11 },
      { sourceX: 3, sourceY: 4, targetMap: 'Town', targetX: 5, targetY: 6 },
    ])
  })
})

describe('parseWarpEntries', () => {
  it('parses Warp and NPCWarp properties from a map document', () => {
    const mapDocument = createMapDocument({
      properties: {
        Warp: '1 2 Farm 10 11',
        NPCWarp: '3 4 Town 5 6',
      },
    })
    const entries = parseWarpEntries(mapDocument)
    expect(entries).toEqual([
      { sourceX: 1, sourceY: 2, targetMap: 'Farm', targetX: 10, targetY: 11 },
      { sourceX: 3, sourceY: 4, targetMap: 'Town', targetX: 5, targetY: 6 },
    ])
  })

  it('returns empty array when no warp properties exist', () => {
    expect(parseWarpEntries(createMapDocument())).toEqual([])
  })

  it('returns empty array when warp properties are empty strings', () => {
    const mapDocument = createMapDocument({
      properties: { Warp: '', NPCWarp: '' },
    })
    expect(parseWarpEntries(mapDocument)).toEqual([])
  })
})

describe('warp and door group parsing', () => {
  it('parses and re-serializes warp property groups losslessly', () => {
    const parsed = parseWarpGroups('1 2 Farm 10 11  3 4 Town 5 6')
    expect(parsed.groups).toEqual([
      { fromX: 1, fromY: 2, toMap: 'Farm', toX: 10, toY: 11 },
      { fromX: 3, fromY: 4, toMap: 'Town', toX: 5, toY: 6 },
    ])
    expect(serializeWarpGroups(parsed.groups, parsed.leftover)).toBe('1 2 Farm 10 11 3 4 Town 5 6')
  })

  it('preserves malformed warp tokens in the leftover', () => {
    const parsed = parseWarpGroups('1 2 Farm 10 11  x y')
    expect(parsed.groups).toEqual([{ fromX: 1, fromY: 2, toMap: 'Farm', toX: 10, toY: 11 }])
    expect(parsed.leftover).toEqual(['x', 'y'])
    expect(serializeWarpGroups(parsed.groups, parsed.leftover)).toBe('1 2 Farm 10 11 x y')
  })

  it('parses and re-serializes door property groups losslessly', () => {
    const parsed = parseDoorGroups('5 6 2 17  8 9 2 18')
    expect(parsed.groups).toEqual([
      { x: 5, y: 6, sheet: 2, tileIndex: 17 },
      { x: 8, y: 9, sheet: 2, tileIndex: 18 },
    ])
    expect(serializeDoorGroups(parsed.groups, parsed.leftover)).toBe('5 6 2 17 8 9 2 18')
  })
})

describe('isExteriorWarp', () => {
  it('returns true when sourceX is negative', () => {
    const mapDocument = createMapDocument()
    expect(
      isExteriorWarp(mapDocument, {
        sourceX: -1,
        sourceY: 5,
        targetMap: 'Farm',
        targetX: 10,
        targetY: 11,
      }),
    ).toBe(true)
  })

  it('returns true when sourceY is negative', () => {
    const mapDocument = createMapDocument()
    expect(
      isExteriorWarp(mapDocument, {
        sourceX: 5,
        sourceY: -1,
        targetMap: 'Farm',
        targetX: 10,
        targetY: 11,
      }),
    ).toBe(true)
  })

  it('returns true when sourceX is >= map width', () => {
    const mapDocument = createMapDocument({ width: 10 })
    expect(
      isExteriorWarp(mapDocument, {
        sourceX: 10,
        sourceY: 5,
        targetMap: 'Farm',
        targetX: 10,
        targetY: 11,
      }),
    ).toBe(true)
  })

  it('returns true when sourceY is >= map height', () => {
    const mapDocument = createMapDocument({ height: 10 })
    expect(
      isExteriorWarp(mapDocument, {
        sourceX: 5,
        sourceY: 10,
        targetMap: 'Farm',
        targetX: 10,
        targetY: 11,
      }),
    ).toBe(true)
  })

  it('returns false when warp is inside map bounds', () => {
    const mapDocument = createMapDocument({ width: 20, height: 20 })
    expect(
      isExteriorWarp(mapDocument, {
        sourceX: 5,
        sourceY: 5,
        targetMap: 'Farm',
        targetX: 10,
        targetY: 11,
      }),
    ).toBe(false)
  })

  it('returns false at the edges when coordinates are still in bounds', () => {
    const mapDocument = createMapDocument({ width: 10, height: 10 })
    expect(
      isExteriorWarp(mapDocument, {
        sourceX: 9,
        sourceY: 9,
        targetMap: 'Farm',
        targetX: 10,
        targetY: 11,
      }),
    ).toBe(false)
  })
})
