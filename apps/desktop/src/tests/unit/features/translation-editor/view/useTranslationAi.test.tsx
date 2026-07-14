import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import type { ReactNode } from 'react'
import { AiProvider } from '@entities/ai'
import { LocaleProvider } from '@locales/provider'
import type { AiPort, AiTranslateBatchRequest, AiTranslateBatchResult } from '@shared/contracts'
import { clearNotifications, NotificationProvider } from '@shared/ui/notifications'
import {
  partitionTranslationAiResults,
  useTranslationAi,
  type TranslationAiBaseline,
} from '@features/translation-editor/view/useTranslationAi'
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

function createPort(translateBatch: AiPort['translateBatch']): AiPort {
  return {
    loadSettings: vi.fn(async () => ({ version: 1, defaultProfileId: 'profile', profiles: [], presets: [] })),
    saveSettings: vi.fn(),
    listModels: vi.fn(),
    testProfile: vi.fn(),
    translateBatch,
    cancelJob: vi.fn(async () => undefined),
    listenToProgress: vi.fn(async () => () => undefined),
    readCache: vi.fn(),
    writeCache: vi.fn(),
    getCacheStats: vi.fn(),
    clearCache: vi.fn(),
  } as AiPort
}

function wrapper(port: AiPort) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <LocaleProvider locale="en-US">
        <NotificationProvider>
          <AiProvider port={port}>{children}</AiProvider>
        </NotificationProvider>
      </LocaleProvider>
    )
  }
}

afterEach(() => clearNotifications())

describe('useTranslationAi', () => {
  it('allows only one active owner even when start is invoked twice synchronously', async () => {
    let release: ((result: AiTranslateBatchResult) => void) | undefined
    const translateBatch = vi.fn((request: AiTranslateBatchRequest) =>
      new Promise<AiTranslateBatchResult>((resolve) => {
        release = resolve
      }).then((result) => ({ ...result, jobId: request.jobId })),
    )
    const port = createPort(translateBatch)
    const applyResults = vi.fn(() => [])
    const { result } = renderHook(
      () =>
        useTranslationAi({
          activeEntry: entry,
          allEntries: [entry],
          sourceLocale: 'default',
          targetLocale: 'zh',
          contextKey: 'project\u0000default\u0000zh',
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
    release?.({
      jobId: 'ignored',
      profileId: 'profile',
      model: 'model',
      items: [{ id: 'greeting', translatedText: '您好', detectedLanguage: 'en', skippedSameLanguage: false }],
    })
    await act(async () => first)
    expect(applyResults).toHaveBeenCalledTimes(1)
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
})
