import type { AppMode, LauncherPage } from '../editor-shell'

export const APP_MODE_STORAGE_KEY = 'modforge:app-mode'
export const LAUNCHER_PAGE_STORAGE_KEY = 'modforge:launcher-page'

export type AppShellState = {
  appMode: AppMode
  launcherPage: LauncherPage
}

const DEFAULT_APP_SHELL_STATE: AppShellState = {
  appMode: 'launcher',
  launcherPage: 'library',
}

const launcherPages: LauncherPage[] = ['library', 'discover', 'updates', 'settings']

function isAppMode(value: string | null): value is AppMode {
  return value === 'workbench' || value === 'launcher'
}

function isLauncherPage(value: string | null): value is LauncherPage {
  return !!value && launcherPages.includes(value as LauncherPage)
}

export function readStoredAppShellState(): AppShellState {
  if (typeof window === 'undefined') {
    return DEFAULT_APP_SHELL_STATE
  }

  try {
    const storedAppMode = window.localStorage.getItem(APP_MODE_STORAGE_KEY)
    const storedLauncherPage = window.localStorage.getItem(LAUNCHER_PAGE_STORAGE_KEY)

    return {
      appMode: isAppMode(storedAppMode) ? storedAppMode : DEFAULT_APP_SHELL_STATE.appMode,
      launcherPage: isLauncherPage(storedLauncherPage) ? storedLauncherPage : DEFAULT_APP_SHELL_STATE.launcherPage,
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
  } catch {
    // Ignore blocked storage writes and keep shell state in-memory.
  }
}
