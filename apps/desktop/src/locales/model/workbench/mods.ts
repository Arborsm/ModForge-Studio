export type ModWorkspaceCopy = {
  browserTitle: string
  browserQuickStartTitle: string
  browserLibraryTitle: string
  browserLibraryHasProjectsDescription: string
  browserLibraryEmptyDescription: string
  browserLibraryEmptyTitle: string
  browserLibraryActive: string
  browserFilterPlaceholder: string
  contentPatcherOnly: string
  compatibleOnly: string
  i18nOnly: string
  incompatibleProject: string
  projectsLabel: string
  filteredLabel: string
  unknownLabel: string
  noVersionLabel: string
  importProject: string
  openExternalFolder: string
  openExternalArchive: string
  selectModArchive: string
  externalProjectLoaded: (name: string) => string
  refreshProjects: string
  diagnosticsTitle: string
  diagnosticsSubtitle: string
  statusSummary: string
  projectFacts: string
  sourcePath: string
  configKeysLabel: string
  dynamicTokensLabel: string
  includesLabel: string
  diagnosticsListTitle: string
  noDiagnosticsLabel: string
  manifestPathLabel: string
  contentPathLabel: string
  selectProjectFolder: string
  missingRequiredDependencies: (dependencies: string) => string
  unsavedChangesTitle: string
  unsavedChangesMessage: string
  unsavedSaveAndContinue: string
  unsavedDiscardAndContinue: string
  unsavedCancel: string
  saveFailed: string
  saveSuccess: (path: string) => string
  scanStatus: (count: number) => string
}
