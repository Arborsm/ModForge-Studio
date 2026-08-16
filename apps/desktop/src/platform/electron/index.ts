import type { OpenDialogOptions, PlatformPorts, SaveDialogOptions } from '@shared/contracts'
import { createBrowserStorage, createDialogChoosers } from '../adapter-shared'

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
      hide: () => getElectronApi().hide(),
      show: () => getElectronApi().show(),
      isMaximized: () => getElectronApi().isMaximized(),
      isFullscreen: () => getElectronApi().isFullscreen(),
      setFullscreen: (fullscreen) => getElectronApi().setFullscreen(fullscreen),
      toggleFullscreen: () => getElectronApi().toggleFullscreen(),
    },
    storage: createBrowserStorage(),
    dialog: {
      open: openDialog,
      saveFile(options?: SaveDialogOptions) {
        return getElectronApi().saveFileDialog(options)
      },
      ...createDialogChoosers(openDialog),
    },
    hostEvents: {
      canUseHost: isElectronHost,
      async listen<T>(event: string, listener: (payload: T) => void) {
        if (!isElectronHost()) {
          return () => {}
        }
        return getElectronApi().onHostEvent(event, listener)
      },
      async listenWindowCloseRequest(listener) {
        if (!isElectronHost()) {
          return () => {}
        }
        return getElectronApi().onWindowCloseRequest(listener)
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
