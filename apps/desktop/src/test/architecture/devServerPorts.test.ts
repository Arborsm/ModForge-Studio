import { describe, expect, it } from 'vitest'
import { resolveDevServerPorts } from '../../../devServerPorts'

describe('resolveDevServerPorts', () => {
  it('uses safe defaults when no overrides are provided', () => {
    const { port, hmrPort } = resolveDevServerPorts({})

    expect(port).toBe(5173)
    expect(hmrPort).toBe(5174)
  })

  it('respects explicit port overrides', () => {
    const { port, hmrPort } = resolveDevServerPorts({
      MODFORGE_DEV_PORT: '6200',
      MODFORGE_DEV_HMR_PORT: '6201',
    })

    expect(port).toBe(6200)
    expect(hmrPort).toBe(6201)
  })
})
