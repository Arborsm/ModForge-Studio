import type { AppUiState, PatchAppUiStateRequest, WindowBorderTone, WindowBorderWeight } from '@shared/contracts'
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

/** Configures the persistence adapter used by app UI state helpers. */
export function configureAppUiStatePersistence(persistence: AppUiStatePersistence) {
  appUiStatePersistence = persistence
  snapshot = createDefaultAppUiState()
  initializePromise = null
  patchQueue = Promise.resolve(snapshot)
}

function defaultLocale() {
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')) {
    return 'zh-CN'
  }

  return 'en-US'
}

function normalizeWindowBorderTone(value: unknown): WindowBorderTone {
  return value === 'neutral' ? 'neutral' : 'accent'
}

function normalizeWindowBorderWeight(value: unknown): WindowBorderWeight {
  return value === 'thin' || value === 'none' ? value : 'standard'
}

function readLegacyWindowBorderStyle(value: unknown) {
  if (!isRecord(value)) {
    return undefined
  }

  return value.windowBorderStyle
}

/** Creates a normalized default UI state for first launch or non-desktop fallback. */
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
      windowBorderTone: 'accent',
      windowBorderWeight: 'standard',
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
      forceNonPremium: false,
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
      launcherPage:
        typeof raw?.shell?.launcherPage === 'string' && raw.shell.launcherPage.trim()
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
        raw?.appearance?.locale === 'zh-CN' || raw?.appearance?.locale === 'en-US' ? raw.appearance.locale : defaults.appearance.locale,
      accentPresetId:
        typeof raw?.appearance?.accentPresetId === 'string' && raw.appearance.accentPresetId.trim()
          ? raw.appearance.accentPresetId
          : defaults.appearance.accentPresetId,
      windowBorderTone: normalizeWindowBorderTone(raw?.appearance?.windowBorderTone ?? readLegacyWindowBorderStyle(raw?.appearance)),
      windowBorderWeight: normalizeWindowBorderWeight(
        raw?.appearance?.windowBorderWeight ??
          (readLegacyWindowBorderStyle(raw?.appearance) === 'subtle' ? 'thin' : readLegacyWindowBorderStyle(raw?.appearance)),
      ),
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
      workspaceViewMode:
        raw?.workspace?.workspaceViewMode === 'edit' || raw?.workspace?.workspaceViewMode === 'preview'
          ? raw.workspace.workspaceViewMode
          : defaults.workspace.workspaceViewMode,
      cpMaker: {
        activeGeneratedDraftKey:
          typeof raw?.workspace?.cpMaker?.activeGeneratedDraftKey === 'string' && raw.workspace.cpMaker.activeGeneratedDraftKey.trim()
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
      forceOffline: typeof raw?.launcher?.forceOffline === 'boolean' ? raw.launcher.forceOffline : defaults.launcher.forceOffline,
      forceNonPremium:
        typeof raw?.launcher?.forceNonPremium === 'boolean' ? raw.launcher.forceNonPremium : defaults.launcher.forceNonPremium,
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

/** Returns the current in-memory app UI state snapshot. */
export function getAppUiStateSnapshot() {
  return snapshot
}

/** Loads persisted UI state once, normalizes it, and caches the initialized snapshot. */
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

/** Serializes UI state patches so concurrent callers cannot overwrite each other. */
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
