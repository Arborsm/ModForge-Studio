import { describe, expect, it } from 'vite-plus/test'
import type { MapDocument, MapTileset } from '@entities/map'
import {
  buildGameSheetTileset,
  loadProjectTilesheetCatalog,
  saveGameSheetImageSources,
} from '@pages/workbench/workspaces/map/model/gameSheetTilesets'
import { findTilesheetByKey } from '@entities/map/model/vanillaTilesheets'

function createTileset(overrides: Partial<MapTileset> = {}): MapTileset {
  return {
    firstGid: 1,
    name: 'indoor',
    tileWidth: 16,
    tileHeight: 16,
    tileCount: 32,
    columns: 8,
    imageSource: 'tiles.png',
    imagePath: 'assets/maps/tiles.png',
    imageWidth: 128,
    imageHeight: 64,
    properties: {},
    tileProperties: {},
    animations: {},
    ...overrides,
  }
}

function createDocument(tilesets: MapTileset[], overrides: Partial<MapDocument> = {}): MapDocument {
  return {
    name: 'TestMap',
    format: 'tmx',
    sourcePath: 'assets/maps/TestMap.tmx',
    relativePath: 'assets/maps/TestMap.tmx',
    width: 10,
    height: 10,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    properties: {},
    tilesets,
    layers: [],
    objectGroups: [],
    ...overrides,
  }
}

function sheet(key: string) {
  const entry = findTilesheetByKey(key)
  if (!entry) throw new Error(`catalog is missing ${key}`)
  return entry
}

describe('buildGameSheetTileset', () => {
  it('builds a dynamic reference with the predefined split and catalog property', () => {
    const document = createDocument([createTileset({ firstGid: 1, tileCount: 32 })])
    const tileset = buildGameSheetTileset(document, sheet('Maps/townInterior'))
    expect(tileset).toMatchObject({
      firstGid: 33,
      name: 'townInterior',
      tileWidth: 16,
      tileHeight: 16,
      columns: 32,
      tileCount: 2176,
      imageSource: 'townInterior.png',
      imagePath: null,
      imageWidth: 512,
      imageHeight: 1088,
      properties: { 'modforge:game-sheet': 'Maps/townInterior' },
    })
  })

  it('deduplicates the tileset name against existing sheets', () => {
    const document = createDocument([createTileset({ name: 'townInterior' }), createTileset({ name: 'townInterior_2' })])
    const tileset = buildGameSheetTileset(document, sheet('Maps/townInterior'))
    expect(tileset?.name).toBe('townInterior_3')
  })

  it('uses the escaping reference for non-Maps sheets', () => {
    const tileset = buildGameSheetTileset(createDocument([]), sheet('TileSheets/furniture'))
    expect(tileset?.imageSource).toBe('../TileSheets/furniture.png')
  })

  it('rejects sheets that do not divide evenly and non-16px maps', () => {
    expect(buildGameSheetTileset(createDocument([]), sheet('Maps/HarveyBalloonTiles'))).toBeNull()
    expect(buildGameSheetTileset(createDocument([], { tileWidth: 32 }), sheet('Maps/townInterior'))).toBeNull()
  })
})

describe('saveGameSheetImageSources', () => {
  const dynamic = createTileset({
    name: 'townInterior',
    imagePath: null,
    imageSource: 'townInterior.png',
    properties: { 'modforge:game-sheet': 'Maps/townInterior' },
  })

  it('rewrites game-sheet sources to content keys for tbin output', () => {
    const document = createDocument([dynamic, createTileset({ name: 'project' })])
    const saved = saveGameSheetImageSources(document, 'tbin')
    expect(saved.tilesets[0]?.imageSource).toBe('townInterior')
    expect(saved.tilesets[1]).toBe(document.tilesets[1])
    expect(document.tilesets[0]?.imageSource).toBe('townInterior.png')
  })

  it('keeps the canonical tmx reference and preserves identity when unchanged', () => {
    const document = createDocument([dynamic])
    expect(saveGameSheetImageSources(document, 'tmx')).toBe(document)
    const projectOnly = createDocument([createTileset({ name: 'project' })])
    expect(saveGameSheetImageSources(projectOnly, 'tbin')).toBe(projectOnly)
  })

  it('writes the folder-escaped forms for non-Maps sheets', () => {
    const furniture = createTileset({
      name: 'furniture',
      imagePath: null,
      imageSource: '../TileSheets/furniture.png',
      properties: { 'modforge:game-sheet': 'TileSheets/furniture' },
    })
    const saved = saveGameSheetImageSources(createDocument([furniture]), 'tbin')
    expect(saved.tilesets[0]?.imageSource).toBe('TileSheets\\furniture')
  })
})

describe('loadProjectTilesheetCatalog', () => {
  const descriptor = JSON.stringify({
    version: 1,
    sheets: [{ key: 'TileSheets/my_mod', imageWidth: 32, imageHeight: 32 }],
  })

  it('parses a valid project descriptor', async () => {
    const result = await loadProjectTilesheetCatalog(async () => ({ bytesBase64: btoa(descriptor) }))
    expect(result).toEqual({
      status: 'ok',
      sheets: [{ key: 'TileSheets/my_mod', name: 'my_mod', group: 'tilesheets', imageWidth: 32, imageHeight: 32 }],
    })
  })

  it('reports a missing descriptor file as missing', async () => {
    const result = await loadProjectTilesheetCatalog(async () => {
      throw new Error('not found')
    })
    expect(result).toEqual({ status: 'missing' })
  })

  it('reports schema problems as errors', async () => {
    const result = await loadProjectTilesheetCatalog(async () => ({ bytesBase64: btoa('{"sheets":[]}extra') }))
    expect(result.status).toBe('error')
  })
})
