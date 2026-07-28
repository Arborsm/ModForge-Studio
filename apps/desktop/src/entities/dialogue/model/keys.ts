/**
 * Two layers over `Characters/Dialogue` entry keys.
 *
 * 1. Builder layer (`DialogueKeyBuild` / `buildDialogueKey` / `parseDialogueKey`):
 *    round-trips the key-composer UI state. Deliberately coarse.
 * 2. Priority layer (`describeDialogueKey` / `compareDialoguePriority` /
 *    `findShadowedKeys`): models which key the game actually picks when several
 *    match the same day, so the editor can flag shadowed entries.
 *
 * The game resolves daily dialogue in ascending precedence
 * `Mon` < `Mon2` < `spring_Mon` < `spring_Mon2` < `spring_1` < `spring_1_2`,
 * i.e. a season-scoped key beats a bare hearts-gated one (`summer_Mon` wins over
 * `Mon10`), an exact date beats a weekday, and a year-gated date beats a plain one.
 */

export const DIALOGUE_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export type DialogueWeekday = (typeof DIALOGUE_WEEKDAYS)[number]

export const DIALOGUE_SEASONS = ['spring', 'summer', 'fall', 'winter'] as const
export type DialogueSeason = (typeof DIALOGUE_SEASONS)[number]

/** Heart thresholds accepted by hearts-gated keys. */
export const DIALOGUE_HEART_LEVELS = [2, 4, 6, 8, 10, 12, 14] as const

/** Vanilla location-scoped dialogue key stems, from the shipped dialogue assets. */
export const DIALOGUE_LOCATION_KEYS = [
  'GreenRain',
  'Resort',
  'Resort_Bar',
  'Resort_Chair',
  'Resort_Dance',
  'Resort_Entering',
  'Resort_Leaving',
  'Resort_Shore',
  'Resort_Towel',
  'Resort_Umbrella',
  'Resort_Wander',
] as const

export type DialogueKeyBuild =
  | { mode: 'daily'; season: DialogueSeason | 'any'; weekday: DialogueWeekday; hearts: number }
  | { mode: 'date'; season: DialogueSeason; day: number }
  | { mode: 'hearts'; hearts: number }
  | { mode: 'location'; location: string; variant: number }
  | { mode: 'introduction' }
  | { mode: 'custom'; key: string }

export type DialogueKeyMode = DialogueKeyBuild['mode']

const WEEKDAY_KEY_PATTERN = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(\d+)?$/u
const SEASON_WEEKDAY_KEY_PATTERN = /^(spring|summer|fall|winter)_(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(\d+)?$/u
const SEASON_DAY_KEY_PATTERN = /^(spring|summer|fall|winter)_(\d{1,2})$/u
const SEASON_DAY_YEAR_KEY_PATTERN = /^(spring|summer|fall|winter)_(\d{1,2})_(\d{1,3})$/u
const HEARTS_KEY_PATTERN = /^\d{1,2}$/u
const LOCATION_VARIANT_PATTERN = /^(.*)_(\d+)$/u
const INLAW_KEY_PATTERN = /^(.+)_inlaw_(.+)$/iu

function clampHearts(hearts: number): number {
  if (!Number.isFinite(hearts) || hearts <= 0) {
    return 0
  }
  return Math.min(14, Math.trunc(hearts))
}

function clampDay(day: number): number {
  if (!Number.isFinite(day)) {
    return 1
  }
  return Math.max(1, Math.min(28, Math.trunc(day)))
}

/** Builds the dialogue key string for a builder state ('' when incomplete). */
export function buildDialogueKey(build: DialogueKeyBuild): string {
  switch (build.mode) {
    case 'daily': {
      const hearts = clampHearts(build.hearts)
      const heartsSuffix = hearts > 0 ? String(hearts) : ''
      const seasonPrefix = build.season === 'any' ? '' : `${build.season}_`
      return `${seasonPrefix}${build.weekday}${heartsSuffix}`
    }
    case 'date':
      return `${build.season}_${clampDay(build.day)}`
    case 'hearts': {
      const hearts = clampHearts(build.hearts)
      return hearts > 0 ? String(hearts) : ''
    }
    case 'location': {
      const location = build.location.trim()
      if (!location) {
        return ''
      }
      return build.variant >= 2 ? `${location}_${Math.trunc(build.variant)}` : location
    }
    case 'introduction':
      return 'Introduction'
    case 'custom':
      return build.key.trim()
  }
}

/** Classifies an existing key back into builder state; unknown shapes become custom. */
export function parseDialogueKey(key: string): DialogueKeyBuild {
  const trimmed = key.trim()

  if (trimmed === 'Introduction') {
    return { mode: 'introduction' }
  }

  const weekdayMatch = WEEKDAY_KEY_PATTERN.exec(trimmed)
  if (weekdayMatch) {
    return {
      mode: 'daily',
      season: 'any',
      weekday: weekdayMatch[1] as DialogueWeekday,
      hearts: weekdayMatch[2] ? Number.parseInt(weekdayMatch[2], 10) : 0,
    }
  }

  const seasonWeekdayMatch = SEASON_WEEKDAY_KEY_PATTERN.exec(trimmed)
  if (seasonWeekdayMatch) {
    return {
      mode: 'daily',
      season: seasonWeekdayMatch[1] as DialogueSeason,
      weekday: seasonWeekdayMatch[2] as DialogueWeekday,
      hearts: seasonWeekdayMatch[3] ? Number.parseInt(seasonWeekdayMatch[3], 10) : 0,
    }
  }

  const seasonDayMatch = SEASON_DAY_KEY_PATTERN.exec(trimmed)
  if (seasonDayMatch) {
    const day = Number.parseInt(seasonDayMatch[2] ?? '', 10)
    if (day >= 1 && day <= 28) {
      return { mode: 'date', season: seasonDayMatch[1] as DialogueSeason, day }
    }
  }

  if (HEARTS_KEY_PATTERN.test(trimmed)) {
    return { mode: 'hearts', hearts: Number.parseInt(trimmed, 10) }
  }

  const locationDescriptor = matchLocationKey(trimmed)
  if (locationDescriptor) {
    return { mode: 'location', location: locationDescriptor.location, variant: locationDescriptor.variant }
  }

  return { mode: 'custom', key: trimmed }
}

/** Returns the key family used for list badges and the editor breadcrumb. */
export function getDialogueKeyMode(key: string): DialogueKeyMode {
  return parseDialogueKey(key).mode
}

/** Returns the default builder state for a mode, seeded from the previous state where sensible. */
export function createDefaultKeyBuild(mode: DialogueKeyMode, previous?: DialogueKeyBuild): DialogueKeyBuild {
  switch (mode) {
    case 'daily':
      return { mode, season: 'any', weekday: 'Mon', hearts: 0 }
    case 'date':
      return { mode, season: 'spring', day: 1 }
    case 'hearts':
      return { mode, hearts: 4 }
    case 'location':
      return { mode, location: DIALOGUE_LOCATION_KEYS[0], variant: 1 }
    case 'introduction':
      return { mode }
    case 'custom':
      return { mode, key: previous ? buildDialogueKey(previous) : '' }
  }
}

/* ------------------------------------------------------------------ */
/* Priority layer                                                      */
/* ------------------------------------------------------------------ */

export type DialogueKeyFamily =
  | 'marriage_spouseRoom'
  | 'marriage_indoor'
  | 'marriage_outdoor'
  | 'marriage_job'
  | 'marriage_seasonDay'
  | 'marriage_weekday'
  | 'inlaw'
  | 'introduction'
  | 'danceRejection'
  | 'secondchance'
  | 'dumped'
  | 'breakUp'
  | 'location'
  | 'seasonDayYear'
  | 'seasonDay'
  | 'seasonWeekdayHearts'
  | 'seasonWeekday'
  | 'weekdayHearts'
  | 'weekday'
  | 'custom'

/** Higher wins. Gaps leave room for finer within-family tie-breaks. */
export const DIALOGUE_FAMILY_RANK: Record<DialogueKeyFamily, number> = {
  marriage_spouseRoom: 100,
  marriage_indoor: 96,
  marriage_outdoor: 92,
  marriage_job: 88,
  marriage_seasonDay: 84,
  marriage_weekday: 80,
  inlaw: 72,
  introduction: 64,
  danceRejection: 62,
  secondchance: 60,
  dumped: 58,
  breakUp: 56,
  location: 48,
  seasonDayYear: 40,
  seasonDay: 36,
  seasonWeekdayHearts: 32,
  seasonWeekday: 28,
  weekdayHearts: 24,
  weekday: 20,
  custom: 8,
}

/** Top-level grouping of the left-rail tree, ordered by descending priority. */
export const DIALOGUE_KEY_TIERS = ['highPriority', 'story', 'location', 'date', 'custom'] as const
export type DialogueKeyTier = (typeof DIALOGUE_KEY_TIERS)[number]

export const DIALOGUE_FAMILY_TIER: Record<DialogueKeyFamily, DialogueKeyTier> = {
  marriage_spouseRoom: 'highPriority',
  marriage_indoor: 'highPriority',
  marriage_outdoor: 'highPriority',
  marriage_job: 'highPriority',
  marriage_seasonDay: 'highPriority',
  marriage_weekday: 'highPriority',
  inlaw: 'highPriority',
  introduction: 'story',
  danceRejection: 'story',
  secondchance: 'story',
  dumped: 'story',
  breakUp: 'story',
  location: 'location',
  seasonDayYear: 'date',
  seasonDay: 'date',
  seasonWeekdayHearts: 'date',
  seasonWeekday: 'date',
  weekdayHearts: 'date',
  weekday: 'date',
  custom: 'custom',
}

/**
 * Which of the game's lookups a family competes in. Keys from different lookups
 * never shadow each other: `Introduction` is fired by the meet-NPC path, resort
 * keys by the island path, and marriage keys read a different asset entirely.
 */
export type DialogueLookupGroup = 'daily' | 'marriageDaily' | 'standalone'

export const DIALOGUE_FAMILY_LOOKUP_GROUP: Record<DialogueKeyFamily, DialogueLookupGroup> = {
  marriage_spouseRoom: 'standalone',
  marriage_indoor: 'standalone',
  marriage_outdoor: 'standalone',
  marriage_job: 'standalone',
  marriage_seasonDay: 'marriageDaily',
  marriage_weekday: 'marriageDaily',
  inlaw: 'standalone',
  introduction: 'standalone',
  danceRejection: 'standalone',
  secondchance: 'standalone',
  dumped: 'standalone',
  breakUp: 'standalone',
  location: 'standalone',
  seasonDayYear: 'daily',
  seasonDay: 'daily',
  seasonWeekdayHearts: 'daily',
  seasonWeekday: 'daily',
  weekdayHearts: 'daily',
  weekday: 'daily',
  custom: 'standalone',
}

export type DialogueKeyDescriptor = {
  key: string
  family: DialogueKeyFamily
  rank: number
  season?: DialogueSeason
  weekday?: DialogueWeekday
  dayOfMonth?: number
  /** First year the key applies to; `spring_1_2` starts at year 2. */
  minYear?: number
  hearts?: number
  spouse?: string
  location?: string
}

export type DescribeDialogueKeyOptions = {
  /** True when the key lives in a `MarriageDialogue*` asset, which changes how bare date keys resolve. */
  marriageAsset?: boolean
}

const MARRIAGE_ASSET_PATTERN = /^MarriageDialogue/iu
const MARRIAGE_SPOUSE_ROOM_PATTERN = /^spouseRoom(_\d+)?$/iu
const MARRIAGE_INDOOR_PATTERN = /^(Indoor_Day|Rainy_Day|Good|Bad|Neutral)(_\d+)?$/iu
const MARRIAGE_OUTDOOR_PATTERN = /^(Outdoor|patio)(_\d+)?$/iu
const MARRIAGE_JOB_PATTERN = /^(funLeave|jobLeave|funReturn|jobReturn)(_.+)?$/iu
const DANCE_REJECTION_PATTERN = /^danceRejection$/iu
const SECOND_CHANCE_PATTERN = /^secondChance(_.+)?$/iu
const DUMPED_PATTERN = /^dumped(_.+)?$/iu
const BREAK_UP_PATTERN = /^breakUp(_.+)?$/iu

/** True when a dialogue asset id addresses the spouse-only dialogue table. */
export function isMarriageDialogueAsset(npcId: string): boolean {
  return MARRIAGE_ASSET_PATTERN.test(npcId.trim())
}

function matchLocationKey(key: string): { location: string; variant: number } | null {
  const catalog = DIALOGUE_LOCATION_KEYS as readonly string[]
  if (catalog.includes(key)) {
    return { location: key, variant: 1 }
  }
  const variantMatch = LOCATION_VARIANT_PATTERN.exec(key)
  if (variantMatch) {
    const stem = variantMatch[1] ?? ''
    const variant = Number.parseInt(variantMatch[2] ?? '', 10)
    if (catalog.includes(stem) && variant >= 1) {
      return { location: stem, variant }
    }
  }
  return null
}

/** Stardew seasons always start on a Monday, so the day of month fixes the weekday. */
function weekdayForDayOfMonth(day: number): DialogueWeekday {
  return DIALOGUE_WEEKDAYS[(day - 1) % 7] as DialogueWeekday
}

function describe(key: string, family: DialogueKeyFamily, extra: Omit<DialogueKeyDescriptor, 'key' | 'family' | 'rank'> = {}) {
  return { key, family, rank: DIALOGUE_FAMILY_RANK[family], ...extra } satisfies DialogueKeyDescriptor
}

function describeDatePart(key: string, part: string): DialogueKeyDescriptor | null {
  const seasonDayYearMatch = SEASON_DAY_YEAR_KEY_PATTERN.exec(part)
  if (seasonDayYearMatch) {
    const day = Number.parseInt(seasonDayYearMatch[2] ?? '', 10)
    const year = Number.parseInt(seasonDayYearMatch[3] ?? '', 10)
    if (day >= 1 && day <= 28 && year >= 1) {
      return describe(key, 'seasonDayYear', {
        season: seasonDayYearMatch[1] as DialogueSeason,
        dayOfMonth: day,
        weekday: weekdayForDayOfMonth(day),
        minYear: year,
      })
    }
  }

  const seasonDayMatch = SEASON_DAY_KEY_PATTERN.exec(part)
  if (seasonDayMatch) {
    const day = Number.parseInt(seasonDayMatch[2] ?? '', 10)
    if (day >= 1 && day <= 28) {
      return describe(key, 'seasonDay', {
        season: seasonDayMatch[1] as DialogueSeason,
        dayOfMonth: day,
        weekday: weekdayForDayOfMonth(day),
      })
    }
  }

  const seasonWeekdayMatch = SEASON_WEEKDAY_KEY_PATTERN.exec(part)
  if (seasonWeekdayMatch) {
    const hearts = seasonWeekdayMatch[3] ? Number.parseInt(seasonWeekdayMatch[3], 10) : 0
    return describe(key, hearts > 0 ? 'seasonWeekdayHearts' : 'seasonWeekday', {
      season: seasonWeekdayMatch[1] as DialogueSeason,
      weekday: seasonWeekdayMatch[2] as DialogueWeekday,
      ...(hearts > 0 ? { hearts } : {}),
    })
  }

  const weekdayMatch = WEEKDAY_KEY_PATTERN.exec(part)
  if (weekdayMatch) {
    const hearts = weekdayMatch[2] ? Number.parseInt(weekdayMatch[2], 10) : 0
    return describe(key, hearts > 0 ? 'weekdayHearts' : 'weekday', {
      weekday: weekdayMatch[1] as DialogueWeekday,
      ...(hearts > 0 ? { hearts } : {}),
    })
  }

  return null
}

/**
 * Resolves a key into the family, rank and matching conditions the game uses.
 * Unrecognised shapes fall back to `custom`, which never shadows anything.
 */
export function describeDialogueKey(key: string, options: DescribeDialogueKeyOptions = {}): DialogueKeyDescriptor {
  const trimmed = key.trim()

  const inlawMatch = INLAW_KEY_PATTERN.exec(trimmed)
  if (inlawMatch) {
    const datePart = describeDatePart(trimmed, inlawMatch[1] ?? '')
    return describe(trimmed, 'inlaw', {
      spouse: (inlawMatch[2] ?? '').trim(),
      ...(datePart?.season ? { season: datePart.season } : {}),
      ...(datePart?.weekday ? { weekday: datePart.weekday } : {}),
      ...(datePart?.dayOfMonth ? { dayOfMonth: datePart.dayOfMonth } : {}),
    })
  }

  if (MARRIAGE_SPOUSE_ROOM_PATTERN.test(trimmed)) {
    return describe(trimmed, 'marriage_spouseRoom')
  }
  if (MARRIAGE_INDOOR_PATTERN.test(trimmed)) {
    return describe(trimmed, 'marriage_indoor')
  }
  if (MARRIAGE_OUTDOOR_PATTERN.test(trimmed)) {
    return describe(trimmed, 'marriage_outdoor')
  }
  if (MARRIAGE_JOB_PATTERN.test(trimmed)) {
    return describe(trimmed, 'marriage_job')
  }

  if (trimmed.toLowerCase() === 'introduction') {
    return describe(trimmed, 'introduction')
  }
  if (DANCE_REJECTION_PATTERN.test(trimmed)) {
    return describe(trimmed, 'danceRejection')
  }
  if (SECOND_CHANCE_PATTERN.test(trimmed)) {
    return describe(trimmed, 'secondchance')
  }
  if (DUMPED_PATTERN.test(trimmed)) {
    return describe(trimmed, 'dumped')
  }
  if (BREAK_UP_PATTERN.test(trimmed)) {
    return describe(trimmed, 'breakUp')
  }

  const location = matchLocationKey(trimmed)
  if (location) {
    return describe(trimmed, 'location', { location: location.location })
  }

  const datePart = describeDatePart(trimmed, trimmed)
  if (datePart) {
    if (!options.marriageAsset) {
      return datePart
    }
    const marriageFamily = datePart.dayOfMonth != null ? 'marriage_seasonDay' : 'marriage_weekday'
    return { ...datePart, family: marriageFamily, rank: DIALOGUE_FAMILY_RANK[marriageFamily] }
  }

  return describe(trimmed, 'custom')
}

function toDescriptor(value: string | DialogueKeyDescriptor, options?: DescribeDialogueKeyOptions): DialogueKeyDescriptor {
  return typeof value === 'string' ? describeDialogueKey(value, options) : value
}

/**
 * Orders two keys by the precedence the game applies (negative when `left`
 * loses). Within one family the narrower gate wins: more hearts, then a later
 * required year.
 */
export function compareDialoguePriority(left: string | DialogueKeyDescriptor, right: string | DialogueKeyDescriptor): number {
  const a = toDescriptor(left)
  const b = toDescriptor(right)

  if (a.rank !== b.rank) {
    return a.rank - b.rank
  }
  const heartsDelta = (a.hearts ?? 0) - (b.hearts ?? 0)
  if (heartsDelta !== 0) {
    return heartsDelta
  }
  return (a.minYear ?? 1) - (b.minYear ?? 1)
}

export type DialogueShadowScope = 'full' | 'partial'

export type DialogueShadowReport = {
  /** The key that loses. */
  key: string
  /** The higher-precedence key that wins. */
  shadowedBy: string
  /**
   * `full` when the winner applies everywhere the loser does, so the loser can
   * never show; `partial` when the winner is narrower (e.g. season-scoped) and
   * only steals part of the loser's days.
   */
  scope: DialogueShadowScope
}

/** True when both keys can match on the same in-game day. */
function conditionsOverlap(a: DialogueKeyDescriptor, b: DialogueKeyDescriptor): boolean {
  if (a.season && b.season && a.season !== b.season) {
    return false
  }
  if (a.dayOfMonth != null && b.dayOfMonth != null && a.dayOfMonth !== b.dayOfMonth) {
    return false
  }
  if (a.weekday && b.weekday && a.weekday !== b.weekday) {
    return false
  }
  return true
}

/** True when `winner` matches on every day `loser` matches, hearts and year included. */
function coversEntirely(winner: DialogueKeyDescriptor, loser: DialogueKeyDescriptor): boolean {
  if (winner.season && winner.season !== loser.season) {
    return false
  }
  if (winner.dayOfMonth != null && winner.dayOfMonth !== loser.dayOfMonth) {
    return false
  }
  if (winner.weekday && winner.weekday !== loser.weekday) {
    return false
  }
  if ((winner.hearts ?? 0) > (loser.hearts ?? 0)) {
    return false
  }
  return (winner.minYear ?? 1) <= (loser.minYear ?? 1)
}

/**
 * Reports every key that a higher-precedence sibling steals days from.
 * Only keys resolved by the same game lookup are compared, so one-off story
 * keys and location keys never produce noise. Each loser is reported once,
 * against the strongest key that shadows it.
 */
export function findShadowedKeys(keys: readonly string[], options: DescribeDialogueKeyOptions = {}): DialogueShadowReport[] {
  const descriptors = keys.map((key) => describeDialogueKey(key, options))
  const reports: DialogueShadowReport[] = []

  for (const loser of descriptors) {
    const group = DIALOGUE_FAMILY_LOOKUP_GROUP[loser.family]
    if (group === 'standalone') {
      continue
    }

    let best: { winner: DialogueKeyDescriptor; scope: DialogueShadowScope } | null = null
    for (const winner of descriptors) {
      if (winner.key === loser.key || DIALOGUE_FAMILY_LOOKUP_GROUP[winner.family] !== group) {
        continue
      }
      if (compareDialoguePriority(winner, loser) <= 0 || !conditionsOverlap(winner, loser)) {
        continue
      }
      const scope: DialogueShadowScope = coversEntirely(winner, loser) ? 'full' : 'partial'
      const beatsBest = !best || (scope === best.scope ? compareDialoguePriority(winner, best.winner) > 0 : scope === 'full')
      if (beatsBest) {
        best = { winner, scope }
      }
    }

    if (best) {
      reports.push({ key: loser.key, shadowedBy: best.winner.key, scope: best.scope })
    }
  }

  return reports
}
