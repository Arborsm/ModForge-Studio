const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const desktopRoot = path.resolve(__dirname, '..')
const tauriCliEntry = require.resolve('@tauri-apps/cli/tauri.js', { paths: [desktopRoot] })
const tauriManifest = path.join(desktopRoot, 'src-tauri/Cargo.toml')

function resolveTauriCliCommand(userArgs) {
  return {
    command: process.execPath,
    args: [tauriCliEntry, ...userArgs],
  }
}

function readTauriManifest() {
  try {
    return fs.readFileSync(tauriManifest, 'utf8')
  } catch {
    return null
  }
}

function restoreTauriManifest(snapshot) {
  if (snapshot === null) {
    return
  }

  const current = readTauriManifest()
  if (current !== snapshot) {
    fs.writeFileSync(tauriManifest, snapshot)
  }
}

async function main() {
  const userArgs = process.argv.slice(2)
  let env = process.env
  let { command, args } = resolveTauriCliCommand(userArgs)

  if (userArgs[0] === 'dev' && !userArgs.includes('--config')) {
    const runtimeModuleUrl = pathToFileURL(path.resolve(__dirname, './tauriDevRuntime.mjs')).href
    const { resolveTauriDevRuntime } = await import(runtimeModuleUrl)
    const runtime = await resolveTauriDevRuntime(env)

    env = runtime.env
    ;({ command, args } = resolveTauriCliCommand([...userArgs, '--config', JSON.stringify(runtime.configOverride)]))
  }

  const tauriManifestSnapshot = readTauriManifest()
  const result = spawnSync(command, args, {
    cwd: desktopRoot,
    env,
    stdio: 'inherit',
  })
  restoreTauriManifest(tauriManifestSnapshot)

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
