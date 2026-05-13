import { invokeDesktop } from './runtime'

/** Snapshot of backend file cache size and approximate memory usage. */
export type FileCacheStats = {
  rootPath: string
  entryCount: number
  totalSizeBytes: number
}

/** Returns backend file cache statistics for debug tooling. */
export function getFileCacheStats() {
  return invokeDesktop<FileCacheStats>('get_file_cache_stats')
}

/** Clears backend file caches used by desktop file readers. */
export function clearFileCache() {
  return invokeDesktop<void>('clear_file_cache')
}
