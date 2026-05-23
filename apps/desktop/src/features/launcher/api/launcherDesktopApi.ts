import { normalizeCachePathSegment } from '@shared/lib/assets'
import { createPromiseCache, readCached, readPending } from '@shared/lib/desktop/cache'
import { canUseDesktopHost, getPlatformPorts, invokeDesktop } from '@shared/lib/desktop/runtime'
import type { UnlistenFn } from '@shared/lib/desktop/dialogs'
import type {
  CheckLauncherUpdatesRequest,
  DownloadLauncherModRequest,
  DownloadLauncherModResult,
  InspectLauncherArchiveRequest,
  InspectLauncherArchiveResult,
  InstallLauncherArchiveRequest,
  InstallLauncherArchiveResult,
  LauncherCatalogPageResult,
  LauncherDownloadQueueState,
  LauncherGameLaunchResult,
  LauncherInstallBackupSummary,
  LauncherLibraryCoversState,
  LauncherLibraryScanResult,
  LauncherLibraryState,
  LauncherNexusDiagnosticsResult,
  LauncherRemoteModDetail,
  LauncherRuntimeInfo,
  LauncherSettings,
  LauncherSuppressedUpdateModIdsResult,
  LauncherUpdateChangelogResult,
  LauncherUpdateProgressPayload,
  LauncherUpdatesResult,
  ListLauncherInstallBackupsRequest,
  LoadCachedLauncherUpdatesRequest,
  LoadLauncherRemoteModDetailRequest,
  LoadLauncherUpdateChangelogRequest,
  LoadSuppressedLauncherUpdateModIdsRequest,
  OpenLauncherPathRequest,
  OpenLauncherUrlRequest,
  PersistLauncherLibraryRemoteCoverRequest,
  ResolveLauncherImageRequest,
  ResolveLauncherImageResult,
  RestoreLauncherInstallBackupRequest,
  RestoreLauncherInstallBackupResult,
  SaveLauncherSettingsRequest,
  ScanLauncherLibraryRequest,
  SearchLauncherCatalogRequest,
  SetLauncherLibraryCoverRequest,
  SetLauncherModEnabledRequest,
  SetLauncherModEnabledResult,
  SsoConnectionStatus,
  SsoSnapshot,
  ValidateApiKeyResult,
} from './types'
const loadLauncherSettingsCache = createPromiseCache<LauncherSettings>()
const loadLauncherLibraryStateCache = createPromiseCache<LauncherLibraryState>()
const loadLauncherLibraryCoversCache = createPromiseCache<LauncherLibraryCoversState>()
const loadLauncherDownloadQueueCache = createPromiseCache<LauncherDownloadQueueState>()
const scanLauncherLibraryCache = createPromiseCache<LauncherLibraryScanResult>()
const searchLauncherCatalogCache = createPromiseCache<LauncherCatalogPageResult>()
const loadLauncherRemoteModDetailCache = createPromiseCache<LauncherRemoteModDetail>()
const loadLauncherUpdateChangelogCache = createPromiseCache<LauncherUpdateChangelogResult>()
const LAUNCHER_UPDATE_PROGRESS_EVENT = 'launcher://update-check-progress'
const LAUNCHER_UPDATES_CACHE_TTL_MS = 30 * 60 * 1000
const launcherUpdatesPendingRequests = new Map<string, Promise<LauncherUpdatesResult>>()
const launcherUpdatesSnapshots = new Map<string, { result: LauncherUpdatesResult; isFinal: boolean; sessionId: string | null }>()
const launcherUpdatesListeners = new Map<string, Set<(result: LauncherUpdatesResult) => void>>()
const launcherUpdatesRequestVersions = new Map<string, number>()
const launcherUpdatesActiveSessions = new Map<string, string>()
let launcherUpdatesProgressBridgePromise: Promise<void> | null = null
let launcherUpdatesSessionCounter = 0

function getLauncherUpdatesCacheKey(modsPath: string) {
  return normalizeCachePathSegment(modsPath)
}

function hasFreshLauncherUpdatesResult(result: LauncherUpdatesResult) {
  return Date.now() - result.checkedAtMs < LAUNCHER_UPDATES_CACHE_TTL_MS
}

function isLauncherUpdatesResultComplete(result: LauncherUpdatesResult) {
  return result.isComplete !== false
}

function notifyLauncherUpdatesListeners(cacheKey: string, result: LauncherUpdatesResult) {
  const listeners = launcherUpdatesListeners.get(cacheKey)
  if (!listeners) {
    return
  }

  for (const listener of listeners) {
    listener(result)
  }
}

function nextLauncherUpdatesSessionId() {
  launcherUpdatesSessionCounter += 1
  return `launcher-updates:${Date.now()}:${launcherUpdatesSessionCounter}`
}

function storeLauncherUpdatesResult(result: LauncherUpdatesResult, isFinal: boolean, sessionId: string | null = null) {
  const cacheKey = getLauncherUpdatesCacheKey(result.modsPath)
  launcherUpdatesSnapshots.set(cacheKey, { result, isFinal, sessionId })
  notifyLauncherUpdatesListeners(cacheKey, result)
  return result
}

function getActiveLauncherUpdateProgressSessionId(payload: LauncherUpdateProgressPayload) {
  const normalizedModsPath = payload.modsPath?.trim()
  const sessionId = payload.sessionId?.trim()
  if (!normalizedModsPath || !sessionId) {
    return null
  }

  return launcherUpdatesActiveSessions.get(getLauncherUpdatesCacheKey(normalizedModsPath)) === sessionId ? sessionId : null
}

function storePartialLauncherUpdatesResult(payload: LauncherUpdateProgressPayload) {
  const sessionId = getActiveLauncherUpdateProgressSessionId(payload)
  if (!sessionId || !Array.isArray(payload.updates)) {
    return null
  }

  return storeLauncherUpdatesResult(
    {
      modsPath: payload.modsPath,
      checkedAtMs: 0,
      isComplete: false,
      updates: payload.updates,
    },
    false,
    sessionId,
  )
}

function nextLauncherUpdatesRequestVersion(cacheKey: string) {
  const version = (launcherUpdatesRequestVersions.get(cacheKey) ?? 0) + 1
  launcherUpdatesRequestVersions.set(cacheKey, version)
  return version
}

function invalidateLauncherUpdatesState(modsPath?: string | null) {
  const normalizedModsPath = modsPath?.trim()
  if (!normalizedModsPath) {
    launcherUpdatesSnapshots.clear()
    launcherUpdatesPendingRequests.clear()
    launcherUpdatesRequestVersions.clear()
    launcherUpdatesActiveSessions.clear()
    return
  }

  const cacheKey = getLauncherUpdatesCacheKey(normalizedModsPath)
  launcherUpdatesSnapshots.delete(cacheKey)
  launcherUpdatesPendingRequests.delete(cacheKey)
  launcherUpdatesRequestVersions.set(cacheKey, (launcherUpdatesRequestVersions.get(cacheKey) ?? 0) + 1)
  launcherUpdatesActiveSessions.delete(cacheKey)
}

function tryGetFreshLauncherUpdatesResult(modsPath: string) {
  const snapshot = launcherUpdatesSnapshots.get(getLauncherUpdatesCacheKey(modsPath))
  if (!snapshot?.isFinal || !hasFreshLauncherUpdatesResult(snapshot.result)) {
    return null
  }
  return snapshot.result
}

function ensureLauncherUpdatesProgressBridge() {
  if (launcherUpdatesProgressBridgePromise) {
    return launcherUpdatesProgressBridgePromise
  }

  if (!canUseDesktopHost()) {
    launcherUpdatesProgressBridgePromise = Promise.resolve()
    return launcherUpdatesProgressBridgePromise
  }

  launcherUpdatesProgressBridgePromise = getPlatformPorts()
    .hostEvents.listen<LauncherUpdateProgressPayload>(LAUNCHER_UPDATE_PROGRESS_EVENT, (payload) => {
      storePartialLauncherUpdatesResult(payload)
    })
    .then(() => undefined)
    .catch((error) => {
      launcherUpdatesProgressBridgePromise = null
      console.warn('Failed to bridge launcher update progress events.', error)
    })

  return launcherUpdatesProgressBridgePromise
}

function parentDirectoryFromPath(path: string) {
  const normalized = path.trim().replaceAll('/', '\\')
  if (!normalized) {
    return null
  }

  const lastSeparator = normalized.lastIndexOf('\\')
  if (lastSeparator <= 0) {
    return null
  }
  return normalized.slice(0, lastSeparator)
}

/** Subscribes to cached and in-flight update check snapshots for one Mods folder. */
export function subscribeLauncherUpdates(modsPath: string, listener: (result: LauncherUpdatesResult) => void) {
  void ensureLauncherUpdatesProgressBridge()
  const cacheKey = getLauncherUpdatesCacheKey(modsPath)
  const listeners = launcherUpdatesListeners.get(cacheKey) ?? new Set<(result: LauncherUpdatesResult) => void>()
  listeners.add(listener)
  launcherUpdatesListeners.set(cacheKey, listeners)
  const currentSnapshot = launcherUpdatesSnapshots.get(cacheKey)
  const activeSessionId = launcherUpdatesActiveSessions.get(cacheKey)
  const canReplayPartial =
    !currentSnapshot?.isFinal && Boolean(currentSnapshot?.sessionId) && currentSnapshot?.sessionId === activeSessionId
  if (currentSnapshot && (canReplayPartial || hasFreshLauncherUpdatesResult(currentSnapshot.result))) {
    listener(currentSnapshot.result)
  }

  return () => {
    const currentListeners = launcherUpdatesListeners.get(cacheKey)
    if (!currentListeners) {
      return
    }
    currentListeners.delete(listener)
    if (!currentListeners.size) {
      launcherUpdatesListeners.delete(cacheKey)
    }
  }
}

/** Clears cached launcher cover images and invalidates cover/library read caches. */
export async function clearLauncherImageCache() {
  const result = await invokeDesktop<void>('clear_launcher_image_cache')
  loadLauncherLibraryCoversCache.delete('default')
  scanLauncherLibraryCache.clear()
  return result
}

/** Loads persisted launcher settings. */
export function loadLauncherSettings() {
  return readCached(loadLauncherSettingsCache, 'default', () => invokeDesktop<LauncherSettings>('load_launcher_settings'))
}

/** Loads persisted launcher library organization state. */
export function loadLauncherLibraryState() {
  return readPending(loadLauncherLibraryStateCache, 'default', () => invokeDesktop<LauncherLibraryState>('load_launcher_library_state'))
}

/** Loads locally assigned or cached launcher library cover images. */
export function loadLauncherLibraryCovers() {
  return readPending(loadLauncherLibraryCoversCache, 'default', () =>
    invokeDesktop<LauncherLibraryCoversState>('load_launcher_library_covers'),
  )
}

/** Loads persisted launcher download queue state. */
export function loadLauncherDownloadQueue() {
  return readCached(loadLauncherDownloadQueueCache, 'default', () =>
    invokeDesktop<LauncherDownloadQueueState>('load_launcher_download_queue'),
  )
}

/** Clears launcher library read caches, optionally only for one Mods folder scan. */
export function clearLauncherLibraryReadCaches(modsPath?: string | null) {
  loadLauncherLibraryStateCache.delete('default')
  loadLauncherLibraryCoversCache.delete('default')
  if (modsPath?.trim()) {
    scanLauncherLibraryCache.delete(normalizeCachePathSegment(modsPath))
    return
  }
  scanLauncherLibraryCache.clear()
}

/** Saves launcher settings and invalidates derived library/update caches. */
export async function saveLauncherSettings(request: SaveLauncherSettingsRequest) {
  const result = await invokeDesktop<LauncherSettings>('save_launcher_settings', { request })
  loadLauncherSettingsCache.delete('default')
  scanLauncherLibraryCache.clear()
  invalidateLauncherUpdatesState(result.modsPath)
  return result
}

/** Saves launcher library organization state. */
export async function saveLauncherLibraryState(request: LauncherLibraryState) {
  const result = await invokeDesktop<LauncherLibraryState>('save_launcher_library_state', { request })
  loadLauncherLibraryStateCache.delete('default')
  return result
}

/** Assigns or clears a local cover image for one launcher library mod. */
export async function setLauncherLibraryCover(request: SetLauncherLibraryCoverRequest) {
  const result = await invokeDesktop<LauncherLibraryCoversState>('set_launcher_library_cover', { request })
  loadLauncherLibraryCoversCache.delete('default')
  scanLauncherLibraryCache.clear()
  return result
}

/** Downloads and persists a remote image as a library cover for one mod. */
export async function persistLauncherLibraryRemoteCover(request: PersistLauncherLibraryRemoteCoverRequest) {
  const result = await invokeDesktop<LauncherLibraryCoversState>('persist_launcher_library_remote_cover', { request })
  loadLauncherLibraryCoversCache.delete('default')
  scanLauncherLibraryCache.clear()
  return result
}

/** Persists launcher download queue state. */
export async function saveLauncherDownloadQueue(request: LauncherDownloadQueueState) {
  const result = await invokeDesktop<LauncherDownloadQueueState>('save_launcher_download_queue', { request })
  loadLauncherDownloadQueueCache.delete('default')
  return result
}

/** Scans the configured Mods folder and returns normalized launcher library entries. */
export function scanLauncherLibrary(request: ScanLauncherLibraryRequest) {
  const cacheKey = normalizeCachePathSegment(request.modsPath)
  return readPending(scanLauncherLibraryCache, cacheKey, () =>
    invokeDesktop<LauncherLibraryScanResult>('scan_launcher_library', { request }),
  )
}

/** Loads detected Stardew Valley and SMAPI runtime versions for the launcher header. */
export function loadLauncherRuntimeInfo() {
  return invokeDesktop<LauncherRuntimeInfo>('load_launcher_runtime_info')
}

/** Launches Stardew Valley through the preferred launcher target. */
export function launchLauncherGame() {
  return invokeDesktop<LauncherGameLaunchResult>('launch_launcher_game')
}

/** Enables or disables one mod folder and invalidates library/update caches. */
export async function setLauncherModEnabled(request: SetLauncherModEnabledRequest) {
  const result = await invokeDesktop<SetLauncherModEnabledResult>('set_launcher_mod_enabled', { request })
  scanLauncherLibraryCache.clear()
  invalidateLauncherUpdatesState(parentDirectoryFromPath(request.modPath))
  return result
}

/** Searches the remote mod catalog with normalized filters and pagination. */
export function searchLauncherCatalog(request: SearchLauncherCatalogRequest) {
  const cacheKey = JSON.stringify({
    query: request.query?.trim() || '',
    titleQuery: request.titleQuery?.trim() || '',
    descriptionQuery: request.descriptionQuery?.trim() || '',
    authorQuery: request.authorQuery?.trim() || '',
    uploaderQuery: request.uploaderQuery?.trim() || '',
    page: request.page ?? 1,
    pageSize: request.pageSize ?? 20,
    timeRange: request.timeRange ?? 'all',
    sort: request.sort ?? 'newest',
    ascending: request.ascending ?? false,
    category: request.category?.trim() || '',
    language: request.language?.trim() || '',
    tagsInclude: request.tagsInclude?.trim() || '',
    tagsExclude: request.tagsExclude?.trim() || '',
    includeAdult: request.includeAdult ?? false,
    minFileSize: request.minFileSize ?? null,
    maxFileSize: request.maxFileSize ?? null,
    minDownloads: request.minDownloads ?? null,
    maxDownloads: request.maxDownloads ?? null,
    minEndorsements: request.minEndorsements ?? null,
    maxEndorsements: request.maxEndorsements ?? null,
  })
  return readPending(searchLauncherCatalogCache, cacheKey, () =>
    invokeDesktop<LauncherCatalogPageResult>('search_launcher_catalog', { request }),
  )
}

/** Loads remote catalog detail for one Nexus mod. */
export function loadLauncherRemoteModDetail(request: LoadLauncherRemoteModDetailRequest) {
  const cacheKey = `${request.modId}:${(request.includeFiles ?? true) ? 'files' : 'meta'}`
  return readPending(loadLauncherRemoteModDetailCache, cacheKey, () =>
    invokeDesktop<LauncherRemoteModDetail>('load_launcher_remote_mod_detail', { request }),
  )
}

/** Loads changelog text for a remote mod update. */
export function loadLauncherUpdateChangelog(request: LoadLauncherUpdateChangelogRequest) {
  const cacheKey = String(request.modId)
  return readPending(loadLauncherUpdateChangelogCache, cacheKey, () =>
    invokeDesktop<LauncherUpdateChangelogResult>('load_launcher_update_changelog', { request }),
  )
}

/** Loads current Nexus route diagnostics without forcing a restart. */
export function loadLauncherNexusDiagnostics() {
  return invokeDesktop<LauncherNexusDiagnosticsResult>('load_launcher_nexus_diagnostics')
}

/** Restarts all Nexus diagnostics routes and returns fresh snapshots. */
export function restartLauncherNexusDiagnostics() {
  return invokeDesktop<LauncherNexusDiagnosticsResult>('restart_launcher_nexus_diagnostics')
}

/** Retries one failed or warning Nexus diagnostics route. */
export function retryLauncherNexusDiagnosticsRoute(routeId: string) {
  return invokeDesktop<LauncherNexusDiagnosticsResult>('retry_launcher_nexus_diagnostics_route', { routeId })
}

/** Sets the launcher Nexus force-offline override and returns updated diagnostics. */
export function setLauncherNexusForceOffline(forceOffline: boolean) {
  return invokeDesktop<LauncherNexusDiagnosticsResult>('set_launcher_nexus_force_offline', { forceOffline })
}
/** Validates the configured Nexus API key and returns account/quota data. */
export function validateNexusApiKey() {
  return invokeDesktop<ValidateApiKeyResult>('validate_nexus_api_key')
}

/** Starts the Nexus SSO authorization flow. */
export function startNexusSso() {
  return invokeDesktop<{ ssoId: string; status: SsoConnectionStatus }>('start_nexus_sso')
}

/** Reads the current Nexus SSO flow status. */
export function getNexusSsoStatus() {
  return invokeDesktop<SsoSnapshot>('get_nexus_sso_status')
}

/** Cancels the active Nexus SSO flow, if any. */
export function cancelNexusSso() {
  return invokeDesktop<void>('cancel_nexus_sso')
}

/** Resolves a remote launcher image into a local cached image file. */
export function resolveLauncherImage(request: ResolveLauncherImageRequest) {
  return invokeDesktop<ResolveLauncherImageResult>('resolve_launcher_image', { request })
}

/** Returns the directory used for launcher install backups. */
export function getLauncherBackupDirectory() {
  return invokeDesktop<string>('get_launcher_backup_directory')
}

/** Opens a local path in the host file manager. */
export function openLauncherPath(request: OpenLauncherPathRequest) {
  return invokeDesktop<void>('open_launcher_path', { request })
}

/** Opens an external URL in the host browser. */
export function openLauncherUrl(request: OpenLauncherUrlRequest) {
  return invokeDesktop<void>('open_launcher_url', { request })
}

/** Loads a fresh cached update result from memory or the desktop backend. */
export async function loadCachedLauncherUpdates(request: LoadCachedLauncherUpdatesRequest) {
  const localCached = tryGetFreshLauncherUpdatesResult(request.modsPath)
  if (localCached) {
    return localCached
  }

  const result = await invokeDesktop<LauncherUpdatesResult | null>('load_cached_launcher_updates', { request })
  return result ? storeLauncherUpdatesResult(result, isLauncherUpdatesResultComplete(result)) : null
}

/** Loads Nexus mod IDs suppressed from launcher update notifications. */
export async function loadSuppressedLauncherUpdateModIds(request: LoadSuppressedLauncherUpdateModIdsRequest) {
  return invokeDesktop<LauncherSuppressedUpdateModIdsResult>('load_suppressed_launcher_update_mod_ids', { request })
}

/** Checks installed mods for remote updates and streams progress by session id. */
export function checkLauncherUpdates(request: CheckLauncherUpdatesRequest) {
  const cacheKey = getLauncherUpdatesCacheKey(request.modsPath)
  if (!request.forceRefresh) {
    const pending = launcherUpdatesPendingRequests.get(cacheKey)
    if (pending) {
      return pending
    }
  }

  const requestVersion = nextLauncherUpdatesRequestVersion(cacheKey)
  const sessionId = nextLauncherUpdatesSessionId()
  launcherUpdatesActiveSessions.set(cacheKey, sessionId)
  void ensureLauncherUpdatesProgressBridge()
  const promise = invokeDesktop<LauncherUpdatesResult>('check_launcher_updates', {
    request: {
      ...request,
      sessionId,
    },
  })
    .then((result) => {
      if (launcherUpdatesRequestVersions.get(cacheKey) === requestVersion) {
        storeLauncherUpdatesResult(result, isLauncherUpdatesResultComplete(result), sessionId)
      }
      return result
    })
    .catch((error) => {
      const snapshot = launcherUpdatesSnapshots.get(cacheKey)
      if (snapshot && !snapshot.isFinal && snapshot.sessionId === sessionId) {
        launcherUpdatesSnapshots.delete(cacheKey)
      }
      throw error
    })
    .finally(() => {
      if (launcherUpdatesPendingRequests.get(cacheKey) === promise) {
        launcherUpdatesPendingRequests.delete(cacheKey)
      }
      if (launcherUpdatesActiveSessions.get(cacheKey) === sessionId) {
        launcherUpdatesActiveSessions.delete(cacheKey)
      }
    })

  launcherUpdatesPendingRequests.set(cacheKey, promise)
  return promise
}

/** Listens to progress events for the currently active update-check session only. */
export function listenToLauncherUpdateProgress(listener: (payload: LauncherUpdateProgressPayload) => void): Promise<UnlistenFn> {
  return getPlatformPorts().hostEvents.listen<LauncherUpdateProgressPayload>(LAUNCHER_UPDATE_PROGRESS_EVENT, (payload) => {
    if (!getActiveLauncherUpdateProgressSessionId(payload)) {
      return
    }
    listener(payload)
  })
}

/** Queues or starts a remote mod archive download. */
export function downloadLauncherMod(request: DownloadLauncherModRequest) {
  return invokeDesktop<DownloadLauncherModResult>('download_launcher_mod', { request })
}

/** Installs a local archive into the Mods folder and invalidates library/update caches. */
export async function installLauncherArchive(request: InstallLauncherArchiveRequest) {
  const result = await invokeDesktop<InstallLauncherArchiveResult>('install_launcher_archive', { request })
  scanLauncherLibraryCache.clear()
  invalidateLauncherUpdatesState(request.modsPath)
  return result
}

/** Lists install backups available for a Mods folder. */
export function listLauncherInstallBackups(request: ListLauncherInstallBackupsRequest) {
  return invokeDesktop<LauncherInstallBackupSummary[]>('list_launcher_install_backups', { request })
}

/** Restores an install backup and invalidates affected library/update caches. */
export async function restoreLauncherInstallBackup(request: RestoreLauncherInstallBackupRequest) {
  const result = await invokeDesktop<RestoreLauncherInstallBackupResult>('restore_launcher_install_backup', { request })
  scanLauncherLibraryCache.clear()
  for (const restoredPath of result.restoredPaths) {
    invalidateLauncherUpdatesState(parentDirectoryFromPath(restoredPath))
  }
  return result
}

/** Inspects an archive before install and returns its file tree and detected mod roots. */
export function inspectLauncherArchive(request: InspectLauncherArchiveRequest) {
  return invokeDesktop<InspectLauncherArchiveResult>('inspect_launcher_archive', { request })
}
