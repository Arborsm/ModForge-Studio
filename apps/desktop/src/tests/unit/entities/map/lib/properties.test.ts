import { describe, expect, it } from 'vite-plus/test'
import { asMapPropertyString, unwrapMapPropertyValue, type MapPropertyValue } from '@entities/map'

describe('map property values', () => {
  it('reads typed and custom-class properties through their underlying value', () => {
    const typedNumber: MapPropertyValue = { value: 7, tmxType: 'int' }
    const custom: MapPropertyValue = {
      value: { value: 'Town 10 20', tmxType: 'string' },
      tmxType: 'class',
      propertyType: 'ModForge.Warp',
    }

    expect(unwrapMapPropertyValue(typedNumber)).toBe(7)
    expect(asMapPropertyString(typedNumber)).toBe('7')
    expect(unwrapMapPropertyValue(custom)).toBe('Town 10 20')
    expect(asMapPropertyString(custom)).toBe('Town 10 20')
  })
})
