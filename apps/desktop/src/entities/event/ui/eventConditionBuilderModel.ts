import { splitEventPreconditions } from '../model/parser'
import type { EventPatchHubEvent } from '../model/patchHub'
import { EventPreconditionParser, formatEventPreconditionForHub, type ParsedEventPrecondition } from '../model/preconditionSemantics'
import type { HubCopy, ConditionBuilderCopy } from './eventConditionBuilderTypes'

export type ConditionCategory = 'world' | 'social' | 'player' | 'story' | 'query'
export type CatalogControlKind = 'choice-text' | 'choice' | 'range' | 'number' | 'text' | 'pair-tall' | 'pair' | 'none'
export type SeasonId = 'spring' | 'summer' | 'fall' | 'winter'
export type WeatherId = 'sunny' | 'rainy' | 'storm' | 'snow' | 'greenRain'

export interface CatalogConditionDefinition {
  key: string
  category: ConditionCategory
  requiresArgs?: boolean
}

export interface ConditionChip {
  id: string
  category: ConditionCategory
  label: string
  natural: string
  code: string
  negated: boolean
}

export interface ChipDragState {
  chipId: string
  pointerId: number
  startX: number
  startY: number
  currentX: number
  currentY: number
  overChipId: string | null
}

export const CATEGORY_IDS: ConditionCategory[] = ['world', 'social', 'player', 'story', 'query']

export const SEASON_CODES = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
} satisfies Record<SeasonId, string>

export const WEATHER_CODES = {
  sunny: 'sunny',
  rainy: 'rainy',
  storm: 'storm',
  snow: 'snow',
  greenRain: 'green_rain',
} satisfies Record<WeatherId, string>

export const NPC_OPTIONS = ['Abigail', 'Sam', 'Clint', 'Emily', 'Sebastian', 'Leah', 'Haley', 'Penny']
export const SKILL_OPTIONS = ['Farming', 'Mining', 'Foraging', 'Fishing', 'Combat', 'Luck']
export const COMPACT_CHAIN_THRESHOLD = 6
export const ITEM_SUGGESTIONS = [
  { id: '24', label: 'Parsnip' },
  { id: '72', label: 'Diamond' },
  { id: '74', label: 'Prismatic Shard' },
  { id: '340', label: 'Honey' },
]

export const CATALOG_CONDITIONS: CatalogConditionDefinition[] = [
  { key: 'DayOfMonth', category: 'world', requiresArgs: true },
  { key: 'DayOfWeek', category: 'world', requiresArgs: true },
  { key: 'Random', category: 'world', requiresArgs: true },
  { key: 'UpcomingFestival', category: 'world', requiresArgs: true },
  { key: 'InUpgradedHouse', category: 'world' },
  { key: 'Year', category: 'world', requiresArgs: true },
  { key: 'FestivalDay', category: 'world' },
  { key: 'NPCVisible', category: 'social', requiresArgs: true },
  { key: 'Roommate', category: 'social' },
  { key: 'Shipped', category: 'player', requiresArgs: true },
  { key: 'Tile', category: 'player', requiresArgs: true },
  { key: 'EarnedMoney', category: 'player', requiresArgs: true },
  { key: 'FreeInventorySlots', category: 'player', requiresArgs: true },
  { key: 'MissingPet', category: 'player' },
  { key: 'ReachedMineBottom', category: 'player' },
  { key: 'ChoseDialogueAnswers', category: 'player', requiresArgs: true },
  { key: 'SpouseBed', category: 'player' },
  { key: 'ActiveDialogueEvent', category: 'story', requiresArgs: true },
  { key: 'WorldState', category: 'story', requiresArgs: true },
  { key: 'HostMail', category: 'story', requiresArgs: true },
  { key: 'HostOrLocalMail', category: 'story', requiresArgs: true },
  { key: 'GoldenWalnuts', category: 'story', requiresArgs: true },
  { key: 'DaysPlayed', category: 'story', requiresArgs: true },
  { key: 'SawSecretNote', category: 'story', requiresArgs: true },
  { key: 'CommunityCenterOrWarehouseDone', category: 'story' },
  { key: 'IsHost', category: 'story' },
  { key: 'JojaBundlesDone', category: 'story' },
]

export const DEFAULT_CATALOG_ARGS: Record<string, string> = {
  Random: '0.2',
  UpcomingFestival: '3',
  Year: '2',
  GoldenWalnuts: '100',
  EarnedMoney: '10000',
  FreeInventorySlots: '2',
  SawSecretNote: '10',
  Shipped: '24 1',
  Tile: '12 45',
  DaysPlayed: '28',
}

export const WEEKDAY_CODES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const DAY_PRESETS = ['1', '7', '14', '21', '28'] as const

export function catalogControlKind(key: string): CatalogControlKind {
  if (key === 'DayOfMonth' || key === 'NPCVisible') {
    return 'choice-text'
  }
  if (key === 'DayOfWeek' || key === 'MissingPet') {
    return 'choice'
  }
  if (key === 'Random') {
    return 'range'
  }
  if (key === 'Shipped') {
    return 'pair-tall'
  }
  if (key === 'Tile') {
    return 'pair'
  }
  if (
    [
      'GoldenWalnuts',
      'UpcomingFestival',
      'Year',
      'EarnedMoney',
      'FreeInventorySlots',
      'SawSecretNote',
      'DaysPlayed',
      'InUpgradedHouse',
      'ReachedMineBottom',
    ].includes(key)
  ) {
    return 'number'
  }
  if (['ActiveDialogueEvent', 'WorldState', 'ChoseDialogueAnswers', 'HostMail', 'HostOrLocalMail'].includes(key)) {
    return 'text'
  }
  return 'none'
}

export function clockLabel(value: number) {
  const hours = Math.floor(value / 100)
  const minutes = value % 100
  return `${hours}:${String(minutes).padStart(2, '0')}`
}

export function compactText(value: string, maxLength = 12) {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) {
    return trimmed
  }
  return `${trimmed.slice(0, maxLength - 3)}...`
}

function categoryForPrecondition(category: 'environment' | 'player' | 'progress'): ConditionCategory {
  if (category === 'player') {
    return 'player'
  }
  if (category === 'progress') {
    return 'story'
  }
  return 'world'
}

function compactClockLabel(value: string) {
  const numeric = Number.parseInt(value, 10)
  if (!Number.isFinite(numeric)) {
    return value
  }

  const hours = Math.floor(numeric / 100)
  const minutes = Math.abs(numeric % 100)
  return minutes === 0 ? String(hours) : `${hours}:${String(minutes).padStart(2, '0')}`
}

function compactName(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  if (/^[A-Za-z]+$/u.test(trimmed)) {
    return trimmed.length > 3 ? trimmed.slice(0, 3) : trimmed
  }
  return Array.from(trimmed).slice(0, 3).join('')
}

function compactSeasonName(value: string) {
  const trimmed = value.trim()
  if (/^[A-Za-z]+$/u.test(trimmed)) {
    return trimmed.slice(0, 3)
  }
  return trimmed.replace(/季$/u, '')
}

export function compactWeatherName(value: string) {
  const trimmed = value.trim()
  if (/^[A-Za-z\s]+$/u.test(trimmed)) {
    return trimmed.split(/\s+/u)[0] ?? trimmed
  }
  return trimmed
}

function friendshipHeartCount(points: string) {
  const numeric = Number.parseInt(points, 10)
  if (!Number.isFinite(numeric)) {
    return points
  }
  return String(Math.max(0, Math.floor(numeric / 250)))
}

export function normalizeRangeValue(value: number) {
  const hours = Math.floor(value / 100)
  const minutes = value % 100
  const normalizedMinutes = minutes >= 30 ? 30 : 0
  return Math.min(2400, Math.max(600, hours * 100 + normalizedMinutes))
}

export function quoteQuery(value: string) {
  return `"${value.trim().replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`
}

export function gameStateQueryFromChip(chip: ConditionChip | undefined) {
  if (!chip?.code.startsWith('GameStateQuery')) {
    return ''
  }
  const parsed = new EventPreconditionParser().parseOne(chip.code)
  return parsed.args.join(' ')
}

export function initialEventId(event: EventPatchHubEvent) {
  return splitEventPreconditions(event.key)[0] ?? event.eventId
}

function compactLabelForPrecondition(precondition: ParsedEventPrecondition, hubCopy: HubCopy) {
  const [first = '', second = ''] = precondition.args

  switch (precondition.canonicalKey) {
    case 'Time':
      return `${compactClockLabel(first)}-${compactClockLabel(second)}`
    case 'Season':
      return precondition.args.map((season) => compactSeasonName(hubCopy.preconditionSeasonName(season))).join('/')
    case 'Weather':
      return compactWeatherName(hubCopy.preconditionWeatherName(first))
    case 'Friendship':
      return `${compactName(first)} ${friendshipHeartCount(second)}${hubCopy.preconditionGroupLabels.environment === '触发环境' ? '心' : 'h'}`
    case 'Dating':
    case 'Spouse':
    case 'NpcVisibleHere':
    case 'NPCVisible':
      return compactName(first)
    case 'HasMoney':
    case 'EarnedMoney':
      return `${first}g`
    case 'Skill':
      return `${first} ${second}`
    case 'Gender':
      return hubCopy.preconditionGenderName(first)
    case 'HasItem':
    case 'Shipped':
      return compactText(first, 10)
    case 'LocalMail':
    case 'HostMail':
    case 'HostOrLocalMail':
      return compactText(first, 12)
    case 'SawEvent':
      return `#${compactText(first, 10)}`
    case 'GameStateQuery':
      return compactText(precondition.args.join(' '), 14)
    default:
      return compactText(formatEventPreconditionForHub({ ...precondition, negated: false }, hubCopy), 14)
  }
}

export function compactLabelForChip(chip: ConditionChip, hubCopy: HubCopy) {
  if (chip.id.startsWith('weather:')) {
    return compactWeatherName(chip.label)
  }

  const parser = new EventPreconditionParser()
  const parsed = parser.parseOne(chip.code)
  return compactLabelForPrecondition(parsed, hubCopy)
}

export function initialChips(event: EventPatchHubEvent, hubCopy: HubCopy): ConditionChip[] {
  const parser = new EventPreconditionParser()
  return splitEventPreconditions(event.key)
    .slice(1)
    .filter(Boolean)
    .map((raw, index) => {
      const parsed = parser.parseOne(raw)
      const label = formatEventPreconditionForHub({ ...parsed, negated: false }, hubCopy)
      return {
        id: `existing:${index}:${raw}`,
        category: categoryForPrecondition(parsed.category),
        label,
        natural: label,
        code: raw.replace(/^!\s*/u, ''),
        negated: parsed.negated,
      }
    })
}

export function chipCode(chip: ConditionChip) {
  return `${chip.negated ? '!' : ''}${chip.code}`
}

export function chipNatural(chip: ConditionChip, copy: ConditionBuilderCopy) {
  return chip.negated ? copy.negateLabel(chip.natural) : chip.natural
}
