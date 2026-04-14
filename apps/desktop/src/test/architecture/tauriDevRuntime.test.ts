import { describe, expect, it } from 'vitest'

describe('resolveTauriDevRuntime', () => {
  it('uses safe defaults when no overrides are provided', async () => {
    const { resolveDevServerPorts } = await import('../../../scripts/tauriDevRuntime.mjs')

    expect(resolveDevServerPorts({})).toEqual({
      port: 5173,
      hmrPort: 5174,
    })
  })

  it('respects explicit port overrides', async () => {
    const { resolveDevServerPorts } = await import('../../../scripts/tauriDevRuntime.mjs')

    expect(
      resolveDevServerPorts({
        MODFORGE_DEV_PORT: '6200',
        MODFORGE_DEV_HMR_PORT: '6201',
      }),
    ).toEqual({
      port: 6200,
      hmrPort: 6201,
    })
  })

  it('falls back to the next available dev ports when the default port is unavailable', async () => {
    const { resolveTauriDevRuntime } = await import('../../../scripts/tauriDevRuntime.mjs')

    const result = await resolveTauriDevRuntime({}, async (port: number) => port >= 5175)

    expect(result.env.MODFORGE_DEV_PORT).toBe('5175')
    expect(result.env.MODFORGE_DEV_HMR_PORT).toBe('5176')
    expect(result.env.TAURI_DEV_PORT).toBe('5175')
    expect(result.env.TAURI_DEV_HMR_PORT).toBe('5176')
    expect(result.configOverride).toEqual({
      build: {
        devUrl: 'http://127.0.0.1:5175',
      },
    })
  })

  it('keeps explicit port overrides without probing for a replacement', async () => {
    const { resolveTauriDevRuntime } = await import('../../../scripts/tauriDevRuntime.mjs')
    let probeCalls = 0

    const result = await resolveTauriDevRuntime(
      {
        MODFORGE_DEV_PORT: '6200',
        MODFORGE_DEV_HMR_PORT: '6201',
      },
      async () => {
        probeCalls += 1
        return false
      },
    )

    expect(probeCalls).toBe(0)
    expect(result.env.MODFORGE_DEV_PORT).toBe('6200')
    expect(result.env.MODFORGE_DEV_HMR_PORT).toBe('6201')
    expect(result.configOverride).toEqual({
      build: {
        devUrl: 'http://127.0.0.1:6200',
      },
    })
  })
})

describe('dev server host helpers', () => {
  it('trims configured TAURI_DEV_HOST before returning it', async () => {
    const { resolveDevServerHost } = await import('../../../scripts/tauriDevRuntime.mjs')

    expect(resolveDevServerHost({ TAURI_DEV_HOST: ' 0.0.0.0 ' })).toBe('0.0.0.0')
  })

  it('falls back to the default host when none is configured', async () => {
    const { resolveDevServerHost } = await import('../../../scripts/tauriDevRuntime.mjs')

    expect(resolveDevServerHost({})).toBe('127.0.0.1')
  })
})

describe('buildTauriDevConfigOverride', () => {
  it('uses the trimmed host when constructing devUrl', async () => {
    const { buildTauriDevConfigOverride } = await import('../../../scripts/tauriDevRuntime.mjs')

    expect(buildTauriDevConfigOverride({ TAURI_DEV_HOST: ' 0.0.0.0 ' })).toEqual({
      build: {
        devUrl: 'http://0.0.0.0:5173',
      },
    })
  })
})
