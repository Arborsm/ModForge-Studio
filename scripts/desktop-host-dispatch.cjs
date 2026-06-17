const { spawnSync } = require('node:child_process')
const path = require('node:path')

const [, , mode = 'dev', ...extraArgs] = process.argv
const isLinux = process.platform === 'linux'

if (isLinux && mode === 'dev') {
  const desktopRoot = path.resolve(__dirname, '..', 'apps', 'desktop')
  const result = spawnSync(process.execPath, ['./scripts/run-electron-dev.mjs', ...extraArgs], {
    cwd: desktopRoot,
    stdio: 'inherit',
    env: process.env,
  })

  if (result.error) {
    throw result.error
  }

  process.exit(result.status ?? 1)
}

const script = isLinux ? (mode === 'build' ? 'electron:build' : 'electron:dev') : mode === 'build' ? 'tauri build' : 'tauri dev'
const args = ['--filter', '@modforge/desktop', ...script.split(' '), ...extraArgs]
const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'vp'
const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'vp.cmd', 'run', ...args] : ['run', ...args]
const result = spawnSync(command, commandArgs, { stdio: 'inherit' })

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
