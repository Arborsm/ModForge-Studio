import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { cleanupSharedMemory } from './cleanup-shared-memory.mjs'
import { resolveTauriDevRuntime } from './tauriDevRuntime.mjs'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const desktopRoot = path.resolve(__dirname, '..')
const vitePlusPackageJson = require.resolve('vite-plus/package.json', { paths: [desktopRoot] })
const vitePlusCliEntry = path.join(path.dirname(vitePlusPackageJson), 'bin', 'vp')
const reactDevtoolsPackageJson = require.resolve('react-devtools/package.json', { paths: [desktopRoot] })
const reactDevtoolsCliEntry = path.join(path.dirname(reactDevtoolsPackageJson), 'bin.js')

function envFlagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(
    String(value ?? '')
      .trim()
      .toLowerCase(),
  )
}

function canStartReactDevtools(env) {
  return envFlagEnabled(env.MODFORGE_REACT_DEVTOOLS)
}

function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    socket.setTimeout(250)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => {
      resolve(false)
    })
  })
}

async function startReactDevtoolsIfNeeded(env) {
  if (!canStartReactDevtools(env) || (await isPortOpen('127.0.0.1', 8097))) {
    return null
  }

  const child = spawn(process.execPath, [reactDevtoolsCliEntry], {
    cwd: desktopRoot,
    env,
    stdio: 'ignore',
    windowsHide: true,
  })

  child.unref()
  return child
}

function stopReactDevtools(child) {
  if (!child || child.exitCode !== null || child.killed) {
    return
  }

  child.kill()
}

const runtime = await resolveTauriDevRuntime(process.env)
const reactDevtools = await startReactDevtoolsIfNeeded(runtime.env)

if (process.platform === 'win32' && !envFlagEnabled(process.env.MODFORGE_SKIP_CLEANUP_SHMEM)) {
  try {
    const result = await cleanupSharedMemory()
    console.log(
      `[dev] Cleaned Tauri shared memory leaks: ${result.deleted} files, ${(result.bytes / 1024 / 1024 / 1024).toFixed(2)} GB freed`,
    )
  } catch (error) {
    console.warn('[dev] Failed to clean up shared memory:', error?.message || error)
  }
}

let result

try {
  result = spawnSync(process.execPath, [vitePlusCliEntry, 'dev', '--configLoader', 'runner'], {
    cwd: desktopRoot,
    env: runtime.env,
    stdio: 'inherit',
  })
} finally {
  stopReactDevtools(reactDevtools)
}

if (typeof result.status === 'number') {
  process.exit(result.status)
}

if (result.error) {
  throw result.error
}

process.exit(1)
