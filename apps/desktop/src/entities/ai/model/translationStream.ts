import type { AiTranslationResultItem, AiTranslationStreamPayload } from '@shared/contracts'

/** Streaming accumulation state for one translation job. */
export type TranslationStreamAccumulator = {
  /** The translation JSON text emitted so far (kind `content` deltas). */
  content: string
  /** Provider chain-of-thought text emitted so far (kind `reasoning` deltas). */
  reasoning: string
}

export const EMPTY_TRANSLATION_STREAM: TranslationStreamAccumulator = { content: '', reasoning: '' }

/** Appends one stream delta to the accumulation state for its job. */
export function appendTranslationStreamDelta(
  previous: TranslationStreamAccumulator,
  delta: AiTranslationStreamPayload,
): TranslationStreamAccumulator {
  if (delta.kind === 'reasoning') {
    return { content: previous.content, reasoning: previous.reasoning + delta.delta }
  }
  return { content: previous.content + delta.delta, reasoning: previous.reasoning }
}

function isCompletedTranslationItem(value: unknown): value is AiTranslationResultItem {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.translatedText === 'string' &&
    (candidate.detectedLanguage === null || typeof candidate.detectedLanguage === 'string')
  )
}

/**
 * Extracts every fully-closed translation item object from the accumulated
 * streaming JSON text. Providers emit the batch result as one JSON document,
 * so this renders the items that have already been generated while the rest of
 * the document is still streaming. Incomplete tails are simply not matched.
 */
export function extractCompletedTranslationItems(accumulated: string): AiTranslationResultItem[] {
  const items: AiTranslationResultItem[] = []
  let index = 0
  while (index < accumulated.length) {
    const open = accumulated.indexOf('{', index)
    if (open === -1) break
    let depth = 0
    let inString = false
    let escaped = false
    let close = -1
    for (let cursor = open; cursor < accumulated.length; cursor += 1) {
      const char = accumulated[cursor]
      if (inString) {
        if (escaped) {
          escaped = false
        } else if (char === '\\') {
          escaped = true
        } else if (char === '"') {
          inString = false
        }
        continue
      }
      if (char === '"') {
        inString = true
      } else if (char === '{') {
        depth += 1
      } else if (char === '}') {
        depth -= 1
        if (depth === 0) {
          close = cursor
          break
        }
      }
    }
    // Always advance past the opening brace: the outer document object never
    // matches the item shape, and an unclosed container must not hide the
    // completed items nested inside it.
    index = open + 1
    if (close === -1) continue
    const candidate = accumulated.slice(open, close + 1)
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (isCompletedTranslationItem(parsed)) {
        items.push({ ...parsed, skippedSameLanguage: false })
      }
    } catch {
      // Nested or incomplete objects are skipped; streaming continues.
    }
  }
  return items
}
