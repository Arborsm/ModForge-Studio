import { describe, expect, it } from 'vite-plus/test'
import type { MapCatalogObject, MapDocument, MapTileset } from '@entities/map'
import { catalogObjectSelection } from '@pages/workbench/workspaces/map/model/mapObjectPick'

function createTileset(overrides: Partial<MapTileset> = {}): MapTileset {
  return {
    firstGid: 1,
    name: 'townInterior',
    tileWidth: 16,
    tileHeight: 16,
    tileCount: 2176,
    columns: 32,
    imageSource: 'townInterior.png',
    imagePath: null,
    imageWidth: 512,
    imageHeight: 1088,
    properties: { 'modforge:game-sheet': 'Maps/townInterior' },
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

function createObject(overrides: Partial<MapCatalogObject> = {}): MapCatalogObject {
  return {
    id: 'chair',
    sheet: 'Maps/townInterior',
    rect: { x: 4, y: 3, width: 2, height: 3 },
    category: 'seating',
    names: { 'en-US': 'Chair' },
    ...overrides,
  }
}

describe('catalogObjectSelection', () => {
  it('resolves an attached sheet rect to a palette selection with the computed start index', () => {
    const document = createDocument([createTileset()])
    const selection = catalogObjectSelection(document, createObject({ rect: { x: 4, y: 3, width: 2, height: 3 } }))
    expect(selection).toEqual({ tilesetName: 'townInterior', startIndex: 3 * 32 + 4, width: 2, height: 3 })
  })

  it('resolves a 1x1 rect to a single-tile selection', () => {
    const document = createDocument([createTileset()])
    const selection = catalogObjectSelection(document, createObject({ rect: { x: 31, y: 0, width: 1, height: 1 } }))
    expect(selection).toEqual({ tilesetName: 'townInterior', startIndex: 31, width: 1, height: 1 })
  })

  it('matches the sheet key case-insensitively', () => {
    const document = createDocument([createTileset()])
    const selection = catalogObjectSelection(document, createObject({ sheet: 'maps/towninterior' }))
    expect(selection?.tilesetName).toBe('townInterior')
  })

  it('returns null when the sheet is not attached as a dynamic game sheet', () => {
    const document = createDocument([createTileset()])
    expect(catalogObjectSelection(document, createObject({ sheet: 'TileSheets/furniture' }))).toBeNull()
    // 同名 tileset 但缺 game-sheet 属性（项目图片 tileset）不算命中。
    const projectOnly = createDocument([createTileset({ properties: {}, imagePath: 'assets/maps/indoor.png' })])
    expect(catalogObjectSelection(projectOnly, createObject())).toBeNull()
  })

  it('returns null when the rect spills past the columns', () => {
    const document = createDocument([createTileset()])
    expect(catalogObjectSelection(document, createObject({ rect: { x: 31, y: 0, width: 2, height: 1 } }))).toBeNull()
  })

  it('returns null when the rect spills past the last row', () => {
    const document = createDocument([createTileset()])
    expect(catalogObjectSelection(document, createObject({ rect: { x: 0, y: 67, width: 1, height: 2 } }))).toBeNull()
  })

  it('uses the ceil row count for sheets whose tile count is not a column multiple', () => {
    const document = createDocument([createTileset({ tileCount: 2177 })])
    expect(catalogObjectSelection(document, createObject({ rect: { x: 0, y: 68, width: 1, height: 1 } }))).not.toBeNull()
    expect(catalogObjectSelection(document, createObject({ rect: { x: 0, y: 68, width: 1, height: 2 } }))).toBeNull()
  })
})
