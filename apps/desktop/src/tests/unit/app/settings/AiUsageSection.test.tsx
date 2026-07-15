import { act, fireEvent, screen, waitFor } from '@testing-library/react'
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
const summary: AiUsageSummary = { totals, daily: [] }
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
    fireEvent.change(screen.getByLabelText('Engine'), { target: { value: 'generative-ai' } })
    await waitFor(() =>
      expect(queryUsageRecords).toHaveBeenLastCalledWith(expect.objectContaining({ engineKind: 'generative-ai', offset: 0, limit: 100 })),
    )
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'model' } })
    await waitFor(() => expect(queryUsageRecords).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'model', offset: 0 })))
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(queryUsageRecords).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 100, limit: 100 })))
    expect(await screen.findByText('101-101 of 101')).toBeTruthy()
  })
})
