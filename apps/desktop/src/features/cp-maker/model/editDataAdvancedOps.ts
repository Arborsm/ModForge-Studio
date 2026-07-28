/**
 * Read/write helpers for the EditData advanced operations parked in a patch's
 * `editorState`: `textOperations`, `moveEntries` and the per-entry `fields`
 * map. The export (`buildContentJson`) already merges these records; these
 * helpers give the GUI and validation one shared, shape-checked view of them.
 */

import { readDisabledEntryKeys } from './draftPort'

/** One `TextOperations` row (camelCase form; PascalCased at export). */
export type TextOperationDraft = {
  operation: string
  target: string
  value?: string
  delimiter?: string
  search?: string
  replaceMode?: string
}

/** One `MoveEntries` row; exactly one of beforeId/afterId/toPosition applies. */
export type MoveEntryDraft = {
  id: string
  beforeId?: string
  afterId?: string
  toPosition?: number
}

/** `Fields` map: entry key → field name → replacement value. */
export type AdvancedFieldMap = Record<string, Record<string, unknown>>

export const TEXT_OPERATION_KINDS = ['Append', 'Prepend', 'RemoveDelimited'] as const
export const TEXT_OPERATION_REPLACE_MODES = ['All', 'First', 'Last'] as const

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function withStateKey(editorState: unknown, key: string, value: unknown, keepWhenEmpty: boolean): Record<string, unknown> {
  const state = { ...asRecord(editorState) }
  const empty = Array.isArray(value) ? value.length === 0 : Object.keys(asRecord(value)).length === 0
  if (empty && !keepWhenEmpty) {
    delete state[key]
  } else {
    state[key] = value
  }
  return state
}

/** Reads the patch's text operations; malformed entries are skipped. */
export function readTextOperations(editorState: unknown): TextOperationDraft[] {
  const raw = asRecord(editorState)['textOperations']
  if (!Array.isArray(raw)) return []
  return raw
    .filter((op): op is Record<string, unknown> => typeof op === 'object' && op !== null && !Array.isArray(op))
    .map((op) => ({
      operation: asString(op['operation']) ?? 'Append',
      target: asString(op['target']) ?? '',
      value: asString(op['value']),
      delimiter: asString(op['delimiter']),
      search: asString(op['search']),
      replaceMode: asString(op['replaceMode']),
    }))
}

/** Writes text operations back, dropping the key when none remain. */
export function writeTextOperations(editorState: unknown, operations: readonly TextOperationDraft[]): Record<string, unknown> {
  const serialized = operations.map((op) => {
    const result: Record<string, unknown> = { operation: op.operation, target: op.target }
    if (op.value !== undefined && op.value !== '') result['value'] = op.value
    if (op.delimiter !== undefined && op.delimiter !== '') result['delimiter'] = op.delimiter
    if (op.search !== undefined && op.search !== '') result['search'] = op.search
    if (op.replaceMode !== undefined && op.replaceMode !== '') result['replaceMode'] = op.replaceMode
    return result
  })
  return withStateKey(editorState, 'textOperations', serialized, false)
}

/** Reads the patch's move entries; malformed entries are skipped. */
export function readMoveEntries(editorState: unknown): MoveEntryDraft[] {
  const raw = asRecord(editorState)['moveEntries']
  if (!Array.isArray(raw)) return []
  return raw
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && !Array.isArray(entry))
    .map((entry) => ({
      id: asString(entry['id']) ?? '',
      beforeId: asString(entry['beforeId']),
      afterId: asString(entry['afterId']),
      toPosition: typeof entry['toPosition'] === 'number' ? entry['toPosition'] : undefined,
    }))
}

/** Writes move entries back, dropping the key when none remain. */
export function writeMoveEntries(editorState: unknown, entries: readonly MoveEntryDraft[]): Record<string, unknown> {
  const serialized = entries.map((entry) => {
    const result: Record<string, unknown> = { id: entry.id }
    if (entry.beforeId !== undefined && entry.beforeId !== '') result['beforeId'] = entry.beforeId
    if (entry.afterId !== undefined && entry.afterId !== '') result['afterId'] = entry.afterId
    if (entry.toPosition !== undefined) result['toPosition'] = entry.toPosition
    return result
  })
  return withStateKey(editorState, 'moveEntries', serialized, false)
}

/** Reads the per-entry `fields` map (entry key → field name → value). */
export function readAdvancedFields(editorState: unknown): AdvancedFieldMap {
  const raw = asRecord(editorState)['fields']
  const result: AdvancedFieldMap = {}
  for (const [entryKey, fieldMap] of Object.entries(asRecord(raw))) {
    result[entryKey] = { ...asRecord(fieldMap) }
  }
  return result
}

/** Writes the per-entry `fields` map back, dropping the key when empty. */
export function writeAdvancedFields(editorState: unknown, fields: AdvancedFieldMap): Record<string, unknown> {
  return withStateKey(editorState, 'fields', fields, false)
}

/** Entry keys the patch replaces wholesale via `entries` (disabled ones excluded). */
export function readReplacedEntryKeys(editorState: unknown): string[] {
  const entries = asRecord(asRecord(editorState)['entries'])
  const disabled = new Set(readDisabledEntryKeys(editorState))
  return Object.keys(entries).filter((key) => !disabled.has(key))
}
