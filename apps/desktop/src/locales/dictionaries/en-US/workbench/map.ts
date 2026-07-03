import type { ViewportLabels } from '../../../model/workbench'

const map: ViewportLabels = {
  loadPrompt: 'Load an XNB map and this becomes the pan-able, zoomable main viewport.',
  zoomOut: 'Zoom out',
  oneToOne: '1:1',
  fit: 'Fit',
  zoomIn: 'Zoom in',
  fitMap: 'Fit map',
  setOneToOne: 'Original scale',
  centerView: 'Center view',
  resetPan: 'Reset pan',
  addObjectHere: 'Add object here',
  inspectHover: 'Inspect hover data',
  unavailable: 'Unavailable',
  tilesLabel: 'tiles',
  tilesetsLoadedLabel: (loaded, total) => `Tilesets ${loaded}/${total}`,
  layersVisibleLabel: (visible, total) => `Layers ${visible}/${total}`,
  objectGroupsVisibleLabel: (visible, total) => `Object groups ${visible}/${total}`,
  zoomLabel: (zoom) => `Zoom ${Math.round(zoom * 100)}%`,
  failedToLoadTilesetImage: (path) => `Failed to load tileset image: ${path}`,
}

export default map
