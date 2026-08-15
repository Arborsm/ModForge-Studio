import { readdir, readFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const desktopRoot = resolve(__dirname, '..')
const srcDir = resolve(desktopRoot, 'src-tauri/src')

/**
 * Backend architecture gate. Grep-level enforcement of the layering and
 * dependency rules declared in docs/backend-architecture.md (R1-R6).
 *
 * Whitelist entries register known legacy coupling. Each entry is a migration
 * item: fix the coupling, then delete the entry. `--strict` upgrades whitelist
 * hits to violations so migration progress can be measured.
 *
 * Known boundaries of the heuristic: `//` line comments are skipped, the
 * scanner does not parse Rust (tokens inside block comments or macro output
 * can slip through), and whitelists are file-grained (a second violation in an
 * already-listed file does not add a new entry).
 */

/** Binding seam files that may touch the host runtime without a commands.rs name. */
export const SEAM_FILES = new Set(['domain/ai/mod.rs'])

/** R4 migration list: fully migrated in the 2025 refactor batch; kept empty as the hook for any future legacy entry. */
export const NEXUSMODS_LAUNCHER_LEGACY = new Set([])

/** R5 migration list: fully migrated in the 2025 refactor batch; kept empty as the hook for any future legacy entry. */
export const APP_UI_LEGACY = new Set([])

/** R6: the only .rs files allowed directly under src/; everything else enters a layer directory. */
export const ROOT_FILES = ['domain.rs', 'infrastructure.rs', 'lib.rs', 'main.rs', 'support.rs']

export const RULES = {
  infrastructureMustNotTouchDomain: 'R1 infrastructure 禁引 domain',
  supportMustNotTouchDomain: 'R2 support 禁引 domain（app_paths 共享内核例外）',
  domainBusinessMustNotTouchHostRuntime: 'R3 domain 业务文件禁引 host 运行时/传输层（commands.rs 绑定 seam 例外）',
  nexusmodsMustNotTouchLauncher: 'R4 nexusmods 禁引 launcher（launcher → nexusmods 单向）',
  domainsMustNotTouchAppUi: 'R5 业务域禁引 app_ui UI 状态持久化（commands.rs seam 例外）',
  rootFileGate: 'R6 src 根目录文件白名单',
}

/**
 * Analyze a source tree. `files` maps slash-separated paths relative to
 * src-tauri/src (e.g. `domain/launcher/updates.rs`) to their text content.
 * Returns `violations` (rule id, file, 1-based line, snippet) plus `legacy`
 * entries for whitelist hits; with `strict`, legacy entries become violations.
 */
export function analyzeBackendArchitecture(files, { strict = false } = {}) {
  const violations = []
  const legacy = []
  const report = (rule, file, lineNumber, snippet, kind = 'violation') => {
    const entry = { rule, file, lineNumber, snippet }
    if (kind === 'legacy') legacy.push(entry)
    else violations.push(entry)
  }

  for (const [file, content] of files) {
    const lines = content.split('\n')
    const isInfra = file.startsWith('infrastructure/')
    const isSupport = file.startsWith('support/')
    const isDomain = file.startsWith('domain/')
    const isNexusmods = file === 'domain/nexusmods.rs' || file.startsWith('domain/nexusmods/')
    const isAppUi = file.startsWith('domain/app_ui/')
    const isSeam = file.endsWith('commands.rs')
    const isRoot = !file.includes('/')
    const nexusmodsLegacy = NEXUSMODS_LAUNCHER_LEGACY.has(file)
    const appUiLegacy = APP_UI_LEGACY.has(file)

    if (isRoot && !ROOT_FILES.includes(file)) {
      report('rootFileGate', file, 1, '')
    }

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const trimmed = line.trim()
      if (trimmed.startsWith('//')) continue

      if (isInfra && /crate::domain/.test(line)) {
        report('infrastructureMustNotTouchDomain', file, index + 1, trimmed)
      }

      if (isSupport && /crate::domain::/.test(line) && !/app_paths/.test(line)) {
        report('supportMustNotTouchDomain', file, index + 1, trimmed)
      }

      if (isDomain && /crate::(host_runtime|host_commands|sidecar)\b|\btauri::/.test(line)) {
        if (!isSeam && !SEAM_FILES.has(file)) {
          report('domainBusinessMustNotTouchHostRuntime', file, index + 1, trimmed)
        }
      }

      if (isNexusmods && /crate::domain::launcher/.test(line)) {
        report('nexusmodsMustNotTouchLauncher', file, index + 1, trimmed, nexusmodsLegacy ? 'legacy' : 'violation')
      }

      if (isDomain && !isAppUi && !isSeam && !SEAM_FILES.has(file) && /crate::domain::app_ui/.test(line)) {
        report('domainsMustNotTouchAppUi', file, index + 1, trimmed, appUiLegacy ? 'legacy' : 'violation')
      }
    }
  }

  if (strict) {
    violations.push(...legacy)
    legacy.length = 0
  }
  return { violations, legacy }
}

/** Walk src-tauri/src and return a path -> content map; skips src/tests and src/bin. */
export async function scanSourceTree(rootDir = srcDir) {
  const files = new Map()
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        const relDir = relative(rootDir, dir)
        if (relDir === '' && (entry.name === 'tests' || entry.name === 'bin')) continue
        await walk(full)
      } else if (entry.name.endsWith('.rs')) {
        const relDir = relative(rootDir, dir)
        const rel = [...(relDir ? relDir.split(sep) : []), entry.name].join('/')
        files.set(rel, await readFile(full, 'utf8'))
      }
    }
  }
  await walk(rootDir)
  return files
}

async function main() {
  const strict = process.argv.includes('--strict')
  const files = await scanSourceTree()
  const { violations, legacy } = analyzeBackendArchitecture(files, { strict })

  console.log(`Scanned ${files.size} Rust files under ${relative(desktopRoot, srcDir)}`)

  if (violations.length > 0) {
    console.error(`\nBackend architecture violations (${violations.length}):\n`)
    for (const entry of violations) {
      console.error(`  ${entry.rule}  ${entry.file}:${entry.lineNumber}  ${entry.snippet}`)
    }
    console.error('\nRules: docs/backend-architecture.md')
    process.exitCode = 1
  } else if (!strict && legacy.length > 0) {
    console.log(`Backend architecture checks passed (${legacy.length} whitelisted legacy coupling; --strict lists them).`)
  } else {
    console.log('Backend architecture checks passed.')
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) await main()
