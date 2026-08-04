export type StudioDeskCopy = {
  title: string
  heading: string
  subtitle: string
  heroSubtitle: string
  projectLobby: string
  projectLobbyControl: string
  projectGrid: string
  projectCount: (count: number) => string
  projectMoreActions: (name: string) => string
  projectManagerEyebrow: string
  projectManagerSubtitle: string
  projectList: string
  searchProjects: string
  uniqueIdLabel: string
  lastEditedLabel: string
  lastExportedLabel: string
  metadataIncomplete: string
  editProjectProperties: string
  editProjectPropertiesHint: string
  overview: string
  totalProjects: string
  waitingExport: string
  needsAttention: string
  returnCurrentDesk: string
  currentActive: string
  pendingExport: string
  hasErrors: string
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
  unsavedChangesMessage: string
  createDraft: string
  importDraft: string
  recentDirectoriesSaveFailed: string
  noEntries: string
  searchEmpty: string
  bibleEntryCount: (count: number) => string
  bibleReferenceCount: (count: number) => string
  activeRules: (count: number) => string
  tokenCount: (count: number) => string
  locationCount: (count: number) => string
  assetCount: (count: number) => string
  castCount: (count: number) => string
  edited: {
    justNow: string
    recently: string
    minutesAgo: (minutes: number) => string
    hoursAgo: (hours: number) => string
  }
  createDialog: {
    title: string
    projectName: string
    uniqueId: string
    author: string
    version: string
    description: string
    cancel: string
    create: string
    templateLabel: string
    templates: Record<'blank' | 'npc' | 'item' | 'building' | 'map' | 'event' | 'mail', { label: string; description: string }>
  }
  manifestForm: {
    projectName: string
    uniqueId: string
    uniqueIdHint: string
    author: string
    version: string
    description: string
    advancedTitle: string
    advancedSubtitle: string
    contentPackFor: string
    contentPackForHint: string
    contentPackForMinimumVersion: string
    minimumApiVersion: string
    updateKeys: string
    updateKeysHint: string
    dependencies: string
    dependenciesHint: string
    dependencyUniqueIdPlaceholder: string
    dependencyMinimumVersionPlaceholder: string
    dependencyRequired: string
    addDependency: string
    removeDependency: string
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
    preflightTitle: string
    preflightOk: string
    preflightBlocked: (count: number) => string
    preflightWarnings: (count: number) => string
  }
  addPatchDialog: {
    selectTargetTitle: string
    closeLabel: string
    filterPlaceholder: string
    noSuggestedTargets: string
    customTarget: string
    customTargetPlaceholder: string
    cancel: string
    addPatch: string
    actionLabels: Record<'EditData' | 'EditImage' | 'EditMap' | 'Load' | 'Include', string>
  }
  editDataOps: {
    title: string
    subtitle: string
    fieldsTitle: string
    fieldsHint: string
    fieldEntryPlaceholder: string
    fieldNamePlaceholder: string
    fieldValuePlaceholder: string
    addField: string
    moveTitle: string
    moveHint: string
    moveIdPlaceholder: string
    moveTargetPlaceholder: string
    moveModes: Record<'before' | 'after' | 'position', string>
    addMove: string
    textOpsTitle: string
    textOpsHint: string
    textOpTargetPlaceholder: string
    textOpValuePlaceholder: string
    textOpDelimiterPlaceholder: string
    textOpSearchPlaceholder: string
    replaceModeLabel: string
    addTextOp: string
    removeRow: string
  }
  projectSettings: {
    title: string
    subtitle: string
    basicsTitle: string
    basicsSubtitle: string
    configTitle: string
    configSubtitle: string
    dynamicTokensTitle: string
    dynamicTokensSubtitle: string
    dynamicTokenWhenLabel: string
    addDynamicToken: string
    removeRow: string
    customLocationsTitle: string
    customLocationsSubtitle: string
    locationNamePlaceholder: string
    fromMapFilePlaceholder: string
    migrateNamesLabel: string
    migrateNamesPlaceholder: string
    addLocation: string
    aliasTitle: string
    aliasSubtitle: string
    aliasPlaceholder: string
    aliasTargetPlaceholder: string
    addAlias: string
    formatTitle: string
    formatVersionLabel: string
    formatDescription: string
  }
  editorPage: {
    patchNotFound: string
    noEditorRegistered: (workspaceId: string) => string
    patchName: string
    enabled: string
    unsupportedAssetTitle: string
    unsupportedAssetHint: (target: string) => string
  }
  imagePatchEditor: {
    replacementImage: string
    previewAlt: string
    unsaved: string
    removeImage: string
    dropTitle: string
    dropHint: string
    targetLoading: string
    targetLoadFailed: string
    manualAreasTitle: string
    manualAreasSubtitle: string
    patchMode: string
    modeLabels: Record<'Replace' | 'Overlay' | 'Mask', string>
    modeDescription: string
    fromArea: string
    fromAreaDescription: string
    toArea: string
    toAreaDescription: string
    replaceFile: string
    uploadFile: string
  }
  mapPatchEditor: {
    tabs: Record<'properties' | 'warps' | 'tiles' | 'file' | 'advanced', string>
    playerWarps: string
    playerWarpsDescription: string
    npcWarps: string
    npcWarpsDescription: string
    fromFile: string
    fromFilePlaceholder: string
    fromFileDescription: string
    patchMode: string
    modeLabels: Record<'ReplaceByLayer' | 'Overlay' | 'Replace', string>
    modeDescription: string
    fromArea: string
    fromAreaDescription: string
    toArea: string
    toAreaDescription: string
    propertiesDescription: string
    propertyPlaceholder: string
    valuePlaceholder: string
    addProperty: string
    removeProperty: string
    addWarp: string
    removeWarp: string
    noWarps: string
    warpSource: string
    warpDestination: string
    pickWarpSource: string
    noGameRoot: string
    noGameRootDescription: string
    loadingMap: string
    unableToLoadMap: string
    unsupportedFormat: (format: string) => string
    unableToLoadTarget: (target: string) => string
    hoverHint: string
    canvasTools: Record<'inspect' | 'brush' | 'stamp' | 'fill' | 'erase' | 'rectangle' | 'eyedropper' | 'warp', string>
    activeLayer: string
    selectBrushHint: string
    tilesetPalette: string
    tilesetView: string
    tilesetGridView: string
    tilesetSheetView: string
    loadingTileset: string
    noTilesets: string
    tilesetImageMissing: string
    tilesetImageError: (path: string) => string
    tilesetSelection: (index: number, width: number, height: number) => string
    tileTileset: (tileset: string) => string
    tileId: (id: number) => string
    quickProperty: string
    chooseQuickProperty: string
    mapPropertyCategories: Record<'map' | 'warps' | 'lighting' | 'music' | 'spawning' | 'buildings' | 'other', string>
    mapPropertyLabel: (key: string) => string
    textOperationsTitle: string
    textOperationsDescription: string
    noTextOperations: string
    addTextOperation: string
    removeTextOperation: string
    preservedTextOperationFields: (fields: string) => string
    textOperationFields: Record<'operation' | 'target' | 'value' | 'delimiter' | 'search' | 'replaceMode', string>
    buildAsset: string
    mapTileEdits: (count: number) => string
    returnToLibrary: string
    previewTitle: string
    previewModes: Record<'before' | 'result' | 'diff', string>
    previewSummary: string
    previewEmpty: string
    mapTarget: string
    mapSize: string
    layers: string
    tilesets: string
    buildStatus: string
    buildStatuses: Record<'notBuilt' | 'built' | 'source', string>
    selectDestination: string
    destinationPlaceholder: string
    pickWarpDestination: string
    pickWarpDestinationHint: string
    destinationPreview: (target: string) => string
    runtimeTargetUnavailable: (target: string) => string
    /** Opens the current tiles change card in the full map editor session. */
    editInMapEditor: string
    /** Clears every tile edit on the card, resetting the summary to zero. */
    clearTiles: string
    tabStatuses: Record<'complete' | 'attention' | 'optional', string>
    saveChanges: string
    addChange: string
    duplicateChange: string
    deleteChange: string
    changeTarget: string
    projectLocations: string
    projectMapAssets: string
    importMapAction: string
    importingMap: string
    importFromGame: string
    openMapAsset: string
    importMapFailed: string
    openMapAssetFailed: string
    noProjectLocations: string
    noProjectMapAssets: string
    mapChanges: string
    diagnostics: string
    readyToSave: string
    scopeSummary: (conditionCount: number) => string
    textOperationPresets: Record<
      | 'light'
      | 'warp'
      | 'npcWarp'
      | 'dayTiles'
      | 'nightTiles'
      | 'doors'
      | 'sounds'
      | 'lightEntrance'
      | 'lightSingle'
      | 'lightRoad'
      | 'warpForest'
      | 'warpFarm'
      | 'warpTown'
      | 'npcWarpOrchard'
      | 'npcWarpBus'
      | 'dayTilesEntrance'
      | 'dayTilesBuilding'
      | 'nightTilesEntrance'
      | 'nightTilesBuilding'
      | 'doorsGarden'
      | 'doorsOrchard'
      | 'soundsEntrance'
      | 'soundsWarp',
      string
    >
    textOperationApplyMode: string
    textOperationApplyModes: Record<'append' | 'replace' | 'remove', string>
    textOperationCustomKind: string
    textOperationCustomValue: string
    changeCards: {
      addChange: string
      changeCount: (n: number) => string
      selectType: string
    }
    changeCardFileExists: string
    changeCardTypes: Record<'file' | 'tiles' | 'properties' | 'warps' | 'text', string>
    changeCardTypeDescriptions: Record<'file' | 'tiles' | 'properties' | 'warps' | 'text', string>
    changeCardStatuses: Record<'configured' | 'optional' | 'empty', string>
    changeCardActions: Record<'duplicate' | 'delete' | 'expand' | 'collapse', string>
    copyMode: Record<'replaceByLayer' | 'overlay' | 'replace', string>
    copyModeDescriptions: Record<'replaceByLayer' | 'overlay' | 'replace', string>
    advancedSettings: {
      title: string
      whenCondition: string
      whenConditionHint: string
      priority: string
      enabled: string
      disabled: string
      enabledByExpression: string
      enabledByExpressionHint: (token: string) => string
      setAlwaysEnabled: string
      setAlwaysDisabled: string
    }
    sourceMapFile: string
    sourceMapHint: string
    pastePosition: string
    copyRange: string
    editInAssetEditor: string
    manageInAssetLibrary: string
    toAreaPickHint: string
    fromAreaPickHint: string
  }
  referencePreview: {
    workspaceLabels: Record<'mods' | 'map' | 'events' | 'characters' | 'buildings' | 'items' | 'dialogue' | 'schedules' | 'mail', string>
    noGameDirectoryTitle: string
    noGameDirectorySubtitle: string
    title: (workspaceLabel: string) => string
    resourcesCount: (count: number) => string
    scanning: string
    noResourcesFound: string
    loadingMap: string
    loadingResource: string
    selectMap: string
    selectResourceTitle: string
    selectResourceSubtitle: string
    unsupportedMapFormat: (format: string) => string
    buildingTextureLoadFailed: string
    fields: {
      version: string
      author: string
      path: string
      root: string
      type: string
    }
    description: string
    noDescription: string
    contentPreview: string
    moreCharacters: (count: number) => string
    noPreview: string
  }
  configSchemaDialog: {
    closeLabel: string
    patchPropertiesTitle: (name: string) => string
    noPatchSelected: string
    logName: string
    advancedTitle: string
    advancedSubtitle: string
    targetField: string
    targetFieldPlaceholder: string
    targetFieldHint: string
    tokenInputPlaceholder: string
    unknownTokenHint: (token: string) => string
    priority: string
    priorityLoadPlaceholder: string
    priorityPatchPlaceholder: string
    enabled: string
    enabledModeBoolean: string
    enabledModeToken: string
    enabledState: string
    disabledState: string
    enabledTokenPlaceholder: string
    targetLocale: string
    targetLocalePlaceholder: string
    update: string
    updateDefault: string
    when: string
    whenKeyPlaceholder: string
    whenValuePlaceholder: string
    addCondition: string
    whenPresetsLabel: string
    whenPresetSeason: string
    whenPresetWeather: string
    whenPresetDayOfWeek: string
    whenPresetHasMod: string
    whenPresetConfig: string
    whenPresetMore: string
    whenPresetGroups: Record<
      'dateWeather' | 'player' | 'relationship' | 'world' | 'number' | 'string' | 'metadata' | 'fieldReference' | 'specialized' | 'random',
      string
    >
    whenCustomValuePlaceholder: string
    whenCustomValueAdd: string
    whenHasModValuePlaceholder: string
    localTokens: string
    tokenNamePlaceholder: string
    valuePlaceholder: string
    addToken: string
    keyPlaceholder: string
    defaultPlaceholder: string
    allowValuesLabel: string
    allowValuesPlaceholder: string
    descriptionLabel: string
    descriptionPlaceholder: string
    sectionLabel: string
    sectionPlaceholder: string
    allowBlank: string
    allowMultiple: string
    addConfigEntry: string
    cancel: string
    save: string
  }
  toolbar: {
    back: string
    forward: string
    undo: string
    redo: string
    editView: string
    unsaved: string
    saved: string
    project: string
    add: string
    patchSettings: string
    projectSettings: string
    reload: string
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
    emptyTitle: string
    emptySubtitle: string
    selectedPatch: string
    allPatches: string
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
    quickSearchPlaceholder: string
    noSearchMatches: string
    selectPrompt: string
    deleteTitle: string
    deleteMessage: (name: string) => string
    deleteAction: string
  }
  patchList: {
    regionLabel: string
    openPatch: (name: string) => string
    moveUp: string
    moveDown: string
    duplicate: string
    delete: string
    deleteTitle: string
    deleteMessage: (name: string) => string
    cancel: string
    confirmDelete: string
    toggleEnable: (name: string) => string
    toggleDisable: (name: string) => string
    enabledByExpression: string
    setAlwaysEnabled: string
    setAlwaysDisabled: string
    when: string
    priority: string
    fromFile: string
  }
  eventPatchHub: {
    navigationLabel: string
    eventTreeLabel: string
    searchPlaceholder: string
    filtersTitle: string
    filters: Record<'all' | 'withTriggers' | 'withoutTriggers' | 'disabled', string>
    hubLabel: string
    savedLabel: string
    unsavedLabel: string
    multiSelectLabel: string
    selectedCountLabel: (count: number) => string
    addEventLabel: string
    /** Loading state shown while the event editor pre-warms its caches on entry. */
    preparingEditor: string
    createPatch: {
      /** Sidebar + empty-state entry that opens the create-event-patch dialog. */
      action: string
      loading: string
      loadError: string
      alreadyAdded: string
      invalidTarget: string
    }
    importVanilla: {
      /** Hub action that opens the vanilla-event import picker. */
      action: string
      closeLabel: string
      searchPlaceholder: string
      loadingLabel: string
      loadErrorLabel: string
      emptyLabel: string
      alreadyInDraft: string
      confirm: (count: number) => string
      /** Create-dialog checkbox: parse the picked vanilla file into the fresh draft. */
      importAllLabel: string
    }
    /** Alias given to a freshly created event scene, e.g. "Untitled Town event 3". */
    untitledEventAlias: (location: string, index: number) => string
    contextMenuLabel: string
    duplicatedPatchName: (name: string) => string
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
    exportBlockedLabel: string
    eventCountLabel: string
    selectedEventLabel: string
    targetFieldPlaceholder: string
    noPatchTitle: string
    noPatchSubtitle: string
    selectEventAriaLabel: (eventKey: string) => string
    defaultEventTitle: string
  }
}
