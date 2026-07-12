const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const desktopRoot = path.resolve(__dirname, '..')
const tauriCliScript = path.join(__dirname, 'run-tauri-cli.cjs')
const tauriRoot = path.join(desktopRoot, 'src-tauri')
const bundleRoot = path.join(tauriRoot, 'target/release/bundle')
const tauriConfig = JSON.parse(fs.readFileSync(path.join(tauriRoot, 'tauri.conf.json'), 'utf8'))
const productName = tauriConfig.productName
const version = tauriConfig.version
const appBundlePath = path.join(bundleRoot, 'macos', `${productName}.app`)
const dmgRoot = path.join(bundleRoot, 'dmg')
const archNames = {
  arm64: 'aarch64',
  x64: 'x64',
}
const archName = archNames[process.arch] ?? process.arch
const dmgPath = path.join(dmgRoot, `${productName}_${version}_${archName}.dmg`)

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: desktopRoot,
    stdio: 'inherit',
    ...options,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`)
  }
}

function hasOfficialSigningConfig(env) {
  return Boolean(env.APPLE_CERTIFICATE?.trim() && env.APPLE_CERTIFICATE_PASSWORD?.trim() && env.APPLE_SIGNING_IDENTITY?.trim())
}

function runOfficialRelease() {
  run(process.execPath, [tauriCliScript, 'build'])
}

function withoutAppleSigningEnv() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('APPLE_')) {
      delete env[key]
    }
  }
  return env
}

function runAdHocRelease() {
  run(process.execPath, [tauriCliScript, 'build', '--bundles', 'app'], {
    env: withoutAppleSigningEnv(),
  })

  if (!fs.existsSync(appBundlePath)) {
    throw new Error(`Missing macOS app bundle: ${appBundlePath}`)
  }

  fs.mkdirSync(dmgRoot, { recursive: true })
  fs.rmSync(dmgPath, { force: true })

  run('codesign', ['--force', '--deep', '--options', 'runtime', '--sign', '-', appBundlePath])
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appBundlePath])
  run('hdiutil', ['create', '-volname', productName, '-srcfolder', appBundlePath, '-ov', '-format', 'UDZO', dmgPath])
}

function main() {
  if (process.platform !== 'darwin') {
    throw new Error('macOS release packaging must run on macOS.')
  }

  if (hasOfficialSigningConfig(process.env)) {
    runOfficialRelease()
    return
  }

  runAdHocRelease()
}

main()
