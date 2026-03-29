import enUSLocale from '../locales/en-US.json'
import zhCNLocale from '../locales/zh-CN.json'

export type LocaleCode = 'zh-CN' | 'en-US'
export type ThemeMode = 'dark' | 'light'
export type WorkspaceMode = 'map' | 'characters' | 'buildings' | 'items' | 'events'
export type WorkspaceTone = 'idle' | 'working' | 'ready' | 'error'
export type WorldAtlasViewId = 'main' | 'remote'

export type ViewMenuCopy = {
  title: string
  resetLabel: string
  savePresetLabel: string
  panelsLabel: string
  presetsLabel: string
  emptyPresetsLabel: string
  presetNamePrompt: string
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
  nav: Record<WorkspaceMode, string>
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
    previewGameWorldAdditions?: string
    hideGameWorldAdditions?: string
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
  moduleBlueprints: Record<Exclude<WorkspaceMode, 'map'>, ModuleBlueprint>
}

type RawViewMenuCopy = Omit<ViewMenuCopy, 'deletePresetConfirm'> & {
  deletePresetConfirmTemplate: string
}

type RawMessages = Omit<
  EditorCopy['messages'],
  'detectedKnownPath' | 'validatedDirectory' | 'loadedMapAssets' | 'loadedMapAssetsWithActiveMap'
> & {
  detectedKnownPathTemplate: string
  validatedDirectoryTemplate: string
  loadedMapAssetsTemplate: string
  loadedMapAssetsWithActiveMapTemplate: string
}

type RawViewportLabels = Omit<
  ViewportLabels,
  'tilesetsLoadedLabel' | 'layersVisibleLabel' | 'objectGroupsVisibleLabel' | 'zoomLabel' | 'failedToLoadTilesetImage'
> & {
  tilesetsLoadedLabelTemplate: string
  layersVisibleLabelTemplate: string
  objectGroupsVisibleLabelTemplate: string
  zoomLabelTemplate: string
  failedToLoadTilesetImageTemplate: string
}

type RawEventStageCopy = Omit<EventStageCopy, 'cueLabel' | 'stopCueLabel' | 'flashAlphaLabel'> & {
  cueLabelTemplate: string
  stopCueLabelTemplate: string
  flashAlphaLabelTemplate: string
}

type RawEditorCopy = Omit<EditorCopy, 'common' | 'messages' | 'viewportLabels' | 'eventStage'> & {
  common: Omit<EditorCopy['common'], 'objectLabel'> & {
    objectLabelTemplate: string
  }
  messages: RawMessages
  viewportLabels: RawViewportLabels
  eventStage: RawEventStageCopy
}

type RawLocaleBundle = {
  editor: RawEditorCopy
  worldAtlasViews: Record<WorldAtlasViewId, string>
  viewMenu: RawViewMenuCopy
  settingsMenu: SettingsMenuCopy
}

const localeBundles: Record<LocaleCode, RawLocaleBundle> = {
  'zh-CN': zhCNLocale as RawLocaleBundle,
  'en-US': enUSLocale as RawLocaleBundle,
}

function formatTemplate(template: string, params: Record<string, number | string>) {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) => String(params[key] ?? `{${key}}`))
}

function buildEditorCopy(raw: RawEditorCopy): EditorCopy {
  const { objectLabelTemplate, ...commonRest } = raw.common
  const {
    detectedKnownPathTemplate,
    validatedDirectoryTemplate,
    loadedMapAssetsTemplate,
    loadedMapAssetsWithActiveMapTemplate,
    ...messageRest
  } = raw.messages
  const {
    tilesetsLoadedLabelTemplate,
    layersVisibleLabelTemplate,
    objectGroupsVisibleLabelTemplate,
    zoomLabelTemplate,
    failedToLoadTilesetImageTemplate,
    ...viewportRest
  } = raw.viewportLabels
  const { cueLabelTemplate, stopCueLabelTemplate, flashAlphaLabelTemplate, ...eventStageRest } = raw.eventStage

  return {
    ...raw,
    common: {
      ...commonRest,
      objectLabel: (id) => formatTemplate(objectLabelTemplate, { id }),
    },
    messages: {
      ...messageRest,
      detectedKnownPath: (path) => formatTemplate(detectedKnownPathTemplate, { path }),
      validatedDirectory: (path) => formatTemplate(validatedDirectoryTemplate, { path }),
      loadedMapAssets: (count, format) =>
        formatTemplate(loadedMapAssetsTemplate, {
          count,
          format,
          FORMAT: format.toUpperCase(),
        }),
      loadedMapAssetsWithActiveMap: (count, format, mapName) =>
        formatTemplate(loadedMapAssetsWithActiveMapTemplate, {
          count,
          format,
          FORMAT: format.toUpperCase(),
          mapName,
        }),
    },
    viewportLabels: {
      ...viewportRest,
      tilesetsLoadedLabel: (loaded, total) => formatTemplate(tilesetsLoadedLabelTemplate, { loaded, total }),
      layersVisibleLabel: (visible, total) => formatTemplate(layersVisibleLabelTemplate, { visible, total }),
      objectGroupsVisibleLabel: (visible, total) =>
        formatTemplate(objectGroupsVisibleLabelTemplate, { visible, total }),
      zoomLabel: (zoom) => formatTemplate(zoomLabelTemplate, { percent: Math.round(zoom * 100) }),
      failedToLoadTilesetImage: (path) => formatTemplate(failedToLoadTilesetImageTemplate, { path }),
    },
    eventStage: {
      ...eventStageRest,
      cueLabel: (cue) => formatTemplate(cueLabelTemplate, { cue }),
      stopCueLabel: (cue) => formatTemplate(stopCueLabelTemplate, { cue }),
      flashAlphaLabel: (alpha) => formatTemplate(flashAlphaLabelTemplate, { alpha }),
    },
  }
}

export const workspaceModes: WorkspaceMode[] = ['map', 'events', 'characters', 'buildings', 'items']

export const editorCopy: Record<LocaleCode, EditorCopy> = {
  'zh-CN': buildEditorCopy(localeBundles['zh-CN'].editor),
  'en-US': buildEditorCopy(localeBundles['en-US'].editor),
}

export function getWorldAtlasViewLabel(locale: LocaleCode, viewId: WorldAtlasViewId) {
  return localeBundles[locale].worldAtlasViews[viewId]
}

export function getViewMenuCopy(locale: LocaleCode): ViewMenuCopy {
  const { deletePresetConfirmTemplate, ...rest } = localeBundles[locale].viewMenu
  return {
    ...rest,
    deletePresetConfirm: (name) => formatTemplate(deletePresetConfirmTemplate, { name }),
  }
}

export function getSettingsMenuCopy(locale: LocaleCode) {
  return localeBundles[locale].settingsMenu
}
