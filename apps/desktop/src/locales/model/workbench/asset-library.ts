/** Map target region used by map pickers inside the asset library. */
export type AssetLibraryMapCategory = 'farm' | 'town' | 'interior' | 'wild' | 'mine' | 'island' | 'festival' | 'other'

/** Asset families a replacement can swap, mirrored from the replacement model. */
export type LoadAssetFamilyNameKey = 'maps' | 'images' | 'audio' | 'fonts' | 'data' | 'other'

/** Copy for the structured replacement editor (one replacement → many game resources). */
export type MapLoadBindingCopy = {
  introHint: string
  targetsSection: string
  targetsHint: string
  noTargets: string
  addTargetLabel: string
  addTargetPlaceholder: string
  addTargetAction: string
  invalidTarget: string
  duplicateTarget: (target: string) => string
  removeTarget: (target: string) => string
  fromFileSection: string
  fromFileHint: string
  fromFilePlaceholder: string
  projectAssetLabel: string
  insertToken: string
  templateTokens: Record<'Target' | 'TargetWithoutPath' | 'TargetWithoutExtension', string>
  previewSection: string
  previewHint: string
  previewTarget: string
  previewResolved: string
  previewStatus: string
  statusExists: string
  statusMissing: string
  emptyResolved: string
  /** Shown when advanced mode is off to explain why custom input is hidden. */
  expertOnlyHint: string
  /** Grid hint for image-family resource pickers. */
  imageTargetsHint: string
  /** Icon-list hint for audio/fonts/data/other resource pickers. */
  iconTargetsHint: string
  /** Placeholder for the advanced-mode custom resource input outside the maps family. */
  customTargetPlaceholder: string
  /** Thumbnail alt text for a game image resource. */
  thumbnailAlt: (target: string) => string
}

/** Copy for creating a blank or templated project map from the asset library. */
export type AssetLibraryCreateMapCopy = {
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

export type AssetLibraryCopy = {
  importAction: string
  importFolderAction: string
  importing: string
  selectFilesTitle: string
  selectFolderTitle: string
  searchPlaceholder: string
  filterLabel: string
  filters: Record<'all' | 'map' | 'image' | 'audio' | 'data' | 'other', string>
  gridView: string
  listView: string
  assetCount: (visible: number, total: number) => string
  assetKindCount: (count: number) => string
  emptyTitle: string
  emptyHint: string
  noResults: string
  noProjectTitle: string
  noProjectHint: string
  previewAlt: (name: string) => string
  pathLabel: string
  typeLabel: string
  sizeLabel: string
  referencesLabel: string
  referenceCount: (count: number) => string
  editPixelsAction: string
  /** Primary action for a map asset: open it in the map workspace editor. */
  editInMapEditorAction: string
  replaceAction: string
  /** Replacing a file: staging state heading. */
  replaceStagingTitle: string
  /** Replacing a file: label for the original file. */
  replaceOriginalLabel: string
  /** Replacing a file: label for the new file. */
  replaceNewLabel: string
  /** Replacing a file: confirm button. */
  replaceConfirmAction: string
  /** Replacing a file: drop zone hint when no file is staged yet. */
  replaceDropHint: string
  /** Replacing a file: drag-over hint. */
  replaceDragOverHint: string
  /** Create a new replacement binding using this asset as the source file. */
  replaceGameResourceAction: string
  renameAction: string
  deleteAction: string
  renameTitle: string
  renameHint: string
  renamePathLabel: string
  cancelAction: string
  confirmRenameAction: string
  deleteTitle: string
  deleteMessage: (path: string, references: number) => string
  confirmDeleteAction: string
  deleteSelectedAction: string
  deleteSelectedTitle: string
  deleteSelectedMessage: (count: number) => string
  deleteSelectedPartialFailed: (count: number) => string
  selectionCount: (count: number) => string
  selectAll: string
  clearSelection: string
  /** Aria label for the per-card multi-select checkbox. */
  selectAsset: (name: string) => string
  closeAction: string
  loadFailed: string
  importFailed: string
  replaceFailed: string
  previewFailed: string
  renameFailed: string
  deleteFailed: string
  pixelSaveFailed: string
  saveFailed: string
  savingStatus: string
  savedStatus: string
  dirtyStatus: string
  // Map asset dependency closure
  missingDependenciesTitle: string
  missingDependenciesHint: string
  missingDependencyTarget: (path: string, kind: string) => string
  missingDependencyPickAction: string
  missingDependencyPickTitle: string
  missingDependencyImportFailed: string
  missingDependenciesBadge: string
  dependenciesLabel: string
  dependentsLabel: string
  dependencyExistsLabel: string
  dependencyMissingLabel: string
  openDependencyAction: (path: string) => string
  dismissAction: string
  pixelEditor: {
    title: string
    pencil: string
    eraser: string
    eyedropper: string
    fill: string
    undo: string
    redo: string
    color: string
    zoom: string
    dimensions: (width: number, height: number) => string
    resetView: string
    saveAction: string
    loading: string
    decodeFailed: string
  }
  // Map asset creation and replacement management, owned by the asset library.
  viewLoadBindings: string
  loadBindingsTitle: string
  loadBindingsHint: string
  loadBindingsEmpty: string
  loadBindingCount: (count: number) => string
  newLoadBindingAction: string
  openLoadBinding: (target: string) => string
  deleteLoadBinding: string
  loadBindingTarget: string
  loadBindingFromFile: string
  loadBindingEnabled: string
  loadBindingDisabled: string
  loadBindingEnabledExpression: (expression: string) => string
  loadFamilyNames: Record<LoadAssetFamilyNameKey, string>
  loadFamilyGroupCount: (family: string, count: number) => string
  newLoadBindingFamilyTitle: string
  newLoadBindingFamilyHint: string
  newLoadBindingFamilyCancel: string
  /** Short description for each family card in the picker. */
  loadFamilyDescriptions: Record<LoadAssetFamilyNameKey, string>
  genericLoadSummary: {
    hint: string
    targetLabel: string
    fromFileLabel: string
    enabledLabel: string
    enabledTrue: string
    enabledFalse: string
    enabledExpression: (expression: string) => string
    existenceLabel: string
    statusExists: string
    statusMissing: string
    emptyResolved: string
    noTargets: string
    manageInAssetLibrary: string
    manageHint: string
  }
  newMapAction: string
  importFromGame: string
  /** Labels for the four copy-from-game kind entries (map/image/audio/data). */
  importGameKinds: Record<'map' | 'image' | 'audio' | 'data', string>
  /** Dialog titles for each copy-from-game resource picker. */
  importGamePickerLabel: Record<'map' | 'image' | 'audio' | 'data', string>
  importGameAssetFailed: string
  gameAssetScanLoading: string
  gameAssetScanFailed: string
  importMapFailed: string
  openingMap: string
  mapScanLoading: string
  mapScanFailed: string
  projectBadge: string
  mapCategories: Record<AssetLibraryMapCategory, string>
  create: AssetLibraryCreateMapCopy
  mapLoadBinding: MapLoadBindingCopy
}
