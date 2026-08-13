/**
 * Lossless draft view over one raw asset entry.
 *
 * `fields` holds keys the schema knows, `unknown` preserves everything else
 * verbatim and `keyOrder` records the original key sequence, so an entry that
 * round-trips through the editor keeps its diff shape and never loses data the
 * schema has not caught up with yet.
 */

import type { AssetSchema } from './fieldSchema'

export type AssetEntryDraft = {
  fields: Record<string, unknown>
  unknown: Record<string, unknown>
  keyOrder: string[]
}

/** Narrows a value to a non-array object. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Splits a raw entry into schema-known fields and a preserved unknown bag. */
export function parseAssetEntry(schema: AssetSchema, raw: unknown): AssetEntryDraft {
  const known = new Set<string>(schema.keyOrder)
  const source = isPlainObject(raw) ? raw : {}
  const fields: Record<string, unknown> = {}
  const unknown: Record<string, unknown> = {}
  const keyOrder: string[] = []
  for (const [key, value] of Object.entries(source)) {
    keyOrder.push(key)
    if (known.has(key)) {
      fields[key] = value
    } else {
      unknown[key] = value
    }
  }
  return { fields, unknown, keyOrder }
}

/**
 * Serializes a draft back to game-shape JSON: existing keys keep their original
 * position, removed fields are omitted so game defaults apply, newly set known
 * fields are appended in `keyOrder` order, and unknown keys survive untouched.
 */
export function serializeAssetEntry(schema: AssetSchema, draft: AssetEntryDraft): Record<string, unknown> {
  const known = new Set<string>(schema.keyOrder)
  const result: Record<string, unknown> = {}
  const emitted = new Set<string>()
  for (const key of draft.keyOrder) {
    if (emitted.has(key)) {
      continue
    }
    if (known.has(key)) {
      if (key in draft.fields && draft.fields[key] !== undefined) {
        result[key] = draft.fields[key]
        emitted.add(key)
      }
    } else if (key in draft.unknown) {
      result[key] = draft.unknown[key]
      emitted.add(key)
    }
  }
  for (const [key, value] of Object.entries(draft.unknown)) {
    if (!emitted.has(key)) {
      result[key] = value
      emitted.add(key)
    }
  }
  for (const key of schema.keyOrder) {
    if (!emitted.has(key) && key in draft.fields && draft.fields[key] !== undefined) {
      result[key] = draft.fields[key]
      emitted.add(key)
    }
  }
  return result
}

/** Returns a draft with one known field set, or removed when value is undefined. */
export function setAssetField(draft: AssetEntryDraft, key: string, value: unknown): AssetEntryDraft {
  const fields = { ...draft.fields }
  if (value === undefined) {
    delete fields[key]
  } else {
    fields[key] = value
  }
  return { ...draft, fields }
}

/**
 * Returns a nested object with one key set, or removed when value is undefined.
 * Used by `nested_list` / `nested_object` controls, whose items are raw game
 * objects rather than drafts, so unlisted keys stay in place.
 */
export function setNestedValue(
  source: Readonly<Record<string, unknown>> | undefined,
  key: string,
  value: unknown,
): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = { ...source }
  if (value === undefined) {
    delete next[key]
  } else {
    next[key] = value
  }
  return Object.keys(next).length === 0 ? undefined : next
}

/** Parsed patch `editorState` container: asset entries plus untouched sibling keys. */
export type AssetEditorState = {
  entries: Record<string, unknown>
  rest: Record<string, unknown>
}

/**
 * Reads a patch `editorState`. Accepts both the camelCase `entries` key written
 * by the editors and the PascalCase `Entries` key of imported Content Patcher
 * change entries, so importing a hand-written `content.json` is lossless.
 */
export function parseAssetEditorState(editorState: unknown): AssetEditorState {
  const source = isPlainObject(editorState) ? editorState : {}
  const rest: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (key !== 'entries' && key !== 'Entries') {
      rest[key] = value
    }
  }
  const legacy = isPlainObject(source['Entries']) ? source['Entries'] : {}
  const current = isPlainObject(source['entries']) ? source['entries'] : {}
  return { entries: { ...legacy, ...current }, rest }
}

/** Builds the `editorState` object written back to the patch. */
export function serializeAssetEditorState(state: AssetEditorState): Record<string, unknown> {
  return { ...state.rest, entries: state.entries }
}
