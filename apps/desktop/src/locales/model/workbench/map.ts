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
