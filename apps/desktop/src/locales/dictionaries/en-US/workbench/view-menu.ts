import type { ViewMenuCopy } from '../../../model/workbench'

const viewmenu: ViewMenuCopy = {
  title: 'View',
  resetLabel: 'Reset Default Layout',
  savePresetLabel: 'Save Current Layout',
  panelsLabel: 'Windows',
  panelVisibleLabel: 'Visible',
  panelHiddenLabel: 'Hidden',
  presetsLabel: 'Workspace Presets',
  emptyPresetsLabel: 'No saved presets yet',
  presetNamePrompt: 'Preset name',
  deletePresetLabel: 'Delete preset',
  deletePresetConfirm: (name) => `Delete preset "${name}"?`,
}

export default viewmenu
