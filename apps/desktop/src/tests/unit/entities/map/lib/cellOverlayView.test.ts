import { describe, expect, it } from 'vite-plus/test'
import { deriveCellOverlayView } from '@entities/map/lib/cellOverlayView'
import type { MapDocument, MapLayer, MapObject, MapObjectGroup, MapPropertyValue, MapTileset } from '@entities/map'

const WATER: Record<string, MapPropertyValue> = { Water: 'T' }
const BLOCK: Record<string, MapPropertyValue> = { Passable: 'T' }
const DIG: Record<string, MapPropertyValue> = { Diggable: 'T' }

/**
 * 4×3 map (12 cells), 16px tiles. Layer "Back" named like the TileData group.
 * Cell indices: row 0 = 0..3, row 1 = 4..7, row 2 = 8..11.
 */
function overlayDocument(layer: MapLayer, tilesets: MapTileset[], objectGroups: MapObjectGroup[]): MapDocument {
  return {
    name: 'OverlayMap',
    format: 'tmx',
    sourcePath: 'OverlayMap.tmx',
    relativePath: 'assets/maps/OverlayMap.tmx',
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

function overlayLayer(gids: readonly number[], cellProperties: Record<number, Record<string, MapPropertyValue>> = {}): MapLayer {
  return {
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
    gids: Uint32Array.from(gids),
    nonEmptyTiles: gids.filter((gid) => gid !== 0).length,
    cellProperties,
  }
}

function overlayTileset(tileProperties: Record<number, Record<string, MapPropertyValue>>, firstGid = 1): MapTileset {
  return {
    firstGid,
    name: 'OutdoorsTilesheet',
    tileWidth: 16,
    tileHeight: 16,
    tileCount: 256,
    columns: 32,
    source: null,
    imageSource: 'OutdoorsTilesheet.png',
    imagePath: 'assets/maps/tilesheets/OutdoorsTilesheet.png',
    imageWidth: 512,
    imageHeight: 512,
    imageTrans: null,
    properties: {},
    tileProperties,
    animations: {},
  }
}

function tileDataGroup(objects: MapObject[], name = 'Back'): MapObjectGroup {
  return { id: 1, name, kind: 'object', visible: true, opacity: 1, drawOrder: 'topdown', properties: {}, objects }
}

function tileDataObject(
  properties: Record<string, MapPropertyValue>,
  x: number,
  y: number,
  width: number,
  height: number,
  name = 'TileData',
): MapObject {
  return { id: 1, name, type: '', x, y, width, height, rotation: 0, properties }
}

describe('deriveCellOverlayView', () => {
  it('merges the three sources with instance-first precedence (first write wins)', () => {
    // Tileset definition (gid 1 → diggable) fills every placed cell; cell 6's
    // TileData instance rule (block) beats it; cell 5's cellProperties (water)
    // beats both the TileData rule and the tileset definition.
    const tileset = overlayTileset({ 0: DIG })
    const layer = overlayLayer([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], { 5: WATER })
    const objectGroups = [tileDataGroup([tileDataObject(BLOCK, 16, 16, 32, 16)])] // cells (1,1)=5 and (2,1)=6
    const cells = deriveCellOverlayView(overlayDocument(layer, [tileset], objectGroups), layer)

    expect(cells[5]).toEqual({ rule: 'water', tilesetDerived: false })
    expect(cells[6]).toEqual({ rule: 'block', tilesetDerived: false })
    expect(cells[0]).toEqual({ rule: 'dig', tilesetDerived: true })
    expect(Object.keys(cells).length).toBe(12)
  })

  it('ignores TileData objects whose group name does not match the layer name', () => {
    const layer = overlayLayer([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
    const objectGroups = [tileDataGroup([tileDataObject(BLOCK, 16, 16, 16, 16)], 'OtherGroup')]
    const cells = deriveCellOverlayView(overlayDocument(layer, [overlayTileset({})], objectGroups), layer)

    expect(cells).toEqual({})
  })

  it('does not produce cells where the TileData rect covers an empty tile (gid 0)', () => {
    // TileData spans cells (0,1)=4 and (1,1)=5; cell 5 has no tile placed.
    const layer = overlayLayer([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0])
    const objectGroups = [tileDataGroup([tileDataObject(BLOCK, 0, 16, 32, 16)])]
    const cells = deriveCellOverlayView(overlayDocument(layer, [overlayTileset({})], objectGroups), layer)

    expect(cells).toEqual({ 4: { rule: 'block', tilesetDerived: false } })
  })

  it('flags only tileset definition-level cells as tilesetDerived', () => {
    const tileset = overlayTileset({ 0: WATER })
    const layer = overlayLayer([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], { 5: DIG })
    const cells = deriveCellOverlayView(overlayDocument(layer, [tileset], []), layer)

    expect(cells[5]).toEqual({ rule: 'dig', tilesetDerived: false })
    expect(cells[0]).toEqual({ rule: 'water', tilesetDerived: true })
  })

  it('maps a multi-cell TileData rect onto every covered cell', () => {
    const layer = overlayLayer([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
    // 32×16 rect starting at (16, 16) covers cells (1,1)=5 and (2,1)=6.
    const objectGroups = [tileDataGroup([tileDataObject(WATER, 16, 16, 32, 16)])]
    const cells = deriveCellOverlayView(overlayDocument(layer, [overlayTileset({})], objectGroups), layer)

    expect(cells).toEqual({
      5: { rule: 'water', tilesetDerived: false },
      6: { rule: 'water', tilesetDerived: false },
    })
  })

  it('skips TileData objects without any overlay property key (e.g. light markers)', () => {
    const layer = overlayLayer([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
    const objectGroups = [tileDataGroup([tileDataObject({ MFMarker: 'light' }, 16, 16, 16, 16), tileDataObject({}, 0, 16, 16, 16)])]
    const cells = deriveCellOverlayView(overlayDocument(layer, [overlayTileset({})], objectGroups), layer)

    expect(cells).toEqual({})
  })

  it('strips flip flags from gids before resolving the tileset', () => {
    const tileset = overlayTileset({ 0: WATER })
    // 0x80000001 = FLIPPED_HORIZONTALLY | tile id 1 (gid 1 with flip bit).
    const layer = overlayLayer([0x80000001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const cells = deriveCellOverlayView(overlayDocument(layer, [tileset], []), layer)

    expect(cells).toEqual({ 0: { rule: 'water', tilesetDerived: true } })
  })
})
