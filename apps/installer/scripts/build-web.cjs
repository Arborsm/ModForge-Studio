// Type-check + frontend bundle for the installer, resolving the vp/tsc binaries
// from this package's node_modules (mirrors apps/desktop/scripts/build-web.cjs).
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const installerRoot = path.resolve(__dirname, '..')
const vitePlusPackageJson = require.resolve('vite-plus/package.json', { paths: [installerRoot] })
const vitePlusCliEntry = path.join(path.dirname(vitePlusPackageJson), 'bin', 'vp')
const typescriptPackageJson = require.resolve('typescript/package.json', { paths: [installerRoot] })
const typescriptManifest = require(typescriptPackageJson)
const typescriptCliEntry = path.resolve(path.dirname(typescriptPackageJson), typescriptManifest.bin.tsc)

const typeCheckOnly = process.argv.includes('--type-check-only')

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: installerRoot,
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`)
  }
}

for (const config of ['tsconfig.json', 'tsconfig.node.json']) {
  run(process.execPath, [typescriptCliEntry, '--noEmit', '-p', config])
}

if (!typeCheckOnly) {
  run(process.execPath, [vitePlusCliEntry, 'build', '--configLoader', 'runner'])
}
