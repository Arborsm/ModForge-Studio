/**
 * Locale contract for authoring workspaces: the expert toggle label and the
 * save-failure notification. Page headers no longer exist; save failures
 * surface through the shared notification system and the expert toggle lives
 * in the workbench side navigation.
 */
export type AuthoringShellCopy = {
  /** Save status indicator: save failed; retry on next edit. */
  saveFailed: string
  /** Expert mode toggle label. */
  expertMode: string
  /** Expert mode toggle hint. */
  expertModeHint: string
  /** Body text for the project-content overview workspace. */
  projectContentFallback: string
}
