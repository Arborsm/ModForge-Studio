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
    vi.resetModules()
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

  it('clears launcher image cache and invalidates launcher cover and scan caches', async () => {
    const firstCovers = { covers: [{ labelKey: '20599', imagePath: 'C:\\cache\\cover-1.webp' }] }
    const firstScan = { modsPath: 'C:\\Games\\Stardew Valley\\Mods', mods: [{ id: 'mod-20599' }] }
    const secondCovers = { covers: [] }
    const secondScan = { modsPath: 'C:\\Games\\Stardew Valley\\Mods', mods: [] }
    vi.mocked(invoke)
      .mockResolvedValueOnce(firstCovers)
      .mockResolvedValueOnce(firstScan)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(secondCovers)
      .mockResolvedValueOnce(secondScan)
    const { clearLauncherImageCache, loadLauncherLibraryCovers, scanLauncherLibrary } = await import('./desktop')

    await expect(loadLauncherLibraryCovers()).resolves.toEqual(firstCovers)
    await expect(scanLauncherLibrary({ modsPath: 'C:\\Games\\Stardew Valley\\Mods' })).resolves.toEqual(firstScan)
    await expect(clearLauncherImageCache()).resolves.toBeUndefined()
    await expect(loadLauncherLibraryCovers()).resolves.toEqual(secondCovers)
    await expect(scanLauncherLibrary({ modsPath: 'C:\\Games\\Stardew Valley\\Mods' })).resolves.toEqual(secondScan)

    expect(invoke).toHaveBeenNthCalledWith(1, 'load_launcher_library_covers', undefined)
    expect(invoke).toHaveBeenNthCalledWith(2, 'scan_launcher_library', {
      request: { modsPath: 'C:\\Games\\Stardew Valley\\Mods' },
    })
    expect(invoke).toHaveBeenNthCalledWith(3, 'clear_launcher_image_cache', undefined)
    expect(invoke).toHaveBeenNthCalledWith(4, 'load_launcher_library_covers', undefined)
    expect(invoke).toHaveBeenNthCalledWith(5, 'scan_launcher_library', {
      request: { modsPath: 'C:\\Games\\Stardew Valley\\Mods' },
    })
  })

  it('toggles backend debug logging through the desktop bridge', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined)
    const { setDesktopDebugLoggingEnabled } = await import('./desktop')

    await expect(setDesktopDebugLoggingEnabled(true)).resolves.toBeUndefined()
    expect(invoke).toHaveBeenCalledWith('set_debug_logging_enabled', {
      enabled: true,
    })
  })

  it('writes frontend log records through the desktop backend logging bridge', async () => {
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

    expect(invoke).toHaveBeenCalledWith('write_frontend_log', {
      request: {
        level: 'warning',
        message: 'Launcher settings save failed',
        file: undefined,
        keyValues: {
          source: 'launcher-settings',
        },
        line: undefined,
      },
    })
    expect(warnSpy).toHaveBeenCalledWith('Launcher settings save failed', {
      source: 'launcher-settings',
    })

    warnSpy.mockRestore()
  })
})
