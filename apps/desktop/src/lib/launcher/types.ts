import type {
  DownloadLauncherModResult,
  LauncherCatalogResult,
  LauncherLibraryModSummary,
  LauncherLibraryPackPreset,
  LauncherLibraryScopeMode,
  LauncherLibraryState,
  LauncherLibraryStorageFolder,
  LauncherSettings,
  LauncherUpdateSummary,
} from '../desktop'

export type LauncherViewState = 'idle' | 'loading' | 'ready' | 'error'

export type LauncherDownloadQueueStatus = 'queued' | 'downloading' | 'completed' | 'failed' | 'installed'

export type LauncherDownloadQueueItem = {
  id: string
  modId: number
  title: string
  version: string | null
  imageUrl: string | null
  source: 'discover' | 'updates' | 'debug'
  status: LauncherDownloadQueueStatus
  archivePath: string | null
  installedTargetPath: string | null
  error: string | null
  addedAt: number
  completedAt: number | null
  totalBytes: number | null
  downloadedBytes: number | null
  bytesPerSecond: number | null
}

export type QueueLauncherDownloadInput = Pick<LauncherCatalogResult, 'modId' | 'title' | 'imageUrl'> & {
  version?: string | null
  source: Exclude<LauncherDownloadQueueItem['source'], 'debug'>
}

export type LauncherDashboardStats = {
  installedMods: number
  enabledMods: number
  disabledMods: number
  queuedDownloads: number
  pendingUpdates: number
}

export type LauncherSettingsDraft = LauncherSettings
export type LauncherLibraryItem = LauncherLibraryModSummary
export type LauncherStorageFolder = LauncherLibraryStorageFolder
export type LauncherPackPreset = LauncherLibraryPackPreset
export type LauncherLibraryScope = LauncherLibraryScopeMode
export type PersistedLauncherLibraryState = LauncherLibraryState
export type LauncherUpdateItem = LauncherUpdateSummary
export type LauncherDiscoverItem = LauncherCatalogResult
export type CompletedLauncherDownload = DownloadLauncherModResult
