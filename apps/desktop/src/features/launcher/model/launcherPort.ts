import type {
  LauncherSettings,
  ScanLauncherLibraryRequest,
  LauncherLibraryScanResult,
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
  LauncherUpdateProgressPayload,
  SaveLauncherSettingsRequest,
  LauncherGameLaunchResult,
  LauncherPublicHtmlVerificationRequest,
  LauncherPublicHtmlVerificationSnapshot,
} from './launcherContracts'

export type LauncherPort = {
  loadSettings(): Promise<LauncherSettings>
  saveSettings(request: SaveLauncherSettingsRequest): Promise<LauncherSettings>
  scanLibrary(request: ScanLauncherLibraryRequest): Promise<LauncherLibraryScanResult>
  loadLibraryState(): Promise<LauncherLibraryState>
  saveLibraryState(request: LauncherLibraryState): Promise<LauncherLibraryState>
  loadLibraryCovers(): Promise<LauncherLibraryCoversState>
  setLibraryCover(request: SetLauncherLibraryCoverRequest): Promise<LauncherLibraryCoversState>
  persistLibraryRemoteCover(request: PersistLauncherLibraryRemoteCoverRequest): Promise<LauncherLibraryCoversState>
  loadDownloadQueue(): Promise<LauncherDownloadQueueState>
  saveDownloadQueue(request: LauncherDownloadQueueState): Promise<LauncherDownloadQueueState>
  searchCatalog(request: SearchLauncherCatalogRequest): Promise<LauncherCatalogPageResult>
  loadRemoteModDetail(request: LoadLauncherRemoteModDetailRequest): Promise<LauncherRemoteModDetail>
  loadUpdateChangelog(request: LoadLauncherUpdateChangelogRequest): Promise<LauncherUpdateChangelogResult>
  loadNexusDiagnostics(): Promise<LauncherNexusDiagnosticsResult>
  restartNexusDiagnostics(): Promise<LauncherNexusDiagnosticsResult>
  retryNexusDiagnosticsRoute(routeId: string): Promise<LauncherNexusDiagnosticsResult>
  setNexusForceOffline(forceOffline: boolean): Promise<LauncherNexusDiagnosticsResult>
  resolveImage(request: ResolveLauncherImageRequest): Promise<ResolveLauncherImageResult>
  loadCachedUpdates(request: LoadCachedLauncherUpdatesRequest): Promise<LauncherUpdatesResult | null>
  loadSuppressedUpdateModIds(request: LoadSuppressedLauncherUpdateModIdsRequest): Promise<LauncherSuppressedUpdateModIdsResult>
  checkUpdates(request: CheckLauncherUpdatesRequest): Promise<LauncherUpdatesResult>
  listenToUpdateProgress(listener: (payload: LauncherUpdateProgressPayload) => void): Promise<() => void>
  downloadMod(request: DownloadLauncherModRequest): Promise<DownloadLauncherModResult>
  installArchive(request: InstallLauncherArchiveRequest): Promise<InstallLauncherArchiveResult>
  listInstallBackups(request: ListLauncherInstallBackupsRequest): Promise<LauncherInstallBackupSummary[]>
  restoreInstallBackup(request: RestoreLauncherInstallBackupRequest): Promise<RestoreLauncherInstallBackupResult>
  inspectArchive(request: InspectLauncherArchiveRequest): Promise<InspectLauncherArchiveResult>
  launchGame(): Promise<LauncherGameLaunchResult>
  openPath(request: OpenLauncherPathRequest): Promise<void>
  openUrl(request: OpenLauncherUrlRequest): Promise<void>
  clearLibraryReadCaches(modsPath?: string | null): void
  chooseArchiveFile(title: string): Promise<string | null>
  chooseImageFile(title: string): Promise<string | null>
  getBackupDirectory(): Promise<string>
  setModEnabled(request: SetLauncherModEnabledRequest): Promise<SetLauncherModEnabledResult>
  chooseDirectory(title: string): Promise<string | null>
  detectDefaultGameDirectory(): Promise<string | null>
  toDesktopAssetUrl(path: string, protocol?: string): string
  subscribeUpdates(modsPath: string, listener: (result: LauncherUpdatesResult) => void): () => void
  openPublicHtmlVerification(request: LauncherPublicHtmlVerificationRequest): Promise<LauncherPublicHtmlVerificationSnapshot>
  loadPublicHtmlVerificationState(): Promise<LauncherPublicHtmlVerificationSnapshot>
  listenToPublicHtmlVerificationState(listener: (state: LauncherPublicHtmlVerificationSnapshot) => void): Promise<() => void>
  signalPublicHtmlVerificationOpened(): Promise<LauncherPublicHtmlVerificationSnapshot>
  submitPublicHtmlVerificationCookie(cookie: string): Promise<LauncherPublicHtmlVerificationSnapshot>
  cancelPublicHtmlVerification(): Promise<LauncherPublicHtmlVerificationSnapshot>
  refreshPublicHtmlVerification(): Promise<void>
  checkPublicHtmlVerification(): Promise<LauncherPublicHtmlVerificationSnapshot>
  closePublicHtmlVerification(): Promise<void>
  clearPublicHtmlVerificationSession(): Promise<void>
}
