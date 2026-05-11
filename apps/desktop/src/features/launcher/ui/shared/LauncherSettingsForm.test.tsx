import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorCopy } from '@locales/editor-shell'
import type { LauncherSettings } from '@platform/desktop'
import type { ReactElement } from 'react'
import { createMockLauncherPort } from '@test/launcherTestPort'
import { LauncherTestWrapper } from '@test/launcherTestWrapper.tsx'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import { LauncherSettingsForm } from './LauncherSettingsForm'

const copy = editorCopy['zh-CN'].launcher

function createSettings(overrides: Partial<LauncherSettings> = {}): LauncherSettings {
  return {
    gamePath: 'E:\\Games\\Stardew Valley',
    modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    downloadPath: 'E:\\Downloads\\Stardew',
    nexusApiKey: 'api-key',
    autoInstallDownloads: true,
    keepDownloadedArchives: false,
    autoCheckModUpdates: true,
    ...overrides,
  } as LauncherSettings
}

function createSettingsState(settings: LauncherSettings = createSettings()) {
  return {
    settings,
    state: 'ready' as const,
    error: null,
    saveMessage: null,
    setSettings: vi.fn(),
    updateField: vi.fn(),
    save: vi.fn(async () => settings),
    refresh: vi.fn(async () => {}),
    pickDirectory: vi.fn(async () => null),
  }
}

describe('LauncherSettingsForm', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  function renderWithLauncher(ui: ReactElement, port = createMockLauncherPort()) {
    return renderWithLocale(<LauncherTestWrapper port={port}>{ui}</LauncherTestWrapper>, 'zh-CN')
  }

  it('renders the launcher controls and localized copy', async () => {
    const settingsState = createSettingsState()

    renderWithLauncher(<LauncherSettingsForm settingsState={settingsState} />)

    expect(screen.getByText(copy.settings.pathsTitle)).toBeTruthy()
    expect(screen.getByText(copy.settings.nexusAccessTitle)).toBeTruthy()
    expect(screen.getByText(copy.settings.downloadBehaviorTitle)).toBeTruthy()
    expect(screen.queryByRole('button', { name: copy.actions.saveSettings })).toBeNull()
    expect(screen.getByText(copy.fields.gamePath)).toBeTruthy()
    expect(screen.getByText(copy.fields.modsPath)).toBeTruthy()
    expect(screen.getByText(copy.fields.downloadPath)).toBeTruthy()
    expect(screen.getByDisplayValue('api-key')).toBeTruthy()
    expect(await screen.findByText(copy.diagnostics.sectionTitle)).toBeTruthy()
    expect(screen.getByText(copy.toggles.autoInstallDownloads)).toBeTruthy()
    expect(screen.getByText(copy.toggles.keepDownloadedArchives)).toBeTruthy()
    expect(screen.getByText(copy.toggles.autoCheckModUpdates)).toBeTruthy()
  })

  it('calls updateField and save through the provided settings state', () => {
    const settingsState = createSettingsState()

    renderWithLauncher(<LauncherSettingsForm settingsState={settingsState} />)

    fireEvent.change(screen.getByLabelText(copy.fields.gamePath), { target: { value: 'C:\\Games' } })
    expect(settingsState.updateField).toHaveBeenCalledWith('gamePath', 'C:\\Games')

    fireEvent.click(screen.getByRole('switch', { name: copy.toggles.autoCheckModUpdates }))
    expect(settingsState.updateField).toHaveBeenCalledWith('autoCheckModUpdates', false)
  })

  it('uses settings-window control cards for launcher settings items', async () => {
    renderWithLauncher(<LauncherSettingsForm settingsState={createSettingsState()} />)

    expect(screen.getByLabelText(copy.fields.gamePath).closest('.settings-window-control-card')).toBeTruthy()
    expect(screen.getByDisplayValue('api-key').closest('.settings-window-control-card')).toBeTruthy()
    expect(screen.getByRole('switch', { name: copy.toggles.autoInstallDownloads }).closest('.settings-window-control-card')).toBeTruthy()
    expect(screen.getByRole('switch', { name: copy.toggles.keepDownloadedArchives }).closest('.settings-window-control-card')).toBeTruthy()
    expect(screen.getByRole('switch', { name: copy.toggles.autoCheckModUpdates }).closest('.settings-window-control-card')).toBeTruthy()
    expect(await screen.findByText('Nexus Public GraphQL')).toBeTruthy()
  })

  it('renders path fields as full-width rows and keeps a visible download path value', () => {
    renderWithLauncher(
      <LauncherSettingsForm
        settingsState={createSettingsState(
          createSettings({
            downloadPath: 'C:\\Users\\Example\\Downloads\\ModForge Studio',
          }),
        )}
        showDiagnostics={false}
      />,
    )

    expect(screen.getByLabelText(copy.fields.gamePath).closest('.launcher-settings-control-card-wide')).toBeTruthy()
    expect(screen.getByLabelText(copy.fields.modsPath).closest('.launcher-settings-control-card-wide')).toBeTruthy()
    expect(screen.getByLabelText(copy.fields.downloadPath).closest('.launcher-settings-control-card-wide')).toBeTruthy()
    expect(screen.getByDisplayValue('C:\\Users\\Example\\Downloads\\ModForge Studio')).toBeTruthy()
  })

  it('loads Nexus route diagnostics from the launcher port in settings', async () => {
    const launcherPort = createMockLauncherPort()

    renderWithLauncher(<LauncherSettingsForm settingsState={createSettingsState()} />, launcherPort)

    expect(await screen.findByText('Nexus Public GraphQL')).toBeTruthy()
    expect(launcherPort.loadNexusDiagnostics).toHaveBeenCalledTimes(1)
  })

  it('shows localized recovery guidance when Nexus API key validation fails', async () => {
    const launcherPort = createMockLauncherPort({
      validateNexusApiKey: vi.fn().mockRejectedValue(new Error('Invalid API Key: HTTP 401')),
    })

    renderWithLauncher(<LauncherSettingsForm settingsState={createSettingsState()} />, launcherPort)

    expect(await screen.findByText('API Key 无法使用')).toBeTruthy()
    expect(screen.getByText('请检查保存的 Nexus API Key，或重新通过 Nexus 登录连接账号。')).toBeTruthy()
    expect(screen.queryByText('Invalid API Key: HTTP 401')).toBeNull()
  })

  it('can render without the route diagnostics block when embedded in the Configuration page', () => {
    const launcherPort = createMockLauncherPort()

    renderWithLauncher(<LauncherSettingsForm settingsState={createSettingsState()} showDiagnostics={false} />, launcherPort)

    expect(screen.queryByText(copy.diagnostics.sectionTitle)).toBeNull()
    expect(screen.queryByText('Nexus Public GraphQL')).toBeNull()
    expect(launcherPort.loadNexusDiagnostics).not.toHaveBeenCalled()
  })
})
