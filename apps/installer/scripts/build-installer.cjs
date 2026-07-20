/**
 * ModForge Studio Installer build script.
 *
 * Steps:
 * 1. Build the ModForge Studio desktop app exe (optional, `--skip-app-build` to reuse).
 * 2. Prepare the installer payload from the built app binaries
 *    (`src-tauri/payload/` + sha256 `payload-manifest.json`).
 * 3. Build the installer exe (`tauri build --no-bundle`).
 *
 * Usage:
 *   node scripts/build-installer.cjs [--skip-app-build] [--dev] [--help]
 */

const { execSync } = require('child_process')
const { createHash } = require('crypto')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(ROOT, '..', '..')
const DESKTOP_ROOT = path.join(REPO_ROOT, 'apps', 'desktop')
const DESKTOP_RELEASE_DIR = path.join(DESKTOP_ROOT, 'src-tauri', 'target', 'release')
const PAYLOAD_DIR = path.join(ROOT, 'src-tauri', 'payload')
const APP_EXE_NAME = 'modforge_studio_desktop.exe'
const INSTALLER_EXE_NAME = 'modforge-installer.exe'
/** The app resolves the probe at `<exe_dir>/gmcm-probe/...`, so it must ship next to the exe. */
const REQUIRED_RUNTIME_DIRS = ['gmcm-probe']
/** Runtime sibling directories copied into the payload when present. */
const OPTIONAL_RUNTIME_DIRS = ['resources']

const rawArgs = process.argv.slice(2)
const skipAppBuild = rawArgs.includes('--skip-app-build')
const isDev = rawArgs.includes('--dev')
const showHelp = rawArgs.includes('--help') || rawArgs.includes('-h')
const STRICT_PAYLOAD_VALIDATION = !isDev
const MIN_APP_EXE_BYTES = 5 * 1024 * 1024

function log(msg) {
  console.log(`\x1b[36m[installer]\x1b[0m ${msg}`)
}

function error(msg) {
  console.error(`\x1b[31m[installer]\x1b[0m ${msg}`)
  process.exit(1)
}

function run(cmd, cwd = ROOT) {
  log(`> ${cmd} (cwd: ${cwd})`)
  try {
    execSync(cmd, { cwd, stdio: 'inherit' })
  } catch (_e) {
    error(`Command failed: ${cmd}`)
  }
}

function printHelpAndExit() {
  console.log(`
ModForge Studio Installer build script

Usage:
  node scripts/build-installer.cjs [options]

Options:
  --skip-app-build   Skip building the main desktop app; reuse the existing
                     exe + gmcm-probe/ in apps/desktop/src-tauri/target/release/
  --dev              Run the installer with tauri dev instead of tauri build
                     and allow placeholder payload fallback
  --help, -h         Show this help
`)
  process.exit(0)
}

function ensureCleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  fs.mkdirSync(dir, { recursive: true })
}

function sha256File(filePath) {
  const content = fs.readFileSync(filePath)
  return createHash('sha256').update(content).digest('hex')
}

function writeFileWithManifest(src, dest, manifest, payloadRoot) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  const size = fs.statSync(dest).size
  const rel = path.relative(payloadRoot, dest).replace(/\\/g, '/')
  manifest.files.push({
    path: rel,
    size,
    sha256: sha256File(dest),
  })
}

function copyDirRecursiveWithManifest(srcDir, destDir, manifest, payloadRoot) {
  fs.mkdirSync(destDir, { recursive: true })
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name)
    const dest = path.join(destDir, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursiveWithManifest(src, dest, manifest, payloadRoot)
      continue
    }
    writeFileWithManifest(src, dest, manifest, payloadRoot)
  }
}

function shouldCopySiblingRuntimeFile(fileName, appExeBaseName) {
  if (fileName === appExeBaseName) return false

  const lower = fileName.toLowerCase()
  if (lower.startsWith('.cargo')) return false

  if (lower.endsWith('.pdb') || lower.endsWith('.d') || lower.endsWith('.exp') || lower.endsWith('.lib') || lower.endsWith('.ilk')) {
    return false
  }

  return true
}

function getCandidateAppExePaths() {
  const candidates = [path.join(DESKTOP_RELEASE_DIR, APP_EXE_NAME)]
  if (!STRICT_PAYLOAD_VALIDATION) {
    candidates.push(path.join(DESKTOP_ROOT, 'src-tauri', 'target', 'debug', APP_EXE_NAME))
  }
  return candidates
}

if (showHelp) {
  printHelpAndExit()
}

if (isDev) {
  log('Installer run mode: dev')
} else {
  log('Installer run mode: release (strict payload validation)')
}

// Step 1: Build the main desktop app (no NSIS bundle — the installer IS the bundle).
if (!skipAppBuild) {
  log('Step 1: Building ModForge Studio desktop app (--no-bundle)...')
  run('node ./scripts/run-tauri-cli.cjs build --no-bundle', DESKTOP_ROOT)
} else {
  log('Step 1: Skipped (--skip-app-build)')
}

// Step 2: Prepare payload.
log('Step 2: Preparing installer payload...')

const possiblePaths = getCandidateAppExePaths()
let appExePath = null
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    appExePath = p
    break
  }
}

if (!appExePath && STRICT_PAYLOAD_VALIDATION) {
  error(
    `Could not find built desktop executable for payload (expected ${possiblePaths[0]}). ` +
      'Build the desktop app first or run with --dev for local debug.',
  )
}

if (appExePath) {
  ensureCleanDir(PAYLOAD_DIR)

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceExe: appExePath,
    files: [],
  }

  const destExe = path.join(PAYLOAD_DIR, APP_EXE_NAME)
  writeFileWithManifest(appExePath, destExe, manifest, PAYLOAD_DIR)
  log(`Copied: ${appExePath} -> ${destExe}`)

  const exeSize = fs.statSync(destExe).size
  if (STRICT_PAYLOAD_VALIDATION && exeSize < MIN_APP_EXE_BYTES) {
    error(`${APP_EXE_NAME} in payload is unexpectedly small (${exeSize} bytes). Refusing to continue.`)
  }

  const releaseDir = path.dirname(appExePath)
  const appExeBaseName = path.basename(appExePath)

  // Runtime sibling files the exe needs next to it (DLLs, sidecar tools, etc.).
  const siblingFiles = fs
    .readdirSync(releaseDir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((file) => shouldCopySiblingRuntimeFile(file, appExeBaseName))

  for (const file of siblingFiles) {
    const src = path.join(releaseDir, file)
    const dest = path.join(PAYLOAD_DIR, file)
    writeFileWithManifest(src, dest, manifest, PAYLOAD_DIR)
    log(`Copied runtime file: ${file}`)
  }

  // gmcm-probe/ is mandatory: the app resolves the probe relative to the exe dir.
  for (const dirName of REQUIRED_RUNTIME_DIRS) {
    const srcDir = path.join(releaseDir, dirName)
    if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
      if (STRICT_PAYLOAD_VALIDATION) {
        error(`Required runtime directory ${srcDir} is missing. Rebuild the desktop app.`)
      }
      log(`Warning: required runtime directory missing (dev mode): ${dirName}`)
      continue
    }
    copyDirRecursiveWithManifest(srcDir, path.join(PAYLOAD_DIR, dirName), manifest, PAYLOAD_DIR)
    log(`Copied runtime directory: ${dirName}`)
  }

  for (const dirName of OPTIONAL_RUNTIME_DIRS) {
    const srcDir = path.join(releaseDir, dirName)
    if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
      continue
    }
    copyDirRecursiveWithManifest(srcDir, path.join(PAYLOAD_DIR, dirName), manifest, PAYLOAD_DIR)
    log(`Copied runtime directory: ${dirName}`)
  }

  const manifestPath = path.join(PAYLOAD_DIR, 'payload-manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  log(`Wrote payload manifest: ${manifestPath}`)

  if (STRICT_PAYLOAD_VALIDATION && manifest.files.length === 0) {
    error('Payload manifest has no files. Refusing to build installer.')
  }
} else {
  log('No app executable found. Payload directory will be empty (dev-only fallback).')
  ensureCleanDir(PAYLOAD_DIR)
}

// Step 3: Build the installer itself.
log('Step 3: Building installer...')
run('node ./scripts/run-tauri-cli.cjs ' + (isDev ? 'dev' : 'build --no-bundle'), ROOT)

if (isDev) {
  log(`Output directory: ${path.join(ROOT, 'src-tauri', 'target', 'debug')}`)
} else {
  log('Installer build complete.')
  log(`Output: ${path.join(ROOT, 'src-tauri', 'target', 'release', INSTALLER_EXE_NAME)}`)
}
