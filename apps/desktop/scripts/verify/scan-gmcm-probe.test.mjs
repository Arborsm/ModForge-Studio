import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const scannerPath = path.join(scriptDir, 'scan-gmcm-probe.mjs')

void test('rejects invalid timeout values before scanning', async () => {
  await withTempRoot(async (root) => {
    const fixture = await createFixture(root, { validManifest: true })
    for (const timeout of ['499', '10001', 'invalid']) {
      const result = await runScanner(fixture, { timeout })
      assert.notEqual(result.code, 0)
      assert.match(result.stderr, /--timeout-ms must be an integer between 500 and 10000/)
      assert.equal(existsSync(fixture.outputPath), false)
    }
  })
})

void test('reports a malformed manifest as an explicit manifest error', async () => {
  await withTempRoot(async (root) => {
    const fixture = await createFixture(root, { validManifest: false })
    const result = await runScanner(fixture)

    assert.equal(result.code, 0, result.stderr)
    const report = await readReport(fixture.outputPath)
    assert.equal(report.results.length, 1)
    assert.equal(report.results[0].probe.status, 'manifest-error')
    assert.match(report.results[0].entryDllError, /manifest\.json could not be parsed/i)
    assert.equal(report.summary.byProbeStatus['manifest-error'], 1)
    assert.equal(existsSync(fixture.pidPath), false, 'the probe must not run for an invalid manifest')
  })
})

void test('accepts a UTF-8 BOM in manifest JSON', async () => {
  await withTempRoot(async (root) => {
    const fixture = await createFixture(root, { validManifest: true, manifestBom: true })
    const result = await runScanner(fixture)

    assert.equal(result.code, 0, result.stderr)
    const report = await readReport(fixture.outputPath)
    assert.equal(report.results.length, 1)
    assert.equal(report.results[0].probe.status, 'succeeded')
    assert.equal(report.results[0].entryDllError, undefined)
  })
})

void test('does not count framework-only GMCM references as capture failures', async () => {
  await withTempRoot(async (root) => {
    const fixture = await createFixture(root, { validManifest: true })
    const result = await runScanner(fixture, { mode: 'framework-only' })

    assert.equal(result.code, 0, result.stderr)
    const report = await readReport(fixture.outputPath)
    assert.equal(report.results[0].probe.status, 'not-run')
    assert.equal(report.results[0].probe.gmcmDetected, true)
    assert.equal(report.summary.gmcmDetected, 1)
    assert.equal(report.summary.gmcmFailures, 0)
  })
})

void test('terminates the probe process tree when output exceeds the limit', async () => {
  await withTempRoot(async (root) => {
    const fixture = await createFixture(root, { validManifest: true })
    const result = await runScanner(fixture, { mode: 'output-limit' })

    assert.equal(result.code, 0, result.stderr)
    const report = await readReport(fixture.outputPath)
    assert.equal(report.results[0].probe.status, 'output-limit')
    assert.equal(report.summary.byProbeStatus['output-limit'], 1)
    await assertRecordedProcessesExited(fixture.pidPath)
  })
})

void test('settles within the absolute deadline and cleans descendants after timeout', async () => {
  await withTempRoot(async (root) => {
    const fixture = await createFixture(root, { validManifest: true })
    const result = await runScanner(fixture, { mode: 'timeout', timeout: '500' })

    assert.equal(result.code, 0, result.stderr)
    assert.ok(result.durationMs < 5_000, `scanner took ${result.durationMs}ms to settle`)
    const report = await readReport(fixture.outputPath)
    assert.equal(report.results[0].probe.status, 'timed-out')
    assert.equal(report.summary.byProbeStatus['timed-out'], 1)
    await assertRecordedProcessesExited(fixture.pidPath)
  })
})

async function createFixture(root, { validManifest, manifestBom = false }) {
  const modsRoot = path.join(root, 'Mods')
  const modRoot = path.join(modsRoot, 'FixtureMod')
  const outputPath = path.join(root, 'scan.json')
  const probePath = path.join(root, 'fake-probe.mjs')
  const pidPath = path.join(root, 'probe-pids.json')
  await mkdir(modRoot, { recursive: true })
  await writeFile(
    path.join(modRoot, 'manifest.json'),
    `${manifestBom ? '\uFEFF' : ''}${
      validManifest
        ? JSON.stringify({ Name: 'Scanner Fixture', UniqueID: 'ModForge.ScannerFixture', EntryDll: 'Fixture.dll' })
        : '{ "Name": "Broken manifest",'
    }`,
  )
  if (validManifest) {
    await writeFile(path.join(modRoot, 'Fixture.dll'), '')
  }
  await writeFile(probePath, fakeProbeSource())
  return { modsRoot, outputPath, probePath, pidPath }
}

async function runScanner(fixture, { mode = 'success', timeout = '500' } = {}) {
  const args = [
    scannerPath,
    '--mods',
    fixture.modsRoot,
    '--probe',
    fixture.probePath,
    '--output',
    fixture.outputPath,
    '--timeout-ms',
    timeout,
  ]
  const startedAt = Date.now()
  const child = spawn(process.execPath, args, {
    env: {
      ...process.env,
      MODFORGE_SCANNER_TEST_MODE: mode,
      MODFORGE_SCANNER_TEST_PID_PATH: fixture.pidPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString()
  })

  return await new Promise((resolve, reject) => {
    const watchdog = setTimeout(() => {
      terminateProcessTree(child.pid)
      reject(new Error(`scanner test watchdog expired\nstdout:\n${stdout}\nstderr:\n${stderr}`))
    }, 8_000)
    child.on('error', (error) => {
      clearTimeout(watchdog)
      reject(error)
    })
    child.on('close', (code, signal) => {
      clearTimeout(watchdog)
      resolve({ code, signal, stdout, stderr, durationMs: Date.now() - startedAt })
    })
  })
}

async function readReport(outputPath) {
  return JSON.parse(await readFile(outputPath, 'utf8'))
}

async function assertRecordedProcessesExited(pidPath) {
  const pids = JSON.parse(await readFile(pidPath, 'utf8'))
  const deadline = Date.now() + 2_500
  while (Date.now() < deadline && pids.some(isProcessAlive)) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.deepEqual(pids.filter(isProcessAlive), [], `scanner left probe processes running: ${pids.join(', ')}`)
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

function terminateProcessTree(pid) {
  if (!pid) {
    return
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    return
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // The process may already be gone.
  }
}

async function withTempRoot(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'modforge-gmcm-scanner-'))
  const pidPath = path.join(root, 'probe-pids.json')
  try {
    await run(root)
  } finally {
    if (existsSync(pidPath)) {
      try {
        const pids = JSON.parse(await readFile(pidPath, 'utf8'))
        for (const pid of pids) {
          terminateProcessTree(pid)
        }
      } catch {
        // Best-effort cleanup for a partially written PID file.
      }
    }
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

function fakeProbeSource() {
  return `
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const mode = process.env.MODFORGE_SCANNER_TEST_MODE ?? 'success'
const pidPath = process.env.MODFORGE_SCANNER_TEST_PID_PATH
if (mode === 'success') {
  console.log(JSON.stringify({ probeStatus: 'succeeded', fields: [], warnings: [], diagnostics: {} }))
  process.exit(0)
}
if (mode === 'framework-only') {
  console.log(JSON.stringify({
    probeStatus: 'not-run',
    fields: [],
    warnings: [],
    diagnostics: { gmcmDetected: true, gmcmFieldsCaptured: 0 },
  }))
  process.exit(0)
}

const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
  stdio: 'ignore',
  windowsHide: true,
})
writeFileSync(pidPath, JSON.stringify([process.pid, descendant.pid]))

if (mode === 'output-limit') {
  process.stderr.write('x'.repeat(5 * 1024 * 1024))
}
setInterval(() => {}, 1000)
`
}
