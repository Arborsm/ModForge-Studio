import { describe, expect, test } from 'vite-plus/test'
import { cellIndexFor, cellRegionAt, normalizeDragRect, regionForCellIndex } from '@shared/ui/SheetRegionPicker'

const BOUNDS = { width: 256, height: 256 }

describe('normalizeDragRect', () => {
  test('orders corners regardless of drag direction', () => {
    // clientPerSource = 1 → client coords are source coords
    expect(normalizeDragRect({ x: 100, y: 80 }, { x: 20, y: 30 }, 1, BOUNDS)).toEqual({ x: 20, y: 30, width: 80, height: 50 })
  })

  test('converts client pixels through the display scale', () => {
    // displayed at 2× natural size
    expect(normalizeDragRect({ x: 20, y: 20 }, { x: 120, y: 120 }, 2, BOUNDS)).toEqual({ x: 10, y: 10, width: 50, height: 50 })
  })

  test('clamps to the image bounds', () => {
    expect(normalizeDragRect({ x: -50, y: -50 }, { x: 300, y: 300 }, 1, BOUNDS)).toEqual({ x: 0, y: 0, width: 256, height: 256 })
  })

  test('snaps outward to the grid with a one-cell minimum', () => {
    expect(normalizeDragRect({ x: 5, y: 5 }, { x: 20, y: 20 }, 1, BOUNDS, 16)).toEqual({ x: 0, y: 0, width: 32, height: 32 })
    expect(normalizeDragRect({ x: 10, y: 10 }, { x: 12, y: 12 }, 1, BOUNDS, 16)).toEqual({ x: 0, y: 0, width: 16, height: 16 })
  })
})

describe('cell picking', () => {
  test('cellRegionAt returns the containing cell or null outside', () => {
    expect(cellRegionAt({ x: 17, y: 33 }, 16, BOUNDS)).toEqual({ x: 16, y: 32, width: 16, height: 16 })
    expect(cellRegionAt({ x: -1, y: 0 }, 16, BOUNDS)).toBeNull()
    expect(cellRegionAt({ x: 255, y: 255 }, 16, BOUNDS)).toEqual({ x: 240, y: 240, width: 16, height: 16 })
    expect(cellRegionAt({ x: 256, y: 0 }, 16, BOUNDS)).toBeNull()
  })

  test('cellIndexFor and regionForCellIndex round-trip row-major', () => {
    const region = { x: 32, y: 48, width: 16, height: 16 }
    const index = cellIndexFor(region, 16, 256)
    expect(index).toBe(3 * 16 + 2)
    expect(regionForCellIndex(index, 16, 256, 256)).toEqual(region)
  })

  test('regionForCellIndex rejects out-of-range indexes', () => {
    expect(regionForCellIndex(-1, 16, 256, 256)).toBeNull()
    expect(regionForCellIndex(16 * 16, 16, 256, 256)).toBeNull()
  })
})
