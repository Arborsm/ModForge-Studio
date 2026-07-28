import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Builds the ModForge Debug Bridge SMAPI mod and stages an installable mod folder
// under tools/debug-bridge/dist/ModForgeDebugBridge. The desktop app's
// install_debug_bridge_mod host command copies that folder into the game's Mods dir.
const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(scriptDir, '..')
const projectDir = resolve(desktopRoot, 'tools/debug-bridge')
const projectPath = resolve(projectDir, 'ModForge.DebugBridge.csproj')
const buildOutput = resolve(projectDir, 'bin/Release')
const distDir = resolve(projectDir, 'dist/ModForgeDebugBridge')

function run(command, args) {
  const result = spawnSync(command, args, { cwd: desktopRoot, stdio: 'inherit', shell: false })
  if (result.error) {
    throw new Error(`Failed to start ${command}: ${result.error.message}`, { cause: result.error })
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 'unknown'}`)
  }
}

run('dotnet', ['build', projectPath, '-c', 'Release'])

const assemblyPath = resolve(buildOutput, 'ModForge.DebugBridge.dll')
if (!existsSync(assemblyPath)) {
  throw new Error(`Build did not produce ${assemblyPath}`)
}

rmSync(distDir, { recursive: true, force: true })
mkdirSync(distDir, { recursive: true })
copyFileSync(assemblyPath, resolve(distDir, 'ModForge.DebugBridge.dll'))
copyFileSync(resolve(projectDir, 'manifest.json'), resolve(distDir, 'manifest.json'))

console.log(`Debug bridge mod staged at ${distDir}`)
