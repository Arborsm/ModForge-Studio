import { describe, expect, it } from 'vite-plus/test'
import {
  buildScheduleTime,
  collectScheduleModelIssues,
  createSchedulePointAfter,
  findLastSchedulePoint,
  getScheduleFacingId,
  getScheduleTimeParts,
  isScheduleScriptStructured,
  parseScheduleScript,
  parseScheduleSegment,
  serializeScheduleScript,
  serializeScheduleSegment,
  type SchedulePointSegment,
} from '@pages/workbench/workspaces/schedule/entities/schedule'

/** Real vanilla 1.5.1-1.6 schedule entry values (copied verbatim from game data / wiki). */
const VANILLA_FIXTURES: string[] = [
  // Abigail "rain": plain points with animation
  '900 SeedShop 9 5 0/1100 SeedShop 13 20 0/1300 SeedShop 39 5 0/1500 SeedShop 7 9 2/1900 SeedShop 6 4 0/2200 SeedShop 1 9 3 abigail_sleep',
  // Abigail "marriage_Fri": quoted dialogue, animation + dialogue combined, bed shorthand
  '800 SeedShop 36 9 0 "Strings\\schedules\\Abigail:marriage_Fri.000"/1100 Mountain 49 31 2 abigail_flute/1500 Saloon 42 17 2 abigail_sit_down "Strings\\schedules\\Abigail:marriage_Fri.001"/2030 bed',
  // Abigail "marriage_Mon" (1.5.1): negative tile coordinate
  '830 SeedShop 6 19 0 "Strings\\schedules\\Abigail:marriage_Mon.000"/1300 Town 47 87 0 "Strings\\schedules\\Abigail:marriage_Mon.001"/1700 Saloon 33 18 0 "Strings\\schedules\\Abigail:marriage_Mon.002"/2030 BusStop -1 23 3',
  // Abigail "16": bare GOTO redirect
  'GOTO 6',
  // Abigail "11": NOT friendship guard before points
  'NOT friendship Sebastian 6/1000 SebastianRoom 5 4 2 abigail_sit_down/1700 SeedShop 1 9 3 abigail_sleep',
  // Penny "23": guard chained into a redirect
  'NOT friendship Sam 6/GOTO 9',
  // Penny "GreenRain": time 0 with square animation
  '0 Saloon 5 21 1 square_1_3',
  // Penny "marriage_DesertFestival_2": arrival-prefixed time
  'a1000 Desert 38 42 2 "Strings\\1_6_Strings:DesertFestival_Penny_marriage"/2440 bed',
  // Penny "CommunityCenter_Replacement": location point without a time (kept raw)
  'ArchaeologyHouse 16 10 2',
  // Alex "Sun": MAIL branch followed by GOTO and points
  'MAIL saloonSportsRoom/GOTO Sun_normal/800 Town 64 64 2 alex_football/1100 Saloon 32 7 0 "Strings\\schedules\\Alex:Sun.000"/1500 Town 50 68 1/1830 JoshHouse 8 19 2/2000 JoshHouse 17 5 0/2200 JoshHouse 21 4 1 alex_sleep',
  // Emily "fall_15": location-less point (1900 35 25 0) and arrival times mid-schedule
  'MAIL ccVault/GOTO spring/900 HaleyHouse 16 5 2/a1200 SandyHouse 4 5 3 "Strings\\schedules\\Emily:Sandy_Birthday_Greeting"/1300 Desert 1 51 2 "Strings\\schedules\\Emily:Sandy_Birthday_Hangout"/1500 Desert 10 18 0 "Strings\\schedules\\Emily:Sandy_Birthday_Lake"/1700 Desert 5 33 2 "Strings\\schedules\\Emily:Sandy_Birthday_Bones"/1800 Desert 25 32 0 "Strings\\schedules\\Emily:Sandy_Birthday_Hangout"/1900 35 25 0 "Strings\\schedules\\Emily:Sandy_Birthday_Camel"/2000 Desert 6 55 2 "Strings\\schedules\\Emily:Sandy_Birthday_Hangout"/a2330 Desert 28 24 1 "Strings\\schedules\\Emily:Sandy_Birthday_Bye"/2400 HaleyHouse 21 4 1 emily_sleep',
  // Harvey "summer": square_X_Y animation
  '700 HarveyRoom 21 7 0/830 Hospital 6 15 2/1200 Town 23 36 2 square_7_5/1730 Hospital 9 15 3/1840 HarveyRoom 11 5 3 harvey_read/2200 HarveyRoom 13 4 1 harvey_sleep',
  // template.json "rain": legacy dot-separated garbage must survive verbatim
  '900 0 2 3 1 2 2.1200 2 2 1 3 2 1 3.1400 2 1 3 2 1 3 2 1',
  // Sam "GreenRain": early-morning time
  '610 SamHouse 6 13 2',
]

describe('schedule script model', () => {
  it('round-trips every vanilla fixture verbatim', () => {
    for (const fixture of VANILLA_FIXTURES) {
      expect(serializeScheduleScript(parseScheduleScript(fixture))).toBe(fixture)
    }
  })

  it('round-trips degenerate inputs verbatim', () => {
    const degenerateInputs = [
      '',
      '/',
      'GOTO 6/',
      '  900 Town 1 2 3',
      '900  Town 1 2', // double space is preserved through the raw fallback
      '900 Town 1 2 "unterminated',
      'UNKNOWN COMMAND with words',
      '0900 Town 1 2', // leading-zero time stays raw so the digits survive
    ]
    for (const input of degenerateInputs) {
      expect(serializeScheduleScript(parseScheduleScript(input))).toBe(input)
    }
  })

  it('parses a full point with facing, animation and dialogue', () => {
    const model = parseScheduleScript('1500 Saloon 42 17 2 abigail_sit_down "Strings\\schedules\\Abigail:marriage_Fri.001"')
    expect(model.segments).toEqual([
      {
        kind: 'point',
        time: 1500,
        arrival: false,
        location: 'Saloon',
        x: 42,
        y: 17,
        facing: 2,
        animation: 'abigail_sit_down',
        dialogue: 'Strings\\schedules\\Abigail:marriage_Fri.001',
      },
    ])
  })

  it('parses arrival times, location-less points and dialogue without animation', () => {
    const model = parseScheduleScript(
      'a1200 SandyHouse 4 5 3 "Strings\\schedules\\Emily:Sandy_Birthday_Greeting"/1900 35 25 0 "Strings\\schedules\\Emily:Sandy_Birthday_Camel"',
    )
    const [first, second] = model.segments
    expect(first).toMatchObject({ kind: 'point', time: 1200, arrival: true, location: 'SandyHouse', facing: 3, animation: null })
    expect(second).toMatchObject({ kind: 'point', time: 1900, arrival: false, location: null, x: 35, y: 25, facing: 0 })
  })

  it('parses the bed and location-only shorthands without coordinates', () => {
    expect(parseScheduleSegment('2030 bed')).toEqual({
      kind: 'point',
      time: 2030,
      arrival: false,
      location: 'bed',
      x: null,
      y: null,
      facing: null,
      animation: null,
      dialogue: null,
    })
    expect(parseScheduleSegment('610 SeedShop')).toMatchObject({ kind: 'point', time: 610, location: 'SeedShop', x: null, y: null })
  })

  it('parses GOTO, MAIL and multi-pair NOT friendship commands', () => {
    expect(parseScheduleSegment('GOTO NO_SCHEDULE')).toEqual({ kind: 'goto', target: 'NO_SCHEDULE' })
    expect(parseScheduleSegment('MAIL ccVault')).toEqual({ kind: 'mail', mailId: 'ccVault' })
    expect(parseScheduleSegment('NOT friendship Sam 6 Penny 6')).toEqual({
      kind: 'notFriendship',
      requirements: [
        { npc: 'Sam', hearts: 6 },
        { npc: 'Penny', hearts: 6 },
      ],
    })
  })

  it('keeps timeless replacement points and unknown syntax as raw segments', () => {
    expect(parseScheduleSegment('ArchaeologyHouse 16 10 2')).toEqual({ kind: 'raw', text: 'ArchaeologyHouse 16 10 2' })
    expect(parseScheduleSegment('900 0 2 3 1 2 2.1200 2 2 1 3 2 1 3.1400 2 1 3 2 1 3 2 1').kind).toBe('raw')
    expect(isScheduleScriptStructured('ArchaeologyHouse 16 10 2')).toBe(false)
    expect(isScheduleScriptStructured('900 SeedShop 9 5 0/2030 bed')).toBe(true)
  })

  it('serializes structured edits back into canonical syntax', () => {
    const point: SchedulePointSegment = {
      kind: 'point',
      time: 610,
      arrival: true,
      location: 'Town',
      x: -1,
      y: 23,
      facing: 3,
      animation: 'penny_read',
      dialogue: 'Strings\\schedules\\Penny:rain2.000',
    }
    expect(serializeScheduleSegment(point)).toBe('a610 Town -1 23 3 penny_read "Strings\\schedules\\Penny:rain2.000"')
    expect(serializeScheduleSegment({ ...point, facing: null, animation: null, dialogue: null })).toBe('a610 Town -1 23')
    expect(serializeScheduleSegment({ kind: 'notFriendship', requirements: [{ npc: 'Sebastian', hearts: 6 }] })).toBe(
      'NOT friendship Sebastian 6',
    )
  })

  it('collects blocking and non-blocking issues', () => {
    const issues = collectScheduleModelIssues({
      segments: [{ kind: 'goto', target: '' }, ...parseScheduleScript('2700 Town 1 2 3/nonsense segment here').segments],
    })
    expect(issues).toContainEqual({ kind: 'goto-target-missing', severity: 'error', index: 0 })
    expect(issues).toContainEqual({ kind: 'time-out-of-range', severity: 'warning', index: 1, time: 2700 })
    expect(issues).toContainEqual({ kind: 'raw-segment', severity: 'warning', index: 2 })
    expect(collectScheduleModelIssues({ segments: [{ kind: 'mail', mailId: ' ' }] })).toEqual([
      { kind: 'mail-id-missing', severity: 'error', index: 0 },
    ])
    expect(collectScheduleModelIssues({ segments: [{ kind: 'notFriendship', requirements: [] }] })).toEqual([
      { kind: 'friendship-npc-missing', severity: 'error', index: 0 },
    ])
    const quotedDialoguePoint: SchedulePointSegment = {
      kind: 'point',
      time: 900,
      arrival: false,
      location: 'Town',
      x: 1,
      y: 2,
      facing: 2,
      animation: null,
      dialogue: 'say "hi"',
    }
    expect(collectScheduleModelIssues({ segments: [quotedDialoguePoint] })).toEqual([
      { kind: 'dialogue-quote', severity: 'error', index: 0 },
    ])
    expect(collectScheduleModelIssues(parseScheduleScript('0 Saloon 5 21 1 square_1_3'))).toEqual([])
  })

  it('provides time helpers and seeded new points', () => {
    expect(getScheduleTimeParts(1030)).toEqual({ hour: 10, minute: 30 })
    expect(buildScheduleTime(26, 0)).toBe(2600)
    expect(getScheduleFacingId(0)).toBe('up')
    expect(getScheduleFacingId(3)).toBe('left')

    const model = parseScheduleScript('900 SeedShop 39 5 0/1030 SeedShop 2 20 3')
    const lastPoint = findLastSchedulePoint(model)
    expect(lastPoint?.time).toBe(1030)

    const nextPoint = createSchedulePointAfter(lastPoint)
    expect(nextPoint).toMatchObject({ time: 1130, location: 'SeedShop', x: 2, y: 20, facing: 2 })

    const clamped = createSchedulePointAfter({ ...nextPoint, time: 2550 })
    expect(clamped.time).toBe(2600)

    expect(createSchedulePointAfter(null)).toMatchObject({ time: 900, location: null, x: 0, y: 0 })
  })
})
