/**
 * Shared loading motion contract for page-level presentation.
 *
 * Lifecycle stages, motion style/intensity/speed, preference shape, page
 * reveal metadata, and anchor declarations — all pure data, no rendering.
 */

/* ------------------------------------------------------------------ */
/*  Lifecycle stages                                                   */
/* ------------------------------------------------------------------ */

/**
 * The five lifecycle stages a page-level loading presentation passes through.
 *
 * - `idle`: No loading activity — page is either not mounted or fully settled.
 * - `entering`: Page is mounting or transitioning in — shared loading layer
 *   may present an initial entrance animation.
 * - `loading`: Page content is actively being fetched or prepared — the
 *   shared loading layer shows the appropriate motion style.
 * - `ready`: All content is ready — the shared layer begins the reveal
 *   sequence.
 * - `exiting`: Page is being replaced or unmounted — the shared layer may
 *   run a brief exit animation before the next page takes over.
 */
export type LoadingMotionStage = 'idle' | 'entering' | 'loading' | 'ready' | 'exiting'

/* ------------------------------------------------------------------ */
/*  Style identifiers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Stable internal id for each motion style.
 *
 * Maps to product-facing labels:
 * - `bounceIn`  → `跳动出现`
 * - `layeredFadeIn` → `层叠浮现`
 * - `slideInPush` → `滑入推进`
 * - `softFadeIn` → `柔和淡入`
 * - `quietSimplify` → `静默简化`
 */
export type LoadingMotionStyleId = 'bounceIn' | 'layeredFadeIn' | 'slideInPush' | 'softFadeIn' | 'quietSimplify'

/** All valid style ids in a stable array (deterministic iteration order). */
export const LOADING_MOTION_STYLE_IDS: LoadingMotionStyleId[] = [
  'bounceIn',
  'layeredFadeIn',
  'slideInPush',
  'softFadeIn',
  'quietSimplify',
] as const

/** Product-facing label metadata for each style id. */
export type LoadingMotionStyleLabelEntry = {
  id: LoadingMotionStyleId
  labelZh: string
  labelEn: string
}

/** Stable label mapping data — used by settings UI in Phase 2. */
export const LOADING_MOTION_STYLE_LABELS: LoadingMotionStyleLabelEntry[] = [
  { id: 'bounceIn', labelZh: '跳动出现', labelEn: 'Bounce In' },
  { id: 'layeredFadeIn', labelZh: '层叠浮现', labelEn: 'Layered Fade' },
  { id: 'slideInPush', labelZh: '滑入推进', labelEn: 'Slide In' },
  { id: 'softFadeIn', labelZh: '柔和淡入', labelEn: 'Soft Fade' },
  { id: 'quietSimplify', labelZh: '静默简化', labelEn: 'Quiet' },
] as const

/* ------------------------------------------------------------------ */
/*  Intensity identifiers                                              */
/* ------------------------------------------------------------------ */

/**
 * Stable internal id for each motion intensity level.
 *
 * - `light`: Subtle motion — minimal displacement and duration
 * - `standard`: Default intensity — balanced motion feel
 * - `strong`: More pronounced motion — larger displacement / longer duration
 */
export type LoadingMotionIntensityId = 'light' | 'standard' | 'strong'

/** All valid intensity ids in a stable array. */
export const LOADING_MOTION_INTENSITY_IDS: LoadingMotionIntensityId[] = [
  'light',
  'standard',
  'strong',
] as const

export type LoadingMotionIntensityLabelEntry = {
  id: LoadingMotionIntensityId
  labelZh: string
  labelEn: string
}

export const LOADING_MOTION_INTENSITY_LABELS: LoadingMotionIntensityLabelEntry[] = [
  { id: 'light', labelZh: '轻', labelEn: 'Light' },
  { id: 'standard', labelZh: '标准', labelEn: 'Standard' },
  { id: 'strong', labelZh: '强', labelEn: 'Strong' },
] as const

/* ------------------------------------------------------------------ */
/*  Speed identifiers                                                 */
/* ------------------------------------------------------------------ */

export type LoadingMotionSpeedId = 'slow' | 'standard' | 'fast'

export type LoadingMotionSpeedMode = 'preset' | 'custom'

export const LOADING_MOTION_SPEED_IDS: LoadingMotionSpeedId[] = [
  'slow',
  'standard',
  'fast',
] as const

export type LoadingMotionSpeedLabelEntry = {
  id: LoadingMotionSpeedId
  labelZh: string
  labelEn: string
}

export const LOADING_MOTION_SPEED_LABELS: LoadingMotionSpeedLabelEntry[] = [
  { id: 'slow', labelZh: '慢', labelEn: 'Slow' },
  { id: 'standard', labelZh: '标准', labelEn: 'Standard' },
  { id: 'fast', labelZh: '快', labelEn: 'Fast' },
] as const

/* ------------------------------------------------------------------ */
/*  Preference and resolved config                                     */
/* ------------------------------------------------------------------ */

/**
 * User-persisted loading motion preference.
 *
 * Both fields are independent — changing intensity does not change style,
 * and vice versa. Validation/normalization is handled by helpers in
 * `@shared/lib/loading-motion`.
 */
export type LoadingMotionPreference = {
  styleId: LoadingMotionStyleId
  intensityId: LoadingMotionIntensityId
  speedMode: LoadingMotionSpeedMode
  speedId: LoadingMotionSpeedId
  speedMultiplier: number
}

/**
 * Fully resolved loading motion config for a single page load.
 *
 * The resolved config applies the user preference, reduced-motion override,
 * and any page-specific overrides in a single pass.
 *
 * - `styleId` / `intensityId`: The effective style and intensity after
 *   all resolution rules are applied.
 * - `revealOrder`: Optional page-declared reveal priority. When absent,
 *   the shared layer falls back to top-to-bottom reveal order.
 * - `anchors`: Page-declared anchor components — at most 2. Anchors are
 *   revealed ahead of the default reveal flow.
 * - `reducedMotion`: `true` if the system or platform prefers reduced motion.
 *   When true, the resolved style is `quietSimplify` and intensity is `light`.
 */
export type ResolvedLoadingMotionConfig = {
  styleId: LoadingMotionStyleId
  intensityId: LoadingMotionIntensityId
  speedMode: LoadingMotionSpeedMode
  speedId: LoadingMotionSpeedId
  speedMultiplier: number
  revealOrder: readonly string[] | null
  anchors: readonly [string, string?]
  reducedMotion: boolean
}

/* ------------------------------------------------------------------ */
/*  Reveal metadata                                                    */
/* ------------------------------------------------------------------ */

/**
 * Metadata for a single revealable item within a page.
 *
 * - `itemId`: Stable identifier for the item (component key or slot name).
 * - `priority`: Lower number = earlier reveal. Items with the same priority
 *   reveal simultaneously. When absent, items default to top-to-bottom order.
 * - `ready`: Whether this item is already ready to reveal. Ready items may
 *   appear ahead of slower items with higher priority.
 */
export type RevealItemMetadata = {
  itemId: string
  priority?: number
  ready?: boolean
}

/* ------------------------------------------------------------------ */
/*  Page anchor declaration                                            */
/* ------------------------------------------------------------------ */

/**
 * Page-declared anchor components.
 *
 * Anchors are a small exception to the default reveal flow — they are
 * revealed first, before the main reveal order. A page may declare at
 * most 2 anchors.
 *
 * - `anchorIds`: Array of component/slot identifiers — validated to be
 *   at most 2 entries.
 */
export type PageAnchorDeclaration = {
  anchorIds: readonly string[]
}
