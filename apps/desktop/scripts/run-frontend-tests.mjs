import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createReactActWarningDetector } from './frontend-test-warning-gate.mjs'

const require = createRequire(import.meta.url)
const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const vitePlusPackageJson = require.resolve('vite-plus/package.json', { paths: [desktopRoot] })
const vitePlusCliEntry = path.join(path.dirname(vitePlusPackageJson), 'bin', 'vp')
const warningDetector = createReactActWarningDetector()

const child = spawn(process.execPath, [vitePlusCliEntry, 'test', 'run', '--configLoader', 'runner', ...process.argv.slice(2)], {
  cwd: desktopRoot,
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
})

child.stdout.on('data', (chunk) => process.stdout.write(chunk))
child.stderr.on('data', (chunk) => {
  warningDetector.write(chunk)
  process.stderr.write(chunk)
})

child.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})

child.on('close', (code, signal) => {
  if (signal) {
    console.error(`Frontend tests terminated by signal ${signal}.`)
    process.exitCode = 1
    return
  }
  if (code !== 0) {
    process.exitCode = code ?? 1
    return
  }
  if (warningDetector.hasWarning()) {
    console.error('Frontend tests emitted a React act(...) warning.')
    process.exitCode = 1
  }
})
