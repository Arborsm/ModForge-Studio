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
  exportPng: string
  exportPngDialogTitle: string
  exportPngSuccess: (path: string) => string
  failedToExportPng: string
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

/** Copy for the map asset build dialog rendered by MapPatchEditor. */
export type BuildAssetDialogCopy = {
  title: string
  building: string
  buildingMessage: string
  formatLabel: string
  formats: Record<'tmx' | 'tbin', string>
  destinationLabel: string
  destinationHint: string
  doneTitle: string
  doneAssetSavedAs: (relativePath: string) => string
  doneSizeKb: (kilobytes: number) => string
  errorTitle: string
  doneAction: string
  closeAction: string
  cancelAction: string
  saveAction: string
  retryAction: string
}

/** Copy for the redesigned map browse workspace (browser + detail rail). */
export type MapPanelCopy = {
  browserTitle: string
  browserSubtitle: string
  browserPlaceholder: string
  browserEmptyFiltered: string
  browserEmptyMissing: string
  browserModEmpty: string
  sourceOriginalLabel: string
  sourceModLabel: string
  detailEmpty: string
  detailOverviewTab: string
  detailLayersTab: string
  detailObjectsTab: string
  basicsSection: string
  resourcesSection: string
  modSourcesSection: string
  baselineSource: string
  overlayNone: string
  layersFilterPlaceholder: string
  objectsFilterPlaceholder: string
  layerKind: string
  warpsLabel: string
  layersVisible: (visible: number, total: number) => string
  objectsTotal: (count: number) => string
  warpsTotal: (count: number) => string
  moreObjects: (count: number) => string
}

/** Copy for direct TMX/TBin map asset authoring. */
export type MapAssetEditorCopy = {
  invalidDocument: string
  returnToLibrary: string
  subtitle: string
  assetPath: string
  save: string
  saving: string
  saved: (path: string) => string
  tbinSaveBlocked: string
  tbinConvertAction: string
  tbinConvertHint: string
  tbinConverted: (path: string) => string
  xnbReadOnlyBanner: string
  layerNameValidationTitle: string
  emptyLayerName: (id: number) => string
  duplicateLayerName: (name: string) => string
  tbinIssues: Record<
    | 'objects'
    | 'transforms'
    | 'extensions'
    | 'tilesetLayout'
    | 'tileDefinitions'
    | 'layerPresentation'
    | 'typedProperties'
    | 'externalTilesets',
    string
  >
  layers: string
  layerDetails: string
  layerName: string
  layerPropertiesHint: string
  mapProperties: string
  addLayer: string
  newLayerName: (index: number) => string
  hideLayer: string
  showLayer: string
  lockLayer: string
  unlockLayer: string
  moveLayerUp: string
  moveLayerDown: string
  deleteLayer: string
  deleteLayerTitle: string
  deleteLayerDescription: string
  cancel: string
  tools: string
  toolLabels: Record<'inspect' | 'brush' | 'stamp' | 'fill' | 'erase' | 'rectangle' | 'eyedropper' | 'hand', string>
  inspectorTabs: Record<'tile' | 'objects' | 'map' | 'tileset', string>
  selectedCell: (x: number, y: number) => string
  selectCell: string
  hoveredCell: (x: number, y: number) => string
  flipHorizontal: string
  flipVertical: string
  rotateClockwise: string
  cellPropertiesHint: string
  addTileData: string
  objectGroups: string
  addObjectGroup: string
  newObjectGroupName: (index: number) => string
  objectGroupName: string
  objectGroupVisible: string
  objectGroupOpacity: string
  objectGroupDrawOrder: string
  objectGroupPropertiesHint: string
  deleteObjectGroup: string
  deleteNonEmptyObjectGroup: string
  objectDetails: string
  objectName: string
  objectType: string
  objectX: string
  objectY: string
  objectWidth: string
  objectHeight: string
  objectRotation: string
  objectVisible: string
  deleteObject: string
  objectPropertiesHint: string
  selectObject: string
  addTileset: string
  replaceTileset: string
  chooseImage: string
  /** Adds a vanilla game tilesheet into the project and attaches it to this map. */
  addGameTileset: string
  /** Disabled-state title for the game tilesheet entry when no game directory is configured. */
  gameTilesetNoGameRoot: string
  /** Dialog title for the vanilla tilesheet picker. */
  gameTilesetPickerTitle: string
  /** Scan status while the game tilesheet list loads. */
  gameTilesetPickerLoading: string
  /** Empty state for the game tilesheet picker. */
  gameTilesetPickerEmpty: string
  /** Scan failure state for the game tilesheet picker. */
  gameTilesetPickerScanFailed: string
  /** Search placeholder inside the game tilesheet picker. */
  gameTilesetPickerSearch: string
  /** Thumbnail alt text for a game tilesheet. */
  gameTilesetThumbnailAlt: (name: string) => string
  /** Disabled-state label while a selected tilesheet is being copied into the project. */
  gameTilesetAdding: string
  projectImages: string
  selectTileset: string
  tilesetProperties: string
  tileDefinitionProperties: (tileId: number) => string
  tileDefinitionPropertiesHint: string
  loadingTileset: string
  invalidTilesetDimensions: (width: number, height: number, tileWidth: number, tileHeight: number) => string
  tilesetExternalTsx: string
  tilesetExternalTsxHint: (source: string) => string
  tilesetExternalTsxInvalid: string
  animation: string
  animationTile: (tileId: number) => string
  frameTile: string
  frameDuration: string
  removeFrame: string
  addFrame: string
  animationDurationWarning: string
  documentSummary: string
  formatCheck: string
  formatReady: string
  formatNeedsAttention: string
  inspectorViews: Record<'properties' | 'history' | 'diagnostics', string>
  noRecentChanges: string
  undo: string
  undoTitle: string
  redo: string
  redoTitle: string
  undoHistory: (count: number) => string
  redoHistory: (count: number) => string
  formatNames: Record<'tbin' | 'xnb' | 'tmx', string>
}

/** Copy for the read-only map Load binding summary shown in the map workspace. */
export type MapLoadSummaryCopy = {
  title: string
  hint: string
  targetLabel: string
  fromFileLabel: string
  enabledLabel: string
  enabledTrue: string
  enabledFalse: string
  enabledExpression: (expression: string) => string
  previewSection: string
  previewHint: string
  previewTarget: string
  previewResolved: string
  previewStatus: string
  statusExists: string
  statusMissing: string
  emptyResolved: string
  noTargets: string
  manageInAssetLibrary: string
  manageHint: string
}

/** Copy for the patch-tiles editing session hosted by the map workspace. */
export type MapTilesSessionCopy = {
  title: string
  changedCells: (count: number) => string
  loading: string
  loadFailed: string
  retry: string
  complete: string
  discard: string
  cancel: string
  /** Shown in the tile tray: tilesheets always come from the target map. */
  tilesetSourceHint: string
}

export type MapAuthoringCopy = {
  editorShell: {
    assetMode: string
    patchMode: string
    operationStack: string
    fixedExecutionOrder: string
    closeInspector: string
    openMapInspector: string
    openLayerInspector: string
    openObjectInspector: string
    openTilesetInspector: string
    showPalette: string
    hidePalette: string
    noSelection: string
  }
  libraryTitle: string
  searchPlaceholder: string
  importMapAction: string
  importFromGame: string
  emptyTitle: string
  emptyHint: string
  loading: string
  loadFailed: string
  projectBadge: string
  formatValue: (format: string, size: string) => string
  patchGameMap: (name: string) => string
  categories: Record<'farm' | 'town' | 'interior' | 'wild' | 'mine' | 'island' | 'festival' | 'other', string>
  patchManager: {
    viewPatches: string
    noMatches: string
    /** Guide empty state shown in the change-manager area when there are no map changes yet. */
    noPatchesTitle: string
    noPatchesHint: string
  }
  assetEditor: MapAssetEditorCopy
  create: {
    title: string
    nameLabel: string
    namePlaceholder: string
    templateLabel: string
    templatePlaceholder: string
    templateHint: string
    blankTemplate: string
    dimensionsLabel: string
    widthLabel: string
    heightLabel: string
    duplicateError: string
    invalidNameError: string
    templateLoadError: string
    tilesheetLoadError: (name: string) => string
    rollbackError: string
    cancel: string
    confirm: string
    creating: string
  }
  importInAssetLibrary: (name: string) => string
  mapLoadSummary: MapLoadSummaryCopy
  tilesSession: MapTilesSessionCopy
}
