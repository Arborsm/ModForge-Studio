import { HOST_COMMANDS } from '@shared/contracts'
import { normalizeCachePathSegment } from '@shared/lib/assets'
import { createPromiseCache, readCached, readPending } from '@shared/lib/desktop/cache'
import { invokeDesktop } from '@shared/lib/desktop/runtime'
import type { HostCommandPolicy } from '@shared/lib/host-command-client'
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

const modIoPoolPolicy = { kind: 'parallelPool', pool: 'mod-project-io', limit: 2 } satisfies HostCommandPolicy
const modProjectMutationPolicy = { kind: 'exclusiveMutation', resource: 'ModProject' } satisfies HostCommandPolicy

/** Returns cache sizes for mod and Content Patcher desktop APIs. */
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

/** Scans a Mods folder for supported and unsupported mod projects. */
export function scanModProjects(rootPath: string) {
  const cacheKey = normalizeCachePathSegment(rootPath)
  return readCached(scanModProjectsCache, cacheKey, () =>
    invokeDesktop<ModProjectSummary[]>(HOST_COMMANDS.scanModProjects, { rootPath }, modIoPoolPolicy),
  )
}

/** Builds a cross-mod index of assets touched by installed content packs. */
export function scanModAssetIndex(rootPath: string) {
  const cacheKey = normalizeCachePathSegment(rootPath)
  return readCached(scanModAssetIndexCache, cacheKey, () =>
    invokeDesktop<ModAssetIndex>(HOST_COMMANDS.scanModAssetIndex, { rootPath }, modIoPoolPolicy),
  )
}

/** Loads a mod project summary, diagnostics, and plugin-specific editable data. */
export function loadModProject(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readPending(loadModProjectCache, cacheKey, () =>
    invokeDesktop<ModProjectDetail>(HOST_COMMANDS.loadModProject, { path }, modIoPoolPolicy),
  )
}

/** Loads a Content Patcher project snapshot including included source files. */
export function loadContentPatcherProject(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readPending(loadContentPatcherProjectCache, cacheKey, () =>
    invokeDesktop<ContentPatcherProjectSnapshot>(HOST_COMMANDS.loadContentPatcherProject, { path }, modIoPoolPolicy),
  )
}

/** Simulates Content Patcher changes for a project or unsaved editor snapshot. */
export function simulateContentPatcher(request: SimulateContentPatcherRequest) {
  const cacheKey = JSON.stringify(request)
  return readPending(simulateContentPatcherCache, cacheKey, () =>
    invokeDesktop<ContentPatcherSimulationResult>(HOST_COMMANDS.simulateContentPatcher, { request }, modIoPoolPolicy),
  )
}

/** Materializes one simulated Content Patcher target for preview in the UI. */
export function loadContentPatcherResultAsset(request: LoadContentPatcherResultAssetRequest) {
  const cacheKey = JSON.stringify(request)
  return readPending(loadContentPatcherResultAssetCache, cacheKey, () =>
    invokeDesktop<LoadContentPatcherResultAssetResult>(HOST_COMMANDS.loadContentPatcherResultAsset, { request }, modIoPoolPolicy),
  )
}

/** Exports one simulated Content Patcher result asset to disk. */
export function exportContentPatcherAsset(request: ExportContentPatcherAssetRequest) {
  return invokeDesktop<ExportContentPatcherAssetResult>(HOST_COMMANDS.exportContentPatcherAsset, { request }, modProjectMutationPolicy)
}

/** Saves a mod project, then clears project and mod index caches affected by the write. */
export async function saveModProject(request: SaveModProjectRequest) {
  const result = await invokeDesktop<SaveModProjectResult>(HOST_COMMANDS.saveModProject, { request }, modProjectMutationPolicy)
  const normalizedSource = normalizeCachePathSegment(request.sourcePath)
  const normalizedTarget = request.outputPath ? normalizeCachePathSegment(request.outputPath) : normalizedSource
  loadModProjectCache.delete(normalizedSource)
  loadModProjectCache.delete(normalizedTarget)
  scanModProjectsCache.clear()
  scanModAssetIndexCache.clear()
  return result
}
