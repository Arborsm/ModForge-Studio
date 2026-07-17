import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, realpathSync, rmSync } from 'node:fs'
import path from 'node:path'

const desktopRoot = path.resolve(import.meta.dirname, '..')
const targetRoot = path.join(desktopRoot, 'src-tauri/target/release')
const runtimeRoot = path.join(targetRoot, 'ort-runtime')
const cudaVersion = '13'
const providerNames = ['libonnxruntime_providers_shared.so', 'libonnxruntime_providers_cuda.so']

function removeCopiedProviders() {
  for (const providerName of providerNames) {
    rmSync(path.join(targetRoot, providerName), { force: true })
  }
}

function buildRuntime() {
  removeCopiedProviders()
  const result = spawnSync('cargo', ['build', '--manifest-path', 'src-tauri/Cargo.toml', '--release', '--bin', 'modforge_sidecar'], {
    cwd: desktopRoot,
    stdio: 'inherit',
    env: { ...process.env, ORT_CUDA_VERSION: cudaVersion },
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`CUDA ${cudaVersion} sidecar build exited with status ${result.status}`)
  }

  const destination = path.join(runtimeRoot, `cuda${cudaVersion}`)
  rmSync(destination, { recursive: true, force: true })
  mkdirSync(destination, { recursive: true })
  cpSync(path.join(targetRoot, 'modforge_sidecar'), path.join(destination, 'modforge_sidecar'))
  for (const providerName of providerNames) {
    const providerPath = realpathSync(path.join(targetRoot, providerName))
    cpSync(providerPath, path.join(destination, providerName))
  }
}

rmSync(runtimeRoot, { recursive: true, force: true })
buildRuntime()
