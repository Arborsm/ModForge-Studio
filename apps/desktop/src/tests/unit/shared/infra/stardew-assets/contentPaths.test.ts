import { describe, expect, it } from 'vite-plus/test'
import { buildGameContentPath } from '@shared/infra/stardew-assets/contentPaths'

describe('contentPaths', () => {
  it('builds a game content path for relative asset names', () => {
    expect(buildGameContentPath('E:\\Game', 'Maps\\Town')).toBe('E:\\Game\\Content\\Maps\\Town.xnb')
  })

  it('strips a leading Content prefix before composing the final path', () => {
    expect(buildGameContentPath('E:\\Game', 'Content\\Data\\Objects')).toBe('E:\\Game\\Content\\Data\\Objects.xnb')
    expect(buildGameContentPath('E:\\Game', 'content\\Maps\\springobjects')).toBe('E:\\Game\\Content\\Maps\\springobjects.xnb')
  })

  it('normalizes forward slashes and trailing xnb suffixes', () => {
    expect(buildGameContentPath('E:\\Game', 'Content/Maps/springobjects.xnb')).toBe('E:\\Game\\Content\\Maps\\springobjects.xnb')
    expect(buildGameContentPath('E:\\Game', 'Maps/FarmHouse.XNB')).toBe('E:\\Game\\Content\\Maps\\FarmHouse.xnb')
  })

  it('returns null for empty asset names after normalization', () => {
    expect(buildGameContentPath('E:\\Game', null)).toBeNull()
    expect(buildGameContentPath('E:\\Game', '')).toBeNull()
    expect(buildGameContentPath('E:\\Game', 'Content\\')).toBeNull()
  })
})
