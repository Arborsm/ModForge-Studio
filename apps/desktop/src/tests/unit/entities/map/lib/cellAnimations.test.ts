import { describe, expect, it } from 'vite-plus/test'
import {
  FLIPPED_HORIZONTALLY_FLAG,
  hasMixedFrameDurations,
  planCellAnimationHoist,
  setCellAnimation,
  type MapDocument,
  type MapTileset,
  type MapTilesetAnimationFrame,
} from '@entities/map'

function frame(tileId: number, duration: number): MapTilesetAnimationFrame {
  return { tileId, duration }
}

function tileset(name: string, firstGid: number, tileCount = 16): MapTileset {
  return {
    firstGid,
    name,
    tileWidth: 16,
    tileHeight: 16,
    tileCount,
    columns: 4,
    source: null,
    margin: 0,
    spacing: 0,
    tileOffsetX: 0,
    tileOffsetY: 0,
    imageSource: 'tiles.png',
    imagePath: 'tiles.png',
    imageWidth: 64,
    imageHeight: 64,
    imageTrans: null,
    properties: {},
    tileProperties: {},
    animations: {},
  }
}

function mapDocument(): MapDocument {
  return {
    name: 'AnimatedMap',
    format: 'tbin',
    sourcePath: 'AnimatedMap.tbin',
    relativePath: 'assets/maps/AnimatedMap.tbin',
    width: 3,
    height: 2,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    properties: {},
    tilesets: [tileset('Ground', 1)],
    layers: [
      {
        id: 1,
        name: 'Back',
        kind: 'tile',
        width: 3,
        height: 2,
        visible: true,
        opacity: 1,
        offsetX: 0,
        offsetY: 0,
        properties: {},
        gids: new Uint32Array([1, 2, 0, 0, 0, 0]),
        nonEmptyTiles: 2,
      },
    ],
    objectGroups: [],
  }
}

describe('setCellAnimation', () => {
  it('adds, updates and removes the cell animation immutably', () => {
    const base = mapDocument()

    const added = setCellAnimation(base, 1, 0, [frame(1, 100), frame(2, 200)])
    expect(added.layers[0].cellAnimations?.[0]).toEqual([
      { tileId: 1, duration: 100 },
      { tileId: 2, duration: 200 },
    ])
    // The original document is untouched.
    expect(base.layers[0].cellAnimations).toBeUndefined()

    const updated = setCellAnimation(added, 1, 0, [frame(3, 150)])
    expect(updated.layers[0].cellAnimations?.[0]).toEqual([{ tileId: 3, duration: 150 }])
    expect(added.layers[0].cellAnimations?.[0]).toEqual([
      { tileId: 1, duration: 100 },
      { tileId: 2, duration: 200 },
    ])

    // An empty frame list and null both delete the entry.
    expect(setCellAnimation(updated, 1, 0, []).layers[0].cellAnimations).toEqual({})
    expect(setCellAnimation(updated, 1, 0, null).layers[0].cellAnimations).toEqual({})
    // Other layers are preserved by identity.
    expect(setCellAnimation(base, 1, 0, [frame(1, 100)]).layers).toHaveLength(1)
  })

  it('clones the frame records so later edits cannot alias the stored frames', () => {
    const base = mapDocument()
    const stored = [frame(1, 100)]
    const added = setCellAnimation(base, 1, 0, stored)
    stored[0]!.tileId = 99
    expect(added.layers[0].cellAnimations?.[0]?.[0]?.tileId).toBe(1)
  })

  it('ignores out-of-bounds cells and missing layers', () => {
    const base = mapDocument()
    expect(setCellAnimation(base, 1, 99, [frame(1, 100)])).toBe(base)
    expect(setCellAnimation(base, 1, -1, [frame(1, 100)])).toBe(base)
    expect(setCellAnimation(base, 42, 0, [frame(1, 100)])).toBe(base)
  })
})

describe('hasMixedFrameDurations', () => {
  it('flags frame lists with more than one duration', () => {
    expect(hasMixedFrameDurations([frame(1, 100), frame(2, 100)])).toBe(false)
    expect(hasMixedFrameDurations([frame(1, 100), frame(2, 150)])).toBe(true)
    expect(hasMixedFrameDurations([])).toBe(false)
    expect(hasMixedFrameDurations([frame(1, 100)])).toBe(false)
  })
})

describe('planCellAnimationHoist', () => {
  it('counts one hoist per unique base id and drops later duplicates', () => {
    const base = mapDocument()
    base.layers[0].cellAnimations = {
      0: [frame(1, 100), frame(2, 200)],
      1: [frame(3, 100)],
    }
    // Cell 0 (gid 1) and cell 1 (gid 2) are distinct base ids.
    expect(planCellAnimationHoist(base)).toEqual({ hoisted: 2, dropped: 0 })
  })

  it('drops cells whose base id animation was written by an earlier sorted cell', () => {
    const base = mapDocument()
    base.layers[0].gids[1] = 1
    base.layers[0].cellAnimations = {
      0: [frame(1, 100)],
      1: [frame(2, 100)],
    }
    // Both cells share base id 1 (gid 1): only the first sorted index hoists.
    expect(planCellAnimationHoist(base)).toEqual({ hoisted: 1, dropped: 1 })
  })

  it('drops cells whose tileset definition already carries the base id animation', () => {
    const base = mapDocument()
    base.tilesets[0]!.animations[0] = [frame(2, 50)]
    base.layers[0].cellAnimations = { 0: [frame(1, 100)] }
    expect(planCellAnimationHoist(base)).toEqual({ hoisted: 0, dropped: 1 })
  })

  it('strips flip flags before resolving the base id', () => {
    const base = mapDocument()
    base.layers[0].gids[0] = (1 | FLIPPED_HORIZONTALLY_FLAG) >>> 0
    base.layers[0].cellAnimations = { 0: [frame(1, 100)] }
    expect(planCellAnimationHoist(base)).toEqual({ hoisted: 1, dropped: 0 })
  })

  it('ignores empty gids and gids outside every tileset range', () => {
    const base = mapDocument()
    base.layers[0].cellAnimations = {
      0: [frame(1, 100)], // gid 1 → tileset
      2: [frame(1, 100)], // gid 0 → ignored
    }
    expect(planCellAnimationHoist(base)).toEqual({ hoisted: 1, dropped: 0 })

    // A gid past the tileset's tileCount lands in a range gap: ignored.
    const gap = mapDocument()
    gap.layers[0].gids[0] = 20
    gap.layers[0].cellAnimations = { 0: [frame(1, 100)] }
    expect(planCellAnimationHoist(gap)).toEqual({ hoisted: 0, dropped: 0 })
  })

  it('tracks written ids across layers and multiple tilesets independently', () => {
    const base = mapDocument()
    base.tilesets.push(tileset('Deco', 17))
    base.layers[0].gids = new Uint32Array([1, 17, 0, 0, 0, 0])
    // The same local id 0 in two different tilesets both hoist.
    base.layers[0].cellAnimations = {
      0: [frame(1, 100)],
      1: [frame(2, 100)],
    }
    expect(planCellAnimationHoist(base)).toEqual({ hoisted: 2, dropped: 0 })

    // A second layer with the same base id also drops against the first writer.
    const second = mapDocument()
    second.tilesets.push(tileset('Deco', 17))
    second.layers.push({
      id: 2,
      name: 'Front',
      kind: 'tile',
      width: 3,
      height: 2,
      visible: true,
      opacity: 1,
      offsetX: 0,
      offsetY: 0,
      properties: {},
      gids: new Uint32Array([1, 17, 0, 0, 0, 0]),
      nonEmptyTiles: 2,
    })
    second.layers[0].cellAnimations = { 0: [frame(1, 100)] }
    second.layers[1].cellAnimations = { 0: [frame(2, 100)] }
    expect(planCellAnimationHoist(second)).toEqual({ hoisted: 1, dropped: 1 })
  })
})
