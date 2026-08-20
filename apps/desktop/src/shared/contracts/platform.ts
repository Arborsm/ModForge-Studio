/** File-extension filter entry for native open/save dialogs. */
export type DialogFilter = {
  name: string
  extensions: readonly string[]
}

/** Options passed to the native open-file / open-directory dialog. */
export type OpenDialogOptions = {
  title?: string
  directory?: boolean
  multiple?: boolean
  filters?: readonly DialogFilter[]
}

/** Options passed to the native save-file dialog. */
export type SaveDialogOptions = {
  title?: string
  defaultPath?: string
  filters?: readonly DialogFilter[]
}

/** Host-agnostic file-system capability; concrete adapters are injected by the platform layer. */
export interface FileSystemPort {
  invokeCommand: <T>(command: string, args?: Record<string, unknown>) => Promise<T>
  toAssetUrl: (filePath: string, protocol?: string) => string
  /**
   * Resolves a `plugin://` resource URL for the current host. The concrete URL
   * form differs per webview (Tauri maps custom schemes to
   * `http://plugin.localhost/...` on Windows and `plugin://localhost/...`
   * elsewhere; Electron uses a real privileged scheme), so callers must never
   * build these URLs by hand.
   */
  resolvePluginUrl: (pluginId: string, relativePath: string) => string
}

/** Cancellation function returned by platform event listeners. */
export type PlatformUnlistenFn = () => void

/** Payload delivered when the user drags files onto the desktop window. */
export type PlatformDragDropPayload = {
  type: string
  paths?: string[]
  position?: {
    x: number
    y: number
  }
}

/** Host-agnostic host-event listener capability (window close requests, drag-drop, etc.). */
export interface HostEventPort {
  canUseHost: () => boolean
  listen: <T>(event: string, listener: (payload: T) => void) => Promise<PlatformUnlistenFn>
  listenWindowCloseRequest: (listener: () => boolean | Promise<boolean>) => Promise<PlatformUnlistenFn>
  listenWindowDragDrop: (listener: (payload: PlatformDragDropPayload) => void) => Promise<PlatformUnlistenFn>
}

/** Host-agnostic desktop window control capability (minimize, maximize, fullscreen, etc.). */
export interface DesktopWindowPort {
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
}

/** Host-agnostic synchronous key-value storage capability (backed by localStorage or equivalent). */
export interface StoragePort {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

/** Host-agnostic file/directory dialog capability. */
export interface DialogPort {
  open: (options?: OpenDialogOptions) => Promise<string | string[] | null>
  saveFile: (options?: SaveDialogOptions) => Promise<string | null>
  chooseDirectory: (title?: string) => Promise<string | null>
  chooseFile: (options?: OpenDialogOptions) => Promise<string | null>
}

/** Aggregated bundle of all platform ports injected into the app by the platform adapter. */
export interface PlatformPorts {
  fileSystem: FileSystemPort
  desktopWindow: DesktopWindowPort
  storage: StoragePort
  dialog: DialogPort
  hostEvents: HostEventPort
}
