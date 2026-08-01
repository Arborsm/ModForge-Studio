import { describe, expect, it } from 'vite-plus/test'
import { createMapTileRect } from '@entities/map'

describe('createMapTileRect', () => {
  it('normalizes reverse drags and keeps both corner tiles', () => {
    expect(createMapTileRect({ x: 8, y: 6 }, { x: 5, y: 2 }, { width: 20, height: 20 })).toEqual({
      x: 5,
      y: 2,
      width: 4,
      height: 5,
    })
  })

  it('clamps a drag that leaves the map', () => {
    expect(createMapTileRect({ x: 3, y: 4 }, { x: 99, y: -5 }, { width: 10, height: 8 })).toEqual({
      x: 3,
      y: 0,
      width: 7,
      height: 5,
    })
  })

  it('returns a one-tile rectangle for a click', () => {
    expect(createMapTileRect({ x: 2, y: 7 }, { x: 2, y: 7 }, { width: 12, height: 12 })).toEqual({
      x: 2,
      y: 7,
      width: 1,
      height: 1,
    })
  })
})
