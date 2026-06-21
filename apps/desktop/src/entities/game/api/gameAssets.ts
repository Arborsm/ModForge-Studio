import { HOST_COMMANDS } from '@platform/host-commands'
import { normalizeCachePathSegment } from '@shared/lib/assets'
import { createPromiseCache, getLocalizedRootedAssetCacheKey, readCached, readPending } from '@shared/lib/cache'
import { invokeDesktop } from '@platform/host/runtime'
import type { HostCommandPolicy } from '@platform/host-command-client'
import { loadImageDataUrlFromDevBridge, loadResourceRegistryFromDevBridge, loadTextAssetFromDevBridge } from './devAssetBridge'
import type {
  AudioAssetSummary,
  DefaultSaveSlotSummary,
  EventAssetSummary,
  GameDirectoryInfo,
  LocalTextFileContent,
  MapAssetContent,
  MapAssetSummary,
  ResourceRegistry,
  TextAssetContent,
} from './types'
const validateDirectoryCache = createPromiseCache<GameDirectoryInfo>()
const listKnownGameDirectoriesCache = createPromiseCache<string[]>()
const scanMapsCache = createPromiseCache<MapAssetSummary[]>()
const scanEventsCache = createPromiseCache<EventAssetSummary[]>()
const loadMapAssetCache = createPromiseCache<MapAssetContent>()
const loadTextAssetCache = createPromiseCache<TextAssetContent>()
const loadTextFileCache = createPromiseCache<LocalTextFileContent>()
const loadImageDataUrlCache = createPromiseCache<string>()
const scanAudioAssetsCache = createPromiseCache<AudioAssetSummary[]>()
const loadAudioDataUrlCache = createPromiseCache<string>()
const loadXactAudioDataUrlCache = createPromiseCache<string>()
const scanDefaultSaveSlotsCache = createPromiseCache<DefaultSaveSlotSummary[]>()
const loadResourceRegistryCache = createPromiseCache<ResourceRegistry>()

const hostIoPolicy = { kind: 'parallelPool', pool: 'host-io', limit: 2 } satisfies HostCommandPolicy
const gameAssetPoolPolicy = { kind: 'parallelPool', pool: 'game-assets', limit: 2 } satisfies HostCommandPolicy
const imageResolvePoolPolicy = { kind: 'parallelPool', pool: 'image-resolve', limit: 4 } satisfies HostCommandPolicy
const audioResolvePoolPolicy = { kind: 'parallelPool', pool: 'audio-resolve', limit: 2 } satisfies HostCommandPolicy

/** Clears locale-scoped game asset cache entries after the UI language changes. */
export function clearGameAssetLocaleCache(locale: string) {
  const normalizedLocale = locale.trim()
  if (!normalizedLocale) {
    return
  }

  const localizedSuffix = `::${normalizedLocale}`
  scanMapsCache.deleteWhere((key) => key.endsWith(localizedSuffix))
  loadMapAssetCache.deleteWhere((key) => key.endsWith(localizedSuffix))
  loadTextAssetCache.deleteWhere((key) => key.endsWith(localizedSuffix))
  loadImageDataUrlCache.deleteWhere((key) => key.endsWith(localizedSuffix))
  loadResourceRegistryCache.deleteWhere((key) => key.endsWith(localizedSuffix))
}

/** Returns cache sizes for the game asset desktop API, used by debug tooling. */
export function getGameAssetCacheStats() {
  return {
    validateDirectory: validateDirectoryCache.size(),
    scanMaps: scanMapsCache.size(),
    scanEvents: scanEventsCache.size(),
    mapAsset: loadMapAssetCache.size(),
    textAsset: loadTextAssetCache.size(),
    textFile: loadTextFileCache.size(),
    imageDataUrl: loadImageDataUrlCache.size(),
    audioScan: scanAudioAssetsCache.size(),
    audioDataUrl: loadAudioDataUrlCache.size(),
    xactAudioDataUrl: loadXactAudioDataUrlCache.size(),
    saveSlots: scanDefaultSaveSlotsCache.size(),
    resourceRegistry: loadResourceRegistryCache.size(),
  }
}
/** Asks the desktop backend to detect the default Stardew Valley install directory. */
export function detectDefaultGameDirectory() {
  return invokeDesktop<string | null>(HOST_COMMANDS.detectDefaultGameDirectory, undefined, hostIoPolicy)
}

/** Lists previously discovered or persisted Stardew Valley install directories. */
export function listKnownGameDirectories() {
  return readCached(listKnownGameDirectoriesCache, 'default', () =>
    invokeDesktop<string[]>(HOST_COMMANDS.listKnownGameDirectories, undefined, hostIoPolicy),
  )
}

/** Validates a candidate game root and returns normalized paths required by editors. */
export function validateGameDirectory(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readCached(validateDirectoryCache, cacheKey, () =>
    invokeDesktop<GameDirectoryInfo>(HOST_COMMANDS.validateGameDirectory, { path }, gameAssetPoolPolicy),
  )
}

/** Scans the game root for map assets and returns localized display metadata when available. */
export function scanMaps(path: string, locale?: string) {
  const cacheKey = `${normalizeCachePathSegment(path)}::${locale?.trim() || 'default'}`
  return readCached(scanMapsCache, cacheKey, () =>
    invokeDesktop<MapAssetSummary[]>(HOST_COMMANDS.scanMaps, { path, locale }, gameAssetPoolPolicy),
  )
}

/** Scans the game root for event script assets. */
export function scanEvents(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readCached(scanEventsCache, cacheKey, () =>
    invokeDesktop<EventAssetSummary[]>(HOST_COMMANDS.scanEvents, { path }, gameAssetPoolPolicy),
  )
}

/** Loads a map asset body from the game root for editor preview and patching. */
export function loadMapAsset(rootPath: string, mapPath: string, locale?: string) {
  const cacheKey = getLocalizedRootedAssetCacheKey(rootPath, mapPath, locale)
  return readPending(loadMapAssetCache, cacheKey, () =>
    invokeDesktop<MapAssetContent>(HOST_COMMANDS.loadMapAsset, { rootPath, mapPath, locale }, gameAssetPoolPolicy),
  )
}

/** Loads a Stardew text/data asset from the game root. */
export function loadTextAsset(rootPath: string, assetPath: string, locale?: string) {
  const cacheKey = getLocalizedRootedAssetCacheKey(rootPath, assetPath, locale)
  return readPending(loadTextAssetCache, cacheKey, async () => {
    const bridged = await loadTextAssetFromDevBridge(rootPath, assetPath, locale)
    return bridged ?? invokeDesktop<TextAssetContent>(HOST_COMMANDS.loadTextAsset, { rootPath, assetPath, locale }, gameAssetPoolPolicy)
  })
}

/** Loads an arbitrary local text file through the desktop backend. */
export function loadTextFile(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readCached(loadTextFileCache, cacheKey, () =>
    invokeDesktop<LocalTextFileContent>(HOST_COMMANDS.loadTextFile, { path }, gameAssetPoolPolicy),
  )
}

/** Loads an image file as a data URL that can be rendered safely by the webview. */
export function loadImageDataUrl(path: string, locale?: string) {
  const cacheKey = `${normalizeCachePathSegment(path)}::${locale?.trim() || 'default'}`
  return readPending(loadImageDataUrlCache, cacheKey, async () => {
    const bridged = await loadImageDataUrlFromDevBridge(path, locale)
    return bridged ?? invokeDesktop<string>(HOST_COMMANDS.loadImageDataUrl, { path, locale }, imageResolvePoolPolicy)
  })
}

/** Scans audio cues and files available under the game root. */
export function scanAudioAssets(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readCached(scanAudioAssetsCache, cacheKey, () =>
    invokeDesktop<AudioAssetSummary[]>(HOST_COMMANDS.scanAudioAssets, { path }, gameAssetPoolPolicy),
  )
}

/** Loads a supported audio file as a browser-playable data URL. */
export function loadAudioDataUrl(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readPending(loadAudioDataUrlCache, cacheKey, () =>
    invokeDesktop<string>(HOST_COMMANDS.loadAudioDataUrl, { path }, audioResolvePoolPolicy),
  )
}

/** Resolves and decodes a vanilla XACT cue into a browser-playable data URL. */
export function loadXactAudioDataUrl(rootPath: string, cue: string) {
  const cacheKey = `${normalizeCachePathSegment(rootPath)}::${cue.trim()}`
  return readPending(loadXactAudioDataUrlCache, cacheKey, () =>
    invokeDesktop<string>(HOST_COMMANDS.loadXactAudioDataUrl, { rootPath, cue }, audioResolvePoolPolicy),
  )
}

/** Loads the global game resource registry maintained by the desktop backend. */
export function loadResourceRegistry(rootPath: string, locale?: string) {
  const cacheKey = `${normalizeCachePathSegment(rootPath)}::${locale?.trim() || 'default'}`
  return readPending(loadResourceRegistryCache, cacheKey, async () => {
    const bridged = await loadResourceRegistryFromDevBridge(rootPath, locale)
    return bridged ?? invokeDesktop<ResourceRegistry>(HOST_COMMANDS.loadResourceRegistry, { rootPath, locale }, gameAssetPoolPolicy)
  })
}

/** Scans the default Stardew Valley save directory for player save slots. */
export function scanDefaultSaveSlots() {
  return readCached(scanDefaultSaveSlotsCache, 'default', () =>
    invokeDesktop<DefaultSaveSlotSummary[]>(HOST_COMMANDS.scanDefaultSaveSlots, undefined, hostIoPolicy),
  )
}
