import { createServer } from 'node:net'

const DEFAULT_PORT = 5173
const DEFAULT_HMR_PORT = 5174
const DEFAULT_HOST = '127.0.0.1'
const MAX_PORT = 65535

function parsePort(value) {
  if (!value) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PORT) {
    return null
  }

  return parsed
}

function hasExplicitAppPortOverride(env) {
  return (
    parsePort(env.MODFORGE_DEV_PORT) !== null ||
    parsePort(env.TAURI_DEV_PORT) !== null ||
    parsePort(env.VITE_PORT) !== null ||
    parsePort(env.PORT) !== null
  )
}

function hasExplicitHmrPortOverride(env) {
  return parsePort(env.MODFORGE_DEV_HMR_PORT) !== null || parsePort(env.TAURI_DEV_HMR_PORT) !== null
}

export function resolveDevServerPorts(env = process.env) {
  const port =
    parsePort(env.MODFORGE_DEV_PORT) ?? parsePort(env.TAURI_DEV_PORT) ?? parsePort(env.VITE_PORT) ?? parsePort(env.PORT) ?? DEFAULT_PORT

  const hmrPort =
    parsePort(env.MODFORGE_DEV_HMR_PORT) ?? parsePort(env.TAURI_DEV_HMR_PORT) ?? (port < MAX_PORT ? port + 1 : DEFAULT_HMR_PORT)

  return { port, hmrPort }
}

export function resolveDevServerHost(env = process.env) {
  const configuredHost = env.TAURI_DEV_HOST?.trim()
  return configuredHost ? configuredHost : DEFAULT_HOST
}

export function buildTauriDevConfigOverride(env = process.env) {
  const { port } = resolveDevServerPorts(env)

  return {
    build: {
      devUrl: `http://${resolveDevServerHost(env)}:${port}`,
    },
  }
}

export async function defaultPortAvailabilityProbe(port, host) {
  return new Promise((resolve) => {
    const server = createServer()

    server.once('error', () => {
      resolve(false)
    })

    server.once('listening', () => {
      server.close(() => resolve(true))
    })

    server.listen(port, host)
  })
}

async function findNextAvailablePort(startPort, host, isPortAvailable, reservedPorts = new Set()) {
  for (let port = Math.max(1, startPort); port <= MAX_PORT; port += 1) {
    if (reservedPorts.has(port)) {
      continue
    }

    if (await isPortAvailable(port, host)) {
      return port
    }
  }

  throw new Error(`No available development ports found starting at ${startPort}`)
}

function withResolvedPorts(env, ports) {
  return {
    ...env,
    MODFORGE_DEV_PORT: String(ports.port),
    MODFORGE_DEV_HMR_PORT: String(ports.hmrPort),
    TAURI_DEV_PORT: String(ports.port),
    TAURI_DEV_HMR_PORT: String(ports.hmrPort),
  }
}

function withLinuxCefCache(env) {
  if (process.platform !== 'linux' || env.CEF_PATH?.trim() || !env.MODFORGE_CEF_PATH?.trim()) {
    return env
  }

  return {
    ...env,
    CEF_PATH: env.MODFORGE_CEF_PATH.trim(),
  }
}

export async function resolveTauriDevRuntime(env = process.env, isPortAvailable = defaultPortAvailabilityProbe) {
  const host = resolveDevServerHost(env)
  const explicitAppPort = hasExplicitAppPortOverride(env)
  const explicitHmrPort = hasExplicitHmrPortOverride(env)
  let { port, hmrPort } = resolveDevServerPorts(env)

  if (!explicitAppPort && !(await isPortAvailable(port, host))) {
    port = await findNextAvailablePort(port + 1, host, isPortAvailable)
  }

  if (!explicitHmrPort) {
    const requestedHmrPort = hmrPort === port ? port + 1 : hmrPort
    const hmrIsAvailable = requestedHmrPort !== port && (await isPortAvailable(requestedHmrPort, host))

    if (!hmrIsAvailable) {
      hmrPort = await findNextAvailablePort(Math.max(port + 1, requestedHmrPort), host, isPortAvailable, new Set([port]))
    } else {
      hmrPort = requestedHmrPort
    }
  }

  const runtimeEnv = withLinuxCefCache(withResolvedPorts(env, { port, hmrPort }))

  return {
    env: runtimeEnv,
    configOverride: buildTauriDevConfigOverride(runtimeEnv),
  }
}
