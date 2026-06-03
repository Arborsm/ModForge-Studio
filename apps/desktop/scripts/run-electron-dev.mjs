import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveTauriDevRuntime } from './tauriDevRuntime.mjs'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const desktopRoot = path.resolve(__dirname, '..')
const vitePackageJson = require.resolve('vite/package.json', { paths: [desktopRoot] })
const viteCliEntry = path.join(path.dirname(vitePackageJson), 'bin', 'vite.js')

function runStep(command, args) {
  const result = spawnSync(command, args, {
    cwd: desktopRoot,
    stdio: 'inherit',
    env: process.env,
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

runStep('cargo', ['build', '--manifest-path', 'src-tauri/Cargo.toml', '--bin', 'modforge_sidecar'])
runStep(process.execPath, ['scripts/build-electron-main.mjs'])

const runtime = await resolveTauriDevRuntime(process.env)
const devUrl = runtime.configOverride.build.devUrl
const vite = spawn(process.execPath, [viteCliEntry, '--configLoader', 'runner'], {
  cwd: desktopRoot,
  env: runtime.env,
  stdio: 'inherit',
})

let electron = null
let shuttingDown = false

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  electron?.kill()
  vite.kill()
  process.exit(exitCode)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
vite.on('exit', (code) => {
  if (!shuttingDown) {
    shutdown(code ?? 1)
  }
})

await waitForDevServer(devUrl)
const electronPath = resolveElectronExecutable()
const remoteDebuggingPort = process.env.MODFORGE_ELECTRON_REMOTE_DEBUGGING_PORT ?? '9222'
electron = spawn(electronPath, [`--remote-debugging-port=${remoteDebuggingPort}`, 'electron-dist/main.cjs'], {
  cwd: desktopRoot,
  env: {
    ...runtime.env,
    VITE_DEV_SERVER_URL: devUrl,
    MODFORGE_SIDECAR_PATH: path.join(desktopRoot, 'src-tauri/target/debug/modforge_sidecar'),
  },
  stdio: 'inherit',
})
electron.on('exit', (code) => shutdown(code ?? 0))
