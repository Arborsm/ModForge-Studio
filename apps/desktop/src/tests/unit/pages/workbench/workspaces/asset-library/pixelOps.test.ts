import { describe, expect, it } from 'vite-plus/test'
import { fillPixels, parsePixelColor, setPixel } from '@pages/workbench/workspaces/asset-library/model/pixelOps'

describe('pixel operations', () => {
  it('writes one immutable pixel', () => {
    const source = new Uint8ClampedArray(2 * 4)
    const next = setPixel(source, 2, 1, 1, 0, [255, 0, 16, 255])
    expect([...source]).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect([...next]).toEqual([0, 0, 0, 0, 255, 0, 16, 255])
  })

  it('fills only the connected source-colour region', () => {
    const transparent = [0, 0, 0, 0]
    const wall = [1, 1, 1, 255]
    const source = new Uint8ClampedArray([...transparent, ...wall, ...transparent, ...wall])
    const next = fillPixels(source, 2, 2, 0, 0, parsePixelColor('#ff0000'))
    expect([...next]).toEqual([255, 0, 0, 255, ...wall, 255, 0, 0, 255, ...wall])
  })
})
