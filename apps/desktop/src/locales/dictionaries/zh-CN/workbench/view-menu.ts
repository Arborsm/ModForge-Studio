import type { ViewMenuCopy } from '../../../model/workbench'

const viewmenu: ViewMenuCopy = {
  title: '视图',
  resetLabel: '重置默认布局',
  savePresetLabel: '保存当前布局',
  panelsLabel: '窗口',
  panelVisibleLabel: '显示',
  panelHiddenLabel: '隐藏',
  presetsLabel: '工作区预设',
  emptyPresetsLabel: '还没有保存的预设',
  presetNamePrompt: '输入预设名称',
  deletePresetLabel: '删除预设',
  deletePresetConfirm: (name) => `删除预设“${name}”？`,
}

export default viewmenu
