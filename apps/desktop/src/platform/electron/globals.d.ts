import type { OpenDialogOptions, PlatformDragDropPayload, PlatformUnlistenFn, SaveDialogOptions } from '@shared/contracts'

export type ModforgeElectronApi = {
  invokeCommand: <T>(command: string, args?: Record<string, unknown>) => Promise<T>
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<boolean>
  close: () => Promise<void>
  forceClose: () => Promise<void>
  hide: () => Promise<void>
  show: () => Promise<void>
  isMaximized: () => Promise<boolean>
  isFullscreen: () => Promise<boolean>
  setFullscreen: (fullscreen: boolean) => Promise<void>
  toggleFullscreen: () => Promise<boolean>
  openDialog: (options?: OpenDialogOptions) => Promise<string | string[] | null>
  saveFileDialog: (options?: SaveDialogOptions) => Promise<string | null>
  toAssetUrl: (filePath: string) => string
  onHostEvent: <T>(event: string, listener: (payload: T) => void) => PlatformUnlistenFn
  onWindowCloseRequest: (listener: () => boolean | Promise<boolean>) => PlatformUnlistenFn
  onWindowDragDrop: (listener: (payload: PlatformDragDropPayload) => void) => PlatformUnlistenFn
}

declare global {
  interface Window {
    modforgeElectron?: ModforgeElectronApi
  }
}
