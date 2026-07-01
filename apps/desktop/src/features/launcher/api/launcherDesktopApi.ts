import { HOST_COMMANDS } from '@platform/host-commands'
import { normalizeCachePathSegment } from '@shared/lib/assets'
import { createPromiseCache, readCached, readPending } from '@shared/lib/cache'
import { canUseDesktopHost, getPlatformPorts, invokeDesktop } from '@platform/host/runtime'
import type { UnlistenFn } from '@platform/host/dialogs'
import type { HostCommandPolicy } from '@platform/host-command-client'
import type {
  CheckLauncherUpdatesRequest,
  DownloadLauncherModRequest,
  DownloadLauncherModResult,
  InspectLauncherArchiveRequest,
  InspectLauncherArchiveResult,
  InstallLauncherArchiveRequest,
  InstallLauncherArchiveResult,
  LauncherCatalogPageResult,
  LauncherDownloadProgressPayload,
  LauncherDownloadQueueState,
  LauncherImageFetchDisconnectedPayload,
  LauncherGameLaunchResult,
  LauncherInstallBackupSummary,
  LauncherLibraryCoversState,
  LauncherImageFailuresState,
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
  RecordLauncherImageFailureRequest,
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
const LAUNCHER_DOWNLOAD_PROGRESS_EVENT = 'launcher://download-progress'
const LAUNCHER_UPDATES_CACHE_TTL_MS = 30 * 60 * 1000
const launcherUpdatesPendingRequests = new Map<string, Promise<LauncherUpdatesResult>>()
const launcherUpdatesSnapshots = new Map<string, { result: LauncherUpdatesResult; isFinal: boolean; sessionId: string | null }>()
const launcherUpdatesListeners = new Map<string, Set<(result: LauncherUpdatesResult) => void>>()
const launcherUpdatesRequestVersions = new Map<string, number>()
const launcherUpdatesActiveSessions = new Map<string, string>()
const invalidLauncherRemoteModIds = new Set<number>()
let launcherUpdatesProgressBridgePromise: Promise<void> | null = null
let launcherUpdatesSessionCounter = 0

const LAUNCHER_IMAGE_FETCH_DISCONNECTED_EVENT = 'launcher://image-fetch-disconnected'
const launcherSettingsMutationPolicy = { kind: 'exclusiveMutation', resource: 'LauncherSettings' } satisfies HostCommandPolicy
const launcherLibraryMutationPolicy = { kind: 'exclusiveMutation', resource: 'LauncherLibraryState' } satisfies HostCommandPolicy
const launcherCoversMutationPolicy = { kind: 'exclusiveMutation', resource: 'LauncherLibraryCovers' } satisfies HostCommandPolicy
const launcherDownloadQueueMutationPolicy = { kind: 'exclusiveMutation', resource: 'LauncherDownloadQueue' } satisfies HostCommandPolicy
const launcherInstallMutationPolicy = { kind: 'exclusiveMutation', resource: 'LauncherInstallTree' } satisfies HostCommandPolicy
const launcherImageCacheMutationPolicy = { kind: 'exclusiveMutation', resource: 'LauncherImageCache' } satisfies HostCommandPolicy
const launcherIoPoolPolicy = { kind: 'parallelPool', pool: 'launcher-io', limit: 2 } satisfies HostCommandPolicy
const launcherNetworkPoolPolicy = { kind: 'parallelPool', pool: 'launcher-network', limit: 4 } satisfies HostCommandPolicy
const launcherCachedImagePoolPolicy = { kind: 'parallelPool', pool: 'launcher-cached-images', limit: 8 } satisfies HostCommandPolicy
// Launcher cover probe 2026-07-01: Nexus image CDN completed 24/32/40/48/56
// concurrent GET body downloads with HTTP 200; 64+ became unstable with TLS
// ECONNRESET, not HTTP 429. Keep the cover pool below that cliff.
const launcherImagePoolPolicy = { kind: 'parallelPool', pool: 'launcher-images', limit: 40 } satisfies HostCommandPolicy
const launcherDownloadPoolPolicy = { kind: 'parallelPool', pool: 'launcher-downloads', limit: 2 } satisfies HostCommandPolicy
const launcherArchiveIoPolicy = { kind: 'parallelPool', pool: 'launcher-archive-io', limit: 2 } satisfies HostCommandPolicy
const launcherUpdatesNetworkPoolPolicy = { kind: 'parallelPool', pool: 'launcher-updates', limit: 2 } satisfies HostCommandPolicy

function launcherControlPolicy(key: string): HostCommandPolicy {
  return { kind: 'serviceGate', key: `launcher-control:${key}` }
}

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

function normalizeLauncherRemoteModId(modId: number | null | undefined) {
  if (typeof modId !== 'number' || !Number.isFinite(modId)) {
    return null
  }
  const normalized = Math.trunc(modId)
  return normalized > 0 ? normalized : null
}

function createInvalidLauncherRemoteModIdError(modId: number) {
  return new Error(`Nexus mod ${modId} is unavailable.`)
}

function isUnavailableLauncherRemoteDetailError(error: unknown) {
  return error instanceof Error && error.message.trim().startsWith('Nexus mod unavailable:')
}

/** Returns whether a Nexus mod id was identified as unavailable during this app session. */
export function isLauncherRemoteModIdInvalid(modId: number | null | undefined) {
  const normalized = normalizeLauncherRemoteModId(modId)
  return normalized == null ? false : invalidLauncherRemoteModIds.has(normalized)
}

/** Marks a Nexus mod id as unavailable so future remote detail/file lookups short-circuit locally. */
export function markLauncherRemoteModIdInvalid(modId: number | null | undefined) {
  const normalized = normalizeLauncherRemoteModId(modId)
  if (normalized == null) {
    return
  }
  invalidLauncherRemoteModIds.add(normalized)
  loadLauncherRemoteModDetailCache.deleteWhere((key) => key.startsWith(`${normalized}:`))
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
  const result = await invokeDesktop<void>(HOST_COMMANDS.clearLauncherImageCache, undefined, launcherImageCacheMutationPolicy)
  loadLauncherLibraryCoversCache.delete('default')
  scanLauncherLibraryCache.clear()
  return result
}

/** Loads persisted launcher settings. */
export function loadLauncherSettings() {
  return readCached(loadLauncherSettingsCache, 'default', () =>
    invokeDesktop<LauncherSettings>(HOST_COMMANDS.loadLauncherSettings, undefined, launcherIoPoolPolicy),
  )
}

/** Loads persisted launcher library organization state. */
export function loadLauncherLibraryState() {
  return readPending(loadLauncherLibraryStateCache, 'default', () =>
    invokeDesktop<LauncherLibraryState>(HOST_COMMANDS.loadLauncherLibraryState, undefined, launcherIoPoolPolicy),
  )
}

/** Loads locally assigned or cached launcher library cover images. */
export function loadLauncherLibraryCovers() {
  return readPending(loadLauncherLibraryCoversCache, 'default', () =>
    invokeDesktop<LauncherLibraryCoversState>(HOST_COMMANDS.loadLauncherLibraryCovers, undefined, launcherIoPoolPolicy),
  )
}

/** Loads persisted launcher image failure metadata. */
export function loadLauncherImageFailures() {
  return invokeDesktop<LauncherImageFailuresState>(HOST_COMMANDS.loadLauncherImageFailures, undefined, launcherIoPoolPolicy)
}

/** Records a failed launcher cover lookup for one mod key. */
export function recordLauncherImageFailure(request: RecordLauncherImageFailureRequest) {
  return invokeDesktop<LauncherImageFailuresState>(HOST_COMMANDS.recordLauncherImageFailure, { request }, launcherImageCacheMutationPolicy)
}

/** Loads persisted launcher download queue state. */
export function loadLauncherDownloadQueue() {
  return readCached(loadLauncherDownloadQueueCache, 'default', () =>
    invokeDesktop<LauncherDownloadQueueState>(HOST_COMMANDS.loadLauncherDownloadQueue, undefined, launcherIoPoolPolicy),
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
  const result = await invokeDesktop<LauncherSettings>(HOST_COMMANDS.saveLauncherSettings, { request }, launcherSettingsMutationPolicy)
  loadLauncherSettingsCache.delete('default')
  scanLauncherLibraryCache.clear()
  invalidateLauncherUpdatesState(result.modsPath)
  return result
}

/** Saves launcher library organization state. */
export async function saveLauncherLibraryState(request: LauncherLibraryState) {
  const result = await invokeDesktop<LauncherLibraryState>(
    HOST_COMMANDS.saveLauncherLibraryState,
    { request },
    launcherLibraryMutationPolicy,
  )
  loadLauncherLibraryStateCache.delete('default')
  return result
}

/** Assigns or clears a local cover image for one launcher library mod. */
export async function setLauncherLibraryCover(request: SetLauncherLibraryCoverRequest) {
  const result = await invokeDesktop<LauncherLibraryCoversState>(
    HOST_COMMANDS.setLauncherLibraryCover,
    { request },
    launcherCoversMutationPolicy,
  )
  loadLauncherLibraryCoversCache.delete('default')
  scanLauncherLibraryCache.clear()
  return result
}

/** Downloads and persists a remote image as a library cover for one mod. */
export async function persistLauncherLibraryRemoteCover(request: PersistLauncherLibraryRemoteCoverRequest) {
  const result = await invokeDesktop<LauncherLibraryCoversState>(
    HOST_COMMANDS.persistLauncherLibraryRemoteCover,
    { request },
    launcherCoversMutationPolicy,
  )
  loadLauncherLibraryCoversCache.delete('default')
  scanLauncherLibraryCache.clear()
  return result
}

/** Persists launcher download queue state. */
export async function saveLauncherDownloadQueue(request: LauncherDownloadQueueState) {
  const result = await invokeDesktop<LauncherDownloadQueueState>(
    HOST_COMMANDS.saveLauncherDownloadQueue,
    { request },
    launcherDownloadQueueMutationPolicy,
  )
  loadLauncherDownloadQueueCache.delete('default')
  return result
}

/** Scans the configured Mods folder and returns normalized launcher library entries. */
export function scanLauncherLibrary(request: ScanLauncherLibraryRequest) {
  const cacheKey = normalizeCachePathSegment(request.modsPath)
  return readPending(scanLauncherLibraryCache, cacheKey, () =>
    invokeDesktop<LauncherLibraryScanResult>(HOST_COMMANDS.scanLauncherLibrary, { request }, launcherIoPoolPolicy),
  )
}

/** Loads detected Stardew Valley and SMAPI runtime versions for the launcher header. */
export function loadLauncherRuntimeInfo() {
  return invokeDesktop<LauncherRuntimeInfo>(HOST_COMMANDS.loadLauncherRuntimeInfo, undefined, launcherIoPoolPolicy)
}

/** Launches Stardew Valley through the preferred launcher target. */
export function launchLauncherGame() {
  return invokeDesktop<LauncherGameLaunchResult>(HOST_COMMANDS.launchLauncherGame, undefined, launcherControlPolicy('launch-game'))
}

/** Enables or disables one mod folder and invalidates library/update caches. */
export async function setLauncherModEnabled(request: SetLauncherModEnabledRequest) {
  const result = await invokeDesktop<SetLauncherModEnabledResult>(
    HOST_COMMANDS.setLauncherModEnabled,
    { request },
    launcherInstallMutationPolicy,
  )
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
    invokeDesktop<LauncherCatalogPageResult>(HOST_COMMANDS.searchLauncherCatalog, { request }, launcherNetworkPoolPolicy),
  )
}

/** Loads remote catalog detail for one Nexus mod. */
export function loadLauncherRemoteModDetail(request: LoadLauncherRemoteModDetailRequest) {
  if (isLauncherRemoteModIdInvalid(request.modId)) {
    return Promise.reject(createInvalidLauncherRemoteModIdError(Math.trunc(request.modId)))
  }

  const cacheKey = `${request.modId}:${(request.includeFiles ?? true) ? 'files' : 'meta'}`
  return readPending(loadLauncherRemoteModDetailCache, cacheKey, () =>
    invokeDesktop<LauncherRemoteModDetail>(HOST_COMMANDS.loadLauncherRemoteModDetail, { request }, launcherNetworkPoolPolicy)
      .then((result) => {
        if (result.unavailable) {
          markLauncherRemoteModIdInvalid(request.modId)
          throw createInvalidLauncherRemoteModIdError(Math.trunc(request.modId))
        }
        return result
      })
      .catch((error) => {
        if (isUnavailableLauncherRemoteDetailError(error)) {
          markLauncherRemoteModIdInvalid(request.modId)
        }
        throw error
      }),
  )
}

/** Loads changelog text for a remote mod update. */
export function loadLauncherUpdateChangelog(request: LoadLauncherUpdateChangelogRequest) {
  const cacheKey = String(request.modId)
  return readPending(loadLauncherUpdateChangelogCache, cacheKey, () =>
    invokeDesktop<LauncherUpdateChangelogResult>(HOST_COMMANDS.loadLauncherUpdateChangelog, { request }, launcherNetworkPoolPolicy),
  )
}

/** Loads current Nexus route diagnostics without forcing a restart. */
export function loadLauncherNexusDiagnostics() {
  return invokeDesktop<LauncherNexusDiagnosticsResult>(HOST_COMMANDS.loadLauncherNexusDiagnostics, undefined, launcherNetworkPoolPolicy)
}

/** Restarts all Nexus diagnostics routes and returns fresh snapshots. */
export function restartLauncherNexusDiagnostics() {
  return invokeDesktop<LauncherNexusDiagnosticsResult>(HOST_COMMANDS.restartLauncherNexusDiagnostics, undefined, {
    kind: 'exclusiveMutation',
    resource: 'NexusDiagnosticsRoute',
  })
}

/** Retries one failed or warning Nexus diagnostics route. */
export function retryLauncherNexusDiagnosticsRoute(routeId: string) {
  return invokeDesktop<LauncherNexusDiagnosticsResult>(
    HOST_COMMANDS.retryLauncherNexusDiagnosticsRoute,
    { routeId },
    { kind: 'exclusiveMutation', resource: `NexusDiagnosticsRoute:${routeId}` },
  )
}

/** Sets the launcher Nexus force-offline override and returns updated diagnostics. */
export function setLauncherNexusForceOffline(forceOffline: boolean) {
  return invokeDesktop<LauncherNexusDiagnosticsResult>(
    HOST_COMMANDS.setLauncherNexusForceOffline,
    { forceOffline },
    { kind: 'exclusiveMutation', resource: 'NexusDiagnosticsRoute' },
  )
}
/** Validates the configured Nexus API key and returns account/quota data. */
export function validateNexusApiKey() {
  return invokeDesktop<ValidateApiKeyResult>(HOST_COMMANDS.validateNexusApiKey, undefined, launcherNetworkPoolPolicy)
}

/** Starts the Nexus SSO authorization flow. */
export function startNexusSso() {
  return invokeDesktop<{ ssoId: string; status: SsoConnectionStatus }>(
    HOST_COMMANDS.startNexusSso,
    undefined,
    launcherControlPolicy('nexus-sso'),
  )
}

/** Reads the current Nexus SSO flow status. */
export function getNexusSsoStatus() {
  return invokeDesktop<SsoSnapshot>(HOST_COMMANDS.getNexusSsoStatus, undefined, launcherControlPolicy('nexus-sso-status'))
}

/** Cancels the active Nexus SSO flow, if any. */
export function cancelNexusSso() {
  return invokeDesktop<void>(HOST_COMMANDS.cancelNexusSso, undefined, launcherControlPolicy('nexus-sso'))
}

/** Resolves a remote launcher image into a local cached image file. */
export function resolveLauncherImage(request: ResolveLauncherImageRequest) {
  return invokeDesktop<ResolveLauncherImageResult>(HOST_COMMANDS.resolveLauncherImage, { request }, launcherImagePoolPolicy)
}

/** Resolves a launcher image only when it is already local or cached on disk. */
export function resolveCachedLauncherImage(request: ResolveLauncherImageRequest) {
  return invokeDesktop<ResolveLauncherImageResult | null>(
    HOST_COMMANDS.resolveCachedLauncherImage,
    { request },
    launcherCachedImagePoolPolicy,
  )
}

/** Returns the directory used for launcher install backups. */
export function getLauncherBackupDirectory() {
  return invokeDesktop<string>(HOST_COMMANDS.getLauncherBackupDirectory, undefined, launcherIoPoolPolicy)
}

/** Opens a local path in the host file manager. */
export function openLauncherPath(request: OpenLauncherPathRequest) {
  return invokeDesktop<void>(HOST_COMMANDS.openLauncherPath, { request }, launcherControlPolicy('open-path'))
}

/** Opens an external URL in the host browser. */
export function openLauncherUrl(request: OpenLauncherUrlRequest) {
  return invokeDesktop<void>(HOST_COMMANDS.openLauncherUrl, { request }, launcherControlPolicy('open-url'))
}

/** Loads a fresh cached update result from memory or the desktop backend. */
export async function loadCachedLauncherUpdates(request: LoadCachedLauncherUpdatesRequest) {
  const localCached = tryGetFreshLauncherUpdatesResult(request.modsPath)
  if (localCached) {
    return localCached
  }

  const result = await invokeDesktop<LauncherUpdatesResult | null>(
    HOST_COMMANDS.loadCachedLauncherUpdates,
    { request },
    launcherIoPoolPolicy,
  )
  return result ? storeLauncherUpdatesResult(result, isLauncherUpdatesResultComplete(result)) : null
}

/** Loads Nexus mod IDs suppressed from launcher update notifications. */
export async function loadSuppressedLauncherUpdateModIds(request: LoadSuppressedLauncherUpdateModIdsRequest) {
  return invokeDesktop<LauncherSuppressedUpdateModIdsResult>(
    HOST_COMMANDS.loadSuppressedLauncherUpdateModIds,
    { request },
    launcherIoPoolPolicy,
  )
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
  const promise = invokeDesktop<LauncherUpdatesResult>(
    HOST_COMMANDS.checkLauncherUpdates,
    {
      request: {
        ...request,
        sessionId,
      },
    },
    launcherUpdatesNetworkPoolPolicy,
  )
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

/** Listens to launcher cover fetch disconnects emitted by the desktop backend. */
export function listenToLauncherImageFetchDisconnected(
  listener: (payload: LauncherImageFetchDisconnectedPayload) => void,
): Promise<UnlistenFn> {
  return getPlatformPorts().hostEvents.listen<LauncherImageFetchDisconnectedPayload>(LAUNCHER_IMAGE_FETCH_DISCONNECTED_EVENT, listener)
}

/** Queues or starts a remote mod archive download. */
export function downloadLauncherMod(request: DownloadLauncherModRequest) {
  if (isLauncherRemoteModIdInvalid(request.modId)) {
    return Promise.reject(createInvalidLauncherRemoteModIdError(Math.trunc(request.modId)))
  }

  return invokeDesktop<DownloadLauncherModResult>(HOST_COMMANDS.downloadLauncherMod, { request }, launcherDownloadPoolPolicy)
}

/** Cancels one in-flight launcher download by queue item id. */
export function cancelLauncherDownload(downloadId: string) {
  return invokeDesktop<void>(HOST_COMMANDS.cancelLauncherDownload, { downloadId }, launcherControlPolicy(`cancel-download:${downloadId}`))
}

/** Listens to chunk-level progress events emitted by active launcher downloads. */
export function listenToLauncherDownloadProgress(listener: (payload: LauncherDownloadProgressPayload) => void): Promise<UnlistenFn> {
  return getPlatformPorts().hostEvents.listen<LauncherDownloadProgressPayload>(LAUNCHER_DOWNLOAD_PROGRESS_EVENT, listener)
}

/** Installs a local archive into the Mods folder and invalidates library/update caches. */
export async function installLauncherArchive(request: InstallLauncherArchiveRequest) {
  const result = await invokeDesktop<InstallLauncherArchiveResult>(
    HOST_COMMANDS.installLauncherArchive,
    { request },
    launcherInstallMutationPolicy,
  )
  scanLauncherLibraryCache.clear()
  invalidateLauncherUpdatesState(request.modsPath)
  return result
}

/** Lists install backups available for a Mods folder. */
export function listLauncherInstallBackups(request: ListLauncherInstallBackupsRequest) {
  return invokeDesktop<LauncherInstallBackupSummary[]>(HOST_COMMANDS.listLauncherInstallBackups, { request }, launcherArchiveIoPolicy)
}

/** Restores an install backup and invalidates affected library/update caches. */
export async function restoreLauncherInstallBackup(request: RestoreLauncherInstallBackupRequest) {
  const result = await invokeDesktop<RestoreLauncherInstallBackupResult>(
    HOST_COMMANDS.restoreLauncherInstallBackup,
    { request },
    launcherInstallMutationPolicy,
  )
  scanLauncherLibraryCache.clear()
  for (const restoredPath of result.restoredPaths) {
    invalidateLauncherUpdatesState(parentDirectoryFromPath(restoredPath))
  }
  return result
}

/** Inspects an archive before install and returns its file tree and detected mod roots. */
export function inspectLauncherArchive(request: InspectLauncherArchiveRequest) {
  return invokeDesktop<InspectLauncherArchiveResult>(HOST_COMMANDS.inspectLauncherArchive, { request }, launcherArchiveIoPolicy)
}
