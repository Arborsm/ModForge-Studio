import type { AiErrorCode } from '@shared/contracts'

export type NotificationCopy = {
  viewportLabel: string
  dismissLabel: string
  actionHint: string
  levels: Record<'success' | 'info' | 'debug' | 'warning' | 'error', string>
  ai: {
    settingsSaveFailedTitle: string
    modelListFailedTitle: string
    connectionTestFailedTitle: string
    cacheClearFailedTitle: string
    cacheFailedTitle: string
    translationFailedTitle: string
    partialTranslationFailedTitle: string
    partialTranslationKeptOriginalTitle: string
    partialTranslationBatchFailedTitle: string
    usageRecordFailedTitle: string
    usageRecordFailedDescription: string
    partialTranslationFailedDescription: (count: number) => string
    partialTranslationKeptOriginalDescription: (count: number) => string
    partialTranslationBatchFailedDescription: (count: number) => string
    retryAction: string
    failureDescriptions: Record<AiErrorCode, string>
  }
}
