const { spawnSync } = require('node:child_process')
const path = require('node:path')

const desktopRoot = path.resolve(__dirname, '..')
const tauriCliEntry = path.resolve(desktopRoot, '../../node_modules/@tauri-apps/cli/tauri.js')
const args = [tauriCliEntry, ...process.argv.slice(2)]

const result = spawnSync(process.execPath, args, {
  cwd: desktopRoot,
  stdio: 'inherit',
})

if (typeof result.status === 'number') {
  process.exit(result.status)
}

if (result.error) {
  throw result.error
}

process.exit(1)
