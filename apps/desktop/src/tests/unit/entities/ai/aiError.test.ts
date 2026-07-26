import { describe, expect, it } from 'vite-plus/test'
import { parseAiFailure } from '@entities/ai'

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
