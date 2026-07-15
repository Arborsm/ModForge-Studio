import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { AiUsageSection } from '@app/app-shell/settings/AiUsageSection'
import { LocalizationProvider } from '@entities/localization'
import type { AiUsageQuery, AiUsageRecord, AiUsageSummary, LocalizationPort } from '@shared/contracts'
import { clearNotifications, NotificationProvider } from '@shared/ui/notifications'
import { renderWithLocale } from '@test/renderWithLocale'

vi.mock('@app/providers/usePlatformPorts', () => ({
  usePlatformPorts: () => ({ dialog: { saveFile: vi.fn(async () => null) } }),
}))

const totals = {
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  reasoningTokens: 0,
  billedCharacters: 0,
  requestCharacters: 0,
  responseCharacters: 0,
  requests: 0,
  failures: 0,
  unavailableUsageRequests: 0,
}
const summary: AiUsageSummary = {
  totals,
  daily: [],
  diagnostics: {
    averageLatencyMs: 120,
    p95LatencyMs: 240,
    attemptSuccessRate: 1,
    jobs: 1,
    successfulJobs: 1,
    jobSuccessRate: 1,
    cacheEligibleRequests: 1,
    cacheHitRequests: 0,
    cacheHitRate: 0,
    tokenUnavailableRequests: 0,
    detailFromMs: 0,
    detailComplete: true,
    providerModels: [],
    failureCategories: [],
  },
}
const record = (index: number): AiUsageRecord => ({
  occurredAtMs: Date.now(),
  jobId: `job-${index}`,
  attempt: 1,
  pageSource: 'workbench-translation',
  operation: 'translate',
  engineKind: 'generative-ai',
  profileId: 'profile',
  provider: 'openai',
  model: 'model',
  scopeId: null,
  succeeded: true,
  latencyMs: 10,
  failureCategory: null,
  requestItems: 1,
  requestCharacters: 5,
  responseCharacters: 4,
  inputTokens: 2,
  outputTokens: 1,
  cachedTokens: 0,
  reasoningTokens: 0,
  billedCharacters: null,
  usageSource: 'provider-reported',
  jobSucceeded: true,
})

describe('AiUsageSection', () => {
  afterEach(() => act(() => clearNotifications()))

  it('passes filters and server page offsets to the usage ledger', async () => {
    const queryUsageSummary = vi.fn(async () => summary)
    const queryUsageRecords = vi.fn(async (query: AiUsageQuery) => ({
      total: 101,
      records: query.offset === 0 ? [record(0)] : [record(100)],
    }))
    const port = { queryUsageSummary, queryUsageRecords } as unknown as LocalizationPort
    renderWithLocale(
      <NotificationProvider>
        <LocalizationProvider port={port}>
          <AiUsageSection />
        </LocalizationProvider>
      </NotificationProvider>,
    )
    await waitFor(() => expect(queryUsageRecords).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /Engine: All/i }))
    fireEvent.click(screen.getByRole('option', { name: 'Generative AI' }))
    await waitFor(() =>
      expect(queryUsageRecords).toHaveBeenLastCalledWith(expect.objectContaining({ engineKind: 'generative-ai', offset: 0, limit: 100 })),
    )
    fireEvent.click(screen.getByRole('button', { name: /Operation: All/i }))
    fireEvent.click(screen.getByRole('option', { name: 'translate' }))
    await waitFor(() => expect(queryUsageRecords).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'translate', offset: 0 })))
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(queryUsageRecords).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 100, limit: 100 })))
    expect(await screen.findByText('101-101 of 101')).toBeTruthy()
  })

  it('does not publish an older usage query after filters change', async () => {
    const summaries: Array<(value: AiUsageSummary) => void> = []
    const pages: Array<(value: { total: number; records: AiUsageRecord[] }) => void> = []
    const queryUsageSummary = vi.fn(() => new Promise<AiUsageSummary>((resolve) => summaries.push(resolve)))
    const queryUsageRecords = vi.fn(() => new Promise<{ total: number; records: AiUsageRecord[] }>((resolve) => pages.push(resolve)))
    renderWithLocale(
      <NotificationProvider>
        <LocalizationProvider port={{ queryUsageSummary, queryUsageRecords } as unknown as LocalizationPort}>
          <AiUsageSection />
        </LocalizationProvider>
      </NotificationProvider>,
    )
    await waitFor(() => expect(queryUsageSummary).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: /Engine: All/i }))
    fireEvent.click(screen.getByRole('option', { name: 'Generative AI' }))
    await waitFor(() => expect(queryUsageSummary).toHaveBeenCalledTimes(2))
    await act(async () => {
      summaries[1]?.({ ...summary, totals: { ...totals, requests: 2 } })
      pages[1]?.({ total: 0, records: [] })
    })
    const requestTotal = () => within(document.querySelector('.settings-ai-usage-kpis')!).getByText('Requests').parentElement!
    expect(within(requestTotal()).getByText('2')).toBeTruthy()
    await act(async () => {
      summaries[0]?.({ ...summary, totals: { ...totals, requests: 1 } })
      pages[0]?.({ total: 0, records: [] })
    })
    expect(within(requestTotal()).getByText('2')).toBeTruthy()
  })
})
