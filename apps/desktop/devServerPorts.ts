type EnvRecord = Record<string, string | undefined>

type DevServerPorts = {
  port: number
  hmrPort: number
}

const DEFAULT_PORT = 5173
const DEFAULT_HMR_PORT = 5174
const DEFAULT_ENV: EnvRecord = (() => {
  if (typeof globalThis === 'undefined') {
    return {}
  }

  const runtime = globalThis as { process?: { env?: EnvRecord } }
  return runtime.process?.env ?? {}
})()

function parsePort(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return null
  }

  return parsed
}

export function resolveDevServerPorts(env: EnvRecord = DEFAULT_ENV): DevServerPorts {
  const port =
    parsePort(env.MODFORGE_DEV_PORT) ??
    parsePort(env.TAURI_DEV_PORT) ??
    parsePort(env.VITE_PORT) ??
    parsePort(env.PORT) ??
    DEFAULT_PORT

  const hmrPort =
    parsePort(env.MODFORGE_DEV_HMR_PORT) ??
    parsePort(env.TAURI_DEV_HMR_PORT) ??
    (port < 65535 ? port + 1 : DEFAULT_HMR_PORT)

  return { port, hmrPort }
}
