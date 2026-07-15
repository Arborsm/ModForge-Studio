import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { AiSettingsPanel } from '@app/app-shell/settings/AiSettingsPanel'
import { PlatformContext } from '@app/providers/platformContext'
import { AiProvider } from '@entities/ai'
import { LocalizationProvider } from '@entities/localization'
import type { AiPort, AiSettingsSnapshot, LocalizationPort, PlatformPorts } from '@shared/contracts'
import { renderWithLocale } from '@test/renderWithLocale'
import { clearNotifications, NotificationProvider } from '@shared/ui/notifications'

const snapshot: AiSettingsSnapshot = {
  version: 1,
  defaultProfileId: 'openai-profile',
  profiles: [
    {
      id: 'openai-profile',
      name: 'OpenAI',
      presetId: 'openai',
      protocol: 'openai-responses',
      baseUrl: 'https://api.openai.com/v1',
      model: 'translation-model',
      credentialEnvironment: 'OPENAI_API_KEY',
      keyConfigured: true,
      resolvedCredentialSource: 'keychain',
    },
  ],
  presets: [
    {
      id: 'openai',
      name: 'OpenAI',
      protocol: 'openai-responses',
      baseUrl: 'https://api.openai.com/v1',
      credentialEnvironment: 'OPENAI_API_KEY',
      requiresApiKey: true,
      authentication: 'bearer',
      supportsModelListing: true,
      structuredOutput: 'json-schema',
    },
  ],
}

function createPort(): AiPort {
  return {
    loadSettings: vi.fn(async () => snapshot),
    saveSettings: vi.fn(async () => snapshot),
    listModels: vi.fn(async () => [{ id: 'translation-model', displayName: null }]),
    testProfile: vi.fn(async () => ({
      provider: 'openai',
      protocol: 'openai-responses',
      baseUrl: 'https://api.openai.com/v1',
      model: 'translation-model',
      latencyMs: 10,
      credentialSource: 'environment',
    })),
    exportProfiles: vi.fn(async () => 1),
    previewProfilesImport: vi.fn(async () => ({ formatVersion: 1, credentialsExcluded: true, entries: [] })),
    applyProfilesImport: vi.fn(async () => ({ settings: snapshot, imported: 0, overwritten: 0, copied: 0, skipped: 0 })),
    translateBatch: vi.fn(),
    cancelJob: vi.fn(),
    listenToProgress: vi.fn(),
    readCache: vi.fn(),
    writeCache: vi.fn(),
    getCacheStats: vi.fn(async () => ({ entryCount: 2, sizeBytes: 2048 })),
    clearCache: vi.fn(async () => ({ entryCount: 0, sizeBytes: 0 })),
  } as AiPort
}

describe('AiSettingsPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    act(() => clearNotifications())
  })

  const renderPanel = (port: AiPort, requestLeave: (action: () => void) => void = (action) => action()) =>
    renderWithLocale(
      <PlatformContext.Provider
        value={
          {
            dialog: {
              chooseFile: vi.fn(async () => null),
              saveFile: vi.fn(async () => null),
            },
          } as unknown as PlatformPorts
        }
      >
        <NotificationProvider>
          <LocalizationProvider
            port={
              {
                loadMachineTranslationSettings: vi.fn(async () => ({ version: 1, defaultProfileId: null, profiles: [], presets: [] })),
                loadDefaultEngine: vi.fn(async () => ({ kind: 'generative-ai' as const, profileId: 'openai-profile' })),
                saveDefaultEngine: vi.fn(),
                loadSemanticSettings: vi.fn(async () => ({
                  mode: 'lexical',
                  localModelDirectory: null,
                  activeRemoteProfileId: null,
                  remoteProfiles: [],
                })),
                inspectSemanticModel: vi.fn(async () => ({
                  mode: 'lexical',
                  available: true,
                  downloaded: false,
                  modelId: null,
                  revision: null,
                  dimensions: null,
                  modelPath: null,
                  cacheBytes: 0,
                  unavailableReason: null,
                })),
                inspectSemanticIndex: vi.fn(async () => ({
                  available: false,
                  retrievalMode: 'lexical',
                  generationId: null,
                  modelId: null,
                  dimensions: null,
                  officialRevision: null,
                  knowledgeRevision: null,
                  indexedRecords: 0,
                  sourceRecords: 0,
                  pendingRecords: 0,
                  coveragePercentage: 100,
                  stale: false,
                })),
                listenSemanticProgress: vi.fn(async () => () => undefined),
                queryUsageSummary: vi.fn(async () => ({
                  totals: {
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
                  },
                  daily: [],
                })),
                queryUsageRecords: vi.fn(async () => ({ records: [], total: 0 })),
              } as unknown as LocalizationPort
            }
          >
            <AiProvider port={port}>
              <AiSettingsPanel requestLeave={requestLeave} />
            </AiProvider>
          </LocalizationProvider>
        </NotificationProvider>
      </PlatformContext.Provider>,
    )

  const openGenerative = async () => {
    fireEvent.click(await screen.findByRole('tab', { name: 'Generative AI' }))
  }

  it('shows key status without ever filling the secret input', async () => {
    const port = createPort()
    renderPanel(port)
    await openGenerative()
    const secret = (await screen.findByLabelText(/API key/i)) as HTMLInputElement
    expect(secret.value).toBe('')
    expect(screen.getAllByText(/System keychain/i).length).toBeGreaterThan(0)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save profiles/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(port.saveSettings).toHaveBeenCalledTimes(1))
    const request = (port.saveSettings as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(request.profiles[0]).not.toHaveProperty('apiKey')
  })

  it('sends an explicit clear flag without exposing the old key', async () => {
    const port = createPort()
    renderPanel(port)
    await openGenerative()
    await screen.findByLabelText(/API key/i)
    // Form field and dock both expose clear; either path must persist clearApiKey.
    fireEvent.click(screen.getAllByRole('button', { name: /Clear saved key/i })[0]!)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save profiles/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(port.saveSettings).toHaveBeenCalledTimes(1))
    const profile = (port.saveSettings as ReturnType<typeof vi.fn>).mock.calls[0][0].profiles[0]
    expect(profile.clearApiKey).toBe(true)
    expect(profile.apiKey).toBe('')
  })

  it('publishes a sanitized, deduplicated notification when saving fails', async () => {
    const port = createPort()
    port.saveSettings = vi.fn().mockRejectedValue(new Error('AI_ERROR::authentication::provider included sensitive diagnostic detail'))
    renderPanel(port)
    await openGenerative()
    await screen.findByLabelText(/API key/i)
    const name = screen.getByLabelText(/Profile name/i) as HTMLInputElement
    fireEvent.change(name, { target: { value: 'Unsaved profile name' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save profiles/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const title = await screen.findByText('AI settings were not saved')
    const toast = title.closest('.notification-toast')
    expect(toast?.textContent).toContain('provider rejected the configured credential')
    expect(toast?.textContent).not.toContain('sensitive diagnostic detail')
    expect(name.value).toBe('Unsaved profile name')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save profiles/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(screen.getAllByText('AI settings were not saved')).toHaveLength(1))
  })

  it('uses a master-detail workspace and protects an edited draft when switching tabs', async () => {
    const otherProfile = {
      ...snapshot.profiles[0],
      id: 'other-profile',
      name: 'Local gateway',
      model: 'local-model',
      keyConfigured: false,
      resolvedCredentialSource: null,
    }
    const twoProfiles = { ...snapshot, profiles: [...snapshot.profiles, otherProfile] }
    const port = createPort()
    port.loadSettings = vi.fn(async () => twoProfiles)
    let pendingLeave: (() => void) | null = null
    const requestLeave = vi.fn((action: () => void) => {
      pendingLeave = action
    })
    renderPanel(port, requestLeave)
    await openGenerative()

    expect(screen.getByRole('complementary', { name: 'Profiles' })).toBeTruthy()
    expect(screen.getByLabelText(/Profile name/i)).toHaveValue('OpenAI')
    fireEvent.click(screen.getByRole('button', { name: /Local gateway/i }))
    expect(screen.getByLabelText(/Profile name/i)).toHaveValue('Local gateway')

    fireEvent.change(screen.getByLabelText(/Profile name/i), { target: { value: 'Edited local gateway' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Usage' }))
    expect(screen.getByRole('tab', { name: 'Generative AI' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText(/Profile name/i)).toHaveValue('Edited local gateway')
    expect(requestLeave).toHaveBeenCalledTimes(1)

    act(() => pendingLeave?.())
    expect(screen.getByRole('tab', { name: 'Usage' })).toHaveAttribute('aria-selected', 'true')
  })

  it('clears a discarded child-page draft after confirmed tab navigation', async () => {
    const requestLeave = vi.fn((action: () => void) => {
      action()
    })
    renderPanel(createPort(), requestLeave)

    fireEvent.click(await screen.findByRole('tab', { name: 'Semantic search' }))
    fireEvent.click(await screen.findByRole('radio', { name: /Downloaded model/i }))
    fireEvent.click(screen.getByRole('tab', { name: 'Usage' }))
    expect(screen.getByRole('tab', { name: 'Usage' })).toHaveAttribute('aria-selected', 'true')
    expect(requestLeave).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('tab', { name: 'Generative AI' }))
    expect(screen.getByRole('tab', { name: 'Generative AI' })).toHaveAttribute('aria-selected', 'true')
    expect(requestLeave).toHaveBeenCalledTimes(1)
  })

  it('keeps real create and import actions available in the first-run empty state', async () => {
    const port = createPort()
    port.loadSettings = vi.fn(async () => ({ ...snapshot, defaultProfileId: null, profiles: [] }))
    renderPanel(port)
    await openGenerative()

    expect(await screen.findByText('No AI provider profiles configured.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Import profiles' })).toBeEnabled()
    const addButton = screen.getByRole('button', { name: 'Add profile' })
    fireEvent.click(addButton)
    expect(await screen.findByLabelText(/Profile name/i)).toHaveValue('OpenAI')
  })

  it('keeps provider profiles usable when cache statistics fail', async () => {
    const port = createPort()
    port.getCacheStats = vi.fn().mockRejectedValue(new Error('AI_ERROR::cache::database is locked'))
    renderPanel(port)
    await openGenerative()

    expect(await screen.findByLabelText(/API key/i)).toBeTruthy()
    expect(screen.getByText(/local translation cache could not be read/i)).toBeTruthy()
  })

  it('does not publish a late action failure after the panel unmounts', async () => {
    let rejectSave!: (cause: Error) => void
    const port = createPort()
    port.saveSettings = vi.fn(
      () =>
        new Promise<AiSettingsSnapshot>((_resolve, reject) => {
          rejectSave = reject
        }),
    )
    const rendered = renderPanel(port)
    await openGenerative()
    await screen.findByLabelText(/API key/i)

    fireEvent.click(screen.getByRole('button', { name: /Save profiles/i }))
    await waitFor(() => expect(port.saveSettings).toHaveBeenCalledTimes(1))
    rendered.unmount()
    rejectSave(new Error('AI_ERROR::authentication::late failure'))

    await Promise.resolve()
    expect(screen.queryByText('AI settings were not saved')).toBeNull()
  })
})
