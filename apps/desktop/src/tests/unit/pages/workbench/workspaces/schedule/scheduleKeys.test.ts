import { describe, expect, it } from 'vite-plus/test'
import {
  describeScheduleKey,
  SCHEDULE_GOTO_EXTRA_TARGETS,
  SCHEDULE_KEY_SUGGESTIONS,
} from '@pages/workbench/workspaces/schedule/entities/schedule'

describe('schedule key describer', () => {
  it('classifies special and weather keys case-insensitively', () => {
    expect(describeScheduleKey('GreenRain').family).toBe('greenRain')
    expect(describeScheduleKey('greenrain').family).toBe('greenRain')
    expect(describeScheduleKey('rain').family).toBe('rain')
    expect(describeScheduleKey('rain2').family).toBe('rain2')
    expect(describeScheduleKey('bus').family).toBe('bus')
    expect(describeScheduleKey('default').family).toBe('default')
  })

  it('classifies season, weekday, date and hearts combinations', () => {
    expect(describeScheduleKey('spring')).toMatchObject({ family: 'season', season: 'spring' })
    expect(describeScheduleKey('Mon')).toMatchObject({ family: 'weekday', weekday: 'Mon' })
    expect(describeScheduleKey('mon')).toMatchObject({ family: 'weekday', weekday: 'Mon' })
    expect(describeScheduleKey('winter_16')).toMatchObject({ family: 'seasonDay', season: 'winter', day: 16 })
    expect(describeScheduleKey('11_6')).toMatchObject({ family: 'dayHearts', day: 11, hearts: 6 })
    expect(describeScheduleKey('25')).toMatchObject({ family: 'day', day: 25 })
    expect(describeScheduleKey('spring_Mon')).toMatchObject({ family: 'seasonWeekday', season: 'spring', weekday: 'Mon' })
    expect(describeScheduleKey('spring_Mon_6')).toMatchObject({
      family: 'seasonWeekdayHearts',
      season: 'spring',
      weekday: 'Mon',
      hearts: 6,
    })
    expect(describeScheduleKey('Fri_6')).toMatchObject({ family: 'weekdayHearts', weekday: 'Fri', hearts: 6 })
  })

  it('classifies marriage keys', () => {
    expect(describeScheduleKey('marriageJob')).toMatchObject({ family: 'marriageJob', marriage: true })
    expect(describeScheduleKey('marriage_Mon')).toMatchObject({ family: 'marriageWeekday', marriage: true, weekday: 'Mon' })
    expect(describeScheduleKey('marriage_spring_26')).toMatchObject({
      family: 'marriageSeasonDay',
      marriage: true,
      season: 'spring',
      day: 26,
    })
    expect(describeScheduleKey('marriage_DesertFestival_1')).toMatchObject({
      family: 'marriageFestival',
      marriage: true,
      festivalId: 'DesertFestival',
      day: 1,
    })
    expect(describeScheduleKey('marriage_Fri_normal')).toMatchObject({ family: 'custom', marriage: true })
  })

  it('classifies passive festival keys with and without a day suffix', () => {
    expect(describeScheduleKey('DesertFestival')).toMatchObject({ family: 'festival', festivalId: 'DesertFestival', day: null })
    expect(describeScheduleKey('DesertFestival_2')).toMatchObject({ family: 'festival', festivalId: 'DesertFestival', day: 2 })
    expect(describeScheduleKey('TroutDerby_1')).toMatchObject({ family: 'festival', festivalId: 'TroutDerby', day: 1 })
  })

  it('classifies replacement keys and leaves the rest custom', () => {
    expect(describeScheduleKey('CommunityCenter_Replacement')).toMatchObject({
      family: 'locationReplacement',
      location: 'CommunityCenter',
    })
    expect(describeScheduleKey('JojaMart_Replacement')).toMatchObject({ family: 'locationReplacement', location: 'JojaMart' })
    expect(describeScheduleKey('Sun_normal').family).toBe('custom')
    expect(describeScheduleKey('summer_noBridge').family).toBe('custom')
    expect(describeScheduleKey('30').family).toBe('custom')
    expect(describeScheduleKey('summer6').family).toBe('custom')
  })

  it('exposes picker suggestions and GOTO extras', () => {
    expect(SCHEDULE_KEY_SUGGESTIONS).toContain('spring')
    expect(SCHEDULE_KEY_SUGGESTIONS).toContain('marriage_Mon')
    expect(SCHEDULE_KEY_SUGGESTIONS).toContain('GreenRain')
    expect(SCHEDULE_KEY_SUGGESTIONS).toContain('DesertFestival_1')
    expect(new Set(SCHEDULE_KEY_SUGGESTIONS).size).toBe(SCHEDULE_KEY_SUGGESTIONS.length)
    expect(SCHEDULE_GOTO_EXTRA_TARGETS).toContain('season')
    expect(SCHEDULE_GOTO_EXTRA_TARGETS).toContain('NO_SCHEDULE')
  })
})
