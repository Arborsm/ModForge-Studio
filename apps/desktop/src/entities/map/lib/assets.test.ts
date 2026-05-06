import { describe, expect, it } from 'vitest'
import { resolveTilesetImagePath } from './assets'
import type { MapDocument, MapTileset } from '@shared/contracts'

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
})
