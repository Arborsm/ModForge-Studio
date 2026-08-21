/**
 * Builds code-package compat plugins from TSX sources into ready-to-ship bundles.
 *
 * Each compatible plugin lives in `apps/desktop/compat-plugins/<id>/` with its
 * authored source in `src/` (entry: `src/index.tsx`). This script bundles that
 * source to the plugin root `index.js` (the `entry` manifest points at it).
 *
 * Bundling rules:
 * - ESM output, browser platform (default modern esnext target).
 * - `react`, `react-dom`, `react/jsx-runtime` and `@modforge/plugin-sdk` are
 *   external — the host webview injects an import map that resolves them to the
 *   host singletons, so they must never be inlined.
 * - JSX uses the automatic runtime, so the bundle carries a
 *   `from 'react/jsx-runtime'` import instead of inlining `React.createElement`.
 * - Generated bundles are post-processed: fire-and-forget `void f()` markers
 *   that oxc's codegen strips are restored, then the repo formatter (`vp fmt`)
 *   is applied so the committed `index.js` passes both lint and the
 *   lint-staged `vp fmt .` gate.
 *
 * Usage:
 *   node ./scripts/build/build-compat-plugins.mjs            # one-shot build
 *   node ./scripts/build/build-compat-plugins.mjs --watch    # rebuild on change
 */
import { build, watch } from 'rolldown'
import path from 'node:path'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const desktopRoot = path.resolve(__dirname, '../..')
const compatRoot = path.join(desktopRoot, 'compat-plugins')
const require = createRequire(import.meta.url)

// Host-provided singletons via import map (see pluginVendorImportSpecifiers in
// vite.config.ts); keep them external so plugins share the host's instances.
const EXTERNAL = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  '@modforge/plugin-sdk',
  /^@dnd-kit\//,
  /^@floating-ui\//,
  /^@tanstack\//,
  'react-resizable-panels',
  'lucide-react',
  'zustand',
]

/** Discovers plugins that have TSX sources under a `src/` directory. */
function findPlugins() {
  const plugins = []
  for (const name of fs.readdirSync(compatRoot)) {
    const dir = path.join(compatRoot, name)
    if (!fs.statSync(dir).isDirectory()) continue
    const entry = path.join(dir, 'src', 'index.tsx')
    if (fs.existsSync(entry)) {
      plugins.push({ name, dir, entry })
    }
  }
  return plugins
}

/** Shared rolldown options for a plugin build (JSX automatic runtime, externals). */
function buildOptions(entry) {
  return {
    platform: 'browser',
    external: EXTERNAL,
    transform: { jsx: { runtime: 'automatic' } },
    input: entry,
    output: {
      format: 'esm',
      entryFileNames: 'index.js',
    },
  }
}

/**
 * Formats a generated bundle with the repo formatter (`vp fmt`). Rolldown emits
 * tabs/double quotes; the repo's lint-staged gate runs `vp fmt .` over the
 * committed `index.js`, so the build applies the same formatter to its output.
 */
function formatGenerated(filePath) {
  const vitePlusPackageJson = require.resolve('vite-plus/package.json', { paths: [desktopRoot] })
  const vitePlusCliEntry = path.join(path.dirname(vitePlusPackageJson), 'bin', 'vp')
  const result = spawnSync(process.execPath, [vitePlusCliEntry, 'fmt', filePath], {
    cwd: desktopRoot,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`Failed to format ${filePath}: vp fmt exited with status ${result.status}`)
  }
}

// Async audio helpers that the source intentionally fires without awaiting via
// `void playSfx(...)` / `void playBgm(...)`. oxc's bundling codegen drops the
// `void` operator from statement-position calls, which would make the committed
// bundle fail the `no-floating-promises` lint rule; restore the markers here so
// the authored intent survives into the shipped artifact.
const FIRE_AND_FORGET_HELPERS = ['playSfx', 'playBgm']

/**
 * Re-adds `void` before fire-and-forget calls that oxc simplified away, without
 * touching `async function playSfx/playBgm` definitions or already-voided sites.
 */
function restoreFireAndForgetVoid(filePath) {
  const code = fs.readFileSync(filePath, 'utf8')
  const restored = code.replace(new RegExp(`(?<!function )(?<!void )\\b(${FIRE_AND_FORGET_HELPERS.join('|')})\\(`, 'g'), 'void $1(')
  if (restored !== code) fs.writeFileSync(filePath, restored)
}

/** Post-build pass: restore fire-and-forget markers, then apply repo formatting. */
function finalizeGenerated(filePath) {
  restoreFireAndForgetVoid(filePath)
  formatGenerated(filePath)
}

const watchMode = process.argv.includes('--watch')
const plugins = findPlugins()

if (plugins.length === 0) {
  console.error('[build:compat-plugins] No plugins with src/index.tsx found under', compatRoot)
  process.exit(1)
}

if (watchMode) {
  const watchers = plugins.map((plugin) => {
    const options = { ...buildOptions(plugin.entry), output: { ...buildOptions(plugin.entry).output, dir: plugin.dir } }
    const watcher = watch(options)
    watcher.on('event', (event) => {
      if (event.code === 'BUNDLE_START') {
        console.log(`[build:compat-plugins] building ${plugin.name} …`)
      } else if (event.code === 'BUNDLE_END') {
        finalizeGenerated(path.join(plugin.dir, 'index.js'))
        console.log(`[build:compat-plugins] ✓ ${plugin.name} -> index.js (${event.duration}ms)`)
      } else if (event.code === 'ERROR') {
        console.error(`[build:compat-plugins] ✗ failed to build ${plugin.name}:`, event.error)
      }
    })
    return watcher
  })

  const shutdown = async () => {
    await Promise.all(watchers.map((watcher) => watcher.close()))
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
} else {
  for (const plugin of plugins) {
    const options = { ...buildOptions(plugin.entry), output: { ...buildOptions(plugin.entry).output, dir: plugin.dir } }
    await build(options)
    finalizeGenerated(path.join(plugin.dir, 'index.js'))
    console.log(`[build:compat-plugins] ✓ ${plugin.name} -> index.js`)
  }
}
