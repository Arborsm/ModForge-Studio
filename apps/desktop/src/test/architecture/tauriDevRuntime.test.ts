import { describe, expect, it } from 'vitest'

describe('resolveTauriDevRuntime', () => {
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
