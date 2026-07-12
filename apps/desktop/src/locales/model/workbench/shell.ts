import type { CoreWorkspaceMode, LocaleCode, WorkspaceTone } from '../core'

export type WorkbenchShellCopy = {
  brand: {
    name: string
    tagline: string
  }
  shell: {
    modeLabel: string
    workbench: string
    launcher: string
  }
  menus: string[]
  nav: Record<CoreWorkspaceMode, string>
  localeShort: Record<LocaleCode, string>
  statusTone: Record<WorkspaceTone, string>
  controls: {
    toggleTheme: string
    toggleLocale: string
    browse: string
    useKnownPath: string
    validateOnly: string
    scanAndOpenTown: string
    showAll: string
    hideAll: string
  }
  initialization: {
    recent: string
    detected: string
    clickToUse: string
    none: string
    status: string
    error: string
    retry: string
    chooseDirectory: string
  }
  leftDock: {
    project: string
    projectSubtitle: string
    contentBrowser: string
    contentSubtitle: string
    extensionRail: string
    extensionSubtitle: string
    hostMode: string
    browserHost: string
    desktopHost: string
    gameDirectory: string
    directoryPlaceholder: string
    filterMaps: string
    filterPlaceholder: string
    preferredFormat: string
    detectedMaps: string
    sceneFocus: string
    installState: string
    preferredMaps: string
    noMapsFound: string
    noFilteredMaps: string
    pinned: string
    reserved: string
  }
  center: {
    activeScene: string
    noSceneLoaded: string
    viewport: string
    canvas: string
    rightClick: string
    selectTool: string
    panTool: string
    previewGameWorldAdditions: string
    hideGameWorldAdditions: string
    showGrid: string
    hideGrid: string
    moduleWorkspace: string
    moduleWorkspaceDisabled: string
    moduleCanvas: string
    moduleInspector: string
  }
  workbenchNavigation: {
    title: string
    eyebrow: string
    homeDescription: string
    backToWorkspace: string
    backToWorkspaceHint: string
    searchPlaceholder: string
    searchShortcut: string
    searchResults: string
    searchEmpty: (query: string) => string
    heroTitle: string
    rootPages: string
    rootPagesHint: string
    projectChildren: string
    projectChildrenHint: string
    currentPage: string
    rootPage: string
    rootModeLabels: Record<CoreWorkspaceMode, string>
    rootModeCodes: Record<CoreWorkspaceMode, string>
    globalBrowseHint: (mode: CoreWorkspaceMode) => string
    globalBrowseCapability: (mode: CoreWorkspaceMode) => string
    globalBrowseCapabilityLabel: (mode: CoreWorkspaceMode) => string
    makerModeCodes: Record<'map' | 'events' | 'items', string>
    makerModeHint: (mode: 'map' | 'events' | 'items') => string
    currentMarker: string
    devModeCode: string
    pendingProjectMarker: string
    projectToolNeedsSelection: string
    openProjectTool: string
    createProjectAction: string
    newProjectAction: string
    newProjectCode: string
    newProjectHint: string
    importProjectAction: string
    importProjectCode: string
    importProjectHint: string
    recentPages: string
    home: string
    projectLobby: string
    projectLibraryTitle: string
    projectLibraryCode: string
    projectLibraryHint: string
    makeLauncher: string
    makeLauncherCode: string
    gameDirectoryMissingTitle: string
    gameDirectoryMissingDescription: string
    gameDirectoryAction: string
    gameDirectoryRequiredShort: string
    statusMonitorTitle: string
    currentProjectLabel: string
    noCurrentProject: string
    noCurrentProjectTitle: string
    noCurrentProjectHint: string
    currentProjectMeta: (uniqueId: string) => string
    openProjectLibraryAction: string
    continueProjectAction: string
    pendingExportCount: (count: number) => string
    pendingExportMetric: string
    pendingExportDetail: string
    pendingExportEmptyTitle: string
    pendingExportEmptyDescription: string
    conflictCount: (count: number) => string
    conflictMetric: string
    conflictDetail: string
    conflictEmptyTitle: string
    conflictEmptyDescription: string
    taskCenterTitle: string
    taskCenterSubtitle: string
    closeTaskCenter: string
    taskCenterRealDataNote: string
    gameDirectoryTaskTitle: string
    gameDirectoryTaskIdle: string
    gameDirectoryReadyTitle: string
    closeDialog: string
    continueCurrentProject: (projectName: string) => string
    chooseProjectStep: string
    continueMakerCta: (modeLabel: string) => string
    enterMakerCta: (modeLabel: string) => string
    makerPendingFormat: (modeLabel: string) => string
    useProjectFor: (modeLabel: string) => string
    cancelMakerPending: string
    mapMaking: string
    eventMaking: string
    itemMaking: string
    devToolsTitle: string
    shellNavLabel: string
    shellNavCollapse: string
    shellNavExpand: string
    shellNavBrowseGroup: string
    shellNavToolsGroup: string
    shellNavDevGroup: string
    shellHistoryBack: string
    shellHistoryForward: string
    shellProjectTitleEmpty: string
    shellProjectTitleEmptyMeta: string
    shellProjectMenuRecent: string
    shellProjectMenuNew: string
    shellProjectMenuOpen: string
    shellProjectMenuImport: string
    shellProjectMenuSettings: string
    shellProjectMenuReveal: string
    shellProjectMenuExport: string
    shellProjectMenuClose: string
    shellProjectMenuEmptyId: string
    shellBrowseMode: string
    shellEditMode: string
    shellEditLockedTitle: string
    shellEditLockedSelectProject: string
    shellEditLockedStayBrowse: string
    shellContinueWork: string
    shellContentOverview: string
    shellRecentActivity: string
    shellAttention: string
    shellProjectSection: string
    shellProjectName: string
    shellProjectUniqueId: string
    shellProjectVersion: string
    shellProjectPath: string
    shellOpenDirectory: string
    shellCloseProject: string
    shellEmptyWorldLead: string
    shellCreateFirst: string
    shellCreateMap: string
    shellCreateMapHint: string
    shellCreateCharacter: string
    shellCreateCharacterHint: string
    shellCreateEvent: string
    shellCreateEventHint: string
    shellCreateItem: string
    shellCreateItemHint: string
    shellOr: string
    shellBrowseGameResources: string
    shellProjectManagement: string
    shellOpenProjectAction: string
    shellOpenProjectHint: string
    shellRecentProjects: string
    shellClearRecentList: string
    shellNoProjectBrowseTitle: string
    shellNoProjectBrowseHint: string
    shellBrowseOnly: string
    shellExportAction: string
    shellProjectSettingsAction: string
    shellNewEllipsis: string
    shellContinueEdit: string
    shellActivityEmpty: string
    shellContinueEmpty: string
    shellDirectoryReady: string
    shellBuildStatus: string
  }
  rightDock: {
    title: string
    subtitle: string
    inspector: string
    layers: string
    objectGroups: string
    diagnostics: string
    sceneSummary: string
    hoverProbe: string
    hoverDetails: string
    projectFacts: string
    workspaceStatus: string
    noTileProperties: string
    noObjectGroups: string
    noHoveredObjects: string
    diagnosticsPrompt: string
    layerTiles: string
    objectCount: string
    objectGroupSummary: (objectCount: number, interactionCount: number, pointCount: number) => string
    objectGroupCollectionSummary: (groupCount: number, objectCount: number, interactionCount: number, pointCount: number) => string
  }
  common: {
    scanned: string
    none: string
    yes: string
    no: string
    dimensions: string
    tileSize: string
    tilesets: string
    objectGroups: string
    path: string
    orientation: string
    renderOrder: string
    format: string
    tile: string
    pixel: string
    gid: string
    layer: string
    tileId: string
    tileProperties: string
    type: string
    bounds: string
    executable: string
    mapsPath: string
    visibleLayers: string
    visibleObjects: string
    objectLabel: (id: number) => string
  }
  messages: {
    browserHostPrompt: string
    detectingDefaultInstall: string
    detectedKnownPath: (path: string) => string
    automaticDetectionFailed: string
    enterFolderBeforeValidating: string
    validatingDirectory: string
    validatedDirectory: (path: string) => string
    validationFailed: string
    enterFolderBeforeScanning: string
    validatingAndScanning: string
    mapScanFailed: string
    loadingMap: string
    loadingMapFailed: string
    preloadingResources: string
    preloadingWorldData: string
    preloadingMaps: string
    preloadingTilesets: string
    resourcePreloadFailed: string
    workbenchViewUnavailableTitle: string
    workbenchViewUnavailableDetail: string
    onlyTmxSupported: string
    directorySelectionFailed: string
    loadedMapAssets: (count: number, format: string) => string
    loadedMapAssetsWithActiveMap: (count: number, format: string, mapName: string) => string
  }
}
