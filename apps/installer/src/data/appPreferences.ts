import type { AppLoadingMotionStyleId, AppStartupMode, AppThemeId, AppWindowCloseBehavior } from '../types/installer'

/**
 * Static option data for the "app preferences" wizard page.
 *
 * Theme preview colors are the light variants from the desktop app's
 * `apps/desktop/src/styles/tokens.css`; display order mirrors the desktop
 * settings window (`THEME_DISPLAY_ORDER` in app/app-shell/SettingsWindow.tsx).
 */

export interface AppThemePreview {
  id: AppThemeId
  accent: string
  surfaceApp: string
  surfacePanel: string
  /** Marks the main app's default theme. */
  isDefault?: boolean
}

export const APP_THEME_PREVIEWS: readonly AppThemePreview[] = [
  { id: 'warm-paper', accent: '#5b54d6', surfaceApp: '#f4f2ee', surfacePanel: '#fbfaf7' },
  { id: 'neutral-tool', accent: '#2563eb', surfaceApp: '#f1f1f2', surfacePanel: '#fbfbfc', isDefault: true },
  { id: 'slate-blue', accent: '#0e7490', surfaceApp: '#eef1f4', surfacePanel: '#f9fbfc' },
  { id: 'forest', accent: '#3f8f4f', surfaceApp: '#f1f3ec', surfacePanel: '#f9faf4' },
  { id: 'twilight', accent: '#7c5cd6', surfaceApp: '#f3f1f5', surfacePanel: '#faf9fc' },
  { id: 'stardew-wood', accent: '#c77d2e', surfaceApp: '#f5f1e8', surfacePanel: '#fcf9f2' },
  { id: 'crimson', accent: '#d4324a', surfaceApp: '#f5f0ef', surfacePanel: '#fcf9f8' },
  { id: 'blossom', accent: '#db2777', surfaceApp: '#f6eff3', surfacePanel: '#fdf8fb' },
]

export const APP_LOADING_MOTION_STYLE_IDS: readonly AppLoadingMotionStyleId[] = [
  'bounceIn',
  'layeredFadeIn',
  'slideInPush',
  'softFadeIn',
  'quietSimplify',
]

export const APP_WINDOW_CLOSE_BEHAVIORS: readonly AppWindowCloseBehavior[] = ['quit', 'minimizeToTray']

export const APP_STARTUP_MODES: readonly AppStartupMode[] = ['launcher', 'workbench']
