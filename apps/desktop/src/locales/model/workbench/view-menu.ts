export type ViewMenuCopy = {
  title: string
  resetLabel: string
  savePresetLabel: string
  panelsLabel: string
  panelVisibleLabel: string
  panelHiddenLabel: string
  presetsLabel: string
  emptyPresetsLabel: string
  presetNamePrompt: string
  deletePresetLabel: string
  deletePresetConfirm: (name: string) => string
}
