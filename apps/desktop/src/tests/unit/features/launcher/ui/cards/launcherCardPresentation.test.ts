import { describe, expect, it } from 'vite-plus/test'
import {
  getLauncherCardCoverWord,
  getLauncherCardFallbackPalette,
  getLauncherCardMonogram,
} from '@features/launcher/ui/cards/launcherCardPresentation'

describe('launcherCardPresentation', () => {
  it('builds a stable monogram from the mod title', () => {
    expect(getLauncherCardMonogram('No Cover Pack')).toBe('NCP')
    expect(getLauncherCardMonogram('Ui')).toBe('UI')
    expect(getLauncherCardMonogram('')).toBe('MOD')
  })

  it('selects a single featured cover word from the mod title', () => {
    expect(getLauncherCardCoverWord('No Cover Pack')).toBe('COVER')
    expect(getLauncherCardCoverWord('NPC Adventures')).toBe('ADVENTURES')
    expect(getLauncherCardCoverWord('Ui')).toBe('UI')
  })

  it('returns a deterministic hsl fallback palette from the mod title', () => {
    const first = getLauncherCardFallbackPalette('NPC Adventures')
    const second = getLauncherCardFallbackPalette('NPC Adventures')
    const other = getLauncherCardFallbackPalette('Seasonal Outfits')

    expect(first).toEqual(second)
    expect(first.hue).toBeGreaterThanOrEqual(0)
    expect(first.hue).toBeLessThan(360)
    expect(first.bright.startsWith('hsl(')).toBe(true)
    expect(first.base.startsWith('hsl(')).toBe(true)
    expect(first.dark.startsWith('hsl(')).toBe(true)
    expect(first.edge.startsWith('hsla(')).toBe(true)
    expect(first.glow.startsWith('hsla(')).toBe(true)
    expect(first.shadow.startsWith('hsla(')).toBe(true)
    expect(other.base).not.toBe(first.base)
  })
})
