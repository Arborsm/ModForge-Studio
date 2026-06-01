const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const desktopRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(desktopRoot, '../..')
const tauriCliEntry = require.resolve('@tauri-apps/cli/tauri.js', { paths: [desktopRoot] })
const tauriManifest = path.join(desktopRoot, 'src-tauri/Cargo.toml')
const tauriLockfile = path.join(desktopRoot, 'src-tauri/Cargo.lock')

function withLinuxCefPath(env) {
  if (process.platform !== 'linux' || env.CEF_PATH?.trim()) {
    return env
  }

  return {
    ...env,
    CEF_PATH: env.MODFORGE_CEF_PATH?.trim() || path.join(workspaceRoot, '.cache/cef'),
  }
}

function resolvePatchedTauriRevision() {
  try {
    const lockfile = fs.readFileSync(tauriLockfile, 'utf8')
    const match = lockfile.match(/source = "git\+https:\/\/github\.com\/tauri-apps\/tauri\?branch=feat\/cef#([0-9a-f]{40})"/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

function checkoutHeadMatches(checkoutPath, expectedRevision) {
  if (!expectedRevision) {
    return false
  }

  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: checkoutPath,
    encoding: 'utf8',
  })

  return result.status === 0 && result.stdout.trim() === expectedRevision
}

function findPatchedTauriCliManifest(env) {
  if (process.platform !== 'linux') {
    return null
  }

  const expectedRevision = resolvePatchedTauriRevision()
  if (!expectedRevision) {
    return null
  }

  const cargoHome = env.CARGO_HOME?.trim() || path.join(env.HOME || '', '.cargo')
  const gitCheckoutsRoot = path.join(cargoHome, 'git/checkouts')

  try {
    const checkoutRoots = fs.readdirSync(gitCheckoutsRoot).filter((name) => name.startsWith('tauri-'))
    for (const checkoutRoot of checkoutRoots) {
      const checkoutPath = path.join(gitCheckoutsRoot, checkoutRoot)
      const revisions = fs.readdirSync(checkoutPath)

      for (const revision of revisions) {
        const revisionPath = path.join(checkoutPath, revision)
        const manifest = path.join(revisionPath, 'crates/tauri-cli/Cargo.toml')
        if (fs.existsSync(manifest) && checkoutHeadMatches(revisionPath, expectedRevision)) {
          return manifest
        }
      }
    }
  } catch {
    return null
  }

  return null
}

function ensurePatchedTauriCheckout(env) {
  let manifest = findPatchedTauriCliManifest(env)
  if (manifest || process.platform !== 'linux') {
    return manifest
  }

  const result = spawnSync('cargo', ['fetch', '--manifest-path', tauriManifest], {
    cwd: desktopRoot,
    env,
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    return null
  }

  manifest = findPatchedTauriCliManifest(env)
  return manifest
}

function resolveTauriCliCommand(userArgs, env) {
  const patchedTauriCliManifest = ensurePatchedTauriCheckout(env)
  const args =
    process.platform === 'linux' && ['build', 'dev'].includes(userArgs[0])
      ? [userArgs[0], '--features', 'cef-runtime', ...userArgs.slice(1)]
      : userArgs

  if (!patchedTauriCliManifest) {
    return {
      command: process.execPath,
      args: [tauriCliEntry, ...args],
    }
  }

  return {
    command: 'cargo',
    args: ['run', '--manifest-path', patchedTauriCliManifest, '--bin', 'cargo-tauri', '--', ...args],
  }
}

async function main() {
  const userArgs = process.argv.slice(2)
  let env = withLinuxCefPath(process.env)
  let { command, args } = resolveTauriCliCommand(userArgs, env)

  if (userArgs[0] === 'dev' && !userArgs.includes('--config')) {
    const runtimeModuleUrl = pathToFileURL(path.resolve(__dirname, './tauriDevRuntime.mjs')).href
    const { resolveTauriDevRuntime } = await import(runtimeModuleUrl)
    const runtime = await resolveTauriDevRuntime(env)

    env = runtime.env
    ;({ command, args } = resolveTauriCliCommand([...userArgs, '--config', JSON.stringify(runtime.configOverride)], env))
  }

  const result = spawnSync(command, args, {
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
