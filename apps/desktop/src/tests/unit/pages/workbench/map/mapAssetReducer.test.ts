import { describe, expect, it } from 'vite-plus/test'
import { FLIPPED_DIAGONALLY_FLAG, FLIPPED_HORIZONTALLY_FLAG, type MapDocument } from '@entities/map'
import {
  addMapAssetLayer,
  applyMapAssetStamp,
  applyMapAssetStroke,
  collectMapAssetTbinIssues,
  collectMapAssetLayerNameIssues,
  deleteMapAssetLayer,
  mapAssetBucketPoints,
  reorderMapAssetLayer,
  relativeMapAssetReference,
  rotateMapAssetTileClockwise,
  setMapAssetCellProperties,
  toggleMapAssetTileFlag,
} from '@pages/workbench/workspaces/map/model/mapAssetReducer'

function document(): MapDocument {
  return {
    name: 'ReducerMap',
    format: 'tmx',
    sourcePath: 'ReducerMap.tmx',
    relativePath: 'assets/maps/ReducerMap.tmx',
    width: 4,
    height: 3,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    properties: {},
    tilesets: [],
    layers: [
      {
        id: 1,
        name: 'Back',
        kind: 'tile',
        width: 4,
        height: 3,
        visible: true,
        opacity: 1,
        offsetX: 0,
        offsetY: 0,
        properties: {},
        gids: new Uint32Array([1, 1, 2, 2, 1, 3, 3, 2, 1, 1, 2, 2]),
        nonEmptyTiles: 12,
      },
    ],
    objectGroups: [],
  }
}

describe('map asset reducer', () => {
  it('paints, stamps, and fills with full GID connectivity', () => {
    const painted = applyMapAssetStroke(
      document(),
      1,
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      9,
    )
    expect(Array.from(painted.layers[0]!.gids).slice(0, 3)).toEqual([9, 9, 2])

    const stamped = applyMapAssetStamp(
      document(),
      1,
      { x: 1, y: 1 },
      { firstGid: 20, startIndex: 1, width: 2, height: 2, columns: 4, tileCount: 8 },
    )
    expect(Array.from(stamped.layers[0]!.gids)).toEqual([1, 1, 2, 2, 1, 21, 22, 2, 1, 25, 26, 2])

    expect(mapAssetBucketPoints(document(), 1, { x: 0, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
    ])
  })

  it('keeps cell properties instance-scoped and composes transforms', () => {
    const withProperties = setMapAssetCellProperties(document(), 1, { x: 2, y: 1 }, { Action: 'Warp Town 1 2' })
    expect(withProperties.layers[0]!.cellProperties?.[6]).toEqual({ Action: 'Warp Town 1 2' })
    expect(withProperties.layers[0]!.cellProperties?.[5]).toBeUndefined()

    const flipped = toggleMapAssetTileFlag(withProperties, 1, { x: 2, y: 1 }, FLIPPED_HORIZONTALLY_FLAG)
    const rotated = rotateMapAssetTileClockwise(flipped, 1, { x: 2, y: 1 })
    expect(rotated.layers[0]!.gids[6]).toBe((3 | FLIPPED_HORIZONTALLY_FLAG | 0x40000000 | FLIPPED_DIAGONALLY_FLAG) >>> 0)
  })

  it('adds, reorders, and refuses to delete the final layer', () => {
    const added = addMapAssetLayer(document(), 'Buildings')
    expect(added.layers.map((layer) => layer.name)).toEqual(['Back', 'Buildings'])
    const reordered = reorderMapAssetLayer(added, added.layers[1]!.id, -1)
    expect(reordered.layers.map((layer) => layer.name)).toEqual(['Buildings', 'Back'])
    const one = deleteMapAssetLayer(deleteMapAssetLayer(reordered, reordered.layers[0]!.id), reordered.layers[1]!.id)
    expect(one.layers).toHaveLength(1)
  })

  it('writes portable project-relative tileset image references', () => {
    expect(relativeMapAssetReference('assets/maps/interiors/Shop.tmx', 'assets/tilesheets/shop.png')).toBe('../../tilesheets/shop.png')
    expect(relativeMapAssetReference('assets/maps/Town.tmx', 'assets/maps/town.png')).toBe('town.png')
  })

  it('reports empty and case-insensitive duplicate layer names', () => {
    const source = addMapAssetLayer(addMapAssetLayer(document(), 'buildings'), ' ')
    source.layers[0]!.name = 'Buildings'
    expect(collectMapAssetLayerNameIssues(source)).toEqual([
      { kind: 'empty', id: source.layers[2]!.id },
      { kind: 'duplicate', name: 'Buildings' },
    ])
  })

  it('allows a tile layer and object group to share a name (xTile TileData convention)', () => {
    const source = document()
    source.objectGroups = [
      { id: 2, name: 'Back', kind: 'object', visible: true, opacity: 1, drawOrder: 'topdown', properties: {}, objects: [] },
    ]
    expect(collectMapAssetLayerNameIssues(source)).toEqual([])

    source.objectGroups.push({
      id: 3,
      name: 'back',
      kind: 'object',
      visible: true,
      opacity: 1,
      drawOrder: 'topdown',
      properties: {},
      objects: [],
    })
    expect(collectMapAssetLayerNameIssues(source)).toEqual([{ kind: 'duplicate', name: 'Back' }])
  })

  it('reports every lossy TBin capability before serialization', () => {
    const source = document()
    source.properties.Typed = { value: 1, tmxType: 'int' } as unknown as string
    source.layers[0]!.gids[0] = FLIPPED_HORIZONTALLY_FLAG | 1
    source.layers[0]!.opacity = 0.5
    source.layers[0]!.preservedXml = [{ xml: '<custom/>' }]
    source.tilesets = [
      {
        firstGid: 1,
        name: 'Sheet',
        tileWidth: 16,
        tileHeight: 16,
        tileCount: 4,
        columns: 2,
        margin: 1,
        imageSource: 'sheet.png',
        imagePath: null,
        imageWidth: 32,
        imageHeight: 32,
        properties: {},
        tileProperties: { 1: { Action: 'Test' } },
        animations: {},
      },
    ]
    source.objectGroups = [
      { id: 2, name: 'Objects', kind: 'object', visible: true, opacity: 1, drawOrder: 'topdown', properties: {}, objects: [] },
    ]

    expect(collectMapAssetTbinIssues(source)).toEqual([
      'objects',
      'transforms',
      'extensions',
      'tilesetLayout',
      'tileDefinitions',
      'layerPresentation',
      'typedProperties',
    ])
  })

  it('flags external TSX tileset sources as lossy for TBin serialization', () => {
    const source = document()
    source.tilesets = [
      {
        firstGid: 1,
        name: 'Sheet',
        tileWidth: 16,
        tileHeight: 16,
        tileCount: 4,
        columns: 2,
        source: 'tilesets/Sheet.tsx',
        imageSource: 'sheet.png',
        imagePath: null,
        imageWidth: 32,
        imageHeight: 32,
        properties: {},
        tileProperties: {},
        animations: {},
      },
    ]

    expect(collectMapAssetTbinIssues(source)).toEqual(['externalTilesets'])
  })
})
