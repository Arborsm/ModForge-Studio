const { spawn, spawnSync } = require('node:child_process')
const path = require('node:path')

const [, , mode = 'dev', ...extraArgs] = process.argv
const isLinux = process.platform === 'linux'

if (isLinux && mode === 'dev') {
  const desktopRoot = path.resolve(__dirname, '..', 'apps', 'desktop')
  const child = spawn(process.execPath, ['./scripts/run-electron-dev.mjs', ...extraArgs], {
    cwd: desktopRoot,
    stdio: 'inherit',
    env: process.env,
  })

  let shuttingDown = false

  function forwardSignal(signal) {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    child.kill(signal)
  }

  child.on('error', (error) => {
    throw error
  })
  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 0 : 1))
  })

  process.once('SIGINT', () => forwardSignal('SIGINT'))
  process.once('SIGTERM', () => forwardSignal('SIGTERM'))
  process.once('SIGHUP', () => forwardSignal('SIGHUP'))

  return
}

const desktopRoot = path.resolve(__dirname, '..', 'apps', 'desktop')
const command = isLinux ? 'vp' : process.execPath
const commandArgs = isLinux
  ? ['run', '--filter', '@modforge/desktop', mode === 'build' ? 'electron:build' : 'electron:dev', ...extraArgs]
  : [path.join(desktopRoot, 'scripts', 'run-tauri-cli.cjs'), mode === 'build' ? 'build' : 'dev', ...extraArgs]
const result = spawnSync(command, commandArgs, { cwd: desktopRoot, stdio: 'inherit' })

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
