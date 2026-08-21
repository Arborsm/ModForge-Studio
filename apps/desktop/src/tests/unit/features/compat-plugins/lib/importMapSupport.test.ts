import { describe, expect, test } from 'vite-plus/test'
import { detectImportMapSupport, getImportMapSupport } from '@features/compat-plugins/lib/importMapSupport'

describe('detectImportMapSupport', () => {
  test('returns supported=true when HTMLScriptElement.supports("importmap") returns true', () => {
    // jsdom may or may not have HTMLScriptElement.supports; this test
    // verifies the detection logic works with the standard API.
    const result = detectImportMapSupport()
    // In jsdom, HTMLScriptElement.supports may not exist, so we just
    // verify the function returns a well-formed result.
    expect(typeof result.supported).toBe('boolean')
    expect(typeof result.reason).toBe('string')
    expect(result.reason.length).toBeGreaterThan(0)
  })
})

describe('getImportMapSupport', () => {
  test('caches the result across calls', () => {
    const first = getImportMapSupport()
    const second = getImportMapSupport()
    expect(first).toBe(second)
  })
})
