/**
 * Bootstraps a pack's `i18n/default.json` from the text already authored in
 * the draft: translatable string fields are rewritten to `{{i18n:key}}` and
 * their texts collected as the default entries. Pure and side-effect free —
 * the caller applies the returned editor states and entries to the draft.
 *
 * Field policy: whole-entry strings only for assets whose entries *are* text
 * (dialogue, mail, gift tastes); for object entries only the classic
 * localizable fields (`DisplayName`, `Name`, `Description`). Values already
 * tokenized (`{{…}}`) or referencing game strings (`[LocalizedText …]`) are
 * left alone, and keys already present in `default.json` are never
 * overwritten — the author's existing text always wins.
 */

import type { CpMakerDraft, DraftPatch } from './types'

export type I18nExtraction = {
  /** key → default text, to merge into `i18n/default.json`. */
  entries: Record<string, string>
  /** patchId → rewritten editorState with `{{i18n:key}}` in place of raw text. */
  editorStates: ReadonlyMap<string, unknown>
  /** Text fields rewritten, for the confirmation copy. */
  rewrittenCount: number
  /** Fields skipped because their key already exists in default.json. */
  skippedCount: number
}

/** Assets whose whole entry value is translatable text. */
const WHOLE_VALUE_PREFIXES = ['characters/dialogue/', 'data/dialogue/']
const WHOLE_VALUE_TARGETS = new Set(['data/mail', 'data/npcgifttastes', 'data/engagementdialogue', 'data/extradialogue'])
const LOCALIZABLE_OBJECT_FIELDS = new Set(['DisplayName', 'Name', 'Description'])

function normalizeTarget(target: string): string {
  return target.trim().replaceAll('\\', '/').toLowerCase()
}

function isWholeValueTarget(target: string): boolean {
  const normalized = normalizeTarget(target)
  return WHOLE_VALUE_TARGETS.has(normalized) || WHOLE_VALUE_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

/** `Data/Objects` → `objects`, `Characters/Dialogue/Abigail` → `dialogue.Abigail`. */
function keyPrefixFor(target: string): string {
  const segments = target
    .trim()
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment !== '')
  const tail = segments[segments.length - 1] ?? 'pack'
  const head = segments.length > 1 ? segments[segments.length - 2]!.toLowerCase() : ''
  if (head === 'dialogue') {
    return sanitizeKeyPart(`${head}.${tail}`)
  }
  if (head === 'data') {
    return sanitizeKeyPart(tail.toLowerCase())
  }
  return sanitizeKeyPart(tail)
}

function sanitizeKeyPart(value: string): string {
  const sanitized = value
    .replaceAll(/[^A-Za-z0-9_.-]+/g, '_')
    .replaceAll(/_+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
  return sanitized === '' ? 'entry' : sanitized
}

function i18nToken(key: string): string {
  return `{{i18n:${key}}}`
}

function isRewritableText(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed === '') return false
  if (trimmed.startsWith('{{')) return false
  if (trimmed.startsWith('[')) return false
  return true
}

function parseExistingDefaults(draft: CpMakerDraft): Set<string> {
  const file = draft.i18nFiles.find((candidate) => candidate.locale === 'default')
  if (file === undefined) return new Set()
  try {
    const parsed = JSON.parse(file.rawJson) as unknown
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return new Set(Object.keys(parsed as Record<string, unknown>))
    }
  } catch {
    // An unreadable default.json must not block extraction; entries merge later.
  }
  return new Set()
}

function rewriteEntries(
  patch: DraftPatch,
  entries: Record<string, unknown>,
  existingKeys: Set<string>,
  collected: Record<string, string>,
): { nextEntries: Record<string, unknown>; rewritten: number; skipped: number } {
  const prefix = keyPrefixFor(patch.target)
  const wholeValue = isWholeValueTarget(patch.target)
  let rewritten = 0
  let skipped = 0
  const nextEntries: Record<string, unknown> = {}

  for (const [entryKey, entryValue] of Object.entries(entries)) {
    if (wholeValue && isRewritableText(entryValue)) {
      const key = `${prefix}.${sanitizeKeyPart(entryKey)}`
      if (existingKeys.has(key) || key in collected) {
        skipped += 1
        nextEntries[entryKey] = entryValue
        continue
      }
      collected[key] = entryValue
      nextEntries[entryKey] = i18nToken(key)
      rewritten += 1
      continue
    }

    if (typeof entryValue === 'object' && entryValue !== null && !Array.isArray(entryValue)) {
      const record = entryValue as Record<string, unknown>
      let touched = false
      const nextRecord: Record<string, unknown> = { ...record }
      for (const field of Object.keys(record)) {
        if (!LOCALIZABLE_OBJECT_FIELDS.has(field)) continue
        const fieldValue = record[field]
        if (!isRewritableText(fieldValue)) continue
        const key = `${prefix}.${sanitizeKeyPart(entryKey)}.${field}`
        if (existingKeys.has(key) || key in collected) {
          skipped += 1
          continue
        }
        collected[key] = fieldValue
        nextRecord[field] = i18nToken(key)
        touched = true
        rewritten += 1
      }
      nextEntries[entryKey] = touched ? nextRecord : entryValue
      continue
    }

    nextEntries[entryKey] = entryValue
  }

  return { nextEntries, rewritten, skipped }
}

/** Scans the draft's EditData patches and builds the i18n bootstrap payload. */
export function buildI18nExtraction(draft: CpMakerDraft): I18nExtraction {
  const existingKeys = parseExistingDefaults(draft)
  const collected: Record<string, string> = {}
  const editorStates = new Map<string, unknown>()
  let rewrittenCount = 0
  let skippedCount = 0

  for (const patch of draft.patches) {
    if (patch.action !== 'EditData' || patch.enabled === false) continue
    const state =
      typeof patch.editorState === 'object' && patch.editorState !== null && !Array.isArray(patch.editorState) ? patch.editorState : null
    const entries =
      state !== null &&
      typeof (state as Record<string, unknown>)['entries'] === 'object' &&
      !Array.isArray((state as Record<string, unknown>)['entries'])
        ? ((state as Record<string, unknown>)['entries'] as Record<string, unknown>)
        : null
    if (entries === null || Object.keys(entries).length === 0) continue

    const { nextEntries, rewritten, skipped } = rewriteEntries(patch, entries, existingKeys, collected)
    if (rewritten === 0) {
      skippedCount += skipped
      continue
    }
    rewrittenCount += rewritten
    skippedCount += skipped
    editorStates.set(patch.id, { ...(state as Record<string, unknown>), entries: nextEntries })
  }

  return { entries: collected, editorStates, rewrittenCount, skippedCount }
}
