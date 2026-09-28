import { describe, expect, it } from 'vite-plus/test'
import {
  buildWorldAtlas,
  collectCellActions,
  collectWarpEntries,
  formatActionWarp,
  formatTouchActionWarp,
  parseCellWarpAction,
  writeCellAction,
  type MapDocument,
  type MapLayer,
  type MapObject,
  type MapObjectGroup,
  type MapPropertyValue,
} from '@entities/map'
import { parsePortalTargetMapFromAction } from '@entities/map/lib/portalTargets'

/**
 * 4×3 map (12 cells), 16px tiles. Cell indices: row 0 = 0..3, row 1 = 4..7,
 * row 2 = 8..11, so (1, 1) = 5 and (1, 2) = 9.
 */
function actionDocument(layers: MapLayer[], objectGroups: MapObjectGroup[], format: 'tmx' | 'tbin' = 'tmx'): MapDocument {
  return {
    name: 'ActionMap',
    format,
    sourcePath: `ActionMap.${format}`,
    relativePath: `assets/maps/ActionMap.${format}`,
    width: 4,
    height: 3,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    properties: {},
    tilesets: [],
    layers,
    objectGroups,
  }
}

function actionLayer(
  gids: readonly number[],
  cellProperties: Record<number, Record<string, MapPropertyValue>> = {},
  name = 'Back',
  id = 1,
): MapLayer {
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
    cellProperties,
  }
}

function fullLayer(name = 'Back', cellProperties: Record<number, Record<string, MapPropertyValue>> = {}, id = 1): MapLayer {
  return actionLayer([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], cellProperties, name, id)
}

function tileDataGroup(objects: MapObject[], name: string): MapObjectGroup {
  return { id: 1, name, kind: 'object', visible: true, opacity: 1, drawOrder: 'topdown', properties: {}, objects }
}

function tileDataObject(properties: Record<string, MapPropertyValue>, x: number, y: number, width = 16, height = 16): MapObject {
  return { id: 1, name: 'TileData', type: '', x, y, width, height, rotation: 0, visible: true, properties }
}

describe('collectCellActions', () => {
  it('merges cellProperties and TileData objects, with cellProperties winning on the same cell and key', () => {
    const layer = fullLayer('Back', { 5: { TouchAction: 'Warp Farm 10 11' } })
    const objectGroups = [tileDataGroup([tileDataObject({ TouchAction: 'Warp Town 1 2' }, 16, 16)], 'Back')] // covers cell (1, 1) = 5
    const actions = collectCellActions(actionDocument([layer], objectGroups), 'Back', ['TouchAction'])

    expect(actions).toEqual([{ x: 1, y: 1, key: 'TouchAction', value: 'Warp Farm 10 11', source: 'cellProperties' }])
  })

  it('ignores TileData objects whose group name does not match the layer name', () => {
    const layer = fullLayer('Back')
    const objectGroups = [tileDataGroup([tileDataObject({ Action: 'Warp Town 1 2' }, 16, 16)], 'OtherGroup')]
    expect(collectCellActions(actionDocument([layer], objectGroups), 'Back', ['Action'])).toEqual([])
  })

  it('expands a multi-cell TileData rect onto every covered cell', () => {
    const layer = fullLayer('Back')
    // 32×16 rect starting at (16, 16) covers cells (1, 1) = 5 and (2, 1) = 6.
    const objectGroups = [tileDataGroup([tileDataObject({ TouchAction: 'Warp Farm 10 11' }, 16, 16, 32, 16)], 'Back')]
    const actions = collectCellActions(actionDocument([layer], objectGroups), 'Back', ['TouchAction'])

    expect(actions).toEqual([
      { x: 1, y: 1, key: 'TouchAction', value: 'Warp Farm 10 11', source: 'tileDataObject' },
      { x: 2, y: 1, key: 'TouchAction', value: 'Warp Farm 10 11', source: 'tileDataObject' },
    ])
  })

  it('does not apply TileData objects over empty tiles (no placed gid)', () => {
    const layer = actionLayer([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0], {}, 'Back') // only cell (1, 1) = 5 has a tile
    const objectGroups = [tileDataGroup([tileDataObject({ TouchAction: 'Warp Farm 10 11' }, 0, 16, 32, 16)], 'Back')] // cells (0, 1) and (1, 1)
    const actions = collectCellActions(actionDocument([layer], objectGroups), 'Back', ['TouchAction'])

    expect(actions).toEqual([{ x: 1, y: 1, key: 'TouchAction', value: 'Warp Farm 10 11', source: 'tileDataObject' }])
  })

  it('returns nothing for a missing layer', () => {
    expect(collectCellActions(actionDocument([fullLayer()], []), 'Missing', ['TouchAction'])).toEqual([])
  })

  it('collects several requested keys from the same cell', () => {
    const layer = fullLayer('Back', { 5: { TouchAction: 'Door', Action: 'Message "hi"' } })
    const actions = collectCellActions(actionDocument([layer], []), 'Back', ['TouchAction', 'Action'])

    expect(actions).toEqual([
      { x: 1, y: 1, key: 'TouchAction', value: 'Door', source: 'cellProperties' },
      { x: 1, y: 1, key: 'Action', value: 'Message "hi"', source: 'cellProperties' },
    ])
  })
})

describe('warp action serialization', () => {
  it('round-trips the Back-layer TouchAction form `Warp <map> <x> <y>`', () => {
    const value = formatTouchActionWarp('Farm', 10, 11)
    expect(value).toBe('Warp Farm 10 11')
    expect(parsePortalTargetMapFromAction(value)).toBe('Farm')
    expect(parseCellWarpAction(value)).toEqual({ toMap: 'Farm', toX: 10, toY: 11 })
  })

  it('round-trips the Buildings-layer Action form `Warp <x> <y> <map>`', () => {
    const value = formatActionWarp(10, 11, 'Farm')
    expect(value).toBe('Warp 10 11 Farm')
    expect(parsePortalTargetMapFromAction(value)).toBe('Farm')
    expect(parseCellWarpAction(value)).toEqual({ toMap: 'Farm', toX: 10, toY: 11 })
  })

  it('rejects non-warp and malformed actions', () => {
    expect(parseCellWarpAction('Door')).toBeNull()
    expect(parseCellWarpAction('Warp Farm 10')).toBeNull()
    expect(parseCellWarpAction('Warp 10 Farm')).toBeNull()
    expect(parseCellWarpAction('Warp 10 Farm 20')).toBeNull() // ambiguous first token, not a valid pair
  })
})

describe('collectWarpEntries', () => {
  it('collects property, touch and action entries with their carriers', () => {
    const back = fullLayer('Back', { 9: { TouchAction: 'Warp Forest 10 20' } }, 1) // cell (1, 2)
    const buildings = fullLayer('Buildings', {}, 2)
    const objectGroups = [tileDataGroup([tileDataObject({ Action: 'Warp 3 4 Mine' }, 0, 16)], 'Buildings')] // cell (0, 1)
    const document = {
      ...actionDocument([back, buildings], objectGroups),
      properties: { Warp: '1 2 Farm 10 11' },
    }

    expect(collectWarpEntries(document)).toEqual([
      { kind: 'property', group: { fromX: 1, fromY: 2, toMap: 'Farm', toX: 10, toY: 11 }, index: 0 },
      { kind: 'touch', x: 1, y: 2, toMap: 'Forest', toX: 10, toY: 20, source: 'cellProperties' },
      { kind: 'action', x: 0, y: 1, toMap: 'Mine', toX: 3, toY: 4, source: 'tileDataObject' },
    ])
  })

  it('keeps per-cell actions that are not warps out of the merged list', () => {
    const back = fullLayer('Back', { 5: { TouchAction: 'Door' } }, 1)
    const buildings = fullLayer('Buildings', { 6: { Action: 'Message "hi"' } }, 2)
    expect(collectWarpEntries(actionDocument([back, buildings], []))).toEqual([])
  })
})

describe('writeCellAction', () => {
  it('writes TMX actions through the layer-named TileData group, creating it lazily', () => {
    const source = actionDocument([fullLayer('Back')], [])
    const painted = writeCellAction(source, 'Back', { x: 1, y: 1 }, 'TouchAction', 'Warp Farm 10 11')

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
            properties: { TouchAction: 'Warp Farm 10 11' },
          },
        ],
      },
    ])
    // Immutable: the source keeps its empty group list.
    expect(source.objectGroups).toEqual([])
  })

  it('removes the TileData object once its properties become empty', () => {
    const source = actionDocument(
      [fullLayer('Back')],
      [tileDataGroup([tileDataObject({ TouchAction: 'Warp Farm 10 11' }, 16, 16)], 'Back')],
    )
    const painted = writeCellAction(source, 'Back', { x: 1, y: 1 }, 'TouchAction', '')

    expect(painted.objectGroups[0]!.objects).toEqual([])
  })

  it("merges into tbin cellProperties while preserving the cell's other keys", () => {
    const source = actionDocument([fullLayer('Back', { 5: { Action: 'Warp Town 1 2', Water: 'T' } })], [], 'tbin')
    const painted = writeCellAction(source, 'Back', { x: 1, y: 1 }, 'Action', 'Warp Farm 10 11')

    expect(painted.layers[0]!.cellProperties?.[5]).toEqual({ Action: 'Warp Farm 10 11', Water: 'T' })
  })

  it('deletes the tbin key and drops the cell entry once it is empty', () => {
    const source = actionDocument([fullLayer('Back', { 5: { TouchAction: 'Warp Farm 10 11' } })], [], 'tbin')
    const painted = writeCellAction(source, 'Back', { x: 1, y: 1 }, 'TouchAction', '')

    expect(painted.layers[0]!.cellProperties?.[5]).toBeUndefined()
  })

  it('returns the input document when nothing would change', () => {
    const source = actionDocument([fullLayer('Back', { 5: { TouchAction: 'Warp Farm 10 11' } })], [], 'tbin')
    expect(writeCellAction(source, 'Back', { x: 1, y: 1 }, 'TouchAction', 'Warp Farm 10 11')).toBe(source)
    expect(writeCellAction(source, 'Missing', { x: 1, y: 1 }, 'TouchAction', 'Warp Farm 10 11')).toBe(source)
  })
})

describe('world atlas portal sampling', () => {
  it('samples a portal from a per-cell TouchAction warp', () => {
    const town: MapDocument = {
      name: 'Town',
      format: 'tmx',
      sourcePath: 'Town.tmx',
      relativePath: 'assets/maps/Town.tmx',
      width: 4,
      height: 3,
      tileWidth: 16,
      tileHeight: 16,
      orientation: 'orthogonal',
      renderOrder: 'right-down',
      properties: { Outdoors: 'T' },
      tilesets: [],
      layers: [fullLayer('Back', { 9: { TouchAction: 'Warp Forest 10 20' } })], // cell (1, 2)
      objectGroups: [],
    }

    const atlas = buildWorldAtlas([town], 'Town')
    expect(atlas).not.toBeNull()
    // The single placement is shifted by ATLAS_ROUTE_PADDING (3) during
    // normalization, so the sampled cell (1, 2) lands at (3 + 1 + 0.5, 3 + 2 + 0.5).
    expect(atlas!.atlas.portals).toEqual([
      expect.objectContaining({
        fromMap: 'Town',
        targetMap: 'Forest',
        label: 'Forest',
        position: { x: 4.5, y: 5.5 },
      }),
    ])
  })
})
