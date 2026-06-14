export type ModWorkspaceCopy = {
  workspaceLabel: string
  workspaceSubtitle: string
  emptyStateTitle: string
  emptyStateSubtitle: string
  browserTitle: string
  browserSubtitle: string
  browserQuickStartTitle: string
  browserLibraryTitle: string
  browserLibraryHasProjectsDescription: string
  browserLibraryEmptyDescription: string
  browserLibraryEmptyTitle: string
  browserLibraryActive: string
  browserFilterPlaceholder: string
  browserEmpty: string
  contentPatcherOnly: string
  compatibleOnly: string
  incompatibleProject: string
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
  contentPatcherPatchProperties: {
    title: string
    add: string
    remove: string
    empty: string
    defaultPatchMode: string
    toggleEnabledType: string
    enabledTokenPlaceholder: string
  }
  contentPatcherExport: {
    title: string
    defaultSubtitle: string
    readyLabel: string
    blockedLabel: string
    empty: string
    resultTargetTitle: string
    exportableDescription: string
    blockedDescription: string
    exportPngResult: string
    exportJsonResult: string
    exportMapResult: string
    lastExportTitle: string
    lastExportSubtitle: string
  }
  contentPatcherPreview: {
    loading: string
    empty: string
    targetTitle: (path: string) => string
    previewAriaLabel: string
  }
  contentPatcherNavigator: {
    jsonTargets: string
    imageTargets: string
    mapTargets: string
    otherTargets: (kind: string) => string
    patchesTab: string
    targetsTab: string
    patchesMeta: (count: number) => string
    targetsMeta: (count: number) => string
    noTargets: string
    scaleUp: string
    openHint: string
    renderPreview: string
    parameterSettings: string
  }
  contentPatcherDiagnostics: {
    title: string
    defaultSubtitle: string
    noField: string
    noFieldInformation: string
    empty: string
  }
  contentPatcherTrace: {
    title: string
    defaultSubtitle: string
    noDetails: string
    action: string
    source: string
    empty: string
  }
  contentPatcherImagePreview: {
    original: string
    patched: string
    toolbarLabel: string
    layers: string
    split: string
    zoomOut: string
    actualSize: string
    zoomIn: string
    fitToScreen: string
    centerView: string
    diffOnly: string
    focusedChanges: string
    overlay: string
    patchBounds: string
    blend: string
    simulationContext: string
    viewportLabel: (targetPath: string) => string
    originalViewportLabel: (targetPath: string) => string
    patchedViewportLabel: (targetPath: string) => string
    originalAlt: (targetPath: string) => string
    patchedAlt: (targetPath: string) => string
  }
  contentPatcherScaleUp: {
    sourceExisting: string
    sourceDerived: string
    close: string
    metrics: {
      scale: string
      padding: string
      resultSheet: string
      originalSheet: string
    }
    renderPreviewTitle: string
    renderPreviewDescription: string
    sheetAlt: (targetPath: string) => string
    regions: {
      headshot: string
      minimap: string
      chest: string
    }
    cropPreviews: {
      headshot: string
      minimap: string
    }
    parameterSettingsTitle: string
    parameterSettingsDescription: string
    fields: {
      scale: string
      paddingWidth: string
      paddingHeight: string
      breathType: string
      headShotX: string
      headShotY: string
      headShotXRenderOffset: string
      headShotYRenderOffset: string
      miniMapXOffset: string
      miniMapYOffset: string
      chestSourceX: string
      chestSourceY: string
      chestSourceWidth: string
      chestSourceHeight: string
      chestAdjustX: string
      chestAdjustY: string
    }
    breathTypes: Record<'None' | 'Male' | 'Female', string>
    noSpriteSettings: string
  }
  contentPatcherSimulation: {
    title: string
    ignoreEntryWhenConditions: string
    ignoreEntryWhenConditionsAria: string
    ignoreWhenNo: string
    ignoreWhenYes: string
    any: string
    trueLabel: string
    falseLabel: string
    commaSeparatedPlaceholder: string
    showAdvanced: string
    hideAdvanced: string
    dynamicTokens: string
    configLabel: (key: string) => string
    fields: Record<string, string>
    options: {
      seasons: Record<string, string>
      weather: Record<string, string>
      daysOfWeek: Record<string, string>
      playerGender: Record<string, string>
      farmType: Record<string, string>
      petType: Record<string, string>
      farmCave: Record<string, string>
    }
  }
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
  missingRequiredDependencies: (dependencies: string) => string
  unsavedChangesTitle: string
  unsavedChangesMessage: string
  unsavedSaveAndContinue: string
  unsavedDiscardAndContinue: string
  unsavedCancel: string
  unsavedCannotSave: string
  exportOverwriteTitle: string
  exportOverwriteMessage: (path: string) => string
  exportOverwriteConfirm: string
  saveFailed: string
  exportFailed: string
  saveSuccess: (path: string) => string
  exportSuccess: (path: string) => string
  scanStatus: (count: number) => string
}
