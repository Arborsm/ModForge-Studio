import type { ViewportLabels } from '../../../model/workbench'

const map: ViewportLabels = {
  loadPrompt: '加载 XNB 地图后，这里会变成可平移、可缩放、可右键的主视口。',
  zoomOut: '缩小',
  oneToOne: '1:1',
  fit: '适配',
  zoomIn: '放大',
  fitMap: '适配地图',
  setOneToOne: '原始比例',
  centerView: '居中视图',
  resetPan: '重置平移',
  addObjectHere: '在此添加对象',
  inspectHover: '查看悬停信息',
  unavailable: '暂不可用',
  tilesLabel: '格',
  tilesetsLoadedLabel: (loaded, total) => `Tileset ${loaded}/${total}`,
  layersVisibleLabel: (visible, total) => `图层 ${visible}/${total}`,
  objectGroupsVisibleLabel: (visible, total) => `对象组 ${visible}/${total}`,
  zoomLabel: (zoom) => `缩放 ${Math.round(zoom * 100)}%`,
  failedToLoadTilesetImage: (path) => `无法加载 Tileset 图像: ${path}`,
}

export default map
