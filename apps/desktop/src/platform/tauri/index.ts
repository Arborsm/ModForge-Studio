/**
 * @file Tauri platform adapter — wires `@tauri-apps/api` into the `PlatformPorts` contract for macOS/Windows.
 * @module platform/tauri
 */

import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open, save } from '@tauri-apps/plugin-dialog'
import type { OpenDialogOptions, PlatformPorts, SaveDialogOptions } from '@shared/contracts'
import { createBrowserStorage, createDialogChoosers } from '../adapter-shared'

function canUseTauriHost() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function assertTauriHost() {
  if (!canUseTauriHost()) {
    throw new Error('This feature is only available in the Tauri desktop host.')
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

/** Builds the `PlatformPorts` instance backed by the Tauri webview API. */
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
      resolvePluginUrl(pluginId: string, relativePath: string, epoch?: number) {
        // Mirrors the URL forms the Rust `plugin` scheme handler expects (same
        // convention as convertFileSrc): Windows WebView2 serves custom schemes
        // as `http://plugin.localhost/...`, macOS/Linux as
        // `plugin://localhost/...`. Path segments are encoded individually so
        // the handler's segment-based parsing keeps working.
        //
        // When `epoch` is set, a `__v<N>/` segment is inserted after the plugin
        // id so hot-reload bypasses the webview module cache (the entry and all
        // relative sub-imports resolve under the versioned path). The host
        // handler strips the prefix before resolving the on-disk path.
        const pathSegments = relativePath.split('/').filter(Boolean)
        const segments = [pluginId, ...(epoch !== undefined ? [`__v${epoch}`] : []), ...pathSegments].map(encodeURIComponent).join('/')
        return navigator.userAgent.includes('Windows') ? `http://plugin.localhost/${segments}` : `plugin://localhost/${segments}`
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
      ...createDialogChoosers(openDialog),
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
