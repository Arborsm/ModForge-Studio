import type { WorkspaceMode } from '@locales'

export type EditModeRoute = 'workspace-editor'

export function getEditModeRoute(workspaceMode: WorkspaceMode, hasActiveDraft: boolean): EditModeRoute {
  void workspaceMode
  void hasActiveDraft
  return 'workspace-editor'
}
