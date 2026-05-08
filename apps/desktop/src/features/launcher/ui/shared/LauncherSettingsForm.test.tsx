import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorCopy } from '@locales/editor-shell'
import type { LauncherSettings } from '@platform/desktop'
import type { ReactElement } from 'react'
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
    nexusCookie: 'cookie',
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

  function renderWithLauncher(ui: ReactElement) {
    return renderWithLocale(<LauncherTestWrapper>{ui}</LauncherTestWrapper>, 'zh-CN')
  }

  it('renders the launcher controls and localized copy', () => {
    const settingsState = createSettingsState()

    renderWithLauncher(<LauncherSettingsForm settingsState={settingsState} />)

    expect(screen.getByText(copy.settings.pathsTitle)).toBeTruthy()
    expect(screen.getByText(copy.settings.nexusAccessTitle)).toBeTruthy()
    expect(screen.getByText(copy.settings.downloadBehaviorTitle)).toBeTruthy()
    expect(screen.queryByRole('button', { name: copy.actions.saveSettings })).toBeNull()
    expect(screen.getByText(copy.fields.gamePath)).toBeTruthy()
    expect(screen.getByText(copy.fields.modsPath)).toBeTruthy()
    expect(screen.getByText(copy.fields.downloadPath)).toBeTruthy()
    expect(screen.getByText(copy.fields.nexusApiKey)).toBeTruthy()
    expect(screen.getByText(copy.fields.nexusCookie)).toBeTruthy()
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

  it('uses settings-window control cards for launcher settings items', () => {
    renderWithLauncher(<LauncherSettingsForm settingsState={createSettingsState()} />)

    expect(screen.getByLabelText(copy.fields.gamePath).closest('.settings-window-control-card')).toBeTruthy()
    expect(screen.getByText(copy.fields.nexusApiKey).closest('.settings-window-control-card')).toBeTruthy()
    expect(screen.getByRole('switch', { name: copy.toggles.autoInstallDownloads }).closest('.settings-window-control-card')).toBeTruthy()
    expect(screen.getByRole('switch', { name: copy.toggles.keepDownloadedArchives }).closest('.settings-window-control-card')).toBeTruthy()
    expect(screen.getByRole('switch', { name: copy.toggles.autoCheckModUpdates }).closest('.settings-window-control-card')).toBeTruthy()
  })
})
