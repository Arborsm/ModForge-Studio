export { AiProvider, useAi } from './model/AiProvider'
export { isTransientAiFailure, parseAiFailure, type AiFailure } from './model/aiError'
export {
  buildAiTranslationBatches,
  buildPlaceholderSentinelMap,
  collectPlaceholderTokens,
  hashAiTranslationSource,
  restorePlaceholderSentinels,
  translateBatchWithDegradation,
  type AiBatchAttempt,
  type AiBatchDegradationEvent,
  type AiBatchDegradationResult,
  type AiTranslationBatchOptions,
} from './model/translationBatch'
export {
  AI_BATCH_MAX_BYTES,
  AI_BATCH_MAX_ITEM_BYTES,
  AI_CONTEXT_WINDOW_MAX,
  AI_CONTEXT_WINDOW_SAFE_DEFAULT,
  AI_MAX_OUTPUT_TOKENS_MAX,
  aiContextWindowInputByteBudget,
  estimateAiTokens,
  parseOptionalNumberInput,
  resolveAiContextWindow,
  validateAiGenerationParams,
  type AiGenerationParamError,
  type AiGenerationParamField,
} from './model/aiProfileSettings'
export {
  findModelsDevEntry,
  formatAiTokenCount,
  modelsDevProviderForPreset,
  searchModelsDevCatalog,
  type ModelsDevSearchEntry,
} from './model/modelsDevCatalog'
export {
  appendTranslationStreamDelta,
  extractCompletedTranslationItems,
  EMPTY_TRANSLATION_STREAM,
  type TranslationStreamAccumulator,
} from './model/translationStream'
export { resolveTranslationProgress, uniqueOriginalItemIds, type TranslationProgress } from './model/translationProgress'
export { createStreamCommitThrottle, type StreamCommitThrottle } from './model/streamCommitThrottle'
