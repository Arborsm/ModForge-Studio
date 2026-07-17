import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  appDesktopId,
  appDisplayName,
  appLinuxClass,
  buildElectronScopeSpawnArgs,
  ensureDevDesktopEntry,
  ensureNamedElectronExecutable,
  systemdUserScopeAvailable,
} from './electronDevIdentity.mjs'
import { resolveTauriDevRuntime } from './tauriDevRuntime.mjs'
import { selectLinuxCudaRuntime } from '../electron/linux-cuda-runtime.mjs'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const desktopRoot = path.resolve(__dirname, '..')
const vitePlusPackageJson = require.resolve('vite-plus/package.json', { paths: [desktopRoot] })
const vitePlusCliEntry = path.join(path.dirname(vitePlusPackageJson), 'bin', 'vp')

function runStep(command, args, environment = process.env) {
  const result = spawnSync(command, args, {
    cwd: desktopRoot,
    stdio: 'inherit',
    env: environment,
  })

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function electronExecutableFromPathFile(electronPackageRoot) {
  const pathFile = path.join(electronPackageRoot, 'path.txt')
  if (!fs.existsSync(pathFile)) {
    return null
  }

  const executableName = fs.readFileSync(pathFile, 'utf8').trim()
  if (!executableName) {
    return null
  }

  const executablePath = process.env.ELECTRON_OVERRIDE_DIST_PATH
    ? path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, executableName)
    : path.join(electronPackageRoot, 'dist', executableName)

  return fs.existsSync(executablePath) ? executablePath : null
}

function resolveElectronExecutable() {
  const electronPackageJson = require.resolve('electron/package.json', { paths: [desktopRoot] })
  const electronPackageRoot = path.dirname(electronPackageJson)
  const existingExecutable = electronExecutableFromPathFile(electronPackageRoot)
  if (existingExecutable) {
    return existingExecutable
  }

  console.log('Electron binary is missing; running electron install script...')
  runStep(process.execPath, [path.join(electronPackageRoot, 'install.js')])

  const installedExecutable = electronExecutableFromPathFile(electronPackageRoot)
  if (installedExecutable) {
    return installedExecutable
  }

  throw new Error(`Electron install did not create ${path.join(electronPackageRoot, 'path.txt')}`)
}

function waitForDevServer(url) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${url}`)), 30000)
    const probe = async () => {
      try {
        const response = await fetch(url)
        if (response.ok || response.status === 404) {
          clearTimeout(timeout)
          resolve()
          return
        }
      } catch {
        // Retry until the timeout fires.
      }
      setTimeout(probe, 250)
    }
    void probe()
  })
}

const canSignalProcessGroup = process.platform !== 'win32'
const managedProcessGroupPids = new Set()

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function childExit(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    child.once('exit', () => resolve())
  })
}

function signalChild(child, signal, { processGroup = false } = {}) {
  const pid = child?.pid
  if (typeof pid !== 'number') {
    return
  }

  try {
    if (processGroup && canSignalProcessGroup) {
      process.kill(-pid, signal)
    } else {
      child.kill(signal)
    }
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      throw error
    }
  }
}

function trackManagedProcessGroup(child) {
  if (typeof child.pid === 'number') {
    managedProcessGroupPids.add(child.pid)
  }
  return child
}

async function stopChild(child, options = {}) {
  const pid = child?.pid
  if (typeof pid !== 'number') {
    return
  }

  signalChild(child, 'SIGTERM', options)

  try {
    const exited = await Promise.race([childExit(child).then(() => true), delay(2500).then(() => false)])
    if (!exited) {
      signalChild(child, 'SIGKILL', options)
      await childExit(child)
    }
  } finally {
    managedProcessGroupPids.delete(pid)
  }
}

function cleanupManagedProcessGroups() {
  for (const pid of managedProcessGroupPids) {
    try {
      if (canSignalProcessGroup) {
        process.kill(-pid, 'SIGTERM')
      } else {
        process.kill(pid, 'SIGTERM')
      }
    } catch (error) {
      if (error?.code !== 'ESRCH') {
        throw error
      }
    }
  }
}

const cargoEnvironment = { ...process.env }
if (process.platform === 'linux') {
  const cudaRuntime = selectLinuxCudaRuntime({ environment: process.env })
  cargoEnvironment.ORT_CUDA_VERSION = cudaRuntime.version ?? '13'
  for (const providerName of ['libonnxruntime_providers_shared.so', 'libonnxruntime_providers_cuda.so']) {
    fs.rmSync(path.join(desktopRoot, 'src-tauri/target/debug', providerName), { force: true })
  }
}
runStep('cargo', ['build', '--manifest-path', 'src-tauri/Cargo.toml', '--bin', 'modforge_sidecar'], cargoEnvironment)
runStep(process.execPath, ['scripts/build-electron-main.mjs'])

const runtime = await resolveTauriDevRuntime(process.env)
const devUrl = runtime.configOverride.build.devUrl
const vite = trackManagedProcessGroup(
  spawn(process.execPath, [vitePlusCliEntry, 'dev', '--configLoader', 'runner'], {
    cwd: desktopRoot,
    env: runtime.env,
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: canSignalProcessGroup,
  }),
)

let electron = null
let shuttingDown = false

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return
  }
  shuttingDown = true

  await Promise.all([stopChild(electron, { processGroup: true }), stopChild(vite, { processGroup: true })])
  process.exit(exitCode)
}

process.on('SIGINT', () => {
  void shutdown(0)
})
process.on('SIGTERM', () => {
  void shutdown(0)
})
process.on('SIGHUP', () => {
  void shutdown(0)
})
process.on('exit', cleanupManagedProcessGroups)
vite.on('exit', (code) => {
  if (!shuttingDown) {
    void shutdown(code ?? 1)
  }
})

function shouldSuppressElectronStderrLine(line) {
  return line.includes('ui/ozone/')
}

function forwardFilteredElectronStderr(stream) {
  let buffer = ''

  stream.on('data', (chunk) => {
    buffer += String(chunk)
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!shouldSuppressElectronStderrLine(line)) {
        process.stderr.write(`${line}\n`)
      }
    }
  })

  stream.on('end', () => {
    if (buffer && !shouldSuppressElectronStderrLine(buffer)) {
      process.stderr.write(buffer)
    }
    buffer = ''
  })
}

try {
  await waitForDevServer(devUrl)
  const electronPath = resolveElectronExecutable()
  const electronExecutablePath = ensureNamedElectronExecutable(electronPath, { desktopRoot })
  ensureDevDesktopEntry(electronExecutablePath, { desktopRoot })
  const remoteDebuggingPort = process.env.MODFORGE_ELECTRON_REMOTE_DEBUGGING_PORT ?? '9222'
  const electronArgs = [
    `--remote-debugging-port=${remoteDebuggingPort}`,
    `--class=${appLinuxClass}`,
    `--app-id=${appDesktopId}`,
    'electron-dist/main.cjs',
  ]
  const useSystemdScope = systemdUserScopeAvailable()
  const electronSpawnTarget = useSystemdScope ? 'systemd-run' : electronExecutablePath
  const electronSpawnArgs = useSystemdScope ? buildElectronScopeSpawnArgs(electronExecutablePath, electronArgs) : electronArgs
  electron = spawn(electronSpawnTarget, electronSpawnArgs, {
    cwd: desktopRoot,
    env: {
      ...runtime.env,
      VITE_DEV_SERVER_URL: devUrl,
      MODFORGE_SIDECAR_PATH: path.join(desktopRoot, 'src-tauri/target/debug/modforge_sidecar'),
      MODFORGE_DESKTOP_ID: appDesktopId,
      MODFORGE_APP_NAME: appDisplayName,
    },
    stdio: ['ignore', 'inherit', 'pipe'],
    detached: canSignalProcessGroup,
  })
  trackManagedProcessGroup(electron)
  forwardFilteredElectronStderr(electron.stderr)
  electron.on('error', (error) => {
    console.error(error)
    void shutdown(1)
  })
  electron.on('exit', (code) => {
    void shutdown(code ?? 0)
  })
} catch (error) {
  console.error(error)
  await shutdown(1)
}
