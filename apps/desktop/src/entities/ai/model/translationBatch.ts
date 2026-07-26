import type { AiTranslateBatchRequest, AiTranslationItem, AiTranslationResultItem } from '@shared/contracts'

const MAX_ITEMS = 32
const MAX_BYTES = 24 * 1024
const MAX_ITEM_BYTES = 8 * 1024

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

/** Splits translation items into backend-safe batches and provides deterministic oversized-item reassembly. */
export function buildAiTranslationBatches(
  seed: Omit<AiTranslateBatchRequest, 'jobId' | 'items'>,
  items: AiTranslationItem[],
  jobIdPrefix: string,
): AiTranslationBatchPlan {
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
    if (current.length >= MAX_ITEMS || (current.length > 0 && bytes + size > MAX_BYTES)) flush()
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
