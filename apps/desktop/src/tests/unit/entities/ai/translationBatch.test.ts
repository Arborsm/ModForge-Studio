import { describe, expect, it } from 'vite-plus/test'
import {
  buildAiTranslationBatches,
  buildPlaceholderSentinelMap,
  collectPlaceholderTokens,
  restorePlaceholderSentinels,
  translateBatchWithDegradation,
} from '@entities/ai'
import type { AiTranslateBatchRequest, AiTranslationResultItem } from '@shared/contracts'

const MISMATCH = new Error('AI_ERROR::placeholder-mismatch::AI translation changed placeholders for item x.')
const INVALID_RESPONSE = new Error('AI_ERROR::invalid-response::AI translation item is missing translatedText and text.')
const OTHER = new Error('AI_ERROR::network::AI provider request could not be sent.')

function itemResult(id: string, translatedText: string): AiTranslationResultItem {
  return { id, translatedText, detectedLanguage: 'en', skippedSameLanguage: false }
}

function batch(items: { id: string; text: string }[]): AiTranslateBatchRequest {
  return {
    jobId: 'batch-1',
    targetLocale: 'zh-Hans',
    items: items.map(({ id, text }) => ({ id, text, format: 'plainText' as const })),
  }
}

function isMismatch(cause: unknown) {
  return cause instanceof Error && cause.message.includes('placeholder-mismatch')
}

function isInvalidResponse(cause: unknown) {
  return cause instanceof Error && cause.message.includes('invalid-response')
}

describe('AI translation batching', () => {
  it('caps batches at 32 items and 256 KB', () => {
    const items = Array.from({ length: 40 }, (_, index) => ({ id: `item-${index}`, text: 'x'.repeat(900), format: 'plainText' as const }))
    const plan = buildAiTranslationBatches({ targetLocale: 'zh-Hans' }, items, 'batch')
    expect(plan.batches.length).toBeGreaterThan(1)
    for (const batch of plan.batches) {
      expect(batch.items.length).toBeLessThanOrEqual(32)
      expect(batch.items.reduce((total, item) => total + new TextEncoder().encode(item.text).byteLength, 0)).toBeLessThanOrEqual(256 * 1024)
    }
  })

  it('splits and reassembles an oversized item without losing order', () => {
    const text = `${'First sentence. '.repeat(2200)}Last sentence.`
    const plan = buildAiTranslationBatches({ targetLocale: 'zh-Hans' }, [{ id: 'long', text, format: 'plainText' }], 'batch')
    const chunks = plan.batches.flatMap((batch) => batch.items)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((item) => new TextEncoder().encode(item.text).byteLength <= 32 * 1024)).toBe(true)
    const merged = plan.mergeResults(
      chunks.map((item) => ({ id: item.id, translatedText: `[${item.text}]`, detectedLanguage: 'en', skippedSameLanguage: false })),
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]?.id).toBe('long')
    expect(merged[0]?.translatedText).toBe(chunks.map((item) => `[${item.text}]`).join(''))
  }, 15_000) // size; a >32 KB item needs a generous budget in CI. // splitOversizedText reassembles per-character and is quadratic in the item

  it('budgets batches against an explicit context window', () => {
    // 8k context → 3600 input tokens → 7200 byte budget per batch.
    const items = Array.from({ length: 40 }, (_, index) => ({ id: `item-${index}`, text: 'x'.repeat(900), format: 'plainText' as const }))
    const plan = buildAiTranslationBatches({ targetLocale: 'zh-Hans' }, items, 'batch', { contextWindowTokens: 8000 })
    expect(plan.batches.length).toBeGreaterThan(2)
    for (const batch of plan.batches) {
      const bytes = batch.items.reduce((total, item) => total + new TextEncoder().encode(item.text).byteLength, 0)
      expect(bytes).toBeLessThanOrEqual(7200)
      expect(batch.items.length).toBeLessThanOrEqual(32)
    }
  })

  it('keeps the 256 KB hard cap when the context window is large', () => {
    const items = Array.from({ length: 40 }, (_, index) => ({ id: `item-${index}`, text: 'x'.repeat(900), format: 'plainText' as const }))
    const plan = buildAiTranslationBatches({ targetLocale: 'zh-Hans' }, items, 'batch', { contextWindowTokens: 128000 })
    for (const batch of plan.batches) {
      const bytes = batch.items.reduce((total, item) => total + new TextEncoder().encode(item.text).byteLength, 0)
      expect(bytes).toBeLessThanOrEqual(256 * 1024)
    }
    expect(plan.batches.length).toBe(2)
  })

  it('applies the safe default when no context window is provided', () => {
    const items = Array.from({ length: 40 }, (_, index) => ({ id: `item-${index}`, text: 'x'.repeat(900), format: 'plainText' as const }))
    const plan = buildAiTranslationBatches({ targetLocale: 'zh-Hans' }, items, 'batch')
    for (const batch of plan.batches) {
      const bytes = batch.items.reduce((total, item) => total + new TextEncoder().encode(item.text).byteLength, 0)
      expect(bytes).toBeLessThanOrEqual(Math.floor(16000 * 0.45) * 2)
    }
  })

  it('replaces the window budget with a maxBatchBytes override', () => {
    // 8k window alone would cap batches at 7200 bytes; the 60 KB override wins.
    const items = Array.from({ length: 40 }, (_, index) => ({ id: `item-${index}`, text: 'x'.repeat(900), format: 'plainText' as const }))
    const plan = buildAiTranslationBatches({ targetLocale: 'zh-Hans' }, items, 'batch', {
      contextWindowTokens: 8000,
      maxBatchBytes: 60 * 1024,
    })
    expect(plan.batches.length).toBe(2)
    for (const batch of plan.batches) {
      const bytes = batch.items.reduce((total, item) => total + new TextEncoder().encode(item.text).byteLength, 0)
      expect(bytes).toBeLessThanOrEqual(60 * 1024)
    }
  })

  it('clamps the maxBatchBytes override to the backend hard cap', () => {
    const items = Array.from({ length: 40 }, (_, index) => ({ id: `item-${index}`, text: 'x'.repeat(900), format: 'plainText' as const }))
    const plan = buildAiTranslationBatches({ targetLocale: 'zh-Hans' }, items, 'batch', {
      contextWindowTokens: 128000,
      maxBatchBytes: 512 * 1024,
    })
    for (const batch of plan.batches) {
      const bytes = batch.items.reduce((total, item) => total + new TextEncoder().encode(item.text).byteLength, 0)
      expect(bytes).toBeLessThanOrEqual(256 * 1024)
    }
  })
})

describe('translation batch placeholder-mismatch degradation', () => {
  it('returns the batch result directly when the first attempt succeeds', async () => {
    const request = batch([{ id: 'a', text: 'Hello {{name}}' }])
    const outcome = await translateBatchWithDegradation({
      batch: request,
      attempt: async () => [itemResult('a', '你好 {{name}}')],
      isPlaceholderMismatch: isMismatch,
    })
    expect(outcome.items.map((item) => item.id)).toEqual(['a'])
    expect(outcome.retainedIds).toEqual([])
  })

  it('retries the whole batch once and keeps the retry result on success', async () => {
    const request = batch([{ id: 'a', text: 'Hello {{name}}' }])
    let attempts = 0
    const events: string[] = []
    const outcome = await translateBatchWithDegradation({
      batch: request,
      attempt: async () => {
        attempts += 1
        if (attempts === 1) throw MISMATCH
        return [itemResult('a', '你好 {{name}}')]
      },
      isPlaceholderMismatch: isMismatch,
      onEvent: (event) => events.push(event.kind),
    })
    expect(attempts).toBe(2)
    expect(outcome.items.map((item) => item.translatedText)).toEqual(['你好 {{name}}'])
    expect(outcome.retainedIds).toEqual([])
    expect(events).toContain('batchRetry')
    expect(events.filter((kind) => kind === 'attemptStart')).toHaveLength(2)
  })

  it('splits into single items and keeps only still-mismatching items original', async () => {
    const request = batch([
      { id: 'a', text: 'Hello {{name}}' },
      { id: 'b', text: 'Hi $0' },
      { id: 'c', text: 'Bye %s' },
    ])
    const outcome = await translateBatchWithDegradation({
      batch: request,
      attempt: async (attemptRequest) => {
        if (attemptRequest.items.length === 1) {
          if (attemptRequest.items[0]?.id === 'b') throw MISMATCH
          return attemptRequest.items.map((item) => itemResult(item.id, `译文 ${item.id}`))
        }
        throw MISMATCH
      },
      isPlaceholderMismatch: isMismatch,
      onEvent: (event) => {
        if (event.kind === 'splitRetry') {
          expect(event.itemCount).toBe(3)
        }
      },
    })
    expect(outcome.items.map((item) => item.id)).toEqual(['a', 'c'])
    expect(outcome.retainedIds).toEqual(['b'])
  })

  it('keeps single-item successes even when a sibling still mismatches', async () => {
    const request = batch([
      { id: 'a', text: 'One' },
      { id: 'b', text: 'Two {{x}}' },
    ])
    const outcome = await translateBatchWithDegradation({
      batch: request,
      attempt: async (attemptRequest) => {
        if (attemptRequest.items.length === 1 && attemptRequest.items[0]?.id === 'b') throw MISMATCH
        if (attemptRequest.items.length === 1) return [itemResult(attemptRequest.items[0]!.id, 'ok')]
        throw MISMATCH
      },
      isPlaceholderMismatch: isMismatch,
    })
    expect(outcome.items.map((item) => item.id)).toEqual(['a'])
    expect(outcome.retainedIds).toEqual(['b'])
  })

  it('propagates non-mismatch errors without degrading', async () => {
    const request = batch([{ id: 'a', text: 'Hello' }])
    await expect(
      translateBatchWithDegradation({
        batch: request,
        attempt: async () => {
          throw OTHER
        },
        isPlaceholderMismatch: isMismatch,
      }),
    ).rejects.toThrow('AI_ERROR::network')
  })

  it('propagates a non-mismatch error raised during the per-item fallback', async () => {
    const request = batch([
      { id: 'a', text: 'One' },
      { id: 'b', text: 'Two' },
    ])
    await expect(
      translateBatchWithDegradation({
        batch: request,
        attempt: async (attemptRequest) => {
          if (attemptRequest.items.length > 1) throw MISMATCH
          if (attemptRequest.items[0]?.id === 'a') throw OTHER
          return [itemResult('b', 'ok')]
        },
        isPlaceholderMismatch: isMismatch,
      }),
    ).rejects.toThrow('AI_ERROR::network')
  })

  it('checks cancellation before every attempt and aborts the split loop', async () => {
    const request = batch([
      { id: 'a', text: 'One' },
      { id: 'b', text: 'Two' },
      { id: 'c', text: 'Three' },
    ])
    let cancelled = false
    const cancelledError = new Error('AI_ERROR::cancelled::AI translation context changed.')
    const attempts: string[][] = []
    await expect(
      translateBatchWithDegradation({
        batch: request,
        attempt: async (attemptRequest) => {
          if (cancelled) throw cancelledError
          attempts.push(attemptRequest.items.map((item) => item.id))
          if (attemptRequest.items.length === 1 && attemptRequest.items[0]?.id === 'a') {
            cancelled = true
          }
          throw MISMATCH
        },
        isPlaceholderMismatch: isMismatch,
        checkCancelled: () => {
          if (cancelled) throw cancelledError
        },
      }),
    ).rejects.toThrow('AI_ERROR::cancelled')
    // Whole batch, retry, then single "a"; the split loop must stop before "b"/"c".
    expect(attempts).toEqual([['a', 'b', 'c'], ['a', 'b', 'c'], ['a']])
  })
})

describe('translation batch invalid-response degradation', () => {
  it('retries the whole batch once and keeps the retry result on success', async () => {
    const request = batch([{ id: 'a', text: 'Hello' }])
    let attempts = 0
    const events: string[] = []
    const outcome = await translateBatchWithDegradation({
      batch: request,
      attempt: async () => {
        attempts += 1
        if (attempts === 1) throw INVALID_RESPONSE
        return [itemResult('a', '你好')]
      },
      isPlaceholderMismatch: isMismatch,
      isInvalidResponse,
      onEvent: (event) => events.push(event.kind),
    })
    expect(attempts).toBe(2)
    expect(outcome.items.map((item) => item.translatedText)).toEqual(['你好'])
    expect(outcome.retainedIds).toEqual([])
    expect(events).toContain('invalidResponseRetry')
    expect(events.filter((kind) => kind === 'attemptStart')).toHaveLength(2)
  })

  it('rethrows the error when the whole-batch invalid-response retry also fails, without splitting', async () => {
    const request = batch([
      { id: 'a', text: 'One' },
      { id: 'b', text: 'Two' },
    ])
    const attemptIds: string[][] = []
    let attempts = 0
    await expect(
      translateBatchWithDegradation({
        batch: request,
        attempt: async (attemptRequest) => {
          attempts += 1
          attemptIds.push(attemptRequest.items.map((item) => item.id))
          throw INVALID_RESPONSE
        },
        isPlaceholderMismatch: isMismatch,
        isInvalidResponse,
      }),
    ).rejects.toThrow('AI_ERROR::invalid-response')
    // Exactly one whole-batch retry; the batch is never split on invalid responses.
    expect(attempts).toBe(2)
    expect(attemptIds).toEqual([
      ['a', 'b'],
      ['a', 'b'],
    ])
  })

  it('leaves placeholder-mismatch degradation on its own path even when both classifiers are wired', async () => {
    const request = batch([
      { id: 'a', text: 'Hello {{name}}' },
      { id: 'b', text: 'Hi $0' },
    ])
    const events: string[] = []
    const outcome = await translateBatchWithDegradation({
      batch: request,
      attempt: async (attemptRequest) => {
        if (attemptRequest.items.length === 1) {
          return attemptRequest.items.map((item) => itemResult(item.id, `译文 ${item.id}`))
        }
        throw MISMATCH
      },
      isPlaceholderMismatch: isMismatch,
      isInvalidResponse,
      onEvent: (event) => events.push(event.kind),
    })
    expect(outcome.items.map((item) => item.id)).toEqual(['a', 'b'])
    expect(outcome.retainedIds).toEqual([])
    expect(events).toContain('batchRetry')
    expect(events).toContain('splitRetry')
    expect(events).not.toContain('invalidResponseRetry')
  })

  it('propagates non-invalid-response errors without the invalid-response retry', async () => {
    const request = batch([{ id: 'a', text: 'Hello' }])
    const events: string[] = []
    await expect(
      translateBatchWithDegradation({
        batch: request,
        attempt: async () => {
          throw OTHER
        },
        isPlaceholderMismatch: isMismatch,
        isInvalidResponse,
        onEvent: (event) => events.push(event.kind),
      }),
    ).rejects.toThrow('AI_ERROR::network')
    expect(events).not.toContain('invalidResponseRetry')
  })
})

describe('placeholder sentinel helpers', () => {
  it('collects placeholder tokens in order across all supported forms', () => {
    expect(collectPlaceholderTokens('Hello {{name}}, pay $0, {0:N0}, %1$s and %s!')).toEqual(['{{name}}', '$0', '{0:N0}', '%1$s', '%s'])
    expect(collectPlaceholderTokens('Plain text without tokens')).toEqual([])
  })

  it('restores sentinel tokens back to the source placeholders', () => {
    const tokens = collectPlaceholderTokens('Hello {{name}}, pay $0!')
    const restored = restorePlaceholderSentinels('你好 ⟦0⟧，共 ⟦1⟧ 个', tokens)
    expect(restored.text).toBe('你好 {{name}}，共 $0 个')
    expect(restored.mismatched).toBe(false)
  })

  it('marks invented or dropped sentinels as mismatched without corrupting the rest', () => {
    const tokens = collectPlaceholderTokens('Hello {{name}} $0')
    const invented = restorePlaceholderSentinels('你好 ⟦0⟧ ⟦7⟧', tokens)
    expect(invented.mismatched).toBe(true)
    expect(invented.text).toBe('你好 {{name}} ⟦7⟧')
    const dropped = restorePlaceholderSentinels('你好 ⟦0⟧', tokens)
    expect(dropped.mismatched).toBe(true)
    expect(dropped.text).toBe('你好 {{name}}')
  })

  it('leaves text without sentinels untouched but flags the count gap', () => {
    const tokens = collectPlaceholderTokens('Hello {{name}}!')
    const restored = restorePlaceholderSentinels('你好 {{name}}！', tokens)
    expect(restored.text).toBe('你好 {{name}}！')
    // The provider wrote the final placeholders directly instead of sentinels:
    // the authoritative backend count-check rejects this, so the preview marks
    // it inconsistent too.
    expect(restored.mismatched).toBe(true)
  })

  it('builds per-item maps only for items with placeholders and skips collisions', () => {
    const map = buildPlaceholderSentinelMap([
      { id: 'a', text: 'Hello {{name}}!' },
      { id: 'b', text: 'Plain text' },
      { id: 'c', text: 'Literal ⟦0⟧ stays untouched' },
    ])
    expect(map.get('a')).toEqual(['{{name}}'])
    expect(map.has('b')).toBe(false)
    expect(map.has('c')).toBe(false)
  })
})
