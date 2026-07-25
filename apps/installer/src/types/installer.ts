import type { AppLanguage } from '../i18n/languages'

/** Installation step identifiers */
export type InstallStep = 'lang' | 'options' | 'preferences' | 'progress' | 'finish' | 'uninstall'

export interface LaunchContext {
  mode: 'install' | 'uninstall'
  uninstallPath: string | null
  appLanguage?: AppLanguage | null
}

export interface InstallPathValidation {
  installPath: string
}

/** Matches `get_existing_installation` / `ExistingInstallationResponse` (camelCase). */
export interface ExistingInstallation {
  detected: boolean
  installLocation: string | null
  displayVersion: string | null
  uninstallString: string | null
  mainBinaryPresent: boolean
  source: string | null
}

/** Installation options sent to the Rust backend */
export interface InstallOptions {
  installPath: string
  desktopShortcut: boolean
  startMenu: boolean
  /** Register a HKCU Run entry so the app starts with Windows. */
  autoStart: boolean
  appLanguage: AppLanguage
  /** Finish page: launch the installed app when the wizard closes. */
  launchAfterInstall: boolean
}

/** Progress update received from the backend */
export interface InstallProgress {
  step: string
  percent: number
  message: string
}

/** Disk space information */
export interface DiskSpaceInfo {
  total: number
  available: number
  required: number
  sufficient: boolean
}

/** Default installation options */
export const DEFAULT_OPTIONS: InstallOptions = {
  installPath: '',
  desktopShortcut: true,
  startMenu: true,
  autoStart: false,
  appLanguage: 'zh-CN',
  launchAfterInstall: true,
}

/** Color theme ids of the main app (`appearance.themeId` in ui-state.json). */
export type AppThemeId = 'warm-paper' | 'neutral-tool' | 'slate-blue' | 'forest' | 'twilight' | 'stardew-wood' | 'crimson' | 'blossom'

/** Loading-motion style ids of the main app (`appearance.loadingMotion.styleId`). */
export type AppLoadingMotionStyleId = 'bounceIn' | 'layeredFadeIn' | 'slideInPush' | 'softFadeIn' | 'quietSimplify'

/** Close-button behavior of the main app (`shell.windowCloseBehavior`). */
export type AppWindowCloseBehavior = 'quit' | 'minimizeToTray'

/** Startup mode of the main app (`shell.appMode`). */
export type AppStartupMode = 'launcher' | 'workbench'

/** Main-app preferences pre-selected in the installer and persisted to ui-state.json. */
export interface AppPreferences {
  themeId: AppThemeId
  loadingMotionStyleId: AppLoadingMotionStyleId
  windowCloseBehavior: AppWindowCloseBehavior
  notificationSoundEnabled: boolean
  appMode: AppStartupMode
}

/** Defaults mirror the main app's serde defaults, so an untouched page writes current behavior. */
export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  themeId: 'neutral-tool',
  loadingMotionStyleId: 'softFadeIn',
  windowCloseBehavior: 'quit',
  notificationSoundEnabled: true,
  appMode: 'launcher',
}
