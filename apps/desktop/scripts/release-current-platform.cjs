const { spawnSync } = require('node:child_process')

const path = require('node:path')

const releaseCommands = {
  linux: [process.execPath, [path.join(__dirname, 'build-electron-release.cjs')]],
  darwin: [process.execPath, [path.join(__dirname, 'release-macos.cjs')]],
  win32: [process.execPath, [path.join(__dirname, 'run-tauri-cli.cjs'), 'build', '--verbose', '--bundles', 'nsis']],
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`)
  }
}

const releaseCommand = releaseCommands[process.platform]

if (!releaseCommand) {
  throw new Error(`Unsupported release platform: ${process.platform}`)
}

run(...releaseCommand)
run(process.execPath, [path.join(__dirname, 'collect-release-artifacts.cjs')])
