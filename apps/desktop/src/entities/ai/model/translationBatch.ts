import type { AiTranslateBatchRequest, AiTranslationItem, AiTranslationResultItem } from '@shared/contracts'
import { AI_BATCH_MAX_BYTES, AI_BATCH_MAX_ITEM_BYTES, aiContextWindowInputByteBudget, resolveAiContextWindow } from './aiProfileSettings'

const MAX_ITEMS = 32
const MAX_BYTES = AI_BATCH_MAX_BYTES
const MAX_ITEM_BYTES = AI_BATCH_MAX_ITEM_BYTES

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function splitOversizedText(text: string): string[] {
  if (byteLength(text) <= MAX_ITEM_BYTES) return [text]
  const logicalPieces = text.match(/[^.!?。！？\n]+[.!?。！？]?[ \t]*|\n+/gu) ?? [text]
  const chunks: string[] = []
  let current = ''
  const append = (piece: string) => {
    if (current && byteLength(current + piece) > MAX_ITEM_BYTES) {
      chunks.push(current)
      current = ''
    }
    for (const character of piece) {
      if (current && byteLength(current + character) > MAX_ITEM_BYTES) {
        chunks.push(current)
        current = ''
      }
      current += character
    }
  }
  for (const piece of logicalPieces) append(piece)
  if (current) chunks.push(current)
  return chunks
}

export type AiTranslationBatchPlan = {
  batches: AiTranslateBatchRequest[]
  mergeResults: (results: AiTranslationResultItem[]) => AiTranslationResultItem[]
}

/**
 * Matches placeholder tokens exactly like the backend `placeholder_regex`
 * (`{{name}}`, `{0}`, `{0:N0}`, `{player:DisplayName}`, `%s`, `%1$s`, `$0`).
 * The backend sentinel-izes these before the wire round trip; this mirror is
 * used to restore streaming previews without leaking the wire sentinels.
 */
const PLACEHOLDER_TOKEN_PATTERN = /\{\{[^{}\r\n]+\}\}|\{[A-Za-z0-9_.-]+[ \t]*(?::[^{}\r\n]+)?[ \t]*\}|%(?:\d+\$)?[sdif]\b|\$\d+/g

/** Matches the backend sentinel tokens (`⟦0⟧`, `⟦12⟧`). */
const SENTINEL_TOKEN_PATTERN = /⟦(\d+)⟧/g

/** Ordered placeholder tokens of one source text (the sentinel mapping). */
export function collectPlaceholderTokens(text: string): string[] {
  return text.match(PLACEHOLDER_TOKEN_PATTERN) ?? []
}

/**
 * Restores sentinel tokens in a translated text back to the placeholder tokens
 * of its source text. Mirrors the backend restore pass so streaming previews
 * hide the `⟦N⟧` tokens the provider sees on the wire. `mismatched` is true
 * when the round trip is inconsistent — an invented/out-of-range sentinel, a
 * sentinel count that differs from the source token count, or a source with
 * placeholders whose response carries no sentinels at all. The authoritative
 * backend result still count-checks the round trip, so a mismatch here only
 * affects the preview.
 */
export function restorePlaceholderSentinels(translated: string, sourceTokens: readonly string[]): { text: string; mismatched: boolean } {
  const matches = [...translated.matchAll(SENTINEL_TOKEN_PATTERN)]
  if (matches.length === 0) {
    // No sentinels: the provider already wrote the final placeholders (or
    // dropped them). A source that has placeholders makes this inconsistent;
    // the backend count-check decides authoritatively.
    return { text: translated, mismatched: sourceTokens.length > 0 }
  }
  const parts: string[] = []
  let cursor = 0
  let mismatched = matches.length !== sourceTokens.length
  for (const match of matches) {
    const index = match.index ?? 0
    parts.push(translated.slice(cursor, index))
    const token = sourceTokens[Number(match[1])]
    if (token === undefined) {
      mismatched = true
      parts.push(match[0])
    } else {
      parts.push(token)
    }
    cursor = index + match[0].length
  }
  parts.push(translated.slice(cursor))
  return { text: parts.join(''), mismatched }
}

/**
 * Builds the per-item sentinel mapping for a batch. Items whose text contains
 * the sentinel character (a collision the backend also skips) or no
 * placeholders are omitted. The backend derives the exact same mapping from
 * the same source texts, so preview restoration stays in sync with the
 * authoritative result.
 */
export function buildPlaceholderSentinelMap(items: readonly { id: string; text: string }[]): ReadonlyMap<string, readonly string[]> {
  const map = new Map<string, readonly string[]>()
  for (const item of items) {
    if (item.text.includes('⟦')) continue
    const tokens = collectPlaceholderTokens(item.text)
    if (tokens.length > 0) map.set(item.id, tokens)
  }
  return map
}

export type AiTranslationBatchOptions = {
  /**
   * Effective context window in tokens. Priority: explicit profile setting >
   * model metadata > safe default (see `resolveAiContextWindow`). When omitted
   * the safe default applies, so every batching caller honors the context
   * window without extra plumbing.
   */
  contextWindowTokens?: number | null
  /**
   * Per-batch input byte cap override from the profile's advanced parameters.
   * When set, it replaces the window-derived budget (still bounded by the
   * backend's hard cap); when null/absent the budget derives from the context
   * window.
   */
  maxBatchBytes?: number | null
}

/**
 * Splits translation items into backend-safe batches and provides deterministic
 * oversized-item reassembly. Batch size is bounded by the item count, the
 * backend's byte caps, and the context-window token budget (whichever is most
 * restrictive), unless a `maxBatchBytes` override replaces the window budget.
 */
export function buildAiTranslationBatches(
  seed: Omit<AiTranslateBatchRequest, 'jobId' | 'items'>,
  items: AiTranslationItem[],
  jobIdPrefix: string,
  options?: AiTranslationBatchOptions,
): AiTranslationBatchPlan {
  const contextWindow = resolveAiContextWindow(options?.contextWindowTokens ?? null, null)
  const contextBudgetBytes = aiContextWindowInputByteBudget(contextWindow)
  const maxBatchBytes = Math.min(options?.maxBatchBytes ?? contextBudgetBytes, MAX_BYTES)
  const batches: AiTranslateBatchRequest[] = []
  const chunkIds = new Map<string, string[]>()
  let current: AiTranslationItem[] = []
  let bytes = 0
  const flush = () => {
    if (!current.length) return
    batches.push({ ...seed, jobId: `${jobIdPrefix}:${batches.length}`, items: current })
    current = []
    bytes = 0
  }
  const expanded = items.flatMap((item) => {
    const chunks = splitOversizedText(item.text)
    if (chunks.length === 1) return [item]
    const ids = chunks.map((_, index) => `${item.id}\u0000${index}`)
    chunkIds.set(item.id, ids)
    return chunks.map((text, index) => ({ ...item, id: ids[index], text }))
  })
  for (const item of expanded) {
    const size = byteLength(item.text)
    if (current.length >= MAX_ITEMS || (current.length > 0 && bytes + size > maxBatchBytes)) flush()
    current.push(item)
    bytes += size
  }
  flush()
  return {
    batches,
    mergeResults(results) {
      const byId = new Map(results.map((result) => [result.id, result]))
      return items.flatMap((item) => {
        const ids = chunkIds.get(item.id)
        if (!ids) return byId.get(item.id) ?? []
        const parts = ids.map((id) => byId.get(id))
        if (parts.some((part) => !part)) return []
        return [
          {
            id: item.id,
            translatedText: parts.map((part) => part?.translatedText ?? '').join(''),
            detectedLanguage: parts.find((part) => part?.detectedLanguage)?.detectedLanguage ?? null,
            skippedSameLanguage: parts.every((part) => part?.skippedSameLanguage),
          },
        ]
      })
    },
  }
}

/** Computes a stable SHA-256 fingerprint for persistent translation cache lookups. */
export async function hashAiTranslationSource(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** A single provider attempt during degradation; job ids are unique per attempt. */
export type AiBatchAttempt = (request: AiTranslateBatchRequest) => Promise<AiTranslationResultItem[]>

/**
 * Diagnostics emitted by the degradation policy. Consumers use these to track
 * job ids for cancellation and to surface debug log events; the policy itself
 * stays pure so it can be unit-tested without a host.
 */
export type AiBatchDegradationEvent =
  | { kind: 'attemptStart'; jobId: string }
  | { kind: 'attemptEnd'; jobId: string }
  | { kind: 'batchRetry'; jobId: string }
  | { kind: 'invalidResponseRetry'; jobId: string }
  | { kind: 'splitRetry'; jobId: string; itemCount: number }
  | { kind: 'itemKeptOriginal'; jobId: string; itemId: string }

export type AiBatchDegradationResult = {
  items: AiTranslationResultItem[]
  /** Item ids that still mismatched after degradation and must keep the source text. */
  retainedIds: string[]
}

export type AiBatchDegradationOptions = {
  batch: AiTranslateBatchRequest
  attempt: AiBatchAttempt
  /** Classifies the provider failure that should trigger retry/split degradation. */
  isPlaceholderMismatch: (cause: unknown) => boolean
  /**
   * Classifies an invalid provider response (missing/ill-formed fields). Such
   * failures get one whole-batch retry and never split; when omitted the
   * invalid-response retry layer is inert.
   */
  isInvalidResponse?: (cause: unknown) => boolean
  /** Throws when the owning operation has been superseded or cancelled. */
  checkCancelled?: () => void
  /** Optional diagnostics sink; must never throw. */
  onEvent?: (event: AiBatchDegradationEvent) => void
}

/**
 * Runs one translation batch with layered placeholder-mismatch degradation:
 *
 * 1. Initial whole-batch attempt.
 * 2. On placeholder mismatch, one whole-batch retry (the same job id is safe
 *    to reuse because the first attempt has already settled).
 * 3. If the retry still mismatches, the batch is split into single-item
 *    attempts. Items that still mismatch are skipped and reported via
 *    `retainedIds` so the caller keeps their source text; every other item is
 *    returned normally.
 *
 * Invalid provider responses (`isInvalidResponse`) form a separate layer: the
 * whole batch is retried once and the error is rethrown unchanged if the retry
 * also fails — the batch is never split on invalid responses.
 *
 * Other errors (network, auth, rate-limit, cancellation, …) propagate
 * unchanged so they keep their existing error surfacing. Cancellation is
 * checked before every attempt through `checkCancelled`, and in-flight jobs
 * are announced through `onEvent` so callers can cancel them cooperatively.
 */
export async function translateBatchWithDegradation({
  batch,
  attempt,
  isPlaceholderMismatch,
  isInvalidResponse,
  checkCancelled,
  onEvent,
}: AiBatchDegradationOptions): Promise<AiBatchDegradationResult> {
  const runAttempt = async (request: AiTranslateBatchRequest) => {
    checkCancelled?.()
    onEvent?.({ kind: 'attemptStart', jobId: request.jobId })
    try {
      return await attempt(request)
    } finally {
      onEvent?.({ kind: 'attemptEnd', jobId: request.jobId })
    }
  }

  try {
    return { items: await runAttempt(batch), retainedIds: [] }
  } catch (cause) {
    if (isInvalidResponse?.(cause)) {
      onEvent?.({ kind: 'invalidResponseRetry', jobId: batch.jobId })
      // One whole-batch retry; a second failure rethrows without splitting.
      return { items: await runAttempt(batch), retainedIds: [] }
    }
    if (!isPlaceholderMismatch(cause)) throw cause
  }

  onEvent?.({ kind: 'batchRetry', jobId: batch.jobId })
  try {
    return { items: await runAttempt(batch), retainedIds: [] }
  } catch (cause) {
    if (!isPlaceholderMismatch(cause)) throw cause
  }

  onEvent?.({ kind: 'splitRetry', jobId: batch.jobId, itemCount: batch.items.length })
  const items: AiTranslationResultItem[] = []
  const retainedIds: string[] = []
  for (const [index, item] of batch.items.entries()) {
    checkCancelled?.()
    const single: AiTranslateBatchRequest = {
      ...batch,
      jobId: `${batch.jobId}:single:${index}`,
      items: [item],
    }
    try {
      items.push(...(await runAttempt(single)))
    } catch (cause) {
      if (!isPlaceholderMismatch(cause)) throw cause
      retainedIds.push(item.id)
      onEvent?.({ kind: 'itemKeptOriginal', jobId: batch.jobId, itemId: item.id })
    }
  }
  return { items, retainedIds }
}
