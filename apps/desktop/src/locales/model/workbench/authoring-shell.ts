/**
 * Locale contract for the authoring workspace header: title, breadcrumb,
 * save state and expert toggle. The unified shell skeleton is gone; each
 * workspace page owns its own layout and consumes these strings directly.
 */
export type AuthoringShellCopy = {
  /** Header title builder for a workspace name (e.g. "建筑工作区"). */
  workspaceLabel: (workspaceName: string) => string
  /** Save status indicator: changes staged but not yet committed. */
  unsaved: string
  /** Save status indicator: auto-save in progress. */
  saving: string
  /** Save status indicator: successfully saved. */
  saved: string
  /** Save status indicator: save failed; retry on next edit. */
  saveFailed: string
  /** Expert mode toggle label. */
  expertMode: string
  /** Expert mode toggle hint. */
  expertModeHint: string
  /** Header title for the project-content overview workspace. */
  projectContentTitle: string
  /** Body text for the project-content overview workspace. */
  projectContentFallback: string
}
