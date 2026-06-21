import type { CoreWorkspaceMode, LocaleCode, WorkspaceTone, WorkspaceMode } from '../core'

export type WorkbenchShellCopy = {
  brand: {
    name: string
    tagline: string
  }
  shell: {
    modeLabel: string
    workbench: string
    launcher: string
    quitConfirm: string
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
    openLaunchpad: string
    closeLaunchpad: string
    title: string
    eyebrow: string
    searchPlaceholder: string
    rootPages: string
    projectChildren: string
    currentPage: string
    rootPage: string
    rootModeLabels: Record<WorkspaceMode, string>
    rootModeCodes: Record<WorkspaceMode, string>
    currentMarker: string
    projectRequiredLabel: string
    projectToolLocked: string
    openProjectTool: string
    projectRequiredTitle: string
    projectRequiredChooseDescription: string
    projectRequiredCreateDescription: string
    selectProjectAction: string
    createProjectAction: string
    recentPages: string
    home: string
    projectLobby: string
    chooseProjectTitle: string
    cancelProjectSelection: string
    mapMaking: string
    eventMaking: string
    itemMaking: string
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
  statusBar: {
    pathValid: string
    pathMissing: string
    scanned: string
    hover: string
    coordinates: string
    event: string
    commands: string
    actors: string
    selectedCommand: string
    modified: string
    design: string
    noEditItem: string
  }
  common: {
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
    onlyTmxSupported: string
    directorySelectionFailed: string
    loadedMapAssets: (count: number, format: string) => string
    loadedMapAssetsWithActiveMap: (count: number, format: string, mapName: string) => string
  }
}
