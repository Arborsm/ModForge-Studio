import { mockConvertFileSrc, mockIPC, mockWindows } from '@tauri-apps/api/mocks'
import type {
  LauncherDownloadQueueState,
  LauncherLibraryCoversState,
  LauncherLibraryModSummary,
  LauncherLibraryScanResult,
  LauncherLibraryState,
  LauncherNexusDiagnosticsResult,
  LauncherRuntimeInfo,
  LauncherSettings,
  LauncherSuppressedUpdateModIdsResult,
  LauncherUpdatesResult,
} from '@features/launcher/model/launcherContracts'
import type { AppUiState, PatchAppUiStateRequest } from '@shared/contracts'
import { DEFAULT_LOADING_MOTION_PREFERENCE } from '@shared/lib/loading-motion'

const DEV_LAUNCHER_MOCK_QUERY_PARAM = 'mfLauncherMock'
const DEV_LAUNCHER_MOCK_MODS_PATH = 'E:\\ModForge Dev\\Stardew Valley\\Mods'

function shouldEnableDevLauncherMock() {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return false
  }

  return new URLSearchParams(window.location.search).get(DEV_LAUNCHER_MOCK_QUERY_PARAM) === '1'
}

function getDevLauncherMockModCount() {
  if (typeof window === 'undefined') {
    return 48
  }

  const rawValue = new URLSearchParams(window.location.search).get('mfLauncherMockMods')
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : 48
  if (!Number.isFinite(parsed)) {
    return 48
  }

  return Math.max(8, Math.min(800, parsed))
}

function createMockMod(index: number): LauncherLibraryModSummary {
  const padded = String(index).padStart(2, '0')
  const name = `Mock Mod ${padded}`

  return {
    id: `mock-mod-${padded}`,
    labelKey: `Path:${DEV_LAUNCHER_MOCK_MODS_PATH}\\${name}`,
    name,
    author: index % 3 === 0 ? 'ModForge Dev' : 'Test Author',
    version: `1.${index % 7}.0`,
    description: `Development launcher mock item ${padded}.`,
    uniqueId: `ModForge.Dev.Mock${padded}`,
    folderName: name,
    absolutePath: `${DEV_LAUNCHER_MOCK_MODS_PATH}\\${name}`,
    enabled: index % 5 !== 0,
    nexusModId: index <= 12 ? 20_000 + index : null,
    updateKeys: index <= 12 ? [`Nexus:${20_000 + index}`] : [],
    modUrl: index <= 12 ? `https://www.nexusmods.com/stardewvalley/mods/${20_000 + index}` : null,
    imageUrl: null,
    requiredDependencies: [],
    missingRequiredDependencies: [],
  }
}

function createMockMods(count = getDevLauncherMockModCount()): LauncherLibraryModSummary[] {
  return Array.from({ length: count }, (_, index) => createMockMod(index + 1))
}

function createInitialLibraryState(mods: LauncherLibraryModSummary[]): LauncherLibraryState {
  return {
    storageFolders: [
      {
        id: 'unsorted',
        name: 'Unsorted',
        modKeys: [],
      },
    ],
    hiddenModKeys: [],
    packPresets: [
      {
        id: 'dev-pack',
        name: 'Dev Pack',
        modKeys: mods.slice(0, 8).map((mod) => mod.labelKey),
      },
    ],
    childModGroups: [
      {
        parentModKey: mods[0]?.labelKey ?? '',
        childModKeys: mods.slice(1, 4).map((mod) => mod.labelKey),
      },
    ],
    libraryFolders: [
      {
        id: 'visuals',
        name: 'Visuals',
        parentFolderId: null,
        modKeys: mods.slice(8, 12).map((mod) => mod.labelKey),
        coverModKeys: mods.slice(8, 12).map((mod) => mod.labelKey),
      },
      {
        id: 'gameplay',
        name: 'Gameplay',
        parentFolderId: null,
        modKeys: mods.slice(12, 16).map((mod) => mod.labelKey),
        coverModKeys: mods.slice(12, 16).map((mod) => mod.labelKey),
      },
      {
        id: 'interface',
        name: 'Interface',
        parentFolderId: 'visuals',
        modKeys: mods.slice(16, 18).map((mod) => mod.labelKey),
        coverModKeys: mods.slice(16, 18).map((mod) => mod.labelKey),
      },
    ],
    currentPackId: null,
    scopeMode: 'all',
  }
}

function getMockRequest<TRequest>(payload: unknown): TRequest | null {
  if (!payload || typeof payload !== 'object' || !('request' in payload)) {
    return null
  }

  return (payload as { request: TRequest }).request
}

function createInitialAppUiState(): AppUiState {
  return {
    version: 1,
    shell: {
      appMode: 'launcher',
      launcherPage: 'library',
      debugEnabled: false,
      notificationSoundEnabled: false,
    },
    appearance: {
      locale: 'en-US',
      accentPresetId: 'blue',
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
      forceOffline: true,
      forceNonPremium: false,
    },
  }
}

function applyMockAppUiStatePatch(current: AppUiState, patch: PatchAppUiStateRequest): AppUiState {
  const nextLayouts = { ...current.workspace.layouts }
  for (const [key, layout] of Object.entries(patch.workspace?.layouts ?? {})) {
    if (layout === null) {
      delete nextLayouts[key]
    } else {
      nextLayouts[key] = layout
    }
  }

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
            layouts: nextLayouts,
          },
        }
      : null),
    ...(patch.launcher
      ? {
          launcher: {
            ...current.launcher,
            ...patch.launcher,
            discoverToolbar: {
              ...current.launcher.discoverToolbar,
              ...(patch.launcher.discoverToolbar ?? {}),
            },
          },
        }
      : null),
  }
}

/** Installs a query-param gated Tauri IPC mock for browser-only launcher UI debugging. */
export function installDevLauncherMock() {
  if (!shouldEnableDevLauncherMock()) {
    return
  }

  const mods = createMockMods()
  let appUiState = createInitialAppUiState()
  let settings: LauncherSettings = {
    gamePath: 'E:\\ModForge Dev\\Stardew Valley',
    modsPath: DEV_LAUNCHER_MOCK_MODS_PATH,
    downloadPath: 'E:\\ModForge Dev\\Downloads',
    nexusApiKey: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
    autoCheckModUpdates: false,
  }
  let libraryState = createInitialLibraryState(mods)
  let queueState: LauncherDownloadQueueState = { items: [] }

  mockWindows('main')
  mockConvertFileSrc('windows')
  mockIPC(
    (command, payload) => {
      switch (command) {
        case 'load_app_ui_state':
          return appUiState
        case 'patch_app_ui_state':
          appUiState = applyMockAppUiStatePatch(appUiState, getMockRequest<PatchAppUiStateRequest>(payload) ?? {})
          return appUiState
        case 'load_launcher_settings':
          return settings
        case 'save_launcher_settings':
          settings = { ...settings, ...(getMockRequest<Partial<LauncherSettings>>(payload) ?? {}) }
          return settings
        case 'load_launcher_library_state':
          return libraryState
        case 'save_launcher_library_state':
          libraryState = getMockRequest<LauncherLibraryState>(payload) ?? libraryState
          return libraryState
        case 'load_launcher_library_covers':
          return { covers: [] } satisfies LauncherLibraryCoversState
        case 'load_launcher_download_queue':
          return queueState
        case 'save_launcher_download_queue':
          queueState = getMockRequest<LauncherDownloadQueueState>(payload) ?? queueState
          return queueState
        case 'scan_launcher_library':
          return { modsPath: DEV_LAUNCHER_MOCK_MODS_PATH, mods } satisfies LauncherLibraryScanResult
        case 'load_launcher_runtime_info':
          return { gameVersion: '1.6.15', smapiVersion: '4.3.0' } satisfies LauncherRuntimeInfo
        case 'load_launcher_nexus_diagnostics':
        case 'restart_launcher_nexus_diagnostics':
          return { routes: [] } satisfies LauncherNexusDiagnosticsResult
        case 'set_launcher_nexus_force_offline':
          return { routes: [] } satisfies LauncherNexusDiagnosticsResult
        case 'load_suppressed_launcher_update_mod_ids':
          return { modsPath: DEV_LAUNCHER_MOCK_MODS_PATH, modIds: [] } satisfies LauncherSuppressedUpdateModIdsResult
        case 'load_cached_launcher_updates':
          return null
        case 'check_launcher_updates':
          return { modsPath: DEV_LAUNCHER_MOCK_MODS_PATH, checkedAtMs: Date.now(), updates: [] } satisfies LauncherUpdatesResult
        case 'set_launcher_mod_enabled': {
          const setEnabledRequest = getMockRequest<{ modPath?: string; enabled?: boolean }>(payload)
          return {
            absolutePath: String(setEnabledRequest?.modPath ?? ''),
            enabled: Boolean(setEnabledRequest?.enabled),
          }
        }
        case 'open_launcher_path':
        case 'open_launcher_url':
        case 'write_frontend_log':
          return null
        case 'get_launcher_backup_directory':
          return 'E:\\ModForge Dev\\Backups'
        case 'validate_nexus_api_key':
          return {
            userName: 'Dev User',
            isPremium: true,
            dailyRemaining: null,
            hourlyRemaining: null,
            dailyResetAt: null,
            hourlyResetAt: null,
          }
        case 'start_nexus_sso':
          return { ssoId: 'dev-sso', status: 'idle' }
        case 'get_nexus_sso_status':
          return { status: 'idle', isPremium: false }
        case 'cancel_nexus_sso':
          return null
        default:
          throw new Error(`Unhandled dev launcher mock command: ${command}`)
      }
    },
    { shouldMockEvents: true },
  )
}
