import type { AppMode, LauncherPage } from '@locales/editor-shell'

/** Minimal app shell state kept for legacy/local callers that do not need full AppUiState. */
export type AppShellState = {
  appMode: AppMode
  launcherPage: LauncherPage
  debugEnabled: boolean
  notificationSoundEnabled: boolean
}

/** Default shell route and toggle state. */
export const DEFAULT_APP_SHELL_STATE: AppShellState = {
  appMode: 'launcher',
  launcherPage: 'library',
  debugEnabled: false,
  notificationSoundEnabled: true,
}

type AppShellStateInput = {
  appMode?: string | null
  launcherPage?: string | null
  debugEnabled?: boolean | string | null
  notificationSoundEnabled?: boolean | string | null
}

const launcherPages: LauncherPage[] = ['library', 'discover', 'updates', 'configuration']

function isAppMode(value: string | null): value is AppMode {
  return value === 'workbench' || value === 'launcher'
}

function parseLauncherPage(value: string | null): LauncherPage | null {
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

/** Normalizes persisted shell state values from booleans or string-backed storage. */
export function normalizeAppShellState(input?: AppShellStateInput | null): AppShellState {
  const appMode = input?.appMode ?? null
  const launcherPage = input?.launcherPage ?? null
  const debugEnabled = input?.debugEnabled
  const notificationSoundEnabled = input?.notificationSoundEnabled

  return {
    appMode: isAppMode(appMode) ? appMode : DEFAULT_APP_SHELL_STATE.appMode,
    launcherPage: parseLauncherPage(launcherPage) ?? DEFAULT_APP_SHELL_STATE.launcherPage,
    debugEnabled: typeof debugEnabled === 'boolean' ? debugEnabled : isDebugEnabled(debugEnabled == null ? null : String(debugEnabled)),
    notificationSoundEnabled:
      typeof notificationSoundEnabled === 'boolean'
        ? notificationSoundEnabled
        : isNotificationSoundEnabled(notificationSoundEnabled == null ? null : String(notificationSoundEnabled)),
  }
}
