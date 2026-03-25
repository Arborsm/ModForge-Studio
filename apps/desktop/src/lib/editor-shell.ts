import enUSLocale from '../locales/en-US.json'
import zhCNLocale from '../locales/zh-CN.json'

export type LocaleCode = 'zh-CN' | 'en-US'
export type ThemeMode = 'dark' | 'light'
export type WorkspaceMode = 'map' | 'characters' | 'buildings' | 'items' | 'events'
export type WorkspaceTone = 'idle' | 'working' | 'ready' | 'error'
export type WorldAtlasViewId = 'main' | 'remote'

export type ViewMenuCopy = {
  title: string
  resetLabel: string
  savePresetLabel: string
  panelsLabel: string
  presetsLabel: string
  emptyPresetsLabel: string
  presetNamePrompt: string
  deletePresetConfirm: (name: string) => string
}

export type SettingsMenuCopy = {
  title: string
  categories: {
    appearance: string
    view: string
    interaction: string
    advanced: string
  }
  accentLabel: string
  resetAccentLabel: string
  accentDescription: string
  futureLabel: string
  futureDescription: string
  categoryDescriptions: {
    appearance: string
    view: string
    interaction: string
    advanced: string
  }
}

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

type ModuleNode = {
  title: string
  detail: string
}

export type ModuleBlueprint = {
  title: string
  state: string
  summary: string
  focusTitle: string
  listTitle: string
  inspectorTitle: string
  list: string[]
  lanes: string[]
  bullets: string[]
  nodes: ModuleNode[]
}

export type EditorCopy = {
  brand: {
    name: string
    tagline: string
  }
  menus: string[]
  nav: Record<WorkspaceMode, string>
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
    moduleWorkspace: string
    moduleCanvas: string
    moduleInspector: string
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
  }
  statusBar: {
    pathValid: string
    pathMissing: string
    scanned: string
    hover: string
    coordinates: string
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
    unpackedMaps: string
    xnbMaps: string
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
    onlyTmxSupported: string
    directorySelectionFailed: string
    loadedMapAssets: (count: number, format: string) => string
    loadedMapAssetsWithActiveMap: (count: number, format: string, mapName: string) => string
  }
  viewportLabels: ViewportLabels
  moduleBlueprints: Record<Exclude<WorkspaceMode, 'map'>, ModuleBlueprint>
}

type RawViewMenuCopy = Omit<ViewMenuCopy, 'deletePresetConfirm'> & {
  deletePresetConfirmTemplate: string
}

type RawMessages = Omit<
  EditorCopy['messages'],
  'detectedKnownPath' | 'validatedDirectory' | 'loadedMapAssets' | 'loadedMapAssetsWithActiveMap'
> & {
  detectedKnownPathTemplate: string
  validatedDirectoryTemplate: string
  loadedMapAssetsTemplate: string
  loadedMapAssetsWithActiveMapTemplate: string
}

type RawViewportLabels = Omit<
  ViewportLabels,
  'tilesetsLoadedLabel' | 'layersVisibleLabel' | 'objectGroupsVisibleLabel' | 'zoomLabel' | 'failedToLoadTilesetImage'
> & {
  tilesetsLoadedLabelTemplate: string
  layersVisibleLabelTemplate: string
  objectGroupsVisibleLabelTemplate: string
  zoomLabelTemplate: string
  failedToLoadTilesetImageTemplate: string
}

type RawEditorCopy = Omit<EditorCopy, 'common' | 'messages' | 'viewportLabels'> & {
  common: Omit<EditorCopy['common'], 'objectLabel'> & {
    objectLabelTemplate: string
  }
  messages: RawMessages
  viewportLabels: RawViewportLabels
}

type RawLocaleBundle = {
  editor: RawEditorCopy
  worldAtlasViews: Record<WorldAtlasViewId, string>
  viewMenu: RawViewMenuCopy
  settingsMenu: SettingsMenuCopy
}

const localeBundles: Record<LocaleCode, RawLocaleBundle> = {
  'zh-CN': zhCNLocale as RawLocaleBundle,
  'en-US': enUSLocale as RawLocaleBundle,
}

function formatTemplate(template: string, params: Record<string, number | string>) {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) => String(params[key] ?? `{${key}}`))
}

function buildEditorCopy(raw: RawEditorCopy): EditorCopy {
  const { objectLabelTemplate, ...commonRest } = raw.common
  const {
    detectedKnownPathTemplate,
    validatedDirectoryTemplate,
    loadedMapAssetsTemplate,
    loadedMapAssetsWithActiveMapTemplate,
    ...messageRest
  } = raw.messages
  const {
    tilesetsLoadedLabelTemplate,
    layersVisibleLabelTemplate,
    objectGroupsVisibleLabelTemplate,
    zoomLabelTemplate,
    failedToLoadTilesetImageTemplate,
    ...viewportRest
  } = raw.viewportLabels

  return {
    ...raw,
    common: {
      ...commonRest,
      objectLabel: (id) => formatTemplate(objectLabelTemplate, { id }),
    },
    messages: {
      ...messageRest,
      detectedKnownPath: (path) => formatTemplate(detectedKnownPathTemplate, { path }),
      validatedDirectory: (path) => formatTemplate(validatedDirectoryTemplate, { path }),
      loadedMapAssets: (count, format) =>
        formatTemplate(loadedMapAssetsTemplate, {
          count,
          format,
          FORMAT: format.toUpperCase(),
        }),
      loadedMapAssetsWithActiveMap: (count, format, mapName) =>
        formatTemplate(loadedMapAssetsWithActiveMapTemplate, {
          count,
          format,
          FORMAT: format.toUpperCase(),
          mapName,
        }),
    },
    viewportLabels: {
      ...viewportRest,
      tilesetsLoadedLabel: (loaded, total) => formatTemplate(tilesetsLoadedLabelTemplate, { loaded, total }),
      layersVisibleLabel: (visible, total) => formatTemplate(layersVisibleLabelTemplate, { visible, total }),
      objectGroupsVisibleLabel: (visible, total) =>
        formatTemplate(objectGroupsVisibleLabelTemplate, { visible, total }),
      zoomLabel: (zoom) => formatTemplate(zoomLabelTemplate, { percent: Math.round(zoom * 100) }),
      failedToLoadTilesetImage: (path) => formatTemplate(failedToLoadTilesetImageTemplate, { path }),
    },
  }
}

export const workspaceModes: WorkspaceMode[] = ['map', 'events', 'characters', 'buildings', 'items']

export const editorCopy: Record<LocaleCode, EditorCopy> = {
  'zh-CN': buildEditorCopy(localeBundles['zh-CN'].editor),
  'en-US': buildEditorCopy(localeBundles['en-US'].editor),
}

export function getWorldAtlasViewLabel(locale: LocaleCode, viewId: WorldAtlasViewId) {
  return localeBundles[locale].worldAtlasViews[viewId]
}

export function getViewMenuCopy(locale: LocaleCode): ViewMenuCopy {
  const { deletePresetConfirmTemplate, ...rest } = localeBundles[locale].viewMenu
  return {
    ...rest,
    deletePresetConfirm: (name) => formatTemplate(deletePresetConfirmTemplate, { name }),
  }
}

export function getSettingsMenuCopy(locale: LocaleCode) {
  return localeBundles[locale].settingsMenu
}
