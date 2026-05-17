/**
 * Pure loading motion defaults and normalization helpers.
 *
 * No React, no rendering, no Tauri — pure data transforms that can be
 * tested without DOM or platform dependencies.
 */

import {
  type LoadingMotionStyleId,
  type LoadingMotionIntensityId,
  type LoadingMotionSpeedId,
  type LoadingMotionSpeedMode,
  type LoadingMotionPreference,
  type ResolvedLoadingMotionConfig,
  type RevealItemMetadata,
  type PageAnchorDeclaration,
  LOADING_MOTION_STYLE_IDS,
  LOADING_MOTION_INTENSITY_IDS,
  LOADING_MOTION_SPEED_IDS,
  LOADING_MOTION_STYLE_LABELS,
  LOADING_MOTION_INTENSITY_LABELS,
  LOADING_MOTION_SPEED_LABELS,
} from '@shared/contracts/types/loadingMotion'

/* ------------------------------------------------------------------ */
/*  Default preference                                                 */
/* ------------------------------------------------------------------ */

/** Default loading motion: `softFadeIn / standard` (柔和淡入 / 标准). */
export const DEFAULT_LOADING_MOTION_PREFERENCE: LoadingMotionPreference = {
  styleId: 'softFadeIn',
  intensityId: 'standard',
  speedMode: 'preset',
  speedId: 'standard',
  speedMultiplier: 1,
} as const

/* ------------------------------------------------------------------ */
/*  Style / intensity validation                                       */
/* ------------------------------------------------------------------ */

/** Returns `true` if the given value is a valid LoadingMotionStyleId. */
export function isValidStyleId(value: unknown): value is LoadingMotionStyleId {
  return LOADING_MOTION_STYLE_IDS.includes(value as LoadingMotionStyleId)
}

/** Returns `true` if the given value is a valid LoadingMotionIntensityId. */
export function isValidIntensityId(value: unknown): value is LoadingMotionIntensityId {
  return LOADING_MOTION_INTENSITY_IDS.includes(value as LoadingMotionIntensityId)
}

/** Returns true when the given value is a valid LoadingMotionSpeedId. */
export function isValidSpeedId(value: unknown): value is LoadingMotionSpeedId {
  return LOADING_MOTION_SPEED_IDS.includes(value as LoadingMotionSpeedId)
}

/** Returns true when the given value is a supported speed mode. */
export function isValidSpeedMode(value: unknown): value is LoadingMotionSpeedMode {
  return value === 'preset' || value === 'custom'
}

/** Resolves a preset loading motion speed into its numeric multiplier. */
export function getLoadingMotionSpeedMultiplier(speedId: LoadingMotionSpeedId): number {
  switch (speedId) {
    case 'slow':
      return 1.3
    case 'fast':
      return 0.72
    default:
      return 1
  }
}

/** Clamps and rounds a custom loading motion speed multiplier. */
export function normalizeLoadingMotionSpeedMultiplier(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 1
  }

  return Math.min(3, Math.max(0.25, Math.round(value * 100) / 100))
}

/* ------------------------------------------------------------------ */
/*  Preference normalization                                           */
/* ------------------------------------------------------------------ */

/**
 * Normalize a partial or potentially-invalid loading motion preference.
 *
 * Style and intensity are validated independently — an invalid style
 * falls back to the default without overwriting a valid intensity, and
 * vice versa. This keeps the two axes fully independent.
 */
export function normalizeLoadingMotionPreference(raw: Partial<LoadingMotionPreference> | null | undefined): LoadingMotionPreference {
  const speedMode = isValidSpeedMode(raw?.speedMode) ? raw.speedMode : DEFAULT_LOADING_MOTION_PREFERENCE.speedMode
  const speedId = isValidSpeedId(raw?.speedId) ? raw.speedId : DEFAULT_LOADING_MOTION_PREFERENCE.speedId
  const speedMultiplier =
    speedMode === 'custom' ? normalizeLoadingMotionSpeedMultiplier(raw?.speedMultiplier) : getLoadingMotionSpeedMultiplier(speedId)

  return {
    styleId: isValidStyleId(raw?.styleId) ? raw!.styleId : DEFAULT_LOADING_MOTION_PREFERENCE.styleId,
    intensityId: isValidIntensityId(raw?.intensityId) ? raw!.intensityId : DEFAULT_LOADING_MOTION_PREFERENCE.intensityId,
    speedMode,
    speedId,
    speedMultiplier,
  }
}

/** Creates a normalized loading motion preference from partial persisted input. */
export function createLoadingMotionPreference(raw: Partial<LoadingMotionPreference> | null | undefined): LoadingMotionPreference {
  return normalizeLoadingMotionPreference(raw)
}

/**
 * Resolve the effective loading motion config for a single page load.
 *
 * Applies the user preference and page-specific reveal metadata in a
 * single pass.
 */
export function resolveLoadingMotionConfig(
  userPreference: LoadingMotionPreference,
  options: {
    revealOrder?: readonly string[] | null
    anchors?: PageAnchorDeclaration | null
  },
): ResolvedLoadingMotionConfig {
  const normalizedAnchors = options.anchors?.anchorIds ?? []
  const safeAnchors = normalizedAnchors.slice(0, 2) as [string, string?]

  return {
    styleId: userPreference.styleId,
    intensityId: userPreference.intensityId,
    speedMode: userPreference.speedMode,
    speedId: userPreference.speedId,
    speedMultiplier: userPreference.speedMultiplier,
    revealOrder: options.revealOrder ?? null,
    anchors: safeAnchors,
  }
}

/** Extracts the speed-only state from a full loading motion preference. */
export function getLoadingMotionSpeedState(preference: LoadingMotionPreference) {
  return {
    speedMode: preference.speedMode,
    speedId: preference.speedId,
    speedMultiplier: preference.speedMultiplier,
  }
}

/* ------------------------------------------------------------------ */
/*  Reveal item ordering                                               */
/* ------------------------------------------------------------------ */

/**
 * Order reveal items for presentation.
 *
 * Rules:
 * 1. Ready items may appear ahead of slower items with matching priority.
 * 2. Items with lower `priority` number appear first.
 * 3. Items with the same `priority` reveal simultaneously.
 * 4. Items without an explicit priority fall back to top-to-bottom
 *    (preserving their original array order as a tiebreaker).
 * 5. Ready-first behavior is applied within the same priority tier,
 *    not across tiers — a ready item with priority 10 does not jump
 *    ahead of a non-ready item with priority 1.
 */
export function orderRevealItems(items: readonly RevealItemMetadata[]): RevealItemMetadata[] {
  if (items.length === 0) {
    return []
  }

  const withDefaults = items.map((item, index) => ({
    ...item,
    priority: item.priority ?? index,
  }))

  const sorted = [...withDefaults].sort((a, b) => {
    const priorityDiff = a.priority - b.priority
    if (priorityDiff !== 0) {
      return priorityDiff
    }

    // Within the same priority tier, ready items come first
    if (a.ready !== b.ready) {
      return a.ready ? -1 : 1
    }

    return 0
  })

  return sorted.map(({ itemId, priority, ready }) => ({
    itemId,
    priority,
    ready,
  }))
}

/* ------------------------------------------------------------------ */
/*  Anchor validation                                                  */
/* ------------------------------------------------------------------ */

export type AnchorValidationResult =
  | { valid: true; anchors: readonly string[] }
  | { valid: false; error: string; anchors: readonly string[] }

/**
 * Validate a page anchor declaration.
 *
 * Anchors are validated against the maximum of 2. When the limit is
 * exceeded, the result is `{ valid: false }` with a descriptive error
 * and the first 2 anchors as a best-effort set.
 */
export function validateAnchors(declaration: PageAnchorDeclaration): AnchorValidationResult {
  if (declaration.anchorIds.length > 2) {
    return {
      valid: false,
      error: `Page declared ${declaration.anchorIds.length} anchors; maximum is 2. Using first 2 anchors.`,
      anchors: declaration.anchorIds.slice(0, 2),
    }
  }

  return {
    valid: true,
    anchors: declaration.anchorIds,
  }
}

/* ------------------------------------------------------------------ */
/*  Product label lookup                                               */
/* ------------------------------------------------------------------ */

/**
 * Look up the product-facing label for a style id.
 * Returns the id itself as a fallback if the id is unknown.
 */
export function getStyleLabel(id: LoadingMotionStyleId, locale: 'zh-CN' | 'en-US'): string {
  const entry = LOADING_MOTION_STYLE_LABELS.find((e) => e.id === id)
  if (!entry) {
    return id
  }
  return locale === 'zh-CN' ? entry.labelZh : entry.labelEn
}

/**
 * Look up the product-facing label for an intensity id.
 * Returns the id itself as a fallback if the id is unknown.
 */
export function getIntensityLabel(id: LoadingMotionIntensityId, locale: 'zh-CN' | 'en-US'): string {
  const entry = LOADING_MOTION_INTENSITY_LABELS.find((e) => e.id === id)
  if (!entry) {
    return id
  }
  return locale === 'zh-CN' ? entry.labelZh : entry.labelEn
}

/** Looks up the product-facing label for a loading motion speed id. */
export function getSpeedLabel(id: LoadingMotionSpeedId, locale: 'zh-CN' | 'en-US'): string {
  const entry = LOADING_MOTION_SPEED_LABELS.find((e) => e.id === id)
  if (!entry) {
    return id
  }
  return locale === 'zh-CN' ? entry.labelZh : entry.labelEn
}
