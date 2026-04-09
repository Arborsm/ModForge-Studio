import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorCopy } from '../../../lib/editor-shell'
import type { LauncherSettings } from '../../../lib/desktop'
import { renderWithLocale } from '../../../test/renderWithLocale'
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
    ...overrides,
  }
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

  it('renders the launcher controls and localized copy', () => {
    const settingsState = createSettingsState()

    renderWithLocale(<LauncherSettingsForm settingsState={settingsState} />, 'zh-CN')

    expect(screen.getAllByRole('button', { name: copy.actions.saveSettings }).length).toBe(1)
    expect(screen.getByText(copy.fields.gamePath)).toBeTruthy()
    expect(screen.getByText(copy.fields.modsPath)).toBeTruthy()
    expect(screen.getByText(copy.fields.downloadPath)).toBeTruthy()
    expect(screen.getByText(copy.fields.nexusApiKey)).toBeTruthy()
    expect(screen.getByText(copy.fields.nexusCookie)).toBeTruthy()
    expect(screen.getByText(copy.toggles.autoInstallDownloads)).toBeTruthy()
    expect(screen.getByText(copy.toggles.keepDownloadedArchives)).toBeTruthy()
  })

  it('calls updateField and save through the provided settings state', () => {
    const settingsState = createSettingsState()

    renderWithLocale(<LauncherSettingsForm settingsState={settingsState} />, 'zh-CN')

    fireEvent.change(screen.getByLabelText(copy.fields.gamePath), { target: { value: 'C:\\Games' } })
    expect(settingsState.updateField).toHaveBeenCalledWith('gamePath', 'C:\\Games')

    fireEvent.click(screen.getAllByRole('button', { name: copy.actions.saveSettings })[0])
    expect(settingsState.save).toHaveBeenCalled()
  })
})
