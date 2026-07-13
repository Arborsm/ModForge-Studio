import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { editorCopy } from '@locales/api'
import type { LauncherSettings } from '@features/launcher/api'
import type { ReactElement } from 'react'
import { createMockLauncherPort } from '@test/launcherTestPort'
import { LauncherTestWrapper } from '@test/launcherTestWrapper.tsx'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import { LauncherSettingsForm } from '@features/launcher/ui/shared/LauncherSettingsForm'

const copy = editorCopy['zh-CN'].launcher
const controlsCopy = editorCopy['zh-CN'].controls

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

  it('routes field, toggle, browse, and open actions through the provided ports', () => {
    const settingsState = createSettingsState()
    const launcherPort = createMockLauncherPort({ openPath: vi.fn().mockResolvedValue(undefined) })

    renderWithLauncher(<LauncherSettingsForm settingsState={settingsState} showDiagnostics={false} showApiStatus={false} />, launcherPort)

    fireEvent.change(screen.getByLabelText(copy.fields.gamePath), { target: { value: 'C:\\Games' } })
    expect(settingsState.updateField).toHaveBeenCalledWith('gamePath', 'C:\\Games')

    fireEvent.click(screen.getByRole('switch', { name: copy.toggles.autoCheckModUpdates }))
    expect(settingsState.updateField).toHaveBeenCalledWith('autoCheckModUpdates', false)

    fireEvent.click(screen.getAllByRole('button', { name: controlsCopy.browse })[0]!)
    expect(settingsState.pickDirectory).toHaveBeenCalledWith('gamePath', copy.fields.gamePath)

    fireEvent.click(screen.getAllByRole('button', { name: copy.actions.openFolder })[0]!)
    expect(launcherPort.openPath).toHaveBeenCalledWith({ path: 'E:\\Games\\Stardew Valley' })
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

    renderWithLauncher(
      <LauncherSettingsForm settingsState={createSettingsState()} showDiagnostics={false} showApiStatus={false} />,
      launcherPort,
    )

    expect(screen.queryByText(copy.diagnostics.sectionTitle)).toBeNull()
    expect(screen.queryByText('Nexus Public GraphQL')).toBeNull()
    expect(launcherPort.loadNexusDiagnostics).not.toHaveBeenCalled()
  })
})
