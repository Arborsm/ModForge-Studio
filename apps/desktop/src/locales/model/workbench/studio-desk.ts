import type { WorkspaceMode } from '../core'

export type StudioDeskCopy = {
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
  unsavedChangesMessage: string
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
  addPatchDialog: {
    selectActionTitle: string
    includeFileTitle: string
    selectTargetTitle: string
    closeLabel: string
    back: string
    includeFromFilePlaceholder: string
    fromFileDescription: string
    customTarget: string
    customTargetPlaceholder: string
    cancel: string
    addPatch: string
    actionLabels: Record<'EditData' | 'EditImage' | 'EditMap' | 'Load' | 'Include', string>
    actionDescriptions: Record<'EditData' | 'EditImage' | 'EditMap' | 'Load' | 'Include', string>
  }
  editorPage: {
    patchNotFound: string
    noEditorRegistered: (workspaceId: string) => string
  }
  referencePreview: {
    workspaceLabels: Record<'mods' | 'map' | 'events' | 'characters' | 'buildings' | 'items', string>
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
    propertiesTab: string
    configTab: string
    closeLabel: string
    patchPropertiesTitle: (name: string) => string
    noPatchSelected: string
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
    localTokens: string
    tokenNamePlaceholder: string
    valuePlaceholder: string
    addToken: string
    configDescription: string
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
    editView: string
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
