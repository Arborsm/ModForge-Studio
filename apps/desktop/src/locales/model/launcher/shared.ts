import type { LauncherPage } from '../core'

export type LauncherSharedCopy = {
  title: string
  subtitle: string
  navigation: string
  pages: Record<LauncherPage, string>
  descriptions: Record<LauncherPage, string>
  overview: {
    installedMods: string
    enabledMods: string
    disabledMods: string
    queuedDownloads: string
    activeDownloads: string
    completedDownloads: string
    pendingUpdates: string
  }
  notifications: {
    imageFetchDisconnectedTitle: string
    imageFetchDisconnectedDetail: (count: number) => string
    imageFetchDisconnectedNote: string
  }
  actions: {
    refresh: string
    launchGame: string
    enable: string
    disable: string
    enableSelected: string
    disableSelected: string
    chooseArchive: string
    installArchive: string
    queueDownload: string
    queueSelectedDownloads: string
    loadMore: string
    retry: string
    remove: string
    install: string
    closeDialog: string
    saveSettings: string
    openModPage: string
    viewDetails: string
    selectAllUpdates: string
    clearUpdateSelection: string
    selectAll: string
    clearSelection: string
    hideSelected: string
    showSelected: string
    searchNext: string
    searchPrevious: string
    openFolder: string
    openStorageFolder: string
    openBackupFolder: string
    setCover: string
    clearCover: string
    chooseGalleryCover: string
    hideMod: string
    showMod: string
    createPack: string
    applyCurrentPack: string
    createStorageFolder: string
    moveToStorageFolder: string
    addSelectionToPack: string
    launchFailed: string
  }
  fields: {
    filterLibrary: string
    searchDiscover: string
    currentVersion: string
    galleryImages: string
    latestVersion: string
    uniqueId: string
    path: string
    dependencies: string
    updateKeys: string
    gamePath: string
    modsPath: string
    downloadPath: string
    nexusApiKey: string
  }
  toggles: {
    enabledOnly: string
    configOnly: string
    ascending: string
    autoInstallDownloads: string
    keepDownloadedArchives: string
    gmcmParsingEnabled: string
    showConsoleWindow: string
    showConsoleWindowDescription: string
    autoCheckModUpdates: string
  }
  sortOptions: Record<'newest' | 'updated' | 'trending' | 'downloads' | 'endorsements' | 'name', string>
  /** Android takeover-launch game-log error watch + self-contained AI analysis. */
  logAnalysis: {
    /** Sticky notification title; count is the number of new ERROR lines. */
    notificationTitle: (count: number) => string
    /** Notification body preview of the first error; source may be null. */
    notificationFirstError: (source: string | null, message: string) => string
    /** Notification action that opens the analysis sheet. */
    analyzeAction: string
    /** Analysis sheet title. */
    sheetTitle: string
    /** Header of the raw-error list inside the sheet. */
    errorsSectionTitle: (count: number) => string
    /** Note under the list when only the first errors are rendered. */
    errorsTruncated: (count: number) => string
    /** Fallback when an error line has no message text. */
    emptyErrorMessage: string
    /** Setup form labels/hints shown while no usable provider config exists. */
    setupTitle: string
    setupDescription: string
    providerLabel: string
    modelLabel: string
    apiKeyLabel: string
    apiKeyHint: string
    saveConfigAction: string
    /** Shown in place of the result while the request is in flight. */
    runningLabel: string
    /** Header of the AI result block. */
    resultTitle: string
    /** Shown when the analysis failed; carries the raw error detail. */
    failedTitle: string
    /** Retry button after a failed run. */
    retryAction: string
    /** Validation when the user saves an incomplete setup form. */
    incompleteConfigMessage: string
  }
  states: {
    loading: string
    noImage: string
    noSummary: string
    settingsIncomplete: string
    missingModsPath: string
    credentialsRequired: string
    queued: string
    downloading: string
    completed: string
    failed: string
    installed: string
  }
}
