import { describe, expect, it } from 'vite-plus/test'
import { parseLauncherModIdQuery } from '@features/launcher/model/launcherModIdQuery'

describe('parseLauncherModIdQuery', () => {
  it('parses a plain positive integer as a mod id', () => {
    expect(parseLauncherModIdQuery('40775')).toBe(40775)
    expect(parseLauncherModIdQuery('1')).toBe(1)
  })

  it('trims surrounding whitespace before parsing', () => {
    expect(parseLauncherModIdQuery('  40775  ')).toBe(40775)
    expect(parseLauncherModIdQuery('\t40775\n')).toBe(40775)
  })

  it('normalizes leading zeros to the numeric value', () => {
    expect(parseLauncherModIdQuery('007')).toBe(7)
  })

  it('rejects text queries so catalog search keeps working', () => {
    expect(parseLauncherModIdQuery('farmer')).toBeNull()
    expect(parseLauncherModIdQuery('mod 40775')).toBeNull()
    expect(parseLauncherModIdQuery('40,775')).toBeNull()
  })

  it('rejects empty and whitespace-only queries', () => {
    expect(parseLauncherModIdQuery('')).toBeNull()
    expect(parseLauncherModIdQuery('   ')).toBeNull()
  })

  it('rejects zero and negative ids', () => {
    expect(parseLauncherModIdQuery('0')).toBeNull()
    expect(parseLauncherModIdQuery('-40775')).toBeNull()
  })

  it('rejects decimals, signs and exponent forms', () => {
    expect(parseLauncherModIdQuery('40.5')).toBeNull()
    expect(parseLauncherModIdQuery('+40775')).toBeNull()
    expect(parseLauncherModIdQuery('0x1F')).toBeNull()
    expect(parseLauncherModIdQuery('1e5')).toBeNull()
  })

  it('rejects values beyond the safe integer range', () => {
    expect(parseLauncherModIdQuery('99999999999999999999999999')).toBeNull()
    expect(parseLauncherModIdQuery('9007199254740992')).toBeNull()
  })
})
