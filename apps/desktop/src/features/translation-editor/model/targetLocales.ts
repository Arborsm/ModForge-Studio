import type { LocaleCode } from '@locales/model'

/** Common Stardew Valley i18n locales offered as target languages even before the file exists. */
export const TRANSLATION_TARGET_LOCALES = ['en', 'zh', 'fr', 'de', 'hu', 'it', 'ja', 'ko', 'pt', 'ru', 'es', 'tr']

const DEFAULT_TARGET_LOCALE_BY_APP_LOCALE: Record<LocaleCode, string> = { 'zh-CN': 'zh', 'en-US': 'en' }

/** Maps the app UI locale to the Stardew i18n category used as the default target locale. */
export function defaultTargetLocaleForAppLocale(locale: LocaleCode): string {
  return DEFAULT_TARGET_LOCALE_BY_APP_LOCALE[locale]
}
