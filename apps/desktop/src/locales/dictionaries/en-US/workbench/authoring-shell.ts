import type { AuthoringShellCopy } from '@locales/model/workbench/authoring-shell'

export const authoringShell: AuthoringShellCopy = {
  workspaceLabel: (workspaceName) => `${workspaceName} Workspace`,
  unsaved: 'Unsaved',
  saving: 'Saving…',
  saved: 'Saved',
  saveFailed: 'Save failed',
  expertMode: 'Expert Mode',
  expertModeHint: 'Show advanced options like conditions, priority, and raw data',
  projectContentTitle: 'Project content',
  projectContentFallback: 'The project content overview will be available in a later release.',
}
