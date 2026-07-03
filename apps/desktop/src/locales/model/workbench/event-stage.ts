export type EventWorkflowCommandCategory = 'dialogue' | 'movement' | 'visual' | 'audio' | 'logic' | 'scene' | 'item' | 'animation' | 'other'

export type EventWorkflowCommandKey =
  | 'farmerAnimation'
  | 'farmerEat'
  | 'playMusic'
  | 'stopMusic'
  | 'playSound'
  | 'stopSound'
  | 'speak'
  | 'splitSpeak'
  | 'message'
  | 'end'
  | 'addItem'
  | 'removeItem'
  | 'money'
  | 'itemAboveHead'
  | 'friendship'
  | 'question'
  | 'quickQuestion'
  | 'fork'
  | 'switchEvent'
  | 'pause'
  | 'waitForAllStationary'
  | 'waitForOtherPlayers'
  | 'beginSimultaneousCommand'
  | 'endSimultaneousCommand'
  | 'skippable'
  | 'mail'
  | 'mailToday'
  | 'mailReceived'
  | 'addQuest'
  | 'removeQuest'
  | 'addSpecialOrder'
  | 'removeSpecialOrder'
  | 'addCookingRecipe'
  | 'addCraftingRecipe'
  | 'addConversationTopic'
  | 'move'
  | 'warp'
  | 'faceDirection'
  | 'positionOffset'
  | 'jump'
  | 'speed'
  | 'advancedMove'
  | 'warpFarmers'
  | 'textAboveHead'
  | 'playerControl'
  | 'halt'
  | 'ignoreMovementAnimation'
  | 'ignoreCollisions'
  | 'doAction'
  | 'viewport'
  | 'changeLocation'
  | 'changeToTemporaryMap'
  | 'addTemporaryActor'
  | 'removeSprite'
  | 'addObject'
  | 'removeObject'
  | 'addProp'
  | 'addBigProp'
  | 'addFloorProp'
  | 'addLantern'
  | 'cutscene'
  | 'emote'
  | 'animate'
  | 'stopAnimation'
  | 'showFrame'
  | 'changeSprite'
  | 'changePortrait'
  | 'eyes'
  | 'swimming'
  | 'stopSwimming'
  | 'glow'
  | 'stopGlowing'
  | 'setRunning'
  | 'stopRunning'
  | 'startJittering'
  | 'stopJittering'
  | 'shake'
  | 'fade'
  | 'globalFade'
  | 'globalFadeToClear'
  | 'screenFlash'
  | 'ambientLight'

export type EventScenarioPresetId = 'townFairOpening' | 'beachLostItem' | 'mineRescueBranch'

export type PlayerAppearanceCopy = {
  title: string
  subtitle: string
  importSave: string
  importSaveTitle: string
  importSaveCopy: string
  importEmpty: string
  importLoadFailed: string
  importUse: string
  newSlot: string
  duplicateSlot: string
  deleteSlot: string
  slotName: string
  farmerName: string
  slots: string
  active: string
  imported: string
  body: string
  hair: string
  shirt: string
  pants: string
  accessory: string
  hat: string
  bodyTitle: string
  bodyCopy: string
  previewTitle: string
  previewCopy: string
  bodyType: string
  female: string
  male: string
  skin: string
  shoes: string
  hairColor: string
  eyeColor: string
  shirtColor: string
  pantsColor: string
  sectionEmpty: string
  assetMissing: string
  loadingAssets: string
  page: (current: number, total: number) => string
  none: string
  importedMeta: string
  saveFolder: string
  sourceFile: string
  importedAt: string
  customHair: string
  customHat: string
  customShirt: string
  customPants: string
  notSet: string
  unsupported: string
  deleteConfirm: (label: string) => string
  defaultProfileName: string
  nextProfileName: (index: number) => string
}

export type ScriptEditorCopy = {
  heading: string
  addCommand: string
  insertCommand: string
  addCommandShortcut: string
  lineNumbers: string
  compactView: string
  comfortableView: string
  mapPickMode: string
  commandsCount: (count: number) => string
  emptyTitle: string
  emptyHint: string
  emptyAction: string
  playFromHere: string
  duplicate: string
  delete: string
  removeDelay: string
  rawCommand: string
  emptyArg: string
  delayStep: string
  delayHold: string
  delayGeneric: string
  addDelay: (label: string, formattedDelay: string) => string
  branchWhenChoice: string
  yesChoiceLabel: string
  noChoiceLabel: string
  dragToSort: string
  viewportShortLabel: string
}

export type EventWorkflowCopy = {
  commandLabels: Record<EventWorkflowCommandKey, string>
  commandFields: Record<string, string>
  categoryLabels: Record<EventWorkflowCommandCategory, string>
  commandPalette: {
    searchPlaceholder: string
    all: string
    empty: string
  }
  commandPipeline: {
    empty: string
    addHint: string
    quickAdd: string
  }
  eventSelector: {
    placeholder: string
    searchPlaceholder: string
    empty: string
  }
  scriptEditor: ScriptEditorCopy
  scriptTimeline: {
    sceneSetup: string
    music: string
    camera: string
    actors: string
    title: string
    subtitle: string
    current: string
    empty: string
    setupBadge: string
    noDetail: string
  }
  sceneSetup: {
    music: string
    camera: string
    actors: string
    addActor: string
    pick: string
    follow: string
    current: string
    target: string
    duplicate: string
    remove: string
    reset: string
    more: string
    x: string
    y: string
  }
  resourceSources: {
    gameAssets: string
    itemCatalog: string
    vanilla: string
    project: string
    patch: string
  }
  workspacePanels: {
    directoryTitle: string
    directoryEmpty: string
    browserTitle: string
    browserSubtitle: string
    browserPlaceholder: string
    browserEmptyFiltered: string
    browserEmptyMissing: string
    browserModEmpty: string
    inspectorTitle: string
    inspectorEmpty: string
    inspectorSummary: string
    inspectorRaw: string
    inspectorCommand: string
    inspectorKind: string
    inspectorActor: string
    inspectorText: string
    inspectorQuestion: string
    inspectorChoices: string
    inspectorTarget: string
    inspectorArgs: string
    inspectorMusic: string
    inspectorCamera: string
    inspectorActors: string
    inspectorNone: string
  }
  presets: Record<EventScenarioPresetId, { label: string; description: string }>
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
  resourcePicker: {
    close: string
    searchLabel: string
    categorySearchPlaceholder: string
    allCategory: string
    allResources: string
    visibleCount: (count: number) => string
    summary: (visible: number, total: number, selected: string) => string
    customSubtitle: string
    selectedLabel: (label: string) => string
    cancel: string
    confirm: string
    gridView: string
    listView: string
    filtersAll: string
    filtersGame: string
    filtersProject: string
    filtersCatalog: string
    filterLabels: Record<'all' | 'game' | 'project' | 'catalog', string>
    pageRange: (start: number, end: number, total: number) => string
    pageInfo: (page: number, pageCount: number) => string
    pageSizeLabel: string
    pageSizeOption: (size: number) => string
    detailAction: string
    detailsTitle: string
    detailsGeneral: string
    detailsVisual: string
    detailsSource: string
    fieldName: string
    fieldValue: string
    fieldDisplayName: string
    fieldInternalName: string
    fieldType: string
    fieldCategory: string
    fieldPrice: string
    fieldDescription: string
    fieldTexture: string
    fieldSpriteIndex: string
    fieldSourcePath: string
    fieldMeta: string
    fieldSubtitle: string
    none: string
  }
  workflow: EventWorkflowCopy
  playerAppearance: PlayerAppearanceCopy
}
