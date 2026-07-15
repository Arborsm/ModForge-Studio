import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { SemanticSearchSection } from '@app/app-shell/settings/SemanticSearchSection'
import { LocalizationProvider } from '@entities/localization'
import type { AiSemanticProgress, AiSemanticSettingsSnapshot, DownloadAiSemanticModelRequest, LocalizationPort } from '@shared/contracts'
import { NotificationProvider } from '@shared/ui/notifications'
import { renderWithLocale } from '@test/renderWithLocale'

function renderSection(
  initialSettings: AiSemanticSettingsSnapshot = {
    mode: 'lexical',
    localModelDirectory: null,
    activeRemoteProfileId: null,
    remoteProfiles: [],
  },
) {
  let progressListener: ((value: AiSemanticProgress) => void) | undefined
  let rejectDownload: ((reason: Error) => void) | undefined
  const syncSemanticIndex = vi.fn(async () => ({
    available: true,
    retrievalMode: 'semantic' as const,
    generationId: 'generation',
    modelId: 'remote-model',
    dimensions: 384,
    officialRevision: 'official',
    knowledgeRevision: 'global:1',
    indexedRecords: 10,
    sourceRecords: 10,
    pendingRecords: 0,
    coveragePercentage: 100,
    stale: false,
  }))
  const probeSemanticSearch = vi.fn(async () => ({
    query: 'winter gift Abigail',
    retrievalMode: 'semantic' as const,
    elapsedMs: 24,
    totalCandidates: 1,
    warnings: [],
    records: [
      {
        sourceKind: 'official' as const,
        sourceId: '1',
        sourceText: 'Give Abigail a gift at the winter festival.',
        targetText: '在冬日星盛宴送给阿比盖尔一份礼物。',
        context: 'Data/Festivals/winter25 · Abigail',
        score: 0.91,
        semanticSimilarity: 0.93,
        lexicalSimilarity: 0.83,
        matchKind: 'semantic',
        retrievalMode: 'semantic' as const,
      },
    ],
  }))
  const downloadSemanticModel = vi.fn(
    (_request: DownloadAiSemanticModelRequest) =>
      new Promise<never>((_resolve, reject) => {
        rejectDownload = reject
      }),
  )
  const cancelJob = vi.fn(async () => undefined)
  const saveSemanticSettings = vi.fn(async () => initialSettings)
  const testSemanticRemoteProfile = vi.fn(async () => ({ model: 'text-embedding-3-small', dimensions: 384, latencyMs: 42 }))
  const verifySemanticModel = vi.fn(async () => ({
    mode: 'builtin' as const,
    modelId: 'intfloat/multilingual-e5-small',
    dimensions: 384,
    pooling: 'mean' as const,
    normalized: true as const,
    fingerprint: 'e5s·a3f8c2e1…9b04',
    verifiedAtMs: Date.now(),
    files: [
      { relativePath: 'model.onnx', sizeBytes: 312 * 1024 * 1024, sha256: 'a3f8c2e19b04d771aaaa' },
      { relativePath: 'tokenizer.json', sizeBytes: 2.1 * 1024 * 1024, sha256: 'bbbbccccddddeeee' },
    ],
  }))
  const port = {
    loadSemanticSettings: vi.fn(async () => initialSettings),
    saveSemanticSettings,
    inspectSemanticModel: vi.fn(async () => ({
      mode: initialSettings.mode === 'builtin' ? 'builtin' : 'lexical',
      available: true,
      downloaded: initialSettings.mode === 'builtin',
      modelId: initialSettings.mode === 'builtin' ? 'intfloat/multilingual-e5-small' : null,
      revision: initialSettings.mode === 'builtin' ? 'rev-1' : null,
      dimensions: initialSettings.mode === 'builtin' ? 384 : null,
      modelPath: null,
      cacheBytes: initialSettings.mode === 'builtin' ? 1024 : 0,
      unavailableReason: null,
    })),
    inspectSemanticIndex: vi.fn(async () => ({
      available: true,
      retrievalMode: 'partial',
      generationId: null,
      modelId: null,
      dimensions: null,
      officialRevision: 'official',
      knowledgeRevision: 'global:1',
      indexedRecords: 8,
      sourceRecords: 10,
      pendingRecords: 2,
      coveragePercentage: 80,
      stale: false,
    })),
    listenSemanticProgress: vi.fn(async (listener: (value: AiSemanticProgress) => void) => {
      progressListener = listener
      return () => undefined
    }),
    syncSemanticIndex,
    probeSemanticSearch,
    downloadSemanticModel,
    cancelJob,
    testSemanticRemoteProfile,
    verifySemanticModel,
  } as unknown as LocalizationPort
  renderWithLocale(
    <NotificationProvider>
      <LocalizationProvider port={port}>
        <SemanticSearchSection />
      </LocalizationProvider>
    </NotificationProvider>,
  )
  return {
    syncSemanticIndex,
    probeSemanticSearch,
    downloadSemanticModel,
    cancelJob,
    saveSemanticSettings,
    testSemanticRemoteProfile,
    verifySemanticModel,
    rejectDownload: (reason: Error) => rejectDownload?.(reason),
    emitProgress: (value: AiSemanticProgress) => progressListener?.(value),
  }
}

describe('SemanticSearchSection', () => {
  it('shows every optional mode, coverage, remote disclosure, and complete progress', async () => {
    const { syncSemanticIndex, probeSemanticSearch, emitProgress } = renderSection()
    expect(await screen.findByRole('radio', { name: /Lexical only/i })).toBeTruthy()
    expect(screen.getByText('80.0%')).toBeTruthy()
    expect(screen.getByText('Index coverage')).toBeTruthy()
    expect(screen.getAllByText(/8 \/ 10/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Indexed')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.getByText('Partial semantic retrieval')).toBeTruthy()
    expect(screen.queryByRole('progressbar', { name: 'Index coverage' })).toBeNull()
    expect(screen.getAllByRole('radio').map((option) => option.textContent)).toEqual([
      'Lexical onlyKeywords · zero setup',
      'Downloaded modelOn-device e5-small',
      'External ONNXYour folder',
      'Remote embeddingsCompatible API',
    ])
    fireEvent.click(screen.getByRole('radio', { name: /Remote embeddings/ }))
    expect(screen.getByText(/~10 rows/)).toBeTruthy()
    const sync = screen.getByRole('button', { name: 'Sync pending' })
    expect(sync).toBeDisabled()
    fireEvent.click(screen.getByRole('switch', { name: /Allow corpus upload/i }))
    expect(sync).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled()
    expect(syncSemanticIndex).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('radio', { name: /Downloaded model/ }))
    await act(async () =>
      emitProgress({
        jobId: 'job',
        modelId: 'model',
        kind: 'download',
        phase: 'downloading',
        currentFile: 'onnx/model.onnx',
        downloadedBytes: 1024,
        totalBytes: 4096,
        percentage: 25,
        bytesPerSecond: 512,
        fileIndex: 1,
        fileCount: 6,
      }),
    )
    await waitFor(() => expect(screen.getByText(/onnx\/model\.onnx · 1\.0 KB \/ 4\.0 KB/)).toBeTruthy())
    expect(screen.getByText(/Downloaded 1\.0 KB \/ 4\.0 KB · 25\.0% · 512 B\/s/)).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Try a sample query'), { target: { value: 'winter gift Abigail' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() =>
      expect(probeSemanticSearch).toHaveBeenCalledWith({
        query: 'winter gift Abigail',
        sourceLocale: 'en-US',
        targetLocale: 'zh-CN',
        limit: 10,
      }),
    )
    expect(await screen.findByText('Give Abigail a gift at the winter festival.')).toBeTruthy()
    expect(screen.getAllByText('Semantic retrieval · 1 candidates · 24 ms').length).toBeGreaterThanOrEqual(1)
  })

  it('keeps download progress and suppresses the expected cancellation error when paused', async () => {
    const { downloadSemanticModel, cancelJob, emitProgress, rejectDownload } = renderSection()
    await screen.findByRole('radio', { name: /Lexical only/i })
    fireEvent.click(screen.getByRole('radio', { name: /Downloaded model/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(downloadSemanticModel).toHaveBeenCalledTimes(1))

    const request = downloadSemanticModel.mock.calls[0]![0]
    await act(async () =>
      emitProgress({
        jobId: request.jobId,
        modelId: request.modelId,
        kind: 'download',
        phase: 'downloading',
        currentFile: 'onnx/model.onnx',
        downloadedBytes: 1024,
        totalBytes: 4096,
        percentage: 25,
        bytesPerSecond: 512,
        fileIndex: 1,
        fileCount: 6,
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    await waitFor(() => expect(cancelJob).toHaveBeenCalledWith(request.jobId))
    await act(async () => rejectDownload(new Error('AI_ERROR::cancelled')))

    expect((await screen.findAllByText('Paused')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText(/Pausing cancels the job and keeps \.part files/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/onnx\/model\.onnx · 1\.0 KB \/ 4\.0 KB/)).toBeTruthy()
    expect(screen.queryByText('AI_ERROR::cancelled')).toBeNull()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
  })

  it('keeps a saved remote key blank, reports its source, and requires saving before remote actions', async () => {
    const remoteSettings: AiSemanticSettingsSnapshot = {
      mode: 'remote-openai',
      localModelDirectory: null,
      activeRemoteProfileId: 'remote-profile',
      remoteProfiles: [
        {
          id: 'remote-profile',
          name: 'OpenAI embeddings',
          baseUrl: 'https://api.openai.com/v1',
          model: 'text-embedding-3-small',
          dimensions: 384,
          credentialEnvironment: 'OPENAI_API_KEY',
          keyConfigured: true,
          resolvedCredentialSource: 'keychain',
        },
      ],
    }
    const { saveSemanticSettings, testSemanticRemoteProfile } = renderSection(remoteSettings)
    expect(await screen.findByDisplayValue('OpenAI embeddings')).toBeTruthy()

    const keyInput = screen.getByPlaceholderText('Leave blank to keep the saved key') as HTMLInputElement
    expect(keyInput.value).toBe('')
    expect(screen.getByText('System keychain')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Test connection' })).not.toBeDisabled()

    fireEvent.change(screen.getByDisplayValue('OpenAI embeddings'), { target: { value: 'Updated embeddings' } })
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sync pending' })).toBeDisabled()
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    expect(testSemanticRemoteProfile).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Clear saved key' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save semantic settings' }))
    await waitFor(() =>
      expect(saveSemanticSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'remote-openai',
          remoteProfiles: [expect.objectContaining({ id: 'remote-profile', apiKey: '', clearApiKey: true })],
        }),
      ),
    )
  })

  it('shows verification progress toast and opens a result dialog', async () => {
    let resolveVerify: ((value: Awaited<ReturnType<typeof verifySemanticModel>>) => void) | undefined
    const { verifySemanticModel } = renderSection({
      mode: 'builtin',
      localModelDirectory: null,
      activeRemoteProfileId: null,
      remoteProfiles: [],
    })
    verifySemanticModel.mockImplementationOnce(
      () =>
        new Promise<Awaited<ReturnType<typeof verifySemanticModel>>>((resolve) => {
          resolveVerify = resolve
        }),
    )

    await screen.findByRole('radio', { name: /Downloaded model/i })
    fireEvent.click(screen.getByRole('button', { name: 'Verify integrity' }))
    expect(await screen.findByText('Verifying model integrity')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Verifying…' })).toBeDisabled()

    await act(async () => {
      resolveVerify?.({
        mode: 'builtin',
        modelId: 'intfloat/multilingual-e5-small',
        dimensions: 384,
        pooling: 'mean',
        normalized: true,
        fingerprint: 'e5s·a3f8c2e1…9b04',
        verifiedAtMs: Date.now(),
        files: [{ relativePath: 'model.onnx', sizeBytes: 1024, sha256: 'deadbeefdeadbeef' }],
      })
    })

    const dialog = await screen.findByRole('dialog', { name: 'Integrity verification result' })
    expect(dialog).toBeTruthy()
    expect(screen.getByText('model.onnx')).toBeTruthy()
    expect(screen.getByText('384')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Integrity verification result' })).toBeNull()
  })
})
