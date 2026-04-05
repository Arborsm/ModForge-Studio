export type LocaleCode = 'zh-CN' | 'en-US'
export type ThemeMode = 'dark' | 'light'
export type CoreWorkspaceMode = 'map' | 'characters' | 'buildings' | 'items' | 'events'
export type WorkspaceMode = CoreWorkspaceMode | 'mods'
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
    advanced: string
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
  futureLabel: string
  futureDescription: string
  categoryDescriptions: {
    appearance: string
    view: string
    interaction: string
    advanced: string
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

export type EditorCopy = {
  brand: {
    name: string
    tagline: string
  }
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
  saveSuccess: (path: string) => string
  exportSuccess: (path: string) => string
  scanStatus: (count: number) => string
}

export type LocaleBundle = {
  editor: EditorCopy
  mods: ModWorkspaceCopy
  viewMenu: ViewMenuCopy
  settingsMenu: SettingsMenuCopy
  worldAtlasViews: Record<WorldAtlasViewId, string>
}
