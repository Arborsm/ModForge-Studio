import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = path.join(desktopRoot, 'dist')
const manifest = JSON.parse(await readFile(path.join(distRoot, '.vite', 'manifest.json'), 'utf8'))
const budgets = JSON.parse(await readFile(path.join(desktopRoot, 'scripts', 'performance', 'chunk-budgets.json'), 'utf8'))

function collectReachable(roots) {
  const reached = new Set()
  const pending = [...roots]
  while (pending.length) {
    const key = pending.pop()
    if (!key || reached.has(key)) continue
    const entry = manifest[key]
    if (!entry) throw new Error(`Vite manifest entry is missing: ${key}`)
    reached.add(key)
    pending.push(...(entry.imports ?? []))
  }
  return reached
}

async function incrementalBytes(roots, baseReachable) {
  const files = new Set()
  for (const key of collectReachable(roots)) {
    if (baseReachable.has(key)) continue
    const entry = manifest[key]
    files.add(entry.file)
    for (const css of entry.css ?? []) files.add(css)
  }
  let bytes = 0
  for (const file of files) bytes += (await stat(path.join(distRoot, file))).size
  return { bytes, files: [...files].sort((left, right) => left.localeCompare(right)) }
}

const appEntry = Object.entries(manifest).find(([, entry]) => entry.isEntry)?.[0]
if (!appEntry) throw new Error('Vite manifest does not contain an application entry')
const appReachable = collectReachable([appEntry])
const settings = await incrementalBytes(['src/app/app-shell/SettingsWindow.tsx'], appReachable)
const workbench = await incrementalBytes(
  [
    'src/pages/workbench/index.ts',
    'src/app/registry-setup.ts',
    'src/app/registry.ts',
    'src/app/providers/CpMakerPlatformProvider.tsx',
    'src/pages/workbench/ui/WorkbenchExperience.tsx',
    'src/styles/workbench.css',
  ],
  appReachable,
)

const report = {
  settingsShell: { ...settings, budgetBytes: budgets.settingsShellBytes },
  workbenchShell: { ...workbench, budgetBytes: budgets.workbenchShellBytes },
}
console.log(JSON.stringify(report, null, 2))

const failures = Object.entries(report).filter(([, value]) => value.bytes > value.budgetBytes)
if (failures.length) throw new Error(`Chunk budgets exceeded: ${JSON.stringify(Object.fromEntries(failures), null, 2)}`)
