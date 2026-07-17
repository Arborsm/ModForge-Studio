import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { resolveLinuxOrtSidecar, selectLinuxCudaRuntime } from '../electron/linux-cuda-runtime.mjs'

function cuda13Libraries() {
  return new Set(['libcublasLt.so.13', 'libcublas.so.13', 'libcudart.so.13', 'libcufft.so.12', 'libcurand.so.10', 'libcudnn.so.9'])
}

void test('selects the packaged CUDA 13 runtime when all dependencies exist', () => {
  assert.deepEqual(selectLinuxCudaRuntime({ loaderNames: cuda13Libraries(), searchDirectories: [] }), {
    version: '13',
    reason: 'detected',
  })
})

void test('keeps CUDA 13 selected while reporting CPU fallback readiness', () => {
  assert.deepEqual(selectLinuxCudaRuntime({ loaderNames: new Set(), searchDirectories: [] }), { version: '13', reason: 'cpu-fallback' })
})

void test('requires cuDNN in addition to the CUDA toolkit runtime', () => {
  const loaderNames = cuda13Libraries()
  loaderNames.delete('libcudnn.so.9')
  assert.deepEqual(selectLinuxCudaRuntime({ loaderNames, searchDirectories: [] }), {
    version: '13',
    reason: 'cpu-fallback',
  })
})

void test('adds CUDA_HOME libraries to the packaged sidecar environment', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'modforge-cuda-runtime-'))
  try {
    const binDirectory = path.join(root, 'bin')
    const runtimeDirectory = path.join(binDirectory, 'ort/cuda13')
    const cudaHome = path.join(root, 'cuda')
    const cudaLibraryDirectory = path.join(cudaHome, 'lib64')
    mkdirSync(runtimeDirectory, { recursive: true })
    mkdirSync(cudaLibraryDirectory, { recursive: true })
    writeFileSync(path.join(runtimeDirectory, 'modforge_sidecar'), '')
    writeFileSync(path.join(cudaLibraryDirectory, 'libcudart.so.13'), '')

    const resolved = resolveLinuxOrtSidecar(binDirectory, { CUDA_HOME: cudaHome, PATH: process.env.PATH })
    assert.equal(resolved.path, path.join(runtimeDirectory, 'modforge_sidecar'))
    assert.ok(resolved.libraryDirectories.includes(runtimeDirectory))
    assert.ok(resolved.libraryDirectories.includes(cudaLibraryDirectory))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
