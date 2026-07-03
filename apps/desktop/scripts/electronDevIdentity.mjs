import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export const appDisplayName = 'ModForge Studio'
export const appDesktopId = 'studio.modforge.desktop.dev'
export const appDesktopFileName = `${appDesktopId}.desktop`
export const appLinuxClass = appDesktopId
export const namedElectronExecutableName = 'modforge-studio'

export function resolveDevRuntimeCacheDir({ env = process.env, desktopRoot }) {
  if (env.XDG_CACHE_HOME && path.isAbsolute(env.XDG_CACHE_HOME)) {
    return path.join(env.XDG_CACHE_HOME, 'modforge-studio', 'electron-dev')
  }

  if (env.HOME) {
    return path.join(env.HOME, '.cache', 'modforge-studio', 'electron-dev')
  }

  return path.join(desktopRoot, '.modforge-dev', 'electron-dev')
}

export function ensureNamedElectronExecutable(electronPath, { env = process.env, desktopRoot }) {
  if (process.platform !== 'linux') {
    return electronPath
  }

  const executableDir = resolveDevRuntimeCacheDir({ env, desktopRoot })
  const namedElectronPath = path.join(executableDir, namedElectronExecutableName)
  fs.mkdirSync(executableDir, { recursive: true })

  try {
    const existingTarget = fs.readlinkSync(namedElectronPath)
    if (existingTarget === electronPath) {
      return namedElectronPath
    }
  } catch (error) {
    if (error?.code !== 'EINVAL' && error?.code !== 'ENOENT') {
      throw error
    }
  }

  fs.rmSync(namedElectronPath, { force: true })
  fs.symlinkSync(electronPath, namedElectronPath)
  return namedElectronPath
}

export function resolveDevIconSizes(desktopRoot) {
  return [
    ['512x512', path.join(desktopRoot, 'src-tauri/icons/icon.png')],
    ['128x128', path.join(desktopRoot, 'src-tauri/icons/128x128.png')],
  ]
}

export function linkIconIntoTheme(iconThemeDir, sizeDir, sourceIconPath, themedIconName) {
  const sizeThemeDir = path.join(iconThemeDir, sizeDir, 'apps')
  const themedIconPath = path.join(sizeThemeDir, `${themedIconName}.png`)
  fs.mkdirSync(sizeThemeDir, { recursive: true })

  try {
    const existingTarget = fs.readlinkSync(themedIconPath)
    if (existingTarget === sourceIconPath) {
      return false
    }
  } catch (error) {
    if (error?.code !== 'EINVAL' && error?.code !== 'ENOENT') {
      throw error
    }
  }

  fs.rmSync(themedIconPath, { force: true })
  fs.symlinkSync(sourceIconPath, themedIconPath)
  return true
}

export function ensureDevDesktopIcon(iconThemeRoot, themedIconName, desktopRoot) {
  if (process.platform !== 'linux') {
    return false
  }

  let iconChanged = false
  for (const [sizeDir, sourceIconPath] of resolveDevIconSizes(desktopRoot)) {
    if (linkIconIntoTheme(iconThemeRoot, sizeDir, sourceIconPath, themedIconName)) {
      iconChanged = true
    }
  }
  return iconChanged
}

export function runOptionalDesktopCacheRefresh(applicationsDir, iconThemeRoot) {
  if (process.platform !== 'linux') {
    return
  }

  const cacheRefreshCommands = [
    ['update-desktop-database', [applicationsDir]],
    ['gtk-update-icon-cache', ['-f', '-t', iconThemeRoot]],
    ['kbuildsycoca6', ['--noincremental']],
    ['kbuildsycoca5', ['--noincremental']],
  ]

  for (const [command, args] of cacheRefreshCommands) {
    spawnSync(command, args, {
      cwd: applicationsDir,
      env: process.env,
      stdio: 'ignore',
      timeout: 5000,
    })
  }
}

export function quoteDesktopExecPart(part) {
  return `"${part.replaceAll('"', '\\"')}"`
}

export function buildDevDesktopEntry({ electronPath, desktopRoot }) {
  const execLine = [
    electronPath,
    `--class=${appLinuxClass}`,
    `--app-id=${appDesktopId}`,
    path.posix.join(desktopRoot, 'electron-dist/main.cjs'),
  ]
    .map(quoteDesktopExecPart)
    .join(' ')

  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${appDisplayName}`,
    `GenericName=${appDisplayName}`,
    'Comment=Desktop workbench for Stardew Valley mod creation and management.',
    `Exec=${execLine}`,
    `Icon=${appDesktopId}`,
    'Terminal=false',
    'Categories=Development;',
    `StartupWMClass=${appLinuxClass}`,
    `X-GNOME-WMName=${appLinuxClass}`,
    'StartupNotify=true',
    '',
  ].join('\n')
}

export function ensureDevDesktopEntry(electronPath, { env = process.env, desktopRoot }) {
  if (process.platform !== 'linux') {
    return null
  }

  const dataRoot = env.XDG_DATA_HOME || path.join(env.HOME || '', '.local/share')
  if (!dataRoot.startsWith('/')) {
    return null
  }

  const applicationsDir = path.join(dataRoot, 'applications')
  const iconThemeRoot = path.join(dataRoot, 'icons', 'hicolor')
  const desktopFilePath = path.join(applicationsDir, appDesktopFileName)
  const desktopEntry = buildDevDesktopEntry({ electronPath, desktopRoot })

  fs.mkdirSync(applicationsDir, { recursive: true })
  const desktopEntryChanged = !fs.existsSync(desktopFilePath) || fs.readFileSync(desktopFilePath, 'utf8') !== desktopEntry
  const iconChanged = ensureDevDesktopIcon(iconThemeRoot, appDesktopId, desktopRoot)
  if (desktopEntryChanged || iconChanged) {
    if (desktopEntryChanged) {
      fs.writeFileSync(desktopFilePath, desktopEntry, { mode: 0o644 })
    }
    runOptionalDesktopCacheRefresh(applicationsDir, iconThemeRoot)
  }

  return desktopFilePath
}

export function systemdUserScopeAvailable({ env = process.env, spawnSyncFn = spawnSync, fsModule = fs, platform = process.platform } = {}) {
  if (platform !== 'linux') {
    return false
  }

  if (!env.XDG_RUNTIME_DIR || !path.posix.isAbsolute(env.XDG_RUNTIME_DIR)) {
    return false
  }

  const sessionSocket = path.posix.join(env.XDG_RUNTIME_DIR, 'systemd', 'private')
  try {
    if (!fsModule.statSync(sessionSocket).isSocket()) {
      return false
    }
  } catch {
    return false
  }

  return spawnSyncFn('systemd-run', ['--version'], { stdio: 'ignore' }).status === 0
}

export function resolveElectronScopeUnit(pid = process.pid) {
  return `app-${appDesktopId}-${pid}.scope`
}

export function buildElectronScopeSpawnArgs(electronExecutablePath, electronArgs, { pid = process.pid } = {}) {
  return ['--user', '--scope', `--unit=${resolveElectronScopeUnit(pid)}`, '--collect', '--quiet', electronExecutablePath, ...electronArgs]
}
