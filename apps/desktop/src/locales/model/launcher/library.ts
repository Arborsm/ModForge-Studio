export type LauncherLibraryCopy = {
  title: string
  subtitle: string
  actionErrorTitle: string
  genericError: string
  emptyTitle: string
  emptyDetail: string
  emptyRefreshAction: string
  filteredEmptyTitle: string
  filteredEmptyDetail: string
  missingModsPathTitle: string
  missingModsPathDetail: string
  missingModsPathAction: string
  detailsTitle: string
  detailsSubtitle: string
  selectionEmpty: string
  modDetail: {
    tabsLabel: string
    tabs: Record<'overview' | 'description' | 'changelog' | 'details' | 'dependencies' | 'files' | 'config', string>
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
    modLoaderRequirement: string
    fileCategory: string
    scanStatus: string
    localRequirement: string
    remoteRequirement: string
    missing: string
    satisfied: string
    requiresSmapiBadge: (version: string) => string
    requiresSmapiTooltip: (version: string) => string
    optionalDependency: string
    disabledDependency: string
    dependencyIssue: string
    dependencyLoading: string
    dependencyLoadError: string
    dependencyCycle: string
    expandDependency: string
    collapseDependency: string
    loadDependencyChildren: string
    downloadDependency: string
    dependencyIssues: (count: number) => string
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
    aiTranslate: string
    aiTranslating: string
    aiTranslatingProgress: (completed: number, total: number) => string
    aiOriginal: string
    aiTranslated: string
    aiRefresh: string
    aiCorpusWarming: string
    aiCorpusWarmupFailed: string
    aiCorpusRetry: string
    aiReasoningChain: string
    aiReasoningChainShow: string
    aiReasoningChainHide: string
    config: {
      title: string
      loading: string
      empty: string
      error: string
      diagnostic: string
      diagnostics: (count: number) => string
      save: string
      saving: string
      revert: string
      restoreDefaults: string
      unsavedTitle: string
      unsavedMessage: string
      unsavedCancel: string
      unsavedDiscard: string
      unsavedSave: string
      invalidJson: string
      invalidColor: string
      colorPicker: (label: string) => string
      keybindUnassigned: string
      keybindListening: string
      clearKeybind: string
      listEntry: (label: string, index: number) => string
      newListEntry: (label: string) => string
      listValuePlaceholder: string
      itemValuePlaceholder: string
      addListEntry: string
      removeListEntry: string
      moveListEntryUp: string
      moveListEntryDown: string
      chooseItem: string
      chooseItemFor: (label: string) => string
      itemPickerTitle: string
      closeItemPicker: string
      searchItems: string
      loadingItems: string
      itemCatalogUnavailable: string
      allItems: string
      itemsFound: (count: number) => string
      noItems: string
      itemPage: (page: number, pageCount: number) => string
      previousItemPage: string
      nextItemPage: string
      sources: {
        contentPatcher: string
        genericModConfigMenu: string
        configJson: string
        dllStatic: string
      }
    }
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
  previewContentsTitle: string
  previewArchiveMeta: (entries: number, files: number) => string
  previewSelectionSummary: (archiveCount: number, rootCount: number) => string
  previewStatusNew: string
  previewStatusUpdate: string
  previewStatusReinstall: string
  previewStatusDowngrade: string
  previewVersionChange: (from: string, to: string) => string
  previewDiffSummary: (added: number, changed: number, removed: number) => string
  previewActionUpdate: string
  installSummaryUpgraded: (from: string, to: string) => string
  diffChangeAdded: string
  diffChangeRemoved: string
  diffChangeChanged: string
  diffModifiedLabel: string
  diffSizeLabel: string
  diffModifiedChange: (from: string, to: string) => string
  diffSizeChange: (from: string, to: string, delta: string) => string
  diffExpandLines: (count: number) => string
  diffExpandFiles: (count: number) => string
  diffCollapse: string
  diffMoreFiles: (count: number) => string
  diffTruncatedHint: string
  diffNoChanges: string
  diffUnavailable: string
  dragDropInstallTitle: string
  dragDropInstallSubtitle: (formats: string) => string
  dragDropZoneTitle: string
  dragDropZoneBrowseHint: string
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
  installBackupDeleteCount: (count: number) => string
  installBackupOverwriteCount: (count: number) => string
  installBackupCreatedAt: (timestamp: string) => string
  installBackupModCount: (count: number) => string
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
  sortByFolder: string
  sortByCustom: string
  sortingLabel: string
  sortingDragHint: string
  sortingDone: string
  startSortingLabel: string
  customSortHint: string
  moreActions: string
  storageTargetLabel: string
  packTargetLabel: string
  noCover: string
  packLabel: string
  storageFolderLabel: string
  manageCurrentPack: string
  editPackInfo: string
  deleteCurrentPack: string
  editCurrentPack: string
  editingPackLabel: string
  includedModsCount: (count: number) => string
  cancelEdit: string
  saveChanges: string
  editPackInfoPrompt: (name: string) => string
  syncGlobalFolders: string
  syncGlobalFoldersHint: string
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
  hideLibraryFolder: string
  showLibraryFolder: string
  enableLibraryFolder: string
  disableLibraryFolder: string
  libraryFolderCount: (count: number) => string
  libraryFolderEmpty: string
  openLibraryFolder: (name: string) => string
  missingDependenciesCount: (count: number) => string
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
