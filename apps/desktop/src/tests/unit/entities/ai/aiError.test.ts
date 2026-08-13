import { describe, expect, it } from 'vite-plus/test'
import { isTransientAiFailure, parseAiFailure } from '@entities/ai'

describe('parseAiFailure', () => {
  it('parses stable backend envelopes and preserves inline diagnostic detail', () => {
    expect(parseAiFailure(new Error('command failed: AI_ERROR::authentication::credential rejected'))).toEqual({
      code: 'authentication',
      detail: 'credential rejected',
    })
  })

  it('treats malformed and legacy errors as unknown', () => {
    expect(parseAiFailure(new Error('provider unavailable'))).toEqual({
      code: 'unknown',
      detail: 'provider unavailable',
    })
  })

  it('recognizes local cache failures independently from provider failures', () => {
    expect(parseAiFailure(new Error('AI_ERROR::cache::database is locked'))).toEqual({
      code: 'cache',
      detail: 'database is locked',
    })
  })
})

describe('isTransientAiFailure', () => {
  it('treats timeout and network failures as transient for per-batch degradation', () => {
    expect(isTransientAiFailure(parseAiFailure(new Error('AI_ERROR::timeout::operation timed out')))).toBe(true)
    expect(isTransientAiFailure(parseAiFailure(new Error('AI_ERROR::network::could not be sent')))).toBe(true)
  })

  it('keeps deterministic failures fatal so multi-batch jobs never mask them', () => {
    for (const code of [
      'authentication',
      'model',
      'rate-limit',
      'invalid-response',
      'placeholder-mismatch',
      'cache',
      'cancelled',
      'unknown',
      'not-configured',
    ]) {
      expect(isTransientAiFailure(parseAiFailure(new Error(`AI_ERROR::${code}::detail`)))).toBe(false)
    }
  })
})
