import { describe, expect, it } from 'vite-plus/test'
import { resourceOptionHasValue, resourceOptionMatches } from '@entities/asset-schema'

describe('resource option aliases', () => {
  const option = { value: '(O)388', aliases: ['388'], label: 'Wood' }

  it('resolves canonical and legacy stored values case-insensitively', () => {
    expect(resourceOptionHasValue(option, '(o)388')).toBe(true)
    expect(resourceOptionHasValue(option, '388')).toBe(true)
    expect(resourceOptionHasValue(option, '(BC)388')).toBe(false)
  })

  it('includes aliases in picker search', () => {
    expect(resourceOptionMatches(option, '388')).toBe(true)
  })
})
