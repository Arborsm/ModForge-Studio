import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, Tray } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs/promises'
import { createInterface, type Interface as ReadlineInterface } from 'node:readline'
import path from 'node:path'
import type { OpenDialogOptions } from '../src/shared/contracts/platform'

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

type PendingRpc = {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

type PendingWindowCloseRequest = {
  resolve: (accepted: boolean) => void
  timeout: NodeJS.Timeout
}

const localFileProtocol = 'modforge-asset'
const localFileHost = 'local'
const appDisplayName = process.env.MODFORGE_APP_NAME?.trim() || 'ModForge Studio'
const appDesktopId = process.env.MODFORGE_DESKTOP_ID?.trim() || 'studio.modforge.desktop'
const isDev = !app.isPackaged
const devUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173'
const windowCloseRequestTimeoutMs = 1500
const sidecarStopTimeoutMs = 2500
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let closeAllowed = false
let appShuttingDown = false
let nextWindowCloseRequestId = 0
const pendingWindowCloseRequests = new Map<number, PendingWindowCloseRequest>()

function resolveWindowIconPath() {
  if (isDev) {
    return path.resolve(__dirname, '../src-tauri/icons/icon.png')
  }

  return path.join(process.resourcesPath, 'icon.png')
}

if (process.platform === 'linux') {
  app.setName(appDisplayName)
  app.setAppUserModelId(appDesktopId)
  // setDesktopName is the only API that actually sets the Wayland xdg_toplevel
  // app_id (and the X11 WM_CLASS second slot). setName/setAppUserModelId/--class
  // do not reach the OS on Wayland, so KDE would otherwise fall back to "electron".
  app.setDesktopName(appDesktopId)
  app.commandLine.appendSwitch('class', appDesktopId)
  app.commandLine.appendSwitch('app-id', appDesktopId)
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

class SidecarTransport {
  private sidecar: ChildProcessWithoutNullStreams | null = null
  private sidecarStdout: ReadlineInterface | null = null
  private nextRpcId = 0
  private pendingRpc = new Map<number, PendingRpc>()
  private readonly forwardEvent: (event: string, payload: unknown) => void

  constructor(forwardEvent: (event: string, payload: unknown) => void) {
    this.forwardEvent = forwardEvent
  }

  start() {
    if (this.sidecar) {
      return this.sidecar
    }

    const child = spawn(resolveSidecarPath(), [], {
      cwd: isDev ? path.resolve(__dirname, '..') : process.resourcesPath,
      env: {
        ...process.env,
        MODFORGE_LOG_COLOR: process.env.MODFORGE_LOG_COLOR ?? (isDev ? 'always' : 'auto'),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.sidecar = child

    child.on('exit', () => {
      this.teardown(new Error('ModForge sidecar exited.'))
    })

    child.on('error', (error) => {
      this.teardown(error)
    })

    child.stderr.on('data', (chunk) => {
      console.error(String(chunk).trimEnd())
    })

    this.sidecarStdout = createInterface({ input: child.stdout })
    this.sidecarStdout.on('line', (line) => this.handleFrameLine(line))

    return child
  }

  async stop() {
    const child = this.sidecar
    this.teardown(new Error('ModForge sidecar stopped.'))
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      return
    }

    child.kill()
    const exited = await Promise.race([
      new Promise<boolean>((resolve) => {
        child.once('exit', () => resolve(true))
      }),
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), sidecarStopTimeoutMs)
      }),
    ])

    if (!exited && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
    }
  }

  invoke(command: string, args?: Record<string, unknown>) {
    const child = this.start()
    const id = ++this.nextRpcId

    return new Promise((resolve, reject) => {
      if (child.stdin.destroyed || !child.stdin.writable) {
        reject(new Error('ModForge sidecar stdin is not writable.'))
        return
      }

      this.pendingRpc.set(id, { resolve, reject })
      child.stdin.write(`${JSON.stringify({ id, command, args: args ?? {} })}\n`, (error) => {
        if (error) {
          this.pendingRpc.delete(id)
          reject(error)
        }
      })
    })
  }

  private handleFrameLine(line: string) {
    let frame: RpcResponse
    try {
      frame = JSON.parse(line) as RpcResponse
    } catch (error) {
      console.error('Invalid sidecar frame:', error)
      return
    }

    if (frame.event) {
      this.forwardEvent(frame.event.event, frame.event.payload)
      return
    }

    if (typeof frame.id !== 'number') {
      return
    }

    const pending = this.pendingRpc.get(frame.id)
    if (!pending) {
      return
    }
    this.pendingRpc.delete(frame.id)

    if (frame.ok) {
      pending.resolve(frame.result)
    } else {
      pending.reject(frame.error ?? 'Sidecar command failed.')
    }
  }

  private teardown(error: Error) {
    this.sidecarStdout?.close()
    this.sidecarStdout = null
    this.sidecar = null
    this.rejectPendingRpc(error)
  }

  private rejectPendingRpc(error: Error) {
    for (const { reject } of this.pendingRpc.values()) {
      reject(error)
    }
    this.pendingRpc.clear()
  }
}

const sidecarTransport = new SidecarTransport(forwardHostEvent)

function settleWindowCloseRequest(requestId: number, accepted: boolean) {
  const pending = pendingWindowCloseRequests.get(requestId)
  if (!pending) {
    return
  }

  clearTimeout(pending.timeout)
  pendingWindowCloseRequests.delete(requestId)
  pending.resolve(accepted)
}

function clearWindowCloseRequests(accepted = false) {
  for (const requestId of pendingWindowCloseRequests.keys()) {
    settleWindowCloseRequest(requestId, accepted)
  }
}

function forceCloseWindow(window: BrowserWindow) {
  clearWindowCloseRequests(false)
  closeAllowed = true
  window.destroy()
  app.quit()
}

async function requestWindowClose(window: BrowserWindow) {
  if (closeAllowed || appShuttingDown) {
    forceCloseWindow(window)
    return true
  }

  if (window.webContents.isDestroyed()) {
    forceCloseWindow(window)
    return true
  }

  if (pendingWindowCloseRequests.size > 0) {
    return false
  }

  const requestId = ++nextWindowCloseRequestId
  const accepted = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      pendingWindowCloseRequests.delete(requestId)
      resolve(false)
    }, windowCloseRequestTimeoutMs)

    pendingWindowCloseRequests.set(requestId, { resolve, timeout })
    window.webContents.send('modforge:window-close-request', requestId)
  })

  if (accepted && !window.isDestroyed()) {
    forceCloseWindow(window)
  }
  return accepted
}

async function shutdownApp() {
  if (appShuttingDown) {
    return
  }
  appShuttingDown = true
  clearWindowCloseRequests(false)
  await sidecarTransport.stop()
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: appDisplayName,
    width: 1600,
    height: 1000,
    minWidth: 1280,
    minHeight: 800,
    frame: false,
    resizable: true,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    icon: resolveWindowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.once('closed', () => {
    mainWindow = null
  })
  mainWindow.on('close', (event) => {
    if (closeAllowed) {
      return
    }

    event.preventDefault()
    void requestWindowClose(mainWindow!)
  })

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

function createTray() {
  const iconPath = resolveWindowIconPath()
  tray = new Tray(iconPath)
  tray.setToolTip(appDisplayName)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Show ${appDisplayName}`,
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        closeAllowed = true
        app.quit()
      },
    },
  ])

  tray.on('click', () => {
    if (!mainWindow) {
      return
    }

    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  tray.on('right-click', () => {
    tray?.popUpContextMenu(contextMenu)
  })
}

function currentWindow() {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow
  if (!window) {
    throw new Error('No Electron window is available.')
  }
  return window
}

ipcMain.handle('modforge:invoke-command', (_event, command: string, args?: Record<string, unknown>) =>
  sidecarTransport.invoke(command, args),
)
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
ipcMain.handle('modforge:window-close', () => requestWindowClose(currentWindow()))
ipcMain.handle('modforge:window-force-close', () => {
  forceCloseWindow(currentWindow())
})
ipcMain.handle('modforge:window-hide', () => {
  currentWindow().hide()
})
ipcMain.handle('modforge:window-show', () => {
  mainWindow?.show()
  mainWindow?.focus()
})
ipcMain.handle('modforge:window-close-request-result', (_event, requestId: number, accepted: boolean) => {
  settleWindowCloseRequest(requestId, accepted)
})
ipcMain.handle('modforge:window-is-maximized', () => currentWindow().isMaximized())
ipcMain.handle('modforge:window-is-fullscreen', () => currentWindow().isFullScreen())
ipcMain.handle('modforge:window-set-fullscreen', (_event, fullscreen: boolean) => currentWindow().setFullScreen(fullscreen))
ipcMain.handle('modforge:window-toggle-fullscreen', () => {
  const window = currentWindow()
  const nextFullscreen = !window.isFullScreen()
  window.setFullScreen(nextFullscreen)
  return nextFullscreen
})
ipcMain.handle('modforge:open-dialog', async (_event, options?: OpenDialogOptions) => {
  const result = await dialog.showOpenDialog(currentWindow(), {
    title: options?.title,
    properties: [options?.directory ? 'openDirectory' : 'openFile', options?.multiple ? 'multiSelections' : undefined].filter(
      Boolean,
    ) as Electron.OpenDialogOptions['properties'],
    filters: options?.filters?.map((filter) => ({ name: filter.name, extensions: [...filter.extensions] })),
  })

  if (result.canceled) {
    return null
  }
  return options?.multiple ? result.filePaths : (result.filePaths[0] ?? null)
})

void app.whenReady().then(() => {
  registerLocalFileProtocol()
  sidecarTransport.start()
  createMainWindow()
  createTray()
})

app.on('window-all-closed', () => {
  if (appShuttingDown || tray) {
    return
  }

  app.quit()
})

app.on('before-quit', (event) => {
  if (appShuttingDown) {
    return
  }

  event.preventDefault()
  void shutdownApp().finally(() => app.quit())
})

app.on('will-quit', () => {
  void shutdownApp()
})

app.on('quit', () => {
  tray?.destroy()
  tray = null
})

process.once('SIGINT', () => {
  void shutdownApp().finally(() => process.exit(0))
})
process.once('SIGTERM', () => {
  void shutdownApp().finally(() => process.exit(0))
})
process.once('SIGHUP', () => {
  void shutdownApp().finally(() => process.exit(0))
})
