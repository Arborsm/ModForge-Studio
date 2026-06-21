import type { PlatformDragDropPayload, PlatformPorts } from '@shared/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

async function loadConfiguredDesktop() {
  vi.resetModules()

  const eventListeners = new Map<string, (payload: unknown) => void>()
  const dragDropListeners: Array<(payload: PlatformDragDropPayload) => void> = []
  const invokeCommand = vi.fn()
  const chooseDirectory = vi.fn()
  const chooseFile = vi.fn()
  const desktopWindow = {
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    forceClose: vi.fn(),
    isMaximized: vi.fn(),
    isFullscreen: vi.fn(),
    setFullscreen: vi.fn(),
    toggleFullscreen: vi.fn(),
  }
  const ports: PlatformPorts = {
    fileSystem: {
      invokeCommand: invokeCommand as PlatformPorts['fileSystem']['invokeCommand'],
      toAssetUrl: vi.fn((filePath: string, protocol?: string) => `${protocol ?? 'asset'}://${filePath}`),
    },
    desktopWindow,
    storage: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
    dialog: {
      open: vi.fn(),
      chooseDirectory: chooseDirectory as PlatformPorts['dialog']['chooseDirectory'],
      chooseFile: chooseFile as PlatformPorts['dialog']['chooseFile'],
    },
    hostEvents: {
      canUseHost: vi.fn(() => true),
      listen: vi.fn(async (event, listener) => {
        eventListeners.set(event, listener as (payload: unknown) => void)
        return () => {
          eventListeners.delete(event)
        }
      }),
      listenWindowCloseRequest: vi.fn(async (listener) => {
        eventListeners.set('window-close-request', listener)
        return () => {
          eventListeners.delete('window-close-request')
        }
      }),
      listenWindowDragDrop: vi.fn(async (listener) => {
        dragDropListeners.push(listener)
        return () => {
          const index = dragDropListeners.indexOf(listener)
          if (index >= 0) {
            dragDropListeners.splice(index, 1)
          }
        }
      }),
    },
  }

  const desktop = await import('@platform/host')
  desktop.configureDesktopPlatformPorts(ports)

  return {
    desktop,
    ports,
    invokeCommand,
    chooseDirectory,
    chooseFile,
    desktopWindow,
    eventListeners,
    dragDropListeners,
  }
}

describe('desktop facade', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('routes window helpers through configured desktop window ports', async () => {
    const { desktop, desktopWindow } = await loadConfiguredDesktop()
    desktopWindow.toggleMaximize.mockResolvedValueOnce(true)
    desktopWindow.isMaximized.mockResolvedValueOnce(true)
    desktopWindow.isFullscreen.mockResolvedValueOnce(true)
    desktopWindow.toggleFullscreen.mockResolvedValueOnce(false)

    await expect(desktop.toggleMaximizeCurrentWindow()).resolves.toBe(true)
    await expect(desktop.isCurrentWindowMaximized()).resolves.toBe(true)
    await expect(desktop.isCurrentWindowFullscreen()).resolves.toBe(true)
    await expect(desktop.toggleFullscreenCurrentWindow()).resolves.toBe(false)
    await desktop.setFullscreenCurrentWindow(true)
    await desktop.forceCloseCurrentWindow()

    expect(desktopWindow.toggleMaximize).toHaveBeenCalledTimes(1)
    expect(desktopWindow.isMaximized).toHaveBeenCalledTimes(1)
    expect(desktopWindow.isFullscreen).toHaveBeenCalledTimes(1)
    expect(desktopWindow.toggleFullscreen).toHaveBeenCalledTimes(1)
    expect(desktopWindow.setFullscreen).toHaveBeenCalledWith(true)
    expect(desktopWindow.forceClose).toHaveBeenCalledTimes(1)
  })

  it('routes native window close requests through configured host events', async () => {
    const { desktop, eventListeners, ports } = await loadConfiguredDesktop()
    const listener = vi.fn()

    const unlisten = await desktop.listenToWindowCloseRequest(listener)

    expect(ports.hostEvents.listenWindowCloseRequest).toHaveBeenCalledWith(expect.any(Function))
    eventListeners.get('window-close-request')?.({})
    expect(listener).toHaveBeenCalledTimes(1)

    unlisten()
    expect(eventListeners.has('window-close-request')).toBe(false)
  })

  it('opens archive files and drag-drop listeners through configured platform ports', async () => {
    const { desktop, dragDropListeners, ports } = await loadConfiguredDesktop()
    vi.mocked(ports.dialog.open).mockResolvedValueOnce('E:\\Downloads\\example.7z')
    const listener = vi.fn()

    await expect(desktop.chooseArchiveFile('Install Archive')).resolves.toBe('E:\\Downloads\\example.7z')
    const unlisten = await desktop.listenToLauncherArchiveDragDrop(listener)

    expect(ports.dialog.open).toHaveBeenCalledWith({
      title: 'Install Archive',
      directory: false,
      multiple: false,
      filters: [
        {
          name: 'Archives',
          extensions: ['zip', '7z', 'rar', 'tar', 'tgz', 'gz'],
        },
      ],
    })
    expect(ports.hostEvents.listenWindowDragDrop).toHaveBeenCalledTimes(1)
    expect(dragDropListeners).toHaveLength(1)

    dragDropListeners[0]?.({
      type: 'drop',
      paths: ['E:\\Downloads\\example.7z'],
      position: { x: 144, y: 288 },
    })

    expect(listener).toHaveBeenCalledWith({
      type: 'drop',
      paths: ['E:\\Downloads\\example.7z'],
      position: { x: 144, y: 288 },
    })

    unlisten()
    expect(dragDropListeners).toHaveLength(0)
  })

  it('opens multiple archive files through the generic dialog port', async () => {
    const { desktop, ports } = await loadConfiguredDesktop()
    vi.mocked(ports.dialog.open).mockResolvedValueOnce(['E:\\Downloads\\a.zip', 'E:\\Downloads\\b.7z'])

    await expect(desktop.chooseArchiveFiles('Install Archives')).resolves.toEqual(['E:\\Downloads\\a.zip', 'E:\\Downloads\\b.7z'])

    expect(ports.dialog.open).toHaveBeenCalledWith({
      title: 'Install Archives',
      directory: false,
      multiple: true,
      filters: [
        {
          name: 'Archives',
          extensions: ['zip', '7z', 'rar', 'tar', 'tgz', 'gz'],
        },
      ],
    })
  })

  it('recognizes supported launcher archive paths', async () => {
    const { desktop } = await loadConfiguredDesktop()

    expect(desktop.isSupportedLauncherArchivePath('E:\\Downloads\\example.zip')).toBe(true)
    expect(desktop.isSupportedLauncherArchivePath('E:\\Downloads\\example.7Z')).toBe(true)
    expect(desktop.isSupportedLauncherArchivePath('E:\\Downloads\\example.rar')).toBe(true)
    expect(desktop.isSupportedLauncherArchivePath('E:\\Downloads\\example.tar')).toBe(true)
    expect(desktop.isSupportedLauncherArchivePath('E:\\Downloads\\example.tgz')).toBe(true)
    expect(desktop.isSupportedLauncherArchivePath('E:\\Downloads\\example.tar.gz')).toBe(true)
    expect(desktop.isSupportedLauncherArchivePath('E:\\Downloads\\example.gz')).toBe(false)
    expect(desktop.isSupportedLauncherArchivePath('E:\\Downloads\\example.txt')).toBe(false)
    expect(desktop.isSupportedLauncherArchivePath('')).toBe(false)
  })

  it('routes app UI commands through the configured file system port', async () => {
    const { desktop, invokeCommand } = await loadConfiguredDesktop()
    const appUiState = {
      version: 1,
      shell: {
        appMode: 'launcher',
        launcherPage: 'library',
        debugEnabled: false,
        notificationSoundEnabled: true,
      },
      appearance: {
        locale: 'zh-CN',
        themeId: 'neutral-tool',
        windowBorderTone: 'accent',
        windowBorderWeight: 'standard',
        recentGameDirectories: [],
        playerAppearance: {
          profiles: [],
          activeProfileId: null,
        },
      },
      workspace: {
        layouts: {},
      },
      launcher: {
        discoverToolbar: {
          sort: 'newest',
          ascending: false,
          timeRange: 'all',
          pageSize: 20,
          filtersHidden: false,
        },
        forceOffline: false,
      },
    }
    invokeCommand.mockResolvedValueOnce(appUiState)

    await expect(desktop.patchAppUiState({ shell: appUiState.shell })).resolves.toEqual(appUiState)

    expect(invokeCommand).toHaveBeenNthCalledWith(1, 'patch_app_ui_state', {
      request: {
        shell: appUiState.shell,
      },
    })
  })

  it('mirrors frontend logs locally before forwarding them through desktop ports', async () => {
    const { desktop, invokeCommand } = await loadConfiguredDesktop()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    invokeCommand.mockResolvedValueOnce(undefined)

    await expect(
      desktop.writeFrontendLog({
        level: 'warning',
        message: 'Launcher settings save failed',
        keyValues: {
          source: 'launcher-settings',
        },
      }),
    ).resolves.toBeUndefined()

    expect(invokeCommand).toHaveBeenCalledWith('write_frontend_log', {
      request: {
        level: 'warning',
        message: 'Launcher settings save failed',
        keyValues: {
          source: 'launcher-settings',
        },
      },
    })
    expect(warnSpy).toHaveBeenCalledWith('[webview][WARN] Launcher settings save failed source=launcher-settings')
  })
})
