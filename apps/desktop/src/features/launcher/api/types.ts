/** Persisted launcher settings owned by the desktop backend. */
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

/** Partial settings patch accepted by the launcher settings save command. */
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

/** Result of installing a SMAPI update. */
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
  folderClassificationMode: 'global' | 'independent'
}

/** One parent mod and its direct ModForge-only child mod assignments. */
export type LauncherLibraryChildModGroup = {
  parentModKey: string
  childModKeys: string[]
}

/** Virtual launcher-only folder used to visually organize library cards. */
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

/** Persisted launcher library organization state. */
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

/** Cover image assignment for one library entry. */
export type LauncherLibraryCover = {
  labelKey: string
  imagePath: string
}

/** Persisted cover image assignments for the launcher library. */
export type LauncherLibraryCoversState = {
  covers: LauncherLibraryCover[]
}

/** Persistent launcher image failure state used to block repeated bad cover loads. */
export type LauncherImageFailureEntry = {
  modKey: string
  failureCount: number
  blocked: boolean
  lastError: string
  lastFailedAtMs: number
}

/** Persisted launcher image failure registry. */
export type LauncherImageFailuresState = {
  entries: LauncherImageFailureEntry[]
}

/** Request to record a launcher cover failure against one mod key. */
export type RecordLauncherImageFailureRequest = {
  modKey: string
  error: string
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

/** Request to load editable config fields for one installed launcher mod. */
export type LoadLauncherModConfigRequest = {
  modPath: string
  locale?: string | null
}

/** Partial config value map saved back into the mod's config.json. */
export type SaveLauncherModConfigRequest = {
  modPath: string
  locale?: string | null
  values: Record<string, unknown>
}

export type LauncherModConfigSource = 'content-patcher' | 'generic-mod-config-menu' | 'config-json' | 'dll-static'

export type LauncherModConfigFieldType = 'boolean' | 'integer' | 'number' | 'string' | 'string-array' | 'object' | 'unknown'
/** Preferred editor control when a config field's storage type is not expressive enough. */
export type LauncherModConfigUiHint = 'color' | 'item' | 'item-list' | 'keybind' | 'keybind-list'

export type LauncherModConfigProbeStatus = 'not-run' | 'unavailable' | 'succeeded' | 'failed' | 'timed-out'

/** One editable mod config field discovered from CP schema, GMCM, DLL metadata, or config.json. */
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

/** Editable config schema and current values for one installed launcher mod. */
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

/** Availability snapshot for the bundled GMCM probe and .NET runtime host. */
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
  includeFiles?: boolean
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
  latencyMs?: number | null
  message: string
}

/** Current Nexus diagnostics state across all checked routes. */
export type LauncherNexusDiagnosticsResult = {
  routes: LauncherNexusRouteSnapshot[]
}
/** Nexus API key account and quota validation result. */
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
  modKey?: string | null
}

/** Local cached image result for a remote launcher image. */
export type ResolveLauncherImageResult = {
  sourceUrl: string
  localPath: string
  mimeType: string
}

/** Event payload emitted when a remote launcher cover fetch disconnects mid-request. */
export type LauncherImageFetchDisconnectedPayload = {
  sourceUrl: string
  modKey?: string | null
  error: string
  elapsedMs: number
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
  downloadId?: string | null
  modId: number
  fileId?: number | null
  version?: string | null
  title?: string | null
}

/** Progress payload emitted while one remote mod archive is downloading. */
export type LauncherDownloadProgressPayload = {
  downloadId: string
  downloadedBytes: number
  totalBytes?: number | null
  bytesPerSecond?: number | null
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
  manualDownloadPageOpened: boolean
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
  /** Version of the primary mod target before this install replaced it. */
  previousVersion?: string | null
  /** True when the primary target already existed and was replaced in place. */
  upgraded?: boolean
}

/** Install backup entry available for restore. */
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
  /** Mods folder used to detect already-installed mods and diff against them. */
  modsPath?: string | null
}

/** File tree node returned by archive inspection. */
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

/** Archive inspection result used by the install preview dialog. */
export type InspectLauncherArchiveResult = {
  archivePath: string
  archiveFileName: string
  totalEntries: number
  totalFiles: number
  modRoots: LauncherArchiveModRootInfo[]
  tree: LauncherArchiveTreeNode[]
}
