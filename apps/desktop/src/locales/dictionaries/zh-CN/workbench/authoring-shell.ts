import type { AuthoringShellCopy } from '@locales/model/workbench/authoring-shell'

export const authoringShell: AuthoringShellCopy = {
  workspaceLabel: (workspaceName) => `${workspaceName}工作区`,
  unsaved: '未保存',
  saving: '保存中…',
  saved: '已保存',
  saveFailed: '保存失败',
  expertMode: '专家模式',
  expertModeHint: '显示高级选项，如条件、优先级和原始数据',
  projectContentTitle: '项目内容',
  projectContentFallback: '项目内容总览将在后续版本中开放。',
}
