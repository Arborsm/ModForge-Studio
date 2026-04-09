import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorCopy } from '../../../lib/editor-shell'
import type { LauncherSettings } from '../../../lib/desktop'
import { renderWithLocale } from '../../../test/renderWithLocale'
import { LauncherSettingsPage } from './LauncherSettingsPage'

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

describe('LauncherSettingsPage', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders launcher settings fields and toggles from localized copy', () => {
    const settingsState = createSettingsState()

    renderWithLocale(<LauncherSettingsPage settingsState={settingsState} />, 'zh-CN')

    expect(screen.getAllByRole('button', { name: copy.actions.saveSettings }).length).toBe(1)
    expect(screen.getByText(copy.fields.gamePath)).toBeTruthy()
    expect(screen.getByText(copy.fields.modsPath)).toBeTruthy()
    expect(screen.getByText(copy.fields.downloadPath)).toBeTruthy()
    expect(screen.getByText(copy.fields.nexusApiKey)).toBeTruthy()
    expect(screen.getByText(copy.fields.nexusCookie)).toBeTruthy()
    expect(screen.getByText(copy.toggles.autoInstallDownloads)).toBeTruthy()
    expect(screen.getByText(copy.toggles.keepDownloadedArchives)).toBeTruthy()
  })

  it('saves launcher settings through the provided settings state', () => {
    const settingsState = createSettingsState()

    renderWithLocale(<LauncherSettingsPage settingsState={settingsState} />, 'zh-CN')

    fireEvent.click(screen.getAllByRole('button', { name: copy.actions.saveSettings })[0])

    expect(settingsState.save).toHaveBeenCalledTimes(1)
  })
})
