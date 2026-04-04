import { beforeEach, describe, expect, it, vi } from 'vitest'

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
