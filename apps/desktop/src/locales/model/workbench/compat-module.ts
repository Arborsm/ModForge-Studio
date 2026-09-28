/** Copy for compat plugin module runtime framework text (save/empty/list/error states). */
export type CompatModuleCopy = {
  /** Loading state title shown while entries are being fetched. */
  loadingTitle: string
  /** Loading state detail. */
  loadingDetail: string
  /** Empty state title shown when no entries are found. */
  emptyTitle: string
  /** Empty state detail shown when no entries are found. */
  emptyDetail: string
  /** Empty state title shown when the target mod is not installed. */
  modNotInstalledTitle: string
  /** Empty state detail when the target mod is missing; `{mod}` is the target UniqueID. */
  modNotInstalledDetail: string
  /** Entry list sidebar title. */
  entryListTitle: string
  /** Entry list empty placeholder. */
  entryListEmpty: string
  /** Entry list search placeholder. */
  entrySearchPlaceholder: string
  /** Message shown when the entry search has no matches. */
  entrySearchNoResults: string
  /** Unsaved changes indicator. */
  unsavedChanges: string
  /** Save success message. */
  saveSuccess: string
  /** Save error message. */
  saveError: string
  /** Save button label. */
  save: string
  /** No-selection placeholder title. */
  noSelection: string
  /** Error state title. */
  errorTitle: string
  /** Error state detail. */
  errorDetail: string
  /** Record-list entry count unit label (e.g. "3 entries"). */
  recordListEntries: string
  /** Object field count unit label (e.g. "4 fields"). */
  objectFields: string
  /** Invalid value placeholder for record-list/object fields. */
  invalidValue: string
  /** Placeholder text for the game-item picker input. */
  itemPickerPlaceholder: string
  /** Message shown when the game-item picker filter matches no catalogued item. */
  itemPickerNoResults: string
  /** Alt text for the large entry preview image; `{entry}` is the entry id. */
  entryPreviewAlt: string
  /** Placeholder label for an entry image still loading. */
  entryImageLoading: string
  /** Placeholder label for an entry image that failed to load. */
  entryImageFailed: string
  /** Aria label for the section collapse toggle; `{section}` is the section title. */
  sectionCollapseToggle: string
}
