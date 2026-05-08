import type { AppUiState, PatchAppUiStateRequest } from '@shared/contracts'
import { DEFAULT_LOADING_MOTION_PREFERENCE } from '@shared/lib/loading-motion'
import { normalizeLoadingMotionPreference } from '@shared/lib/loading-motion'

type AppUiStatePersistence = {
  canPersist: () => boolean
  load: () => Promise<AppUiState>
  patch: (request: PatchAppUiStateRequest) => Promise<AppUiState>
}

let appUiStatePersistence: AppUiStatePersistence = {
  canPersist: () => false,
  load: async () => snapshot,
  patch: async (request) => mergePatchIntoSnapshot(snapshot, request),
}

export function configureAppUiStatePersistence(persistence: AppUiStatePersistence) {
  appUiStatePersistence = persistence
  snapshot = createDefaultAppUiState()
  initializePromise = null
  patchQueue = Promise.resolve(snapshot)
}

const LEGACY_WORKSPACE_LAYOUT_PREFIX = 'modforge:workspace-layout:'
const APP_MODE_STORAGE_KEY = 'modforge:app-mode'
const LAUNCHER_PAGE_STORAGE_KEY = 'modforge:launcher-page'
const DEBUG_ENABLED_STORAGE_KEY = 'modforge:debug-enabled'
const NOTIFICATION_SOUND_ENABLED_STORAGE_KEY = 'modforge:notification-sound-enabled'
const ACCENT_STORAGE_KEY = 'modforge:accent-preset:v1'
const PLAYER_APPEARANCE_PROFILES_STORAGE_KEY = 'modforge:player-appearance-profiles:v1'
const PLAYER_APPEARANCE_ACTIVE_PROFILE_STORAGE_KEY = 'modforge:player-appearance-active:v1'
const RECENT_GAME_DIRECTORIES_STORAGE_KEY = 'modforge:recent-game-directories:v1'
const LAUNCHER_DISCOVER_TOOLBAR_STORAGE_KEY = 'modforge:launcher-discover-toolbar:v1'

const LEGACY_UI_STATE_KEYS = [
  'modforge:locale',
  APP_MODE_STORAGE_KEY,
  LAUNCHER_PAGE_STORAGE_KEY,
  DEBUG_ENABLED_STORAGE_KEY,
  NOTIFICATION_SOUND_ENABLED_STORAGE_KEY,
  ACCENT_STORAGE_KEY,
  PLAYER_APPEARANCE_PROFILES_STORAGE_KEY,
  PLAYER_APPEARANCE_ACTIVE_PROFILE_STORAGE_KEY,
  RECENT_GAME_DIRECTORIES_STORAGE_KEY,
  LAUNCHER_DISCOVER_TOOLBAR_STORAGE_KEY,
] as const

function defaultLocale() {
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')) {
    return 'zh-CN'
  }

  return 'en-US'
}

export function createDefaultAppUiState(): AppUiState {
  return {
    version: 1,
    shell: {
      appMode: 'launcher',
      launcherPage: 'library',
      debugEnabled: false,
      notificationSoundEnabled: true,
    },
    appearance: {
      locale: defaultLocale(),
      accentPresetId: 'indigo',
      recentGameDirectories: [],
      playerAppearance: {
        profiles: [],
        activeProfileId: null,
    },
      loadingMotion: { ...DEFAULT_LOADING_MOTION_PREFERENCE },
    },
    workspace: {
      layouts: {},
      workspaceViewMode: 'edit',
      cpMaker: {
        activeGeneratedDraftKey: null,
      },
    },
    launcher: {
      discoverToolbar: {
        sort: 'newest',
        ascending: false,
        timeRange: 'all',
        pageSize: 20,
        filtersHidden: false,
      },
      forceOffline: false,
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeLayouts(value: unknown) {
  if (!isRecord(value)) {
    return {}
  }

  const entries = Object.entries(value)
    .filter(([key, layout]) => key.trim() && isRecord(layout))
    .map(([key, layout]) => [key, layout as Record<string, unknown>])
  return Object.fromEntries(entries)
}

function normalizeAppUiState(raw: Partial<AppUiState> | null | undefined): AppUiState {
  const defaults = createDefaultAppUiState()
  return {
    version: typeof raw?.version === 'number' && Number.isFinite(raw.version) ? Math.max(1, Math.trunc(raw.version)) : defaults.version,
    shell: {
      appMode: raw?.shell?.appMode === 'workbench' ? 'workbench' : defaults.shell.appMode,
      launcherPage: typeof raw?.shell?.launcherPage === 'string' && raw.shell.launcherPage.trim()
        ? raw.shell.launcherPage
        : defaults.shell.launcherPage,
      debugEnabled: typeof raw?.shell?.debugEnabled === 'boolean' ? raw.shell.debugEnabled : defaults.shell.debugEnabled,
      notificationSoundEnabled:
        typeof raw?.shell?.notificationSoundEnabled === 'boolean'
          ? raw.shell.notificationSoundEnabled
          : defaults.shell.notificationSoundEnabled,
    },
    appearance: {
      locale:
        raw?.appearance?.locale === 'zh-CN' || raw?.appearance?.locale === 'en-US'
          ? raw.appearance.locale
          : defaults.appearance.locale,
      accentPresetId:
        typeof raw?.appearance?.accentPresetId === 'string' && raw.appearance.accentPresetId.trim()
          ? raw.appearance.accentPresetId
          : defaults.appearance.accentPresetId,
      recentGameDirectories: Array.isArray(raw?.appearance?.recentGameDirectories)
        ? raw.appearance.recentGameDirectories.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : defaults.appearance.recentGameDirectories,
      playerAppearance: {
        profiles: Array.isArray(raw?.appearance?.playerAppearance?.profiles)
          ? raw.appearance.playerAppearance.profiles
          : defaults.appearance.playerAppearance.profiles,
        activeProfileId:
          typeof raw?.appearance?.playerAppearance?.activeProfileId === 'string' && raw.appearance.playerAppearance.activeProfileId.trim()
            ? raw.appearance.playerAppearance.activeProfileId
            : null,
      },
      loadingMotion: {
        ...normalizeLoadingMotionPreference(raw?.appearance?.loadingMotion),
      },
    },
    workspace: {
      layouts: normalizeLayouts(raw?.workspace?.layouts),
      workspaceViewMode: raw?.workspace?.workspaceViewMode === 'edit' || raw?.workspace?.workspaceViewMode === 'preview'
        ? raw.workspace.workspaceViewMode
        : defaults.workspace.workspaceViewMode,
      cpMaker: {
        activeGeneratedDraftKey: typeof raw?.workspace?.cpMaker?.activeGeneratedDraftKey === 'string' && raw.workspace.cpMaker.activeGeneratedDraftKey.trim()
          ? raw.workspace.cpMaker.activeGeneratedDraftKey
          : null,
      },
    },
    launcher: {
      discoverToolbar: {
        sort:
          typeof raw?.launcher?.discoverToolbar?.sort === 'string' && raw.launcher.discoverToolbar.sort.trim()
            ? raw.launcher.discoverToolbar.sort
            : defaults.launcher.discoverToolbar.sort,
        ascending:
          typeof raw?.launcher?.discoverToolbar?.ascending === 'boolean'
            ? raw.launcher.discoverToolbar.ascending
            : defaults.launcher.discoverToolbar.ascending,
        timeRange:
          typeof raw?.launcher?.discoverToolbar?.timeRange === 'string' && raw.launcher.discoverToolbar.timeRange.trim()
            ? raw.launcher.discoverToolbar.timeRange
            : defaults.launcher.discoverToolbar.timeRange,
        pageSize:
          typeof raw?.launcher?.discoverToolbar?.pageSize === 'number' && Number.isFinite(raw.launcher.discoverToolbar.pageSize)
            ? raw.launcher.discoverToolbar.pageSize
            : defaults.launcher.discoverToolbar.pageSize,
        filtersHidden:
          typeof raw?.launcher?.discoverToolbar?.filtersHidden === 'boolean'
            ? raw.launcher.discoverToolbar.filtersHidden
            : defaults.launcher.discoverToolbar.filtersHidden,
      },
      forceOffline:
        typeof raw?.launcher?.forceOffline === 'boolean'
          ? raw.launcher.forceOffline
          : defaults.launcher.forceOffline,
    },
  }
}

function mergeWorkspaceLayouts(
  currentLayouts: Record<string, Record<string, unknown>>,
  incomingLayouts?: Record<string, Record<string, unknown> | null>,
) {
  if (!incomingLayouts) {
    return currentLayouts
  }

  const nextLayouts = { ...currentLayouts }

  for (const [storageKey, layout] of Object.entries(incomingLayouts)) {
    if (!storageKey.trim()) {
      continue
    }

    if (layout === null) {
      delete nextLayouts[storageKey]
      continue
    }

    if (isRecord(layout)) {
      nextLayouts[storageKey] = layout
    }
  }

  return nextLayouts
}

let snapshot = createDefaultAppUiState()
let initializePromise: Promise<AppUiState> | null = null
let patchQueue = Promise.resolve(snapshot)

export function getAppUiStateSnapshot() {
  return snapshot
}

export async function initializeAppUiState() {
  if (initializePromise) {
    return initializePromise
  }

  initializePromise = (async () => {
    if (!appUiStatePersistence.canPersist()) {
      snapshot = normalizeAppUiState(snapshot)
      return snapshot
    }

    const loaded = await appUiStatePersistence.load()
    snapshot = normalizeAppUiState(loaded)
    return snapshot
  })()

  return initializePromise
}

function mergePatchIntoSnapshot(current: AppUiState, patch: PatchAppUiStateRequest): AppUiState {
  return normalizeAppUiState({
    ...current,
    ...(patch.shell ? { shell: patch.shell } : null),
    ...(patch.appearance
      ? {
          appearance: {
            ...current.appearance,
            ...patch.appearance,
          },
        }
      : null),
    ...(patch.workspace
      ? {
          workspace: {
            layouts: mergeWorkspaceLayouts(current.workspace.layouts, patch.workspace.layouts),
          },
        }
      : null),
    ...(patch.launcher
      ? {
          launcher: {
            ...current.launcher,
            ...patch.launcher,
          },
        }
      : null),
  })
}

export async function applyAppUiStatePatch(patch: PatchAppUiStateRequest) {
  patchQueue = patchQueue.then(async () => {
    if (!appUiStatePersistence.canPersist()) {
      snapshot = mergePatchIntoSnapshot(snapshot, patch)
      return snapshot
    }

    const next = await appUiStatePersistence.patch(patch)
    snapshot = normalizeAppUiState(next)
    return snapshot
  })

  return patchQueue
}

export function clearLegacyBrowserUiState() {
  if (appUiStatePersistence.canPersist() || typeof window === 'undefined') {
    return
  }

  for (const key of LEGACY_UI_STATE_KEYS) {
    window.localStorage.removeItem(key)
  }

  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith(LEGACY_WORKSPACE_LAYOUT_PREFIX)) {
      window.localStorage.removeItem(key)
    }
  }
}

