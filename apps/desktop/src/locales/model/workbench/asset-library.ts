/** Map target region used by map pickers inside the asset library. */
export type AssetLibraryMapCategory = 'farm' | 'town' | 'interior' | 'wild' | 'mine' | 'island' | 'festival' | 'other'

/** Asset families a CP Load patch can replace, mirrored from the binding model. */
export type LoadAssetFamilyNameKey = 'maps' | 'images' | 'audio' | 'fonts' | 'data' | 'other'

/** Copy for the structured Load binding editor (one Load patch → many targets). */
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
  /** Shown when expert mode is off to explain why custom input is hidden. */
  expertOnlyHint: string
  /** Grid hint for image-family target pickers. */
  imageTargetsHint: string
  /** Icon-list hint for audio/fonts/data/other target pickers. */
  iconTargetsHint: string
  /** Placeholder for the expert-mode custom target input outside the maps family. */
  customTargetPlaceholder: string
  /** Thumbnail alt text for a game image target. */
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
  title: string
  subtitle: string
  importAction: string
  importFolderAction: string
  importing: string
  selectFilesTitle: string
  selectFolderTitle: string
  searchPlaceholder: string
  filterLabel: string
  filters: Record<'all' | 'image' | 'audio' | 'data' | 'other', string>
  gridView: string
  listView: string
  assetCount: (visible: number, total: number) => string
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
  replaceAction: string
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
  // Map asset creation and Load binding management, owned by the asset library.
  viewAssets: string
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
  importMapFailed: string
  openingMap: string
  mapScanLoading: string
  mapScanFailed: string
  projectBadge: string
  mapCategories: Record<AssetLibraryMapCategory, string>
  create: AssetLibraryCreateMapCopy
  mapLoadBinding: MapLoadBindingCopy
}
