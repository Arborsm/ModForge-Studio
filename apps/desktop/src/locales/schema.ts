export type LocaleCode = 'zh-CN' | 'en-US'
export type ThemeMode = 'dark' | 'light'
export type CoreWorkspaceMode = 'map' | 'characters' | 'buildings' | 'items' | 'events'
export type WorkspaceMode = CoreWorkspaceMode | 'mods'
export type AppMode = 'workbench' | 'launcher'
export type LauncherPage = 'library' | 'discover' | 'updates' | 'configuration'
export type WorkspaceTone = 'idle' | 'working' | 'ready' | 'error'
export type WorldAtlasViewId = 'main' | 'remote'

export type ViewMenuCopy = {
  title: string
  resetLabel: string
  savePresetLabel: string
  panelsLabel: string
  panelVisibleLabel: string
  panelHiddenLabel: string
  presetsLabel: string
  emptyPresetsLabel: string
  presetNamePrompt: string
  deletePresetLabel: string
  deletePresetConfirm: (name: string) => string
}

export type SettingsMenuCopy = {
  title: string
  categories: {
    appearance: string
    loading: string
    view: string
    interaction: string
    launcher: string
    debug: string
  }
  accentLabel: string
  resetAccentLabel: string
  accentDescription: string
  languageLabel: string
  languageDescription: string
  localeLabels: Record<LocaleCode, string>
  windowModeLabel: string
  borderlessFullscreenLabel: string
  borderlessFullscreenDescription: string
  enableBorderlessFullscreenLabel: string
  disableBorderlessFullscreenLabel: string
  debugModeLabel: string
  debugModeDescription: string
  enableDebugModeLabel: string
  disableDebugModeLabel: string
  notificationSoundLabel: string
  notificationSoundDescription: string
  enableNotificationSoundLabel: string
  disableNotificationSoundLabel: string
  loadingMotionStyleLabel: string
  loadingMotionStyleDescription: string
  loadingMotionIntensityLabel: string
  loadingMotionIntensityDescription: string
  loadingMotionSpeedLabel: string
  loadingMotionSpeedDescription: string
  loadingMotionCustomSpeedLabel: string
  loadingMotionCustomSpeedDescription: string
  loadingMotionCustomSpeedToggleLabel: string
  loadingMotionPresetSpeedToggleLabel: string
  loadingMotionSpeedValueLabel: (value: number) => string
  futureLabel: string
  futureDescription: string
  categoryDescriptions: {
    appearance: string
    loading: string
    view: string
    interaction: string
    launcher: string
    debug: string
  }
}

export type ViewportLabels = {
  loadPrompt: string
  zoomOut: string
  oneToOne: string
  fit: string
  zoomIn: string
  fitMap: string
  setOneToOne: string
  centerView: string
  resetPan: string
  addObjectHere: string
  inspectHover: string
  unavailable: string
  tilesLabel: string
  tilesetsLoadedLabel: (loaded: number, total: number) => string
  layersVisibleLabel: (visible: number, total: number) => string
  objectGroupsVisibleLabel: (visible: number, total: number) => string
  zoomLabel: (zoom: number) => string
  failedToLoadTilesetImage: (path: string) => string
}

export type EventStageCopy = {
  empty: string
  scene: string
  sceneIdle: string
  stageWaiting: string
  stageMissing: string
  stageFailed: string
  play: string
  pause: string
  step: string
  reset: string
  branch: string
  choose: string
  toggleGrid: string
  showPathsLayer: string
  configurePlayerAppearance: string
  statusMusic: string
  statusSound: string
  statusAmbient: string
  statusFade: string
  stageMapUnsupported: string
  musicStopped: string
  stopCurrentEventMusic: string
  stopTrackedSound: string
  fadeCleared: string
  screenFadeToBlack: string
  globalFadeToBlack: string
  globalFadeCleared: string
  clear: string
  cueLabel: (cue: string) => string
  stopCueLabel: (cue: string) => string
  flashAlphaLabel: (alpha: string) => string
}

export type CharactersPanelCopy = {
  browserTitle: string
  browserSubtitle: string
  browserFilterPlaceholder: string
  browserFilteredEmpty: string
  browserUnloadedEmpty: string
  indexedStatusTemplate: string
  noEntriesStatus: string
  workspaceTitle: string
  workspaceSubtitle: string
  defaultVariant: string
  currentVariant: string
  defaultBadge: string
  variantsTitle: string
  walkingTitle: string
  breathingTitle: string
  portraitTitle: string
  giftTastesTitle: string
  lovedItemsTitle: string
  likedItemsTitle: string
  neutralItemsTitle: string
  dislikedItemsTitle: string
  hatedItemsTitle: string
  giftTastesEmpty: string
  giftRuleItem: string
  giftRuleCategory: string
  giftRuleTag: string
  giftRuleDefault: string
  giftRuleSpecial: string
  giftExpandPrompt: string
  giftCollapsePrompt: string
  giftCategoryGem: string
  giftCategoryItem: string
  giftCategoryFish: string
  giftCategoryEgg: string
  giftCategoryMilk: string
  giftCategoryCooking: string
  giftCategoryCrafting: string
  giftCategoryMineral: string
  giftCategoryAnimalProduct: string
  giftCategoryMetalResource: string
  giftCategoryBuildingResource: string
  giftCategoryFlower: string
  giftCategoryForage: string
  giftCategoryArtisan: string
  giftCategorySyrup: string
  giftCategoryMonsterLoot: string
  giftCategoryFertilizer: string
  giftCategoryTrash: string
  giftCategoryBait: string
  giftCategoryFishingTackle: string
  giftCategoryDecor: string
  giftCategoryIngredient: string
  giftCategorySeed: string
  giftCategoryVegetable: string
  giftCategoryFruit: string
  giftCategoryEquipment: string
  giftCategoryHat: string
  giftCategoryRing: string
  giftCategoryBoots: string
  giftCategoryWeapon: string
  giftCategoryTool: string
  giftCategoryClothing: string
  giftCategoryTrinket: string
  giftCategoryBook: string
  giftCategorySkillBook: string
  giftCategoryLitter: string
  giftDefaultLowPrice: string
  giftDefaultInedible: string
  giftSpecialArch: string
  giftTagBook: string
  giftTagGoods: string
  giftTagRed: string
  giftTagBlue: string
  giftTagGreen: string
  giftTagYellow: string
  giftTagPurple: string
  giftTagBlack: string
  giftTagWhite: string
  giftTagOrange: string
  giftTagOcean: string
  giftTagRiver: string
  giftTagLake: string
  giftTagCrabPot: string
  portraitMissing: string
  spriteMissing: string
  breathHint: string
  expressions: string
  shakeBadge: string
  assetSource: string
  directionLabels: {
    down: string
    left: string
    right: string
    up: string
  }
  inspectorTitle: string
  inspectorSubtitle: string
  inspectorEmpty: string
  basics: string
  metadata: string
  assets: string
  variantsPanelTitle: string
  variantsPanelSubtitle: string
  variantsPanelEmpty: string
  defaultBadgeShort: string
  alternateBadgeShort: string
  detailsTitle: string
  detailsSubtitle: string
  detailsEmpty: string
  homes: string
  relations: string
  flags: string
  conditionLabel: string
  seasonLabel: string
  islandAttireLabel: string
  portraitAssetLabel: string
  spriteAssetLabel: string
  displayNameLabel: string
  internalNameLabel: string
  textureLabel: string
  birthdayLabel: string
  homeRegionLabel: string
  romanceLabel: string
  loveInterestLabel: string
  languageLabel: string
  genderLabel: string
  ageLabel: string
  mannerLabel: string
  socialAnxietyLabel: string
  optimismLabel: string
  breatherLabel: string
  receivesGiftsLabel: string
  variantLabel: string
  portraitSizeLabel: string
  spriteSizeLabel: string
  formerNamesLabel: string
  festivalActorIndexLabel: string
  darkSkinLabel: string
  spawnIfMissingLabel: string
  islandVisitLabel: string
}

export type BuildingsPanelCopy = {
  browserTitle: string
  browserSubtitle: string
  browserFilterPlaceholder: string
  browserFilteredEmpty: string
  browserUnloadedEmpty: string
  browserConstructibleTitle: string
  browserConstructibleSubtitle: string
  browserWorldTitle: string
  browserWorldSubtitle: string
  browserConstructibleBadge: string
  browserWorldBadge: string
  browserIndoorBadge: string
  browserExteriorBadge: string
  indexedStatusTemplate: string
  noEntriesStatus: string
  workspaceTitle: string
  workspaceSubtitle: string
  bodyTitle: string
  exteriorTitle: string
  interiorTitle: string
  upgradeTitle: string
  materialsTitle: string
  skinsTitle: string
  indoorDataTitle: string
  exteriorDataTitle: string
  worldEntrancesTitle: string
  noTexture: string
  noIndoorMap: string
  noExteriorMap: string
  loadingIndoorMap: string
  mapFormatUnsupported: string
  materialsEmpty: string
  skinsEmpty: string
  worldEntrancesEmpty: string
  stageLabel: string
  currentBadge: string
  baseBadge: string
  finalBadge: string
  upgradeBadge: string
  separateBuildBadge: string
  materialCountLabel: string
  skinCountLabel: string
  inspectorTitle: string
  inspectorSubtitle: string
  inspectorEmpty: string
  basics: string
  construction: string
  indoor: string
  assets: string
  displayNameLabel: string
  internalNameLabel: string
  descriptionLabel: string
  builderLabel: string
  typeLabel: string
  buildDaysLabel: string
  buildCostLabel: string
  buildConditionLabel: string
  magicalLabel: string
  sourceKindLabel: string
  sourceConstructibleLabel: string
  sourceWorldLabel: string
  groupLabel: string
  upgradeFromLabel: string
  upgradeToLabel: string
  sizeLabel: string
  humanDoorLabel: string
  animalDoorLabel: string
  indoorMapLabel: string
  exteriorMapLabel: string
  exteriorEntryLabel: string
  indoorTypeLabel: string
  nonInstancedIndoorLabel: string
  entranceCountLabel: string
  sourceMapLabel: string
  sourceTileLabel: string
  targetTileLabel: string
  triggerLabel: string
  validOccupantsLabel: string
  occupantsLabel: string
  hayCapacityLabel: string
  pregnancyLabel: string
  textureLabel: string
  textureSizeLabel: string
  texturePathLabel: string
  sourceRectLabel: string
  drawOffsetLabel: string
  sortOffsetLabel: string
  mapPathLabel: string
  stagesPanelTitle: string
  stagesPanelSubtitle: string
  stagesPanelEmpty: string
  detailsTitle: string
  detailsSubtitle: string
  detailsEmpty: string
  placementTitle: string
  runtimeDataTitle: string
  metadataTitle: string
  additionalPlacementTilesLabel: string
  collisionMapLabel: string
  fadeWhenBehindLabel: string
  flooringLabel: string
  additionalTileRadiusLabel: string
  chestsLabel: string
  actionTilesLabel: string
  tilePropertiesLabel: string
  itemConversionsLabel: string
  drawLayersLabel: string
  indoorItemsLabel: string
  indoorItemMovesLabel: string
  addMailLabel: string
  metadataLabel: string
  modDataLabel: string
  customFieldsLabel: string
  yesLabel: string
  noLabel: string
  noneLabel: string
}

export type ItemsPanelCopy = {
  browserTitle: string
  browserSubtitle: string
  browserFilterPlaceholder: string
  browserFilteredEmpty: string
  browserUnloadedEmpty: string
  indexedStatusTemplate: string
  noEntriesStatus: string
  statsAllLabel: string
  statsCraftingLabel: string
  statsCookingLabel: string
  statsFishLabel: string
  statsCropLabel: string
  filtersTitle: string
  workspaceTitle: string
  workspaceSubtitle: string
  workspaceEmpty: string
  overviewTitle: string
  overviewSubtitle: string
  cropSectionTitle: string
  fishSectionTitle: string
  recipeSectionTitle: string
  harvestSectionTitle: string
  shopSectionTitle: string
  machineSectionTitle: string
  sourceSectionTitle: string
  noDescription: string
  noneLabel: string
  priceLabel: string
  edibilityLabel: string
  typeLabel: string
  textureLabel: string
  cropSeasonsLabel: string
  cropGrowthLabel: string
  cropRegrowLabel: string
  cropYieldLabel: string
  fishDifficultyLabel: string
  fishTimeLabel: string
  fishWeatherLabel: string
  fishLevelLabel: string
  craftingRecipeLabel: string
  cookingRecipeLabel: string
  recipeSaleLabel: string
  itemSaleLabel: string
  artifactSourceLabel: string
  forageSourceLabel: string
  pondSourceLabel: string
  inspectorTitle: string
  inspectorSubtitle: string
  inspectorEmpty: string
  basicsTitle: string
  assetTitle: string
  displayNameLabel: string
  internalNameLabel: string
  qualifiedIdLabel: string
  kindLabel: string
  spriteIndexLabel: string
  textureSizeLabel: string
  recipesPanelTitle: string
  recipesPanelSubtitle: string
  recipesPanelEmpty: string
  recipeOutputTitle: string
  recipeInputTitle: string
  sourcesPanelTitle: string
  sourcesPanelSubtitle: string
  sourcesPanelEmpty: string
  sourceSectionEmpty: string
  giftSectionTitle: string
  giftLoveTitle: string
  giftLikeTitle: string
  kindLabels: Record<'object' | 'big-craftable' | 'weapon' | 'tool' | 'shirt' | 'pants' | 'trinket' | 'hat' | 'boots' | 'furniture', string>
}

type ModuleNode = {
  title: string
  detail: string
}

export type ModuleBlueprint = {
  title: string
  state: string
  summary: string
  focusTitle: string
  listTitle: string
  inspectorTitle: string
  list: string[]
  lanes: string[]
  bullets: string[]
  nodes: ModuleNode[]
}

export type LauncherCopy = {
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
    ascending: string
    autoInstallDownloads: string
    keepDownloadedArchives: string
    autoCheckModUpdates: string
  }
  library: {
    title: string
    subtitle: string
    empty: string
    detailsTitle: string
    detailsSubtitle: string
    selectionEmpty: string
    modDetail: {
      tabsLabel: string
      tabs: Record<'overview' | 'description' | 'details' | 'dependencies' | 'files', string>
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
    installSummaryInstalledMods: (count: number) => string
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
    galleryCoverTitle: string
    galleryCoverSubtitle: string
    galleryCoverEmpty: string
    galleryCoverLoading: string
    galleryCoverImageLabel: (index: number) => string
  }
  discover: {
    title: string
    subtitle: string
    empty: string
    credentialsHint: string
    loadingResults: string
    loadingPage: (page: number) => string
    loadingCover: string
    blockedTitle: string
    blockedDetail: string
    blockedIssueLabel: string
    blockedRetryAction: string
    blockedDiagnosticsAction: string
    blockedDetailsExpandAction: string
    blockedDetailsCollapseAction: string
    blockedCopyLogsAction: string
    errorTitle: string
    errorDetail: string
  }
  updates: {
    title: string
    subtitle: string
    empty: string
    selectionSummary: (selected: number, total: number) => string
    availableCount: (count: number) => string
    toggleSelection: (allSelected: boolean) => string
    recheck: string
    updateSelected: string
    updateOne: string
    expandDetails: string
    viewChangelog: string
    fetchDetails: string
    fetchChangelog: string
    openHomepage: string
    openComments: string
    overviewTitle: string
    releaseLabel: string
    sizeLabel: string
    detailsLoading: string
    detailsEmpty: string
    changelogTitle: (version: string | null) => string
    changelogLoading: string
    changelogEmpty: string
    fetchDetailNotice: string
    fetchChangelogNotice: string
    releaseUnknown: string
    sizeUnknown: string
    checkingProgressTitle: string
    checkingProgressDetail: (checked: number, total: number, currentModName: string | null) => string
    checkFailedTitle: string
    checkFailedDetail: string
    issueLabel: string
    diagnosticsAction: string
    detailsExpandAction: string
    detailsCollapseAction: string
    copyLogsAction: string
    blockedTitle: string
    blockedDetail: string
  }
  diagnostics: {
    title: string
    sectionTitle: string
    sectionSubtitle: string
    apiKeyTitle: string
    apiKeySubtitle: string
    apiKeyBadge: string
    apiKeyMissing: string
    apiKeyUnchecked: string
    premiumActive: string
    premiumFree: string
    quotaRemaining: (remaining: string) => string
    hourlyQuotaRemaining: (remaining: string) => string
    quotaResetAt: (time: string) => string
    lastRefresh: (time: string) => string
    staleWarning: string
    loading: string
    empty: string
    justNow: string
    secondsAgo: (seconds: string) => string
    minutesAgo: (minutes: string) => string
    hoursAgo: (hours: string) => string
    retryRouteAction: (routeLabel: string) => string
    validateApiKeyAction: string
    startSsoAction: string
    cancelSsoAction: string
    ssoWaiting: string
    ssoAuthorized: string
    errorCardLabel: string
    errors: Record<
      | 'invalidApiKey'
      | 'premiumRequired'
      | 'rateLimited'
      | 'serviceUnavailable'
      | 'network'
      | 'ssoCancelled'
      | 'ssoTimeout'
      | 'ssoDenied'
      | 'unknown',
      {
        title: string
        detail: string
        action: string
      }
    >
  }
  downloads: {
    title: string
    subtitle: string
    empty: string
    manualDownloadOpenedTitle: string
    manualDownloadOpenedDetail: string
  }
  settings: {
    title: string
    subtitle: string
    pathsTitle: string
    pathsHint: string
    gamePathHint: string
    modsPathHint: string
    downloadPathHint: string
    pathNotConfigured: string
    nexusAccessTitle: string
    nexusAccessHint: string
    nexusReauthorize: string
    nexusNormalStatus: string
    nexusApiSsoMethod: string
    nexusGuestTitle: string
    nexusGuestSubtitle: string
    nexusSignInAction: string
    nexusPasteApiKeyAction: string
    nexusClearApiKeyAction: string
    nexusQuotaDaily: string
    nexusQuotaHourly: string
    nexusQuotaDailyLimit: string
    nexusQuotaHourlyLimit: string
    nexusQuotaPercent: (percent: number) => string
    nexusQuotaResetIn: (duration: string) => string
    nexusQuotaDurationHoursMinutes: (hours: number, minutes: number) => string
    nexusQuotaDurationMinutes: (minutes: number) => string
    nexusQuotaDailyResetHint: string
    nexusQuotaHourlyResetHint: string
    nexusApiRest: string
    nexusApiGraphql: string
    nexusApiImageCdn: string
    nexusApiAvailable: string
    nexusApiSlow: string
    nexusApiUnavailable: string
    downloadBehaviorTitle: string
    downloadDefaultsTitle: string
    downloadBehaviorHint: string
    autoCheckUpdatesHint: string
    autoInstallHint: string
    keepArchivesHint: string
    loadFailed: string
    saved: string
    saveFailed: string
    configurationScoreLabel: string
    configurationReady: string
    configurationNeedsReview: string
    configurationBreadcrumb: string
    configurationGameTitle: string
    configurationStatusLine: (status: string, modCount: string, diagnosticsAge: string) => string
    configurationInstalledMods: (count: number) => string
    configurationInstalledModsUnknown: string
    configurationDiagnosticsJustNow: string
    configurationDiagnosticsMinutesAgo: (minutes: number) => string
    configurationRunDiagnostics: string
    configurationViewLogs: string
    configurationGameVersionTag: (version: string) => string
    configurationSmapiVersionTag: (version: string) => string
    configurationVersionUnknown: string
    configurationIssueSummary: (pending: number) => string
    configuredPathsSummary: (configured: number, total: number) => string
    completionTitle: string
    completionReady: (ready: number, total: number) => string
    completionPending: (pending: number) => string
    stepPaths: string
    stepNexus: string
    stepDownloads: string
    stepDiagnostics: string
    nexusReady: string
    nexusMissing: string
    downloadsReady: string
    downloadsLimited: string
    diagnosticsHealthy: string
    diagnosticsReview: string
  }
  configuration: {
    title: string
    subtitle: string
    moreToolsTitle: string
    moreToolsSubtitle: string
    moreToolsAction: string
    lessToolsAction: string
    debugOnlyTitle: string
    debugOnlyDescription: string
    notificationsOverviewTitle: string
    logsOverviewTitle: string
    notificationsTitle: string
    notificationsSubtitle: string
    logsTitle: string
    logsSubtitle: string
    nexusDiagnosticsTitle: string
    nexusDiagnosticsSubtitle: string
    nexusDiagnosticsLoading: string
    nexusDiagnosticsEmpty: string
    nexusDiagnosticsEndpointLabel: string
    nexusDiagnosticsAttemptsLabel: string
    nexusDiagnosticsRouteLabel: string
    nexusDiagnosticsObservedLabel: string
    nexusDiagnosticsAvailabilityLabel: string
    nexusDiagnosticsAvailableState: string
    nexusDiagnosticsUnavailableState: string
    nexusDiagnosticsLoadingState: string
    nexusDiagnosticsRouteResponsibilities: Record<
      'publicGraphql' | 'privateGraphql' | 'nexusApi' | 'nexusImages' | 'smapi' | 'fallback',
      string
    >
    nexusDiagnosticsNotificationTitle: string
    nexusDiagnosticsNotificationImpact: (targets: string) => string
    nexusDiagnosticsNotificationLimitedImpact: string
    nexusDiagnosticsNotificationBody: (count: number) => string
    nexusDiagnosticsNotificationNote: string
    nexusMessagePreviewTitle: string
    nexusMessagePreviewSubtitle: string
    nexusMessagePreviewHealthyDetail: string
    nexusMessagePreviewUnavailableDetail: (targets: string) => string
    nexusMessagePreviewLimitedDetail: string
    nexusMessagePreviewNote: string
    nexusMessagePreviewDiscoverTarget: string
    nexusMessagePreviewUpdatesTarget: string
    forceOfflineEnableButton: string
    forceOfflineDisableButton: string
    forceOfflineEnabledLabel: string
    forceOfflineDisabledLabel: string
    forceNonPremiumEnableButton: string
    forceNonPremiumDisableButton: string
    forceNonPremiumEnabledLabel: string
    forceNonPremiumDisabledLabel: string
    clearImageCacheTitle: string
    clearImageCacheSubtitle: string
    clearImageCacheButton: string
    bbcodePreviewTitle: string
    bbcodePreviewSubtitle: string
    bbcodePreviewExpandAction: string
    bbcodePreviewCollapseAction: string
    simulationTitle: string
    simulationSubtitle: string
    simulationButtonIdle: string
    simulationButtonRunning: string
    notificationButtons: Record<'debug' | 'info' | 'success' | 'warning' | 'error', string>
    logButtons: Record<'debug' | 'info' | 'warning' | 'error', string>
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

export type EditorCopy = {
  brand: {
    name: string
    tagline: string
  }
  shell: {
    modeLabel: string
    workbench: string
    launcher: string
  }
  launcher: LauncherCopy
  menus: string[]
  nav: Record<CoreWorkspaceMode, string>
  localeShort: Record<LocaleCode, string>
  statusTone: Record<WorkspaceTone, string>
  controls: {
    toggleTheme: string
    toggleLocale: string
    browse: string
    useKnownPath: string
    validateOnly: string
    scanAndOpenTown: string
    showAll: string
    hideAll: string
  }
  initialization: {
    recent: string
    detected: string
    clickToUse: string
    none: string
  }
  leftDock: {
    project: string
    projectSubtitle: string
    contentBrowser: string
    contentSubtitle: string
    extensionRail: string
    extensionSubtitle: string
    hostMode: string
    browserHost: string
    desktopHost: string
    gameDirectory: string
    directoryPlaceholder: string
    filterMaps: string
    filterPlaceholder: string
    preferredFormat: string
    detectedMaps: string
    sceneFocus: string
    installState: string
    preferredMaps: string
    noMapsFound: string
    noFilteredMaps: string
    pinned: string
    reserved: string
  }
  center: {
    activeScene: string
    noSceneLoaded: string
    viewport: string
    canvas: string
    rightClick: string
    selectTool: string
    panTool: string
    previewGameWorldAdditions: string
    hideGameWorldAdditions: string
    showGrid: string
    hideGrid: string
    moduleWorkspace: string
    moduleWorkspaceDisabled: string
    moduleCanvas: string
    moduleInspector: string
  }
  rightDock: {
    title: string
    subtitle: string
    inspector: string
    layers: string
    objectGroups: string
    diagnostics: string
    sceneSummary: string
    hoverProbe: string
    hoverDetails: string
    projectFacts: string
    workspaceStatus: string
    noTileProperties: string
    noObjectGroups: string
    noHoveredObjects: string
    diagnosticsPrompt: string
    layerTiles: string
    objectCount: string
    objectGroupSummary: (objectCount: number, interactionCount: number, pointCount: number) => string
    objectGroupCollectionSummary: (groupCount: number, objectCount: number, interactionCount: number, pointCount: number) => string
  }
  statusBar: {
    pathValid: string
    pathMissing: string
    scanned: string
    hover: string
    coordinates: string
    event: string
    commands: string
    actors: string
    selectedCommand: string
    modified: string
    design: string
    noEditItem: string
  }
  common: {
    none: string
    yes: string
    no: string
    dimensions: string
    tileSize: string
    tilesets: string
    objectGroups: string
    path: string
    orientation: string
    renderOrder: string
    format: string
    tile: string
    pixel: string
    gid: string
    layer: string
    tileId: string
    tileProperties: string
    type: string
    bounds: string
    executable: string
    mapsPath: string
    visibleLayers: string
    visibleObjects: string
    objectLabel: (id: number) => string
  }
  messages: {
    browserHostPrompt: string
    detectingDefaultInstall: string
    detectedKnownPath: (path: string) => string
    automaticDetectionFailed: string
    enterFolderBeforeValidating: string
    validatingDirectory: string
    validatedDirectory: (path: string) => string
    validationFailed: string
    enterFolderBeforeScanning: string
    validatingAndScanning: string
    mapScanFailed: string
    loadingMap: string
    loadingMapFailed: string
    preloadingResources: string
    preloadingWorldData: string
    preloadingMaps: string
    preloadingTilesets: string
    resourcePreloadFailed: string
    onlyTmxSupported: string
    directorySelectionFailed: string
    loadedMapAssets: (count: number, format: string) => string
    loadedMapAssetsWithActiveMap: (count: number, format: string, mapName: string) => string
  }
  viewportLabels: ViewportLabels
  studioDesk: {
    title: string
    heading: string
    subtitle: string
    heroSubtitle: string
    designTagsLabel: string
    designTags: string[]
    projectLobby: string
    projectLobbyControl: string
    projectGrid: string
    projectCount: (count: number) => string
    searchProjects: string
    galleryFilters: Record<'all' | 'active' | 'export' | 'conflict' | 'archive', string>
    overview: string
    totalProjects: string
    waitingExport: string
    needsAttention: string
    returnCurrentDesk: string
    currentActive: string
    pendingExport: string
    hasConflict: string
    archived: string
    openProject: string
    selectProject: (name: string) => string
    copyProject: string
    deleteProject: string
    selectedProjects: (count: number) => string
    clearSelection: string
    bulkDelete: string
    deleteProjectTitle: string
    deleteProjectMessage: (name: string) => string
    deleteProjectsMessage: (count: number) => string
    creativeMode: string
    newCreation: string
    newEvent: string
    newMap: string
    newItem: string
    recentInspirations: string
    modified: string
    synced: string
    mainStage: string
    cardKickers: {
      scriptwriter: string
      cartographer: string
      castAndProps: string
      projectPulse: string
    }
    creationControls: string
    scriptConsole: string
    stageTabs: Record<'script' | 'map' | 'actors' | 'props', string>
    stageEmpty: string
    wipBadge: string
    wipTitle: (area: string) => string
    wipDescription: string
    wipOpenHint: (area: string) => string
    wipChecklist: string[]
    linkedResources: string
    sortByTime: string
    bibleTabs: Record<'actors' | 'tokens' | 'story' | 'items' | 'scenes', string>
    scriptwriter: string
    cartographer: string
    castAndProps: string
    mostActive: string
    recentChanges: string
    continueScript: string
    openWorkspace: string
    projectPulse: string
    pulseSummary: (action: string) => string
    worldBible: string
    closeWorldBible: string
    quickSearchLabel: string
    quickSearchPlaceholder: string
    globalRules: string
    lexicalReferences: string
    customLocations: string
    exportCenter: string
    publishPack: string
    lastExport: string
    neverExported: string
    noActiveDraftTitle: string
    noActiveDraftSubtitle: string
    createDraft: string
    importDraft: string
    noEntries: string
    searchEmpty: string
    bibleEntryCount: (count: number) => string
    bibleReferenceCount: (count: number) => string
    activeRules: (count: number) => string
    tokenCount: (count: number) => string
    locationCount: (count: number) => string
    assetCount: (count: number) => string
    castCount: (count: number) => string
    avatarInitials: string[]
    avatarOverflow: (count: number) => string
    scriptPreview: {
      firstSpeakerInitial: string
      firstSpeakerName: string
      firstLine: string
      secondSpeakerInitial: string
      secondSpeakerName: string
      choicesLine: string
    }
    edited: {
      justNow: string
      recently: string
      minutesAgo: (minutes: number) => string
      hoursAgo: (hours: number) => string
    }
    stats: {
      events: string
      maps: string
      festivals: string
      assets: string
      conflicts: string
    }
    workspaceDescriptions: Record<WorkspaceMode, string>
    createDialog: {
      title: string
      projectName: string
      uniqueId: string
      author: string
      version: string
      description: string
      cancel: string
      create: string
    }
    exportDialog: {
      title: string
      project: string
      outputDirectory: string
      browse: string
      filesToExport: (count: number) => string
      cancel: string
      export: string
      exporting: string
      selectDirectory: string
    }
    toolbar: {
      back: string
      forward: string
      editView: string
      editor: string
      reference: string
      unsaved: string
      saved: string
      project: string
      add: string
      config: string
      save: string
      saveDirty: string
      patchCount: (count: number) => string
    }
    patchCatalog: {
      title: string
      patches: string
      enabled: string
      draft: string
      dirty: string
      clean: string
      searchPlaceholder: string
      filters: Record<'all' | 'enabled' | 'disabled', string>
      actionFilterLabel: string
      allActions: string
      shown: (count: number) => string
      addPatch: string
      emptyTitle: string
      emptySubtitle: string
      selectedPatch: string
      editPatch: string
      action: string
      target: string
      fromFile: string
      targetField: string
      status: string
      disabled: string
      enablePatch: string
      disablePatch: string
      when: string
      conditions: (count: number) => string
      selectPrompt: string
      deleteTitle: string
      deleteMessage: (name: string) => string
      deleteAction: string
    }
    eventPatchHub: {
      navigationLabel: string
      eventTreeLabel: string
      searchPlaceholder: string
      filtersTitle: string
      filters: Record<'all' | 'withTriggers' | 'withoutTriggers' | 'disabled', string>
      hubLabel: string
      breadcrumbLabel: string
      backLabel: string
      forwardLabel: string
      projectFallback: string
      eventsLabel: string
      savedLabel: string
      unsavedLabel: string
      patchSettingsLabel: string
      multiSelectLabel: string
      selectedCountLabel: (count: number) => string
      addEventLabel: string
      contextMenuLabel: string
      configurePatchAction: string
      duplicatePatchAction: string
      deletePatchAction: string
      openEditorAction: string
      duplicateEventAction: string
      disableEventAction: string
      enableEventAction: string
      deleteEventAction: string
      conditionBuilderAction: string
      conditionBuilder: {
        title: string
        subtitle: string
        closeLabel: string
        eventIdLabel: string
        eventIdPlaceholder: string
        autoGenerateLabel: string
        aliasLabel: string
        aliasPlaceholder: string
        categorySearchPlaceholder: string
        categories: Record<'world' | 'social' | 'player' | 'story' | 'query', string>
        categoryDescriptions: Record<'world' | 'social' | 'player' | 'story' | 'query', string>
        timeTitle: string
        timeStartLabel: string
        timeEndLabel: string
        applyTimeLabel: string
        seasonTitle: string
        seasons: Record<'spring' | 'summer' | 'fall' | 'winter', string>
        weatherTitle: string
        weathers: Record<'sunny' | 'rainy' | 'storm' | 'snow' | 'greenRain', string>
        npcLabel: string
        npcPlaceholder: string
        recentNpcsTitle: string
        npcResultsTitle: string
        friendshipTitle: string
        comparatorAtLeast: string
        comparatorBelow: string
        heartsLabel: (count: number) => string
        friendshipPointsLabel: (points: number, max: number, hearts: number) => string
        specialStatusTitle: string
        datingLabel: string
        spouseLabel: string
        presentLabel: string
        moneyLabel: string
        skillLabel: string
        skillLevelLabel: string
        genderLabel: string
        hasItemLabel: string
        itemPlaceholder: string
        storyEventLabel: string
        storyEventPlaceholder: string
        storyTagPrefix: string
        mailLabel: string
        mailPlaceholder: string
        queryLabel: string
        queryOpenBuilderLabel: string
        querySummaryEmpty: string
        gameStateQueryBuilder: {
          title: string
          subtitle: string
          closeLabel: string
          templateRailLabel: string
          naturalPreviewLabel: string
          codePreviewLabel: string
          emptyPreview: string
          cancelAction: string
          applyAction: string
          categoryAllLabel: string
          categoryLabels: Record<'logic' | 'world' | 'location' | 'player' | 'item' | 'system', string>
          catalogSearchPlaceholder: string
          matchesCountLabel: (count: number) => string
          logicAllLabel: string
          chainTitle: string
          branchTitle: string
          addClauseAction: string
          addBranchAction: string
          addAnyGroupAction: string
          emptyChainLabel: string
          emptyBranchLabel: string
          negateClauseLabel: (code: string) => string
          removeClauseLabel: (code: string) => string
          fieldLabels: Record<
            | 'achievement'
            | 'answer'
            | 'buff'
            | 'building'
            | 'cave'
            | 'chance'
            | 'context'
            | 'count'
            | 'day'
            | 'days'
            | 'end'
            | 'event'
            | 'farm'
            | 'field'
            | 'fish'
            | 'gender'
            | 'item'
            | 'level'
            | 'location'
            | 'mail'
            | 'monster'
            | 'money'
            | 'npc'
            | 'pet'
            | 'player'
            | 'profession'
            | 'quality'
            | 'recipe'
            | 'relationship'
            | 'season'
            | 'song'
            | 'specialOrder'
            | 'start'
            | 'stat'
            | 'tag'
            | 'target'
            | 'type'
            | 'value'
            | 'weather'
            | 'year',
            string
          >
          optionLabels: Record<string, string>
        }
        catalogTitle: string
        catalogCountLabel: (count: number) => string
        catalogArgumentLabel: string
        catalogAddLabel: string
        catalogConditions: Record<
          string,
          {
            title: string
            description: string
            placeholder?: string
            fieldLabel?: string
          }
        >
        catalogPresetLabel: string
        catalogWeekdayLabels: Record<'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun', string>
        catalogAnyPetLabel: string
        catalogPetLabels: Record<'cat' | 'dog', string>
        catalogItemIdLabel: string
        catalogCountInputLabel: string
        catalogTileXLabel: string
        catalogTileYLabel: string
        logicChainTitle: string
        logicChainEmpty: string
        negateLabel: (label: string) => string
        removeChipLabel: (label: string) => string
        conflictLabel: string
        previewDockLabel: string
        validationEventIdRequired: string
        naturalPreviewLabel: string
        naturalPreviewEmpty: string
        naturalPreview: (parts: string[]) => string
        codePreviewLabel: string
        codePreviewEmpty: string
        cancelAction: string
        confirmAction: string
        chipLabels: {
          time: string
          season: string
          weather: string
          friendship: string
          dating: string
          spouse: string
          present: string
          money: string
          skill: string
          gender: string
          item: string
          sawEvent: string
          mail: string
          query: string
        }
      }
      storyboardTitle: string
      storyboardCaption: string
      emptyTitle: string
      emptySubtitle: string
      enterEditorLabel: string
      actorsLabel: string
      noTriggersLabel: string
      noConditionsLabel: string
      noActorsLabel: string
      preconditionGroupLabels: {
        environment: string
        player: string
        progress: string
      }
      preconditionNegatedLabel: (label: string) => string
      preconditionUnknownLabel: (raw: string) => string
      preconditionSeasonName: (season: string) => string
      preconditionWeatherName: (weather: string) => string
      preconditionDayName: (day: string) => string
      preconditionGenderName: (gender: string) => string
      preconditions: {
        gameStateQuery: (query: string) => string
        activeDialogueEvent: (id: string) => string
        dayOfMonth: (days: string[]) => string
        dayOfWeek: (days: string[]) => string
        festivalDay: string
        goldenWalnuts: (count: string) => string
        inUpgradedHouse: (level: string) => string
        npcVisible: (name: string) => string
        npcVisibleHere: (name: string) => string
        random: (chance: string) => string
        season: (seasons: string[]) => string
        time: (min: string, max: string) => string
        upcomingFestival: (days: string) => string
        weather: (weather: string) => string
        worldState: (id: string) => string
        year: (year: string) => string
        choseDialogueAnswers: (ids: string[]) => string
        dating: (name: string) => string
        earnedMoney: (amount: string) => string
        freeInventorySlots: (count: string) => string
        friendship: (pairs: string[]) => string
        gender: (gender: string) => string
        hasItem: (itemId: string) => string
        hasMoney: (amount: string) => string
        localMail: (letterId: string) => string
        missingPet: (pet: string | null) => string
        reachedMineBottom: (count: string) => string
        roommate: string
        sawEvent: (ids: string[]) => string
        sawSecretNote: (noteId: string) => string
        shipped: (pairs: string[]) => string
        skill: (skill: string, level: string) => string
        spouse: (name: string) => string
        spouseBed: string
        tile: (tiles: string[]) => string
        communityCenterOrWarehouseDone: string
        daysPlayed: (days: string) => string
        hostMail: (letterId: string) => string
        hostOrLocalMail: (letterId: string) => string
        isHost: string
        jojaBundlesDone: string
        sendMail: (letterId: string) => string
      }
      gameStateQuerySemantics: {
        all: (parts: string[]) => string
        any: (parts: string[]) => string
        generic: (label: string, args: string[]) => string
        label: (key: string) => string
        description: (key: string) => string
        location: (location: string) => string
        locationSeason: (location: string, seasons: string[]) => string
        weather: (location: string, weather: string[]) => string
        trueLabel: string
        falseLabel: string
      }
      commandCount: (count: number) => string
      actorCount: (count: number) => string
      dialogueCount: (count: number) => string
      eventCount: (count: number) => string
      previewLabel: string
      scriptPreviewTitle: (eventTitle: string) => string
      scriptPreviewEmptyTitle: string
      scriptDraftLabel: string
      noScriptStepsLabel: string
      stagePreviewTitle: (location: string) => string
      stagePreviewEmptyTitle: string
      previewReadyLabel: string
      inspectorTitle: string
      inspectorScope: (eventTitle: string) => string
      noEventSelected: string
      moreActionsLabel: string
      scriptDiagnosticsTitle: string
      noConflictsLabel: string
      resourceStatsTitle: string
      patchScopeLabel: string
      eventLogicTitle: string
      eventLevelLabel: string
      triggerConditionsLabel: string
      involvedActorsLabel: string
      commandMetricLabel: string
      patchConfigTitle: string
      exportReadyLabel: string
      exportBlockedLabel: string
      eventCountLabel: string
      selectedEventLabel: string
      targetFieldPlaceholder: string
    }
  }
  eventStage: EventStageCopy
  charactersPanel: CharactersPanelCopy
  buildingsPanel: BuildingsPanelCopy
  itemsPanel: ItemsPanelCopy
  moduleBlueprints: Record<Exclude<CoreWorkspaceMode, 'map'>, ModuleBlueprint>
}

export type ModWorkspaceCopy = {
  workspaceLabel: string
  workspaceSubtitle: string
  emptyStateTitle: string
  emptyStateSubtitle: string
  browserTitle: string
  browserSubtitle: string
  browserFilterPlaceholder: string
  browserEmpty: string
  contentPatcherOnly: string
  compatibleOnly: string
  incompatibleProject: string
  projectsLabel: string
  filteredLabel: string
  unknownLabel: string
  noVersionLabel: string
  importProject: string
  refreshProjects: string
  openFolder: string
  saveProject: string
  exportProject: string
  manifestTitle: string
  manifestSubtitle: string
  patchesTitle: string
  patchesSubtitle: string
  patchWhenLabel: string
  rawJsonTitle: string
  rawJsonSubtitle: string
  openPatchFlow: string
  inspectorTitle: string
  inspectorSubtitle: string
  diagnosticsTitle: string
  diagnosticsSubtitle: string
  diagnosticsFeedTitle: string
  showDiagnostics: string
  hideDiagnostics: string
  targetDiagnosticsTitle: string
  targetDiagnosticsSubtitle: string
  exportResultTitle: string
  exportResultSubtitle: string
  noProject: string
  noPatch: string
  nextStepsTitle: string
  quickPatchTitle: string
  projectFacts: string
  capabilities: string
  futureScopes: string
  dirtyLabel: string
  cleanLabel: string
  sourcePath: string
  outputPath: string
  patchAction: string
  patchTarget: string
  patchFromFile: string
  patchLogName: string
  formatLabel: string
  patchesCountLabel: string
  configKeysLabel: string
  dynamicTokensLabel: string
  includesLabel: string
  hasI18nLabel: string
  addPatch: string
  removePatch: string
  noTargetLabel: string
  whenLabel: string
  alwaysLabel: string
  noPatchesLabel: string
  diagnosticsListTitle: string
  noDiagnosticsLabel: string
  manifestPathLabel: string
  contentPathLabel: string
  manifestName: string
  manifestAuthor: string
  manifestVersion: string
  manifestUniqueId: string
  manifestDescription: string
  manifestContentPackFor: string
  selectExportFolder: string
  selectProjectFolder: string
  importedFrom: (path: string) => string
  missingRequiredDependencies: (dependencies: string) => string
  saveFailed: string
  exportFailed: string
  saveSuccess: (path: string) => string
  exportSuccess: (path: string) => string
  scanStatus: (count: number) => string
}

export type NotificationCopy = {
  viewportLabel: string
  dismissLabel: string
  actionHint: string
  levels: Record<'success' | 'info' | 'debug' | 'warning' | 'error', string>
}

export type LocaleBundle = {
  editor: EditorCopy
  mods: ModWorkspaceCopy
  notifications: NotificationCopy
  viewMenu: ViewMenuCopy
  settingsMenu: SettingsMenuCopy
  worldAtlasViews: Record<WorldAtlasViewId, string>
}
