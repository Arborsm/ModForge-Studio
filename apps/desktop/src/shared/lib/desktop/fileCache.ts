import { invokeDesktop } from './runtime'

export type FileCacheStats = {
  rootPath: string
  entryCount: number
  totalSizeBytes: number
}

export function getFileCacheStats() {
  return invokeDesktop<FileCacheStats>('get_file_cache_stats')
}

export function clearFileCache() {
  return invokeDesktop<void>('clear_file_cache')
}