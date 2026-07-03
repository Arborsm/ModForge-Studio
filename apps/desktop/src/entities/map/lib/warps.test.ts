import { describe, expect, it } from 'vite-plus/test'
import { isExteriorWarp, parseWarpEntries, parseWarpProperty } from './warps'
import type { MapDocument } from '@shared/contracts'

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
