/**
 * Colour string parsing for the game's `color` fields.
 *
 * `Utility.StringToColor` accepts three spellings and mods use all of them:
 * an XNA colour name (`DarkOrchid`), `R G B` / `R G B A` and `R,G,B` / `R,G,B,A`.
 * The visual control needs a swatch (parse) without ever rewriting a value the
 * user did not touch, so the parse result carries the *format it came in as*
 * and the formatter round-trips that same format.
 *
 * Values outside these spellings are preserved verbatim by the control; parsing
 * returns null rather than guessing.
 */

export type ColorRgb = { r: number; g: number; b: number; a: number }

/** Spelling a colour value used, so edits round-trip in the author's own style. */
export type ColorValueFormat = 'name' | 'hex' | 'space' | 'comma'

export type ParsedColorValue = {
  color: ColorRgb
  format: ColorValueFormat
  /** Canonical catalog spelling when the source was a colour name. */
  name?: string
}

/**
 * The XNA `Color` named constants, which are the HTML colour names plus
 * `TransparentBlack`. Stored as one packed table so the list stays complete
 * without 150 lines of object literal.
 */
const NAMED_COLOR_TABLE = [
  'AliceBlue:F0F8FF,AntiqueWhite:FAEBD7,Aqua:00FFFF,Aquamarine:7FFFD4,Azure:F0FFFF,Beige:F5F5DC',
  'Bisque:FFE4C4,Black:000000,BlanchedAlmond:FFEBCD,Blue:0000FF,BlueViolet:8A2BE2,Brown:A52A2A',
  'BurlyWood:DEB887,CadetBlue:5F9EA0,Chartreuse:7FFF00,Chocolate:D2691E,Coral:FF7F50,CornflowerBlue:6495ED',
  'Cornsilk:FFF8DC,Crimson:DC143C,Cyan:00FFFF,DarkBlue:00008B,DarkCyan:008B8B,DarkGoldenrod:B8860B',
  'DarkGray:A9A9A9,DarkGreen:006400,DarkKhaki:BDB76B,DarkMagenta:8B008B,DarkOliveGreen:556B2F,DarkOrange:FF8C00',
  'DarkOrchid:9932CC,DarkRed:8B0000,DarkSalmon:E9967A,DarkSeaGreen:8FBC8F,DarkSlateBlue:483D8B,DarkSlateGray:2F4F4F',
  'DarkTurquoise:00CED1,DarkViolet:9400D3,DeepPink:FF1493,DeepSkyBlue:00BFFF,DimGray:696969,DodgerBlue:1E90FF',
  'Firebrick:B22222,FloralWhite:FFFAF0,ForestGreen:228B22,Fuchsia:FF00FF,Gainsboro:DCDCDC,GhostWhite:F8F8FF',
  'Gold:FFD700,Goldenrod:DAA520,Gray:808080,Green:008000,GreenYellow:ADFF2F,Honeydew:F0FFF0',
  'HotPink:FF69B4,IndianRed:CD5C5C,Indigo:4B0082,Ivory:FFFFF0,Khaki:F0E68C,Lavender:E6E6FA',
  'LavenderBlush:FFF0F5,LawnGreen:7CFC00,LemonChiffon:FFFACD,LightBlue:ADD8E6,LightCoral:F08080,LightCyan:E0FFFF',
  'LightGoldenrodYellow:FAFAD2,LightGray:D3D3D3,LightGreen:90EE90,LightPink:FFB6C1,LightSalmon:FFA07A,LightSeaGreen:20B2AA',
  'LightSkyBlue:87CEFA,LightSlateGray:778899,LightSteelBlue:B0C4DE,LightYellow:FFFFE0,Lime:00FF00,LimeGreen:32CD32',
  'Linen:FAF0E6,Magenta:FF00FF,Maroon:800000,MediumAquamarine:66CDAA,MediumBlue:0000CD,MediumOrchid:BA55D3',
  'MediumPurple:9370DB,MediumSeaGreen:3CB371,MediumSlateBlue:7B68EE,MediumSpringGreen:00FA9A,MediumTurquoise:48D1CC',
  'MediumVioletRed:C71585,MidnightBlue:191970,MintCream:F5FFFA,MistyRose:FFE4E1,Moccasin:FFE4B5,NavajoWhite:FFDEAD',
  'Navy:000080,OldLace:FDF5E6,Olive:808000,OliveDrab:6B8E23,Orange:FFA500,OrangeRed:FF4500',
  'Orchid:DA70D6,PaleGoldenrod:EEE8AA,PaleGreen:98FB98,PaleTurquoise:AFEEEE,PaleVioletRed:DB7093,PapayaWhip:FFEFD5',
  'PeachPuff:FFDAB9,Peru:CD853F,Pink:FFC0CB,Plum:DDA0DD,PowderBlue:B0E0E6,Purple:800080',
  'Red:FF0000,RosyBrown:BC8F8F,RoyalBlue:4169E1,SaddleBrown:8B4513,Salmon:FA8072,SandyBrown:F4A460',
  'SeaGreen:2E8B57,SeaShell:FFF5EE,Sienna:A0522D,Silver:C0C0C0,SkyBlue:87CEEB,SlateBlue:6A5ACD',
  'SlateGray:708090,Snow:FFFAFA,SpringGreen:00FF7F,SteelBlue:4682B4,Tan:D2B48C,Teal:008080',
  'Thistle:D8BFD8,Tomato:FF6347,Turquoise:40E0D0,Violet:EE82EE,Wheat:F5DEB3,White:FFFFFF',
  'WhiteSmoke:F5F5F5,Yellow:FFFF00,YellowGreen:9ACD32',
].join(',')

function buildNamedColors(): Map<string, string> {
  const entries = new Map<string, string>()
  for (const pair of NAMED_COLOR_TABLE.split(',')) {
    const [name, hex] = pair.split(':')
    if (name && hex) {
      entries.set(name, hex)
    }
  }
  return entries
}

const NAMED_COLORS = buildNamedColors()
const NAMED_COLORS_BY_LOWER = new Map([...NAMED_COLORS].map(([name, hex]) => [name.toLowerCase(), { name, hex }]))

/** Every colour name the game accepts, in catalog order. */
export const COLOR_NAMES: readonly string[] = [...NAMED_COLORS.keys()]

/** Palette offered by the visual control before the author picks an exact colour. */
export const COLOR_SWATCH_PRESETS: readonly string[] = [
  'White',
  'Black',
  'Red',
  'OrangeRed',
  'Orange',
  'Gold',
  'Yellow',
  'YellowGreen',
  'Lime',
  'Green',
  'Teal',
  'Cyan',
  'DeepSkyBlue',
  'Blue',
  'BlueViolet',
  'Purple',
  'Magenta',
  'HotPink',
  'Pink',
  'SaddleBrown',
  'Tan',
  'Gray',
]

function clampChannel(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(255, Math.max(0, Math.round(value)))
}

function parseHex(raw: string): ColorRgb | null {
  const hex = raw.startsWith('#') ? raw.slice(1) : raw
  if (!/^[0-9a-f]+$/iu.test(hex)) {
    return null
  }
  if (hex.length === 3 || hex.length === 4) {
    // Shorthand hex repeats each nibble: `#f80` reads as `#ff8800`.
    const channels = [0, 1, 2, 3].map((offset) =>
      offset < hex.length ? Number.parseInt(hex.slice(offset, offset + 1).repeat(2), 16) : 255,
    )
    return { r: channels[0] ?? 0, g: channels[1] ?? 0, b: channels[2] ?? 0, a: channels[3] ?? 255 }
  }
  if (hex.length === 6 || hex.length === 8) {
    const channels = [0, 2, 4, 6].map((offset) => (offset < hex.length ? Number.parseInt(hex.slice(offset, offset + 2), 16) : 255))
    return { r: channels[0] ?? 0, g: channels[1] ?? 0, b: channels[2] ?? 0, a: channels[3] ?? 255 }
  }
  return null
}

/** Parses a game colour string, or null when the spelling is not one the game reads. */
export function parseColorValue(value: unknown): ParsedColorValue | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (trimmed === '') {
    return null
  }

  const named = NAMED_COLORS_BY_LOWER.get(trimmed.toLowerCase())
  if (named) {
    const color = parseHex(named.hex)
    return color ? { color, format: 'name', name: named.name } : null
  }

  if (trimmed.startsWith('#')) {
    const color = parseHex(trimmed)
    return color ? { color, format: 'hex' } : null
  }

  const separator = trimmed.includes(',') ? 'comma' : 'space'
  const parts = trimmed
    .split(separator === 'comma' ? /\s*,\s*/u : /\s+/u)
    .map((part) => part.trim())
    .filter((part) => part !== '')
  if (parts.length < 3 || parts.length > 4) {
    return null
  }
  const channels = parts.map((part) => (/^-?\d+$/u.test(part) ? Number(part) : Number.NaN))
  if (channels.some((channel) => !Number.isFinite(channel))) {
    return null
  }

  return {
    color: {
      r: clampChannel(channels[0] ?? 0),
      g: clampChannel(channels[1] ?? 0),
      b: clampChannel(channels[2] ?? 0),
      a: channels.length === 4 ? clampChannel(channels[3] ?? 255) : 255,
    },
    format: separator,
  }
}

/** Serializes a colour back into the requested game spelling. */
export function formatColorValue(color: ColorRgb, format: ColorValueFormat): string {
  const r = clampChannel(color.r)
  const g = clampChannel(color.g)
  const b = clampChannel(color.b)
  const a = clampChannel(color.a)

  if (format === 'hex') {
    const hex = [r, g, b].map((channel) => channel.toString(16).padStart(2, '0').toUpperCase()).join('')
    return a === 255 ? `#${hex}` : `#${hex}${a.toString(16).padStart(2, '0').toUpperCase()}`
  }

  if (format === 'name') {
    const match = colorNameFor({ r, g, b, a })
    if (match) {
      return match
    }
  }

  const channels = a === 255 ? [r, g, b] : [r, g, b, a]
  return channels.join(format === 'comma' ? ', ' : ' ')
}

/** Exact colour name for a value, or null when no named constant matches. */
export function colorNameFor(color: ColorRgb): string | null {
  if (clampChannel(color.a) !== 255) {
    return null
  }
  const hex = [color.r, color.g, color.b].map((channel) => clampChannel(channel).toString(16).padStart(2, '0').toUpperCase()).join('')
  for (const [name, namedHex] of NAMED_COLORS) {
    if (namedHex.toUpperCase() === hex) {
      return name
    }
  }
  return null
}

/** `#RRGGBB` for CSS, ignoring alpha (swatches render alpha separately). */
export function colorToCssHex(color: ColorRgb): string {
  return `#${[color.r, color.g, color.b].map((channel) => clampChannel(channel).toString(16).padStart(2, '0')).join('')}`
}

/** CSS colour including alpha, for preview surfaces. */
export function colorToCss(color: ColorRgb): string {
  const alpha = clampChannel(color.a) / 255
  if (alpha === 1) {
    return colorToCssHex(color)
  }
  const channels = [color.r, color.g, color.b].map((channel) => clampChannel(channel)).join(' ')
  return `rgb(${channels} / ${Number(alpha.toFixed(3))})`
}

/** Resolves a colour name or hex literal to channels; used by the preset palette. */
export function colorFromNameOrHex(value: string): ColorRgb | null {
  return parseColorValue(value)?.color ?? null
}

/** True when white text is more readable than black on the given colour. */
export function prefersLightForeground(color: ColorRgb): boolean {
  const luminance = (0.299 * clampChannel(color.r) + 0.587 * clampChannel(color.g) + 0.114 * clampChannel(color.b)) / 255
  return luminance < 0.55
}
