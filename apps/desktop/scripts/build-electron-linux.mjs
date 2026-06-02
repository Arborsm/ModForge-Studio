import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const targets = process.argv.slice(2)
const linuxTargets = targets.length > 0 ? targets : ['deb', 'rpm', 'AppImage']
const desktopRoot = path.resolve(import.meta.dirname, '..')
const repoRoot = path.resolve(desktopRoot, '../..')
const cacheRoot = path.join(repoRoot, '.tmp', 'electron-builder-cache')

mkdirSync(cacheRoot, { recursive: true })

const result = spawnSync('electron-builder', ['--linux', ...linuxTargets], {
  cwd: desktopRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_BUILDER_CACHE: cacheRoot,
    XDG_CACHE_HOME: cacheRoot,
  },
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
