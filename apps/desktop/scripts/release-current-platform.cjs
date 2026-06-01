const { spawnSync } = require('node:child_process')

const releaseScripts = {
  linux: 'release:linux',
  darwin: 'release:macos',
  win32: 'release:windows',
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`)
  }
}

const releaseScript = releaseScripts[process.platform]

if (!releaseScript) {
  throw new Error(`Unsupported release platform: ${process.platform}`)
}

run('pnpm', [releaseScript])
run('pnpm', ['release:collect'])
