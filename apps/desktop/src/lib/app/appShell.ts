import type { AppMode, LauncherPage } from '../editor-shell'

export const APP_MODE_STORAGE_KEY = 'modforge:app-mode'
export const LAUNCHER_PAGE_STORAGE_KEY = 'modforge:launcher-page'
export const DEBUG_ENABLED_STORAGE_KEY = 'modforge:debug-enabled'

export type AppShellState = {
  appMode: AppMode
  launcherPage: LauncherPage
  debugEnabled: boolean
}

const DEFAULT_APP_SHELL_STATE: AppShellState = {
  appMode: 'launcher',
  launcherPage: 'library',
  debugEnabled: false,
}

const launcherPages: LauncherPage[] = ['library', 'discover', 'updates', 'settings']

function isAppMode(value: string | null): value is AppMode {
  return value === 'workbench' || value === 'launcher'
}

function isLauncherPage(value: string | null): value is LauncherPage {
  return !!value && launcherPages.includes(value as LauncherPage)
}

function isDebugEnabled(value: string | null) {
  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  return DEFAULT_APP_SHELL_STATE.debugEnabled
}

export function readStoredAppShellState(): AppShellState {
  if (typeof window === 'undefined') {
    return DEFAULT_APP_SHELL_STATE
  }

  try {
    const storedAppMode = window.localStorage.getItem(APP_MODE_STORAGE_KEY)
    const storedLauncherPage = window.localStorage.getItem(LAUNCHER_PAGE_STORAGE_KEY)
    const storedDebugEnabled = window.localStorage.getItem(DEBUG_ENABLED_STORAGE_KEY)

    return {
      appMode: isAppMode(storedAppMode) ? storedAppMode : DEFAULT_APP_SHELL_STATE.appMode,
      launcherPage: isLauncherPage(storedLauncherPage) ? storedLauncherPage : DEFAULT_APP_SHELL_STATE.launcherPage,
      debugEnabled: isDebugEnabled(storedDebugEnabled),
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
  } catch {
    // Ignore blocked storage writes and keep shell state in-memory.
  }
}
