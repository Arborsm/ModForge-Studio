import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { OpenDialogOptions, PlatformDragDropPayload } from '../src/shared/contracts/platform'

export function toElectronLocalFileUrl(filePath: string) {
  return `modforge-asset://local/${encodeURIComponent(filePath)}`
}

contextBridge.exposeInMainWorld('modforgeElectron', {
  invokeCommand<T>(command: string, args?: Record<string, unknown>) {
    return ipcRenderer.invoke('modforge:invoke-command', command, args) as Promise<T>
  },
  minimize() {
    return ipcRenderer.invoke('modforge:window-minimize') as Promise<void>
  },
  toggleMaximize() {
    return ipcRenderer.invoke('modforge:window-toggle-maximize') as Promise<boolean>
  },
  close() {
    return ipcRenderer.invoke('modforge:window-close') as Promise<void>
  },
  forceClose() {
    return ipcRenderer.invoke('modforge:window-force-close') as Promise<void>
  },
  hide() {
    return ipcRenderer.invoke('modforge:window-hide') as Promise<void>
  },
  show() {
    return ipcRenderer.invoke('modforge:window-show') as Promise<void>
  },
  isFullscreen() {
    return ipcRenderer.invoke('modforge:window-is-fullscreen') as Promise<boolean>
  },
  isMaximized() {
    return ipcRenderer.invoke('modforge:window-is-maximized') as Promise<boolean>
  },
  setFullscreen(fullscreen: boolean) {
    return ipcRenderer.invoke('modforge:window-set-fullscreen', fullscreen) as Promise<void>
  },
  toggleFullscreen() {
    return ipcRenderer.invoke('modforge:window-toggle-fullscreen') as Promise<boolean>
  },
  openDialog(options?: OpenDialogOptions) {
    return ipcRenderer.invoke('modforge:open-dialog', options) as Promise<string | string[] | null>
  },
  toAssetUrl(filePath: string) {
    return toElectronLocalFileUrl(filePath)
  },
  onHostEvent<T>(event: string, listener: (payload: T) => void) {
    const channelListener = (_event: Electron.IpcRendererEvent, nextEvent: string, payload: T) => {
      if (nextEvent === event) {
        listener(payload)
      }
    }
    ipcRenderer.on('modforge:host-event', channelListener)
    return () => ipcRenderer.off('modforge:host-event', channelListener)
  },
  onWindowCloseRequest(listener: () => boolean | Promise<boolean>) {
    const channelListener = async (_event: Electron.IpcRendererEvent, requestId: number) => {
      try {
        const result = await listener()
        void ipcRenderer.invoke('modforge:window-close-request-result', requestId, result === true)
      } catch {
        void ipcRenderer.invoke('modforge:window-close-request-result', requestId, false)
      }
    }

    ipcRenderer.on('modforge:window-close-request', channelListener)
    return () => ipcRenderer.off('modforge:window-close-request', channelListener)
  },
  onWindowDragDrop(listener: (payload: PlatformDragDropPayload) => void) {
    const dragOverListener = (event: DragEvent) => {
      event.preventDefault()
      listener({
        type: 'over',
        position: {
          x: event.clientX,
          y: event.clientY,
        },
      })
    }
    const dropListener = (event: DragEvent) => {
      event.preventDefault()
      const paths = Array.from(event.dataTransfer?.files ?? [])
        .map((file) => webUtils.getPathForFile(file))
        .filter((filePath) => filePath.trim().length > 0)
      listener({
        type: 'drop',
        paths,
        position: {
          x: event.clientX,
          y: event.clientY,
        },
      })
    }

    window.addEventListener('dragover', dragOverListener)
    window.addEventListener('drop', dropListener)
    return () => {
      window.removeEventListener('dragover', dragOverListener)
      window.removeEventListener('drop', dropListener)
    }
  },
})
