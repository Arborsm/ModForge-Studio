const { spawnSync } = require('node:child_process')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const desktopRoot = path.resolve(__dirname, '..')
const tauriCliEntry = path.resolve(desktopRoot, '../../node_modules/@tauri-apps/cli/tauri.js')

async function main() {
  const userArgs = process.argv.slice(2)
  let args = [tauriCliEntry, ...userArgs]
  let env = process.env

  if (userArgs[0] === 'dev' && !userArgs.includes('--config')) {
    const runtimeModuleUrl = pathToFileURL(path.resolve(__dirname, './tauriDevRuntime.mjs')).href
    const { resolveTauriDevRuntime } = await import(runtimeModuleUrl)
    const runtime = await resolveTauriDevRuntime(process.env)

    env = runtime.env
    args = [tauriCliEntry, ...userArgs, '--config', JSON.stringify(runtime.configOverride)]
  }

  const result = spawnSync(process.execPath, args, {
    cwd: desktopRoot,
    env,
    stdio: 'inherit',
  })

  if (typeof result.status === 'number') {
    process.exit(result.status)
  }

  if (result.error) {
    throw result.error
  }

  process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
