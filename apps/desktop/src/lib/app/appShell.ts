import type { AppMode, LauncherPage } from '../editor-shell'

export const APP_MODE_STORAGE_KEY = 'modforge:app-mode'
export const LAUNCHER_PAGE_STORAGE_KEY = 'modforge:launcher-page'
export const DEBUG_ENABLED_STORAGE_KEY = 'modforge:debug-enabled'
export const NOTIFICATION_SOUND_ENABLED_STORAGE_KEY = 'modforge:notification-sound-enabled'

export type AppShellState = {
  appMode: AppMode
  launcherPage: LauncherPage
  debugEnabled: boolean
  notificationSoundEnabled: boolean
}

const DEFAULT_APP_SHELL_STATE: AppShellState = {
  appMode: 'launcher',
  launcherPage: 'library',
  debugEnabled: false,
  notificationSoundEnabled: true,
}

const launcherPages: LauncherPage[] = ['library', 'discover', 'updates', 'debug']

function isAppMode(value: string | null): value is AppMode {
  return value === 'workbench' || value === 'launcher'
}

function parseLauncherPage(value: string | null): LauncherPage | null {
  if (value === 'settings') {
    return 'debug'
  }

  return !!value && launcherPages.includes(value as LauncherPage) ? (value as LauncherPage) : null
}

function isDebugEnabled(value: string | null) {
  return parseStoredBoolean(value, DEFAULT_APP_SHELL_STATE.debugEnabled)
}

function isNotificationSoundEnabled(value: string | null) {
  return parseStoredBoolean(value, DEFAULT_APP_SHELL_STATE.notificationSoundEnabled)
}

function parseStoredBoolean(value: string | null, fallback: boolean) {
  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  return fallback
}

export function readStoredAppShellState(): AppShellState {
  if (typeof window === 'undefined') {
    return DEFAULT_APP_SHELL_STATE
  }

  try {
    const storedAppMode = window.localStorage.getItem(APP_MODE_STORAGE_KEY)
    const storedLauncherPage = window.localStorage.getItem(LAUNCHER_PAGE_STORAGE_KEY)
    const storedDebugEnabled = window.localStorage.getItem(DEBUG_ENABLED_STORAGE_KEY)
    const storedNotificationSoundEnabled = window.localStorage.getItem(NOTIFICATION_SOUND_ENABLED_STORAGE_KEY)

    return {
      appMode: isAppMode(storedAppMode) ? storedAppMode : DEFAULT_APP_SHELL_STATE.appMode,
      launcherPage: parseLauncherPage(storedLauncherPage) ?? DEFAULT_APP_SHELL_STATE.launcherPage,
      debugEnabled: isDebugEnabled(storedDebugEnabled),
      notificationSoundEnabled: isNotificationSoundEnabled(storedNotificationSoundEnabled),
    }
  } catch {
    return DEFAULT_APP_SHELL_STATE
  }
}

export function persistAppShellState(state: AppShellState) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, state.appMode)
    window.localStorage.setItem(LAUNCHER_PAGE_STORAGE_KEY, state.launcherPage)
    window.localStorage.setItem(DEBUG_ENABLED_STORAGE_KEY, String(state.debugEnabled))
    window.localStorage.setItem(NOTIFICATION_SOUND_ENABLED_STORAGE_KEY, String(state.notificationSoundEnabled))
  } catch {
    // Ignore blocked storage writes and keep shell state in-memory.
  }
}
