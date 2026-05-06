import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  chooseDirectory,
  detectDefaultGameDirectory,
  loadLauncherSettings,
  saveLauncherSettings,
  type LauncherSettings,
} from '@platform/desktop'
import { reportAppEvent } from '@shared/lib/observability'
import { useLauncherSettings } from './useLauncherSettings'

vi.mock('@platform/desktop', async () => {
  const actual = await vi.importActual<typeof import('@platform/desktop')>('@platform/desktop')
  return {
    ...actual,
    chooseDirectory: vi.fn(),
    detectDefaultGameDirectory: vi.fn(),
    loadLauncherSettings: vi.fn(),
    saveLauncherSettings: vi.fn(),
  }
})

vi.mock('@shared/lib/observability', () => ({
  reportAppEvent: vi.fn(),
}))

const loadLauncherSettingsMock = vi.mocked(loadLauncherSettings)
const detectDefaultGameDirectoryMock = vi.mocked(detectDefaultGameDirectory)
const saveLauncherSettingsMock = vi.mocked(saveLauncherSettings)
void vi.mocked(chooseDirectory)
const reportAppEventMock = vi.mocked(reportAppEvent)

function createSettings(overrides: Partial<LauncherSettings> = {}): LauncherSettings {
  return {
    gamePath: null,
    modsPath: null,
    downloadPath: 'E:\\Downloads\\Mods',
    nexusApiKey: null,
    nexusCookie: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
    autoCheckModUpdates: true,
    ...overrides,
  } as LauncherSettings
}

describe('useLauncherSettings', () => {
  afterEach(() => {
    vi.useRealTimers()
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

    expect(reportAppEventMock).not.toHaveBeenCalled()
  })

  it('persists detected launcher paths after hydration so future sessions keep the scanned library root', async () => {
    loadLauncherSettingsMock.mockResolvedValue(createSettings())
    detectDefaultGameDirectoryMock.mockResolvedValue('D:\\Software\\Steam\\steamapps\\common\\Stardew Valley')
    saveLauncherSettingsMock.mockResolvedValue(
      createSettings({
        gamePath: 'D:\\Software\\Steam\\steamapps\\common\\Stardew Valley',
        modsPath: 'D:\\Software\\Steam\\steamapps\\common\\Stardew Valley\\Mods',
      }),
    )

    renderHook(() => useLauncherSettings())

    await waitFor(() => {
      expect(saveLauncherSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          gamePath: 'D:\\Software\\Steam\\steamapps\\common\\Stardew Valley',
          modsPath: 'D:\\Software\\Steam\\steamapps\\common\\Stardew Valley\\Mods',
        }),
      )
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

  it('publishes an error notification when launcher settings fail to load', async () => {
    loadLauncherSettingsMock.mockRejectedValue(new Error('Settings file not found'))
    detectDefaultGameDirectoryMock.mockResolvedValue(null)

    const { result } = renderHook(() => useLauncherSettings())

    await waitFor(() => {
      expect(result.current.state).toBe('error')
    })

    expect(reportAppEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
      }),
    )
  })

  it('publishes a success notification after launcher settings are saved', async () => {
    loadLauncherSettingsMock.mockResolvedValue(createSettings())
    detectDefaultGameDirectoryMock.mockResolvedValue(null)
    saveLauncherSettingsMock.mockResolvedValue(
      createSettings({
        gamePath: 'E:\\Games\\Stardew Valley',
      }),
    )

    const { result } = renderHook(() => useLauncherSettings())

    await waitFor(() => {
      expect(result.current.state).toBe('ready')
    })

    await act(async () => {
      await result.current.save()
    })

    expect(reportAppEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'success',
      }),
    )
  })

  it('publishes an error notification when launcher settings save fails', async () => {
    loadLauncherSettingsMock.mockResolvedValue(createSettings())
    detectDefaultGameDirectoryMock.mockResolvedValue(null)
    saveLauncherSettingsMock.mockRejectedValue(new Error('Write denied'))

    const { result } = renderHook(() => useLauncherSettings())

    await waitFor(() => {
      expect(result.current.state).toBe('ready')
    })

    let thrownError: unknown = null

    await act(async () => {
      try {
        await result.current.save()
      } catch (error) {
        thrownError = error
      }
    })

    expect(thrownError).toBeInstanceOf(Error)
    expect((thrownError as Error).message).toBe('Write denied')
    expect(result.current.state).toBe('error')
    expect(reportAppEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
      }),
    )
  })

  it('autosaves launcher settings after edits settle', async () => {
    loadLauncherSettingsMock.mockResolvedValue(createSettings())
    detectDefaultGameDirectoryMock.mockResolvedValue(null)
    saveLauncherSettingsMock.mockResolvedValue(
      createSettings({
        nexusCookie: 'session-cookie',
      }),
    )

    const { result } = renderHook(() => useLauncherSettings())

    await waitFor(() => {
      expect(result.current.state).toBe('ready')
    })

    vi.useFakeTimers()

    act(() => {
      result.current.updateField('nexusCookie', 'session-cookie')
    })

    expect(saveLauncherSettingsMock).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(699)
    })

    expect(saveLauncherSettingsMock).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(saveLauncherSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nexusCookie: 'session-cookie',
      }),
    )
  })

  it('autosaves launcher settings after the automatic update toggle changes', async () => {
    loadLauncherSettingsMock.mockResolvedValue(createSettings())
    detectDefaultGameDirectoryMock.mockResolvedValue(null)
    saveLauncherSettingsMock.mockResolvedValue(
      createSettings({
        autoCheckModUpdates: false,
      }),
    )

    const { result } = renderHook(() => useLauncherSettings())

    await waitFor(() => {
      expect(result.current.state).toBe('ready')
    })

    vi.useFakeTimers()

    act(() => {
      result.current.setSettings({
        ...(result.current.settings as LauncherSettings),
        autoCheckModUpdates: false,
      } as LauncherSettings)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700)
    })

    expect(saveLauncherSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        autoCheckModUpdates: false,
      }),
    )
  })
})
