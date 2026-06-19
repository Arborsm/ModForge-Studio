import type { ViewportLabels, BuildAssetDialogCopy } from '../../../model/workbench'

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

const buildAssetDialog: BuildAssetDialogCopy = {
  title: '构建地图资源',
  building: '构建中...',
  buildingMessage: '正在将地图序列化为 tBIN 格式...',
  doneTitle: '构建完成',
  doneAssetSavedAs: (relativePath) => `资源已保存为 ${relativePath}`,
  doneSizeKb: (kilobytes) => `大小: ${kilobytes} KB`,
  errorTitle: '构建失败',
  doneAction: '完成',
  closeAction: '关闭',
  cancelAction: '取消',
}

export default map
export { buildAssetDialog }
