import { describe, expect, it } from 'vite-plus/test'
import {
  applyCellOverlayRule,
  cellOverlayRule,
  deriveCellOverlayCells,
  paintCellOverlayCells,
  type CellOverlayRule,
  type MapPropertyValue,
} from '@entities/map'
import { setMapAssetCellOverlay } from '@pages/workbench/workspaces/map/model/mapAssetReducer'
import type { MapDocument } from '@entities/map'

function layerDocument(): MapDocument {
  return {
    name: 'OverlayMap',
    format: 'tbin',
    sourcePath: 'OverlayMap.tbin',
    relativePath: 'assets/maps/OverlayMap.tbin',
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
        gids: new Uint32Array(12),
        nonEmptyTiles: 0,
      },
    ],
    objectGroups: [],
  }
}

const props: Record<string, MapPropertyValue> = {}

describe('cell overlay rules', () => {
  it('derives the display rule from the cell property keys with documented precedence', () => {
    expect(cellOverlayRule({})).toBeNull()
    expect(cellOverlayRule({ Diggable: 'T' })).toBe('dig')
    expect(cellOverlayRule({ Water: 'T' })).toBe('water')
    expect(cellOverlayRule({ Water: 'T', Diggable: 'T' })).toBe('water')
    expect(cellOverlayRule({ Passable: 'T' })).toBe('block')
    expect(cellOverlayRule({ NPCBarrier: 'T' })).toBe('npc')
    expect(cellOverlayRule({ Passable: 'T', NPCBarrier: 'T' })).toBe('npc')
    expect(cellOverlayRule({ Passable: 'T', Water: 'T', Diggable: 'T' })).toBe('block')
    expect(cellOverlayRule({ Action: 'Warp 1 2' })).toBeNull()
  })

  it('applies the four toggles without dropping independent keys or custom properties', () => {
    const seeded = { ...props, Water: 'T', Diggable: 'T', Action: 'Custom' }
    expect(applyCellOverlayRule(seeded, 'block')).toEqual({ Water: 'T', Diggable: 'T', Action: 'Custom', Passable: 'T' })
    expect(applyCellOverlayRule(seeded, 'npc')).toEqual({ Water: 'T', Diggable: 'T', Action: 'Custom', NPCBarrier: 'T' })
    expect(applyCellOverlayRule({ Passable: 'T' }, 'water')).toEqual({ Passable: 'T', Water: 'T' })
    expect(applyCellOverlayRule({ Passable: 'T' }, 'dig')).toEqual({ Passable: 'T', Diggable: 'T' })
    // block/npc are mutually exclusive
    expect(applyCellOverlayRule({ NPCBarrier: 'T' }, 'block')).toEqual({ Passable: 'T' })
    expect(applyCellOverlayRule({ Passable: 'T' }, 'npc')).toEqual({ NPCBarrier: 'T' })
  })

  it('walkable erases every overlay key but keeps unrelated custom properties', () => {
    const erased = applyCellOverlayRule({ Passable: 'T', NPCBarrier: 'T', Water: 'T', Diggable: 'T', Action: 'Warp 1 2' }, 'walkable')
    expect(erased).toEqual({ Action: 'Warp 1 2' })
    expect(applyCellOverlayRule({}, 'walkable')).toEqual({})
  })

  it('paints a batch immutably, skipping out-of-bounds and non-integer points', () => {
    const base: Record<number, Record<string, MapPropertyValue>> = { 5: { Diggable: 'T' } }
    const painted = paintCellOverlayCells(
      base,
      4,
      3,
      [
        { x: 1, y: 1 }, // index 5
        { x: 2, y: 1 }, // index 6
        { x: -1, y: 0 },
        { x: 4, y: 0 },
        { x: 0, y: 3 },
        { x: 1.5, y: 0 },
      ],
      'water',
    )
    expect(painted).toEqual({ 5: { Diggable: 'T', Water: 'T' }, 6: { Water: 'T' } })
    expect(base).toEqual({ 5: { Diggable: 'T' } })
  })

  it('removes entries that end up with no properties and preserves untouched cells', () => {
    const base: Record<number, Record<string, MapPropertyValue>> = {
      2: { Passable: 'T' },
      5: { Passable: 'T', Action: 'Door' },
    }
    const erased = paintCellOverlayCells(
      base,
      4,
      3,
      [
        { x: 2, y: 0 },
        { x: 1, y: 1 },
      ],
      'walkable',
    )
    expect(erased).toEqual({ 5: { Action: 'Door' } })
  })

  it('projects layer cell properties onto the overlay view model', () => {
    const cells = deriveCellOverlayCells({ 2: { Passable: 'T' }, 5: { Water: 'T' }, 9: { Action: 'Warp' } })
    expect(cells).toEqual({ 2: 'block', 5: 'water' })
  })

  it('writes one paint stroke through the reducer as a single batch (tbin path)', () => {
    const { document: seeded } = setMapAssetCellOverlay(
      documentWithProps({ 0: { Diggable: 'T', Action: 'Door' } }),
      1,
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      'block',
    )
    const layer = seeded.layers[0]!
    expect(layer.cellProperties?.[0]).toEqual({ Diggable: 'T', Action: 'Door', Passable: 'T' })
    expect(layer.cellProperties?.[1]).toEqual({ Passable: 'T' })
    expect(layer.cellProperties?.[2]).toEqual({ Passable: 'T' })

    const { document: erased } = setMapAssetCellOverlay(
      seeded,
      1,
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      'walkable',
    )
    const erasedLayer = erased.layers[0]!
    expect(erasedLayer.cellProperties?.[0]).toEqual({ Action: 'Door' })
    expect(erasedLayer.cellProperties?.[1]).toBeUndefined()
    expect(erasedLayer.cellProperties?.[2]).toBeUndefined()
  })

  it('keeps every overlay rule type valid for the paint path', () => {
    const rules: CellOverlayRule[] = ['walkable', 'block', 'npc', 'water', 'dig']
    for (const rule of rules) {
      const next = paintCellOverlayCells({}, 4, 3, [{ x: 0, y: 0 }], rule)
      expect(Object.keys(next).length).toBe(rule === 'walkable' ? 0 : 1)
    }
  })
})

function documentWithProps(cellProperties: Record<number, Record<string, MapPropertyValue>>): MapDocument {
  return { ...layerDocument(), layers: [{ ...layerDocument().layers[0]!, cellProperties }] }
}
