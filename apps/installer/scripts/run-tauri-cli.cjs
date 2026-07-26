// Thin wrapper that resolves the Tauri CLI from this package's node_modules
// and forwards all arguments (mirrors apps/desktop/scripts/run-tauri-cli.cjs).
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const installerRoot = path.resolve(__dirname, '..')
const tauriCliEntry = require.resolve('@tauri-apps/cli/tauri.js', { paths: [installerRoot] })

const result = spawnSync(process.execPath, [tauriCliEntry, ...process.argv.slice(2)], {
  cwd: installerRoot,
  stdio: 'inherit',
})

if (typeof result.status === 'number') {
  process.exit(result.status)
}

if (result.error) {
  throw result.error
}

process.exit(1)
