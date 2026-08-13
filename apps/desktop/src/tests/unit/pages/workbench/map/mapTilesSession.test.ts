import { describe, expect, it } from 'vite-plus/test'

import { FLIPPED_HORIZONTALLY_FLAG, type MapDocument, type MapLayer, type MapTileset } from '@entities/map'
import { compactMapTileEdits, type MapTileEditDraft } from '@pages/workbench/workspaces/map/model/mapPatchReducer'
import {
  applyMapTilesToDocument,
  canEditPatchTiles,
  diffMapDocumentToMapTiles,
  readCardMapTiles,
  withCardMapTiles,
} from '@pages/workbench/workspaces/map/model/mapTilesSession'

function tileset(name: string, firstGid: number, tileCount: number): MapTileset {
  return {
    firstGid,
    name,
    tileWidth: 16,
    tileHeight: 16,
    tileCount,
    columns: 8,
    imageSource: null,
    imagePath: null,
    imageWidth: null,
    imageHeight: null,
    properties: {},
    tileProperties: {},
    animations: {},
  }
}

function tileLayer(
  name: string,
  width: number,
  height: number,
  gids: readonly number[],
  cellProperties?: MapLayer['cellProperties'],
): MapLayer {
  return {
    id: 0,
    name,
    kind: 'tile',
    width,
    height,
    visible: true,
    opacity: 1,
    offsetX: 0,
    offsetY: 0,
    properties: {},
    gids: new Uint32Array(gids),
    nonEmptyTiles: 0,
    cellProperties,
  }
}

/**
 * 4x3 map with tilesets spring_outdoors (firstGid 1, gids 1-8) and z_extra
 * (firstGid 100, gids 100-115). Back has tiles at (1,0) and (1,1) plus a cell
 * property at (2,2); Front has a tile at (0,0) plus properties at (0,2).
 */
function baseDocument(): MapDocument {
  return {
    name: 'Town',
    format: 'tmx',
    sourcePath: 'Maps/Town.tmx',
    relativePath: 'Maps/Town.tmx',
    width: 4,
    height: 3,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    properties: {},
    tilesets: [tileset('spring_outdoors', 1, 8), tileset('z_extra', 100, 16)],
    layers: [
      tileLayer('Back', 4, 3, [0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0], { 10: { Label: 'base' } }),
      tileLayer('Front', 4, 3, [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { 8: { Action: 'Open', Keep: 'yes' } }),
    ],
    objectGroups: [],
  }
}

describe('map tile session round-trip', () => {
  it('converts edits to a document and back to the same compact edits', () => {
    const base = baseDocument()
    const edits: MapTileEditDraft[] = [
      { layer: 'Back', x: 0, y: 0, setTilesheet: 'spring_outdoors', setIndex: 3 },
      { layer: 'Back', x: 1, y: 1, remove: true },
      { layer: 'Back', x: 2, y: 2, setProperties: { Label: 'edited' } },
      { layer: 'Front', x: 2, y: 0, setTilesheet: 'z_extra', setIndex: 7, setProperties: { Action: 'Open' } },
      { layer: 'Front', x: 0, y: 2, setProperties: {} },
    ]
    const applied = applyMapTilesToDocument(base, edits)
    expect(applied.skippedCount).toBe(0)
    expect(applied.document.layers[0]!.gids[0]).toBe(4)
    expect(applied.document.layers[0]!.gids[5]).toBe(0)
    expect(applied.document.layers[0]!.cellProperties?.[10]).toEqual({ Label: 'edited' })
    expect(applied.document.layers[1]!.gids[2]).toBe(107)
    expect(applied.document.layers[1]!.cellProperties?.[8]).toBeUndefined()
    expect(diffMapDocumentToMapTiles(base, applied.document)).toEqual(compactMapTileEdits(edits))
  })

  it('recounts nonEmptyTiles for touched layers', () => {
    const applied = applyMapTilesToDocument(baseDocument(), [
      { layer: 'Back', x: 0, y: 0, setTilesheet: 'spring_outdoors', setIndex: 3 },
      { layer: 'Back', x: 1, y: 1, remove: true },
      { layer: 'Front', x: 2, y: 0, setTilesheet: 'z_extra', setIndex: 7 },
    ])
    expect(applied.document.layers[0]!.nonEmptyTiles).toBe(2)
    expect(applied.document.layers[1]!.nonEmptyTiles).toBe(2)
  })

  it('keeps gids as Uint32Array and leaves the base document untouched', () => {
    const base = baseDocument()
    const before = base.layers.map((layer) => Array.from(layer.gids))
    const applied = applyMapTilesToDocument(base, [
      { layer: 'Back', x: 0, y: 0, setTilesheet: 'spring_outdoors', setIndex: 1 },
      { layer: 'Front', x: 0, y: 0, remove: true },
    ])
    expect(applied.document.layers.every((layer) => layer.gids instanceof Uint32Array)).toBe(true)
    expect(applied.document.layers.map((layer) => Array.from(layer.gids))).not.toEqual(before)
    expect(base.layers.map((layer) => Array.from(layer.gids))).toEqual(before)
    expect(applied.document.layers[0]).not.toBe(base.layers[0])
    expect(applied.document.layers[0]!.gids).not.toBe(base.layers[0]!.gids)
    expect(applied.document.layers[0]!.cellProperties).not.toBe(base.layers[0]!.cellProperties)
  })
})

describe('map tile session apply', () => {
  it('applies a tile set as firstGid + index', () => {
    const applied = applyMapTilesToDocument(baseDocument(), [{ layer: 'Back', x: 3, y: 2, setTilesheet: 'z_extra', setIndex: 12 }])
    expect(applied.skippedCount).toBe(0)
    expect(applied.document.layers[0]!.gids[11]).toBe(112)
  })

  it('applies a remove as a zeroed gid', () => {
    const applied = applyMapTilesToDocument(baseDocument(), [{ layer: 'Front', x: 0, y: 0, remove: true }])
    expect(applied.skippedCount).toBe(0)
    expect(applied.document.layers[1]!.gids[0]).toBe(0)
  })

  it('applies setProperties at the cell and clears with an empty object', () => {
    const base = baseDocument()
    const written = applyMapTilesToDocument(base, [
      { layer: 'Back', x: 2, y: 2, setProperties: { Label: 'edited', Hidden: { value: 'true', tmxType: 'bool' } } },
    ])
    expect(written.skippedCount).toBe(0)
    expect(written.document.layers[0]!.cellProperties?.[10]).toEqual({ Label: 'edited', Hidden: { value: 'true', tmxType: 'bool' } })
    const cleared = applyMapTilesToDocument(base, [{ layer: 'Back', x: 2, y: 2, setProperties: {} }])
    expect(cleared.document.layers[0]!.cellProperties?.[10]).toBeUndefined()
  })

  it('combines remove and setIndex with setProperties on the same cell', () => {
    const applied = applyMapTilesToDocument(baseDocument(), [
      { layer: 'Front', x: 0, y: 0, remove: true, setTilesheet: 'spring_outdoors', setIndex: 4, setProperties: { Label: 'x' } },
    ])
    expect(applied.skippedCount).toBe(0)
    expect(applied.document.layers[1]!.gids[0]).toBe(5)
    expect(applied.document.layers[1]!.cellProperties?.[0]).toEqual({ Label: 'x' })
  })

  it('counts edits skipped for unknown layers, tilesets, and invalid indices', () => {
    const result = applyMapTilesToDocument(baseDocument(), [
      { layer: 'Missing', x: 0, y: 0, setTilesheet: 'spring_outdoors', setIndex: 1 },
      { layer: 'Back', x: 1, y: 0, setTilesheet: 'nope', setIndex: 1 },
      { layer: 'Back', x: 2, y: 0, setTilesheet: 'spring_outdoors', setIndex: 99 },
      { layer: 'Back', x: 3, y: 0, setTilesheet: 'spring_outdoors', setIndex: -2 },
      { layer: 'Back', x: 0, y: 1, setTilesheet: 'spring_outdoors', setIndex: '{{Index}}' },
      { layer: 'Back', x: 99, y: 99, remove: true },
    ])
    expect(result.skippedCount).toBe(6)
    expect(result.document.layers[0]!.gids[0]).toBe(0)
    expect(result.document.layers[0]!.gids[1]).toBe(1)
    expect(result.document.layers[0]!.gids[2]).toBe(0)
    expect(result.document.layers[0]!.gids[3]).toBe(0)
    expect(result.document.layers[0]!.gids[4]).toBe(0)
  })
})

describe('map tile session diff', () => {
  it('emits an empty setProperties when current clears a base cell property', () => {
    const base = baseDocument()
    const current: MapDocument = {
      ...base,
      layers: base.layers.map((layer, index) => (index === 1 ? { ...layer, cellProperties: undefined } : layer)),
    }
    expect(diffMapDocumentToMapTiles(base, current)).toEqual([{ layer: 'Front', x: 0, y: 2, setProperties: {} }])
  })

  it('normalizes a current-only flip flag back to the bare tile', () => {
    const base = baseDocument()
    const current = applyMapTilesToDocument(base, []).document
    const back = current.layers[0]!
    back.gids[4] = (1 | FLIPPED_HORIZONTALLY_FLAG) >>> 0
    expect(diffMapDocumentToMapTiles(base, current)).toEqual([{ layer: 'Back', x: 0, y: 1, setTilesheet: 'spring_outdoors', setIndex: 0 }])
  })

  it('treats a flipped new tile as its bare tileset reference', () => {
    const base = baseDocument()
    const current = applyMapTilesToDocument(base, []).document
    const back = current.layers[0]!
    back.gids[3] = (5 | FLIPPED_HORIZONTALLY_FLAG) >>> 0
    expect(diffMapDocumentToMapTiles(base, current)).toEqual([{ layer: 'Back', x: 3, y: 0, setTilesheet: 'spring_outdoors', setIndex: 4 }])
  })

  it('ignores base layers absent from the current document', () => {
    const base = baseDocument()
    const current: MapDocument = { ...base, layers: [base.layers[1]!] }
    expect(diffMapDocumentToMapTiles(base, current)).toEqual([])
  })

  it('returns no edits for an identical document', () => {
    const base = baseDocument()
    expect(diffMapDocumentToMapTiles(base, applyMapTilesToDocument(base, []).document)).toEqual([])
  })
})

describe('map tile session card write', () => {
  type ChangeCard = { id: string; type: string; mapTiles: unknown[]; fromArea?: unknown }
  type ChangeCardState = { changes: ChangeCard[]; patchMode?: string }

  it('replaces the matching tiles card while keeping every other field and card', () => {
    const state: ChangeCardState = {
      changes: [
        { id: 'c-file', type: 'file', mapTiles: [], fromArea: { x: 1 } },
        { id: 'c-tiles', type: 'tiles', mapTiles: [{ layer: 'Back', x: 0, y: 0, setIndex: 1 }] },
        { id: 'c-tiles2', type: 'tiles', mapTiles: [] },
      ],
      patchMode: 'ReplaceByLayer',
    }
    const edits: MapTileEditDraft[] = [{ layer: 'Front', x: 1, y: 2, setTilesheet: 'z_extra', setIndex: 3 }]
    const result = withCardMapTiles(state, 'c-tiles', edits) as ChangeCardState
    expect(result).not.toBe(state)
    expect(result.changes[0]).toBe(state.changes[0])
    expect(result.changes[2]).toBe(state.changes[2])
    expect(result.changes[1]!.id).toBe('c-tiles')
    expect(result.changes[1]!.type).toBe('tiles')
    expect(result.changes[1]!.mapTiles).toEqual(edits)
    expect(result.changes[1]!.mapTiles).not.toBe(edits)
    expect(result.patchMode).toBe('ReplaceByLayer')
  })

  it('returns the state unchanged when no tiles card matches', () => {
    const state: ChangeCardState = { changes: [{ id: 'x', type: 'tiles', mapTiles: [] }] }
    expect(withCardMapTiles(state, 'missing', [])).toBe(state)
    expect(withCardMapTiles(state, 'x', [{ layer: 'Back', x: 0, y: 0, remove: true }])).not.toBe(state)
  })

  it('ignores non-tiles cards even when the id matches', () => {
    const state: ChangeCardState = {
      changes: [
        { id: 'shared', type: 'file', mapTiles: ['stale'] },
        { id: 'shared', type: 'tiles', mapTiles: [] },
      ],
    }
    const result = withCardMapTiles(state, 'shared', []) as ChangeCardState
    expect(result.changes[0]).toBe(state.changes[0])
    expect(result.changes[1]).not.toBe(state.changes[1])
  })

  it('passes through non-state inputs and states without changes', () => {
    expect(withCardMapTiles(null, 'c', [])).toBeNull()
    expect(withCardMapTiles('str', 'c', [])).toBe('str')
    expect(withCardMapTiles([], 'c', [])).toEqual([])
    const empty = {}
    expect(withCardMapTiles(empty, 'c', [])).toBe(empty)
  })
})

describe('map tile session card read', () => {
  it('returns the staged mapTiles of the matching tiles card', () => {
    const edits: MapTileEditDraft[] = [{ layer: 'Back', x: 1, y: 2, setTilesheet: 'z_extra', setIndex: 3 }]
    const state = { changes: [{ id: 'c-tiles', type: 'tiles', mapTiles: edits }] }
    expect(readCardMapTiles(state, 'c-tiles')).toEqual(edits)
  })

  it('returns an empty array when the card has no mapTiles field or the state has no changes', () => {
    expect(readCardMapTiles({ changes: [{ id: 'c-tiles', type: 'tiles' }] }, 'c-tiles')).toEqual([])
    expect(readCardMapTiles({ changes: [] }, 'c-tiles')).toEqual([])
    expect(readCardMapTiles({}, 'c-tiles')).toEqual([])
    expect(readCardMapTiles(null, 'c-tiles')).toEqual([])
    expect(readCardMapTiles('str', 'c-tiles')).toEqual([])
  })

  it('ignores non-tiles cards and cards with a different id', () => {
    const state = {
      changes: [
        { id: 'shared', type: 'file', mapTiles: [{ layer: 'Back', x: 0, y: 0, remove: true }] },
        { id: 'shared', type: 'tiles', mapTiles: [{ layer: 'Front', x: 0, y: 0, remove: true }] },
      ],
    }
    expect(readCardMapTiles(state, 'missing')).toEqual([])
    expect(readCardMapTiles(state, 'shared')).toEqual([{ layer: 'Front', x: 0, y: 0, remove: true }])
  })
})

describe('map tile session entry point', () => {
  it('requires a configured game root and a token-free target', () => {
    expect(canEditPatchTiles('Maps/Town', 'E:/Game')).toBe(true)
    expect(canEditPatchTiles('Maps/Town', null)).toBe(false)
    expect(canEditPatchTiles('Maps/Town', '')).toBe(false)
    expect(canEditPatchTiles('Maps/{{Region}}', 'E:/Game')).toBe(false)
    expect(canEditPatchTiles('Maps/{{Region}}', null)).toBe(false)
  })
})
