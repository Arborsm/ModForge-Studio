/** Persisted launcher settings owned by the desktop backend. */
export type LauncherSettings = {
  gamePath: string | null
  modsPath: string | null
  downloadPath: string | null
  nexusApiKey: string | null
  autoInstallDownloads: boolean
  keepDownloadedArchives: boolean
  autoCheckModUpdates: boolean
}

/** Partial settings patch accepted by the launcher settings save command. */
export type SaveLauncherSettingsRequest = {
  gamePath?: string | null
  modsPath?: string | null
  downloadPath?: string | null
  nexusApiKey?: string | null
  autoInstallDownloads?: boolean
  keepDownloadedArchives?: boolean
  autoCheckModUpdates?: boolean
}

/** Request to scan one Mods folder into launcher library entries. */
export type ScanLauncherLibraryRequest = {
  modsPath: string
}

/** Installed mod entry normalized for the launcher library UI. */
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
  requiredDependencies: string[]
  missingRequiredDependencies: string[]
}

/** Full result of scanning a Mods folder. */
export type LauncherLibraryScanResult = {
  modsPath: string
  mods: LauncherLibraryModSummary[]
}

/** Detected game/runtime versions shown by the launcher. */
export type LauncherRuntimeInfo = {
  gameVersion: string | null
  smapiVersion: string | null
}

/** User-created folder grouping for installed launcher mods. */
export type LauncherLibraryStorageFolder = {
  id: string
  name: string
  modKeys: string[]
}

/** Named pack preset containing a stable list of mod keys. */
export type LauncherLibraryPackPreset = {
  id: string
  name: string
  modKeys: string[]
}

export type LauncherLibraryScopeMode = 'all' | 'current-pack'

/** Persisted launcher library organization state. */
export type LauncherLibraryState = {
  storageFolders: LauncherLibraryStorageFolder[]
  hiddenModKeys: string[]
  packPresets: LauncherLibraryPackPreset[]
  currentPackId: string | null
  scopeMode: LauncherLibraryScopeMode
}

/** Cover image assignment for one library entry. */
export type LauncherLibraryCover = {
  labelKey: string
  imagePath: string
}

/** Persisted cover image assignments for the launcher library. */
export type LauncherLibraryCoversState = {
  covers: LauncherLibraryCover[]
}

/** Request to assign or clear a local cover image for a library entry. */
export type SetLauncherLibraryCoverRequest = {
  labelKey: string
  imagePath?: string | null
}

/** Request to cache a remote image and attach it to a library entry. */
export type PersistLauncherLibraryRemoteCoverRequest = {
  labelKey: string
  imageUrl: string
}

/** Request to enable or disable one installed mod folder. */
export type SetLauncherModEnabledRequest = {
  modPath: string
  enabled: boolean
}

/** Result of toggling one installed mod folder. */
export type SetLauncherModEnabledResult = {
  absolutePath: string
  enabled: boolean
}

/** Remote catalog search query and filter set. */
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

/** Request to load remote catalog details for one Nexus mod. */
export type LoadLauncherRemoteModDetailRequest = {
  modId: number
}

/** Request to load the update changelog for one Nexus mod. */
export type LoadLauncherUpdateChangelogRequest = {
  modId: number
}

/** One remote mod result shown in launcher discovery. */
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

/** One facet bucket returned by remote catalog search. */
export type LauncherCatalogFacetEntry = {
  name: string
  count: number
}

/** Facet groups returned with a remote catalog page. */
export type LauncherCatalogFacets = {
  categories: LauncherCatalogFacetEntry[]
  languages: LauncherCatalogFacetEntry[]
  tags: LauncherCatalogFacetEntry[]
}

/** Paginated remote catalog search result. */
export type LauncherCatalogPageResult = {
  page: number
  pageSize: number
  totalCount: number
  hasMore: boolean
  facets: LauncherCatalogFacets
  results: LauncherCatalogResult[]
}

/** Remote mod detail used by discovery and library detail panels. */
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
  category?: string | null
  downloads?: number | null
  endorsements?: number | null
  tags?: string[]
  directDownloadEnabled?: boolean | null
  supportsVortex?: boolean | null
  primaryFileId?: number | null
  primaryFileName?: string | null
  primaryFileVersion?: string | null
  primaryFileCategory?: string | null
  primaryFileSize?: number | null
  primaryFileSizeBytes?: number | null
  primaryFileScanned?: boolean | null
  primaryFileScanStatus?: string | null
  primaryFileChangelog?: string[]
  requiredLoader?: string | null
  gameVersion?: string | null
  archiveType?: string | null
  updateRisk?: string | null
  requirements?: LauncherRemoteModRequirement[]
  files?: LauncherRemoteModFile[]
}

export type LauncherRemoteModRequirement = {
  name: string
  notes?: string | null
  url?: string | null
  external?: boolean
}

export type LauncherRemoteModFile = {
  fileId?: number | null
  name?: string | null
  version?: string | null
  category?: string | null
  size?: number | null
  sizeBytes?: number | null
  primary?: boolean
  scanned?: boolean | null
  scanStatus?: string | null
  changelog?: string[]
  archiveType?: string | null
}

/** Remote update changelog result for a mod. */
export type LauncherUpdateChangelogResult = {
  modId: number
  version: string | null
  changelog: string | null
}

export type LauncherNexusRouteStatus = 'loading' | 'warning' | 'success'

/** One diagnostics route snapshot for Nexus-related services. */
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

/** Current Nexus diagnostics state across all checked routes. */
export type LauncherNexusDiagnosticsResult = {
  routes: LauncherNexusRouteSnapshot[]
}
/** Nexus API key account and quota validation result. */
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

/** Snapshot of the current Nexus SSO authorization flow. */
export type SsoSnapshot = {
  status: SsoConnectionStatus
  errorKind?: SsoErrorKind | null
  errorMessage?: string | null
  userName?: string | null
  isPremium: boolean
  ssoId?: string | null
}

/** Request to resolve a remote image into the local launcher image cache. */
export type ResolveLauncherImageRequest = {
  url: string
  refresh?: boolean
}

/** Local cached image result for a remote launcher image. */
export type ResolveLauncherImageResult = {
  sourceUrl: string
  localPath: string
  mimeType: string
}

/** Request to check installed mods for remote updates. */
export type CheckLauncherUpdatesRequest = {
  modsPath: string
  forceRefresh?: boolean
}

/** Request to load cached launcher updates for one Mods folder. */
export type LoadCachedLauncherUpdatesRequest = {
  modsPath: string
}

/** Request to load update notification suppressions for one Mods folder. */
export type LoadSuppressedLauncherUpdateModIdsRequest = {
  modsPath: string
}

/** Suppressed Nexus mod IDs for launcher update notifications. */
export type LauncherSuppressedUpdateModIdsResult = {
  modsPath: string
  modIds: number[]
}

/** One available update for an installed mod. */
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

/** Update check result for a Mods folder. */
export type LauncherUpdatesResult = {
  modsPath: string
  checkedAtMs: number
  isComplete?: boolean
  updates: LauncherUpdateSummary[]
}

/** Progress event emitted while checking installed mods for updates. */
export type LauncherUpdateProgressPayload = {
  modsPath: string
  sessionId?: string | null
  checked: number
  total: number
  currentModName: string | null
  updates?: LauncherUpdateSummary[] | null
}

/** Request to download one remote mod archive. */
export type DownloadLauncherModRequest = {
  modId: number
  fileId?: number | null
  version?: string | null
  title?: string | null
}

/** Download result and optional auto-install target. */
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

/** Executable selected by the launcher when starting the game. */
export type LauncherGameLaunchResult = {
  executablePath: string
  target: LauncherGameLaunchTarget
}

/** Persisted launcher download queue item. */
export type LauncherDownloadQueueItemRecord = {
  id: string
  modId: number
  fileId?: number | null
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

/** Persisted launcher download queue. */
export type LauncherDownloadQueueState = {
  items: LauncherDownloadQueueItemRecord[]
}

/** Request to install a local archive into the Mods folder. */
export type InstallLauncherArchiveRequest = {
  archivePath: string
  modsPath?: string | null
}

/** One mod folder installed from an archive. */
export type InstallLauncherArchiveInstalledMod = {
  modName: string
  uniqueId: string | null
  version: string | null
  targetPath: string
  preservedConfig: boolean
  preservedI18nFiles: number
}

/** Result of installing a local mod archive. */
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

/** Install backup entry available for restore. */
export type LauncherInstallBackupSummary = {
  backupId: string
  backupPath: string
}

/** Request to list install backups for a Mods folder. */
export type ListLauncherInstallBackupsRequest = {
  modsPath?: string | null
}

/** Request to restore a launcher install backup. */
export type RestoreLauncherInstallBackupRequest = {
  backupId: string
  modsPath?: string | null
}

/** Result of restoring a launcher install backup. */
export type RestoreLauncherInstallBackupResult = {
  backupId: string
  backupPath: string
  restoredPaths: string[]
}

/** Request to open a local path in the host file manager. */
export type OpenLauncherPathRequest = {
  path: string
}

/** Request to open an external URL in the host browser. */
export type OpenLauncherUrlRequest = {
  url: string
}

/** Request to inspect an archive before installation. */
export type InspectLauncherArchiveRequest = {
  archivePath: string
}

/** File tree node returned by archive inspection. */
export type LauncherArchiveTreeNode = {
  name: string
  path: string
  isDirectory: boolean
  sizeBytes: number | null
  children: LauncherArchiveTreeNode[]
}

/** Archive inspection result used by the install preview dialog. */
export type InspectLauncherArchiveResult = {
  archivePath: string
  archiveFileName: string
  totalEntries: number
  totalFiles: number
  modRoots: string[]
  tree: LauncherArchiveTreeNode[]
}
