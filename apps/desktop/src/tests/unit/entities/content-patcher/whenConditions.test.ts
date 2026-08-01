import { describe, expect, test } from 'vite-plus/test'
import {
  extractTokenReferences,
  formatWhenKey,
  parseWhenConditions,
  parseWhenKey,
  parseWhenValueAlternatives,
  serializeWhenConditions,
  toggleWhenValueAlternative,
} from '@entities/content-patcher'

const SEASON_DOMAIN = ['Spring', 'Summer', 'Fall', 'Winter'] as const

describe('parseWhenKey', () => {
  test('parses bare token names', () => {
    expect(parseWhenKey('Season')).toEqual({ token: 'Season' })
    expect(parseWhenKey(' DayOfWeek ')).toEqual({ token: 'DayOfWeek' })
  })

  test('parses the bare input form, tolerating spaces', () => {
    expect(parseWhenKey('Relationship:Abigail')).toEqual({ token: 'Relationship', input: 'Abigail' })
    expect(parseWhenKey('SkillLevel: Farming')).toEqual({ token: 'SkillLevel', input: 'Farming' })
    expect(parseWhenKey('HasValue:{{Spouse}}')).toEqual({ token: 'HasValue', input: '{{Spouse}}' })
  })

  test('parses the legacy braced input form', () => {
    expect(parseWhenKey('{{Relationship:Abigail}}')).toEqual({ token: 'Relationship', input: 'Abigail' })
  })

  test('rejects keys that are neither form', () => {
    expect(parseWhenKey('')).toBeNull()
    expect(parseWhenKey('{{Season}}')).toBeNull()
  })
})

describe('formatWhenKey', () => {
  test('emits the canonical bare forms', () => {
    expect(formatWhenKey('Season')).toBe('Season')
    expect(formatWhenKey('Relationship', 'Abigail')).toBe('Relationship:Abigail')
    expect(formatWhenKey('Relationship', '')).toBe('Relationship')
  })
})

describe('parseWhenValueAlternatives', () => {
  test('splits comma-separated values and trims', () => {
    expect(parseWhenValueAlternatives('spring, summer')).toEqual(['spring', 'summer'])
    expect(parseWhenValueAlternatives('rain')).toEqual(['rain'])
    expect(parseWhenValueAlternatives('')).toEqual([])
  })
})

describe('toggleWhenValueAlternative', () => {
  test('appends a new alternative', () => {
    expect(toggleWhenValueAlternative('', 'Spring', SEASON_DOMAIN)).toBe('Spring')
    expect(toggleWhenValueAlternative('Spring', 'Summer', SEASON_DOMAIN)).toBe('Spring, Summer')
  })

  test('removes an existing alternative, matching case-insensitively', () => {
    expect(toggleWhenValueAlternative('Spring, Summer', 'spring', SEASON_DOMAIN)).toBe('Summer')
    expect(toggleWhenValueAlternative('spring', 'Spring', SEASON_DOMAIN)).toBe('')
  })

  test('keeps domain values in domain order, then custom values in entry order', () => {
    expect(toggleWhenValueAlternative('Winter', 'Spring', SEASON_DOMAIN)).toBe('Spring, Winter')
    expect(toggleWhenValueAlternative('X, Summer', 'Y', SEASON_DOMAIN)).toBe('Summer, X, Y')
    expect(toggleWhenValueAlternative('Summer, Winter', 'CustomB', SEASON_DOMAIN)).toBe('Summer, Winter, CustomB')
  })

  test('never produces duplicates, even with case variants in the source', () => {
    expect(toggleWhenValueAlternative('spring, Spring, Summer', 'Fall', SEASON_DOMAIN)).toBe('spring, Summer, Fall')
    expect(toggleWhenValueAlternative('Spring, Spring', 'Spring', SEASON_DOMAIN)).toBe('')
  })

  test('without a domain, appends custom values in entry order', () => {
    expect(toggleWhenValueAlternative('', 'a')).toBe('a')
    expect(toggleWhenValueAlternative('a', 'b')).toBe('a, b')
    expect(toggleWhenValueAlternative('a', 'a')).toBe('')
  })

  test('ignores blank alternatives', () => {
    expect(toggleWhenValueAlternative('Spring', '   ', SEASON_DOMAIN)).toBe('Spring')
  })
})

describe('when condition rows', () => {
  test('parse → serialize round-trips the canonical form', () => {
    const when = { Season: 'spring', 'Relationship:Abigail': 'Married' }
    const rows = parseWhenConditions(when)
    expect(rows).toEqual([
      { token: 'Season', input: undefined, value: 'spring' },
      { token: 'Relationship', input: 'Abigail', value: 'Married' },
    ])
    expect(serializeWhenConditions(rows)).toEqual(when)
  })

  test('braced keys parse and serialize back to the canonical form', () => {
    const rows = parseWhenConditions({ '{{Relationship:Abigail}}': 'Married' })
    expect(serializeWhenConditions(rows)).toEqual({ 'Relationship:Abigail': 'Married' })
  })

  test('non-string values stringify like the export does', () => {
    expect(parseWhenConditions({ Hearts: 4 })).toEqual([{ token: 'Hearts', input: undefined, value: '4' }])
  })

  test('serialize drops empty rows and returns undefined when empty', () => {
    expect(serializeWhenConditions([{ token: '', value: 'x' }])).toBeUndefined()
    expect(serializeWhenConditions([])).toBeUndefined()
  })

  test('keys that do not parse survive untouched', () => {
    const rows = parseWhenConditions({ 'custom mod token': 'yes' })
    expect(rows[0]?.token).toBe('custom mod token')
    expect(serializeWhenConditions(rows)).toEqual({ 'custom mod token': 'yes' })
  })
})

describe('extractTokenReferences', () => {
  test('finds plain and input references', () => {
    expect(extractTokenReferences('{{Season}} farm {{Relationship: Abigail}} !')).toEqual([
      { token: 'Season' },
      { token: 'Relationship', input: 'Abigail' },
    ])
  })

  test('ignores non-token text', () => {
    expect(extractTokenReferences('no tokens here {single}')).toEqual([])
  })
})
