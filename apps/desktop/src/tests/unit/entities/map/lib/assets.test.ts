import { describe, expect, it } from 'vite-plus/test'
import { resolveTilesetImagePath } from '@entities/map/lib/assets'
import type { MapDocument, MapTileset } from '@entities/map'

function createTileset(overrides: Partial<MapTileset> = {}): MapTileset {
  return {
    firstGid: 1,
    name: 'TestTileset',
    tileWidth: 16,
    tileHeight: 16,
    tileCount: 32,
    columns: 8,
    imageSource: null,
    imagePath: null,
    imageWidth: null,
    imageHeight: null,
    properties: {},
    tileProperties: {},
    animations: {},
    ...overrides,
  }
}

function createMapDocument(overrides: Partial<MapDocument> = {}): MapDocument {
  return {
    name: 'TestMap',
    format: 'tmx',
    sourcePath: 'maps\\TestMap.tmx',
    relativePath: 'maps\\TestMap.tmx',
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

describe('resolveTilesetImagePath', () => {
  it('returns imagePath when set directly', () => {
    const mapDocument = createMapDocument()
    const tileset = createTileset({ imagePath: 'C:\\Game\\assets\\tiles.png' })
    expect(resolveTilesetImagePath(mapDocument, tileset)).toBe('C:\\Game\\assets\\tiles.png')
  })

  it('resolves imageSource relative to map directory when imagePath is null', () => {
    const mapDocument = createMapDocument({ sourcePath: 'maps\\TestMap.tmx' })
    const tileset = createTileset({ imagePath: null, imageSource: 'tilesheet.png' })
    expect(resolveTilesetImagePath(mapDocument, tileset)).toBe('maps\\tilesheet.png')
  })

  it('appends .xnb extension when imageSource has no extension', () => {
    const mapDocument = createMapDocument({ sourcePath: 'maps\\TestMap.tmx' })
    const tileset = createTileset({ imagePath: null, imageSource: 'springobjects' })
    expect(resolveTilesetImagePath(mapDocument, tileset)).toBe('maps\\springobjects.xnb')
  })

  it('resolves a root-level map tileset without adding a leading separator', () => {
    const mapDocument = createMapDocument({ sourcePath: 'TestMap.tmx' })
    const tileset = createTileset({ imagePath: null, imageSource: 'springobjects' })
    expect(resolveTilesetImagePath(mapDocument, tileset)).toBe('springobjects.xnb')
  })

  it('does not append .xnb when imageSource already has an extension', () => {
    const mapDocument = createMapDocument({ sourcePath: 'maps\\TestMap.tmx' })
    const tileset = createTileset({ imagePath: null, imageSource: 'tilesheet.png' })
    expect(resolveTilesetImagePath(mapDocument, tileset)).toBe('maps\\tilesheet.png')
  })

  it('returns null when both imagePath and imageSource are null', () => {
    const mapDocument = createMapDocument()
    const tileset = createTileset({ imagePath: null, imageSource: null })
    expect(resolveTilesetImagePath(mapDocument, tileset)).toBeNull()
  })

  it('normalizes forward slashes in imageSource', () => {
    const mapDocument = createMapDocument({ sourcePath: 'maps/Sub/TestMap.tmx' })
    const tileset = createTileset({ imagePath: null, imageSource: '../textures/tile.png' })
    expect(resolveTilesetImagePath(mapDocument, tileset)).toBe('maps\\Sub\\..\\textures\\tile.png')
  })

  it('resolves a game-sheet tileset inside the connected game directory', () => {
    const mapDocument = createMapDocument()
    const tileset = createTileset({
      imagePath: null,
      imageSource: 'townInterior.png',
      properties: { 'modforge:game-sheet': 'Maps/townInterior' },
    })
    expect(resolveTilesetImagePath(mapDocument, tileset, 'C:\\Game\\Stardew Valley')).toBe(
      'C:/Game/Stardew Valley/Content/Maps/townInterior.xnb',
    )
  })

  it('returns null for a game-sheet tileset without a game directory', () => {
    const mapDocument = createMapDocument()
    const tileset = createTileset({
      imagePath: null,
      imageSource: 'townInterior.png',
      properties: { 'modforge:game-sheet': 'Maps/townInterior' },
    })
    expect(resolveTilesetImagePath(mapDocument, tileset)).toBeNull()
    expect(resolveTilesetImagePath(mapDocument, tileset, null)).toBeNull()
  })

  it('ignores an unknown game-sheet key and keeps project resolution', () => {
    const mapDocument = createMapDocument({ sourcePath: 'maps\\TestMap.tmx' })
    const tileset = createTileset({
      imagePath: null,
      imageSource: 'tilesheet.png',
      properties: { 'modforge:game-sheet': 'Maps/not-a-real-sheet' },
    })
    expect(resolveTilesetImagePath(mapDocument, tileset, 'C:\\Game')).toBe('maps\\tilesheet.png')
  })
})
