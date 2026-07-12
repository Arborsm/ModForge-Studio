const { spawnSync } = require('node:child_process')
const path = require('node:path')

const desktopRoot = path.resolve(__dirname, '..')
const vitePlusPackageJson = require.resolve('vite-plus/package.json', { paths: [desktopRoot] })
const vitePlusCliEntry = path.join(path.dirname(vitePlusPackageJson), 'bin', 'vp')
const typescriptPackageJson = require.resolve('typescript/package.json', { paths: [desktopRoot] })
const typescriptManifest = require(typescriptPackageJson)
const typescriptCliEntry = path.resolve(path.dirname(typescriptPackageJson), typescriptManifest.bin.tsc)

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: desktopRoot,
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`)
  }
}

for (const config of ['tsconfig.app.json', 'tsconfig.node.json', 'tsconfig.electron.json']) {
  run(process.execPath, [typescriptCliEntry, '--noEmit', '-p', config])
}
run(process.execPath, [vitePlusCliEntry, 'build', '--configLoader', 'runner'])
