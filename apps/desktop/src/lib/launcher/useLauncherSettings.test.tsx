import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  chooseDirectory,
  detectDefaultGameDirectory,
  loadLauncherSettings,
  saveLauncherSettings,
  type LauncherSettings,
} from '../desktop'
import { useLauncherSettings } from './useLauncherSettings'

vi.mock('../desktop', async () => {
  const actual = await vi.importActual<typeof import('../desktop')>('../desktop')
  return {
    ...actual,
    chooseDirectory: vi.fn(),
    detectDefaultGameDirectory: vi.fn(),
    loadLauncherSettings: vi.fn(),
    saveLauncherSettings: vi.fn(),
  }
})

const loadLauncherSettingsMock = vi.mocked(loadLauncherSettings)
const detectDefaultGameDirectoryMock = vi.mocked(detectDefaultGameDirectory)
void vi.mocked(saveLauncherSettings)
void vi.mocked(chooseDirectory)

function createSettings(overrides: Partial<LauncherSettings> = {}): LauncherSettings {
  return {
    gamePath: null,
    modsPath: null,
    downloadPath: 'E:\\Downloads\\Mods',
    nexusApiKey: null,
    nexusCookie: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
    ...overrides,
  }
}

describe('useLauncherSettings', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('hydrates missing launcher paths from the detected game directory', async () => {
    loadLauncherSettingsMock.mockResolvedValue(createSettings())
    detectDefaultGameDirectoryMock.mockResolvedValue('E:\\Games\\Stardew Valley')

    const { result } = renderHook(() => useLauncherSettings())

    await waitFor(() => {
      expect(result.current.state).toBe('ready')
      expect(result.current.settings.gamePath).toBe('E:\\Games\\Stardew Valley')
      expect(result.current.settings.modsPath).toBe('E:\\Games\\Stardew Valley\\Mods')
    })
  })

  it('keeps persisted launcher paths when they are already configured', async () => {
    loadLauncherSettingsMock.mockResolvedValue(
      createSettings({
        gamePath: 'D:\\Portable\\Stardew Valley',
        modsPath: 'D:\\Portable\\Stardew Valley\\Mods',
      }),
    )
    detectDefaultGameDirectoryMock.mockResolvedValue('E:\\Games\\Stardew Valley')

    const { result } = renderHook(() => useLauncherSettings())

    await waitFor(() => {
      expect(result.current.state).toBe('ready')
      expect(result.current.settings.gamePath).toBe('D:\\Portable\\Stardew Valley')
      expect(result.current.settings.modsPath).toBe('D:\\Portable\\Stardew Valley\\Mods')
    })
  })
})
