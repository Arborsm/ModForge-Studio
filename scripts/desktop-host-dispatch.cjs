const { spawnSync } = require('node:child_process')

const [, , mode = 'dev', ...extraArgs] = process.argv
const isLinux = process.platform === 'linux'
const script = isLinux ? (mode === 'build' ? 'electron:build' : 'electron:dev') : mode === 'build' ? 'tauri build' : 'tauri dev'
const args = ['--filter', '@modforge/desktop', ...script.split(' '), ...extraArgs]
const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'pnpm'
const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm.cmd', ...args] : args
const result = spawnSync(command, commandArgs, { stdio: 'inherit' })

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
