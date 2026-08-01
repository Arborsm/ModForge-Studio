import { describe, expect, it } from 'vite-plus/test'
import type { MapDocument } from '@entities/map'
import {
  applyMapAreaPreview,
  applyMapTilePreview,
  compactMapTileEdits,
  rectangleTilePoints,
  setMapTileProperties,
  splitMapTargets,
  upsertMapWarp,
} from '@pages/workbench/workspaces/map/model/mapPatchReducer'

describe('map patch reducer', () => {
  it('creates inclusive rectangle points in stable row-major order', () => {
    expect(rectangleTilePoints(3, 4, 2, 2)).toEqual([
      { x: 3, y: 4 },
      { x: 4, y: 4 },
      { x: 3, y: 5 },
      { x: 4, y: 5 },
    ])
  })

  it('updates instance properties without losing tile fields', () => {
    expect(
      setMapTileProperties(
        [{ layer: 'Back', x: 1, y: 0, setTilesheet: 'sheet', setIndex: 4, _raw: { Extra: true } }],
        'Back',
        { x: 1, y: 0 },
        { TouchAction: 'Warp 1 2' },
      ),
    ).toEqual([
      {
        layer: 'Back',
        x: 1,
        y: 0,
        setTilesheet: 'sheet',
        setIndex: 4,
        setProperties: { TouchAction: 'Warp 1 2' },
        _raw: { Extra: true },
      },
    ])
  })

  it('compacts later CP edits and gives the latest warp source priority', () => {
    expect(
      compactMapTileEdits([
        { layer: 'Back', x: 0, y: 0, setIndex: 1 },
        { layer: 'Back', x: 0, y: 0, remove: true },
      ]),
    ).toEqual([{ layer: 'Back', x: 0, y: 0, remove: true }])
    expect(
      upsertMapWarp([{ fromX: 1, fromY: 2, toMap: 'Town', toX: 3, toY: 4 }], { fromX: 1, fromY: 2, toMap: 'Farm', toX: 5, toY: 6 }),
    ).toEqual([{ fromX: 1, fromY: 2, toMap: 'Farm', toX: 5, toY: 6 }])
  })

  it('splits multi-target previews without corrupting token expressions', () => {
    expect(splitMapTargets('Maps/Town, Maps/Forest')).toEqual(['Maps/Town', 'Maps/Forest'])
    expect(splitMapTargets('Maps/{{Target: A, B}}, Maps/Farm')).toEqual(['Maps/{{Target: A, B}}', 'Maps/Farm'])
  })

  it('builds a result document for resolvable MapTiles while preserving transform flags', () => {
    const originalGids = new Uint32Array([0x80000002, 3])
    const document = {
      width: 2,
      height: 1,
      tilesets: [{ name: 'sheet', firstGid: 1, tileCount: 8 }],
      layers: [{ name: 'Back', width: 2, height: 1, gids: originalGids }],
    } as unknown as MapDocument
    const result = applyMapTilePreview(document, [
      { layer: 'Back', x: 0, y: 0, setTilesheet: 'sheet', setIndex: 4 },
      { layer: 'Back', x: 1, y: 0, remove: true },
      { layer: 'Back', x: '{{X}}', y: 0, setIndex: 7 },
    ])
    expect(Array.from(result.layers[0]!.gids)).toEqual([0x80000005, 0])
    expect(Array.from(document.layers[0]!.gids)).toEqual([0x80000002, 3])
  })

  it('applies CP area patch modes, remaps tilesets, and creates source-only layers', () => {
    const target = {
      width: 2,
      height: 1,
      tilesets: [{ name: 'sheet', firstGid: 1, tileCount: 10, imageSource: 'target.png' }],
      layers: [
        { id: 1, name: 'Back', width: 2, height: 1, properties: { Old: true }, gids: new Uint32Array([1, 2]), nonEmptyTiles: 2 },
        { id: 2, name: 'Buildings', width: 2, height: 1, properties: {}, gids: new Uint32Array([3, 4]), nonEmptyTiles: 2 },
      ],
    } as unknown as MapDocument
    const source = {
      width: 2,
      height: 1,
      tilesets: [{ name: 'sheet', firstGid: 1, tileCount: 4, imageSource: './source.png' }],
      layers: [
        {
          id: 10,
          name: 'Back',
          width: 2,
          height: 1,
          properties: { Outdoors: true },
          gids: new Uint32Array([0x80000002, 0]),
          nonEmptyTiles: 1,
          cellProperties: { 0: { Action: 'TouchAction' } },
        },
        { id: 11, name: 'Paths', width: 2, height: 1, properties: {}, gids: new Uint32Array([1, 0]), nonEmptyTiles: 1 },
      ],
    } as unknown as MapDocument

    const overlay = applyMapAreaPreview(target, source, null, { x: 1, y: 0, width: 2, height: 1 }, 'Overlay')
    expect(overlay.width).toBe(3)
    expect(overlay.tilesets.map((tileset) => [tileset.name, tileset.firstGid])).toEqual([
      ['sheet', 1],
      ['z_sheet', 11],
    ])
    expect(Array.from(overlay.layers[0]!.gids)).toEqual([1, 0x8000000c, 0])
    expect(overlay.layers[0]!.properties).toEqual({ Outdoors: true })
    expect((overlay.layers[0] as unknown as { cellProperties: Record<string, unknown> }).cellProperties['1']).toEqual({
      Action: 'TouchAction',
    })
    expect(Array.from(overlay.layers[1]!.gids)).toEqual([3, 4, 0])
    expect(overlay.layers[2]!.name).toBe('Paths')
    expect(Array.from(overlay.layers[2]!.gids)).toEqual([0, 11, 0])

    const replace = applyMapAreaPreview(target, source, null, { x: 1, y: 0, width: 2, height: 1 }, 'Replace')
    expect(Array.from(replace.layers[1]!.gids)).toEqual([3, 0, 0])
    expect(Array.from(target.layers[1]!.gids)).toEqual([3, 4])
  })
})
