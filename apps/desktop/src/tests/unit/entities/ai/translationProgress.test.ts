import { describe, expect, it } from 'vite-plus/test'
import { resolveTranslationProgress, uniqueOriginalItemIds } from '@entities/ai'

describe('uniqueOriginalItemIds', () => {
  it('keeps plain ids in first-seen order and drops duplicates', () => {
    expect(uniqueOriginalItemIds(['overview:a', 'full:b', 'overview:a', 'changelog:0:1'])).toEqual([
      'overview:a',
      'full:b',
      'changelog:0:1',
    ])
  })

  it('strips the chunk suffix so split items count once', () => {
    expect(uniqueOriginalItemIds(['overview:seg-1\u00000', 'overview:seg-1\u00001', 'overview:seg-1\u00002'])).toEqual(['overview:seg-1'])
  })

  it('handles empty input and mixed chunked/plain ids', () => {
    expect(uniqueOriginalItemIds([])).toEqual([])
    expect(uniqueOriginalItemIds(['full:seg-2\u00001', 'full:seg-2', 'full:seg-2\u00000'])).toEqual(['full:seg-2'])
  })
})

describe('resolveTranslationProgress', () => {
  it('returns a clamped 0..1 ratio for a known total', () => {
    expect(resolveTranslationProgress(2, 10)).toEqual({ completed: 2, total: 10, ratio: 0.2 })
    expect(resolveTranslationProgress(12, 10)).toEqual({ completed: 10, total: 10, ratio: 1 })
    expect(resolveTranslationProgress(-1, 10)).toEqual({ completed: 0, total: 10, ratio: 0 })
  })

  it('returns a null ratio when the total is unknown or zero', () => {
    expect(resolveTranslationProgress(3, 0)).toEqual({ completed: 0, total: 0, ratio: null })
    expect(resolveTranslationProgress(3, -5)).toEqual({ completed: 0, total: 0, ratio: null })
  })

  it('rounds fractional counts down to whole items', () => {
    const progress = resolveTranslationProgress(2.9, 10)
    expect(progress.completed).toBe(2)
    expect(progress.ratio).toBe(0.2)
  })
})
