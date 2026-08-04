import type { ThemeId } from '@shared/contracts'
import { DEFAULT_THEME_ID, THEME_IDS } from '@shared/lib/app-state'

export { DEFAULT_THEME_ID, THEME_IDS }

export type ThemePreset = {
  id: ThemeId
  label: string
  /** Accent hex consumed by canvas/preview renderers that need a raw value. */
  accent: string
  /** Representative colors shown in the settings theme card. */
  preview: {
    surface: string
    panel: string
    text: string
  }
}

/**
 * Full color themes. Each theme owns its accent + neutral scale + status colors,
 * defined as CSS in `styles/tokens.css` under `[data-theme="<id>"]`.
 */
export const THEME_PRESETS: ThemePreset[] = [
  { id: 'neutral-tool', label: 'Neutral Tool', accent: '#2563eb', preview: { surface: '#ffffff', panel: '#ffffff', text: '#1c1c20' } },
  { id: 'warm-paper', label: 'Warm Paper', accent: '#5b54d6', preview: { surface: '#ffffff', panel: '#ffffff', text: '#2c2823' } },
  { id: 'slate-blue', label: 'Slate Blue', accent: '#0e7490', preview: { surface: '#ffffff', panel: '#ffffff', text: '#1a2330' } },
  { id: 'forest', label: 'Forest', accent: '#3f8f4f', preview: { surface: '#ffffff', panel: '#ffffff', text: '#262b22' } },
  { id: 'twilight', label: 'Twilight', accent: '#7c5cd6', preview: { surface: '#ffffff', panel: '#ffffff', text: '#29242f' } },
  { id: 'stardew-wood', label: 'Stardew Wood', accent: '#c77d2e', preview: { surface: '#ffffff', panel: '#ffffff', text: '#332b1f' } },
  { id: 'crimson', label: 'Crimson', accent: '#d4324a', preview: { surface: '#ffffff', panel: '#ffffff', text: '#2f2422' } },
  { id: 'blossom', label: 'Blossom', accent: '#db2777', preview: { surface: '#ffffff', panel: '#ffffff', text: '#2f222a' } },
]
