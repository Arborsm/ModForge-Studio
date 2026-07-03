import type {
  SsoConnectionStatus,
  SsoSnapshot,
  ValidateApiKeyResult,
  LauncherSettings,
  ScanLauncherLibraryRequest,
  LauncherLibraryScanResult,
  LauncherRuntimeInfo,
  LauncherLibraryState,
  LauncherLibraryCoversState,
  SetLauncherLibraryCoverRequest,
  PersistLauncherLibraryRemoteCoverRequest,
  LauncherDownloadQueueState,
  SearchLauncherCatalogRequest,
  LauncherCatalogPageResult,
  LoadLauncherRemoteModDetailRequest,
  LauncherRemoteModDetail,
  LoadLauncherUpdateChangelogRequest,
  LauncherUpdateChangelogResult,
  LauncherNexusDiagnosticsResult,
  CheckLauncherUpdatesRequest,
  LauncherUpdatesResult,
  LoadCachedLauncherUpdatesRequest,
  LoadSuppressedLauncherUpdateModIdsRequest,
  LauncherSuppressedUpdateModIdsResult,
  DownloadLauncherModRequest,
  DownloadLauncherModResult,
  InstallLauncherArchiveRequest,
  InstallLauncherArchiveResult,
  ListLauncherInstallBackupsRequest,
  LauncherInstallBackupSummary,
  RestoreLauncherInstallBackupRequest,
  RestoreLauncherInstallBackupResult,
  InspectLauncherArchiveRequest,
  InspectLauncherArchiveResult,
  OpenLauncherPathRequest,
  OpenLauncherUrlRequest,
  ResolveLauncherImageRequest,
  ResolveLauncherImageResult,
  SetLauncherModEnabledRequest,
  SetLauncherModEnabledResult,
  LauncherDownloadProgressPayload,
  LauncherUpdateProgressPayload,
  RecordLauncherImageFailureRequest,
  SaveLauncherSettingsRequest,
  LauncherGameLaunchResult,
} from './launcherContracts'

export type LauncherDebugLogRequest = {
  message: string
  keyValues?: Record<string, string | undefined>
}

export type LauncherPort = {
  loadSettings: () => Promise<LauncherSettings>
  writeDebugLog: (request: LauncherDebugLogRequest) => void
  saveSettings: (request: SaveLauncherSettingsRequest) => Promise<LauncherSettings>
  scanLibrary: (request: ScanLauncherLibraryRequest) => Promise<LauncherLibraryScanResult>
  loadRuntimeInfo: () => Promise<LauncherRuntimeInfo>
  loadLibraryState: () => Promise<LauncherLibraryState>
  saveLibraryState: (request: LauncherLibraryState) => Promise<LauncherLibraryState>
  loadLibraryCovers: () => Promise<LauncherLibraryCoversState>
  loadImageFailures: () => Promise<import('./launcherContracts').LauncherImageFailuresState>
  recordImageFailure: (request: RecordLauncherImageFailureRequest) => Promise<import('./launcherContracts').LauncherImageFailuresState>
  setLibraryCover: (request: SetLauncherLibraryCoverRequest) => Promise<LauncherLibraryCoversState>
  persistLibraryRemoteCover: (request: PersistLauncherLibraryRemoteCoverRequest) => Promise<LauncherLibraryCoversState>
  loadDownloadQueue: () => Promise<LauncherDownloadQueueState>
  saveDownloadQueue: (request: LauncherDownloadQueueState) => Promise<LauncherDownloadQueueState>
  searchCatalog: (request: SearchLauncherCatalogRequest) => Promise<LauncherCatalogPageResult>
  isRemoteModIdInvalid: (modId: number | null | undefined) => boolean
  markRemoteModIdInvalid: (modId: number | null | undefined) => void
  loadRemoteModDetail: (request: LoadLauncherRemoteModDetailRequest) => Promise<LauncherRemoteModDetail>
  loadUpdateChangelog: (request: LoadLauncherUpdateChangelogRequest) => Promise<LauncherUpdateChangelogResult>
  loadNexusDiagnostics: () => Promise<LauncherNexusDiagnosticsResult>
  restartNexusDiagnostics: () => Promise<LauncherNexusDiagnosticsResult>
  retryNexusDiagnosticsRoute: (routeId: string) => Promise<LauncherNexusDiagnosticsResult>
  setNexusForceOffline: (forceOffline: boolean) => Promise<LauncherNexusDiagnosticsResult>
  resolveCachedImage: (request: ResolveLauncherImageRequest) => Promise<ResolveLauncherImageResult | null>
  resolveImage: (request: ResolveLauncherImageRequest) => Promise<ResolveLauncherImageResult>
  loadCachedUpdates: (request: LoadCachedLauncherUpdatesRequest) => Promise<LauncherUpdatesResult | null>
  loadSuppressedUpdateModIds: (request: LoadSuppressedLauncherUpdateModIdsRequest) => Promise<LauncherSuppressedUpdateModIdsResult>
  checkUpdates: (request: CheckLauncherUpdatesRequest) => Promise<LauncherUpdatesResult>
  listenToUpdateProgress: (listener: (payload: LauncherUpdateProgressPayload) => void) => Promise<() => void>
  downloadMod: (request: DownloadLauncherModRequest) => Promise<DownloadLauncherModResult>
  cancelDownload: (downloadId: string) => Promise<void>
  listenToDownloadProgress: (listener: (payload: LauncherDownloadProgressPayload) => void) => Promise<() => void>
  installArchive: (request: InstallLauncherArchiveRequest) => Promise<InstallLauncherArchiveResult>
  listInstallBackups: (request: ListLauncherInstallBackupsRequest) => Promise<LauncherInstallBackupSummary[]>
  restoreInstallBackup: (request: RestoreLauncherInstallBackupRequest) => Promise<RestoreLauncherInstallBackupResult>
  inspectArchive: (request: InspectLauncherArchiveRequest) => Promise<InspectLauncherArchiveResult>
  launchGame: () => Promise<LauncherGameLaunchResult>
  openPath: (request: OpenLauncherPathRequest) => Promise<void>
  openUrl: (request: OpenLauncherUrlRequest) => Promise<void>
  clearLibraryReadCaches: (modsPath?: string | null) => void
  chooseArchiveFile: (title: string) => Promise<string | null>
  chooseImageFile: (title: string) => Promise<string | null>
  getBackupDirectory: () => Promise<string>
  setModEnabled: (request: SetLauncherModEnabledRequest) => Promise<SetLauncherModEnabledResult>
  chooseDirectory: (title: string) => Promise<string | null>
  detectDefaultGameDirectory: () => Promise<string | null>
  toDesktopAssetUrl: (path: string, protocol?: string) => string
  subscribeUpdates: (modsPath: string, listener: (result: LauncherUpdatesResult) => void) => () => void
  validateNexusApiKey: () => Promise<ValidateApiKeyResult>
  startNexusSso: () => Promise<{ ssoId: string; status: SsoConnectionStatus }>
  getNexusSsoStatus: () => Promise<SsoSnapshot>
  cancelNexusSso: () => Promise<void>
}
