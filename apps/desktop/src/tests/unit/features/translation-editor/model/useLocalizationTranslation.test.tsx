import { act, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import type { ReactNode } from 'react'
import { LocalizationProvider } from '@entities/localization'
import { LocaleProvider } from '@locales/provider'
import type { LocalizationPort, LocalizationTranslateBatchRequest, LocalizationTranslateBatchResult } from '@shared/contracts'
import { clearNotifications, NotificationProvider } from '@shared/ui/notifications'
import {
  partitionTranslationAiResults,
  useLocalizationTranslation,
  type TranslationAiBaseline,
} from '@features/translation-editor/model/useLocalizationTranslation'
import type { TranslationEntry } from '@features/translation-editor/model/translationEditor'

const entry: TranslationEntry = {
  key: 'greeting',
  sourceText: 'Hello',
  targetText: '你好',
  status: 'translated',
  sourceTokens: [],
  targetTokens: [],
  missingTokens: [],
}

function createPort(translateBatch: LocalizationPort['translateBatch']): LocalizationPort {
  return {
    loadDefaultEngine: vi.fn(async () => ({ kind: 'generative-ai', profileId: 'profile' })),
    translateBatch,
    cancelJob: vi.fn(async () => undefined),
  } as unknown as LocalizationPort
}

function wrapper(port: LocalizationPort) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <LocaleProvider locale="en-US">
        <NotificationProvider>
          <LocalizationProvider port={port}>{children}</LocalizationProvider>
        </NotificationProvider>
      </LocaleProvider>
    )
  }
}

afterEach(() => act(() => clearNotifications()))

describe('useLocalizationTranslation', () => {
  it('allows only one active owner even when start is invoked twice synchronously', async () => {
    let release: ((result: LocalizationTranslateBatchResult) => void) | undefined
    const translateBatch = vi.fn((request: LocalizationTranslateBatchRequest) =>
      new Promise<LocalizationTranslateBatchResult>((resolve) => {
        release = resolve
      }).then((result) => ({ ...result, jobId: request.jobId })),
    )
    const port = createPort(translateBatch)
    const applyResults = vi.fn(() => [])
    const { result } = renderHook(
      () =>
        useLocalizationTranslation({
          activeEntry: entry,
          allEntries: [entry],
          sourceLocale: 'default',
          targetLocale: 'zh',
          contextKey: 'project\u0000default\u0000zh',
          engineRef: { kind: 'generative-ai', profileId: 'profile' },
          applyResults,
        }),
      { wrapper: wrapper(port) },
    )

    let first!: Promise<void>
    await act(async () => {
      first = result.current.run('current')
      await result.current.run('current')
    })
    await waitFor(() => expect(translateBatch).toHaveBeenCalledTimes(1))
    await act(async () => {
      release?.({
        jobId: 'ignored',
        engine: { kind: 'generative-ai', profileId: 'profile' },
        model: 'model',
        validationIssues: [{ itemId: 'greeting', category: 'user-terminology', sourceTerm: 'Hello', expectedTerm: '您好' }],
        usageRecordState: 'recorded',
        knowledgeTrace: { officialMatches: 0, globalGlossaryMatches: 0, projectGlossaryMatches: 0, translationMemoryMatches: 0 },
        knowledgeRevision: 'disabled',
        items: [{ id: 'greeting', translatedText: '您好', detectedLanguage: 'en', skippedSameLanguage: false }],
      })
      await first
    })
    expect(applyResults).toHaveBeenCalledTimes(1)
    expect(result.current.progress.warningKeys).toEqual(['greeting'])
    expect(result.current.progress.failedKeys).toEqual([])
  })

  it('partitions results changed after the request baseline as conflicts', () => {
    const values = new Map([
      ['greeting', '您好'],
      ['farewell', '再见'],
    ])
    const baselines = new Map<string, TranslationAiBaseline>([
      ['greeting', { sourceText: 'Hello', targetText: '你好' }],
      ['farewell', { sourceText: 'Goodbye', targetText: '' }],
    ])
    const current = [
      { ...entry, targetText: '用户修改' },
      { ...entry, key: 'farewell', sourceText: 'Goodbye', targetText: '', status: 'missing' as const },
    ]

    const partition = partitionTranslationAiResults(values, baselines, current)
    expect(partition.conflicts).toEqual(['greeting'])
    expect([...partition.applicable]).toEqual([['farewell', '再见']])
  })

  it('applies successful translations and separately reports a usage ledger failure', async () => {
    const translateBatch = vi.fn(
      async (request: LocalizationTranslateBatchRequest): Promise<LocalizationTranslateBatchResult> => ({
        jobId: request.jobId,
        engine: request.engine,
        model: 'model',
        validationIssues: [],
        usageRecordState: 'failed',
        knowledgeTrace: { officialMatches: 0, globalGlossaryMatches: 0, projectGlossaryMatches: 0, translationMemoryMatches: 0 },
        knowledgeRevision: 'disabled',
        items: [{ id: 'greeting', translatedText: '您好', detectedLanguage: 'en', skippedSameLanguage: false }],
      }),
    )
    const applyResults = vi.fn(() => [])
    const { result } = renderHook(
      () =>
        useLocalizationTranslation({
          activeEntry: entry,
          allEntries: [entry],
          sourceLocale: 'en',
          targetLocale: 'zh',
          contextKey: 'usage-failure',
          engineRef: { kind: 'generative-ai', profileId: 'profile' },
          applyResults,
        }),
      { wrapper: wrapper(createPort(translateBatch)) },
    )
    await act(() => result.current.run('current'))
    expect(applyResults).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Usage was not recorded')).toBeTruthy()
    expect(screen.queryByText('AI translation failed')).toBeNull()
  })
})
