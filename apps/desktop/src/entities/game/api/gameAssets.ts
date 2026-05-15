import { normalizeCachePathSegment } from '@shared/lib/assets'
import { createPromiseCache, getLocalizedRootedAssetCacheKey, readCached, readPending } from '@shared/lib/desktop/cache'
import { invokeDesktop } from '@shared/lib/desktop/runtime'
import type {
  AudioAssetSummary,
  DefaultSaveSlotSummary,
  EventAssetSummary,
  GameDirectoryInfo,
  LocalTextFileContent,
  MapAssetContent,
  MapAssetSummary,
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
  }
}
/** Asks the desktop backend to detect the default Stardew Valley install directory. */
export function detectDefaultGameDirectory() {
  return invokeDesktop<string | null>('detect_default_game_directory')
}

/** Lists previously discovered or persisted Stardew Valley install directories. */
export function listKnownGameDirectories() {
  return readCached(listKnownGameDirectoriesCache, 'default', () => invokeDesktop<string[]>('list_known_game_directories'))
}

/** Validates a candidate game root and returns normalized paths required by editors. */
export function validateGameDirectory(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readCached(validateDirectoryCache, cacheKey, () => invokeDesktop<GameDirectoryInfo>('validate_game_directory', { path }))
}

/** Scans the game root for map assets and returns localized display metadata when available. */
export function scanMaps(path: string, locale?: string) {
  const cacheKey = `${normalizeCachePathSegment(path)}::${locale?.trim() || 'default'}`
  return readCached(scanMapsCache, cacheKey, () => invokeDesktop<MapAssetSummary[]>('scan_maps', { path, locale }))
}

/** Scans the game root for event script assets. */
export function scanEvents(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readCached(scanEventsCache, cacheKey, () => invokeDesktop<EventAssetSummary[]>('scan_events', { path }))
}

/** Loads a map asset body from the game root for editor preview and patching. */
export function loadMapAsset(rootPath: string, mapPath: string, locale?: string) {
  const cacheKey = getLocalizedRootedAssetCacheKey(rootPath, mapPath, locale)
  return readPending(loadMapAssetCache, cacheKey, () => invokeDesktop<MapAssetContent>('load_map_asset', { rootPath, mapPath, locale }))
}

/** Loads a Stardew text/data asset from the game root. */
export function loadTextAsset(rootPath: string, assetPath: string, locale?: string) {
  const cacheKey = getLocalizedRootedAssetCacheKey(rootPath, assetPath, locale)
  return readPending(loadTextAssetCache, cacheKey, () =>
    invokeDesktop<TextAssetContent>('load_text_asset', { rootPath, assetPath, locale }),
  )
}

/** Loads an arbitrary local text file through the desktop backend. */
export function loadTextFile(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readCached(loadTextFileCache, cacheKey, () => invokeDesktop<LocalTextFileContent>('load_text_file', { path }))
}

/** Loads an image file as a data URL that can be rendered safely by the webview. */
export function loadImageDataUrl(path: string, locale?: string) {
  const cacheKey = `${normalizeCachePathSegment(path)}::${locale?.trim() || 'default'}`
  return readPending(loadImageDataUrlCache, cacheKey, () => invokeDesktop<string>('load_image_data_url', { path, locale }))
}

/** Scans audio cues and files available under the game root. */
export function scanAudioAssets(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readCached(scanAudioAssetsCache, cacheKey, () => invokeDesktop<AudioAssetSummary[]>('scan_audio_assets', { path }))
}

/** Loads a supported audio file as a browser-playable data URL. */
export function loadAudioDataUrl(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readPending(loadAudioDataUrlCache, cacheKey, () => invokeDesktop<string>('load_audio_data_url', { path }))
}

/** Resolves and decodes a vanilla XACT cue into a browser-playable data URL. */
export function loadXactAudioDataUrl(rootPath: string, cue: string) {
  const cacheKey = `${normalizeCachePathSegment(rootPath)}::${cue.trim()}`
  return readPending(loadXactAudioDataUrlCache, cacheKey, () => invokeDesktop<string>('load_xact_audio_data_url', { rootPath, cue }))
}

/** Scans the default Stardew Valley save directory for player save slots. */
export function scanDefaultSaveSlots() {
  return readCached(scanDefaultSaveSlotsCache, 'default', () => invokeDesktop<DefaultSaveSlotSummary[]>('scan_default_save_slots'))
}
