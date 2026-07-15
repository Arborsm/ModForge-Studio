import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { LocalizationProvider } from '@entities/localization'
import { ProjectUsageView } from '@pages/workbench/tools/ai-localization/ui/ProjectUsageView'
import { QualityHistoryView } from '@pages/workbench/tools/ai-localization/ui/QualityHistoryView'
import type { AiLocalizationScope, AiReviewRun, LocalizationPort } from '@shared/contracts'
import { clearNotifications, NotificationProvider } from '@shared/ui/notifications'
import { renderWithLocale } from '@test/renderWithLocale'

const scope: AiLocalizationScope = {
  id: 'scope',
  kind: 'project',
  name: 'Test project',
  revision: 1,
  createdAtMs: 1,
  updatedAtMs: 1,
  lastUsedAtMs: 1,
  bindingKind: 'project-unique-id',
  bindingValue: 'test.project',
}
const settings = {
  scopeId: scope.id,
  defaultEngineKind: null,
  defaultEngineProfileId: null,
  reviewProfileId: null,
  knowledgePolicy: { enabled: true, useOfficialCorpus: true, useGlobalKnowledge: true, useProjectKnowledge: true },
  autoReview: false,
  qaConfig: { checkEmpty: true, checkLanguageMix: true, checkWhitespace: true, checkLineBreaks: true, checkLength: true },
}
const summary = {
  checked: 1,
  passed: 1,
  warnings: 0,
  total: 0,
  minor: 0,
  major: 0,
  critical: 0,
  open: 0,
  ignored: 0,
  accepted: 0,
  stale: 0,
}
const run = (offset: number): AiReviewRun => ({
  id: `run-${offset}`,
  scopeId: scope.id,
  sourceLocale: 'en-US',
  targetLocale: 'zh-CN',
  engine: 'local',
  status: 'completed',
  summary,
  createdAtMs: offset + 1,
})
const usageTotals = {
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

function renderView(view: React.ReactNode, port: LocalizationPort) {
  return renderWithLocale(
    <NotificationProvider>
      <LocalizationProvider port={port}>{view}</LocalizationProvider>
    </NotificationProvider>,
  )
}

describe('AI localization history and project usage', () => {
  afterEach(() => act(() => clearNotifications()))

  it('requests review history with server page offsets', async () => {
    const listReviewRuns = vi.fn(async ({ offset }: { offset: number }) => ({ records: [run(offset)], total: 21 }))
    const port = {
      listScopes: vi.fn(async () => ({ records: [scope], total: 1 })),
      listReviewRuns,
      loadReviewRun: vi.fn(async (id: string) => ({ run: run(Number(id.split('-')[1])), issues: [], usageRecordState: 'unavailable' })),
      loadScope: vi.fn(async () => ({ scope, settings })),
      saveScopeSettings: vi.fn(),
    } as unknown as LocalizationPort
    renderView(<QualityHistoryView />, port)
    fireEvent.click(await screen.findByRole('button', { name: 'Review history' }))
    await waitFor(() => expect(listReviewRuns).toHaveBeenCalledWith({ scopeId: 'scope', offset: 0, limit: 20 }))
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(listReviewRuns).toHaveBeenLastCalledWith({ scopeId: 'scope', offset: 20, limit: 20 }))
  })

  it('retries a scoped usage query from the error notification', async () => {
    const queryUsageSummary = vi
      .fn()
      .mockRejectedValueOnce(new Error('ledger unavailable'))
      .mockResolvedValue({ totals: usageTotals, daily: [] })
    const queryUsageRecords = vi.fn(async () => ({ records: [], total: 0 }))
    const port = {
      listScopes: vi.fn(async () => ({ records: [scope], total: 1 })),
      queryUsageSummary,
      queryUsageRecords,
    } as unknown as LocalizationPort
    renderView(<ProjectUsageView />, port)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(queryUsageSummary).toHaveBeenCalledTimes(2))
    expect(queryUsageRecords).toHaveBeenLastCalledWith(expect.objectContaining({ scopeId: 'scope', model: null }))
  })
})
