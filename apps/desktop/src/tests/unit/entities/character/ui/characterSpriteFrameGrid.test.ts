import { describe, expect, it } from 'vite-plus/test'
import { inferSpriteFrameGrid, type SpriteFrameInferenceBounds } from '@entities/character'

const bounds = (
  frame0: { left: number; right: number; top: number; bottom: number } | null,
  frame1: { left: number; right: number; top: number; bottom: number } | null,
): SpriteFrameInferenceBounds => ({ frame0, frame1 })

describe('inferSpriteFrameGrid', () => {
  it('doubles width when frame0 is the right half and frame1 is the left half (Bear)', () => {
    // Bear: sheet 128x160, Size 16x32. frame0 is the right half (left 1, right 15),
    // frame1 is the left half (left 0, right 13).
    const result = inferSpriteFrameGrid(
      128,
      16,
      32,
      bounds({ left: 1, right: 15, top: 3, bottom: 31 }, { left: 0, right: 13, top: 3, bottom: 31 }),
    )
    expect(result).toEqual({ frameWidth: 32, frameHeight: 32 })
  })

  it('keeps original width when frames are full cells (Dwarf)', () => {
    // Dwarf: sheet 64x120, Size 16x24. Both frames start at left 0 and end near right,
    // so they are not split halves.
    const result = inferSpriteFrameGrid(
      64,
      16,
      24,
      bounds({ left: 2, right: 13, top: 4, bottom: 23 }, { left: 0, right: 13, top: 5, bottom: 23 }),
    )
    expect(result).toEqual({ frameWidth: 16, frameHeight: 24 })
  })

  it('keeps original width when sheet does not divide evenly by doubled width', () => {
    // Bounds look like a split sprite, but sheetWidth=48 does not divide by 32.
    const result = inferSpriteFrameGrid(
      48,
      16,
      32,
      bounds({ left: 1, right: 15, top: 0, bottom: 31 }, { left: 0, right: 14, top: 0, bottom: 31 }),
    )
    expect(result).toEqual({ frameWidth: 16, frameHeight: 32 })
  })

  it('falls back to base size when bounds are null (no pixel data)', () => {
    const result = inferSpriteFrameGrid(128, 16, 32, bounds(null, null))
    expect(result).toEqual({ frameWidth: 16, frameHeight: 32 })
  })

  it('does not double when frame0 right edge does not touch boundary', () => {
    // Abigail: frame0 right edge at 14 (!=15), no doubling.
    const result = inferSpriteFrameGrid(
      64,
      16,
      32,
      bounds({ left: 1, right: 14, top: 0, bottom: 31 }, { left: 0, right: 14, top: 0, bottom: 31 }),
    )
    expect(result).toEqual({ frameWidth: 16, frameHeight: 32 })
  })

  it('does not double when frame0 fills the whole first cell', () => {
    // Wizard: frame0 left is 0, so it is not a right half.
    const result = inferSpriteFrameGrid(
      64,
      16,
      32,
      bounds({ left: 0, right: 15, top: 0, bottom: 31 }, { left: 0, right: 15, top: 0, bottom: 31 }),
    )
    expect(result).toEqual({ frameWidth: 16, frameHeight: 32 })
  })

  it('does not double when frame1 fills the whole second cell', () => {
    // frame1 right is 15, so it is not a left half.
    const result = inferSpriteFrameGrid(
      64,
      16,
      32,
      bounds({ left: 1, right: 15, top: 0, bottom: 31 }, { left: 0, right: 15, top: 0, bottom: 31 }),
    )
    expect(result).toEqual({ frameWidth: 16, frameHeight: 32 })
  })
})
