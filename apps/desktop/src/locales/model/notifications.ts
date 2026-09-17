import type { AiErrorCode } from '@shared/contracts'

export type NotificationCopy = {
  viewportLabel: string
  dismissLabel: string
  actionHint: string
  levels: Record<'success' | 'info' | 'debug' | 'warning' | 'error', string>
  /** Notification center (bell float / mobile page): recent + unread history. */
  centerTitle: string
  centerEmpty: string
  centerClearAll: string
  unreadBadgeAriaLabel: (count: number) => string
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
