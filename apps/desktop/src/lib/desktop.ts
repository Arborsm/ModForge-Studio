import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { getCurrentWindow } from '@tauri-apps/api/window'

export type GameDirectoryInfo = {
  rootPath: string
  executablePath: string
  mapsPath: string | null
  mapCount: number
}

export type MapAssetSummary = {
  id: string
  name: string
  fileName: string
  format: 'tmx' | 'xnb'
  absolutePath: string
  relativePath: string
  sizeBytes: number
}

export type EventAssetSummary = {
  id: string
  name: string
  fileName: string
  absolutePath: string
  relativePath: string
  sizeBytes: number
}

export type MapAssetContent = {
  name: string
  format: 'tmx' | 'xnb'
  absolutePath: string
  relativePath: string
  content: string
}

export type TextAssetContent = {
  absolutePath: string
  relativePath: string
  content: string
}

export type LocalTextFileContent = {
  absolutePath: string
  content: string
}

export type DefaultSaveSlotSummary = {
  slotName: string
  folderPath: string
  filePath: string
  modifiedTimeMs: number
}

export type AudioAssetSummary = {
  cue: string
  kind: 'music' | 'sound'
  absolutePath: string
  relativePath: string
}

function normalizeCachePathSegment(value: string) {
  return value.trim().replaceAll('/', '\\')
}

function createPromiseCache<T>() {
  const cache = new Map<string, Promise<T>>()

  return {
    get(key: string) {
      return cache.get(key)
    },
    set(key: string, promise: Promise<T>) {
      cache.set(key, promise)
    },
    delete(key: string) {
      cache.delete(key)
    },
    deleteWhere(predicate: (key: string) => boolean) {
      for (const key of cache.keys()) {
        if (predicate(key)) {
          cache.delete(key)
        }
      }
    },
    clear() {
      cache.clear()
    },
    size() {
      return cache.size
    },
  }
}

function getRootedAssetCacheKey(rootPath: string, assetPath: string) {
  return `${normalizeCachePathSegment(rootPath)}::${normalizeCachePathSegment(assetPath)}`
}

function getLocalizedRootedAssetCacheKey(rootPath: string, assetPath: string, locale?: string) {
  return `${getRootedAssetCacheKey(rootPath, assetPath)}::${locale?.trim() || 'default'}`
}

async function readCached<T>(
  cache: ReturnType<typeof createPromiseCache<T>>,
  key: string,
  loader: () => Promise<T>,
) {
  const cachedValue = cache.get(key)
  if (cachedValue) {
    return cachedValue
  }

  const pendingValue = loader().catch((error) => {
    cache.delete(key)
    throw error
  })

  cache.set(key, pendingValue)
  return pendingValue
}

const validateDirectoryCache = createPromiseCache<GameDirectoryInfo>()
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

export function clearDesktopLocaleCache(locale: string) {
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

export function getDesktopCacheStats() {
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

function isDesktopHost() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function invokeDesktop<T>(command: string, args?: Record<string, unknown>) {
  if (!isDesktopHost()) {
    throw new Error('This feature is only available in the Tauri desktop host.')
  }

  return invoke<T>(command, args)
}

export function canUseDesktopHost() {
  return isDesktopHost()
}

export async function chooseGameDirectory() {
  if (!isDesktopHost()) {
    throw new Error('Directory selection requires the desktop host.')
  }

  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select the Stardew Valley game folder',
  })

  return typeof selected === 'string' ? selected : null
}

export async function chooseDirectory(title: string) {
  if (!isDesktopHost()) {
    throw new Error('Directory selection requires the desktop host.')
  }

  const selected = await open({
    directory: true,
    multiple: false,
    title,
  })

  return typeof selected === 'string' ? selected : null
}

export function detectDefaultGameDirectory() {
  return invokeDesktop<string | null>('detect_default_game_directory')
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
  return readCached(loadMapAssetCache, cacheKey, () =>
    invokeDesktop<MapAssetContent>('load_map_asset', { rootPath, mapPath, locale }),
  )
}

export function loadTextAsset(rootPath: string, assetPath: string, locale?: string) {
  const cacheKey = getLocalizedRootedAssetCacheKey(rootPath, assetPath, locale)
  return readCached(loadTextAssetCache, cacheKey, () =>
    invokeDesktop<TextAssetContent>('load_text_asset', { rootPath, assetPath, locale }),
  )
}

export function loadTextFile(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readCached(loadTextFileCache, cacheKey, () => invokeDesktop<LocalTextFileContent>('load_text_file', { path }))
}

export function loadImageDataUrl(path: string, locale?: string) {
  const cacheKey = `${normalizeCachePathSegment(path)}::${locale?.trim() || 'default'}`
  return readCached(loadImageDataUrlCache, cacheKey, () => invokeDesktop<string>('load_image_data_url', { path, locale }))
}

export function scanAudioAssets(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readCached(scanAudioAssetsCache, cacheKey, () =>
    invokeDesktop<AudioAssetSummary[]>('scan_audio_assets', { path }),
  )
}

export function loadAudioDataUrl(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readCached(loadAudioDataUrlCache, cacheKey, () => invokeDesktop<string>('load_audio_data_url', { path }))
}

export function loadXactAudioDataUrl(rootPath: string, cue: string) {
  const cacheKey = `${normalizeCachePathSegment(rootPath)}::${cue.trim()}`
  return readCached(loadXactAudioDataUrlCache, cacheKey, () =>
    invokeDesktop<string>('load_xact_audio_data_url', { rootPath, cue }),
  )
}

export function scanDefaultSaveSlots() {
  return readCached(scanDefaultSaveSlotsCache, 'default', () =>
    invokeDesktop<DefaultSaveSlotSummary[]>('scan_default_save_slots'),
  )
}

export async function minimizeCurrentWindow() {
  if (!isDesktopHost()) {
    return
  }

  await getCurrentWindow().minimize()
}

export async function toggleMaximizeCurrentWindow() {
  if (!isDesktopHost()) {
    return
  }

  await getCurrentWindow().toggleMaximize()
}

export async function closeCurrentWindow() {
  if (!isDesktopHost()) {
    return
  }

  await getCurrentWindow().close()
}
