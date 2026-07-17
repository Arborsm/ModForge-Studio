import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const packagedCudaVersion = '13'
const commonCudaLibraries = ['libcurand.so.10', 'libcudnn.so.9']

function requiredCudaLibraries() {
  return ['libcublasLt.so.13', 'libcublas.so.13', 'libcudart.so.13', 'libcufft.so.12', ...commonCudaLibraries]
}

function librarySearchDirectories(environment) {
  const directories = new Set(
    (environment.LD_LIBRARY_PATH ?? '')
      .split(path.delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean),
  )
  for (const directory of [
    '/usr/lib',
    '/usr/lib64',
    '/usr/local/lib',
    '/usr/local/lib64',
    '/usr/local/cuda/lib64',
    '/opt/cuda/lib64',
    '/opt/cuda/targets/x86_64-linux/lib',
  ]) {
    directories.add(directory)
  }
  for (const cudaHome of [environment.CUDA_HOME, environment.CUDA_PATH]) {
    if (cudaHome?.trim()) {
      directories.add(path.join(cudaHome.trim(), 'lib64'))
      directories.add(path.join(cudaHome.trim(), 'targets/x86_64-linux/lib'))
    }
  }
  for (const root of ['/usr/local', '/opt']) {
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory() && /^cuda(?:-|$)/.test(entry.name)) {
          directories.add(path.join(root, entry.name, 'lib64'))
          directories.add(path.join(root, entry.name, 'targets/x86_64-linux/lib'))
        }
      }
    } catch {
      // Optional CUDA installation roots may not exist.
    }
  }
  return [...directories]
}

function loaderLibraryNames(environment) {
  const result = spawnSync('ldconfig', ['-p'], {
    encoding: 'utf8',
    env: environment,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return new Set()
  }
  return new Set(
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/)[0])
      .filter(Boolean),
  )
}

function hasLibrary(name, loaderNames, searchDirectories) {
  if (loaderNames.has(name)) {
    return true
  }
  return searchDirectories.some((directory) => existsSync(path.join(directory, name)))
}

/** Reports whether the packaged CUDA 13 ORT runtime can load on this host. */
export function selectLinuxCudaRuntime({
  environment = process.env,
  loaderNames = loaderLibraryNames(environment),
  searchDirectories = librarySearchDirectories(environment),
} = {}) {
  if (requiredCudaLibraries().every((name) => hasLibrary(name, loaderNames, searchDirectories))) {
    return { version: packagedCudaVersion, reason: 'detected' }
  }
  return { version: packagedCudaVersion, reason: 'cpu-fallback' }
}

/** Resolves the packaged CUDA 13 Linux sidecar. */
export function resolveLinuxOrtSidecar(binDirectory, environment = process.env) {
  const runtimeDirectory = path.join(binDirectory, 'ort', 'cuda13')
  if (!existsSync(path.join(runtimeDirectory, 'modforge_sidecar'))) {
    return {
      path: path.join(binDirectory, 'modforge_sidecar'),
      libraryDirectories: [binDirectory],
      version: null,
      reason: 'unversioned',
    }
  }

  const selection = selectLinuxCudaRuntime({ environment })
  const cudaLibraryDirectories = librarySearchDirectories(environment).filter((directory) =>
    requiredCudaLibraries().some((name) => existsSync(path.join(directory, name))),
  )
  return {
    path: path.join(runtimeDirectory, 'modforge_sidecar'),
    libraryDirectories: [runtimeDirectory, ...cudaLibraryDirectories],
    ...selection,
  }
}
