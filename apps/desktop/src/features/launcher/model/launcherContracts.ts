export type LauncherSettings = {
  gamePath: string | null
  modsPath: string | null
  downloadPath: string | null
  nexusApiKey: string | null
  autoInstallDownloads: boolean
  keepDownloadedArchives: boolean
  autoCheckModUpdates: boolean
  gmcmParsingEnabled?: boolean
  showConsoleWindow?: boolean
}

export type SaveLauncherSettingsRequest = {
  gamePath?: string | null
  modsPath?: string | null
  downloadPath?: string | null
  nexusApiKey?: string | null
  autoInstallDownloads?: boolean
  keepDownloadedArchives?: boolean
  autoCheckModUpdates?: boolean
  gmcmParsingEnabled?: boolean
  showConsoleWindow?: boolean
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
  hasConfig: boolean
  nexusModId: number | null
  updateKeys: string[]
  modUrl: string | null
  imageUrl: string | null
  dependencies: LauncherLibraryDependency[]
  requiredDependencies: string[]
  missingRequiredDependencies: string[]
  /** Minimum SMAPI version declared by the mod manifest, when it declares one. */
  minimumApiVersion: string | null
  /** True when the installed SMAPI version is older than this mod's minimum API version. */
  requiresNewerSmapi: boolean
}

export type LauncherLibraryDependency = {
  uniqueId: string
  required: boolean
}

export type LauncherLibraryScanResult = {
  modsPath: string
  mods: LauncherLibraryModSummary[]
}

export type LauncherRuntimeInfo = {
  gameVersion: string | null
  smapiVersion: string | null
}

export type SmapiUpdatePhase = 'downloading' | 'verifying' | 'extracting' | 'installing'

/** Which source produced the SMAPI latest-version lookup. */
export type SmapiVersionSource = 'github' | 'nexus'

/** Which file naming a locally downloaded SMAPI installer archive uses. */
export type SmapiInstallerNaming = 'github' | 'nexus'

/** One installed mod that requires a newer SMAPI version than the one detected. */
export type SmapiUpdateRequiredByMod = {
  modId: string
  modName: string
  minimumApiVersion: string
}

/**
 * Download payload the backend prepared for installing a SMAPI update, source-aware.
 * GitHub assets carry a direct URL plus sha256 digest; Nexus provides neither (free
 * users must use the manual-download popup), so the UI gets the popup URL instead.
 */
export type SmapiUpdateDownloadInfo = {
  source: SmapiVersionSource
  /** Direct download URL (GitHub only). Absent for Nexus-sourced downloads. */
  url?: string | null
  /** Hex SHA-256 digest (without the `sha256:` prefix) when the source provides one. */
  sha256?: string | null
  sizeBytes?: number | null
  assetName: string
  /** Nexus mod page URL (Nexus-sourced downloads only). */
  nexusModPageUrl?: string | null
  /** Nexus manual-download popup URL for free users (Nexus-sourced downloads with a known file id only). */
  nexusDownloadPopupUrl?: string | null
  nexusFileId?: number | null
}

/** Result of checking the installed SMAPI version against the game's requirements. */
export type SmapiUpdateCheckResult = {
  installedVersion: string
  gameVersion: string
  latestStableVersion: string
  /** SMAPI version that should be installed when an update is available. */
  targetVersion: string
  updateAvailable: boolean
  /** Which source produced the latest-version lookup (`github` or `nexus`). */
  versionSource: SmapiVersionSource
  requiredByMods: SmapiUpdateRequiredByMod[]
  download?: SmapiUpdateDownloadInfo | null
}

/** Request to install a SMAPI update; either a direct download or a local file. */
export type InstallSmapiUpdateRequest = {
  /** Client-generated id shared with cancel_launcher_download for download-phase cancellation. */
  jobId?: string | null
  /** Direct GitHub asset URL for the download branch. Mutually exclusive with localFilePath. */
  downloadUrl?: string | null
  /** Hex SHA-256 digest of the installer zip. Required for downloads; optional for local files. */
  expectedSha256?: string | null
  targetVersion: string
  /** Local SMAPI installer archive to install from instead of downloading. */
  localFilePath?: string | null
}

export type InstallSmapiUpdateResult = {
  success: boolean
  installedVersion: string
}

/** Progress event emitted while a SMAPI update is downloaded, verified, and installed. */
export type SmapiUpdateProgressPayload = {
  phase: SmapiUpdatePhase
  percent?: number | null
  message: string
}

/** A recognized SMAPI installer archive found in the user's download directories. */
export type SmapiInstallerDownloadCandidate = {
  path: string
  fileName: string
  version: string
  sizeBytes?: number | null
  /** True for GitHub `-double-zipped` archives (the payload is an inner zip). */
  doubleZipped: boolean
  naming: SmapiInstallerNaming
  /** True when within the game-compatible maximum; null when unresolved. */
  compatible?: boolean | null
  /** True when at or above the current target version; null when unresolved. */
  satisfiesTarget?: boolean | null
}

/** Result of scanning the user's download directories for SMAPI installer archives. */
export type FindSmapiInstallerDownloadsResult = {
  /** Newest version first. */
  candidates: SmapiInstallerDownloadCandidate[]
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
  folderClassificationMode: 'global' | 'independent'
}

export type LauncherLibraryChildModGroup = {
  parentModKey: string
  childModKeys: string[]
}

export type LauncherLibraryFolder = {
  id: string
  name: string
  packId: string | null
  hidden: boolean
  parentFolderId: string | null
  modKeys: string[]
  coverModKeys: string[]
}

export type LauncherLibraryScopeMode = 'all' | 'current-pack'

export type LauncherLibraryState = {
  storageFolders: LauncherLibraryStorageFolder[]
  hiddenModKeys: string[]
  packPresets: LauncherLibraryPackPreset[]
  childModGroups: LauncherLibraryChildModGroup[]
  libraryFolders: LauncherLibraryFolder[]
  customOrders: Record<string, string[]>
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

export type LoadLauncherModConfigRequest = {
  modPath: string
  locale?: string | null
}

export type SaveLauncherModConfigRequest = {
  modPath: string
  locale?: string | null
  values: Record<string, unknown>
}

export type LauncherModConfigSource = 'content-patcher' | 'generic-mod-config-menu' | 'config-json' | 'dll-static'

export type LauncherModConfigFieldType = 'boolean' | 'integer' | 'number' | 'string' | 'string-array' | 'object' | 'unknown'
/** Preferred editor control when a config field's storage type is not expressive enough. */
export type LauncherModConfigUiHint = 'color' | 'item' | 'item-list' | 'keybind' | 'keybind-list'

/** Searchable game item exposed to semantic config editors through the launcher platform port. */
export type LauncherConfigItemOption = {
  id: string
  value: string
  label: string
  category: string | null
  source: string
  sourceKind: string
  metadata: Record<string, string>
}

export type LauncherModConfigProbeStatus = 'not-run' | 'unavailable' | 'succeeded' | 'failed' | 'timed-out'

export type LauncherModConfigField = {
  key: string
  label: string
  description: string | null
  section: string | null
  fieldType: LauncherModConfigFieldType
  uiHint?: LauncherModConfigUiHint | null
  value: unknown
  defaultValue: unknown
  allowValues: unknown[]
  allowBlank: boolean
  allowMultiple: boolean
  editable: boolean
  source: LauncherModConfigSource
}

export type LauncherModConfigResult = {
  modPath: string
  configPath: string
  configExists: boolean
  fields: LauncherModConfigField[]
  schemaSources: LauncherModConfigSource[]
  warnings: string[]
  probeStatus: LauncherModConfigProbeStatus
  probeDiagnostics?: Record<string, unknown> | null
}

export type LauncherGmcmProbeDiagnosticStatus = 'ready' | 'warning' | 'unavailable'

export type LauncherGmcmProbeDiagnosticsResult = {
  status: LauncherGmcmProbeDiagnosticStatus
  probeAssemblyPath: string | null
  dotnetPath: string
  dotnetAvailable: boolean
  net6RuntimeAvailable: boolean
  installedRuntimes: string[]
  warnings: string[]
  repairActions: string[]
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
  includeFiles?: boolean
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
  unavailable?: boolean
  unavailableReason?: string | null
  summary: string | null
  description?: string | null
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
  modId?: number | null
  external?: boolean
}

export type LauncherRemoteModFile = {
  fileId?: number | null
  name?: string | null
  version?: string | null
  category?: string | null
  uploadedAt?: string | null
  description?: string | null
  uniqueDownloads?: number | null
  totalDownloads?: number | null
  managerDownloadEnabled?: boolean | null
  uid?: string | null
  size?: number | null
  sizeBytes?: number | null
  primary?: boolean
  scanned?: boolean | null
  scanStatus?: string | null
  changelog?: string[]
  archiveType?: string | null
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
  latencyMs?: number | null
  message: string
}

export type LauncherNexusDiagnosticsResult = {
  routes: LauncherNexusRouteSnapshot[]
}
export type ValidateApiKeyResult = {
  userName: string
  avatarUrl: string | null
  profileUrl: string | null
  isPremium: boolean
  premiumExpiresAt?: string | null
  isLifetimePremium?: boolean | null
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
  modKey?: string | null
}

export type ResolveLauncherImageResult = {
  sourceUrl: string
  localPath: string
  mimeType: string
}

export type LauncherImageFetchDisconnectedPayload = {
  sourceUrl: string
  modKey?: string | null
  error: string
  elapsedMs: number
}

export type LauncherImageFailureEntry = {
  modKey: string
  failureCount: number
  blocked: boolean
  lastError: string
  lastFailedAtMs: number
}

export type LauncherImageFailuresState = {
  entries: LauncherImageFailureEntry[]
}

export type RecordLauncherImageFailureRequest = {
  modKey: string
  error: string
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
  downloadId?: string | null
  modId: number
  fileId?: number | null
  version?: string | null
  title?: string | null
}

export type LauncherDownloadProgressPayload = {
  downloadId: string
  downloadedBytes: number
  totalBytes?: number | null
  bytesPerSecond?: number | null
}

export type DownloadLauncherModResult = {
  modId: number
  title: string
  version: string | null
  fileName: string
  archivePath: string
  installed: boolean
  installedTargetPath: string | null
  manualDownloadPageOpened: boolean
}

export type LauncherGameLaunchTarget = 'smapi' | 'game'

export type LauncherGameLaunchResult = {
  executablePath: string
  target: LauncherGameLaunchTarget
}

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
  /** Version of the primary mod target before this install replaced it. */
  previousVersion?: string | null
  /** True when the primary target already existed and was replaced in place. */
  upgraded?: boolean
}

export type LauncherInstallBackupSummary = {
  backupId: string
  backupPath: string
  deleteCount: number
  overwriteCount: number
  createdAtMs: number
  primaryModName: string | null
  primaryVersion: string | null
  modCount: number
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
  /** Mods folder used to detect already-installed mods and diff against them. */
  modsPath?: string | null
}

export type LauncherArchiveTreeNode = {
  name: string
  path: string
  isDirectory: boolean
  sizeBytes: number | null
  children: LauncherArchiveTreeNode[]
}

/** How one file differs between the archive mod root and the installed folder it would replace. */
export type LauncherArchiveFileChangeKind = 'added' | 'removed' | 'changed'

/** Per-file change detail inside a mod-root diff summary. */
export type LauncherArchiveFileDiff = {
  /** File path relative to the mod root, forward slashes. */
  path: string
  changeKind: LauncherArchiveFileChangeKind
  oldSize?: number | null
  newSize?: number | null
  /** Unix epoch milliseconds on each side; archive side from entry metadata when available. */
  oldModifiedMs?: number | null
  newModifiedMs?: number | null
  /** Unified diff for text changes within the size/line budgets. */
  textDiff?: string | null
  /** True when textDiff was truncated to the line budget. */
  textDiffTruncated?: boolean
}

/** File difference counts and per-file details between an archive mod root and the installed folder it would replace. */
export type LauncherArchiveDiffSummary = {
  added: number
  changed: number
  removed: number
  /** Per-file details; capped per root (see truncatedFileCount). */
  files: LauncherArchiveFileDiff[]
  /** Files omitted beyond the per-root detail cap; absent when nothing was omitted. */
  truncatedFileCount?: number | null
}

/** One detected mod root inside an inspected archive, with manifest metadata and existing-install diff info. */
export type LauncherArchiveModRootInfo = {
  path: string
  manifestUniqueId?: string | null
  manifestName?: string | null
  manifestVersion?: string | null
  existingUniqueId?: string | null
  existingVersion?: string | null
  existingPath?: string | null
  diffSummary?: LauncherArchiveDiffSummary | null
}

export type InspectLauncherArchiveResult = {
  archivePath: string
  archiveFileName: string
  totalEntries: number
  totalFiles: number
  modRoots: LauncherArchiveModRootInfo[]
  tree: LauncherArchiveTreeNode[]
}
