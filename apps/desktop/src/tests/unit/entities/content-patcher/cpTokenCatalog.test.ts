import { describe, expect, test } from 'vite-plus/test'
import { CP_BUILTIN_TOKENS, findCpToken, listCpTokenNames } from '@entities/content-patcher'

describe('CP_BUILTIN_TOKENS catalog', () => {
  test('covers the documented 70 built-in tokens', () => {
    expect(CP_BUILTIN_TOKENS).toHaveLength(70)
    expect(new Set(listCpTokenNames()).size).toBe(70)
  })

  test('enumerable domains match the docs for the most-used tokens', () => {
    expect(findCpToken('Season')?.values).toEqual(['Spring', 'Summer', 'Fall', 'Winter'])
    expect(findCpToken('DayOfWeek')?.values).toHaveLength(7)
    expect(findCpToken('Weather')?.values).toContain('GreenRain')
    expect(findCpToken('Relationship')?.values).toEqual(['Unmet', 'Friendly', 'Dating', 'Engaged', 'Married', 'Divorced'])
    expect(findCpToken('Language')?.values).toContain('zh')
  })

  test('lookup is case-insensitive', () => {
    expect(findCpToken('season')?.name).toBe('Season')
    expect(findCpToken('HASMOD')?.name).toBe('HasMod')
    expect(findCpToken('NotAToken')).toBeUndefined()
  })

  test('input rules distinguish required, optional and none', () => {
    expect(findCpToken('SkillLevel')).toMatchObject({ takesInput: true, inputOptional: false })
    expect(findCpToken('Weather')).toMatchObject({ takesInput: true, inputOptional: true })
    expect(findCpToken('Season')).toMatchObject({ takesInput: false, inputOptional: false })
    expect(findCpToken('PreferredPet')).toMatchObject({ takesInput: false, inputOptional: false })
  })

  test('docs caveats stay visible instead of banning tokens', () => {
    expect(findCpToken('Random')?.whenKeyCaveat).toBe('undocumented')
    expect(findCpToken('DailyLuck')?.whenKeyCaveat).toBe('queryOnly')
    expect(findCpToken('Target')?.patchBlockOnly).toBe(true)
    expect(findCpToken('FromFile')?.patchBlockOnly).toBe(true)
  })
})
