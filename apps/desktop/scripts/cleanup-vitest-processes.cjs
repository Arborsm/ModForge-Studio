const { execFileSync } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')

const desktopRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopRoot, '..', '..')
const dryRun = process.argv.includes('--dry-run')

function normalize(value) {
  return String(value ?? '').replaceAll('/', path.sep).toLowerCase()
}

function parseWindowsProcesses(output) {
  const trimmed = output.trim()
  if (!trimmed) {
    return []
  }

  const parsed = JSON.parse(trimmed)
  return (Array.isArray(parsed) ? parsed : [parsed]).map((entry) => ({
    pid: Number(entry.ProcessId),
    ppid: Number(entry.ParentProcessId),
    name: String(entry.Name ?? ''),
    commandLine: String(entry.CommandLine ?? ''),
  }))
}

function listWindowsProcesses() {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$processes = Get-CimInstance Win32_Process -Filter \"Name = 'node.exe' OR Name = 'vitest.exe'\"",
    "if ($null -eq $processes) { '' } else { $processes | Select-Object ProcessId, ParentProcessId, Name, CommandLine | ConvertTo-Json -Compress }",
  ].join('; ')

  const output = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', windowsHide: true },
  )

  return parseWindowsProcesses(output)
}

function listPosixProcesses() {
  const output = execFileSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' })

  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/u)
      if (!match) {
        return null
      }

      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        name: '',
        commandLine: match[3],
      }
    })
    .filter(Boolean)
}

function listProcesses() {
  return os.platform() === 'win32' ? listWindowsProcesses() : listPosixProcesses()
}

function isCurrentProcess(processInfo) {
  return processInfo.pid === process.pid || processInfo.pid === process.ppid
}

function isRepoVitestProcess(processInfo) {
  const commandLine = normalize(processInfo.commandLine)
  const isTestRunner =
    commandLine.includes('vitest') ||
    commandLine.includes(`${path.sep}tinypool${path.sep}`) ||
    commandLine.includes(`${path.sep}@vitest${path.sep}`)
  if (!isTestRunner) {
    return false
  }

  return commandLine.includes(normalize(repoRoot)) || commandLine.includes(normalize(desktopRoot))
}

function killProcess(processInfo) {
  if (dryRun) {
    return
  }

  try {
    process.kill(processInfo.pid, 'SIGTERM')
  } catch (error) {
    if (error && error.code === 'ESRCH') {
      return
    }

    throw error
  }
}

function main() {
  if (process.env.MODFORGE_SKIP_VITEST_CLEANUP === '1') {
    console.log('[test-cleanup] skipped by MODFORGE_SKIP_VITEST_CLEANUP=1')
    return
  }

  const staleProcesses = listProcesses().filter((processInfo) => !isCurrentProcess(processInfo) && isRepoVitestProcess(processInfo))

  if (staleProcesses.length === 0) {
    return
  }

  for (const processInfo of staleProcesses) {
    killProcess(processInfo)
  }

  const action = dryRun ? 'would stop' : 'stopped'
  const processList = staleProcesses.map((processInfo) => `${processInfo.pid}`).join(', ')
  console.log(`[test-cleanup] ${action} stale Vitest process(es): ${processList}`)
}

try {
  main()
} catch (error) {
  console.warn(`[test-cleanup] unable to inspect stale Vitest processes: ${error instanceof Error ? error.message : String(error)}`)
}
