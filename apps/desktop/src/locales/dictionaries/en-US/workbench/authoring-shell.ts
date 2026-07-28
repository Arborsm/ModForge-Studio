import type { AuthoringShellCopy } from '@locales/model/workbench/authoring-shell'

export const authoringShell: AuthoringShellCopy = {
  workspaceLabel: (workspaceName) => `${workspaceName} Workspace`,
  back: 'Back',
  forward: 'Forward',
  undo: 'Undo',
  redo: 'Redo',
  unsaved: 'Unsaved',
  saving: 'Saving…',
  saved: 'Saved',
  saveFailed: 'Save failed',
  expertMode: 'Expert Mode',
  expertModeHint: 'Show advanced options like conditions, priority, and raw data',
}
