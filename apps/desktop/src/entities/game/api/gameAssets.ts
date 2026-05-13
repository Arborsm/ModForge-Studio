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
export function detectDefaultGameDirectory() {
  return invokeDesktop<string | null>('detect_default_game_directory')
}

export function listKnownGameDirectories() {
  return readCached(listKnownGameDirectoriesCache, 'default', () =>
    invokeDesktop<string[]>('list_known_game_directories'),
  )
}

export function validateGameDirectory(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readCached(validateDirectoryCache, cacheKey, () =>
    invokeDesktop<GameDirectoryInfo>('validate_game_directory', { path }),
  )
}

export function scanMaps(path: string, locale?: string) {
  const cacheKey = `${normalizeCachePathSegment(path)}::${locale?.trim() || 'default'}`
  return readCached(scanMapsCache, cacheKey, () => invokeDesktop<MapAssetSummary[]>('scan_maps', { path, locale }))
}

export function scanEvents(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readCached(scanEventsCache, cacheKey, () => invokeDesktop<EventAssetSummary[]>('scan_events', { path }))
}

export function loadMapAsset(rootPath: string, mapPath: string, locale?: string) {
  const cacheKey = getLocalizedRootedAssetCacheKey(rootPath, mapPath, locale)
  return readPending(loadMapAssetCache, cacheKey, () =>
    invokeDesktop<MapAssetContent>('load_map_asset', { rootPath, mapPath, locale }),
  )
}

export function loadTextAsset(rootPath: string, assetPath: string, locale?: string) {
  const cacheKey = getLocalizedRootedAssetCacheKey(rootPath, assetPath, locale)
  return readPending(loadTextAssetCache, cacheKey, () =>
    invokeDesktop<TextAssetContent>('load_text_asset', { rootPath, assetPath, locale }),
  )
}

export function loadTextFile(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readCached(loadTextFileCache, cacheKey, () => invokeDesktop<LocalTextFileContent>('load_text_file', { path }))
}

export function loadImageDataUrl(path: string, locale?: string) {
  const cacheKey = `${normalizeCachePathSegment(path)}::${locale?.trim() || 'default'}`
  return readPending(loadImageDataUrlCache, cacheKey, () => invokeDesktop<string>('load_image_data_url', { path, locale }))
}

export function scanAudioAssets(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readCached(scanAudioAssetsCache, cacheKey, () =>
    invokeDesktop<AudioAssetSummary[]>('scan_audio_assets', { path }),
  )
}

export function loadAudioDataUrl(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readPending(loadAudioDataUrlCache, cacheKey, () => invokeDesktop<string>('load_audio_data_url', { path }))
}

export function loadXactAudioDataUrl(rootPath: string, cue: string) {
  const cacheKey = `${normalizeCachePathSegment(rootPath)}::${cue.trim()}`
  return readPending(loadXactAudioDataUrlCache, cacheKey, () =>
    invokeDesktop<string>('load_xact_audio_data_url', { rootPath, cue }),
  )
}

export function scanDefaultSaveSlots() {
  return readCached(scanDefaultSaveSlotsCache, 'default', () =>
    invokeDesktop<DefaultSaveSlotSummary[]>('scan_default_save_slots'),
  )
}

