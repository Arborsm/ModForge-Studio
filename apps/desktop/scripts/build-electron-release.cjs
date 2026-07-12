const { spawnSync } = require('node:child_process')
const path = require('node:path')

const desktopRoot = path.resolve(__dirname, '..')

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: desktopRoot,
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`)
  }
}

function runNode(script, args = []) {
  run(process.execPath, [path.join(__dirname, script), ...args])
}

runNode('build-web.cjs')
run('cargo', ['build', '--manifest-path', 'src-tauri/Cargo.toml', '--release', '--bin', 'modforge_sidecar'])
runNode('build-gmcm-probe.mjs')
runNode('build-electron-main.mjs')
runNode('build-electron-linux.mjs', process.argv.slice(2))
