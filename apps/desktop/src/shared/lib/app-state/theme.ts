import type { ThemeId } from '@shared/contracts'

/** All valid color theme ids. Mirrors the `ThemeId` union and the `[data-theme]` blocks in `styles/tokens.css`. */
export const THEME_IDS: readonly ThemeId[] = [
  'warm-paper',
  'neutral-tool',
  'slate-blue',
  'forest',
  'twilight',
  'stardew-wood',
  'crimson',
  'blossom',
]

export const DEFAULT_THEME_ID: ThemeId = 'warm-paper'

/** Narrows an unknown value to a known theme id, falling back to the default theme. */
export function normalizeThemeId(value: unknown): ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value) ? (value as ThemeId) : DEFAULT_THEME_ID
}
