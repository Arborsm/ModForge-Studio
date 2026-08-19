import { afterEach, describe, expect, it } from 'vite-plus/test'
import {
  VANILLA_TILESHEETS,
  findTilesheetByKey,
  getTilesheetCatalog,
  parseTilesheetCatalogJson,
  registerCustomTilesheets,
  unregisterCustomTilesheets,
  vanillaTilesheetHasEvenSplit,
  vanillaTilesheetSplit,
} from '@entities/map/model/vanillaTilesheets'

describe('bundled vanilla tilesheet catalog', () => {
  it('lists unique keys and names', () => {
    const keys = new Set(VANILLA_TILESHEETS.map((sheet) => sheet.key.toLowerCase()))
    const names = new Set(VANILLA_TILESHEETS.map((sheet) => sheet.name.toLowerCase()))
    expect(keys.size).toBe(VANILLA_TILESHEETS.length)
    expect(names.size).toBe(VANILLA_TILESHEETS.length)
  })

  it('assigns the maps group only to Content/Maps keys', () => {
    for (const sheet of VANILLA_TILESHEETS) {
      expect(sheet.group).toBe(sheet.key.startsWith('Maps/') ? 'maps' : 'tilesheets')
    }
  })

  it('anchors well-known vanilla sheets with their decoded sizes', () => {
    expect(findTilesheetByKey('Maps/townInterior')).toMatchObject({ name: 'townInterior', imageWidth: 512, imageHeight: 1088 })
    expect(findTilesheetByKey('Maps/spring_outdoorsTileSheet')).toMatchObject({ imageWidth: 400, imageHeight: 1264 })
    expect(findTilesheetByKey('maps/paths')).toMatchObject({ imageWidth: 64, imageHeight: 256 })
    expect(findTilesheetByKey('TileSheets/furniture')).toMatchObject({ group: 'tilesheets', imageWidth: 512, imageHeight: 1488 })
    expect(findTilesheetByKey('Maps/definitely-missing')).toBeNull()
  })

  it('computes the predefined 16px split', () => {
    const sheet = findTilesheetByKey('Maps/townInterior')
    expect(sheet && vanillaTilesheetSplit(sheet)).toEqual({ columns: 32, rows: 68, tileCount: 2176 })
    expect(sheet && vanillaTilesheetHasEvenSplit(sheet)).toBe(true)
    const uneven = findTilesheetByKey('Maps/HarveyBalloonTiles')
    expect(uneven && vanillaTilesheetHasEvenSplit(uneven)).toBe(false)
  })
})

describe('parseTilesheetCatalogJson', () => {
  it('parses a valid descriptor and infers names and groups', () => {
    const result = parseTilesheetCatalogJson(
      JSON.stringify({
        version: 1,
        sheets: [
          { key: 'TileSheets/custom_sheet', imageWidth: 128, imageHeight: 256 },
          { key: 'Maps/CustomSheet', name: 'Fancy', imageWidth: 64, imageHeight: 64 },
        ],
      }),
      'test.json',
    )
    expect(result).toEqual({
      ok: true,
      sheets: [
        { key: 'TileSheets/custom_sheet', name: 'custom_sheet', group: 'tilesheets', imageWidth: 128, imageHeight: 256 },
        { key: 'Maps/CustomSheet', name: 'Fancy', group: 'maps', imageWidth: 64, imageHeight: 64 },
      ],
    })
  })

  it('rejects malformed documents with a source-labelled error', () => {
    expect(parseTilesheetCatalogJson('{nope', 'x.json').ok).toBe(false)
    expect(parseTilesheetCatalogJson('[]', 'x.json').ok).toBe(false)
    expect(parseTilesheetCatalogJson('{"version":2,"sheets":[]}', 'x.json').ok).toBe(false)
    expect(parseTilesheetCatalogJson('{"sheets":[{"key":"noslash","imageWidth":1,"imageHeight":1}]}', 'x.json').ok).toBe(false)
    expect(parseTilesheetCatalogJson('{"sheets":[{"key":"A/b","imageWidth":0,"imageHeight":1}]}', 'x.json').ok).toBe(false)
    const duplicates = parseTilesheetCatalogJson(
      '{"sheets":[{"key":"A/b","imageWidth":1,"imageHeight":1},{"key":"a/B","imageWidth":1,"imageHeight":1}]}',
      'x.json',
    )
    expect(duplicates.ok).toBe(false)
    if (!duplicates.ok) expect(duplicates.error).toContain('x.json')
  })
})

describe('custom tilesheet registry', () => {
  afterEach(() => {
    unregisterCustomTilesheets('test-source')
  })

  it('merges, overrides, and unregisters custom entries', () => {
    const base = getTilesheetCatalog().length
    registerCustomTilesheets('test-source', [
      { key: 'TileSheets/my_mod', name: 'my_mod', group: 'tilesheets', imageWidth: 32, imageHeight: 32 },
    ])
    expect(getTilesheetCatalog().length).toBe(base + 1)
    expect(findTilesheetByKey('tilesheets/MY_MOD')).toMatchObject({ imageWidth: 32 })

    registerCustomTilesheets('test-source', [
      { key: 'Maps/townInterior', name: 'townInterior', group: 'maps', imageWidth: 512, imageHeight: 1088 },
      { key: 'TileSheets/my_mod', name: 'renamed', group: 'tilesheets', imageWidth: 64, imageHeight: 64 },
    ])
    expect(getTilesheetCatalog().length).toBe(base + 1)
    expect(findTilesheetByKey('TileSheets/my_mod')).toMatchObject({ name: 'renamed', imageWidth: 64 })

    unregisterCustomTilesheets('test-source')
    expect(getTilesheetCatalog().length).toBe(base)
    expect(findTilesheetByKey('TileSheets/my_mod')).toBeNull()
    expect(findTilesheetByKey('Maps/townInterior')).toMatchObject({ imageWidth: 512 })
  })
})
