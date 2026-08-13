/**
 * Undo/redo stack helpers for the map document editor.
 *
 * The editor keeps its own document history instead of staging every write on
 * the CP Maker draft stack, so one edit lands on exactly one undo stack. The
 * helpers here are pure and cover the whole stack policy:
 *
 * - no-op detection: a write that changes nothing must not produce a step;
 * - merging: a burst of writes to the same target inside
 *   {@link MAP_HISTORY_MERGE_WINDOW_MS} folds into a single operation;
 * - merge keys: callers name the target they edit (`layer-name` vs
 *   `layer-opacity`), so typing in one field collapses without swallowing a
 *   neighbouring operation;
 * - the timeline the history panel renders.
 */

import type { MapDocument, MapTileset } from '@entities/map'

/** Two writes to the same target this close together read as one operation. */
export const MAP_HISTORY_MERGE_WINDOW_MS = 600

/** Operations kept in the undo stack; older ones fall off the bottom. */
export const MAP_HISTORY_MAX_ENTRIES = 50

/** One reversible operation: the document state before the edit. */
export type MapHistoryEntry = {
  /** Document state the edit started from; undoing restores it. */
  document: MapDocument
  /** History label of that state (the edit that produced it). */
  label: string
  /** Writes sharing this key inside the merge window fold into one entry; null never merges. */
  mergeKey: string | null
  /** Wall-clock time of the write, for the merge window. */
  at: number
}

/** One row of the history panel timeline. */
export type MapEditorHistoryEntry = {
  key: string
  label: string
  state: 'past' | 'current' | 'future'
}

/** True when two documents carry the same content; the no-op test for writes. */
export function mapsEqual(a: MapDocument, b: MapDocument): boolean {
  if (a === b) return true
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!valueEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false
  }
  return true
}

/** Top-level fields whose value differs between two records. */
export function changedFieldKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const changed: string[] = []
  for (const key of keys) {
    if (!valueEqual(before[key], after[key])) changed.push(key)
  }
  return changed
}

/** Record keys whose value changed, was added, or was removed. */
export function changedPropertyKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const changed: string[] = []
  for (const key of keys) {
    if (before[key] !== after[key]) changed.push(key)
  }
  return changed
}

/**
 * Stable merge key for a property-record edit, naming the single key that
 * changed so a burst of writes to it folds into one operation. Null when the
 * change touches several keys (a discrete multi-key rewrite must never merge
 * with a neighbouring operation).
 */
export function propertyEditMergeKey(scope: string, before: Record<string, unknown>, after: Record<string, unknown>): string | null {
  const changed = changedPropertyKeys(before, after)
  return changed.length === 1 ? `${scope}:property:${changed[0]}` : null
}

/**
 * Stable merge key for a partial-update burst (`updateActiveLayer`, object and
 * group field edits). A single-field write names the field (`scope:field:x`);
 * a `properties` write names the changed property key (`scope:property:x`).
 * Multi-field writes are discrete and never merge.
 */
export function partialUpdateMergeKey(
  scope: string,
  updates: Record<string, unknown>,
  beforeRecord: Record<string, unknown>,
): string | null {
  const fields = Object.keys(updates)
  if (fields.length !== 1) return null
  const [field] = fields
  if (field === 'properties') {
    const before = beforeRecord as Record<string, unknown>
    const after = updates.properties
    return typeof after === 'object' && after !== null && !Array.isArray(after)
      ? propertyEditMergeKey(scope, before, after as Record<string, unknown>)
      : null
  }
  return `${scope}:field:${field}`
}

/**
 * Stable merge key for a tileset rewrite: the single field that changed names
 * the operation (`field:source`), and a `properties`/`tileProperties` change
 * names the property key that moved.
 */
export function tilesetUpdateMergeKey(before: MapTileset, after: MapTileset): string | null {
  const changed = changedFieldKeys(before as Record<string, unknown>, after as Record<string, unknown>)
  if (changed.length !== 1) return null
  const [field] = changed
  if (field === 'properties' || field === 'tileProperties') {
    const beforeRecord = (before as Record<string, unknown>)[field]
    const afterRecord = (after as Record<string, unknown>)[field]
    if (typeof beforeRecord === 'object' && beforeRecord !== null && typeof afterRecord === 'object' && afterRecord !== null) {
      return propertyEditMergeKey(
        `map-tileset:${after.name}`,
        beforeRecord as Record<string, unknown>,
        afterRecord as Record<string, unknown>,
      )
    }
    return null
  }
  return `map-tileset:${after.name}:field:${field}`
}

/** True when two consecutive writes to the same target belong to one operation. */
export function canMergeMapHistory(top: MapHistoryEntry | undefined, next: MapHistoryEntry): top is MapHistoryEntry {
  return top !== undefined && top.mergeKey !== null && top.mergeKey === next.mergeKey && next.at - top.at <= MAP_HISTORY_MERGE_WINDOW_MS
}

/**
 * Folds a burst into one entry: the merged entry keeps the first write's
 * "before" snapshot (undo restores the state before the whole burst) and the
 * latest write's timestamp, so the window keeps sliding.
 */
export function mergeMapHistory(top: MapHistoryEntry, next: MapHistoryEntry): MapHistoryEntry {
  return { ...top, at: next.at }
}

/**
 * Records one write on the stack, merging a same-key burst inside the window
 * and capping the stack at {@link MAP_HISTORY_MAX_ENTRIES}.
 */
export function pushMapHistory(stack: readonly MapHistoryEntry[], entry: MapHistoryEntry): MapHistoryEntry[] {
  const top = stack[stack.length - 1]
  if (canMergeMapHistory(top, entry)) {
    return [...stack.slice(0, -1), mergeMapHistory(top, entry)]
  }
  const next = [...stack, entry]
  return next.length > MAP_HISTORY_MAX_ENTRIES ? next.slice(next.length - MAP_HISTORY_MAX_ENTRIES) : next
}

/**
 * Builds the history panel timeline: past entries oldest→newest, the current
 * document, then future redo entries in replay order.
 */
export function buildMapHistoryTimeline(
  undoStack: readonly MapHistoryEntry[],
  currentLabel: string,
  redoStack: readonly MapHistoryEntry[],
): MapEditorHistoryEntry[] {
  return [
    ...undoStack.map((entry, index) => ({ key: `u${index}`, label: entry.label, state: 'past' as const })),
    { key: 'current', label: currentLabel, state: 'current' as const },
    ...[...redoStack].reverse().map((entry, index) => ({ key: `r${index}`, label: entry.label, state: 'future' as const })),
  ]
}

/** Deep value comparison covering the document's nested records and typed arrays. */
function valueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (a instanceof Uint32Array) {
    if (!(b instanceof Uint32Array) || a.length !== b.length) return false
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) return false
    }
    return true
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let index = 0; index < a.length; index += 1) {
      if (!valueEqual(a[index], b[index])) return false
    }
    return true
  }
  const aRecord = a as Record<string, unknown>
  const bRecord = b as Record<string, unknown>
  const aKeys = Object.keys(aRecord)
  if (aKeys.length !== Object.keys(bRecord).length) return false
  for (const key of aKeys) {
    if (!(key in bRecord)) return false
    if (!valueEqual(aRecord[key], bRecord[key])) return false
  }
  return true
}
