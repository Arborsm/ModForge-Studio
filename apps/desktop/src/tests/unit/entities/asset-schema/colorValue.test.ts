import { describe, expect, it } from 'vite-plus/test'
import {
  COLOR_NAMES,
  COLOR_SWATCH_PRESETS,
  colorFromNameOrHex,
  colorNameFor,
  colorToCss,
  colorToCssHex,
  formatColorValue,
  parseColorValue,
  prefersLightForeground,
  type ColorValueFormat,
} from '@entities/asset-schema'

describe('parseColorValue', () => {
  it('parses a colour name and keeps the catalog spelling', () => {
    expect(parseColorValue('DarkOrchid')).toEqual({
      color: { r: 153, g: 50, b: 204, a: 255 },
      format: 'name',
      name: 'DarkOrchid',
    })
  })

  it('matches colour names case-insensitively and after trimming', () => {
    expect(parseColorValue('  darkorchid ')).toMatchObject({ format: 'name', name: 'DarkOrchid' })
  })

  it('parses 6 and 8 digit hex', () => {
    expect(parseColorValue('#1E90FF')).toEqual({ color: { r: 30, g: 144, b: 255, a: 255 }, format: 'hex' })
    expect(parseColorValue('#1E90FF80')).toEqual({ color: { r: 30, g: 144, b: 255, a: 128 }, format: 'hex' })
  })

  it('expands shorthand 3 and 4 digit hex by repeating each nibble', () => {
    expect(parseColorValue('#f80')).toEqual({ color: { r: 255, g: 136, b: 0, a: 255 }, format: 'hex' })
    expect(parseColorValue('#f80c')).toEqual({ color: { r: 255, g: 136, b: 0, a: 204 }, format: 'hex' })
  })

  it('parses space separated channels with and without alpha', () => {
    expect(parseColorValue('255 128 0')).toEqual({ color: { r: 255, g: 128, b: 0, a: 255 }, format: 'space' })
    expect(parseColorValue('255 128 0 64')).toEqual({ color: { r: 255, g: 128, b: 0, a: 64 }, format: 'space' })
  })

  it('parses comma separated channels regardless of surrounding spaces', () => {
    expect(parseColorValue('255,128,0')).toEqual({ color: { r: 255, g: 128, b: 0, a: 255 }, format: 'comma' })
    expect(parseColorValue('255, 128 , 0, 64')).toEqual({ color: { r: 255, g: 128, b: 0, a: 64 }, format: 'comma' })
  })

  it('clamps out of range channels', () => {
    expect(parseColorValue('300 -20 0')).toMatchObject({ color: { r: 255, g: 0, b: 0, a: 255 } })
  })

  it('returns null for spellings the game does not read', () => {
    expect(parseColorValue('')).toBeNull()
    expect(parseColorValue('   ')).toBeNull()
    expect(parseColorValue(null)).toBeNull()
    expect(parseColorValue(undefined)).toBeNull()
    expect(parseColorValue(42)).toBeNull()
    expect(parseColorValue('NotAColour')).toBeNull()
    expect(parseColorValue('255 128')).toBeNull()
    expect(parseColorValue('1 2 3 4 5')).toBeNull()
    expect(parseColorValue('255 12.5 0')).toBeNull()
    expect(parseColorValue('#12345')).toBeNull()
    expect(parseColorValue('#gg0000')).toBeNull()
  })
})

describe('formatColorValue', () => {
  const color = { r: 30, g: 144, b: 255, a: 255 }

  it('writes uppercase hex and appends alpha only when it is not opaque', () => {
    expect(formatColorValue(color, 'hex')).toBe('#1E90FF')
    expect(formatColorValue({ ...color, a: 128 }, 'hex')).toBe('#1E90FF80')
  })

  it('writes a colour name when one matches exactly', () => {
    expect(formatColorValue({ r: 153, g: 50, b: 204, a: 255 }, 'name')).toBe('DarkOrchid')
  })

  it('falls back to channels when no colour name matches', () => {
    expect(formatColorValue({ r: 1, g: 2, b: 3, a: 255 }, 'name')).toBe('1 2 3')
  })

  it('writes channel lists in the requested separator', () => {
    expect(formatColorValue(color, 'space')).toBe('30 144 255')
    expect(formatColorValue(color, 'comma')).toBe('30, 144, 255')
    expect(formatColorValue({ ...color, a: 64 }, 'space')).toBe('30 144 255 64')
    expect(formatColorValue({ ...color, a: 64 }, 'comma')).toBe('30, 144, 255, 64')
  })

  it('clamps channels before serializing', () => {
    expect(formatColorValue({ r: 999, g: -5, b: 12.6, a: 255 }, 'space')).toBe('255 0 13')
  })

  it('round-trips every spelling without rewriting the author style', () => {
    const samples: ReadonlyArray<[string, ColorValueFormat]> = [
      ['DarkOrchid', 'name'],
      ['#1E90FF', 'hex'],
      ['#1E90FF80', 'hex'],
      ['30 144 255', 'space'],
      ['30, 144, 255', 'comma'],
      ['30, 144, 255, 64', 'comma'],
    ]
    for (const [raw, format] of samples) {
      const parsed = parseColorValue(raw)
      expect(parsed?.format).toBe(format)
      expect(formatColorValue(parsed!.color, parsed!.format)).toBe(raw)
    }
  })
})

describe('colourName lookup', () => {
  it('resolves exact matches in catalog order', () => {
    expect(colorNameFor({ r: 255, g: 255, b: 255, a: 255 })).toBe('White')
    expect(colorNameFor({ r: 0, g: 255, b: 255, a: 255 })).toBe('Aqua')
  })

  it('refuses to name a translucent colour', () => {
    expect(colorNameFor({ r: 255, g: 255, b: 255, a: 254 })).toBeNull()
  })

  it('returns null when nothing matches', () => {
    expect(colorNameFor({ r: 1, g: 2, b: 3, a: 255 })).toBeNull()
  })
})

describe('css helpers', () => {
  it('writes lowercase #RRGGBB ignoring alpha', () => {
    expect(colorToCssHex({ r: 30, g: 144, b: 255, a: 12 })).toBe('#1e90ff')
  })

  it('keeps alpha out of the css value when opaque', () => {
    expect(colorToCss({ r: 30, g: 144, b: 255, a: 255 })).toBe('#1e90ff')
  })

  it('emits rgba with a rounded alpha when translucent', () => {
    expect(colorToCss({ r: 30, g: 144, b: 255, a: 128 })).toBe('rgb(30 144 255 / 0.502)')
  })

  it('picks a light foreground only on dark backgrounds', () => {
    expect(prefersLightForeground({ r: 0, g: 0, b: 0, a: 255 })).toBe(true)
    expect(prefersLightForeground({ r: 255, g: 255, b: 255, a: 255 })).toBe(false)
  })
})

describe('colour catalogs', () => {
  it('exposes unique names including the ones schemas reference', () => {
    expect(COLOR_NAMES).toContain('DarkOrchid')
    expect(COLOR_NAMES).toContain('White')
    expect(new Set(COLOR_NAMES).size).toBe(COLOR_NAMES.length)
  })

  it('offers presets that all resolve to channels', () => {
    expect(COLOR_SWATCH_PRESETS.length).toBeGreaterThan(0)
    for (const preset of COLOR_SWATCH_PRESETS) {
      expect(colorFromNameOrHex(preset), preset).not.toBeNull()
    }
  })

  it('resolves names and hex literals, and rejects anything else', () => {
    expect(colorFromNameOrHex('Gold')).toEqual({ r: 255, g: 215, b: 0, a: 255 })
    expect(colorFromNameOrHex('#000')).toEqual({ r: 0, g: 0, b: 0, a: 255 })
    expect(colorFromNameOrHex('nope')).toBeNull()
  })
})
