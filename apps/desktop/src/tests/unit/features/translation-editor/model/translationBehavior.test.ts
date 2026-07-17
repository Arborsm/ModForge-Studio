import { describe, expect, it } from 'vite-plus/test'
import {
  AI_TRANSLATE_BEHAVIOR_STORAGE_KEY,
  isTranslationAiBehavior,
  isTranslationReviewBehavior,
  REVIEW_BEHAVIOR_STORAGE_KEY,
} from '@features/translation-editor/model/translationBehavior'

describe('translation editor split-button behaviors', () => {
  it('persists under the documented workbench module keys', () => {
    expect(AI_TRANSLATE_BEHAVIOR_STORAGE_KEY).toBe('translation-editor/ai-translate-behavior')
    expect(REVIEW_BEHAVIOR_STORAGE_KEY).toBe('translation-editor/review-behavior')
  })

  it('accepts every supported AI translate behavior', () => {
    expect(isTranslationAiBehavior('current')).toBe(true)
    expect(isTranslationAiBehavior('missing')).toBe(true)
    expect(isTranslationAiBehavior('all')).toBe(true)
  })

  it('rejects values that are not AI translate behaviors', () => {
    expect(isTranslationAiBehavior('translated')).toBe(false)
    expect(isTranslationAiBehavior('')).toBe(false)
    expect(isTranslationAiBehavior(null)).toBe(false)
    expect(isTranslationAiBehavior(undefined)).toBe(false)
    expect(isTranslationAiBehavior(0)).toBe(false)
    expect(isTranslationAiBehavior({})).toBe(false)
  })

  it('accepts every supported review behavior', () => {
    expect(isTranslationReviewBehavior('current')).toBe(true)
    expect(isTranslationReviewBehavior('translated')).toBe(true)
    expect(isTranslationReviewBehavior('all')).toBe(true)
  })

  it('rejects values that are not review behaviors', () => {
    expect(isTranslationReviewBehavior('missing')).toBe(false)
    expect(isTranslationReviewBehavior('')).toBe(false)
    expect(isTranslationReviewBehavior(null)).toBe(false)
    expect(isTranslationReviewBehavior(undefined)).toBe(false)
    expect(isTranslationReviewBehavior(0)).toBe(false)
    expect(isTranslationReviewBehavior({})).toBe(false)
  })
})
