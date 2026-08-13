import { describe, expect, it } from 'vite-plus/test'
import { writeCellPropertyObjects } from '@entities/map/lib/cellOverlayObjects'
import { setMapAssetCellOverlay } from '@pages/workbench/workspaces/map/model/mapAssetReducer'
import type { MapDocument, MapLayer, MapObject, MapObjectGroup, MapPropertyValue, MapTileset } from '@entities/map'

const BLOCK: Record<string, MapPropertyValue> = { Passable: 'T' }
const WATER: Record<string, MapPropertyValue> = { Water: 'T' }

/**
 * 4×3 map (12 cells), 16px tiles. Layer "Back" named like the TileData group.
 * Cell indices: row 0 = 0..3, row 1 = 4..7, row 2 = 8..11.
 */
function overlayDocument(
  layer: MapLayer,
  tilesets: MapTileset[],
  objectGroups: MapObjectGroup[],
  format: 'tmx' | 'tbin' = 'tmx',
): MapDocument {
  return {
    name: 'OverlayMap',
    format,
    sourcePath: `OverlayMap.${format}`,
    relativePath: `assets/maps/OverlayMap.${format}`,
    width: 4,
    height: 3,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    properties: {},
    tilesets,
    layers: [layer],
    objectGroups,
  }
}

function overlayLayer(gids: readonly number[], id = 1, name = 'Back'): MapLayer {
  return {
    id,
    name,
    kind: 'tile',
    width: 4,
    height: 3,
    visible: true,
    opacity: 1,
    offsetX: 0,
    offsetY: 0,
    properties: {},
    gids: Uint32Array.from(gids),
    nonEmptyTiles: gids.filter((gid) => gid !== 0).length,
  }
}

function fullLayer(id = 1, name = 'Back'): MapLayer {
  return overlayLayer([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], id, name)
}

function overlayTileset(tileProperties: Record<number, Record<string, MapPropertyValue>>, firstGid = 1): MapTileset {
  return {
    firstGid,
    name: 'Sheet',
    tileWidth: 16,
    tileHeight: 16,
    tileCount: 256,
    columns: 32,
    source: null,
    imageSource: 'Sheet.png',
    imagePath: 'assets/maps/tilesheets/Sheet.png',
    imageWidth: 512,
    imageHeight: 512,
    imageTrans: null,
    properties: {},
    tileProperties,
    animations: {},
  }
}

function tileDataGroup(objects: MapObject[], id = 1, name = 'Back'): MapObjectGroup {
  return { id, name, kind: 'object', visible: true, opacity: 1, drawOrder: 'topdown', properties: {}, objects }
}

function tileDataObject(
  properties: Record<string, MapPropertyValue>,
  x: number,
  y: number,
  width = 16,
  height = 16,
  id = 1,
  name = 'TileData',
): MapObject {
  return { id, name, type: '', x, y, width, height, rotation: 0, visible: true, properties }
}

describe('cell overlay TileData objects', () => {
  it('dispatches TMX paints to TileData objects, creating the layer-named group', () => {
    const source = overlayDocument(fullLayer(), [], [])
    const { document: painted, skippedTilesetDerived } = setMapAssetCellOverlay(
      source,
      1,
      [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ],
      'block',
    )

    expect(skippedTilesetDerived).toBe(0)
    expect(painted.layers[0]!.cellProperties).toBeUndefined()
    expect(painted.objectGroups).toEqual([
      {
        id: 2,
        name: 'Back',
        kind: 'object',
        visible: true,
        opacity: 1,
        drawOrder: 'topdown',
        properties: {},
        objects: [
          {
            id: 1,
            name: 'TileData',
            type: '',
            x: 16,
            y: 16,
            width: 16,
            height: 16,
            rotation: 0,
            visible: true,
            shape: 'rectangle',
            properties: BLOCK,
          },
          {
            id: 2,
            name: 'TileData',
            type: '',
            x: 32,
            y: 16,
            width: 16,
            height: 16,
            rotation: 0,
            visible: true,
            shape: 'rectangle',
            properties: BLOCK,
          },
        ],
      },
    ])
    // Immutable: the source document keeps its empty group list.
    expect(source.objectGroups).toEqual([])
  })

  it('reuses the existing rule object keeping custom keys; walkable deletes it once empty', () => {
    const existing = tileDataObject({ Passable: 'T', Action: 'Door' }, 16, 16)
    const source = overlayDocument(fullLayer(), [], [tileDataGroup([existing])])

    const { document: watered } = setMapAssetCellOverlay(source, 1, [{ x: 1, y: 1 }], 'water')
    expect(watered.objectGroups[0]!.objects).toEqual([{ ...existing, properties: { Passable: 'T', Action: 'Door', Water: 'T' } }])

    const { document: kept } = setMapAssetCellOverlay(watered, 1, [{ x: 1, y: 1 }], 'walkable')
    expect(kept.objectGroups[0]!.objects).toEqual([{ ...existing, properties: { Action: 'Door' } }])

    const pure = tileDataObject(BLOCK, 16, 16)
    const { document: removed } = setMapAssetCellOverlay(
      overlayDocument(fullLayer(), [], [tileDataGroup([pure])]),
      1,
      [{ x: 1, y: 1 }],
      'walkable',
    )
    expect(removed.objectGroups[0]!.objects).toEqual([])
  })

  it('paints past light markers without touching them, creating a separate rule object', () => {
    const marker = tileDataObject({ MFMarker: 'light' }, 16, 16)
    const source = overlayDocument(fullLayer(), [], [tileDataGroup([marker])])
    const { document: painted } = setMapAssetCellOverlay(source, 1, [{ x: 1, y: 1 }], 'block')

    expect(painted.objectGroups[0]!.objects).toEqual([
      marker,
      {
        id: 2,
        name: 'TileData',
        type: '',
        x: 16,
        y: 16,
        width: 16,
        height: 16,
        rotation: 0,
        visible: true,
        shape: 'rectangle',
        properties: BLOCK,
      },
    ])
  })

  it('skips empty tiles (gid 0) which cannot carry instance rules', () => {
    const source = overlayDocument(overlayLayer([0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]), [], [])
    const { document: painted, stats } = writeCellPropertyObjects(
      source,
      1,
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: -1, y: 0 },
        { x: 4, y: 0 },
        { x: 1.5, y: 1 },
      ],
      (current) => ({ ...current, Passable: 'T' }),
    )

    expect(stats).toEqual({ created: 2, reused: 0, removed: 0, skippedEmpty: 1 })
    expect(painted.objectGroups[0]!.objects.map((object) => object.x)).toEqual([16, 32])
  })

  it('skips walkable erases on cells whose rule comes from the tileset definition', () => {
    const tileset = overlayTileset({ 0: WATER }) // gid 1 → water at the definition level
    const source = overlayDocument(fullLayer(), [tileset], [])
    const { document: painted, skippedTilesetDerived } = setMapAssetCellOverlay(
      source,
      1,
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      'walkable',
    )

    expect(skippedTilesetDerived).toBe(2)
    expect(painted.objectGroups).toEqual([])
    // Nothing was erased, so the stroke stays a no-op for the history stack.
    expect(painted).toBe(source)
  })

  it('erases instance rules and skips only the tileset-derived cells in one stroke', () => {
    const existing = tileDataObject(BLOCK, 16, 16) // cell (1,1)
    const tileset = overlayTileset({ 0: WATER })
    const source = overlayDocument(fullLayer(), [tileset], [tileDataGroup([existing])])
    const { document: painted, skippedTilesetDerived } = setMapAssetCellOverlay(
      source,
      1,
      [
        { x: 0, y: 0 }, // tileset-derived water, no instance object → skipped
        { x: 1, y: 1 }, // instance block → erased
      ],
      'walkable',
    )

    expect(skippedTilesetDerived).toBe(1)
    expect(painted.objectGroups[0]!.objects).toEqual([])
  })

  it('lets non-walkable rules override tileset definitions without skipping', () => {
    const tileset = overlayTileset({ 0: WATER })
    const source = overlayDocument(fullLayer(), [tileset], [])
    const { document: painted, skippedTilesetDerived } = setMapAssetCellOverlay(source, 1, [{ x: 0, y: 0 }], 'block')

    expect(skippedTilesetDerived).toBe(0)
    expect(painted.objectGroups[0]!.objects).toHaveLength(1)
    expect(painted.objectGroups[0]!.objects[0]!.properties).toEqual(BLOCK)
  })

  it('advances nextObjectId above every existing object id', () => {
    const existing = tileDataObject(BLOCK, 16, 16, 16, 16, 7) // id 7
    const source = { ...overlayDocument(fullLayer(), [], [tileDataGroup([existing], 3)]), nextLayerId: 4, nextObjectId: 8 }
    const { document: painted } = setMapAssetCellOverlay(source, 1, [{ x: 2, y: 1 }], 'block')

    expect(painted.nextObjectId).toBe(9)
    expect(painted.objectGroups[0]!.objects.map((object) => object.id)).toEqual([7, 8])
  })

  it('assigns the layer-named group an id above every layer and group id', () => {
    const source = overlayDocument(fullLayer(5, 'Back'), [], [tileDataGroup([], 3, 'Other')])
    const { document: painted } = setMapAssetCellOverlay(source, 5, [{ x: 0, y: 0 }], 'block')

    const group = painted.objectGroups.find((candidate) => candidate.name === 'Back')
    expect(group?.id).toBe(6) // max(1, 5 + 1, 3 + 1)
    expect(painted.nextLayerId).toBe(7)
  })

  it('keeps non-TMX formats writing cellProperties (tbin regression)', () => {
    const source = overlayDocument(fullLayer(), [], [], 'tbin')
    const { document: painted, skippedTilesetDerived } = setMapAssetCellOverlay(source, 1, [{ x: 1, y: 1 }], 'block')

    expect(skippedTilesetDerived).toBe(0)
    expect(painted.layers[0]!.cellProperties?.[5]).toEqual(BLOCK)
    expect(painted.objectGroups).toEqual([])
  })

  it('writes arbitrary property keys through writeCellPropertyObjects (e.g. TouchAction)', () => {
    const source = overlayDocument(fullLayer(), [], [])
    const { document: painted, stats } = writeCellPropertyObjects(source, 1, [{ x: 1, y: 1 }], (current) => ({
      ...current,
      TouchAction: 'Door',
    }))

    expect(stats).toEqual({ created: 1, reused: 0, removed: 0, skippedEmpty: 0 })
    expect(painted.objectGroups[0]!.objects[0]!.properties).toEqual({ TouchAction: 'Door' })
  })

  it('leaves the document untouched when a walkable stroke changes nothing', () => {
    const source = overlayDocument(fullLayer(), [], [])
    const { document: painted, skippedTilesetDerived } = setMapAssetCellOverlay(source, 1, [{ x: 1, y: 1 }], 'walkable')

    expect(skippedTilesetDerived).toBe(0)
    expect(painted).toBe(source)
  })
})
