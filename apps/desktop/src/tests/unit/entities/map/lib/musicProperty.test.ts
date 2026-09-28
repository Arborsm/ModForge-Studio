import { describe, expect, test } from 'vite-plus/test'
import {
  GAME_CLOCK_END_UNLIMITED,
  GAME_CLOCK_HOUR_MAX,
  GAME_CLOCK_HOUR_MIN,
  GAME_CLOCK_MAX_VALUE,
  GAME_CLOCK_MINUTE_STEPS,
  buildGameClockStepperValues,
  formatGameClockValue,
  isGameClockNextDay,
  isValidGameClockValue,
  parseMapMusicProperty,
  serializeMapMusicProperty,
} from '@entities/map/lib/musicProperty'

describe('Music property parsing (three forms)', () => {
  test('absent / empty value follows the game default', () => {
    expect(parseMapMusicProperty('')).toEqual({ kind: 'none' })
    expect(parseMapMusicProperty('   ')).toEqual({ kind: 'none' })
  })

  test('a single cue name plays all day', () => {
    expect(parseMapMusicProperty('guild_ambient')).toEqual({ kind: 'cue', cue: 'guild_ambient' })
    expect(parseMapMusicProperty(' spring1 ')).toEqual({ kind: 'cue', cue: 'spring1' })
  })

  test('a "start end cue" triple plays only between the two clock times', () => {
    expect(parseMapMusicProperty('1800 2400 guild_ambient')).toEqual({ kind: 'span', start: 1800, end: 2400, cue: 'guild_ambient' })
    // end 0 means "until the day ends".
    expect(parseMapMusicProperty('600 0 spring_day_ambient')).toEqual({ kind: 'span', start: 600, end: 0, cue: 'spring_day_ambient' })
    // cues may contain spaces after the time prefix.
    expect(parseMapMusicProperty('2200 2600 Kindling in the Snow')).toEqual({
      kind: 'span',
      start: 2200,
      end: 2600,
      cue: 'Kindling in the Snow',
    })
  })

  test('malformed triples fall back to a plain cue name (lossless round-trip)', () => {
    expect(parseMapMusicProperty('600 guild_ambient')).toEqual({ kind: 'cue', cue: '600 guild_ambient' })
    expect(parseMapMusicProperty('a b guild_ambient')).toEqual({ kind: 'cue', cue: 'a b guild_ambient' })
  })
})

describe('Music property serialization', () => {
  test('none serializes to empty (property is removed)', () => {
    expect(serializeMapMusicProperty({ kind: 'none' })).toBe('')
  })

  test('cue serializes to the cue name', () => {
    expect(serializeMapMusicProperty({ kind: 'cue', cue: ' guild_ambient ' })).toBe('guild_ambient')
  })

  test('span serializes to "start end cue" with the unlimited end preserved', () => {
    expect(serializeMapMusicProperty({ kind: 'span', start: 1800, end: 2400, cue: 'guild_ambient' })).toBe('1800 2400 guild_ambient')
    expect(serializeMapMusicProperty({ kind: 'span', start: 600, end: GAME_CLOCK_END_UNLIMITED, cue: 'spring_day_ambient' })).toBe(
      '600 0 spring_day_ambient',
    )
  })

  test('parse → serialize round-trips all three forms', () => {
    const samples = ['', 'guild_ambient', '600 0 spring_day_ambient', '1800 2400 spring1']
    for (const raw of samples) {
      expect(serializeMapMusicProperty(parseMapMusicProperty(raw))).toBe(raw)
    }
  })
})

describe('game clock validation (HHMM, minutes only step by 10)', () => {
  test('accepts the stepper values: hours 6-26, minutes 00-50 in 10-minute steps', () => {
    expect(isValidGameClockValue(600)).toBe(true)
    expect(isValidGameClockValue(1800)).toBe(true)
    expect(isValidGameClockValue(2350)).toBe(true)
    expect(isValidGameClockValue(2600)).toBe(true)
    expect(isValidGameClockValue(GAME_CLOCK_MAX_VALUE)).toBe(true)
  })

  test('rejects minute values the game clock cannot show', () => {
    expect(isValidGameClockValue(1805)).toBe(false)
    expect(isValidGameClockValue(1859)).toBe(false)
    expect(isValidGameClockValue(1801)).toBe(false)
  })

  test('rejects out-of-range and non-integer values', () => {
    expect(isValidGameClockValue(0)).toBe(true)
    expect(isValidGameClockValue(-100)).toBe(false)
    expect(isValidGameClockValue(2700)).toBe(false)
    expect(isValidGameClockValue(18.5)).toBe(false)
    expect(isValidGameClockValue(Number.NaN)).toBe(false)
  })

  test('the stepper list covers every minute step within the night-owl range', () => {
    const values = buildGameClockStepperValues()
    expect(values[0]).toBe(GAME_CLOCK_HOUR_MIN * 100)
    expect(values.at(-1)).toBe(GAME_CLOCK_MAX_VALUE)
    expect(values.every((value) => isValidGameClockValue(value))).toBe(true)
    // Hours 6..25 at six minute steps, plus 26:00 as the last playable time.
    expect(values.length).toBe((GAME_CLOCK_HOUR_MAX - GAME_CLOCK_HOUR_MIN) * GAME_CLOCK_MINUTE_STEPS.length + 1)
  })
})

describe('game clock formatting', () => {
  test('formats HHMM as HH:MM and wraps past midnight', () => {
    expect(formatGameClockValue(600)).toBe('06:00')
    expect(formatGameClockValue(1800)).toBe('18:00')
    expect(formatGameClockValue(2400)).toBe('00:00')
    expect(formatGameClockValue(2600)).toBe('02:00')
  })

  test('flags values past midnight for the next-day suffix', () => {
    expect(isGameClockNextDay(2350)).toBe(false)
    expect(isGameClockNextDay(2400)).toBe(true)
    expect(isGameClockNextDay(2600)).toBe(true)
  })
})
