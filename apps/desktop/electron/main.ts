import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs/promises'
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

const localFileProtocol = 'modforge-asset'
const localFileHost = 'local'
const isDev = !app.isPackaged
const devUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173'
let mainWindow: BrowserWindow | null = null
let sidecar: ChildProcessWithoutNullStreams | null = null
let nextRpcId = 0
const pendingRpc = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>()

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('use-webgpu-adapter', 'opengles')
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: localFileProtocol,
    privileges: {
      standard: true,
      secure: true,
    },
  },
])

function registerLocalFileProtocol() {
  protocol.handle(localFileProtocol, async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== localFileHost) {
      return new Response('Unknown local file host.', { status: 404 })
    }

    const filePath = decodeLocalFilePath(url)
    if (!path.isAbsolute(filePath)) {
      return new Response('Local file path must be absolute.', { status: 400 })
    }

    try {
      const bytes = await fs.readFile(filePath)
      return new Response(bytes, {
        headers: {
          'content-type': mimeTypeFromPath(filePath),
        },
      })
    } catch {
      return new Response('Local file was not found.', { status: 404 })
    }
  })
}

function decodeLocalFilePath(url: URL) {
  return decodeURIComponent(url.pathname.slice(1))
}

function mimeTypeFromPath(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

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
    env: {
      ...process.env,
      MODFORGE_LOG_COLOR: process.env.MODFORGE_LOG_COLOR ?? (isDev ? 'always' : 'auto'),
    },
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
    console.error(String(chunk).trimEnd())
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
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  if (isDev) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const key = input.key.toLowerCase()
      const togglesDevTools =
        input.type === 'keyDown' && (key === 'f12' || (key === 'i' && input.shift && (input.control || (input.meta && input.alt))))

      if (togglesDevTools) {
        event.preventDefault()
        mainWindow?.webContents.toggleDevTools()
      }
    })
  }

  if (isDev) {
    void mainWindow.loadURL(devUrl)
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
    return false
  } else {
    window.maximize()
    return true
  }
})
ipcMain.handle('modforge:window-close', () => currentWindow().close())
ipcMain.handle('modforge:window-is-maximized', () => currentWindow().isMaximized())
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
  registerLocalFileProtocol()
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
