import type { AccentPreset } from '@app/app-shell/types'

export const WORLD_ATLAS_TAB_ID = 'world-atlas'
export const MAP_PREVIEW_TAB_ID = 'map:preview'
export const ACCENT_STORAGE_KEY = 'modforge:accent-preset:v1'
export const PLAYER_APPEARANCE_PROFILES_STORAGE_KEY = 'modforge:player-appearance-profiles:v1'
export const PLAYER_APPEARANCE_ACTIVE_PROFILE_STORAGE_KEY = 'modforge:player-appearance-active:v1'
export const RECENT_GAME_DIRECTORIES_STORAGE_KEY = 'modforge:recent-game-directories:v1'
export const DEFAULT_WORLD_ATLAS_VIEW_ZOOM = 1
export const WORKSPACE_LAYOUT_VERSION = 'v11'

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'indigo', label: 'Indigo', color: '#4f46e5' },
  { id: 'blue', label: 'Blue', color: '#0078ff' },
  { id: 'cyan', label: 'Cyan', color: '#0891b2' },
  { id: 'emerald', label: 'Emerald', color: '#059669' },
  { id: 'amber', label: 'Amber', color: '#d97706' },
  { id: 'rose', label: 'Rose', color: '#e11d48' },
]
