import { describe, expect, it } from 'vite-plus/test'
import { buildAiTranslationBatches } from '@entities/ai'

describe('AI translation batching', () => {
  it('caps batches at 32 items and 24 KB', () => {
    const items = Array.from({ length: 40 }, (_, index) => ({ id: `item-${index}`, text: 'x'.repeat(900), format: 'plainText' as const }))
    const plan = buildAiTranslationBatches({ targetLocale: 'zh-Hans' }, items, 'batch')
    expect(plan.batches.length).toBeGreaterThan(1)
    for (const batch of plan.batches) {
      expect(batch.items.length).toBeLessThanOrEqual(32)
      expect(batch.items.reduce((total, item) => total + new TextEncoder().encode(item.text).byteLength, 0)).toBeLessThanOrEqual(24 * 1024)
    }
  })

  it('splits and reassembles an oversized item without losing order', () => {
    const text = `${'First sentence. '.repeat(700)}Last sentence.`
    const plan = buildAiTranslationBatches({ targetLocale: 'zh-Hans' }, [{ id: 'long', text, format: 'plainText' }], 'batch')
    const chunks = plan.batches.flatMap((batch) => batch.items)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((item) => new TextEncoder().encode(item.text).byteLength <= 8 * 1024)).toBe(true)
    const merged = plan.mergeResults(
      chunks.map((item) => ({ id: item.id, translatedText: `[${item.text}]`, detectedLanguage: 'en', skippedSameLanguage: false })),
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]?.id).toBe('long')
    expect(merged[0]?.translatedText).toBe(chunks.map((item) => `[${item.text}]`).join(''))
  })
})
