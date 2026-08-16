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

/** Copy for the semantic map-property cards on the asset editor's map tab. */
export type MapAssetMapCardsCopy = {
  /** Section heading for the warp-entry cards. */
  warpsTitle: string
  /** Section heading for the door-entry cards. */
  doorsTitle: string
  /** Section heading for the day/night replacement cards. */
  dayNightTitle: string
  /** Warp card title line: leaves (fromX, fromY) toward a destination map. */
  warpSummaryTitle: (fromX: number, fromY: number, toMap: string) => string
  /** Warp card subtitle: lands at (toX, toY) on the target map. */
  warpSummaryLanding: (toX: number, toY: number) => string
  /** Door entry summary for a door at (x, y). */
  doorEntry: (x: number, y: number) => string
  /** Source badge of a warp entry: it came from the `Warp` map property. */
  warpSourceProperty: string
  /** Source badge of a warp entry: Back-layer per-cell `TouchAction`. */
  warpSourceTouch: string
  /** Source badge of a warp entry: Buildings-layer per-cell `Action`. */
  warpSourceAction: string
  /** Warp dialog: label of the write-to carrier selector. */
  warpCarrierLabel: string
  /** Warp dialog: carrier option writing the `Warp` map property. */
  warpCarrierProperty: string
  /** Warp dialog: carrier option writing the picked cell's `TouchAction`. */
  warpCarrierTouch: string
  /** Warp dialog: carrier option writing the picked cell's `Action`. */
  warpCarrierAction: string
  /** Confirm prompt when the target cell already carries a different action. */
  warpReplaceConfirm: string
  /** Door card: the door's cell has no destination action. */
  doorTargetMissing: string
  /** Door card: the door's cell holds a non-warp action. */
  doorTargetConflict: string
  /** Door form: also write the door's destination action. */
  doorSetTarget: string
  /** One day/night replacement group summary; null tile values are omitted. */
  dayNightEntry: (layer: string, x: number, y: number, dayTile: number | null, nightTile: number | null) => string
  /** One contiguous day/night replacement block summary (width×height); null tile values are omitted. */
  dayNightBlock: (
    layer: string,
    x: number,
    y: number,
    width: number,
    height: number,
    dayTile: number | null,
    nightTile: number | null,
  ) => string
  /** Cell count of a contiguous day/night block, e.g. "6 cells". */
  dayNightBlockCells: (count: number) => string
  /** Day/night replacement group count for the section head, e.g. "8 swaps". */
  dayNightCount: (count: number) => string
  /** Section-head add button title: opens the warp dialog after a cell pick. */
  addWarpTitle: string
  /** Section-head add button title: opens the door add form after a cell pick. */
  addDoorTitle: string
  /** Section-head add button title: opens the day/night add form after a cell pick. */
  addDayNightTitle: string
  /** Long-list collapse link, e.g. "View all 8 groups ›". */
  viewAll: (count: number) => string
  /** Long-list collapse link once expanded. */
  collapseAll: string
  /** Icon-button label that deletes one entry card. */
  deleteEntry: string
  /** Icon-button label that opens the warp destination dialog. */
  warpEdit: string
  /** Inline add-form submit label. */
  confirm: string
  /** Button that opens the inline add-door form. */
  addDoor: string
  /** Button that opens the inline add day/night group form. */
  addDayNight: string
  /** Warp destination dialog title. */
  warpDialogTitle: string
  /** Warp destination dialog close icon label. */
  warpDialogClose: string
  /** Warp dialog: target map field label. */
  warpDialogMapLabel: string
  /** Warp dialog: target map select placeholder. */
  warpDialogMapPlaceholder: string
  /** Warp dialog: landing cell field label. */
  warpDialogPointLabel: string
  /** Warp dialog: hint shown until a target map is chosen. */
  warpDialogPointHint: string
  /** Warp dialog: cancel action. */
  warpDialogCancel: string
  /** Warp dialog: confirm action. */
  warpDialogConfirm: string
  /** Door form: tile X field label. */
  doorX: string
  /** Door form: tile Y field label. */
  doorY: string
  /** Door form: tilesheet field label. */
  doorSheet: string
  /** Door form: tile index field label. */
  doorTileIndex: string
  /** Day/night form: layer name field label. */
  dayNightLayer: string
  /** Day/night form: tile X field label. */
  dayNightX: string
  /** Day/night form: tile Y field label. */
  dayNightY: string
  /** Day/night form: day tile index field label. */
  dayNightDayTile: string
  /** Day/night form: night tile index field label. */
  dayNightNightTile: string
  /** Advanced collapsible: view raw property values. */
  rawPropertiesToggle: string
  /** Locate icon-button label (selects an object and centers it in the canvas). */
  locateObject: string
  /** Diagnostics row label: locate the offending layer. */
  diagnosticsLocate: string
  /** Cell-pick input hint shown next to the picked-cell summary. */
  pickCellHint: string
  /** Picked-cell summary from the canvas picker, e.g. "Back · (12, 34)". */
  pickedCell: (layer: string, x: number, y: number) => string
  /** Picked-cell empty state before the user picks a cell. */
  pickedCellNone: string
  /** Picked-cell state when the chosen cell has no tile. */
  pickedCellEmpty: string
  /** Label for the auto day tile (taken from the current cell tile). */
  dayTileAuto: string
  /** Hint for picking the night tile inside the tileset panel. */
  pickNightTileHint: string
  /** Night-tile empty state before the user picks one. */
  nightTileNone: string
  /** Error when the picked night tile comes from a different tilesheet. */
  nightTileSheetMismatch: (name: string) => string
  /** Label for the auto door tile (taken from the current cell tile). */
  doorTileAuto: string
  /** Toggle for the advanced tileset reference/raw-properties section. */
  advancedTilesetToggle: string
}

/** Copy for the map editor top bar chips (music, indoor/outdoor, ambient). */
export type MapAssetEditorTopBarCopy = {
  /** Music chip accessible label. */
  musicChip: string
  /** Music chip summary when no Music property is set. */
  musicChipDefault: string
  /** Music chip summary when the map is muted ("none"). */
  musicChipMuted: string
  /** Music chip summary for a time-ranged cue, e.g. "Guild ambience · 18:00–unlimited". */
  musicChipSpan: (cue: string, fromLabel: string, toLabel: string) => string
  /** Music popover: label for the common-track list. */
  musicTrackGroup: string
  /** Music popover: follow the game default (remove the property). */
  musicDefault: string
  /** Music popover: silence the map ("none"). */
  musicMuted: string
  /** Music popover: play-time section label. */
  musicRangeLabel: string
  /** Music popover: play all day. */
  musicRangeAll: string
  /** Music popover: play only between two clock times. */
  musicRangeSpan: string
  /** Music popover: from-time prefix. */
  musicRangeFrom: string
  /** Music popover: to-time prefix. */
  musicRangeTo: string
  /** Music popover: "no end time" option label. */
  musicRangeUnlimited: string
  /** Music popover: suffix for clock times past midnight. */
  musicNextDay: string
  /** Music popover: advanced custom cue toggle. */
  musicCustomToggle: string
  /** Music popover: custom cue input placeholder. */
  musicCustomPlaceholder: string
  /** Indoor/outdoor chip label for interior maps. */
  envChipIndoor: string
  /** Indoor/outdoor chip label for exterior maps. */
  envChipOutdoor: string
  /** Indoor/outdoor chip tooltip. */
  envChipTitle: string
  /** Ambient light chip accessible label. */
  ambientChip: string
  /** Ambient light chip summary when the property is unset. */
  ambientChipDefault: string
  /** Ambient light chip summary showing the RGB value, e.g. "RGB 100 120 30". */
  ambientChipValue: (r: number, g: number, b: number) => string
  /** Ambient popover: day tint row label. */
  ambientDay: string
  /** Ambient popover: night tint row label. */
  ambientNight: string
  /** Ambient popover: vanilla default swatch tooltip. */
  ambientDefaultSwatch: string
  /** Ambient popover: custom color picker label. */
  ambientCustom: string
  /** Ambient popover: behavior hint. */
  ambientHint: string
  /** Ambient chip tooltip when the map is outdoors (disabled). */
  ambientOutdoorHint: string
}

/** Copy for direct TMX/TBin map asset authoring. */
export type MapAssetEditorCopy = {
  invalidDocument: string
  returnToLibrary: string
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
  /** Semantic property cards (warps, doors, day/night) on the map inspector. */
  mapCards: MapAssetMapCardsCopy
  /** Error shown when a warp destination needs the game directory and it is not connected. */
  noGameRootForWarp: string
  /** Top bar chips: music, indoor/outdoor toggle and ambient light. */
  topBar: MapAssetEditorTopBarCopy
  addLayer: string
  /** Tooltip for the duplicate-layer button in the layers panel footer. */
  duplicateLayer: string
  /** Tile-count subtitle on a layer row. */
  layerTileCount: (count: number) => string
  newLayerName: (index: number) => string
  hideLayer: string
  showLayer: string
  lockLayer: string
  unlockLayer: string
  moveLayerUp: string
  moveLayerDown: string
  /** History label for renaming a layer. */
  renameLayer: string
  /** History label for layer property/opacity edits that are not a rename or visibility change. */
  editLayerProperties: string
  deleteLayer: string
  deleteLayerTitle: string
  deleteLayerDescription: string
  cancel: string
  tools: string
  toolLabels: Record<'inspect' | 'brush' | 'stamp' | 'fill' | 'erase' | 'rectangle' | 'eyedropper' | 'hand', string>
  selectCell: string
  flipHorizontal: string
  flipVertical: string
  rotateClockwise: string
  /** Tool-rail toggle (shortcut G) that turns the cell-rule overlay paint mode on/off. */
  overlayToggle: string
  /** Floating rule-bar label of the overlay paint mode. */
  paintRulesLabel: string
  /** The five selectable paint rules (walkable = erase). */
  overlayRules: Record<'walkable' | 'block' | 'npc' | 'water' | 'dig', string>
  /** Per-rule button tooltips describing what each rule paints. */
  overlayRuleTitles: Record<'walkable' | 'block' | 'npc' | 'water' | 'dig', string>
  /** History label for one overlay paint stroke, e.g. "涂刷可通行 · Back". */
  historyPaintRule: (rule: string, layer: string) => string
  /** Hint when a walkable erase cannot clear tileset definition-level rules on some cells. */
  overlayTilesetEraseBlocked: (count: number) => string
  /** Per-cell animation editor section in the inspector cell area. */
  cellAnimationTitle: string
  /** Button that seeds a one-frame per-cell animation on the selected cell. */
  cellAnimationAdd: string
  /** Per-frame tile id input label. */
  cellAnimationFrame: string
  /** Per-frame duration input label (milliseconds). */
  cellAnimationDuration: string
  /** Button appending a frame to the per-cell animation. */
  cellAnimationAddFrame: string
  /** Button removing the whole per-cell animation of the selected cell. */
  cellAnimationDelete: string
  /** Warning when per-cell frames carry differing durations (the game plays all frames at the first duration). */
  cellAnimationMixedDurationHint: string
  /** Warning when a frame tile id falls outside the owning tileset's tile range. */
  cellAnimationInvalidTile: string
  /** Save/convert message counting hoisted and conflict-dropped per-cell animations. */
  cellAnimationHoistWarning: (hoisted: number, dropped: number) => string
  addTileData: string
  /** Section title for the light-source block (placed light items). */
  markersTitle: string
  /** Hint shown under the add-marker button while no canvas cell is selected. */
  addTileDataHint: string
  /** Section header for tilesheet management inside the map tab. */
  tilesetsTitle: string
  /** Label for the marker item picker. */
  markerItem: string
  /** Picker option for a plain marker with no item. */
  markerItemNone: string
  /** Toggle for the marker's lit state. */
  markerLit: string
  /** Hint that markers can be dragged on the canvas to move them. */
  markerDragHint: string
  /** Label for the marker's in-game light shape override. */
  markerGameShape: string
  /** Shape option that follows the item's default mapping (clears the override). */
  markerGameShapeDefault: string
  /** In-game light shape name for a texture index (1 lantern … 10 pinpoint). */
  markerGameShapeOption: (textureIndex: number) => string
  /** Hint that in-game lights are fixed-shape and exported via the `Light` map property. */
  markerGameExportHint: string
  /** Fallback list label for a marker without an item. */
  plainMarker: (id: number) => string
  /** History label for moving a marker. */
  moveMarker: string
  deleteObject: string
  selectObject: string
  addTileset: string
  replaceTileset: string
  chooseImage: string
  /** Error when the project's custom tilesheet descriptor JSON fails validation. */
  sheetCatalogInvalid: (message: string) => string
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
  formatCheck: string
  undo: string
  undoTitle: string
  redo: string
  redoTitle: string
  /** Zoom chip: shrink the canvas zoom one step. */
  zoomOut: string
  /** Zoom chip: grow the canvas zoom one step. */
  zoomIn: string
  /** Zoom chip: reset the viewport so the whole map fits the window. */
  fitToScreen: string
  /** History panel title in the editor left column. */
  historyTitle: string
  /** History panel empty state before the first edit. */
  historyEmpty: string
  /** History row hover action that restores that step. */
  historyJumpTo: string
  /** History label for a canvas tool action, e.g. "画笔 · Back". */
  historyToolAction: (tool: string, layer: string) => string
  /** History fallback label for document edits without a specific action. */
  historyEdit: string
  /** History label for marker (object) field edits, including item and lit state. */
  editMarker: string
  /** History label for tileset field edits (image, tsx source, tileset properties). */
  editTileset: string
  /** History label for tile-definition property edits. */
  editTileDefinition: string
  /** History label for tileset animation frame edits. */
  editAnimation: string
  /** History label for warp entry add/remove. */
  editWarp: string
  /** History label for door entry add/remove. */
  editDoor: string
  /** History label for day/night swap add/remove. */
  editDayNight: string
  /** History label for the map music property. */
  editMusic: string
  /** History label for the map outdoors flag. */
  editOutdoors: string
  /** History label for the map ambient light property. */
  editAmbientLight: string
  /** History label for raw map-property edits. */
  editMapProperties: string
  /** History label for the untouched document state at the bottom of the timeline. */
  historyInitial: string
  /** Left-column divider between the layers list and the history panel. */
  historySplitResize: string
  /** Diagnostics section title pinned to the inspector bottom. */
  diagnosticsTitle: string
  /** Diagnostics badge counting save-blocking errors. */
  diagnosticsErrors: (count: number) => string
  /** Diagnostics empty state when every check passes. */
  diagnosticsAllClear: string
  /** Diagnostics footer note explaining that errors block saving. */
  diagnosticsSaveBlockedNote: string
  /** Statusbar summary combining map tile size and tile pixel size. */
  statusDimensions: (width: number, height: number, tilePixels: number) => string
  /** Statusbar summary of the active brush stamp, e.g. "Brush: counter 4×2". */
  statusBrush: (tilesetName: string, width: number, height: number) => string
  /** Floating tilesheet palette: drag handle that resizes the panel. */
  paletteResize: string
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
    showPalette: string
    hidePalette: string
  }
  libraryTitle: string
  searchPlaceholder: string
  importMapAction: string
  importFromGame: string
  addMapAction: string
  modeAll: string
  modeProject: string
  modeVanilla: string
  emptyTitle: string
  emptyHint: string
  loading: string
  loadFailed: string
  projectBadge: string
  formatValue: (format: string, size: string) => string
  patchGameMap: (name: string) => string
  categories: Record<'farm' | 'town' | 'interior' | 'wild' | 'mine' | 'island' | 'festival' | 'other', string>
  projectGroup: string
  vanillaGroup: string
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
