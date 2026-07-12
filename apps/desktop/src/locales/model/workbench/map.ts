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
  doneTitle: string
  doneAssetSavedAs: (relativePath: string) => string
  doneSizeKb: (kilobytes: number) => string
  errorTitle: string
  doneAction: string
  closeAction: string
  cancelAction: string
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
