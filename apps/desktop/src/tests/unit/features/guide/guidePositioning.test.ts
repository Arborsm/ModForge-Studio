import { describe, expect, it } from 'vite-plus/test'
import { resolveGuideCardLayout, type GuideCardLayoutInput } from '@features/guide'

const viewport = { width: 1280, height: 800 }

function layout(overrides: Partial<GuideCardLayoutInput>): ReturnType<typeof resolveGuideCardLayout> {
  return resolveGuideCardLayout({
    anchorRect: { top: 100, left: 400, width: 200, height: 50 },
    cardSize: { width: 340, height: 200 },
    placement: 'bottom',
    viewport,
    titlebarHeight: 40,
    gap: 12,
    ...overrides,
  })
}

describe('resolveGuideCardLayout', () => {
  it('places the card below the anchor when bottom space fits', () => {
    const result = layout({})
    expect(result.effectivePlacement).toBe('bottom')
    expect(result.top).toBe(162) // 100 + 50 + 12
    expect(result.left).toBe(330) // 400 + 100 - 170
    expect(result.arrow).toEqual({ side: 'top', offset: 170 }) // anchor center x (500) - left (330)
  })

  it('flips bottom to top when the space below does not fit', () => {
    const result = layout({ anchorRect: { top: 700, left: 400, width: 200, height: 50 } })
    expect(result.effectivePlacement).toBe('top')
    expect(result.top).toBe(488) // 700 - 200 - 12
    expect(result.arrow?.side).toBe('bottom')
  })

  it('flips top to bottom when the space above does not fit', () => {
    const result = layout({ placement: 'top', anchorRect: { top: 60, left: 400, width: 200, height: 50 } })
    expect(result.effectivePlacement).toBe('bottom')
    expect(result.top).toBe(122) // 60 + 50 + 12
  })

  it('flips right to left when the space on the right does not fit', () => {
    const result = layout({ placement: 'right', anchorRect: { top: 300, left: 1100, width: 100, height: 50 } })
    expect(result.effectivePlacement).toBe('left')
    expect(result.left).toBe(748) // 1100 - 340 - 12
    expect(result.arrow).toEqual({ side: 'right', offset: 100 }) // anchor center y (325) - top (225)
  })

  it('keeps the requested side when it fits', () => {
    const result = layout({ placement: 'left', anchorRect: { top: 300, left: 500, width: 100, height: 50 } })
    expect(result.effectivePlacement).toBe('left')
    expect(result.left).toBe(148) // 500 - 340 - 12
    expect(result.arrow?.side).toBe('right')
  })

  it('picks the roomier side and clamps into the viewport when neither side fits', () => {
    const result = layout({
      anchorRect: { top: 350, left: 400, width: 200, height: 50 },
      cardSize: { width: 340, height: 400 },
    })
    expect(result.effectivePlacement).toBe('bottom')
    expect(result.top).toBe(388) // clamped to viewport 800 - 400 - 12
  })

  it('never covers the titlebar when clamping a top placement', () => {
    const result = layout({
      placement: 'top',
      anchorRect: { top: 650, left: 400, width: 200, height: 50 },
      cardSize: { width: 340, height: 700 },
    })
    expect(result.effectivePlacement).toBe('top')
    expect(result.top).toBe(52) // titlebar 40 + gap 12
  })

  it('clamps the card horizontally inside the viewport', () => {
    const result = layout({ anchorRect: { top: 100, left: 1150, width: 120, height: 50 } })
    expect(result.left).toBe(928) // viewport 1280 - card 340 - gap 12
  })

  it('clamps the arrow offset away from the card corners', () => {
    const result = layout({ anchorRect: { top: 100, left: 0, width: 40, height: 50 } })
    expect(result.left).toBe(12)
    // Anchor center (20) would put the arrow at offset 8; the corner margin wins.
    expect(result.arrow?.offset).toBe(16)
  })

  it('centers the card without an arrow when there is no anchor', () => {
    const result = layout({ anchorRect: null, placement: 'center' })
    expect(result.effectivePlacement).toBe('center')
    expect(result.top).toBe(300) // (800 - 200) / 2
    expect(result.left).toBe(470) // (1280 - 340) / 2
    expect(result.arrow).toBeNull()
  })

  it('centers the card for center placement even with an anchor rect', () => {
    const result = layout({ placement: 'center' })
    expect(result.effectivePlacement).toBe('center')
    expect(result.arrow).toBeNull()
  })
})
