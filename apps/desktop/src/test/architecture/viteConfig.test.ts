import { afterEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

async function loadViteConfig() {
  vi.resetModules()
  const module = await import('../../../vite.config.ts')
  return module.default
}

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key]
    }
  }

  Object.assign(process.env, ORIGINAL_ENV)
})

describe('vite config', () => {
  it('uses trimmed shared dev runtime host and explicit ports', async () => {
    process.env.TAURI_DEV_HOST = ' 0.0.0.0 '
    process.env.MODFORGE_DEV_PORT = '6200'
    process.env.MODFORGE_DEV_HMR_PORT = '6201'

    const config = await loadViteConfig()
    const { server } = config

    if (!server || server.hmr === false || server.hmr === true || !server.hmr) {
      throw new Error('Expected vite server config with HMR settings')
    }

    expect(server.host).toBe('0.0.0.0')
    expect(server.port).toBe(6200)
    expect(server.hmr.port).toBe(6201)
  })
})
