import type { AppUiState, PatchAppUiStateRequest, WindowBorderTone, WindowBorderWeight, WindowCloseBehavior } from '@shared/contracts'
import { DEFAULT_LOADING_MOTION_PREFERENCE } from '@shared/lib/loading-motion'
import { normalizeLoadingMotionPreference } from '@shared/lib/loading-motion'
import { DEFAULT_THEME_ID, normalizeThemeId } from './theme'

type AppUiStatePersistence = {
  canPersist: () => boolean
  load: () => Promise<AppUiState>
  patch: (request: PatchAppUiStateRequest) => Promise<AppUiState>
}

let appUiStatePersistence: AppUiStatePersistence = {
  canPersist: () => false,
  load: async () => snapshot,
  patch: async () => snapshot,
}

/** Configures the persistence adapter used by app UI state helpers. */
export function configureAppUiStatePersistence(persistence: AppUiStatePersistence) {
  if (initializePromise) {
    throw new Error('configureAppUiStatePersistence must be called before initializeAppUiState')
  }

  appUiStatePersistence = persistence
  snapshot = createDefaultAppUiState()
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

function normalizeWindowCloseBehavior(value: unknown): WindowCloseBehavior {
  return value === 'minimizeToTray' ? 'minimizeToTray' : 'quit'
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
      windowCloseBehavior: 'quit',
      rememberCloseChoice: false,
    },
    appearance: {
      locale: defaultLocale(),
      themeId: DEFAULT_THEME_ID,
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
      location: { kind: 'home' },
      navigation: { collapsed: true, expandedSections: ['browse'] },
      modules: {},
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

function normalizeModules(value: unknown) {
  if (!isRecord(value)) {
    return {}
  }

  const entries = Object.entries(value)
    .filter(([key, state]) => key.trim() && isRecord(state))
    .map(([key, state]) => [key, state as Record<string, unknown>])
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
      windowCloseBehavior: normalizeWindowCloseBehavior(raw?.shell?.windowCloseBehavior),
      rememberCloseChoice:
        typeof raw?.shell?.rememberCloseChoice === 'boolean' ? raw.shell.rememberCloseChoice : defaults.shell.rememberCloseChoice,
    },
    appearance: {
      locale:
        raw?.appearance?.locale === 'zh-CN' || raw?.appearance?.locale === 'en-US' ? raw.appearance.locale : defaults.appearance.locale,
      themeId: normalizeThemeId(raw?.appearance?.themeId),
      windowBorderTone: normalizeWindowBorderTone(raw?.appearance?.windowBorderTone),
      windowBorderWeight: normalizeWindowBorderWeight(raw?.appearance?.windowBorderWeight),
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
    workspace: normalizeWorkspace(raw?.workspace, defaults.workspace),
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

function normalizeWorkspace(value: unknown, defaults: AppUiState['workspace']): AppUiState['workspace'] {
  if (!isRecord(value) || !isRecord(value.location) || !isRecord(value.navigation) || !isRecord(value.modules)) {
    return defaults
  }
  const location =
    value.location.kind === 'module' && typeof value.location.moduleId === 'string' && value.location.moduleId.trim()
      ? { kind: 'module' as const, moduleId: value.location.moduleId.trim() }
      : { kind: 'home' as const }
  const allowedSections = new Set(['browse', 'authoring', 'tools', 'development'])
  const expandedSections = Array.isArray(value.navigation.expandedSections)
    ? Array.from(
        new Set(
          value.navigation.expandedSections.filter(
            (entry): entry is AppUiState['workspace']['navigation']['expandedSections'][number] =>
              typeof entry === 'string' && allowedSections.has(entry),
          ),
        ),
      )
    : defaults.navigation.expandedSections
  return {
    location,
    navigation: {
      collapsed: typeof value.navigation.collapsed === 'boolean' ? value.navigation.collapsed : defaults.navigation.collapsed,
      expandedSections,
    },
    modules: normalizeModules(value.modules),
  }
}

function mergeWorkspaceModules(
  currentModules: Record<string, Record<string, unknown>>,
  incomingModules?: Record<string, Record<string, unknown> | null>,
) {
  if (!incomingModules) {
    return currentModules
  }
  const nextModules = { ...currentModules }
  for (const [moduleKey, moduleState] of Object.entries(incomingModules)) {
    if (!moduleKey.trim()) {
      continue
    }
    if (moduleState === null) {
      delete nextModules[moduleKey]
      continue
    }
    if (isRecord(moduleState)) {
      nextModules[moduleKey] = { ...nextModules[moduleKey], ...moduleState }
    }
  }
  return nextModules
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

function applyPatchToSnapshot(current: AppUiState, patch: PatchAppUiStateRequest): AppUiState {
  return {
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
            ...current.workspace,
            ...patch.workspace,
            navigation: { ...current.workspace.navigation, ...patch.workspace.navigation },
            modules: mergeWorkspaceModules(current.workspace.modules, patch.workspace.modules),
          },
        }
      : null),
    ...(patch.launcher
      ? {
          launcher: {
            ...current.launcher,
            ...patch.launcher,
            ...(patch.launcher.discoverToolbar
              ? {
                  discoverToolbar: {
                    ...current.launcher.discoverToolbar,
                    ...patch.launcher.discoverToolbar,
                  },
                }
              : null),
          },
        }
      : null),
  }
}

function mergePatchIntoSnapshot(current: AppUiState, patch: PatchAppUiStateRequest): AppUiState {
  return applyPatchToSnapshot(current, patch)
}

/** Serializes UI state patches so concurrent callers cannot overwrite each other. */
export async function applyAppUiStatePatch(patch: PatchAppUiStateRequest) {
  const nextPatch = patchQueue
    .catch((error) => {
      console.error('[appUiState] patch failed', error)
      return snapshot
    })
    .then(async () => {
      if (!appUiStatePersistence.canPersist()) {
        snapshot = mergePatchIntoSnapshot(snapshot, patch)
        return snapshot
      }

      const next = await appUiStatePersistence.patch(patch)
      snapshot = normalizeAppUiState(next)
      return snapshot
    })

  patchQueue = nextPatch.catch((error) => {
    console.error('[appUiState] patch failed', error)
    return snapshot
  })
  return nextPatch
}
