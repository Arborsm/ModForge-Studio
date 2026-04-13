export type LocaleCode = 'zh-CN' | 'en-US'
export type ThemeMode = 'dark' | 'light'
export type CoreWorkspaceMode = 'map' | 'characters' | 'buildings' | 'items' | 'events'
export type WorkspaceMode = CoreWorkspaceMode | 'mods'
export type AppMode = 'workbench' | 'launcher'
export type LauncherPage = 'library' | 'discover' | 'updates' | 'debug'
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
  futureLabel: string
  futureDescription: string
  categoryDescriptions: {
    appearance: string
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
    nexusCookie: string
  }
  toggles: {
    enabledOnly: string
    ascending: string
    autoInstallDownloads: string
    keepDownloadedArchives: string
  }
  library: {
    title: string
    subtitle: string
    empty: string
      detailsTitle: string
      detailsSubtitle: string
      selectionEmpty: string
      installHint: string
      previewTitle: string
      previewSubtitle: string
      previewEntries: string
      previewFiles: string
      previewRoots: string
      previewNoRoots: string
      previewLoading: string
      previewError: string
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
  }
  downloads: {
    title: string
    subtitle: string
    empty: string
  }
  settings: {
    title: string
    subtitle: string
    pathsTitle: string
    pathsHint: string
    nexusAccessTitle: string
    downloadBehaviorTitle: string
    downloadBehaviorHint: string
    autoInstallHint: string
    keepArchivesHint: string
    loadFailed: string
    saved: string
    saveFailed: string
  }
  debug: {
    title: string
    subtitle: string
    debugOnlyTitle: string
    debugOnlyDescription: string
    notificationsOverviewTitle: string
    logsOverviewTitle: string
    notificationsTitle: string
    notificationsSubtitle: string
    logsTitle: string
    logsSubtitle: string
    clearImageCacheTitle: string
    clearImageCacheSubtitle: string
    clearImageCacheButton: string
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
