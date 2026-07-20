import type { AppLanguage } from '../i18n/languages'

/** Installation step identifiers */
export type InstallStep = 'lang' | 'options' | 'progress' | 'finish' | 'uninstall'

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
  appLanguage: AppLanguage
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
  appLanguage: 'zh-CN',
}
