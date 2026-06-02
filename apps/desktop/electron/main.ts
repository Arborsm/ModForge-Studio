import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import path from 'node:path'

type RpcResponse = {
  id?: number
  ok?: boolean
  result?: unknown
  error?: unknown
  event?: {
    event: string
    payload: unknown
  }
}

const isDev = !app.isPackaged
const devUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173'
let mainWindow: BrowserWindow | null = null
let sidecar: ChildProcessWithoutNullStreams | null = null
let nextRpcId = 0
const pendingRpc = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>()

function resolveSidecarPath() {
  if (process.env.MODFORGE_SIDECAR_PATH?.trim()) {
    return process.env.MODFORGE_SIDECAR_PATH.trim()
  }

  if (isDev) {
    return path.resolve(__dirname, '../src-tauri/target/debug/modforge_sidecar')
  }

  return path.join(process.resourcesPath, 'bin/modforge_sidecar')
}

function forwardHostEvent(event: string, payload: unknown) {
  mainWindow?.webContents.send('modforge:host-event', event, payload)
}

function startSidecar() {
  if (sidecar) {
    return sidecar
  }

  sidecar = spawn(resolveSidecarPath(), [], {
    cwd: isDev ? path.resolve(__dirname, '..') : process.resourcesPath,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  sidecar.on('exit', () => {
    sidecar = null
    for (const { reject } of pendingRpc.values()) {
      reject(new Error('ModForge sidecar exited.'))
    }
    pendingRpc.clear()
  })

  sidecar.stderr.on('data', (chunk) => {
    console.error(`[modforge-sidecar] ${String(chunk).trimEnd()}`)
  })

  createInterface({ input: sidecar.stdout }).on('line', (line) => {
    let frame: RpcResponse
    try {
      frame = JSON.parse(line) as RpcResponse
    } catch (error) {
      console.error('Invalid sidecar frame:', error)
      return
    }

    if (frame.event) {
      forwardHostEvent(frame.event.event, frame.event.payload)
      return
    }

    if (typeof frame.id !== 'number') {
      return
    }

    const pending = pendingRpc.get(frame.id)
    if (!pending) {
      return
    }
    pendingRpc.delete(frame.id)

    if (frame.ok) {
      pending.resolve(frame.result)
    } else {
      pending.reject(frame.error ?? 'Sidecar command failed.')
    }
  })

  return sidecar
}

function invokeSidecar(command: string, args?: Record<string, unknown>) {
  const process = startSidecar()
  const id = ++nextRpcId

  return new Promise((resolve, reject) => {
    pendingRpc.set(id, { resolve, reject })
    process.stdin.write(`${JSON.stringify({ id, command, args: args ?? {} })}\n`, (error) => {
      if (error) {
        pendingRpc.delete(id)
        reject(error)
      }
    })
  })
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    resizable: true,
    show: false,
    backgroundColor: '#101620',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  if (isDev) {
    void mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    void mainWindow.loadFile(path.resolve(__dirname, '../dist/index.html'))
  }
}

function currentWindow() {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow
  if (!window) {
    throw new Error('No Electron window is available.')
  }
  return window
}

ipcMain.handle('modforge:invoke-command', (_event, command: string, args?: Record<string, unknown>) => invokeSidecar(command, args))
ipcMain.handle('modforge:window-minimize', () => currentWindow().minimize())
ipcMain.handle('modforge:window-toggle-maximize', () => {
  const window = currentWindow()
  if (window.isMaximized()) {
    window.unmaximize()
  } else {
    window.maximize()
  }
})
ipcMain.handle('modforge:window-close', () => currentWindow().close())
ipcMain.handle('modforge:window-is-fullscreen', () => currentWindow().isFullScreen())
ipcMain.handle('modforge:window-set-fullscreen', (_event, fullscreen: boolean) => currentWindow().setFullScreen(fullscreen))
ipcMain.handle('modforge:window-toggle-fullscreen', () => {
  const window = currentWindow()
  const nextFullscreen = !window.isFullScreen()
  window.setFullScreen(nextFullscreen)
  return nextFullscreen
})
ipcMain.handle('modforge:open-dialog', async (_event, options?: Electron.OpenDialogOptions) => {
  const result = await dialog.showOpenDialog(currentWindow(), {
    title: options?.title,
    properties: [options?.directory ? 'openDirectory' : 'openFile', options?.multiple ? 'multiSelections' : undefined].filter(
      Boolean,
    ) as Electron.OpenDialogOptions['properties'],
    filters: options?.filters,
  })

  if (result.canceled) {
    return null
  }
  return options?.multiple ? result.filePaths : (result.filePaths[0] ?? null)
})

app.whenReady().then(() => {
  startSidecar()
  createMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  sidecar?.kill()
  sidecar = null
})
