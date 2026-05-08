import { describe, expect, it } from 'vitest'
import { cropRaster, findChangedBounds, maskUnchangedPixels, type RgbaRaster } from './imageCompare'

function buildRaster(width: number, height: number, colors: Array<[number, number, number, number]>): RgbaRaster {
  return {
    width,
    height,
    data: new Uint8ClampedArray(colors.flat()),
  }
}

describe('imageCompare', () => {
  it('finds the bounding box of changed pixels', () => {
    const original = buildRaster(3, 2, [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const patched = buildRaster(3, 2, [
      [0, 0, 0, 0],
      [255, 0, 0, 255],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 255, 0, 255],
      [0, 0, 0, 0],
    ])

    expect(findChangedBounds(original, patched)).toEqual({ x: 1, y: 0, width: 1, height: 2 })
  })

  it('hides unchanged pixels while preserving differences', () => {
    const original = buildRaster(2, 1, [
      [10, 10, 10, 255],
      [20, 20, 20, 255],
    ])
    const patched = buildRaster(2, 1, [
      [10, 10, 10, 255],
      [255, 0, 0, 255],
    ])

    const masked = maskUnchangedPixels(patched, original)
    expect(Array.from(masked.data)).toEqual([10, 10, 10, 0, 255, 0, 0, 255])
  })

  it('crops rasters to the changed region', () => {
    const raster = buildRaster(3, 2, [
      [1, 1, 1, 255],
      [2, 2, 2, 255],
      [3, 3, 3, 255],
      [4, 4, 4, 255],
      [5, 5, 5, 255],
      [6, 6, 6, 255],
    ])

    const cropped = cropRaster(raster, { x: 1, y: 0, width: 2, height: 2 })
    expect(cropped.width).toBe(2)
    expect(cropped.height).toBe(2)
    expect(Array.from(cropped.data)).toEqual([2, 2, 2, 255, 3, 3, 3, 255, 5, 5, 5, 255, 6, 6, 6, 255])
  })
})
