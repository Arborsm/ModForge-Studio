export type ElectronDevIdentityEnv = Record<string, string | undefined>

export type ElectronDevIdentityPathOptions = {
  env?: ElectronDevIdentityEnv
  desktopRoot: string
}

export type ElectronDevDesktopEntryOptions = {
  electronPath: string
  desktopRoot: string
}

export type SystemdAvailabilityOptions = {
  env?: ElectronDevIdentityEnv
  spawnSyncFn?: (command: string, args: string[], options: { stdio: 'ignore' }) => { status: number | null }
  platform?: NodeJS.Platform
  fsModule?: {
    statSync(path: string): {
      isSocket(): boolean
    }
  }
}

export const appDisplayName: string
export const appDesktopId: string
export const appDesktopFileName: string
export const appLinuxClass: string
export const namedElectronExecutableName: string

export function resolveDevRuntimeCacheDir(options: ElectronDevIdentityPathOptions): string

export function ensureNamedElectronExecutable(electronPath: string, options: ElectronDevIdentityPathOptions): string

export function resolveDevIconSizes(desktopRoot: string): Array<[string, string]>

export function linkIconIntoTheme(iconThemeDir: string, sizeDir: string, sourceIconPath: string, themedIconName: string): boolean

export function ensureDevDesktopIcon(iconThemeRoot: string, themedIconName: string, desktopRoot: string): boolean

export function runOptionalDesktopCacheRefresh(applicationsDir: string, iconThemeRoot: string): void

export function quoteDesktopExecPart(part: string): string

export function buildDevDesktopEntry(options: ElectronDevDesktopEntryOptions): string

export function ensureDevDesktopEntry(electronPath: string, options: ElectronDevIdentityPathOptions): string | null

export function systemdUserScopeAvailable(options?: SystemdAvailabilityOptions): boolean

export function resolveElectronScopeUnit(pid?: number): string

export function buildElectronScopeSpawnArgs(electronExecutablePath: string, electronArgs: string[], options?: { pid?: number }): string[]
