import { describe, expect, it } from 'vite-plus/test'
import {
  appendTranslationStreamDelta,
  extractCompletedTranslationItems,
  EMPTY_TRANSLATION_STREAM,
  type TranslationStreamAccumulator,
} from '@entities/ai'
import type { AiTranslationStreamPayload } from '@shared/contracts'

function delta(jobId: string, kind: AiTranslationStreamPayload['kind'], text: string): AiTranslationStreamPayload {
  return { jobId, kind, delta: text }
}

describe('translation stream accumulation', () => {
  it('appends content and reasoning deltas separately', () => {
    let state: TranslationStreamAccumulator = EMPTY_TRANSLATION_STREAM
    state = appendTranslationStreamDelta(state, delta('j1', 'reasoning', 'Step 1: analyze. '))
    state = appendTranslationStreamDelta(state, delta('j1', 'content', '{"items":['))
    state = appendTranslationStreamDelta(state, delta('j1', 'reasoning', 'Step 2: translate.'))
    state = appendTranslationStreamDelta(state, delta('j1', 'content', '{"id":"a","translatedText":"你好","detectedLanguage":"en"}]}'))
    expect(state.reasoning).toBe('Step 1: analyze. Step 2: translate.')
    expect(state.content).toBe('{"items":[{"id":"a","translatedText":"你好","detectedLanguage":"en"}]}')
  })

  it('extracts every completed item from a full streaming document', () => {
    const accumulated =
      '{"items":[{"id":"a","translatedText":"你好","detectedLanguage":"en"},{"id":"b","translatedText":"再见","detectedLanguage":null}]}'
    const items = extractCompletedTranslationItems(accumulated)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ id: 'a', translatedText: '你好', detectedLanguage: 'en' })
    expect(items[1]).toMatchObject({ id: 'b', translatedText: '再见', detectedLanguage: null })
  })

  it('only returns items whose objects are fully closed', () => {
    const accumulated = '{"items":[{"id":"a","translatedText":"你好","detectedLanguage":"en"},{"id":"b","translatedText":"正在生'
    const items = extractCompletedTranslationItems(accumulated)
    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe('a')
  })

  it('tolerates escaped quotes and inner braces inside translated text', () => {
    const accumulated = '{"items":[{"id":"x","translatedText":"他说 \\"你好\\" 并 {0} 次","detectedLanguage":"en"}]}'
    const items = extractCompletedTranslationItems(accumulated)
    expect(items).toHaveLength(1)
    expect(items[0]?.translatedText).toBe('他说 "你好" 并 {0} 次')
  })

  it('ignores text without any object and malformed candidates', () => {
    expect(extractCompletedTranslationItems('')).toEqual([])
    expect(extractCompletedTranslationItems('data: {"choices":[]}')).toEqual([])
    expect(extractCompletedTranslationItems('{"items":[]}')).toEqual([])
  })

  it('skips objects that do not match the translation item shape', () => {
    const accumulated = '{"items":[{"x":1},{"id":"a","translatedText":"hello","detectedLanguage":"en"}]}'
    const items = extractCompletedTranslationItems(accumulated)
    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe('a')
  })
})
