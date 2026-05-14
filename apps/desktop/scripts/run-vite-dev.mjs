import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveTauriDevRuntime } from './tauriDevRuntime.mjs'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const desktopRoot = path.resolve(__dirname, '..')
const vitePackageJson = require.resolve('vite/package.json', { paths: [desktopRoot] })
const viteCliEntry = path.join(path.dirname(vitePackageJson), 'bin', 'vite.js')
const runtime = await resolveTauriDevRuntime(process.env)
const result = spawnSync(process.execPath, [viteCliEntry, '--configLoader', 'runner'], {
  cwd: desktopRoot,
  env: runtime.env,
  stdio: 'inherit',
})

if (typeof result.status === 'number') {
  process.exit(result.status)
}

if (result.error) {
  throw result.error
}

process.exit(1)
