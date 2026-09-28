import type { CompatModuleCopy } from '../../../model/workbench/compat-module'

const compatModule: CompatModuleCopy = {
  loadingTitle: 'Loading entries...',
  loadingDetail: 'Reading data from the target mod directory. Please wait.',
  emptyTitle: 'No entries found',
  emptyDetail: 'No entries were found in the target mod directory. Create entries in-game before editing.',
  modNotInstalledTitle: 'Target mod not installed',
  modNotInstalledDetail: 'Could not find {mod} in the Mods directory. Install the mod to edit its content here.',
  entryListTitle: 'Entries',
  entryListEmpty: 'No entries to edit',
  entrySearchPlaceholder: 'Search entry IDs…',
  entrySearchNoResults: 'No matching entries',
  unsavedChanges: 'Unsaved changes',
  saveSuccess: 'Saved',
  saveError: 'Save failed',
  save: 'Save',
  noSelection: 'Select an entry from the list on the left',
  errorTitle: 'Load failed',
  errorDetail: 'An error occurred while reading entry data. Check that the target mod directory is accessible.',
  recordListEntries: 'entries',
  objectFields: 'fields',
  invalidValue: 'Invalid value',
  itemPickerPlaceholder: 'Type an item name or search…',
  itemPickerNoResults: 'No matching items; type the name directly',
  entryPreviewAlt: 'Preview of {entry}',
  entryImageLoading: 'Loading…',
  entryImageFailed: 'Image failed to load',
  sectionCollapseToggle: 'Collapse/expand {section} section',
}

export default compatModule
