import type { NotificationCopy } from '../../model'

const notifications: NotificationCopy = {
  viewportLabel: 'Notifications',
  dismissLabel: 'Dismiss notification',
  actionHint: 'Press Enter to run action',
  levels: {
    success: 'Success',
    info: 'Info',
    debug: 'Debug',
    warning: 'Warning',
    error: 'Error',
  },
  ai: {
    settingsSaveFailedTitle: 'AI settings were not saved',
    modelListFailedTitle: 'AI models could not be loaded',
    connectionTestFailedTitle: 'AI connection test failed',
    cacheClearFailedTitle: 'Translation cache was not cleared',
    cacheFailedTitle: 'Local translation cache is unavailable',
    translationFailedTitle: 'AI translation failed',
    partialTranslationFailedTitle: 'Some translations failed',
    partialTranslationFailedDescription: (count) =>
      `${count} ${count === 1 ? 'item' : 'items'} could not be translated. Successful results remain in the draft.`,
    retryAction: 'Retry',
    failureDescriptions: {
      'not-configured': 'Configure and select a default AI profile in Settings.',
      authentication: 'The provider rejected the configured credential. Check the API key and account access.',
      model: 'The configured model is unavailable or unsupported by this provider.',
      'rate-limit': 'The provider rate limit was reached. Wait briefly, then retry.',
      timeout: 'The provider did not respond before the request timed out.',
      network: 'The provider could not be reached. Check the endpoint and network connection.',
      cache: 'The local translation cache could not be read or updated. The AI provider may still be available.',
      'invalid-response': 'The provider returned a result that did not match the required translation format.',
      'placeholder-mismatch': 'The provider changed protected placeholders, so the unsafe result was discarded.',
      cancelled: 'The translation was cancelled.',
      unknown: 'Review the inline error details and try again.',
    },
  },
}

export default notifications
