import type { TranslationAiMode } from './useLocalizationTranslation'
import type { TranslationReviewMode } from './useTranslationReview'

/** Workbench persistence key for the AI translate split-button behavior. */
export const AI_TRANSLATE_BEHAVIOR_STORAGE_KEY = 'translation-editor/ai-translate-behavior'
/** Workbench persistence key for the review split-button behavior. */
export const REVIEW_BEHAVIOR_STORAGE_KEY = 'translation-editor/review-behavior'

/** Narrows a persisted value to a supported AI translation behavior. */
export function isTranslationAiBehavior(value: unknown): value is TranslationAiMode {
  return value === 'current' || value === 'missing' || value === 'all'
}

/** Narrows a persisted value to a supported review behavior. */
export function isTranslationReviewBehavior(value: unknown): value is TranslationReviewMode {
  return value === 'current' || value === 'translated' || value === 'all'
}
