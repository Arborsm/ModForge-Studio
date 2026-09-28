import { describe, it, expect } from 'vite-plus/test'
import {
  extractAnimationGroups,
  expandAnimationGroup,
  removeAnimationGroupAnimations,
  type AnimationGroup,
  type MapTileset,
  type MapTilesetAnimationFrame,
} from '@entities/map'

function makeTileset(overrides: Partial<MapTileset> = {}): MapTileset {
  return {
    firstGid: 1,
    name: 'test',
    tileWidth: 16,
    tileHeight: 16,
    tileCount: 100,
    columns: 10,
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

function frame(tileId: number, duration = 100): MapTilesetAnimationFrame {
  return { tileId, duration }
}

describe('extractAnimationGroups', () => {
  it('returns empty for a tileset with no animations', () => {
    expect(extractAnimationGroups(makeTileset())).toEqual([])
  })

  it('extracts a single-tile (1x1) animation as a 1x1 group', () => {
    const tileset = makeTileset({
      animations: {
        5: [frame(5), frame(6), frame(7)],
      },
    })
    const groups = extractAnimationGroups(tileset)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      ownerTileId: 5,
      width: 1,
      height: 1,
      frameCount: 3,
      duration: 100,
      frameOrigins: [5, 6, 7],
    })
  })

  it('extracts a 2x2 multi-tile animation group', () => {
    // Owner at (col=2, row=3) = tileId 32 in a 10-column sheet.
    // Frame 1 region: tiles 32,33,42,43 → frame origins [32]
    // Frame 2 region: tiles 52,53,62,63 → frame origins [52]
    const columns = 10
    const ownerCol = 2
    const ownerRow = 3
    const ownerTile = ownerRow * columns + ownerCol // 32
    const w = 2
    const h = 2
    const frameOrigins = [ownerTile, ownerTile + 20] // [32, 52]
    const animations: Record<number, MapTilesetAnimationFrame[]> = {}
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const ownerOffset = dy * columns + dx
        const tileId = ownerTile + ownerOffset
        animations[tileId] = frameOrigins.map((o) => frame(o + ownerOffset))
      }
    }
    const tileset = makeTileset({ animations, columns })
    const groups = extractAnimationGroups(tileset)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      ownerTileId: ownerTile,
      width: 2,
      height: 2,
      frameCount: 2,
      duration: 100,
      frameOrigins,
    })
  })

  it('separates adjacent groups with different durations', () => {
    const tileset = makeTileset({
      animations: {
        0: [frame(0, 100), frame(1, 100)],
        1: [frame(1, 200), frame(2, 200)],
      },
    })
    const groups = extractAnimationGroups(tileset)
    expect(groups).toHaveLength(2)
  })

  it('separates groups with different frame counts', () => {
    const tileset = makeTileset({
      animations: {
        0: [frame(0), frame(1)],
        1: [frame(1), frame(2), frame(3)],
      },
    })
    const groups = extractAnimationGroups(tileset)
    expect(groups).toHaveLength(2)
  })
})

describe('expandAnimationGroup', () => {
  it('expands a 1x1 group into a single tile animation', () => {
    const group: AnimationGroup = {
      ownerTileId: 5,
      width: 1,
      height: 1,
      frameCount: 2,
      duration: 100,
      frameOrigins: [5, 15],
    }
    const result = expandAnimationGroup(group, 10)
    expect(Object.keys(result)).toEqual(['5'])
    expect(result[5]).toEqual([frame(5), frame(15)])
  })

  it('expands a 2x2 group into 4 tile animations', () => {
    const columns = 10
    const ownerTile = 32 // (col=2, row=3)
    const group: AnimationGroup = {
      ownerTileId: ownerTile,
      width: 2,
      height: 2,
      frameCount: 2,
      duration: 100,
      frameOrigins: [ownerTile, ownerTile + 20], // [32, 52]
    }
    const result = expandAnimationGroup(group, columns)
    expect(Object.keys(result).sort((a, b) => Number(a) - Number(b))).toEqual(['32', '33', '42', '43'])
    // tile 32 (owner, dx=0, dy=0): frames [32, 52]
    expect(result[32]).toEqual([frame(32), frame(52)])
    // tile 33 (dx=1, dy=0): frames [33, 53]
    expect(result[33]).toEqual([frame(33), frame(53)])
    // tile 42 (dx=0, dy=1): frames [42, 62]
    expect(result[42]).toEqual([frame(42), frame(62)])
    // tile 43 (dx=1, dy=1): frames [43, 63]
    expect(result[43]).toEqual([frame(43), frame(63)])
  })
})

describe('removeAnimationGroupAnimations', () => {
  it('removes all tiles belonging to a group', () => {
    const columns = 10
    const ownerTile = 32
    const group: AnimationGroup = {
      ownerTileId: ownerTile,
      width: 2,
      height: 2,
      frameCount: 1,
      duration: 100,
      frameOrigins: [ownerTile],
    }
    const animations: Record<number, MapTilesetAnimationFrame[]> = {
      32: [frame(32)],
      33: [frame(33)],
      42: [frame(42)],
      43: [frame(43)],
      99: [frame(99)], // unrelated
    }
    const result = removeAnimationGroupAnimations(animations, group, columns)
    expect(Object.keys(result).sort((a, b) => Number(a) - Number(b))).toEqual(['99'])
  })
})

describe('round-trip: extract → expand', () => {
  it('expanding an extracted group reproduces the original animations', () => {
    const columns = 10
    const ownerTile = 23 // (col=3, row=2)
    const w = 3
    const h = 2
    const frameOrigins = [23, 53, 83]
    const original: Record<number, MapTilesetAnimationFrame[]> = {}
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const offset = dy * columns + dx
        const tileId = ownerTile + offset
        original[tileId] = frameOrigins.map((o) => frame(o + offset, 150))
      }
    }
    const tileset = makeTileset({ animations: original, columns })
    const groups = extractAnimationGroups(tileset)
    expect(groups).toHaveLength(1)
    const expanded = expandAnimationGroup(groups[0], columns)
    expect(expanded).toEqual(original)
  })
})
