import { describe, expect, it } from 'vite-plus/test'
import { planStardewTranslationItems } from '@features/translation-editor/model/stardewTranslationBatch'

describe('Stardew translation batch plan', () => {
  it('sends only text nodes and rebuilds one complete result', () => {
    const source = '@^Hello {{name}}.%item money 500 %%[#]Gift'
    const plan = planStardewTranslationItems([{ id: 'mail', text: source, format: 'stardewI18n', context: 'mail' }])
    expect(plan.items.map((item) => item.text)).toEqual(['Hello', 'Gift'])
    expect(plan.items.every((item) => item.format === 'plainText')).toBe(true)
    const results = plan.items.map((item) => ({
      id: item.id,
      translatedText: `译${item.text}`,
      detectedLanguage: 'en',
      skippedSameLanguage: false,
    }))
    expect(plan.mergeResults(results)).toEqual([
      {
        id: 'mail',
        translatedText: '@^译Hello {{name}}.%item money 500 %%[#]译Gift',
        detectedLanguage: 'en',
        skippedSameLanguage: false,
      },
    ])
  })

  it('does not return a partially rebuilt value when one text node failed', () => {
    const plan = planStardewTranslationItems([{ id: 'mail', text: 'Hello^Again', format: 'stardewI18n' }])
    expect(
      plan.mergeResults([{ id: plan.items[0]!.id, translatedText: '你好', detectedLanguage: 'en', skippedSameLanguage: false }]),
    ).toEqual([])
    expect(plan.originalId(plan.items[1]!.id)).toBe('mail')
  })

  it('does not send command arguments, image notes, or placeholders to the provider', () => {
    const plan = planStardewTranslationItems([
      { id: 'command', text: 'Before%action AddMail test %%After {0}', format: 'stardewI18n' },
      { id: 'image', text: '!image 10', format: 'stardewI18n' },
    ])
    expect(plan.items.map((item) => item.text)).toEqual(['Before', 'After'])
    expect(
      plan.mergeResults([
        { id: plan.items[0]!.id, translatedText: '之前', detectedLanguage: 'en', skippedSameLanguage: false },
        { id: plan.items[1]!.id, translatedText: '之后', detectedLanguage: 'en', skippedSameLanguage: false },
      ]),
    ).toEqual([
      { id: 'command', translatedText: '之前%action AddMail test %%之后 {0}', detectedLanguage: 'en', skippedSameLanguage: false },
      { id: 'image', translatedText: '!image 10', detectedLanguage: null, skippedSameLanguage: true },
    ])
  })
})
