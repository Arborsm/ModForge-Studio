export type LauncherSettings = {
  gamePath: string | null
  modsPath: string | null
  downloadPath: string | null
  nexusApiKey: string | null
  autoInstallDownloads: boolean
  keepDownloadedArchives: boolean
  autoCheckModUpdates: boolean
}

export type SaveLauncherSettingsRequest = {
  gamePath?: string | null
  modsPath?: string | null
  downloadPath?: string | null
  nexusApiKey?: string | null
  autoInstallDownloads?: boolean
  keepDownloadedArchives?: boolean
  autoCheckModUpdates?: boolean
}

export type ScanLauncherLibraryRequest = {
  modsPath: string
}

export type LauncherLibraryModSummary = {
  id: string
  labelKey: string
  name: string
  author: string | null
  version: string | null
  description: string | null
  uniqueId: string | null
  folderName: string
  absolutePath: string
  enabled: boolean
  nexusModId: number | null
  updateKeys: string[]
  modUrl: string | null
  imageUrl: string | null
  missingRequiredDependencies: string[]
}

export type LauncherLibraryScanResult = {
  modsPath: string
  mods: LauncherLibraryModSummary[]
}

export type LauncherLibraryStorageFolder = {
  id: string
  name: string
  modKeys: string[]
}

export type LauncherLibraryPackPreset = {
  id: string
  name: string
  modKeys: string[]
}

export type LauncherLibraryScopeMode = 'all' | 'current-pack'

export type LauncherLibraryState = {
  storageFolders: LauncherLibraryStorageFolder[]
  hiddenModKeys: string[]
  packPresets: LauncherLibraryPackPreset[]
  currentPackId: string | null
  scopeMode: LauncherLibraryScopeMode
}

export type LauncherLibraryCover = {
  labelKey: string
  imagePath: string
}

export type LauncherLibraryCoversState = {
  covers: LauncherLibraryCover[]
}

export type SetLauncherLibraryCoverRequest = {
  labelKey: string
  imagePath?: string | null
}

export type PersistLauncherLibraryRemoteCoverRequest = {
  labelKey: string
  imageUrl: string
}

export type SetLauncherModEnabledRequest = {
  modPath: string
  enabled: boolean
}

export type SetLauncherModEnabledResult = {
  absolutePath: string
  enabled: boolean
}

export type SearchLauncherCatalogRequest = {
  query?: string | null
  titleQuery?: string | null
  descriptionQuery?: string | null
  authorQuery?: string | null
  uploaderQuery?: string | null
  page?: number
  pageSize?: number
  timeRange?: 'all' | 'day' | 'week' | 'month' | 'year'
  sort?: 'newest' | 'updated' | 'trending' | 'downloads' | 'endorsements' | 'name'
  ascending?: boolean
  category?: string | null
  language?: string | null
  tagsInclude?: string | null
  tagsExclude?: string | null
  includeAdult?: boolean
  minFileSize?: number | null
  maxFileSize?: number | null
  minDownloads?: number | null
  maxDownloads?: number | null
  minEndorsements?: number | null
  maxEndorsements?: number | null
}

export type LoadLauncherRemoteModDetailRequest = {
  modId: number
}

export type LoadLauncherUpdateChangelogRequest = {
  modId: number
}

export type LauncherCatalogResult = {
  modId: number
  title: string
  summary: string | null
  author: string | null
  uploader: string | null
  modUrl: string
  imageUrl: string | null
  category: string | null
  createdAt: string | null
  updatedAt: string | null
  downloads: number | null
  endorsements: number | null
  fileSize: number | null
  updateAvailable: boolean
}

export type LauncherCatalogFacetEntry = {
  name: string
  count: number
}

export type LauncherCatalogFacets = {
  categories: LauncherCatalogFacetEntry[]
  languages: LauncherCatalogFacetEntry[]
  tags: LauncherCatalogFacetEntry[]
}

export type LauncherCatalogPageResult = {
  page: number
  pageSize: number
  totalCount: number
  hasMore: boolean
  facets: LauncherCatalogFacets
  results: LauncherCatalogResult[]
}

export type LauncherRemoteModDetail = {
  modId: number
  title: string
  summary: string | null
  author: string | null
  version: string | null
  modUrl: string
  imageUrl: string | null
  galleryImages: string[]
  updatedAt?: string | null
  fileSize?: number | null
}

export type LauncherUpdateChangelogResult = {
  modId: number
  version: string | null
  changelog: string | null
}

export type LauncherNexusRouteStatus = 'loading' | 'warning' | 'success'

export type LauncherNexusRouteSnapshot = {
  routeId: string
  label: string
  endpoint: string
  status: LauncherNexusRouteStatus
  attempts: number
  maxAttempts: number
  available: boolean
  message: string
}

export type LauncherNexusDiagnosticsResult = {
  routes: LauncherNexusRouteSnapshot[]
}
export type ValidateApiKeyResult = {
  userName: string
  isPremium: boolean
  dailyRemaining: number | null
  hourlyRemaining: number | null
  dailyResetAt: number | null
  hourlyResetAt: number | null
}

export type SsoConnectionStatus = 'idle' | 'connecting' | 'awaitingAuthorization' | 'authorized' | 'failed'

export type SsoErrorKind = 'connectionTimeout' | 'authorizationTimeout' | 'connectionRefused' | 'networkError' | 'cancelled'

export type SsoSnapshot = {
  status: SsoConnectionStatus
  errorKind?: SsoErrorKind | null
  errorMessage?: string | null
  userName?: string | null
  isPremium: boolean
  ssoId?: string | null
}

export type ResolveLauncherImageRequest = {
  url: string
  refresh?: boolean
}

export type ResolveLauncherImageResult = {
  sourceUrl: string
  localPath: string
  mimeType: string
}

export type CheckLauncherUpdatesRequest = {
  modsPath: string
  forceRefresh?: boolean
}

export type LoadCachedLauncherUpdatesRequest = {
  modsPath: string
}

export type LoadSuppressedLauncherUpdateModIdsRequest = {
  modsPath: string
}

export type LauncherSuppressedUpdateModIdsResult = {
  modsPath: string
  modIds: number[]
}

export type LauncherUpdateSummary = {
  modId: number
  name: string
  author?: string | null
  currentVersion: string | null
  latestVersion: string
  absolutePath: string
  modUrl: string
  imageUrl: string | null
  updatedAt?: string | null
  fileSize?: number | null
}

export type LauncherUpdatesResult = {
  modsPath: string
  checkedAtMs: number
  isComplete?: boolean
  updates: LauncherUpdateSummary[]
}

export type LauncherUpdateProgressPayload = {
  modsPath: string
  sessionId?: string | null
  checked: number
  total: number
  currentModName: string | null
  updates?: LauncherUpdateSummary[] | null
}

export type DownloadLauncherModRequest = {
  modId: number
  fileId?: number | null
  version?: string | null
  title?: string | null
}

export type DownloadLauncherModResult = {
  modId: number
  title: string
  version: string | null
  fileName: string
  archivePath: string
  installed: boolean
  installedTargetPath: string | null
}

export type LauncherGameLaunchTarget = 'smapi' | 'game'

export type LauncherGameLaunchResult = {
  executablePath: string
  target: LauncherGameLaunchTarget
}

export type LauncherDownloadQueueItemRecord = {
  id: string
  modId: number
  title: string
  version: string | null
  imageUrl: string | null
  source: string
  status: string
  archivePath: string | null
  installedTargetPath: string | null
  error: string | null
  addedAt: number
  completedAt: number | null
  totalBytes?: number | null
  downloadedBytes?: number | null
  bytesPerSecond?: number | null
}

export type LauncherDownloadQueueState = {
  items: LauncherDownloadQueueItemRecord[]
}

export type InstallLauncherArchiveRequest = {
  archivePath: string
  modsPath?: string | null
}

export type InstallLauncherArchiveInstalledMod = {
  modName: string
  uniqueId: string | null
  version: string | null
  targetPath: string
  preservedConfig: boolean
  preservedI18nFiles: number
}

export type InstallLauncherArchiveResult = {
  modName: string
  uniqueId: string | null
  version: string | null
  targetPath: string
  preservedConfig: boolean
  preservedI18nFiles: number
  installedMods: InstallLauncherArchiveInstalledMod[]
  backupId: string
  backupPath: string
}

export type LauncherInstallBackupSummary = {
  backupId: string
  backupPath: string
}

export type ListLauncherInstallBackupsRequest = {
  modsPath?: string | null
}

export type RestoreLauncherInstallBackupRequest = {
  backupId: string
  modsPath?: string | null
}

export type RestoreLauncherInstallBackupResult = {
  backupId: string
  backupPath: string
  restoredPaths: string[]
}

export type OpenLauncherPathRequest = {
  path: string
}

export type OpenLauncherUrlRequest = {
  url: string
}

export type InspectLauncherArchiveRequest = {
  archivePath: string
}

export type LauncherArchiveTreeNode = {
  name: string
  path: string
  isDirectory: boolean
  sizeBytes: number | null
  children: LauncherArchiveTreeNode[]
}

export type InspectLauncherArchiveResult = {
  archivePath: string
  archiveFileName: string
  totalEntries: number
  totalFiles: number
  modRoots: string[]
  tree: LauncherArchiveTreeNode[]
}

