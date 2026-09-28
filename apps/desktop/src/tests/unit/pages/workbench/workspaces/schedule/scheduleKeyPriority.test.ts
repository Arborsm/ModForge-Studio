import { describe, expect, it } from 'vite-plus/test'
import {
  buildSchedulePriorityGroups,
  describeScheduleKey,
  SCHEDULE_KEY_FAMILY_ORDER,
  type ScheduleEntrySummary,
} from '@pages/workbench/workspaces/schedule/entities/schedule'

function makeSummary(key: string, overrides: Partial<ScheduleEntrySummary> = {}): ScheduleEntrySummary {
  return {
    key,
    script: '900 Town 1 2 0',
    vanillaScript: null,
    origin: 'project',
    enabled: true,
    label: null,
    structured: true,
    ...overrides,
  }
}

describe('schedule key family order', () => {
  it('covers every family exactly once', () => {
    expect(new Set(SCHEDULE_KEY_FAMILY_ORDER).size).toBe(SCHEDULE_KEY_FAMILY_ORDER.length)
  })

  it('ranks the families the game consults first above the fallbacks', () => {
    const rankOf = (family: string) => SCHEDULE_KEY_FAMILY_ORDER.indexOf(family as never)
    expect(rankOf('greenRain')).toBe(0)
    expect(rankOf('marriageWeekday')).toBeLessThan(rankOf('festival'))
    expect(rankOf('seasonDay')).toBeLessThan(rankOf('day'))
    expect(rankOf('rain')).toBeLessThan(rankOf('seasonWeekday'))
    expect(rankOf('seasonWeekdayHearts')).toBeLessThan(rankOf('seasonWeekday'))
    expect(rankOf('weekdayHearts')).toBeLessThan(rankOf('weekday'))
    expect(rankOf('season')).toBeLessThan(rankOf('default'))
    // Editor-only classifications close the list.
    expect(rankOf('locationReplacement')).toBe(SCHEDULE_KEY_FAMILY_ORDER.length - 2)
    expect(rankOf('custom')).toBe(SCHEDULE_KEY_FAMILY_ORDER.length - 1)
  })
})

describe('schedule priority groups', () => {
  it('lays out groups in resolution order regardless of entry order', () => {
    const groups = buildSchedulePriorityGroups([
      makeSummary('default'),
      makeSummary('custom_thing'),
      makeSummary('spring_2'),
      makeSummary('GreenRain'),
      makeSummary('marriage_Mon'),
      makeSummary('rain'),
    ])

    expect(groups.map((group) => group.family)).toEqual(['greenRain', 'marriageWeekday', 'seasonDay', 'rain', 'default', 'custom'])
    expect(groups.map((group) => group.rank)).toEqual([0, 4, 6, 11, 17, 19])
  })

  it('drops families without entries so the rail renders no bare heading', () => {
    const groups = buildSchedulePriorityGroups([makeSummary('spring')])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ family: 'season', rank: SCHEDULE_KEY_FAMILY_ORDER.indexOf('season') })
    expect(buildSchedulePriorityGroups([])).toEqual([])
  })

  it('sorts entries inside a family with numeric collation', () => {
    const groups = buildSchedulePriorityGroups([
      makeSummary('spring_10'),
      makeSummary('spring_2'),
      makeSummary('spring_1'),
      makeSummary('fall_3'),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]!.entries.map((entry) => entry.summary.key)).toEqual(['fall_3', 'spring_1', 'spring_2', 'spring_10'])
  })

  it('carries the key description alongside each summary', () => {
    const [group] = buildSchedulePriorityGroups([makeSummary('summer_Wed_8', { enabled: false })])
    const entry = group!.entries[0]!

    expect(entry.summary.enabled).toBe(false)
    expect(entry.description).toEqual(describeScheduleKey('summer_Wed_8'))
    expect(entry.description).toMatchObject({ season: 'summer', weekday: 'Wed', hearts: 8 })
  })
})
