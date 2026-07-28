/**
 * Locale contract for the unified authoring shell (replacing EditModeShell + EditModeToolbar).
 *
 * Slice 1: unified shell + auto-save + expert mode toggle.
 */
export type AuthoringShellCopy = {
  /** Breadcrumb label shown when no specific context is available. */
  workspaceLabel: (workspaceName: string) => string
  /** Back navigation button tooltip. */
  back: string
  /** Forward navigation button tooltip. */
  forward: string
  /** Undo button tooltip. */
  undo: string
  /** Redo button tooltip. */
  redo: string
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
}
