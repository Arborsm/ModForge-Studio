import { describe, expect, it } from 'vite-plus/test'
import { defaultTargetLocaleForAppLocale, TRANSLATION_TARGET_LOCALES } from '@features/translation-editor/model/targetLocales'

describe('translation target locales', () => {
  it('maps the app UI locale to the matching i18n language category', () => {
    expect(defaultTargetLocaleForAppLocale('zh-CN')).toBe('zh')
    expect(defaultTargetLocaleForAppLocale('en-US')).toBe('en')
  })

  it('offers every mapped default in the target locale list', () => {
    expect(TRANSLATION_TARGET_LOCALES).toContain('zh')
    expect(TRANSLATION_TARGET_LOCALES).toContain('en')
  })
})
