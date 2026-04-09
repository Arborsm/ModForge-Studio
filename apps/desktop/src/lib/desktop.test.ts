import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'

const mockWindow = {
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  isFullscreen: vi.fn(),
  setFullscreen: vi.fn(),
}

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => mockWindow),
}))

describe('desktop window helpers', () => {
  beforeEach(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    mockWindow.isFullscreen.mockReset()
    mockWindow.setFullscreen.mockReset()
  })

  it('reads the current fullscreen state from the desktop host', async () => {
    const { isCurrentWindowFullscreen } = await import('./desktop')
    mockWindow.isFullscreen.mockResolvedValueOnce(true)

    await expect(isCurrentWindowFullscreen()).resolves.toBe(true)
    expect(mockWindow.isFullscreen).toHaveBeenCalledTimes(1)
  })

  it('toggles fullscreen based on the current state', async () => {
    const { toggleFullscreenCurrentWindow } = await import('./desktop')
    mockWindow.isFullscreen.mockResolvedValueOnce(false)
    mockWindow.setFullscreen.mockResolvedValueOnce(undefined)

    await toggleFullscreenCurrentWindow()

    expect(mockWindow.isFullscreen).toHaveBeenCalledTimes(1)
    expect(mockWindow.setFullscreen).toHaveBeenCalledWith(true)
  })
})

describe('launcher bridge helpers', () => {
  beforeEach(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    vi.mocked(invoke).mockReset()
  })

  it('loads launcher settings from tauri backend', async () => {
    const expected = {
      gamePath: 'C:\\Games\\Stardew Valley',
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
    }
    vi.mocked(invoke).mockResolvedValueOnce(expected)
    const { loadLauncherSettings } = await import('./desktop')

    await expect(loadLauncherSettings()).resolves.toEqual(expected)
    expect(invoke).toHaveBeenCalledWith('load_launcher_settings', undefined)
  })

  it('saves launcher settings and scans launcher library with request payload', async () => {
    const saved = {
      gamePath: 'C:\\Games\\Stardew Valley',
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
    }
    const scan = {
      modsPath: 'C:\\Games\\Stardew Valley\\Mods',
      mods: [],
    }
    vi.mocked(invoke).mockResolvedValueOnce(saved).mockResolvedValueOnce(scan)
    const { saveLauncherSettings, scanLauncherLibrary } = await import('./desktop')

    await expect(saveLauncherSettings(saved)).resolves.toEqual(saved)
    await expect(scanLauncherLibrary({ modsPath: saved.modsPath })).resolves.toEqual(scan)
    expect(invoke).toHaveBeenNthCalledWith(1, 'save_launcher_settings', {
      request: saved,
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'scan_launcher_library', {
      request: { modsPath: saved.modsPath },
    })
  })

  it('launches the game through the launcher bridge', async () => {
    const launched = {
      executablePath: 'C:\\Games\\Stardew Valley\\StardewModdingAPI.exe',
      target: 'smapi',
    }
    vi.mocked(invoke).mockResolvedValueOnce(launched)
    const { launchLauncherGame } = await import('./desktop')

    await expect(launchLauncherGame()).resolves.toEqual(launched)
    expect(invoke).toHaveBeenCalledWith('launch_launcher_game', undefined)
  })

  it('toggles backend debug logging through the desktop bridge', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined)
    const { setDesktopDebugLoggingEnabled } = await import('./desktop')

    await expect(setDesktopDebugLoggingEnabled(true)).resolves.toBeUndefined()
    expect(invoke).toHaveBeenCalledWith('set_debug_logging_enabled', {
      enabled: true,
    })
  })

  it('writes frontend log records through the existing Tauri log plugin command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined)
    const { writeFrontendLog } = await import('./desktop')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await expect(
      writeFrontendLog({
        level: 'warning',
        message: 'Launcher settings save failed',
        keyValues: {
          source: 'launcher-settings',
        },
      }),
    ).resolves.toBeUndefined()

    expect(invoke).toHaveBeenCalledWith('plugin:log|log', {
      level: 4,
      message: 'Launcher settings save failed',
      file: undefined,
      keyValues: {
        source: 'launcher-settings',
      },
      line: undefined,
      location: undefined,
    })
    expect(warnSpy).toHaveBeenCalledWith('Launcher settings save failed', {
      source: 'launcher-settings',
    })

    warnSpy.mockRestore()
  })
})
