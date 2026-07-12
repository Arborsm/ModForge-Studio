import { lstat, readdir, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SHMEM_DIR_NAME = 'shared_memory-rs'
const SHMEM_FILE_PREFIX = 'shmem_'

function resolveSharedMemoryDir() {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    return path.join(localAppData, 'Temp', SHMEM_DIR_NAME)
  }

  return path.join(os.tmpdir(), SHMEM_DIR_NAME)
}

async function tryUnlink(filePath) {
  try {
    await unlink(filePath)
    return { status: 'deleted', path: filePath }
  } catch (error) {
    const code = error?.code
    if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
      return { status: 'locked', path: filePath }
    }

    if (code === 'ENOENT') {
      return { status: 'missing', path: filePath }
    }

    return { status: 'error', path: filePath, error }
  }
}

export async function cleanupSharedMemory(options = {}) {
  const { dryRun = false } = options
  const shmemDir = resolveSharedMemoryDir()

  let entries = []
  try {
    entries = await readdir(shmemDir)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { dir: shmemDir, deleted: 0, locked: 0, skipped: 0, bytes: 0 }
    }

    throw error
  }

  const candidates = entries.filter((name) => name.startsWith(SHMEM_FILE_PREFIX))
  const results = []
  let deleted = 0
  let locked = 0
  let skipped = 0
  let bytes = 0

  for (const name of candidates) {
    const filePath = path.join(shmemDir, name)
    let size = 0

    try {
      const stats = await lstat(filePath)
      if (!stats.isFile()) {
        skipped += 1
        results.push({ status: 'skipped', path: filePath, reason: 'not-a-file' })
        continue
      }

      size = stats.size
    } catch (error) {
      skipped += 1
      results.push({ status: 'skipped', path: filePath, reason: error?.code || 'stat-failed' })
      continue
    }

    if (dryRun) {
      results.push({ status: 'dry-run', path: filePath, size })
      bytes += size
      continue
    }

    const result = await tryUnlink(filePath)
    results.push({ ...result, size })

    if (result.status === 'deleted') {
      deleted += 1
      bytes += size
    } else if (result.status === 'locked') {
      locked += 1
    } else {
      skipped += 1
    }
  }

  return { dir: shmemDir, deleted, locked, skipped, bytes, results }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const verbose = process.argv.includes('--verbose') || dryRun
  const result = await cleanupSharedMemory({ dryRun })

  if (dryRun) {
    console.log(`[dry-run] Shared memory directory: ${result.dir}`)
  } else {
    console.log(`Cleaned up shared memory directory: ${result.dir}`)
  }

  console.log(
    `  deleted: ${result.deleted}, locked/in-use: ${result.locked}, skipped: ${result.skipped}, freed: ${(result.bytes / 1024 / 1024 / 1024).toFixed(2)} GB`,
  )

  if (verbose && result.results?.length) {
    for (const item of result.results) {
      const size = item.size != null ? ` (${(item.size / 1024 / 1024 / 1024).toFixed(2)} GB)` : ''
      console.log(`  ${item.status}: ${item.path}${size}`)
    }
  }
}

function isMainModule() {
  try {
    const modulePath = fileURLToPath(import.meta.url)
    const invokedPath = path.resolve(process.argv[1] ?? '')
    return path.resolve(modulePath) === invokedPath
  } catch {
    return false
  }
}

if (isMainModule()) {
  await main()
}
