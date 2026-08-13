import { describe, expect, it } from 'vite-plus/test'
import {
  buildDialogueKey,
  compareDialoguePriority,
  createDefaultKeyBuild,
  describeDialogueKey,
  DIALOGUE_FAMILY_RANK,
  DIALOGUE_FAMILY_TIER,
  findShadowedKeys,
  getDialogueKeyMode,
  isMarriageDialogueAsset,
  parseDialogueKey,
  type DialogueKeyFamily,
} from '@entities/dialogue'

describe('dialogue key builder', () => {
  it('builds daily keys across season and hearts combinations', () => {
    expect(buildDialogueKey({ mode: 'daily', season: 'any', weekday: 'Mon', hearts: 0 })).toBe('Mon')
    expect(buildDialogueKey({ mode: 'daily', season: 'any', weekday: 'Tue', hearts: 4 })).toBe('Tue4')
    expect(buildDialogueKey({ mode: 'daily', season: 'fall', weekday: 'Mon', hearts: 8 })).toBe('fall_Mon8')
    expect(buildDialogueKey({ mode: 'daily', season: 'summer', weekday: 'Sun', hearts: 0 })).toBe('summer_Sun')
  })

  it('builds date, hearts, location, and introduction keys', () => {
    expect(buildDialogueKey({ mode: 'date', season: 'fall', day: 15 })).toBe('fall_15')
    expect(buildDialogueKey({ mode: 'date', season: 'winter', day: 99 })).toBe('winter_28')
    expect(buildDialogueKey({ mode: 'hearts', hearts: 4 })).toBe('4')
    expect(buildDialogueKey({ mode: 'hearts', hearts: 0 })).toBe('')
    expect(buildDialogueKey({ mode: 'location', location: 'Resort_Bar', variant: 1 })).toBe('Resort_Bar')
    expect(buildDialogueKey({ mode: 'location', location: 'Resort_Umbrella', variant: 2 })).toBe('Resort_Umbrella_2')
    expect(buildDialogueKey({ mode: 'introduction' })).toBe('Introduction')
    expect(buildDialogueKey({ mode: 'custom', key: '  AcceptGift_(O)66 ' })).toBe('AcceptGift_(O)66')
  })

  it('classifies vanilla keys back into builder state', () => {
    expect(parseDialogueKey('Mon')).toEqual({ mode: 'daily', season: 'any', weekday: 'Mon', hearts: 0 })
    expect(parseDialogueKey('Tue4')).toEqual({ mode: 'daily', season: 'any', weekday: 'Tue', hearts: 4 })
    expect(parseDialogueKey('summer_Tue4')).toEqual({ mode: 'daily', season: 'summer', weekday: 'Tue', hearts: 4 })
    expect(parseDialogueKey('fall_15')).toEqual({ mode: 'date', season: 'fall', day: 15 })
    expect(parseDialogueKey('4')).toEqual({ mode: 'hearts', hearts: 4 })
    expect(parseDialogueKey('Resort_Bar')).toEqual({ mode: 'location', location: 'Resort_Bar', variant: 1 })
    expect(parseDialogueKey('Resort_Umbrella_2')).toEqual({ mode: 'location', location: 'Resort_Umbrella', variant: 2 })
    expect(parseDialogueKey('Introduction')).toEqual({ mode: 'introduction' })
    expect(parseDialogueKey('eventSeen_733330_memory_oneday')).toEqual({ mode: 'custom', key: 'eventSeen_733330_memory_oneday' })
    expect(parseDialogueKey('AcceptGift_(O)StardropTea')).toEqual({ mode: 'custom', key: 'AcceptGift_(O)StardropTea' })
  })

  it('round-trips builder state through build and parse', () => {
    for (const key of ['Mon', 'Sat6', 'winter_Wed6', 'spring_12', 'Resort_Towel_3', 'Introduction', 'Sun_WildColor']) {
      expect(buildDialogueKey(parseDialogueKey(key)), key).toBe(key)
    }
  })

  it('reports the key family used for badges and breadcrumbs', () => {
    expect(getDialogueKeyMode('winter_Sat')).toBe('daily')
    expect(getDialogueKeyMode('spring_23')).toBe('date')
    expect(getDialogueKeyMode('8')).toBe('hearts')
    expect(getDialogueKeyMode('Resort')).toBe('location')
    expect(getDialogueKeyMode('divorced')).toBe('custom')
  })

  it('seeds sensible defaults when switching modes and keeps the key when going custom', () => {
    expect(createDefaultKeyBuild('daily')).toEqual({ mode: 'daily', season: 'any', weekday: 'Mon', hearts: 0 })
    expect(createDefaultKeyBuild('custom', { mode: 'daily', season: 'fall', weekday: 'Mon', hearts: 8 })).toEqual({
      mode: 'custom',
      key: 'fall_Mon8',
    })
  })
})

describe('dialogue key families', () => {
  it('resolves every date family from the key shape', () => {
    expect(describeDialogueKey('Mon')).toEqual({ key: 'Mon', family: 'weekday', rank: DIALOGUE_FAMILY_RANK.weekday, weekday: 'Mon' })
    expect(describeDialogueKey('Mon10')).toEqual({
      key: 'Mon10',
      family: 'weekdayHearts',
      rank: DIALOGUE_FAMILY_RANK.weekdayHearts,
      weekday: 'Mon',
      hearts: 10,
    })
    expect(describeDialogueKey('spring_Mon')).toMatchObject({ family: 'seasonWeekday', season: 'spring', weekday: 'Mon' })
    expect(describeDialogueKey('spring_Mon2')).toMatchObject({ family: 'seasonWeekdayHearts', season: 'spring', weekday: 'Mon', hearts: 2 })
    expect(describeDialogueKey('spring_1')).toMatchObject({ family: 'seasonDay', season: 'spring', dayOfMonth: 1, weekday: 'Mon' })
    expect(describeDialogueKey('spring_1_2')).toMatchObject({ family: 'seasonDayYear', season: 'spring', dayOfMonth: 1, minYear: 2 })
  })

  it('derives the weekday from the day of month because seasons start on Monday', () => {
    expect(describeDialogueKey('fall_7').weekday).toBe('Sun')
    expect(describeDialogueKey('fall_8').weekday).toBe('Mon')
    expect(describeDialogueKey('winter_28').weekday).toBe('Sun')
  })

  it('resolves marriage, in-law, story, location and custom families', () => {
    expect(describeDialogueKey('spouseRoom_3').family).toBe('marriage_spouseRoom')
    expect(describeDialogueKey('Indoor_Day_2').family).toBe('marriage_indoor')
    expect(describeDialogueKey('Rainy_Day_0').family).toBe('marriage_indoor')
    expect(describeDialogueKey('Outdoor_1').family).toBe('marriage_outdoor')
    expect(describeDialogueKey('patio_2').family).toBe('marriage_outdoor')
    expect(describeDialogueKey('jobLeave_Harvey').family).toBe('marriage_job')
    expect(describeDialogueKey('funReturn_Abigail').family).toBe('marriage_job')
    expect(describeDialogueKey('Introduction').family).toBe('introduction')
    expect(describeDialogueKey('danceRejection').family).toBe('danceRejection')
    expect(describeDialogueKey('secondChance_Girls').family).toBe('secondchance')
    expect(describeDialogueKey('dumped_Guys').family).toBe('dumped')
    expect(describeDialogueKey('breakUp').family).toBe('breakUp')
    expect(describeDialogueKey('Resort_Umbrella_2')).toMatchObject({ family: 'location', location: 'Resort_Umbrella' })
    expect(describeDialogueKey('GreenRain')).toMatchObject({ family: 'location', location: 'GreenRain' })
    expect(describeDialogueKey('eventSeen_733330_memory_oneday').family).toBe('custom')
  })

  it('parses the spouse and the date part out of in-law keys', () => {
    expect(describeDialogueKey('fall_Mon_inlaw_Abigail')).toEqual({
      key: 'fall_Mon_inlaw_Abigail',
      family: 'inlaw',
      rank: DIALOGUE_FAMILY_RANK.inlaw,
      spouse: 'Abigail',
      season: 'fall',
      weekday: 'Mon',
    })
    expect(describeDialogueKey('spring_15_inlaw_Sebastian')).toMatchObject({ spouse: 'Sebastian', season: 'spring', dayOfMonth: 15 })
    expect(describeDialogueKey('Mon_inlaw_Penny')).toMatchObject({ family: 'inlaw', spouse: 'Penny', weekday: 'Mon' })
  })

  it('re-homes bare date keys into the marriage families inside a MarriageDialogue asset', () => {
    expect(isMarriageDialogueAsset('MarriageDialogueAbigail')).toBe(true)
    expect(isMarriageDialogueAsset('Abigail')).toBe(false)
    expect(describeDialogueKey('spring_1', { marriageAsset: true }).family).toBe('marriage_seasonDay')
    expect(describeDialogueKey('Mon', { marriageAsset: true }).family).toBe('marriage_weekday')
    expect(describeDialogueKey('Mon', { marriageAsset: true }).rank).toBeGreaterThan(describeDialogueKey('Mon').rank)
  })

  it('assigns every family a rank and a left-rail tier', () => {
    const families = Object.keys(DIALOGUE_FAMILY_RANK) as DialogueKeyFamily[]
    for (const family of families) {
      expect(Number.isFinite(DIALOGUE_FAMILY_RANK[family]), family).toBe(true)
      expect(DIALOGUE_FAMILY_TIER[family], family).toBeDefined()
    }
    expect(new Set(families).size).toBe(20)
  })
})

describe('dialogue key precedence', () => {
  it('orders the vanilla precedence chain ascending', () => {
    const chain = ['Mon', 'Mon2', 'spring_Mon', 'spring_Mon2', 'spring_1', 'spring_1_2']
    for (let index = 1; index < chain.length; index += 1) {
      expect(compareDialoguePriority(chain[index - 1] ?? '', chain[index] ?? ''), `${chain[index - 1]} < ${chain[index]}`).toBeLessThan(0)
    }
  })

  it('lets a season key beat a hearts-gated bare weekday key', () => {
    expect(compareDialoguePriority('Mon10', 'summer_Mon')).toBeLessThan(0)
    expect(compareDialoguePriority('summer_Mon', 'Mon10')).toBeGreaterThan(0)
  })

  it('breaks ties inside a family by hearts and then by required year', () => {
    expect(compareDialoguePriority('Mon2', 'Mon10')).toBeLessThan(0)
    expect(compareDialoguePriority('spring_1_2', 'spring_1_3')).toBeLessThan(0)
    expect(compareDialoguePriority('Mon', 'Tue')).toBe(0)
  })
})

describe('dialogue key shadowing', () => {
  it('reports summer_Mon shadowing Mon10 for the summer half of its days', () => {
    expect(findShadowedKeys(['Mon10', 'summer_Mon'])).toEqual([{ key: 'Mon10', shadowedBy: 'summer_Mon', scope: 'partial' }])
  })

  it('marks a shadow partial while the winner is narrower in season, day or year', () => {
    expect(findShadowedKeys(['spring_Mon', 'spring_1'])).toEqual([{ key: 'spring_Mon', shadowedBy: 'spring_1', scope: 'partial' }])
    expect(findShadowedKeys(['spring_1', 'spring_1_2'])).toEqual([{ key: 'spring_1', shadowedBy: 'spring_1_2', scope: 'partial' }])
  })

  it('marks a shadow full when the winner applies on every day the loser does', () => {
    expect(findShadowedKeys(['spring_1', 'spring_1_1'])).toEqual([{ key: 'spring_1', shadowedBy: 'spring_1_1', scope: 'full' }])
  })

  it('blames the strongest shadowing key when several compete', () => {
    expect(findShadowedKeys(['Mon', 'Mon2', 'spring_Mon'])).toEqual([
      { key: 'Mon', shadowedBy: 'spring_Mon', scope: 'partial' },
      { key: 'Mon2', shadowedBy: 'spring_Mon', scope: 'partial' },
    ])
  })

  it('never reports keys that the game resolves through different lookups', () => {
    expect(findShadowedKeys(['Introduction', 'Mon', 'Resort_Bar', 'breakUp', 'eventSeen_1_memory'])).toEqual([])
    expect(findShadowedKeys(['spring_1', 'spring_1_inlaw_Abigail'])).toEqual([])
  })

  it('does not report keys whose conditions cannot coincide', () => {
    expect(findShadowedKeys(['Mon', 'spring_2'])).toEqual([])
    expect(findShadowedKeys(['summer_Mon', 'winter_Mon2'])).toEqual([])
  })

  it('compares marriage date keys only against each other', () => {
    expect(findShadowedKeys(['Mon', 'spring_1'], { marriageAsset: true })).toEqual([
      { key: 'Mon', shadowedBy: 'spring_1', scope: 'partial' },
    ])
  })
})
