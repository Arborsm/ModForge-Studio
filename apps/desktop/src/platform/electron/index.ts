import type { OpenDialogOptions, PlatformPorts } from '@shared/contracts'

export function isElectronHost() {
  return typeof window !== 'undefined' && Boolean(window.modforgeElectron)
}

function getElectronApi() {
  const api = window.modforgeElectron
  if (!api) {
    throw new Error('This feature is only available in the Electron desktop host.')
  }
  return api
}

function createBrowserStorage() {
  return {
    getItem(key: string) {
      return typeof window === 'undefined' ? null : window.localStorage.getItem(key)
    },
    setItem(key: string, value: string) {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, value)
      }
    },
    removeItem(key: string) {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key)
      }
    },
  }
}

async function openDialog(options?: OpenDialogOptions) {
  return getElectronApi().openDialog(options)
}

export function createElectronPlatformPorts(): PlatformPorts {
  return {
    fileSystem: {
      invokeCommand<T>(command: string, args?: Record<string, unknown>) {
        return getElectronApi().invokeCommand<T>(command, args)
      },
      toAssetUrl(filePath: string) {
        return getElectronApi().toAssetUrl(filePath)
      },
    },
    desktopWindow: {
      minimize: () => getElectronApi().minimize(),
      toggleMaximize: () => getElectronApi().toggleMaximize(),
      close: () => getElectronApi().close(),
      forceClose: () => getElectronApi().forceClose(),
      isMaximized: () => getElectronApi().isMaximized(),
      isFullscreen: () => getElectronApi().isFullscreen(),
      setFullscreen: (fullscreen) => getElectronApi().setFullscreen(fullscreen),
      toggleFullscreen: () => getElectronApi().toggleFullscreen(),
    },
    storage: createBrowserStorage(),
    dialog: {
      open: openDialog,
      async chooseDirectory(title?: string) {
        const selected = await openDialog({ title, directory: true, multiple: false })
        return typeof selected === 'string' ? selected : null
      },
      async chooseFile(options?: OpenDialogOptions) {
        const selected = await openDialog({ ...options, directory: false, multiple: false })
        return typeof selected === 'string' ? selected : null
      },
    },
    hostEvents: {
      canUseHost: isElectronHost,
      async listen<T>(event: string, listener: (payload: T) => void) {
        if (!isElectronHost()) {
          return () => {}
        }
        return getElectronApi().onHostEvent(event, listener)
      },
      async listenWindowDragDrop(listener) {
        if (!isElectronHost()) {
          return () => {}
        }
        return getElectronApi().onWindowDragDrop(listener)
      },
    },
  }
}
