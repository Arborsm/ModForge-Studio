/**
 * Undo/redo for every staged draft edit, shared by the whole workbench.
 *
 * `AssetDraftPort.stage` is the single write path into a draft, so one staged
 * operation is exactly one undoable step: the port records the patch fields as
 * they were before the write and as they are after it, and undo re-applies the
 * "before" snapshot through the same host updater. Nothing here touches disk —
 * undoing a saved edit simply makes the draft dirty again, which `commit`
 * persists like any other change.
 *
 * Continuous edits (typing into a field, dragging a slider) arrive as a burst of
 * writes to the same target. A write carries a merge key, and consecutive writes
 * that share it inside {@link MERGE_WINDOW_MS} fold into one entry, so undo
 * steps back one *operation* rather than one keystroke. Callers that stage a
 * discrete operation from outside the port — the event editor's command
 * pipeline, for instance — announce it with {@link tagNextDraftEdit} so their
 * step is never merged into a neighbouring one.
 *
 * The stack is scoped to one draft: opening another project starts a fresh
 * history instead of offering to undo edits into a draft that is no longer open.
 */

import { create } from 'zustand'
import type { DraftPatch } from './types'

/** One reversible operation: the patch fields before and after a staged write. */
export type DraftUndoEntry = {
  patchId: string
  /** Values the recorded fields held before the write; applying them undoes it. */
  before: Partial<DraftPatch>
  /** Values the write installed; applying them redoes it. */
  after: Partial<DraftPatch>
  /** Writes sharing this key inside the merge window fold into one entry; null never merges. */
  mergeKey: string | null
  /** Wall-clock time of the write, for the merge window. */
  at: number
}

/** Host updater the stack replays entries through — the same one the port stages with. */
export type DraftUndoApply = (patchId: string, changes: Partial<DraftPatch>) => void

/** Operations kept per draft; older ones fall off the bottom. */
const MAX_ENTRIES = 100

/** Two writes to the same target this close together read as one operation. */
const MERGE_WINDOW_MS = 600

/** A tag older than this is stale: its operation never reached the port. */
const TAG_TTL_MS = 1000

type PendingTag = { mergeKey: string; at: number }

type DraftUndoState = {
  /** Draft the history belongs to; a different key resets it. */
  scopeKey: string | null
  past: DraftUndoEntry[]
  future: DraftUndoEntry[]
  /** True while an entry is being replayed, so the resulting write is not recorded. */
  applying: boolean
  /** Merge key announced by the next staged write, if any. */
  pendingTag: PendingTag | null
  /** Records a staged write. Ignored while replaying, so undo cannot record itself. */
  record: (scopeKey: string, entry: DraftUndoEntry) => void
  /** Replays the newest entry's "before" snapshot; false when there is nothing to undo. */
  undo: (apply: DraftUndoApply) => boolean
  /** Replays the newest undone entry's "after" snapshot; false when there is nothing to redo. */
  redo: (apply: DraftUndoApply) => boolean
  /** Drops the history, e.g. after reloading the draft from disk. */
  clear: () => void
}

let tagCounter = 0

function canMerge(top: DraftUndoEntry | undefined, next: DraftUndoEntry): top is DraftUndoEntry {
  return (
    top !== undefined &&
    top.mergeKey !== null &&
    top.mergeKey === next.mergeKey &&
    top.patchId === next.patchId &&
    next.at - top.at <= MERGE_WINDOW_MS
  )
}

/** True when a write changes nothing, so it does not belong in the history. */
function isNoop(entry: DraftUndoEntry): boolean {
  const before = entry.before as Record<string, unknown>
  const after = entry.after as Record<string, unknown>
  return Object.keys(after).every((key) => before[key] === after[key])
}

export const useDraftUndoStore = create<DraftUndoState>((set, get) => ({
  scopeKey: null,
  past: [],
  future: [],
  applying: false,
  pendingTag: null,

  record: (scopeKey, entry) => {
    const state = get()
    if (state.applying || isNoop(entry)) {
      return
    }
    if (scopeKey !== state.scopeKey) {
      set({ scopeKey, past: [entry], future: [], pendingTag: null })
      return
    }

    const top = state.past[state.past.length - 1]
    if (canMerge(top, entry)) {
      const merged: DraftUndoEntry = { ...entry, before: top.before, after: { ...top.after, ...entry.after } }
      set({ past: [...state.past.slice(0, -1), merged], future: [], pendingTag: null })
      return
    }

    const past = [...state.past, entry]
    set({ past: past.length > MAX_ENTRIES ? past.slice(past.length - MAX_ENTRIES) : past, future: [], pendingTag: null })
  },

  undo: (apply) => {
    const state = get()
    const entry = state.past[state.past.length - 1]
    if (!entry) {
      return false
    }
    set({ applying: true, past: state.past.slice(0, -1), future: [...state.future, entry] })
    try {
      apply(entry.patchId, entry.before)
    } finally {
      set({ applying: false })
    }
    return true
  },

  redo: (apply) => {
    const state = get()
    const entry = state.future[state.future.length - 1]
    if (!entry) {
      return false
    }
    set({ applying: true, future: state.future.slice(0, -1), past: [...state.past, entry] })
    try {
      apply(entry.patchId, entry.after)
    } finally {
      set({ applying: false })
    }
    return true
  },

  clear: () => set({ past: [], future: [], pendingTag: null }),
}))

/**
 * Labels the operation the next staged write belongs to.
 *
 * Editors that drive the draft indirectly — the event command pipeline stages
 * through a script rebuild, not through a named entry write — call this right
 * before mutating so their operation lands as its own undo step. Pass a key that
 * repeats while an edit continues (`event:update:3`) and changes when a new
 * operation starts; {@link nextDraftEditMergeKey} builds unique keys for
 * structural operations that must never merge.
 */
export function tagNextDraftEdit(mergeKey: string): void {
  useDraftUndoStore.setState({ pendingTag: { mergeKey, at: Date.now() } })
}

/** A merge key no other operation can share, for discrete structural edits. */
export function nextDraftEditMergeKey(prefix: string): string {
  tagCounter += 1
  return `${prefix}#${tagCounter}`
}

/**
 * Consumes the announced merge key, falling back to the port's own.
 * A tag that no write picked up within {@link TAG_TTL_MS} is dropped as stale.
 */
export function consumeDraftEditTag(fallback: string | null): string | null {
  const pending = useDraftUndoStore.getState().pendingTag
  if (pending === null) {
    return fallback
  }
  useDraftUndoStore.setState({ pendingTag: null })
  return Date.now() - pending.at > TAG_TTL_MS ? fallback : pending.mergeKey
}

/** Records a staged write against the draft it belongs to. */
export function recordDraftEdit(scopeKey: string, patch: DraftPatch, changes: Partial<DraftPatch>, mergeKey: string | null): void {
  const before: Record<string, unknown> = {}
  const source = patch as unknown as Record<string, unknown>
  for (const key of Object.keys(changes)) {
    before[key] = source[key]
  }
  useDraftUndoStore.getState().record(scopeKey, {
    patchId: patch.id,
    before: before as Partial<DraftPatch>,
    after: changes,
    mergeKey: consumeDraftEditTag(mergeKey),
    at: Date.now(),
  })
}
