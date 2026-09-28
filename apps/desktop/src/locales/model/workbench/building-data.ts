/** Copy for the Data/Buildings authoring editor. Owned by the building-data workspace slice. */
export type BuildingDataEditorCopy = {
  title: string
  subtitle: string
  addEntryAction: string
  removeEntryAction: string
  emptyTitle: string
  emptyHint: string
  entries: {
    label: string
    count: (count: number) => string
    removeConfirmTitle: string
    removeConfirmMessage: (buildingId: string) => string
    removeConfirmAction: string
    cancelAction: string
    closeLabel: string
  }
  workflow: {
    title: string
    ready: string
    progress: (complete: number, total: number) => string
    openStep: (step: string) => string
    steps: Record<'identity' | 'artwork' | 'placement' | 'construction' | 'cost' | 'interior' | 'upgrade', string>
    status: Record<'complete' | 'needs-attention' | 'optional', string>
  }
  addDialog: {
    title: string
    subtitle: string
    idLabel: string
    idPlaceholder: string
    idHint: string
    prefixAction: string
    prefixHint: (uniqueId: string) => string
    footprintSectionTitle: string
    footprintSectionHint: string
    widthLabel: string
    heightLabel: string
    builderLabel: string
    builderHint: string
    emptyError: string
    duplicateError: string
    sizeNotPositiveError: string
    confirmAction: string
    cancelAction: string
    closeLabel: string
  }
  /** Left pane: which building is being edited and where it came from. */
  sources: {
    title: string
    libraryTitle: string
    libraryHint: string
    backToLibrary: string
    openBuilding: (name: string) => string
    searchPlaceholder: string
    modeAll: string
    modeProject: string
    modeVanilla: string
    projectGroup: string
    vanillaGroup: string
    overrideBadge: string
    newBadge: string
    groupCount: (count: number) => string
    stageCount: (count: number) => string
    searchEmpty: string
    projectEmpty: string
    vanillaLoading: string
    vanillaUnavailable: string
    overrideHint: string
    ungroupedLabel: string
  }
  /** Right pane: live preview of the entry being edited. */
  preview: {
    title: string
    empty: string
    noFootprint: string
    footprintTitle: string
    footprintHint: string
    pickIdle: string
    pickHumanDoor: string
    pickAnimalDoor: string
    pickUpgradeSign: string
    pickCancelAction: string
    pickSourceRectAction: string
    pickActiveHint: (field: string) => string
    pickRectActiveHint: (field: string) => string
    tileLabel: (x: number, y: number) => string
    legendFootprint: string
    legendHumanDoor: string
    legendAnimalDoor: string
    legendUpgradeSign: string
    legendAdditionalTile: string
  }
  /** Visual `SourceRect` selection over the building sheet. */
  sourceRect: {
    title: string
    subtitle: string
    snapLabel: string
    snapHint: string
    regionLabel: string
    regionValue: (x: number, y: number, width: number, height: number) => string
    noRegion: string
    tileSizeLabel: string
    tileSizeValue: (width: number, height: number) => string
    footprintLabel: string
    footprintValue: (width: number, height: number) => string
    footprintHint: string
    applyAction: string
    cancelAction: string
  }
  /** Farm-map rectangle picker used to choose the building footprint. */
  footprintMap: {
    title: string
    subtitle: string
    openAction: string
    loading: string
    unavailable: string
    loadFailed: (message: string) => string
    retryAction: string
    currentLabel: string
    selectedLabel: string
    sizeValue: (width: number, height: number) => string
    emptySelection: string
    hint: string
    applyAction: string
    cancelAction: string
  }
  /** Interior map browser with a live map preview. */
  indoorMap: {
    openAction: string
    title: string
    subtitle: string
    searchPlaceholder: string
    empty: string
    customValue: string
    previewTitle: string
    previewLoading: string
    previewUnavailable: string
    previewFailed: (message: string) => string
    retryAction: string
    clearAction: string
    applyAction: string
    cancelAction: string
  }
  /** The upgrade chain the active entry belongs to. */
  chain: {
    title: string
    stageLabel: (stage: number, total: number) => string
    inProjectBadge: string
    vanillaBadge: string
    hint: string
  }
  /** Category and detail labels the reference pickers group their options by. */
  pickers: {
    projectBuildings: string
    buildingStageDetail: (chain: string, stage: number, total: number) => string
    projectMaps: string
    vanillaMaps: string
    textureRoot: string
  }
  summary: {
    title: string
    footprint: string
    builder: string
    buildCost: string
    buildDays: string
    interior: string
    skins: string
    notSet: string
    footprintValue: (width: number, height: number) => string
    goldValue: (amount: number) => string
    dayValue: (days: number) => string
    skinValue: (count: number) => string
  }
  /** The texture the entry points at, alongside the patch that provides it. */
  texture: {
    title: string
    assetLabel: string
    noAsset: string
    patchFound: string
    patchMissing: string
    manageHint: string
    openEditorAction: string
  }
}
