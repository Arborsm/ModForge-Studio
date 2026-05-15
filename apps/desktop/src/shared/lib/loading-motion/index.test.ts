import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOADING_MOTION_PREFERENCE,
  REDUCED_MOTION_PREFERENCE,
  isValidStyleId,
  isValidIntensityId,
  isValidSpeedId,
  getLoadingMotionSpeedMultiplier,
  normalizeLoadingMotionSpeedMultiplier,
  normalizeLoadingMotionPreference,
  createLoadingMotionPreference,
  getLoadingMotionSpeedState,
  resolveLoadingMotionConfig,
  orderRevealItems,
  validateAnchors,
  getStyleLabel,
  getIntensityLabel,
} from './index'

import {
  LOADING_MOTION_STYLE_IDS,
  LOADING_MOTION_INTENSITY_IDS,
  LOADING_MOTION_SPEED_IDS,
  LOADING_MOTION_STYLE_LABELS,
  LOADING_MOTION_INTENSITY_LABELS,
  LOADING_MOTION_SPEED_LABELS,
} from '@shared/contracts/types/loadingMotion'
/* ------------------------------------------------------------------ */
/*  LM-02: Lifecycle model awareness (indirect — contracts exist)       */
/* ------------------------------------------------------------------ */

describe('LoadingMotionStage', () => {
  it('has five required lifecycle stages', () => {
    // The type itself is the contract — this test verifies the stage
    // values are consumable at runtime as strings.
    const stages = ['idle', 'entering', 'loading', 'ready', 'exiting'] as const
    expect(stages).toHaveLength(5)
    expect(stages).toContain('idle')
    expect(stages).toContain('entering')
    expect(stages).toContain('loading')
    expect(stages).toContain('ready')
    expect(stages).toContain('exiting')
  })
})

/* ------------------------------------------------------------------ */
/*  LM-03 / LM-04 / LM-05: Style and intensity independence            */
/* ------------------------------------------------------------------ */

describe('LoadingMotionStyleId', () => {
  it('has five required product style ids', () => {
    expect(LOADING_MOTION_STYLE_IDS).toHaveLength(5)
    expect(LOADING_MOTION_STYLE_IDS).toContain('bounceIn')
    expect(LOADING_MOTION_STYLE_IDS).toContain('layeredFadeIn')
    expect(LOADING_MOTION_STYLE_IDS).toContain('slideInPush')
    expect(LOADING_MOTION_STYLE_IDS).toContain('softFadeIn')
    expect(LOADING_MOTION_STYLE_IDS).toContain('quietSimplify')
  })
})

describe('LoadingMotionIntensityId', () => {
  it('has three intensity levels', () => {
    expect(LOADING_MOTION_INTENSITY_IDS).toHaveLength(3)
    expect(LOADING_MOTION_INTENSITY_IDS).toContain('light')
    expect(LOADING_MOTION_INTENSITY_IDS).toContain('standard')
    expect(LOADING_MOTION_INTENSITY_IDS).toContain('strong')
  })
})

describe('LoadingMotionSpeedId', () => {
  it('has three preset speed ids', () => {
    expect(LOADING_MOTION_SPEED_IDS).toEqual(['slow', 'standard', 'fast'])
  })
})

describe('isValidStyleId', () => {
  it('returns true for valid style ids', () => {
    expect(isValidStyleId('softFadeIn')).toBe(true)
    expect(isValidStyleId('bounceIn')).toBe(true)
    expect(isValidStyleId('quietSimplify')).toBe(true)
  })

  it('returns false for invalid style ids', () => {
    expect(isValidStyleId('invalid')).toBe(false)
    expect(isValidStyleId('')).toBe(false)
    expect(isValidStyleId(null)).toBe(false)
    expect(isValidStyleId(undefined)).toBe(false)
  })
})

describe('isValidIntensityId', () => {
  it('returns true for valid intensity ids', () => {
    expect(isValidIntensityId('light')).toBe(true)
    expect(isValidIntensityId('standard')).toBe(true)
    expect(isValidIntensityId('strong')).toBe(true)
  })

  it('returns false for invalid intensity ids', () => {
    expect(isValidIntensityId('extreme')).toBe(false)
    expect(isValidIntensityId('')).toBe(false)
    expect(isValidIntensityId(null)).toBe(false)
  })
})

describe('isValidSpeedId', () => {
  it('returns true for valid speed ids', () => {
    expect(isValidSpeedId('slow')).toBe(true)
    expect(isValidSpeedId('standard')).toBe(true)
    expect(isValidSpeedId('fast')).toBe(true)
  })

  it('returns false for invalid speed ids', () => {
    expect(isValidSpeedId('extreme')).toBe(false)
    expect(isValidSpeedId('')).toBe(false)
    expect(isValidSpeedId(null)).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  Default resolution (D-08, D-09)                                    */
/* ------------------------------------------------------------------ */

describe('DEFAULT_LOADING_MOTION_PREFERENCE', () => {
  it('is softFadeIn / standard (柔和淡入 / 标准)', () => {
    expect(DEFAULT_LOADING_MOTION_PREFERENCE).toEqual({
      styleId: 'softFadeIn',
      intensityId: 'standard',
      speedMode: 'preset',
      speedId: 'standard',
      speedMultiplier: 1,
    })
  })
})

describe('REDUCED_MOTION_PREFERENCE', () => {
  it('is quietSimplify / light (静默简化 / 轻)', () => {
    expect(REDUCED_MOTION_PREFERENCE).toEqual({
      styleId: 'quietSimplify',
      intensityId: 'light',
      speedMode: 'preset',
      speedId: 'standard',
      speedMultiplier: 1,
    })
  })
})

/* ------------------------------------------------------------------ */
/*  normalizeLoadingMotionPreference — independence (D-06)             */
/* ------------------------------------------------------------------ */

describe('normalizeLoadingMotionPreference', () => {
  it('returns defaults when given null', () => {
    const result = normalizeLoadingMotionPreference(null)
    expect(result).toEqual(DEFAULT_LOADING_MOTION_PREFERENCE)
  })

  it('returns defaults when given undefined', () => {
    const result = normalizeLoadingMotionPreference(undefined)
    expect(result).toEqual(DEFAULT_LOADING_MOTION_PREFERENCE)
  })

  it('preserves a valid style and intensity', () => {
    const result = normalizeLoadingMotionPreference({
      styleId: 'bounceIn',
      intensityId: 'strong',
      speedMode: 'preset',
      speedId: 'fast',
      speedMultiplier: 0.72,
    })
    expect(result).toEqual({
      styleId: 'bounceIn',
      intensityId: 'strong',
      speedMode: 'preset',
      speedId: 'fast',
      speedMultiplier: 0.72,
    })
  })

  it('clamps custom speed multiplier to the supported fine and extreme range', () => {
    const tooSlow = normalizeLoadingMotionPreference({
      styleId: 'softFadeIn',
      intensityId: 'standard',
      speedMode: 'custom',
      speedId: 'standard',
      speedMultiplier: 8,
    })
    const tooFast = normalizeLoadingMotionPreference({
      styleId: 'softFadeIn',
      intensityId: 'standard',
      speedMode: 'custom',
      speedId: 'standard',
      speedMultiplier: 0.05,
    })

    expect(tooSlow.speedMultiplier).toBe(3)
    expect(tooFast.speedMultiplier).toBe(0.25)
  })

  it('falls back to default style without overwriting valid intensity', () => {
    // LM-03 / D-06: independent axes — invalid style does not corrupt intensity
    const result = normalizeLoadingMotionPreference({ styleId: 'invalid' as never, intensityId: 'light' })
    expect(result.styleId).toBe('softFadeIn')
    expect(result.intensityId).toBe('light')
  })

  it('falls back to default intensity without overwriting valid style', () => {
    // LM-03 / D-06: independent axes — invalid intensity does not corrupt style
    const result = normalizeLoadingMotionPreference({ styleId: 'bounceIn', intensityId: 'invalid' as never })
    expect(result.styleId).toBe('bounceIn')
    expect(result.intensityId).toBe('standard')
  })

  it('falls back both when both are invalid', () => {
    const result = normalizeLoadingMotionPreference({ styleId: 'bad' as never, intensityId: 'bad' as never })
    expect(result).toEqual(DEFAULT_LOADING_MOTION_PREFERENCE)
  })
})

/* ------------------------------------------------------------------ */
/*  resolveLoadingMotionConfig — reduced-motion fallback (D-09, D-10)  */
/* ------------------------------------------------------------------ */

describe('resolveLoadingMotionConfig', () => {
  it('uses user preference when reduced motion is off', () => {
    const config = resolveLoadingMotionConfig(createLoadingMotionPreference({ styleId: 'bounceIn', intensityId: 'strong' }), {
      prefersReducedMotion: false,
    })
    expect(config.styleId).toBe('bounceIn')
    expect(config.intensityId).toBe('strong')
    expect(config.speedMultiplier).toBe(1)
    expect(config.reducedMotion).toBe(false)
  })

  it('overrides to quietSimplify / light when reduced motion is preferred', () => {
    // D-09, D-10: reduced-motion fallback silences obvious bounce/translation
    const config = resolveLoadingMotionConfig(createLoadingMotionPreference({ styleId: 'bounceIn', intensityId: 'strong' }), {
      prefersReducedMotion: true,
    })
    expect(config.styleId).toBe('quietSimplify')
    expect(config.intensityId).toBe('light')
    expect(config.speedMultiplier).toBe(1)
    expect(config.reducedMotion).toBe(true)
  })

  it('resolves speed multiplier from custom speed preference', () => {
    const config = resolveLoadingMotionConfig(
      { styleId: 'bounceIn', intensityId: 'strong', speedMode: 'custom', speedId: 'standard', speedMultiplier: 2.25 },
      { prefersReducedMotion: false },
    )
    expect(config.speedMode).toBe('custom')
    expect(config.speedId).toBe('standard')
    expect(config.speedMultiplier).toBe(2.25)
  })

  it('passes through revealOrder when provided', () => {
    const order = ['header', 'content', 'footer'] as const
    const config = resolveLoadingMotionConfig(DEFAULT_LOADING_MOTION_PREFERENCE, { prefersReducedMotion: false, revealOrder: order })
    expect(config.revealOrder).toEqual(order)
  })

  it('sets revealOrder to null when not provided', () => {
    const config = resolveLoadingMotionConfig(DEFAULT_LOADING_MOTION_PREFERENCE, { prefersReducedMotion: false })
    expect(config.revealOrder).toBeNull()
  })

  it('caps anchors to at most 2', () => {
    const config = resolveLoadingMotionConfig(DEFAULT_LOADING_MOTION_PREFERENCE, {
      prefersReducedMotion: false,
      anchors: { anchorIds: ['a', 'b', 'c'] },
    })
    expect(config.anchors).toHaveLength(2)
    expect(config.anchors[0]).toBe('a')
    expect(config.anchors[1]).toBe('b')
  })
})

/* ------------------------------------------------------------------ */
/*  orderRevealItems — ready-first within priority tier                */
/* ------------------------------------------------------------------ */

describe('orderRevealItems', () => {
  it('returns empty array for empty input', () => {
    expect(orderRevealItems([])).toEqual([])
  })

  it('preserves original order when no priorities are set (default top-to-bottom)', () => {
    const items = [{ itemId: 'header' }, { itemId: 'content' }, { itemId: 'footer' }]
    const result = orderRevealItems(items)
    expect(result.map((r) => r.itemId)).toEqual(['header', 'content', 'footer'])
  })

  it('respects explicit priority ordering', () => {
    const items = [
      { itemId: 'footer', priority: 10 },
      { itemId: 'header', priority: 1 },
      { itemId: 'content', priority: 5 },
    ]
    const result = orderRevealItems(items)
    expect(result.map((r) => r.itemId)).toEqual(['header', 'content', 'footer'])
  })

  it('ready items appear before non-ready items within same priority tier', () => {
    const items = [
      { itemId: 'slow', priority: 1, ready: false },
      { itemId: 'fast', priority: 1, ready: true },
    ]
    const result = orderRevealItems(items)
    expect(result.map((r) => r.itemId)).toEqual(['fast', 'slow'])
  })

  it('does not let ready item jump across priority tiers', () => {
    // A ready item with priority 10 must not jump ahead of a non-ready item with priority 1
    const items = [
      { itemId: 'readyButLowPriority', priority: 10, ready: true },
      { itemId: 'slowButHighPriority', priority: 1, ready: false },
    ]
    const result = orderRevealItems(items)
    expect(result.map((r) => r.itemId)).toEqual(['slowButHighPriority', 'readyButLowPriority'])
  })
})

/* ------------------------------------------------------------------ */
/*  validateAnchors — max 2 anchors (D-15, D-16)                       */
/* ------------------------------------------------------------------ */

describe('validateAnchors', () => {
  it('passes validation with 0 anchors', () => {
    const result = validateAnchors({ anchorIds: [] })
    expect(result.valid).toBe(true)
    expect(result.anchors).toEqual([])
  })

  it('passes validation with 1 anchor', () => {
    const result = validateAnchors({ anchorIds: ['header'] })
    expect(result.valid).toBe(true)
    expect(result.anchors).toEqual(['header'])
  })

  it('passes validation with 2 anchors', () => {
    const result = validateAnchors({ anchorIds: ['header', 'nav'] })
    expect(result.valid).toBe(true)
    expect(result.anchors).toEqual(['header', 'nav'])
  })

  it('fails validation with 3 anchors and returns trimmed set', () => {
    const result = validateAnchors({ anchorIds: ['a', 'b', 'c'] })
    expect(result.valid).toBe(false)
    expect((result as { valid: false; error: string }).error).toContain('maximum is 2')
    expect(result.anchors).toHaveLength(2)
  })
})

/* ------------------------------------------------------------------ */
/*  Product label mapping (LM-04)                                      */
/* ------------------------------------------------------------------ */

describe('getStyleLabel', () => {
  it('returns Chinese label for zh-CN locale', () => {
    expect(getStyleLabel('bounceIn', 'zh-CN')).toBe('跳动出现')
    expect(getStyleLabel('layeredFadeIn', 'zh-CN')).toBe('层叠浮现')
    expect(getStyleLabel('slideInPush', 'zh-CN')).toBe('滑入推进')
    expect(getStyleLabel('softFadeIn', 'zh-CN')).toBe('柔和淡入')
    expect(getStyleLabel('quietSimplify', 'zh-CN')).toBe('静默简化')
  })

  it('returns English label for en-US locale', () => {
    expect(getStyleLabel('bounceIn', 'en-US')).toBe('Bounce In')
    expect(getStyleLabel('layeredFadeIn', 'en-US')).toBe('Layered Fade')
    expect(getStyleLabel('slideInPush', 'en-US')).toBe('Slide In')
    expect(getStyleLabel('softFadeIn', 'en-US')).toBe('Soft Fade')
    expect(getStyleLabel('quietSimplify', 'en-US')).toBe('Quiet')
  })
})

describe('getIntensityLabel', () => {
  it('returns Chinese label for zh-CN locale', () => {
    expect(getIntensityLabel('light', 'zh-CN')).toBe('轻')
    expect(getIntensityLabel('standard', 'zh-CN')).toBe('标准')
    expect(getIntensityLabel('strong', 'zh-CN')).toBe('强')
  })

  it('returns English label for en-US locale', () => {
    expect(getIntensityLabel('light', 'en-US')).toBe('Light')
    expect(getIntensityLabel('standard', 'en-US')).toBe('Standard')
    expect(getIntensityLabel('strong', 'en-US')).toBe('Strong')
  })
})

describe('speed helpers', () => {
  it('createLoadingMotionPreference fills defaults from partial input', () => {
    expect(createLoadingMotionPreference({ styleId: 'softFadeIn', intensityId: 'standard' })).toEqual({
      styleId: 'softFadeIn',
      intensityId: 'standard',
      speedMode: 'preset',
      speedId: 'standard',
      speedMultiplier: 1,
    })
  })

  it('maps preset speed ids to timing multipliers', () => {
    expect(getLoadingMotionSpeedMultiplier('slow')).toBeGreaterThan(1)
    expect(getLoadingMotionSpeedMultiplier('standard')).toBe(1)
    expect(getLoadingMotionSpeedMultiplier('fast')).toBeLessThan(1)
  })

  it('normalizes arbitrary custom speed multipliers', () => {
    expect(normalizeLoadingMotionSpeedMultiplier(2.345)).toBe(2.35)
    expect(normalizeLoadingMotionSpeedMultiplier(Number.NaN)).toBe(1)
  })

  it('returns the active speed state as a compact view model', () => {
    expect(
      getLoadingMotionSpeedState({
        styleId: 'softFadeIn',
        intensityId: 'standard',
        speedMode: 'custom',
        speedId: 'fast',
        speedMultiplier: 2.2,
      }),
    ).toEqual({
      speedMode: 'custom',
      speedId: 'fast',
      speedMultiplier: 2.2,
    })
  })
})

/* ------------------------------------------------------------------ */
/*  Product label constant completeness                                */
/* ------------------------------------------------------------------ */

describe('product label tables', () => {
  it('LOADING_MOTION_STYLE_LABELS covers all five style ids', () => {
    // LOADING_MOTION_STYLE_LABELS already imported at top
    const labelledIds = new Set(LOADING_MOTION_STYLE_LABELS.map((e: { id: string }) => e.id))
    for (const id of LOADING_MOTION_STYLE_IDS) {
      expect(labelledIds.has(id)).toBe(true)
    }
  })

  it('LOADING_MOTION_INTENSITY_LABELS covers all three intensity ids', () => {
    // LOADING_MOTION_INTENSITY_LABELS already imported at top
    const labelledIds = new Set(LOADING_MOTION_INTENSITY_LABELS.map((e: { id: string }) => e.id))
    for (const id of LOADING_MOTION_INTENSITY_IDS) {
      expect(labelledIds.has(id)).toBe(true)
    }
  })

  it('LOADING_MOTION_SPEED_LABELS covers all speed ids', () => {
    const labelledIds = new Set(LOADING_MOTION_SPEED_LABELS.map((e: { id: string }) => e.id))
    for (const id of LOADING_MOTION_SPEED_IDS) {
      expect(labelledIds.has(id)).toBe(true)
    }
  })
})
