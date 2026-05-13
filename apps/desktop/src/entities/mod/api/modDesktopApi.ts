import { normalizeCachePathSegment } from '@shared/lib/assets'
import { createPromiseCache, readCached, readPending } from '@shared/lib/desktop/cache'
import { invokeDesktop } from '@shared/lib/desktop/runtime'
import type {
  ContentPatcherProjectSnapshot,
  ContentPatcherSimulationResult,
  ExportContentPatcherAssetRequest,
  ExportContentPatcherAssetResult,
  LoadContentPatcherResultAssetRequest,
  LoadContentPatcherResultAssetResult,
  ModAssetIndex,
  ModProjectDetail,
  ModProjectSummary,
  SaveModProjectRequest,
  SaveModProjectResult,
  SimulateContentPatcherRequest,
} from './types'

const scanModProjectsCache = createPromiseCache<ModProjectSummary[]>()
const scanModAssetIndexCache = createPromiseCache<ModAssetIndex>()
const loadModProjectCache = createPromiseCache<ModProjectDetail>()
const loadContentPatcherProjectCache = createPromiseCache<ContentPatcherProjectSnapshot>()
const simulateContentPatcherCache = createPromiseCache<ContentPatcherSimulationResult>()
const loadContentPatcherResultAssetCache = createPromiseCache<LoadContentPatcherResultAssetResult>()

export function getModApiCacheStats() {
  return {
    scanModProjects: scanModProjectsCache.size(),
    scanModAssetIndex: scanModAssetIndexCache.size(),
    modProject: loadModProjectCache.size(),
    contentPatcherProject: loadContentPatcherProjectCache.size(),
    contentPatcherSimulation: simulateContentPatcherCache.size(),
    contentPatcherResultAsset: loadContentPatcherResultAssetCache.size(),
  }
}

export function scanModProjects(rootPath: string) {
  const cacheKey = normalizeCachePathSegment(rootPath)
  return readCached(scanModProjectsCache, cacheKey, () =>
    invokeDesktop<ModProjectSummary[]>('scan_mod_projects', { rootPath }),
  )
}

export function scanModAssetIndex(rootPath: string) {
  const cacheKey = normalizeCachePathSegment(rootPath)
  return readCached(scanModAssetIndexCache, cacheKey, () =>
    invokeDesktop<ModAssetIndex>('scan_mod_asset_index', { rootPath }),
  )
}

export function loadModProject(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readPending(loadModProjectCache, cacheKey, () => invokeDesktop<ModProjectDetail>('load_mod_project', { path }))
}

export function loadContentPatcherProject(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readPending(loadContentPatcherProjectCache, cacheKey, () =>
    invokeDesktop<ContentPatcherProjectSnapshot>('load_content_patcher_project', { path }),
  )
}

export function simulateContentPatcher(request: SimulateContentPatcherRequest) {
  const cacheKey = JSON.stringify(request)
  return readPending(simulateContentPatcherCache, cacheKey, () =>
    invokeDesktop<ContentPatcherSimulationResult>('simulate_content_patcher', { request }),
  )
}

export function loadContentPatcherResultAsset(request: LoadContentPatcherResultAssetRequest) {
  const cacheKey = JSON.stringify(request)
  return readPending(loadContentPatcherResultAssetCache, cacheKey, () =>
    invokeDesktop<LoadContentPatcherResultAssetResult>('load_content_patcher_result_asset', { request }),
  )
}

export function exportContentPatcherAsset(request: ExportContentPatcherAssetRequest) {
  return invokeDesktop<ExportContentPatcherAssetResult>('export_content_patcher_asset', { request })
}

export async function saveModProject(request: SaveModProjectRequest) {
  const result = await invokeDesktop<SaveModProjectResult>('save_mod_project', request)
  const normalizedSource = normalizeCachePathSegment(request.sourcePath)
  const normalizedTarget = request.outputPath ? normalizeCachePathSegment(request.outputPath) : normalizedSource
  loadModProjectCache.delete(normalizedSource)
  loadModProjectCache.delete(normalizedTarget)
  scanModProjectsCache.clear()
  scanModAssetIndexCache.clear()
  return result
}
