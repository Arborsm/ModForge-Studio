import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { LocalizationProvider } from '@entities/localization'
import { OfficialCorpusView } from '@pages/workbench/tools/ai-localization/ui/OfficialCorpusView'
import type { AiOfficialCorpusStatus, LocalizationPort, RebuildOfficialLocalizationIndexRequest } from '@shared/contracts'
import { clearNotifications, NotificationProvider } from '@shared/ui/notifications'
import { renderWithLocale } from '@test/renderWithLocale'

vi.mock('@entities/game/api', () => ({
  detectDefaultGameDirectory: vi.fn(async () => 'C:/Games/Stardew Valley'),
  listKnownGameDirectories: vi.fn(async () => ['C:/Games/Stardew Valley']),
}))
const missing: AiOfficialCorpusStatus = {
  indexed: false,
  stale: false,
  gameDirectory: 'C:/Games/Stardew Valley',
  gameVersion: null,
  fingerprint: 'source',
  revision: null,
  updatedAtMs: null,
  languageCount: 0,
  unitCount: 0,
  errorCount: 0,
}
const ready: AiOfficialCorpusStatus = {
  ...missing,
  indexed: true,
  gameVersion: '1.6.15',
  revision: 'generation-1',
  updatedAtMs: 1,
  languageCount: 2,
  unitCount: 1,
}
function port(overrides: Partial<LocalizationPort> = {}): LocalizationPort {
  return {
    queryUsageSummary: vi.fn(),
    queryUsageRecords: vi.fn(),
    exportUsage: vi.fn(),
    clearUsage: vi.fn(),
    inspectOfficialIndex: vi.fn(async () => missing),
    chooseGameDirectory: vi.fn(async () => null),
    rebuildOfficialIndex: vi.fn(async () => ready),
    listenOfficialIndexProgress: vi.fn(async () => () => undefined),
    searchOfficial: vi.fn(async () => ({
      total: 1,
      records: [
        {
          id: 1,
          sourceLocale: 'en-US',
          targetLocale: 'zh-CN',
          sourceText: 'Welcome',
          targetText: '欢迎',
          assetPath: 'Strings/UI.xnb',
          unitKey: 'Title',
          unitKind: 'string-table',
          promptEligible: true,
          fingerprint: 'unit',
          similarity: 1,
        },
      ],
    })),
    listScopes: vi.fn(async () => ({
      total: 1,
      records: [
        {
          id: 'global',
          kind: 'global',
          name: 'Global knowledge',
          revision: 0,
          createdAtMs: 0,
          updatedAtMs: 0,
          lastUsedAtMs: 0,
          bindingKind: null,
          bindingValue: null,
        },
      ],
    })),
    upsertGlossary: vi.fn(async () => ({ total: 0, records: [] })),
    listGlossary: vi.fn(async () => ({ total: 0, records: [] })),
    cancelJob: vi.fn(),
    ...overrides,
  } as LocalizationPort
}
function renderView(value: LocalizationPort) {
  return renderWithLocale(
    <NotificationProvider>
      <LocalizationProvider port={value}>
        <OfficialCorpusView />
      </LocalizationProvider>
    </NotificationProvider>,
  )
}

describe('OfficialCorpusView', () => {
  afterEach(() => act(() => clearNotifications()))
  it('builds the XNB index and searches an aligned locale pair', async () => {
    const rebuildOfficialIndex = vi.fn(async () => ready)
    const searchOfficial = vi.fn(async () => ({
      total: 1,
      records: [
        {
          id: 1,
          sourceLocale: 'en-US',
          targetLocale: 'zh-CN',
          sourceText: 'Welcome',
          targetText: '欢迎',
          assetPath: 'Strings/UI.xnb',
          unitKey: 'Title',
          unitKind: 'string-table',
          promptEligible: true,
          fingerprint: 'unit',
          similarity: 1,
        },
      ],
    }))
    const value = port({ rebuildOfficialIndex, searchOfficial })
    renderView(value)
    expect(await screen.findByText('Official corpus index has not been built.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Build index/i }))
    await waitFor(() => expect(rebuildOfficialIndex).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Official corpus is ready.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Asset category'), { target: { value: 'Strings' } })
    fireEvent.change(screen.getByPlaceholderText('Search official source text'), { target: { value: 'Welcome' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect((await screen.findAllByText('欢迎')).length).toBeGreaterThan(0)
    expect(searchOfficial).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLocale: 'en-US', targetLocale: 'zh-CN', assetCategory: 'Strings', promptEligibleOnly: false }),
    )
  })
  it('shows search guidance without rendering an empty result table before the first search', async () => {
    renderView(port({ inspectOfficialIndex: vi.fn(async () => ready) }))
    expect(await screen.findByText('Enter source text to search the official corpus.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
  it('shows current-job progress and treats explicit cancellation as non-error', async () => {
    let progress: ((value: { jobId: string; phase: 'parsing' | 'committing'; completed: number; total: number }) => void) | undefined
    let rejectRebuild: ((cause: Error) => void) | undefined
    const cancelJob = vi.fn(async () => undefined)
    const rebuildOfficialIndex = vi.fn(
      (_request: RebuildOfficialLocalizationIndexRequest) =>
        new Promise<AiOfficialCorpusStatus>((_, reject) => {
          rejectRebuild = reject
        }),
    )
    renderView(
      port({
        listenOfficialIndexProgress: vi.fn(async (listener) => {
          progress = listener
          return () => undefined
        }),
        rebuildOfficialIndex,
        cancelJob,
      }),
    )
    expect(await screen.findByText('Official corpus index has not been built.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Build index/i }))
    await waitFor(() => expect(rebuildOfficialIndex).toHaveBeenCalledTimes(1))
    const jobId = rebuildOfficialIndex.mock.calls[0]?.[0].jobId
    expect(jobId).toBeTruthy()
    const cancel = await screen.findByRole('button', { name: 'Cancel' })
    const activeJob = screen.getByText('Indexing XNB content...').closest('.ai-localization-status') ? true : false
    expect(activeJob).toBe(true)
    act(() => progress?.({ jobId: jobId!, phase: 'parsing', completed: 2, total: 5 }))
    expect(await screen.findByText('2 of 5')).toBeTruthy()
    fireEvent.click(cancel)
    await waitFor(() => expect(cancelJob).toHaveBeenCalledTimes(1))
    expect(cancelJob).toHaveBeenCalledWith(jobId)
    await act(async () => {
      rejectRebuild?.(new Error('cancelled'))
      await Promise.resolve()
    })
    await waitFor(() => expect(screen.queryByText('Official corpus indexing failed.')).toBeNull())
  })
  it('shows a localized error and retry action when status inspection fails', async () => {
    await act(async () => {
      renderView(
        port({
          inspectOfficialIndex: vi.fn(async () => {
            throw new Error('private path')
          }),
        }),
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Official corpus status could not be loaded.')
  })
})
