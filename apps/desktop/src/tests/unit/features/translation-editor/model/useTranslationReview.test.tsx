import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import type { ReactNode } from 'react'
import { LocalizationProvider } from '@entities/localization'
import { LocaleProvider } from '@locales/provider'
import type { AiReviewIssue, AiReviewResult, LocalizationPort } from '@shared/contracts'
import { NotificationProvider, clearNotifications } from '@shared/ui/notifications'
import { useTranslationReview } from '@features/translation-editor/model/useTranslationReview'
import type { TranslationEntry } from '@features/translation-editor/model/translationEditor'

const entries: TranslationEntry[] = [
  { key: 'done', sourceText: 'Hello', targetText: '你好', status: 'translated', sourceTokens: [], targetTokens: [], missingTokens: [] },
  { key: 'missing', sourceText: 'Bye', targetText: '', status: 'missing', sourceTokens: [], targetTokens: [], missingTokens: [] },
]
const issue: AiReviewIssue = {
  id: 'issue',
  runId: 'run',
  unitKey: 'done',
  sourceHash: 'source',
  targetHash: 'target',
  severity: 'major',
  status: 'open',
  category: 'meaning',
  reason: 'Wrong meaning',
  suggestion: '您好',
  sourceSnapshot: 'Hello',
  targetSnapshot: '你好',
}
const result = (status: AiReviewIssue['status'] = 'open', runStatus: 'completed' | 'partial' = 'completed'): AiReviewResult => ({
  run: {
    id: 'run',
    scopeId: 'scope',
    sourceLocale: 'en',
    targetLocale: 'zh',
    engine: 'local',
    status: runStatus,
    summary: {
      checked: 1,
      passed: 0,
      warnings: 1,
      total: 1,
      minor: 0,
      major: 1,
      critical: 0,
      open: status === 'open' ? 1 : 0,
      ignored: status === 'ignored' ? 1 : 0,
      accepted: status === 'accepted' ? 1 : 0,
      stale: status === 'stale' ? 1 : 0,
    },
    createdAtMs: 1,
  },
  issues: [{ ...issue, status }],
  usageRecordState: 'unavailable',
})
function setup(updateResult: AiReviewResult = result('accepted')) {
  const reviewBatch = vi.fn(async () => result())
  const updateReviewIssues = vi.fn(async () => updateResult)
  const port = { reviewBatch, updateReviewIssues, cancelJob: vi.fn(async () => undefined) } as unknown as LocalizationPort
  const wrapper = ({ children }: { children: ReactNode }) => (
    <LocaleProvider locale="en-US">
      <NotificationProvider>
        <LocalizationProvider port={port}>{children}</LocalizationProvider>
      </NotificationProvider>
    </LocaleProvider>
  )
  const applySuggestions = vi.fn()
  const hook = renderHook(
    () =>
      useTranslationReview({
        activeEntry: entries[0],
        allEntries: entries,
        sourceLocale: 'en',
        targetLocale: 'zh',
        scopeId: 'scope',
        profileId: null,
        applySuggestions,
      }),
    { wrapper },
  )
  return { ...hook, reviewBatch, updateReviewIssues, applySuggestions }
}
afterEach(() => clearNotifications())
describe('useTranslationReview', () => {
  it('sends only translated entries for translated mode', async () => {
    const value = setup()
    await act(async () => value.result.current.run('translated', false))
    expect(value.reviewBatch).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'translated', runAi: false, items: [expect.objectContaining({ unitKey: 'done' })] }),
    )
  })
  it('applies a suggestion only after the backend accepts the current baseline', async () => {
    const value = setup(result('accepted'))
    await act(async () => value.result.current.run('current', false))
    await act(async () => value.result.current.update([{ issue, status: 'accepted' }]))
    expect(value.applySuggestions).toHaveBeenCalledWith(new Map([['done', '您好']]))
  })
  it('does not apply stale suggestions', async () => {
    const value = setup(result('stale'))
    await act(async () => value.result.current.run('current', false))
    await act(async () => value.result.current.update([{ issue, status: 'accepted' }]))
    expect(value.applySuggestions).not.toHaveBeenCalled()
    await waitFor(() => expect(value.result.current.result?.issues[0]?.status).toBe('stale'))
  })
})
