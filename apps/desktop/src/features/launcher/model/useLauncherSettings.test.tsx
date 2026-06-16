import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LauncherSettings } from '@features/launcher/api'
import { reportAppEvent } from '@shared/lib/observability'
import { useLauncherSettings } from '@features/launcher'
import { LauncherTestWrapper } from '@test/launcherTestWrapper.tsx'
import { createMockLauncherPort } from '@test/launcherTestPort'
import type { LauncherPort } from './launcherPort'

vi.mock('@shared/lib/observability', () => ({
  reportAppEvent: vi.fn(),
}))

const reportAppEventMock = vi.mocked(reportAppEvent)

function createSettings(overrides: Partial<LauncherSettings> = {}): LauncherSettings {
  return {
    gamePath: null,
    modsPath: null,
    downloadPath: 'E:\\Downloads\\Mods',
    nexusApiKey: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
    autoCheckModUpdates: true,
    ...overrides,
  } as LauncherSettings
}

function createWrapper(port: LauncherPort) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <LauncherTestWrapper port={port}>{children}</LauncherTestWrapper>
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

describe('useLauncherSettings', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('hydrates missing launcher paths from the detected game directory', async () => {
    const port = createMockLauncherPort({
      loadSettings: vi.fn().mockResolvedValue(createSettings()),
      detectDefaultGameDirectory: vi.fn().mockResolvedValue('E:\\Games\\Stardew Valley'),
    })

    const { result } = renderHook(() => useLauncherSettings(), { wrapper: createWrapper(port) })
    await waitFor(() => {
      expect(result.current.state).toBe('ready')
      expect(result.current.settings.gamePath).toBe('E:\\Games\\Stardew Valley')
      expect(result.current.settings.modsPath).toBe('E:\\Games\\Stardew Valley\\Mods')
    })

    expect(reportAppEventMock).not.toHaveBeenCalled()
  })

  it('persists detected launcher paths after hydration so future sessions keep the scanned library root', async () => {
    const port = createMockLauncherPort({
      loadSettings: vi.fn().mockResolvedValue(createSettings()),
      detectDefaultGameDirectory: vi.fn().mockResolvedValue('D:\\Software\\Steam\\steamapps\\common\\Stardew Valley'),
      saveSettings: vi.fn().mockResolvedValue(
        createSettings({
          gamePath: 'D:\\Software\\Steam\\steamapps\\common\\Stardew Valley',
          modsPath: 'D:\\Software\\Steam\\steamapps\\common\\Stardew Valley\\Mods',
        }),
      ),
    })

    renderHook(() => useLauncherSettings(), { wrapper: createWrapper(port) })
    await waitFor(() => {
      expect(port.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          gamePath: 'D:\\Software\\Steam\\steamapps\\common\\Stardew Valley',
          modsPath: 'D:\\Software\\Steam\\steamapps\\common\\Stardew Valley\\Mods',
        }),
      )
    })
  })

  it('keeps persisted launcher paths when they are already configured', async () => {
    const port = createMockLauncherPort({
      loadSettings: vi.fn().mockResolvedValue(
        createSettings({
          gamePath: 'D:\\Portable\\Stardew Valley',
          modsPath: 'D:\\Portable\\Stardew Valley\\Mods',
        }),
      ),
      detectDefaultGameDirectory: vi.fn().mockResolvedValue('E:\\Games\\Stardew Valley'),
    })

    const { result } = renderHook(() => useLauncherSettings(), { wrapper: createWrapper(port) })
    await waitFor(() => {
      expect(result.current.state).toBe('ready')
      expect(result.current.settings.gamePath).toBe('D:\\Portable\\Stardew Valley')
      expect(result.current.settings.modsPath).toBe('D:\\Portable\\Stardew Valley\\Mods')
    })
  })

  it('publishes an error notification when launcher settings fail to load', async () => {
    const port = createMockLauncherPort({
      loadSettings: vi.fn().mockRejectedValue(new Error('Settings file not found')),
      detectDefaultGameDirectory: vi.fn().mockResolvedValue(null),
    })

    const { result } = renderHook(() => useLauncherSettings(), { wrapper: createWrapper(port) })
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
    const port = createMockLauncherPort({
      loadSettings: vi.fn().mockResolvedValue(createSettings()),
      detectDefaultGameDirectory: vi.fn().mockResolvedValue(null),
      saveSettings: vi.fn().mockResolvedValue(
        createSettings({
          gamePath: 'E:\\Games\\Stardew Valley',
        }),
      ),
    })

    const { result } = renderHook(() => useLauncherSettings(), { wrapper: createWrapper(port) })
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
    const port = createMockLauncherPort({
      loadSettings: vi.fn().mockResolvedValue(createSettings()),
      detectDefaultGameDirectory: vi.fn().mockResolvedValue(null),
      saveSettings: vi.fn().mockRejectedValue(new Error('Write denied')),
    })

    const { result } = renderHook(() => useLauncherSettings(), { wrapper: createWrapper(port) })
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
    const port = createMockLauncherPort({
      loadSettings: vi.fn().mockResolvedValue(createSettings()),
      detectDefaultGameDirectory: vi.fn().mockResolvedValue(null),
      saveSettings: vi.fn().mockResolvedValue(
        createSettings({
          nexusApiKey: 'updated-api-key',
        }),
      ),
    })

    const { result } = renderHook(() => useLauncherSettings(), { wrapper: createWrapper(port) })
    await waitFor(() => {
      expect(result.current.state).toBe('ready')
    })

    vi.useFakeTimers()

    act(() => {
      result.current.updateField('nexusApiKey', 'updated-api-key')
    })

    expect(port.saveSettings).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(699)
    })

    expect(port.saveSettings).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(port.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        nexusApiKey: 'updated-api-key',
      }),
    )
  })

  it('autosaves launcher settings after the automatic update toggle changes', async () => {
    const port = createMockLauncherPort({
      loadSettings: vi.fn().mockResolvedValue(createSettings()),
      detectDefaultGameDirectory: vi.fn().mockResolvedValue(null),
      saveSettings: vi.fn().mockResolvedValue(
        createSettings({
          autoCheckModUpdates: false,
        }),
      ),
    })

    const { result } = renderHook(() => useLauncherSettings(), { wrapper: createWrapper(port) })
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

    expect(port.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        autoCheckModUpdates: false,
      }),
    )
  })

  it('does not let slow hydration overwrite edits made after loading started', async () => {
    const loadSettingsRequest = createDeferred<LauncherSettings>()
    const port = createMockLauncherPort({
      loadSettings: vi.fn().mockReturnValue(loadSettingsRequest.promise),
      detectDefaultGameDirectory: vi.fn().mockResolvedValue(null),
    })

    const { result } = renderHook(() => useLauncherSettings(), { wrapper: createWrapper(port) })

    act(() => {
      result.current.updateField('nexusApiKey', 'typed-api-key')
    })

    await act(async () => {
      loadSettingsRequest.resolve(createSettings({ nexusApiKey: 'stale-api-key' }))
      await loadSettingsRequest.promise
    })

    await waitFor(() => {
      expect(result.current.state).toBe('ready')
      expect(result.current.settings.nexusApiKey).toBe('typed-api-key')
    })
  })

  it('does not let a slow save overwrite edits made after that save started', async () => {
    const saveSettingsRequest = createDeferred<LauncherSettings>()
    const port = createMockLauncherPort({
      loadSettings: vi.fn().mockResolvedValue(createSettings()),
      detectDefaultGameDirectory: vi.fn().mockResolvedValue(null),
      saveSettings: vi.fn().mockReturnValue(saveSettingsRequest.promise),
    })

    const { result } = renderHook(() => useLauncherSettings(), { wrapper: createWrapper(port) })
    await waitFor(() => {
      expect(result.current.state).toBe('ready')
    })

    let savePromise!: Promise<LauncherSettings>
    await act(async () => {
      result.current.updateField('nexusApiKey', 'first-api-key')
      savePromise = result.current.save({ notifySuccess: false })
    })

    act(() => {
      result.current.updateField('nexusApiKey', 'second-api-key')
    })

    await act(async () => {
      saveSettingsRequest.resolve(createSettings({ nexusApiKey: 'first-api-key' }))
      await savePromise
    })

    expect(result.current.settings.nexusApiKey).toBe('second-api-key')
  })

  it('flushes unsaved launcher settings before the page unloads', async () => {
    const port = createMockLauncherPort({
      loadSettings: vi.fn().mockResolvedValue(createSettings()),
      detectDefaultGameDirectory: vi.fn().mockResolvedValue(null),
      saveSettings: vi.fn().mockResolvedValue(
        createSettings({
          nexusApiKey: 'updated-api-key',
        }),
      ),
    })

    const { result } = renderHook(() => useLauncherSettings(), { wrapper: createWrapper(port) })
    await waitFor(() => {
      expect(result.current.state).toBe('ready')
    })

    act(() => {
      result.current.updateField('nexusApiKey', 'updated-api-key')
    })

    expect(port.saveSettings).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new Event('beforeunload'))
    })

    expect(port.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        nexusApiKey: 'updated-api-key',
      }),
    )
  })
})
