import { HOST_COMMANDS } from '@shared/contracts'
import { invokeDesktop } from './runtime'

/** Snapshot of backend file cache size and approximate memory usage. */
export type FileCacheStats = {
  rootPath: string
  entryCount: number
  totalSizeBytes: number
}

/** Returns backend file cache statistics for debug tooling. */
export function getFileCacheStats() {
  return invokeDesktop<FileCacheStats>(HOST_COMMANDS.getFileCacheStats, undefined, { kind: 'parallelPool', pool: 'host-io', limit: 2 })
}

/** Clears backend file caches used by desktop file readers. */
export function clearFileCache() {
  return invokeDesktop<void>(HOST_COMMANDS.clearFileCache, undefined, { kind: 'exclusiveMutation', resource: 'GameAssetCache' })
}
