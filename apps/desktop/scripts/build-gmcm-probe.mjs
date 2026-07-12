import { spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(scriptDir, '..')
const repoRoot = resolve(desktopRoot, '../..')
const coreInterfacesProjectPath = resolve(desktopRoot, 'tools/gmcm-probe/SmapiCoreInterfacesShim.csproj')
const harmonyProjectPath = resolve(desktopRoot, 'tools/gmcm-probe/HarmonyShim.csproj')
const projectPath = resolve(desktopRoot, 'tools/gmcm-probe/GmcmProbe.csproj')
const outputPath = resolve(desktopRoot, 'src-tauri/target/release/gmcm-probe')
const dotnetSdkVersion = '8.0.419'
const dotnetRuntimeVersion = '6.0.36'
const localDotnetRoot = resolve(repoRoot, '.dotnet')
const dotnetExecutableName = process.platform === 'win32' ? 'dotnet.exe' : 'dotnet'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: desktopRoot,
    stdio: 'inherit',
    ...options,
  })

  if (result.error) {
    throw new Error(`Failed to start ${command}: ${result.error.message}`, { cause: result.error })
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 'unknown'}`)
  }
}

function dotnetInventory(dotnetExecutable, argument) {
  const result = spawnSync(dotnetExecutable, [argument], {
    cwd: desktopRoot,
    encoding: 'utf8',
  })

  return result.status === 0 ? result.stdout.split(/\r?\n/u) : []
}

function hasRequiredDotnet(dotnetExecutable) {
  const hasSdk = dotnetInventory(dotnetExecutable, '--list-sdks').some((line) => Number.parseInt(line, 10) >= 8)
  const hasRuntime = dotnetInventory(dotnetExecutable, '--list-runtimes').some((line) =>
    line.startsWith(`Microsoft.NETCore.App ${dotnetRuntimeVersion} `),
  )
  return hasSdk && hasRuntime
}

function existingDotnetExecutable() {
  const candidates = ['dotnet', resolve(localDotnetRoot, dotnetExecutableName), resolve(homedir(), '.dotnet', dotnetExecutableName)]

  return candidates.find(hasRequiredDotnet)
}

async function installDotnetSdk() {
  const installScriptUrl = process.platform === 'win32' ? 'https://dot.net/v1/dotnet-install.ps1' : 'https://dot.net/v1/dotnet-install.sh'
  const tempRoot = mkdtempSync(join(tmpdir(), 'modforge-dotnet-install-'))
  const installScriptPath = join(tempRoot, process.platform === 'win32' ? 'dotnet-install.ps1' : 'dotnet-install.sh')

  try {
    console.log(
      `.NET SDK ${dotnetSdkVersion} and .NET Runtime ${dotnetRuntimeVersion} are required; installing them into ${localDotnetRoot}...`,
    )
    const response = await fetch(installScriptUrl)
    if (!response.ok) {
      throw new Error(`Failed to download ${installScriptUrl}: HTTP ${response.status}`)
    }
    writeFileSync(installScriptPath, Buffer.from(await response.arrayBuffer()))

    if (process.platform === 'win32') {
      const installArguments = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installScriptPath]
      run('powershell.exe', [...installArguments, '-Version', dotnetSdkVersion, '-InstallDir', localDotnetRoot, '-NoPath'])
      run('powershell.exe', [
        ...installArguments,
        '-Runtime',
        'dotnet',
        '-Version',
        dotnetRuntimeVersion,
        '-InstallDir',
        localDotnetRoot,
        '-NoPath',
      ])
    } else {
      run('bash', [installScriptPath, '--version', dotnetSdkVersion, '--install-dir', localDotnetRoot, '--no-path'])
      run('bash', [
        installScriptPath,
        '--runtime',
        'dotnet',
        '--version',
        dotnetRuntimeVersion,
        '--install-dir',
        localDotnetRoot,
        '--no-path',
      ])
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }

  const dotnetExecutable = resolve(localDotnetRoot, dotnetExecutableName)
  if (!hasRequiredDotnet(dotnetExecutable)) {
    throw new Error(
      `.NET installation did not provide an SDK compatible with C# 12 and Runtime ${dotnetRuntimeVersion} at ${dotnetExecutable}`,
    )
  }
  return dotnetExecutable
}

const dotnetExecutable = existingDotnetExecutable() ?? (await installDotnetSdk())
const dotnetRoot = isAbsolute(dotnetExecutable) ? dirname(dotnetExecutable) : process.env.DOTNET_ROOT
const dotnetEnvironment = {
  ...process.env,
  DOTNET_CLI_TELEMETRY_OPTOUT: '1',
  ...(dotnetRoot ? { DOTNET_ROOT: dotnetRoot } : {}),
  ...(dotnetRoot ? { PATH: `${dotnetRoot}${delimiter}${process.env.PATH ?? ''}` } : {}),
}

if (dotnetRoot && process.env.GITHUB_ENV) {
  appendFileSync(process.env.GITHUB_ENV, `DOTNET_ROOT=${dotnetRoot}\n`)
}
if (dotnetRoot && process.env.GITHUB_PATH) {
  appendFileSync(process.env.GITHUB_PATH, `${dotnetRoot}\n`)
}

run(dotnetExecutable, ['build', harmonyProjectPath, '--configuration', 'Release'], { env: dotnetEnvironment })
run(dotnetExecutable, ['build', coreInterfacesProjectPath, '--configuration', 'Release'], { env: dotnetEnvironment })

rmSync(outputPath, { recursive: true, force: true })

run(dotnetExecutable, ['publish', projectPath, '--configuration', 'Release', '--output', outputPath, '--self-contained', 'false'], {
  env: dotnetEnvironment,
})

const coreInterfacesDll = resolve(desktopRoot, 'tools/gmcm-probe/bin/Release/net6.0/SMAPI.Toolkit.CoreInterfaces.dll')
if (existsSync(coreInterfacesDll)) {
  copyFileSync(coreInterfacesDll, join(outputPath, 'SMAPI.Toolkit.CoreInterfaces.dll'))
}

const harmonyDll = resolve(desktopRoot, 'tools/gmcm-probe/bin/Release/net6.0/0Harmony.dll')
if (existsSync(harmonyDll)) {
  copyFileSync(harmonyDll, join(outputPath, '0Harmony.dll'))
}
