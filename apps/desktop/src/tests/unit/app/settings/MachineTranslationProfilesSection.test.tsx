import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { MachineTranslationProfilesSection } from '@app/app-shell/settings/MachineTranslationProfilesSection'
import { LocalizationProvider } from '@entities/localization'
import type { LocalizationPort, MachineTranslationSettingsSnapshot, SaveMachineTranslationSettingsRequest } from '@shared/contracts'
import { clearNotifications, NotificationProvider } from '@shared/ui/notifications'
import { renderWithLocale } from '@test/renderWithLocale'

const snapshot: MachineTranslationSettingsSnapshot = {
  version: 1,
  defaultProfileId: 'deepl',
  profiles: [
    {
      id: 'deepl',
      name: 'DeepL',
      presetId: 'deepl-free',
      protocol: 'deepl',
      baseUrl: 'https://api-free.deepl.com',
      region: null,
      enabled: true,
      defaultSourceLocale: 'EN',
      defaultTargetLocale: 'ZH',
      credentialEnvironments: { 'api-key': 'DEEPL_AUTH_KEY' },
      credentialSources: { 'api-key': 'keychain' },
    },
  ],
  presets: [
    {
      id: 'deepl-free',
      name: 'DeepL API Free',
      protocol: 'deepl',
      baseUrl: 'https://api-free.deepl.com',
      credentialFields: ['api-key'],
      capability: {
        languagesDynamic: true,
        maxItemCharacters: 128000,
        maxBatchCharacters: 128000,
        supportsHtml: true,
        supportsGlossary: true,
        usageCapability: 'billed-characters',
        authentication: 'header',
      },
    },
  ],
}
function port() {
  const save = vi.fn(async (_request: SaveMachineTranslationSettingsRequest) => snapshot)
  const listLanguages = vi.fn(async () => [{ code: 'DE', name: 'German', supportsSource: true, supportsTarget: true }])
  const value = {
    loadMachineTranslationSettings: vi.fn(async () => snapshot),
    saveMachineTranslationSettings: save,
    listMachineTranslationLanguages: listLanguages,
    testMachineTranslationProfile: vi.fn(async () => ({ latencyMs: 12, detectedLanguage: 'EN' })),
  } as unknown as LocalizationPort
  return { value, save, listLanguages }
}
function renderSection(value: LocalizationPort) {
  return renderWithLocale(
    <NotificationProvider>
      <LocalizationProvider port={value}>
        <MachineTranslationProfilesSection requestLeave={(action) => action()} />
      </LocalizationProvider>
    </NotificationProvider>,
  )
}

describe('MachineTranslationProfilesSection', () => {
  afterEach(() => act(() => clearNotifications()))
  it('shows credential source without exposing the stored secret', async () => {
    const { value, save } = port()
    renderSection(value)
    const input = (await screen.findByLabelText(/API key/i)) as HTMLInputElement
    expect(input.value).toBe('')
    expect(screen.getAllByText(/System keychain/i).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Save profiles/i }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const request = save.mock.calls[0][0]
    expect(request.profiles[0].credentials).toEqual({})
  })
  it('loads dynamic languages only for the persisted profile', async () => {
    const { value, listLanguages } = port()
    renderSection(value)
    await screen.findByLabelText(/API key/i)
    fireEvent.click(screen.getByRole('button', { name: /Refresh languages/i }))
    await waitFor(() => expect(listLanguages).toHaveBeenCalledWith('deepl'))
    expect(await screen.findByText('DE')).toBeTruthy()
  })
  it('sends field-level clear state without the previous credential', async () => {
    const { value, save } = port()
    renderSection(value)
    await screen.findByLabelText(/API key/i)
    fireEvent.click(screen.getByRole('button', { name: /Clear saved key/i }))
    fireEvent.click(screen.getByRole('button', { name: /Save profiles/i }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    const request = save.mock.calls[0][0]
    expect(request.profiles[0].clearCredentials).toEqual(['api-key'])
    expect(request.profiles[0].credentials).toEqual({})
  })
  it('publishes sanitized connection failures', async () => {
    const { value } = port()
    value.testMachineTranslationProfile = vi.fn().mockRejectedValue(new Error('AI_ERROR::authentication::secret provider body'))
    renderSection(value)
    await screen.findByLabelText(/API key/i)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Test connection/i }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const toast = (await screen.findByText('AI connection test failed')).closest('.notification-toast')
    expect(toast?.textContent).not.toContain('secret provider body')
  })
  it('blocks invalid endpoints with a field-level alert', async () => {
    const { value, save } = port()
    renderSection(value)
    const endpoint = (await screen.findByDisplayValue('https://api-free.deepl.com')) as HTMLInputElement
    fireEvent.change(endpoint, { target: { value: 'http://remote.example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /Save profiles/i }))
    expect(await screen.findByText('Use HTTPS, or HTTP on localhost/loopback.')).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
  })
})
