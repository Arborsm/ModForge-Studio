import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open, save } from '@tauri-apps/plugin-dialog'
import type { OpenDialogOptions, PlatformPorts, SaveDialogOptions } from '@shared/contracts'

function canUseTauriHost() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function assertTauriHost() {
  if (!canUseTauriHost()) {
    throw new Error('This feature is only available in the Tauri desktop host.')
  }
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
  assertTauriHost()

  return open({
    ...options,
    filters: options?.filters?.map((filter) => ({
      name: filter.name,
      extensions: [...filter.extensions],
    })),
  })
}

async function saveFileDialog(options?: SaveDialogOptions) {
  assertTauriHost()

  return save({
    ...options,
    filters: options?.filters?.map((filter) => ({
      name: filter.name,
      extensions: [...filter.extensions],
    })),
  })
}

export function createTauriPlatformPorts(): PlatformPorts {
  return {
    fileSystem: {
      invokeCommand<T>(command: string, args?: Record<string, unknown>) {
        assertTauriHost()
        return invoke<T>(command, args)
      },
      toAssetUrl(filePath: string, protocol?: string) {
        return convertFileSrc(filePath, protocol)
      },
    },
    desktopWindow: {
      async minimize() {
        if (canUseTauriHost()) {
          await getCurrentWindow().minimize()
        }
      },
      async toggleMaximize() {
        if (canUseTauriHost()) {
          const currentWindow = getCurrentWindow()
          await currentWindow.toggleMaximize()
          return currentWindow.isMaximized()
        }
        return false
      },
      async close() {
        if (canUseTauriHost()) {
          await getCurrentWindow().close()
        }
      },
      async forceClose() {
        if (canUseTauriHost()) {
          await getCurrentWindow().destroy()
        }
      },
      async hide() {
        if (canUseTauriHost()) {
          await getCurrentWindow().hide()
        }
      },
      async show() {
        if (canUseTauriHost()) {
          const currentWindow = getCurrentWindow()
          await currentWindow.show()
          await currentWindow.setFocus()
        }
      },
      async isFullscreen() {
        return canUseTauriHost() ? getCurrentWindow().isFullscreen() : false
      },
      async isMaximized() {
        return canUseTauriHost() ? getCurrentWindow().isMaximized() : false
      },
      async setFullscreen(fullscreen: boolean) {
        if (canUseTauriHost()) {
          await getCurrentWindow().setFullscreen(fullscreen)
        }
      },
      async toggleFullscreen() {
        if (!canUseTauriHost()) {
          return false
        }

        const currentWindow = getCurrentWindow()
        const fullscreen = await currentWindow.isFullscreen()
        const nextFullscreen = !fullscreen
        await currentWindow.setFullscreen(nextFullscreen)
        return nextFullscreen
      },
    },
    storage: createBrowserStorage(),
    dialog: {
      open: openDialog,
      saveFile: saveFileDialog,
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
      canUseHost: canUseTauriHost,
      async listen<T>(event: string, listener: (payload: T) => void) {
        if (!canUseTauriHost()) {
          return () => {}
        }

        return listen<T>(event, (nextEvent) => {
          listener(nextEvent.payload)
        })
      },
      async listenWindowCloseRequest(listener) {
        if (!canUseTauriHost()) {
          return () => {}
        }
        return getCurrentWindow().onCloseRequested((closeEvent) => {
          closeEvent.preventDefault()
          void listener()
        })
      },
      async listenWindowDragDrop(listener) {
        if (!canUseTauriHost()) {
          return () => {}
        }

        return getCurrentWebview().onDragDropEvent((event) => listener(event.payload))
      },
    },
  }
}
