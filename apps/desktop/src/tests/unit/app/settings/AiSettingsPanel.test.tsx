import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { AiSettingsPanel } from '@app/app-shell/settings/AiSettingsPanel'
import { AiProvider } from '@entities/ai'
import { LocalizationProvider } from '@entities/localization'
import type { AiPort, AiSettingsSnapshot, LocalizationPort } from '@shared/contracts'
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
    testProfile: vi.fn(async () => ({ model: 'translation-model', latencyMs: 10 })),
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
  afterEach(() => act(() => clearNotifications()))

  const renderPanel = (port: AiPort) =>
    renderWithLocale(
      <NotificationProvider>
        <LocalizationProvider
          port={
            {
              loadMachineTranslationSettings: vi.fn(async () => ({ version: 1, defaultProfileId: null, profiles: [], presets: [] })),
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
            <AiSettingsPanel />
          </AiProvider>
        </LocalizationProvider>
      </NotificationProvider>,
    )

  it('shows key status without ever filling the secret input', async () => {
    const port = createPort()
    renderPanel(port)
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
    await screen.findByLabelText(/API key/i)
    fireEvent.click(screen.getByRole('button', { name: /Clear saved key/i }))
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
    await screen.findByLabelText(/API key/i)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save profiles/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const title = await screen.findByText('AI settings were not saved')
    const toast = title.closest('.notification-toast')
    expect(toast?.textContent).toContain('provider rejected the configured credential')
    expect(toast?.textContent).not.toContain('sensitive diagnostic detail')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save profiles/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(screen.getAllByText('AI settings were not saved')).toHaveLength(1))
  })

  it('keeps provider profiles usable when cache statistics fail', async () => {
    const port = createPort()
    port.getCacheStats = vi.fn().mockRejectedValue(new Error('AI_ERROR::cache::database is locked'))
    renderPanel(port)

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
    await screen.findByLabelText(/API key/i)

    fireEvent.click(screen.getByRole('button', { name: /Save profiles/i }))
    await waitFor(() => expect(port.saveSettings).toHaveBeenCalledTimes(1))
    rendered.unmount()
    rejectSave(new Error('AI_ERROR::authentication::late failure'))

    await Promise.resolve()
    expect(screen.queryByText('AI settings were not saved')).toBeNull()
  })
})
