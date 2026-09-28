export type DevServerEnv = Record<string, string | undefined>

export type PortAvailabilityProbe = (port: number, host: string) => boolean | Promise<boolean>

export type DevServerPorts = {
  port: number
  hmrPort: number
}

export type TauriDevRuntime = {
  env: DevServerEnv
  configOverride: {
    build: {
      devUrl: string
    }
  }
}

export function resolveDevServerPorts(env?: DevServerEnv): DevServerPorts

export function resolveDevServerHost(env?: DevServerEnv): string

export function buildTauriDevConfigOverride(env?: DevServerEnv): TauriDevRuntime['configOverride']

export function defaultPortAvailabilityProbe(port: number, host: string): Promise<boolean>

export function resolveTauriDevRuntime(env?: DevServerEnv, isPortAvailable?: PortAvailabilityProbe): Promise<TauriDevRuntime>
