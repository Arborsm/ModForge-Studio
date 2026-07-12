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
    autoCheckModUpdates: string
  }
  sortOptions: Record<'newest' | 'updated' | 'trending' | 'downloads' | 'endorsements' | 'name', string>
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
