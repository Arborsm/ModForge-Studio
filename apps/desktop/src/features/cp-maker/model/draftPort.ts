/**
 * Single write path from an asset editor into the CP Maker draft.
 *
 * Editing only ever *stages*: `stage` rewrites the owning patch's `editorState`
 * in memory, exactly like the toolbar's dirty state expects, and nothing hits
 * disk until `commit` runs the draft save. Deleting an entry is a stage too
 * (`stage(assetId, key, null)`), so a delete can be undone by reverting the
 * draft instead of being persisted behind the author's back.
 *
 * The port is draft-wide rather than patch-wide because one authoring page can
 * own several assets (mail owns `Data/mail` plus `Data/TriggerActions`); an
 * asset id resolves to the patch that edits it.
 *
 * Beside the exported `entries`, a patch may carry two editor-only records:
 * `disabledEntries` parks entries the author switched off without deleting
 * them, and `entryLabels` names entries whose key is a game token rather than
 * something readable. Both travel with the entry through `stage`, `renameEntry`
 * and `stageEntryMeta`, so an editor never has to reach past the port to keep
 * them in sync.
 *
 * Because every write funnels through one place, each staged operation is also
 * recorded on the shared undo stack; see `undoStack.ts` for how operations are
 * grouped, and use `undo` / `redo` below to walk them.
 */

import {
  getAssetSchema,
  parseAssetEditorState,
  parseAssetEntry,
  serializeAssetEditorState,
  serializeAssetEntry,
  type AssetEntryDraft,
  type AssetSchema,
} from '@entities/asset-schema'
import { recordDraftEdit, useDraftUndoStore } from './undoStack'
import type { CpMakerDraft, DraftPatch, VirtualPreviewAsset } from './types'

/** Editor-only state kept beside an entry, never exported as part of its value. */
export type AssetEntryMeta = {
  /** False parks the entry in `disabledEntries`, keeping it out of the export. */
  enabled: boolean
  /** Author-facing name for the entry, or null when the key speaks for itself. */
  label: string | null
}

export type AssetDraftPort = {
  /** Draft being edited; read-only access for editors that need project metadata or assets. */
  draft: CpMakerDraft
  /** Entry keys of an asset in authoring order — enabled entries first, then disabled ones. */
  listEntries: (assetId: string) => string[]
  /** Lossless draft view of one entry, or null when the asset or entry is absent. */
  read: (assetId: string, entryKey: string) => AssetEntryDraft | null
  /** Stages an entry write, or a delete when `entry` is null. Throws when no patch edits the asset. */
  stage: (assetId: string, entryKey: string, entry: AssetEntryDraft | null) => void
  /** Editor-only state of an entry; an absent entry reads as enabled and unlabeled. */
  readEntryMeta: (assetId: string, entryKey: string) => AssetEntryMeta
  /** Stages part of an entry's editor-only state, moving it between the exported and parked records. */
  stageEntryMeta: (assetId: string, entryKey: string, meta: Partial<AssetEntryMeta>) => void
  /**
   * Stages a key change, keeping the entry's position and editor-only state.
   * Throws when `toKey` is already taken, so a rename can never silently
   * overwrite a sibling entry.
   */
  renameEntry: (assetId: string, fromKey: string, toKey: string) => void
  /**
   * Raw entry value, bypassing the schema round-trip. Assets whose entries are
   * not objects (`Data/NPCGiftTastes` rows are strings) cannot go through
   * `read`, which would flatten them into an empty draft.
   */
  readValue: (assetId: string, entryKey: string) => unknown
  /** Raw counterpart of `stage`; `null` deletes the entry. */
  stageValue: (assetId: string, entryKey: string, value: unknown) => void
  /**
   * Stages several raw entry writes of one asset in a single patch update.
   * Sequential `stageValue` calls inside one event handler all read the same
   * render's patch, so the last one would win; a page rewriting several entries
   * at once (deleting a letter with its triggers, renaming an id) must use this.
   */
  stageValues: (assetId: string, values: Record<string, unknown>) => void
  /** Whether any `EditData` patch in the draft targets this asset. */
  hasAsset: (assetId: string) => boolean
  /** Adds a patch to the draft and returns its id, or null when the shell refuses. */
  addPatch: (action: DraftPatch['action'], target: string, fromFile?: string) => string | null
  /** Persists every staged change by saving the draft. */
  commit: () => void
  /** Drops staged changes by reloading the persisted draft, history included. */
  revert: () => void
  /** Reverts the newest staged operation; false when there is nothing to undo. */
  undo: () => boolean
  /** Re-applies the newest undone operation; false when there is nothing to redo. */
  redo: () => boolean
  /** Whether the draft holds staged changes that `commit` would persist. */
  isDirty: () => boolean
  /**
   * Stages a change to patch metadata (target, action, logName, enabled, …).
   * Pass `{ record: false }` to skip the draft undo stack — reserved for
   * editors that own their own document history (the map asset editor), so one
   * operation never lands on two stacks. All other editors record as before.
   */
  updatePatch: (patchId: string, changes: Partial<DraftPatch>, options?: UpdatePatchOptions) => void
  /**
   * Moves one patch one position in the draft's export order; a boundary move
   * is a no-op. `within` skips patches the predicate rejects, so a filtered
   * manager view swaps with its visible neighbor. Structural, so it is not
   * recorded on the entry undo stack.
   */
  reorderPatch: (patchId: string, delta: -1 | 1, within?: (patch: DraftPatch) => boolean) => void
  /**
   * Deep-copies a patch right after the original with a fresh id. Structural,
   * so it is not recorded on the entry undo stack.
   */
  duplicatePatch: (patchId: string) => void
  /** Removes a patch from the draft entirely. Structural, so it is not recorded on the entry undo stack. */
  removePatch: (patchId: string) => void
  /** Adds a binary asset to the draft's virtual file tree. */
  addVirtualAsset: (asset: VirtualPreviewAsset) => void
  /** Removes a binary asset from the draft's virtual file tree. */
  removeVirtualAsset: (relativePath: string) => void
  /** Opens the project config schema dialog, or null on hosts that own no such dialog. */
  openConfig: (() => void) | null
  /** Opens a patch in the host's editor, or null on hosts with no patch navigation. */
  openPatch: ((patchId: string) => void) | null
  /** Entry the shell considers selected, shared with the toolbar breadcrumb. */
  selectedEntryKey: string | null
  /** Moves the shell selection, so toolbar and editor stay in sync. */
  selectEntry: (entryKey: string | null) => void
}

/** Optional per-write behavior for patch metadata changes. */
export type UpdatePatchOptions = {
  /** False skips the draft undo stack; see `updatePatch` for when that is appropriate. */
  record?: boolean
}

export type AssetDraftPortOptions = {
  draft: CpMakerDraft
  /** Patch currently open in the shell; it wins when several patches edit one asset. */
  activePatchId: string | null
  onPatchChange: (patchId: string, patch: Partial<DraftPatch>) => void
  onPatchAdd: (action: DraftPatch['action'], target: string, fromFile?: string) => string | void
  /** Moves one patch one position in the draft's export order; boundary moves are no-ops. */
  onPatchReorder: (patchId: string, delta: -1 | 1, within?: (patch: DraftPatch) => boolean) => void
  /** Deep-copies a patch after the original, assigning a fresh id. */
  onPatchDuplicate: (patchId: string) => void
  /** Removes a patch from the draft. */
  onPatchRemove: (patchId: string) => void
  onAddVirtualAsset: (asset: VirtualPreviewAsset) => void
  onRemoveVirtualAsset: (relativePath: string) => void
  onSaveDraft: () => void
  onReloadDraft: () => void
  /** Omitted by hosts that render no config schema dialog, such as standalone workbench modules. */
  onOpenConfig?: () => void
  /** Omitted by hosts with no patch navigation, such as standalone workbench modules. */
  onOpenPatch?: (patchId: string) => void
  isDirty: boolean
  selectedEntryKey: string | null
  onSelectEntry: (entryKey: string | null) => void
}

/** Editor-state record parking entries the author switched off. */
const DISABLED_ENTRIES_KEY = 'disabledEntries'

/** Editor-state record naming entries whose key is not readable on its own. */
const ENTRY_LABELS_KEY = 'entryLabels'

/**
 * Editor-state keys that describe how the workbench presents an entry rather
 * than what Content Patcher applies, so the export must drop them: the two
 * records above plus `titles`, the dialogue page's own label record.
 *
 * `buildContentJson` reads this list, which is why it lives beside the port
 * that writes the records instead of being restated in the exporter.
 */
export const EDITOR_ONLY_STATE_KEYS: readonly string[] = [DISABLED_ENTRIES_KEY, ENTRY_LABELS_KEY, 'titles']

/** Entry keys the author parked in a patch's `disabledEntries` record. */
export function readDisabledEntryKeys(editorState: unknown): string[] {
  const state = parseAssetEditorState(editorState)
  return Object.keys(readSiblingRecord(state.rest, DISABLED_ENTRIES_KEY))
}

function normalizeAssetId(assetId: string): string {
  return assetId.trim().replaceAll('\\', '/').toLowerCase()
}

/** Reads one editor-state sibling record, tolerating foreign shapes. */
function readSiblingRecord(rest: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = rest[key]
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {}
}

/** Writes a sibling record back, dropping it entirely once it is empty. */
function withSiblingRecord(rest: Record<string, unknown>, key: string, record: Record<string, unknown>): Record<string, unknown> {
  const next = { ...rest }
  if (Object.keys(record).length === 0) {
    delete next[key]
  } else {
    next[key] = record
  }
  return next
}

/** Rebuilds a record with one key renamed in place, so entry order survives. */
function renameRecordKey(record: Record<string, unknown>, fromKey: string, toKey: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => (key === fromKey ? [toKey, value] : [key, value])))
}

/** Empty schema so unregistered assets still round-trip through the unknown bag. */
function fallbackSchema(assetId: string): AssetSchema {
  return { assetId, keyOrder: [], groups: [], fields: [] }
}

/** Builds the draft-wide write path handed to every registered asset editor. */
export function createAssetDraftPort(options: AssetDraftPortOptions): AssetDraftPort {
  const { draft } = options

  /**
   * Every write goes through here so it lands in the undo history as one step.
   * `mergeKey` names the target being written: a burst of writes to the same
   * one (typing into a field) collapses into a single undoable operation.
   */
  function onPatchChange(patchId: string, changes: Partial<DraftPatch>, mergeKey: string | null = null): void {
    // A patch added earlier in the same handler is not in this render's draft
    // yet, so there is no prior state to step back to. Pages stage into a fresh
    // patch on the render after the add (see the mail page) precisely so their
    // first write is undoable like every other one.
    const patch = draft.patches.find((candidate) => candidate.id === patchId)
    if (patch) {
      recordDraftEdit(draft.draftStorageKey, patch, changes, mergeKey)
    }
    options.onPatchChange(patchId, changes)
  }

  function editsAsset(patch: DraftPatch, wanted: string): boolean {
    return patch.action === 'EditData' && normalizeAssetId(patch.target) === wanted
  }

  function findPatch(assetId: string): DraftPatch | null {
    const wanted = normalizeAssetId(assetId)
    const active = options.activePatchId ? draft.patches.find((patch) => patch.id === options.activePatchId) : undefined
    if (active && editsAsset(active, wanted)) {
      return active
    }
    return draft.patches.find((patch) => editsAsset(patch, wanted)) ?? null
  }

  function schemaFor(assetId: string): AssetSchema {
    return getAssetSchema(assetId) ?? fallbackSchema(assetId)
  }

  /** Resolves the patch that edits `assetId`, refusing to guess when there is none. */
  function requirePatch(assetId: string, action: string): DraftPatch {
    const patch = findPatch(assetId)
    if (!patch) {
      throw new Error(`No EditData patch edits "${assetId}"; create the patch before ${action}.`)
    }
    return patch
  }

  /** Both entry records of a patch: the exported one and the parked one. */
  function readRecords(patch: DraftPatch) {
    const state = parseAssetEditorState(patch.editorState)
    return { state, entries: { ...state.entries }, disabled: readSiblingRecord(state.rest, DISABLED_ENTRIES_KEY) }
  }

  /** Commits both entry records back onto the patch in one staged write. */
  function writeRecords(
    patch: DraftPatch,
    state: { entries: Record<string, unknown>; rest: Record<string, unknown> },
    entries: Record<string, unknown>,
    disabled: Record<string, unknown>,
    rest: Record<string, unknown> = state.rest,
    mergeKey: string | null = null,
  ): void {
    onPatchChange(
      patch.id,
      { editorState: serializeAssetEditorState({ entries, rest: withSiblingRecord(rest, DISABLED_ENTRIES_KEY, disabled) }) },
      mergeKey,
    )
  }

  /**
   * Rewrites entries of the patch that edits `assetId`; a `null` value deletes
   * that entry along with its editor-only state. A write lands in whichever
   * record already holds the key, so editing a disabled entry does not silently
   * re-enable it. Every write of one call lands in a single patch update.
   */
  function writeEntries(assetId: string, values: Record<string, unknown>): void {
    const keys = Object.keys(values)
    const patch = requirePatch(assetId, keys.length === 1 ? `staging entry "${keys[0]}"` : `staging ${keys.length} entries`)
    const { state, entries, disabled } = readRecords(patch)
    const labels = readSiblingRecord(state.rest, ENTRY_LABELS_KEY)
    let labelsChanged = false

    for (const [entryKey, nextValue] of Object.entries(values)) {
      if (nextValue === null) {
        delete entries[entryKey]
        delete disabled[entryKey]
        if (entryKey in labels) {
          delete labels[entryKey]
          labelsChanged = true
        }
      } else if (entryKey in disabled && !(entryKey in entries)) {
        disabled[entryKey] = nextValue
      } else {
        entries[entryKey] = nextValue
      }
    }

    writeRecords(
      patch,
      state,
      entries,
      disabled,
      labelsChanged ? withSiblingRecord(state.rest, ENTRY_LABELS_KEY, labels) : state.rest,
      `${patch.id}:entries:${keys.join(',')}`,
    )
  }

  function writeEntry(assetId: string, entryKey: string, nextValue: unknown): void {
    writeEntries(assetId, { [entryKey]: nextValue })
  }

  /** Value of an entry from either record, or undefined when it does not exist. */
  function readEntryValue(assetId: string, entryKey: string): unknown {
    const patch = findPatch(assetId)
    if (!patch) {
      return undefined
    }
    const { entries, disabled } = readRecords(patch)
    return entryKey in entries ? entries[entryKey] : disabled[entryKey]
  }

  return {
    draft,

    listEntries: (assetId) => {
      const patch = findPatch(assetId)
      if (!patch) {
        return []
      }
      const { entries, disabled } = readRecords(patch)
      const keys = Object.keys(entries)
      return [...keys, ...Object.keys(disabled).filter((key) => !keys.includes(key))]
    },

    read: (assetId, entryKey) => {
      const value = readEntryValue(assetId, entryKey)
      return value === undefined ? null : parseAssetEntry(schemaFor(assetId), value)
    },

    stage: (assetId, entryKey, entry) => {
      writeEntry(assetId, entryKey, entry === null ? null : serializeAssetEntry(schemaFor(assetId), entry))
    },

    readEntryMeta: (assetId, entryKey) => {
      const patch = findPatch(assetId)
      if (!patch) {
        return { enabled: true, label: null }
      }
      const state = parseAssetEditorState(patch.editorState)
      const label = readSiblingRecord(state.rest, ENTRY_LABELS_KEY)[entryKey]
      return {
        enabled: !(entryKey in readSiblingRecord(state.rest, DISABLED_ENTRIES_KEY)),
        label: typeof label === 'string' && label !== '' ? label : null,
      }
    },

    stageEntryMeta: (assetId, entryKey, meta) => {
      const patch = requirePatch(assetId, `staging metadata of entry "${entryKey}"`)
      const { state, entries, disabled } = readRecords(patch)
      let rest = state.rest

      if (meta.enabled === true && entryKey in disabled) {
        entries[entryKey] = disabled[entryKey]
        delete disabled[entryKey]
      } else if (meta.enabled === false && entryKey in entries) {
        disabled[entryKey] = entries[entryKey]
        delete entries[entryKey]
      }

      if (meta.label !== undefined) {
        const labels = readSiblingRecord(rest, ENTRY_LABELS_KEY)
        if (meta.label === null || meta.label.trim() === '') {
          delete labels[entryKey]
        } else {
          labels[entryKey] = meta.label
        }
        rest = withSiblingRecord(rest, ENTRY_LABELS_KEY, labels)
      }

      writeRecords(patch, state, entries, disabled, rest, `${patch.id}:meta:${entryKey}`)
    },

    renameEntry: (assetId, fromKey, toKey) => {
      if (fromKey === toKey) {
        return
      }
      const patch = requirePatch(assetId, `renaming entry "${fromKey}"`)
      const { state, entries, disabled } = readRecords(patch)
      if (toKey in entries || toKey in disabled) {
        throw new Error(`Entry "${toKey}" already exists in "${assetId}"; pick a free key before renaming "${fromKey}".`)
      }
      const labels = readSiblingRecord(state.rest, ENTRY_LABELS_KEY)
      writeRecords(
        patch,
        state,
        renameRecordKey(entries, fromKey, toKey),
        renameRecordKey(disabled, fromKey, toKey),
        withSiblingRecord(state.rest, ENTRY_LABELS_KEY, renameRecordKey(labels, fromKey, toKey)),
        `${patch.id}:rename:${fromKey}`,
      )
    },

    readValue: readEntryValue,

    stageValue: (assetId, entryKey, value) => {
      writeEntry(assetId, entryKey, value)
    },

    stageValues: writeEntries,

    hasAsset: (assetId) => findPatch(assetId) !== null,

    addPatch: (action, target, fromFile) => {
      const patchId = options.onPatchAdd(action, target, fromFile)
      return typeof patchId === 'string' ? patchId : null
    },

    commit: options.onSaveDraft,

    // Reloading replaces the in-memory draft wholesale, so the recorded
    // snapshots describe patches that no longer exist as the author left them.
    revert: () => {
      useDraftUndoStore.getState().clear()
      options.onReloadDraft()
    },

    // Undo replays through the host updater rather than the wrapper above, so
    // reverting an operation does not record itself as a new one.
    undo: () => useDraftUndoStore.getState().undo(options.onPatchChange),
    redo: () => useDraftUndoStore.getState().redo(options.onPatchChange),
    isDirty: () => options.isDirty,
    updatePatch: (patchId, changes, writeOptions) => {
      if (writeOptions?.record === false) {
        // Editors with their own document history write through without
        // touching the draft undo stack; the host updater still runs so the
        // patch state and save pipeline behave exactly like a recorded write.
        options.onPatchChange(patchId, changes)
        return
      }
      onPatchChange(patchId, changes, `${patchId}:patch:${Object.keys(changes).sort().join(',')}`)
    },
    reorderPatch: options.onPatchReorder,
    duplicatePatch: options.onPatchDuplicate,
    removePatch: options.onPatchRemove,
    addVirtualAsset: options.onAddVirtualAsset,
    removeVirtualAsset: options.onRemoveVirtualAsset,
    openConfig: options.onOpenConfig ?? null,
    openPatch: options.onOpenPatch ?? null,
    selectedEntryKey: options.selectedEntryKey,
    selectEntry: options.onSelectEntry,
  }
}
