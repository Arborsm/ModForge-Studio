import type { WorkspaceMode } from '../../locales'

export type EditModeRoute = 'studio-desk' | 'workspace-editor'

export function getEditModeRoute(workspaceMode: WorkspaceMode, hasActiveDraft: boolean): EditModeRoute {
  if (workspaceMode === 'mods' || !hasActiveDraft) {
    return 'studio-desk'
  }

  return 'workspace-editor'
}
