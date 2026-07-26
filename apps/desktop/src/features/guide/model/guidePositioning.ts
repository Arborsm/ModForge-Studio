import type { GuideStepPlacement } from '@shared/contracts'

export type GuideAnchorRect = {
  top: number
  left: number
  width: number
  height: number
}

export type GuideCardSize = {
  width: number
  height: number
}

/** Arrow rendered on one card edge, pointing back at the anchor. */
export type GuideCardArrow = {
  /** Card edge the arrow sits on (opposite of the effective placement). */
  side: 'top' | 'bottom' | 'left' | 'right'
  /** Distance in px from the card's left (top/bottom arrows) or top (left/right arrows). */
  offset: number
}

export type GuideCardLayout = {
  top: number
  left: number
  /** Placement actually used after auto-flip; equals the requested placement when it fits. */
  effectivePlacement: GuideStepPlacement
  /** Null for centered (anchorless) cards. */
  arrow: GuideCardArrow | null
}

export type GuideCardLayoutInput = {
  /** Viewport-relative anchor bounds; null renders a centered card. */
  anchorRect: GuideAnchorRect | null
  /** Measured card size (never estimated). */
  cardSize: GuideCardSize
  placement: GuideStepPlacement
  viewport: { width: number; height: number }
  /** Height of the app titlebar; the card never covers window controls. */
  titlebarHeight: number
  /** Minimum gap between card and anchor / viewport edges. */
  gap: number
}

/** Keeps the arrow clear of the card's rounded corners. */
const ARROW_MARGIN = 16

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function centeredLayout(input: GuideCardLayoutInput): GuideCardLayout {
  const { cardSize, viewport, titlebarHeight, gap } = input
  const minTop = titlebarHeight + gap
  return {
    top: Math.max(minTop, (viewport.height - cardSize.height) / 2),
    left: Math.max(gap, (viewport.width - cardSize.width) / 2),
    effectivePlacement: 'center',
    arrow: null,
  }
}

/**
 * Resolves the on-screen layout for a guide step card from the measured card
 * size and anchor rect. Flips top/bottom (or left/right) when the requested
 * side lacks room and the opposite side fits; when neither fits, picks the
 * roomier side and clamps the card into the viewport.
 */
export function resolveGuideCardLayout(input: GuideCardLayoutInput): GuideCardLayout {
  const { anchorRect, cardSize, placement, viewport, titlebarHeight, gap } = input
  if (!anchorRect || placement === 'center') {
    return centeredLayout(input)
  }

  const minTop = titlebarHeight + gap
  const maxTop = viewport.height - cardSize.height - gap
  const maxLeft = viewport.width - cardSize.width - gap
  const anchorCenterX = anchorRect.left + anchorRect.width / 2
  const anchorCenterY = anchorRect.top + anchorRect.height / 2
  const centeredLeft = clamp(anchorCenterX - cardSize.width / 2, gap, maxLeft)
  const centeredTop = clamp(anchorCenterY - cardSize.height / 2, minTop, maxTop)

  const arrowFor = (side: GuideCardArrow['side'], offset: number, span: number): GuideCardArrow => ({
    side,
    offset: clamp(offset, ARROW_MARGIN, Math.max(ARROW_MARGIN, span - ARROW_MARGIN)),
  })

  if (placement === 'top' || placement === 'bottom') {
    const spaceAbove = anchorRect.top - titlebarHeight - gap
    const spaceBelow = viewport.height - (anchorRect.top + anchorRect.height) - gap
    const fits = (space: number) => space >= cardSize.height + gap
    let effective = placement
    if (!fits(placement === 'top' ? spaceAbove : spaceBelow) && fits(placement === 'top' ? spaceBelow : spaceAbove)) {
      effective = placement === 'top' ? 'bottom' : 'top'
    } else if (!fits(spaceAbove) && !fits(spaceBelow)) {
      effective = spaceBelow >= spaceAbove ? 'bottom' : 'top'
    }

    const top =
      effective === 'top'
        ? clamp(anchorRect.top - cardSize.height - gap, minTop, maxTop)
        : clamp(anchorRect.top + anchorRect.height + gap, minTop, maxTop)
    return {
      top,
      left: centeredLeft,
      effectivePlacement: effective,
      arrow: arrowFor(effective === 'top' ? 'bottom' : 'top', anchorCenterX - centeredLeft, cardSize.width),
    }
  }

  const spaceLeft = anchorRect.left - gap
  const spaceRight = viewport.width - (anchorRect.left + anchorRect.width) - gap
  const fits = (space: number) => space >= cardSize.width + gap
  let effective = placement
  if (!fits(placement === 'left' ? spaceLeft : spaceRight) && fits(placement === 'left' ? spaceRight : spaceLeft)) {
    effective = placement === 'left' ? 'right' : 'left'
  } else if (!fits(spaceLeft) && !fits(spaceRight)) {
    effective = spaceRight >= spaceLeft ? 'right' : 'left'
  }

  const left =
    effective === 'left'
      ? clamp(anchorRect.left - cardSize.width - gap, gap, maxLeft)
      : clamp(anchorRect.left + anchorRect.width + gap, gap, maxLeft)
  return {
    top: centeredTop,
    left,
    effectivePlacement: effective,
    arrow: arrowFor(effective === 'left' ? 'right' : 'left', anchorCenterY - centeredTop, cardSize.height),
  }
}
