/** Tooltip placement for a guide step relative to its anchor element. */
export type GuideStepPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center'

/**
 * One step of a product guide. `anchor` references a `data-guide` attribute value
 * rendered by a page; steps without an anchor render as a centered card.
 */
export type GuideStepDefinition = {
  id: string
  anchor?: string
  placement?: GuideStepPlacement
  /**
   * Set to `'anchor-click'` to hide the Next button and advance when the user
   * clicks the highlighted anchor element. Only valid for anchored steps; the
   * anchor must be a click-safe target (no navigation or mutation).
   */
  advanceOn?: 'anchor-click'
}

/**
 * A functional-area product guide (registration object). Guides are owned by the
 * domain they describe and composed in `app/guide-setup.ts`; pages only render
 * `data-guide-surface` / `data-guide` attributes and never import guide code.
 */
export type GuideDefinition = {
  /** Stable guide id, e.g. `launcher-library`. Used for completion persistence and locale copy. */
  id: string
  /** `data-guide-surface` value that must be visible for this guide to auto-start. */
  surface: string
  steps: GuideStepDefinition[]
}
