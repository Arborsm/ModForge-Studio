/**
 * Schedule key families for Stardew Valley 1.6 (`NPC::TryLoadSchedule()`).
 * Keys are matched case-insensitively; `describeScheduleKey` classifies a key
 * into the family used for entry-list badges and the key picker.
 */

export const SCHEDULE_SEASONS = ['spring', 'summer', 'fall', 'winter'] as const

export type ScheduleSeason = (typeof SCHEDULE_SEASONS)[number]

export const SCHEDULE_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export type ScheduleWeekday = (typeof SCHEDULE_WEEKDAYS)[number]

/** Passive festival ids from `Data/PassiveFestivals` usable in schedule keys. */
export const SCHEDULE_PASSIVE_FESTIVAL_IDS = ['NightMarket', 'DesertFestival', 'TroutDerby', 'SquidFest'] as const

/**
 * Key families ordered roughly by the game's schedule resolution priority
 * (special, marriage, then normal keys, then editor-only classifications).
 */
export type ScheduleKeyFamily =
  | 'greenRain'
  | 'marriageFestival'
  | 'marriageSeasonDay'
  | 'marriageJob'
  | 'marriageWeekday'
  | 'festival'
  | 'seasonDay'
  | 'dayHearts'
  | 'day'
  | 'bus'
  | 'rain2'
  | 'rain'
  | 'seasonWeekdayHearts'
  | 'seasonWeekday'
  | 'weekdayHearts'
  | 'weekday'
  | 'season'
  | 'default'
  | 'locationReplacement'
  | 'custom'

/**
 * Families in the order `NPC.TryLoadSchedule()` consults them: the first family
 * whose key exists wins, so a rail that lists them top-down reads as the
 * game's own resolution order. `locationReplacement` and `custom` are editor
 * classifications rather than resolution steps and close the list.
 */
export const SCHEDULE_KEY_FAMILY_ORDER: readonly ScheduleKeyFamily[] = [
  'greenRain',
  'marriageFestival',
  'marriageSeasonDay',
  'marriageJob',
  'marriageWeekday',
  'festival',
  'seasonDay',
  'dayHearts',
  'day',
  'bus',
  'rain2',
  'rain',
  'seasonWeekdayHearts',
  'seasonWeekday',
  'weekdayHearts',
  'weekday',
  'season',
  'default',
  'locationReplacement',
  'custom',
]

export type ScheduleKeyDescription = {
  key: string
  family: ScheduleKeyFamily
  /** True for every `marriage*` key (only used while married to a player). */
  marriage: boolean
  season: ScheduleSeason | null
  weekday: ScheduleWeekday | null
  /** Day of month (1-28) or passive-festival day, depending on the family. */
  day: number | null
  hearts: number | null
  festivalId: string | null
  /** Location name for `<location>_Replacement` keys. */
  location: string | null
}

const DAY_OF_MONTH_PATTERN = /^([1-9]|1\d|2[0-8])$/u
const HEARTS_PATTERN = /^\d{1,2}$/u
const REPLACEMENT_SUFFIX_PATTERN = /^(.+)_Replacement$/iu

function matchSeason(token: string): ScheduleSeason | null {
  const lowered = token.toLowerCase()
  return SCHEDULE_SEASONS.find((season) => season === lowered) ?? null
}

function matchWeekday(token: string): ScheduleWeekday | null {
  const lowered = token.toLowerCase()
  return SCHEDULE_WEEKDAYS.find((weekday) => weekday.toLowerCase() === lowered) ?? null
}

function matchFestival(token: string): { festivalId: string; day: number | null } | null {
  const festivalId = SCHEDULE_PASSIVE_FESTIVAL_IDS.find((id) => token.toLowerCase() === id.toLowerCase())
  if (festivalId) {
    return { festivalId, day: null }
  }

  const separator = token.lastIndexOf('_')
  if (separator <= 0) {
    return null
  }

  const prefix = token.slice(0, separator)
  const daySuffix = token.slice(separator + 1)
  const prefixedFestivalId = SCHEDULE_PASSIVE_FESTIVAL_IDS.find((id) => prefix.toLowerCase() === id.toLowerCase())
  if (!prefixedFestivalId || !/^\d{1,2}$/u.test(daySuffix)) {
    return null
  }

  return { festivalId: prefixedFestivalId, day: Number.parseInt(daySuffix, 10) }
}

function buildDescription(key: string, family: ScheduleKeyFamily, overrides: Partial<ScheduleKeyDescription> = {}): ScheduleKeyDescription {
  return {
    key,
    family,
    marriage: false,
    season: null,
    weekday: null,
    day: null,
    hearts: null,
    festivalId: null,
    location: null,
    ...overrides,
  }
}

function describeMarriageKey(key: string, remainder: string): ScheduleKeyDescription {
  const weekday = matchWeekday(remainder)
  if (weekday) {
    return buildDescription(key, 'marriageWeekday', { marriage: true, weekday })
  }

  const parts = remainder.split('_')
  if (parts.length === 2) {
    const season = matchSeason(parts[0]!)
    if (season && DAY_OF_MONTH_PATTERN.test(parts[1]!)) {
      return buildDescription(key, 'marriageSeasonDay', { marriage: true, season, day: Number.parseInt(parts[1]!, 10) })
    }
  }

  const festival = matchFestival(remainder)
  if (festival) {
    return buildDescription(key, 'marriageFestival', { marriage: true, festivalId: festival.festivalId, day: festival.day })
  }

  return buildDescription(key, 'custom', { marriage: true })
}

/** Classifies a schedule key into its family with the extracted parameters. */
export function describeScheduleKey(rawKey: string): ScheduleKeyDescription {
  const key = rawKey.trim()
  const lowered = key.toLowerCase()

  if (lowered === 'greenrain') {
    return buildDescription(key, 'greenRain')
  }
  if (lowered === 'rain') {
    return buildDescription(key, 'rain')
  }
  if (lowered === 'rain2') {
    return buildDescription(key, 'rain2')
  }
  if (lowered === 'bus') {
    return buildDescription(key, 'bus')
  }
  if (lowered === 'default') {
    return buildDescription(key, 'default')
  }
  if (lowered === 'marriagejob') {
    return buildDescription(key, 'marriageJob', { marriage: true })
  }
  if (lowered.startsWith('marriage_')) {
    return describeMarriageKey(key, key.slice('marriage_'.length))
  }

  const season = matchSeason(key)
  if (season) {
    return buildDescription(key, 'season', { season })
  }

  const weekday = matchWeekday(key)
  if (weekday) {
    return buildDescription(key, 'weekday', { weekday })
  }

  if (DAY_OF_MONTH_PATTERN.test(key)) {
    return buildDescription(key, 'day', { day: Number.parseInt(key, 10) })
  }

  const festival = matchFestival(key)
  if (festival) {
    return buildDescription(key, 'festival', { festivalId: festival.festivalId, day: festival.day })
  }

  const parts = key.split('_')
  if (parts.length === 2) {
    const [first, second] = [parts[0]!, parts[1]!]
    const firstSeason = matchSeason(first)
    if (firstSeason && DAY_OF_MONTH_PATTERN.test(second)) {
      return buildDescription(key, 'seasonDay', { season: firstSeason, day: Number.parseInt(second, 10) })
    }
    if (firstSeason) {
      const secondWeekday = matchWeekday(second)
      if (secondWeekday) {
        return buildDescription(key, 'seasonWeekday', { season: firstSeason, weekday: secondWeekday })
      }
    }
    if (DAY_OF_MONTH_PATTERN.test(first) && HEARTS_PATTERN.test(second)) {
      return buildDescription(key, 'dayHearts', { day: Number.parseInt(first, 10), hearts: Number.parseInt(second, 10) })
    }
    const firstWeekday = matchWeekday(first)
    if (firstWeekday && HEARTS_PATTERN.test(second)) {
      return buildDescription(key, 'weekdayHearts', { weekday: firstWeekday, hearts: Number.parseInt(second, 10) })
    }
  }

  if (parts.length === 3) {
    const seasonPart = matchSeason(parts[0]!)
    const weekdayPart = matchWeekday(parts[1]!)
    if (seasonPart && weekdayPart && HEARTS_PATTERN.test(parts[2]!)) {
      return buildDescription(key, 'seasonWeekdayHearts', {
        season: seasonPart,
        weekday: weekdayPart,
        hearts: Number.parseInt(parts[2]!, 10),
      })
    }
  }

  const replacementMatch = REPLACEMENT_SUFFIX_PATTERN.exec(key)
  if (replacementMatch) {
    return buildDescription(key, 'locationReplacement', { location: replacementMatch[1]! })
  }

  return buildDescription(key, 'custom')
}

/**
 * Common keys offered by the entry-key picker. Custom keys stay free input;
 * this list only seeds the datalist with the frequent vanilla patterns.
 */
export const SCHEDULE_KEY_SUGGESTIONS: readonly string[] = [
  ...SCHEDULE_SEASONS,
  ...SCHEDULE_WEEKDAYS,
  ...SCHEDULE_SEASONS.flatMap((season) => SCHEDULE_WEEKDAYS.map((weekday) => `${season}_${weekday}`)),
  'rain',
  'rain2',
  'GreenRain',
  'bus',
  'default',
  'marriageJob',
  ...SCHEDULE_WEEKDAYS.map((weekday) => `marriage_${weekday}`),
  ...SCHEDULE_PASSIVE_FESTIVAL_IDS,
  ...SCHEDULE_PASSIVE_FESTIVAL_IDS.map((festivalId) => `${festivalId}_1`),
]

/** Common `GOTO` targets beyond entry keys (season resolves to the current season). */
export const SCHEDULE_GOTO_EXTRA_TARGETS: readonly string[] = ['season', 'NO_SCHEDULE', ...SCHEDULE_SEASONS]
