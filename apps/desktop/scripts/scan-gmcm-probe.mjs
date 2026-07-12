import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(desktopRoot, '..', '..')

const args = parseArgs(process.argv.slice(2))
const modsRoot = path.resolve(args.mods ?? path.join(repoRoot, '.tmp', 'test-mods'))
const gamePath = args.game ? path.resolve(args.game) : undefined
const probePath = path.resolve(args.probe ?? defaultProbePath())
const outputPath = path.resolve(args.output ?? path.join(repoRoot, '.tmp', 'gmcm-probe-scan.json'))
const timeoutMs = parseTimeoutMs(args['timeout-ms'] ?? args.timeoutMs ?? 10_000)
const maxOutputBytes = 4 * 1024 * 1024

if (!existsSync(modsRoot)) {
  throw new Error(`Mods root does not exist: ${modsRoot}`)
}
if (!existsSync(probePath)) {
  throw new Error(`Probe executable does not exist: ${probePath}`)
}

const modDirs = findManifestDirs(modsRoot)

const results = []
for (const modDir of modDirs) {
  const manifest = readJsonIfExists(path.join(modDir, 'manifest.json'))
  const content = readJsonIfExists(path.join(modDir, 'content.json'))
  const config = readJsonIfExists(path.join(modDir, 'config.json'))
  const manifestError = manifest?.__parseError
  const entryDll = manifestError
    ? { declared: true, exists: false, relativePath: undefined, error: `manifest.json could not be parsed: ${manifestError}` }
    : resolveManifestEntryDll(modDir, manifest)
  const dlls = entryDll.exists && entryDll.relativePath ? [entryDll.relativePath] : []
  const contentPackFor = readContentPackFor(manifest)
  const cpSchema = readConfigSchema(manifest) ?? readConfigSchema(content)
  const result = {
    name: manifest?.Name ?? path.basename(modDir),
    uniqueId: manifest?.UniqueID ?? path.basename(modDir),
    path: modDir,
    contentPackFor,
    hasDll: dlls.length > 0,
    dlls,
    entryDll: entryDll.relativePath,
    entryDllError: entryDll.error,
    hasConfigJson: config !== undefined,
    configKeys: config && typeof config === 'object' && !Array.isArray(config) ? Object.keys(config).length : 0,
    hasContentPatcherSchema: cpSchema !== undefined,
    contentPatcherSchemaKeys: cpSchema ? Object.keys(cpSchema).length : 0,
    probe: undefined,
  }

  if (manifestError || entryDll.error) {
    result.probe = {
      status: 'manifest-error',
      fieldCount: 0,
      warnings: [entryDll.error],
    }
  } else if (entryDll.declared) {
    result.probe = await runProbe(modDir)
  }

  results.push(result)
}

const summary = summarize(results)
const report = {
  generatedAt: new Date().toISOString(),
  modsRoot,
  gamePath,
  probePath,
  summary,
  results,
}

mkdirSync(path.dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)

console.log(JSON.stringify(summary, null, 2))
console.log(`Wrote ${outputPath}`)

function parseArgs(values) {
  const parsed = {}
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!value.startsWith('--')) {
      continue
    }
    const key = value.slice(2)
    const next = values[index + 1]
    if (next && !next.startsWith('--')) {
      parsed[key] = next
      index += 1
    } else {
      parsed[key] = true
    }
  }
  return parsed
}

function parseTimeoutMs(value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 500 || parsed > 10_000) {
    throw new Error(`--timeout-ms must be an integer between 500 and 10000; received ${String(value)}`)
  }
  return parsed
}

function defaultProbePath() {
  const outputDirectory = path.join(desktopRoot, 'src-tauri', 'target', 'release', 'gmcm-probe')
  const executable = path.join(outputDirectory, process.platform === 'win32' ? 'modforge-gmcm-probe.exe' : 'modforge-gmcm-probe')
  const assembly = path.join(outputDirectory, 'modforge-gmcm-probe.dll')
  return existsSync(executable) ? executable : assembly
}

function findManifestDirs(root) {
  const result = []
  const ignored = new Set(['.git', '.smapi', 'bin', 'obj'])
  const visit = (directory) => {
    if (existsSync(path.join(directory, 'manifest.json'))) {
      result.push(directory)
      return
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || ignored.has(entry.name)) {
        continue
      }
      visit(path.join(directory, entry.name))
    }
  }
  visit(root)
  return result.sort((left, right) => left.localeCompare(right))
}

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) {
    return undefined
  }

  try {
    return JSON.parse(stripJsonComments(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')))
  } catch (error) {
    return { __parseError: error instanceof Error ? error.message : String(error) }
  }
}

function stripJsonComments(text) {
  let output = ''
  let inString = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (inString) {
      output += char
      escaped = char === '\\' && !escaped
      if (char === '"' && !escaped) {
        inString = false
      }
      if (char !== '\\') {
        escaped = false
      }
      continue
    }
    if (char === '"') {
      inString = true
      output += char
      continue
    }
    if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') {
        index += 1
      }
      output += '\n'
      continue
    }
    if (char === '/' && next === '*') {
      index += 2
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
        index += 1
      }
      index += 1
      continue
    }
    output += char
  }
  return output.replace(/,\s*([}\]])/g, '$1')
}

function readContentPackFor(manifest) {
  const raw = manifest?.ContentPackFor
  if (!raw || typeof raw !== 'object') {
    return undefined
  }
  return raw.UniqueID ?? raw.UniqueId ?? raw.uniqueId
}

function readConfigSchema(json) {
  const schema = json?.ConfigSchema
  return schema && typeof schema === 'object' && !Array.isArray(schema) ? schema : undefined
}

function resolveManifestEntryDll(modDir, manifest) {
  if (!manifest || typeof manifest !== 'object' || !Object.hasOwn(manifest, 'EntryDll')) {
    return { declared: false, exists: false, relativePath: undefined, error: undefined }
  }
  if (typeof manifest.EntryDll !== 'string' || !manifest.EntryDll.trim()) {
    return { declared: true, exists: false, relativePath: undefined, error: 'EntryDll is not a non-empty string.' }
  }

  const relativePath = manifest.EntryDll.trim()
  const candidate = path.resolve(modDir, relativePath)
  const relative = path.relative(modDir, candidate)
  if (path.isAbsolute(relativePath) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    return { declared: true, exists: false, relativePath, error: 'EntryDll escapes the mod directory.' }
  }
  if (path.extname(candidate).toLowerCase() !== '.dll') {
    return { declared: true, exists: false, relativePath, error: 'EntryDll does not reference a DLL.' }
  }
  if (existsSync(candidate)) {
    try {
      const realRoot = realpathSync(modDir)
      const realCandidate = realpathSync(candidate)
      const realRelative = path.relative(realRoot, realCandidate)
      if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`)) {
        return { declared: true, exists: false, relativePath, error: 'EntryDll resolves outside the mod directory.' }
      }
    } catch (error) {
      return {
        declared: true,
        exists: false,
        relativePath,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
  return {
    declared: true,
    exists: existsSync(candidate),
    relativePath: relative.split(path.sep).join('/'),
    error: existsSync(candidate) ? undefined : 'EntryDll does not exist.',
  }
}

function runProbe(modDir) {
  return new Promise((resolve) => {
    const probeArgs = ['--mod-path', modDir, '--timeout-ms', String(timeoutMs)]
    if (gamePath) {
      probeArgs.push('--game-path', gamePath)
    }

    const isNodeScript = /\.[cm]?js$/i.test(probePath)
    const command = isNodeScript ? process.execPath : probePath.toLowerCase().endsWith('.dll') ? 'dotnet' : probePath
    const commandArgs = isNodeScript || command === 'dotnet' ? [probePath, ...probeArgs] : probeArgs
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    })
    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    let settled = false
    let termination
    let absoluteSettle
    let timeout
    const terminationResult = (code) => ({
      status: termination.status,
      exitCode: code,
      fieldCount: 0,
      warnings: [termination.warning],
      stderr: stderr.trim() || undefined,
    })
    const finish = (value) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      clearTimeout(absoluteSettle)
      resolve(value)
    }
    const terminate = (status, warning) => {
      if (termination || settled) {
        return
      }
      termination = { status, warning }
      terminateProcessTree(child)
      absoluteSettle = setTimeout(() => {
        child.stdout.destroy()
        child.stderr.destroy()
        child.kill('SIGKILL')
        finish(terminationResult(null))
      }, 1_500)
    }
    timeout = setTimeout(() => {
      terminate('timed-out', 'GMCM probe exceeded the configured timeout.')
    }, timeoutMs + 750)
    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length
      if (stdoutBytes > maxOutputBytes) {
        terminate('output-limit', `GMCM probe stdout exceeded ${maxOutputBytes} bytes.`)
        return
      }
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length
      if (stderrBytes > maxOutputBytes) {
        terminate('output-limit', `GMCM probe stderr exceeded ${maxOutputBytes} bytes.`)
        return
      }
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      finish(termination ? terminationResult(null) : { status: 'spawn-error', fieldCount: 0, warnings: [error.message], stderr })
    })
    child.on('close', (code) => {
      if (termination) {
        finish(terminationResult(code))
        return
      }
      let parsed
      try {
        parsed = JSON.parse(stdout.trim())
      } catch {
        finish({
          status: 'invalid-json',
          exitCode: code,
          fieldCount: 0,
          warnings: stdout.trim() ? [stdout.trim().slice(0, 500)] : [],
          stderr: stderr.trim(),
        })
        return
      }
      finish({
        status: parsed.probeStatus ?? 'unknown',
        exitCode: code,
        fieldCount: Array.isArray(parsed.fields) ? parsed.fields.length : 0,
        gmcmFieldCount: parsed.diagnostics?.gmcmFieldsCaptured ?? 0,
        staticFieldCount: parsed.diagnostics?.staticFieldsCaptured ?? 0,
        gmcmDetected: parsed.diagnostics?.gmcmDetected ?? false,
        captureStrategy: parsed.diagnostics?.captureStrategy,
        failureStage: parsed.diagnostics?.failureStage,
        warningCount: Array.isArray(parsed.warnings) ? parsed.warnings.length : 0,
        warnings: parsed.warnings ?? [],
        diagnostics: parsed.diagnostics,
        stderr: stderr.trim() || undefined,
      })
    })
  })
}

function terminateProcessTree(child) {
  if (!child.pid) {
    return
  }
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    killer.on('error', () => child.kill('SIGKILL'))
    killer.on('close', (code) => {
      if (code !== 0) {
        child.kill('SIGKILL')
      }
    })
    killer.unref()
    return
  }

  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
}

function summarize(items) {
  const byProbeStatus = {}
  const byContentPackFor = {}
  for (const item of items) {
    if (item.probe) {
      byProbeStatus[item.probe.status] = (byProbeStatus[item.probe.status] ?? 0) + 1
    }
    const contentPackFor = item.contentPackFor ?? '<root-or-dll>'
    byContentPackFor[contentPackFor] = (byContentPackFor[contentPackFor] ?? 0) + 1
  }

  const gmcmSuccesses = items
    .filter((item) => (item.probe?.gmcmFieldCount ?? 0) > 0)
    .map((item) => ({
      name: item.name,
      uniqueId: item.uniqueId,
      fields: item.probe.gmcmFieldCount,
      warnings: item.probe.warningCount,
    }))

  return {
    manifestCount: items.length,
    dllMods: items.filter((item) => item.hasDll).length,
    contentPacks: items.filter((item) => item.contentPackFor).length,
    contentPatcherPacks: items.filter((item) => item.contentPackFor === 'Pathoschild.ContentPatcher').length,
    contentPatcherSchemaPacks: items.filter((item) => item.hasContentPatcherSchema).length,
    configJsonPacks: items.filter((item) => item.hasConfigJson).length,
    byContentPackFor,
    byProbeStatus,
    gmcmDetected: items.filter((item) => item.probe?.gmcmDetected).length,
    gmcmCaptured: gmcmSuccesses.length,
    gmcmFailures: items.filter(
      (item) => item.probe?.gmcmDetected && item.probe?.status === 'unavailable' && (item.probe?.gmcmFieldCount ?? 0) === 0,
    ).length,
    gmcmSuccesses,
  }
}
