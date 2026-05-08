export type DialogFilter = {
  name: string
  extensions: readonly string[]
}

export type OpenDialogOptions = {
  title?: string
  directory?: boolean
  multiple?: boolean
  filters?: readonly DialogFilter[]
}

export interface FileSystemPort {
  invokeCommand: <T>(command: string, args?: Record<string, unknown>) => Promise<T>
  toAssetUrl: (filePath: string, protocol?: string) => string
}

export interface DesktopWindowPort {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  close: () => Promise<void>
  isFullscreen: () => Promise<boolean>
  setFullscreen: (fullscreen: boolean) => Promise<void>
  toggleFullscreen: () => Promise<boolean>
}

export interface StoragePort {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export interface DialogPort {
  open: (options?: OpenDialogOptions) => Promise<string | string[] | null>
  chooseDirectory: (title?: string) => Promise<string | null>
  chooseFile: (options?: OpenDialogOptions) => Promise<string | null>
}

export interface PlatformPorts {
  fileSystem: FileSystemPort
  desktopWindow: DesktopWindowPort
  storage: StoragePort
  dialog: DialogPort
}
