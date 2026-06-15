export type LauncherLibraryCopy = {
  title: string
  subtitle: string
  empty: string
  detailsTitle: string
  detailsSubtitle: string
  selectionEmpty: string
  modDetail: {
    tabsLabel: string
    tabs: Record<'overview' | 'description' | 'changelog' | 'details' | 'dependencies' | 'files', string>
    local: string
    byAuthor: string
    installedVersionShort: string
    nexusVersionShort: string
    status: string
    metadata: string
    tags: string
    reach: string
    scan: string
    state: string
    identity: string
    nexus: string
    folder: string
    category: string
    updated: string
    path: string
    clean: string
    dependenciesClean: string
    noNexusLink: string
    installed: string
    currentFolder: string
    version: string
    updateAvailable: string
    nexusPrimaryFile: string
    file: string
    size: string
    whatsNew: string
    primaryFile: string
    readFullDescription: string
    fullDescriptionTitle: string
    installPath: string
    updateEvidence: string
    nexusPage: string
    install: string
    manifest: string
    absolutePath: string
    manifestFile: string
    installedFile: string
    requirement: string
    gameVersion: string
    download: string
    directDownload: string
    vortexSupported: string
    name: string
    fileId: string
    archiveType: string
    method: string
    evidence: string
    confidence: string
    sizeChange: string
    risk: string
    match: string
    updateKey: string
    updateKeyEvidence: string
    exact: string
    verifiedFile: string
    exactUpdateKeyMatch: string
    installedTo: string
    updateNow: string
    reinstall: string
    requirementNotes: string
    externalRequirement: string
    fileCategory: string
    scanStatus: string
    localRequirement: string
    remoteRequirement: string
    missing: string
    satisfied: string
    availableFiles: string
    mainFiles: string
    optionalFiles: string
    oldFiles: string
    oldAndArchivedFiles: string
    uniqueDownloads: (count: string) => string
    totalDownloads: (count: string) => string
    modManagerDownload: string
    filesLoading: string
    changelogEmpty: string
  }
  installHint: string
  previewTitle: string
  previewSubtitle: string
  previewEntries: string
  previewFiles: string
  previewRoots: string
  previewArchiveListTitle: string
  previewArchiveListSubtitle: string
  previewNoRoots: string
  previewLoading: string
  previewProgress: (completed: number, total: number, archiveName: string) => string
  previewError: string
  dragDropInstallTitle: string
  dragDropInstallSubtitle: (formats: string) => string
  dragDropMultipleFiles: string
  dragDropUnsupportedArchive: (formats: string) => string
  dragDropMissingPath: string
  dragDropSkippedUnsupportedArchives: (count: number, formats: string) => string
  dragDropSkippedMissingPaths: (count: number) => string
  installSummaryTitle: string
  installSummarySubtitle: string
  installProgressTitle: string
  installProgress: (completed: number, total: number, archiveName: string) => string
  installProgressKeepWorking: string
  installSummaryInstalledMods: (count: number) => string
  installSummarySucceeded: (count: number) => string
  installSummaryFailed: (count: number) => string
  installSummaryPreservedConfig: string
  installSummaryPreservedI18n: string
  installSummaryBackupSubtitle: string
  installBackupsTitle: string
  installBackupsSubtitle: string
  installBackupsLoading: string
  installBackupsEmpty: string
  installBackupsError: string
  manageInstallBackups: string
  restoreInstallBackup: string
  restoreInstallBackupConfirmTitle: string
  restoreInstallBackupConfirmMessage: (backupId: string, modsPath: string, deleteCount: number, overwriteCount: number) => string
  restoreInstallBackupConfirmAction: string
  installBackupIdLabel: string
  filteredEmpty: string
  scopeTitle: string
  scopeHint: string
  scopeAll: string
  scopeCurrentPack: string
  packTitle: string
  packSubtitle: string
  packButtonLabel: string
  storageTitle: string
  storageSubtitle: string
  storageButtonLabel: string
  managementTitle: string
  managementSubtitle: string
  visibleTitle: string
  selectedTitle: string
  currentPackTitle: string
  allPacks: string
  hiddenMods: string
  allStorageFolders: string
  defaultStorageFolder: string
  selectionButtonLabel: string
  newPackPlaceholder: string
  newStorageFolderPlaceholder: string
  sortLabel: string
  sortByName: string
  sortByEnabled: string
  sortByPack: string
  sortByFolder: string
  storageTargetLabel: string
  packTargetLabel: string
  noCover: string
  packLabel: string
  storageFolderLabel: string
  manageCurrentPack: string
  renameCurrentPack: string
  deleteCurrentPack: string
  editCurrentPack: string
  editingPackLabel: string
  includedModsCount: (count: number) => string
  cancelEdit: string
  saveChanges: string
  renameCurrentPackPrompt: (name: string) => string
  deleteCurrentPackConfirm: (name: string) => string
  chooseChildMods: string
  choosingChildModsLabel: (name: string) => string
  confirmChildMods: string
  selectedChildModsCount: (count: number) => string
  childModsCount: (count: number) => string
  expandChildMods: (name: string) => string
  collapseChildMods: (name: string) => string
  manageChildMods: string
  removeFromParent: string
  parentModLabel: (name: string) => string
  createLibraryFolder: string
  newLibraryFolderName: string
  renameLibraryFolder: string
  renameLibraryFolderPrompt: (name: string) => string
  enableLibraryFolder: string
  disableLibraryFolder: string
  libraryFolderCount: (count: number) => string
  openLibraryFolder: (name: string) => string
  closeLibraryFolder: string
  loadingMissingCoversTitle: string
  loadingMissingCoversCurrentMod: (name: string) => string
  loadingMissingCoversProgress: (completed: number, total: number) => string
  loadingMissingCoversStageProgress: (stage: string, completed: number, total: number) => string
  loadingMissingCoversStages: {
    local: string
    apiCover: string
    apiGallery: string
    remoteCover: string
    remoteGallery: string
  }
  updateAvailableTooltip: (version: string) => string
  galleryCoverTitle: string
  galleryCoverSubtitle: string
  galleryCoverEmpty: string
  galleryCoverLoading: string
  galleryCoverImageLabel: (index: number) => string
}
