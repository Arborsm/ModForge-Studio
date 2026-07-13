import { HOST_COMMANDS } from '@platform/host-commands'
import { normalizeCachePathSegment } from '@shared/lib/assets'
import { createPromiseCache, readCached, readPending } from '@shared/lib/cache'
import { invokeDesktop } from '@platform/host/runtime'
import type { HostCommandPolicy } from '@platform/host-command-client'
import type {
  LoadContentPatcherResultAssetRequest,
  LoadContentPatcherResultAssetResult,
  ModAssetIndex,
  ModProjectDetail,
  ModProjectSummary,
  SaveModI18nFilesRequest,
  SaveModI18nFilesResult,
} from './types'

const scanModProjectsCache = createPromiseCache<ModProjectSummary[]>()
const scanModAssetIndexCache = createPromiseCache<ModAssetIndex>()
const loadModProjectCache = createPromiseCache<ModProjectDetail>()
const loadContentPatcherResultAssetCache = createPromiseCache<LoadContentPatcherResultAssetResult>()

const modIoPoolPolicy = { kind: 'parallelPool', pool: 'mod-project-io', limit: 2 } satisfies HostCommandPolicy

/** Returns cache sizes for mod and Content Patcher desktop APIs. */
export function getModApiCacheStats() {
  return {
    scanModProjects: scanModProjectsCache.size(),
    scanModAssetIndex: scanModAssetIndexCache.size(),
    modProject: loadModProjectCache.size(),
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

/** Loads a mod project summary, diagnostics, and plugin-specific inspection data. */
export function loadModProject(path: string) {
  const cacheKey = normalizeCachePathSegment(path)
  return readPending(loadModProjectCache, cacheKey, () =>
    invokeDesktop<ModProjectDetail>(HOST_COMMANDS.loadModProject, { path }, modIoPoolPolicy),
  )
}

/** Inspects one mod archive in an isolated temporary directory without installing it. */
export function inspectModArchive(path: string) {
  return invokeDesktop<ModProjectDetail>(HOST_COMMANDS.inspectModArchive, { path }, modIoPoolPolicy)
}

/** Materializes one resolved Content Patcher target for preview in the UI. */
export function loadContentPatcherResultAsset(request: LoadContentPatcherResultAssetRequest) {
  const cacheKey = JSON.stringify(request)
  return readPending(loadContentPatcherResultAssetCache, cacheKey, () =>
    invokeDesktop<LoadContentPatcherResultAssetResult>(HOST_COMMANDS.loadContentPatcherResultAsset, { request }, modIoPoolPolicy),
  )
}

/** Writes only the requested i18n files and invalidates affected read caches. */
export async function saveModI18nFiles(request: SaveModI18nFilesRequest) {
  const policy = {
    kind: 'exclusiveMutation',
    resource: `ModProject:${normalizeCachePathSegment(request.sourcePath)}`,
  } satisfies HostCommandPolicy
  const result = await invokeDesktop<SaveModI18nFilesResult>(HOST_COMMANDS.saveModI18nFiles, { request }, policy)
  loadModProjectCache.delete(normalizeCachePathSegment(request.sourcePath))
  scanModProjectsCache.clear()
  scanModAssetIndexCache.clear()
  return result
}
