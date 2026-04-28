import type { EditorCopy } from '../../locales'
import {
  formatGameStateQueryForHub,
  parseGameStateQuery,
  type ParsedGameStateQuerySet,
} from './EventGameStateQuerySemantics'

export type EventPreconditionCategory = 'environment' | 'player' | 'progress'

export type CanonicalEventPreconditionKey =
  | 'GameStateQuery'
  | 'ActiveDialogueEvent'
  | 'DayOfMonth'
  | 'DayOfWeek'
  | 'FestivalDay'
  | 'GoldenWalnuts'
  | 'InUpgradedHouse'
  | 'NPCVisible'
  | 'NpcVisibleHere'
  | 'Random'
  | 'Season'
  | 'Time'
  | 'UpcomingFestival'
  | 'Weather'
  | 'WorldState'
  | 'Year'
  | 'ChoseDialogueAnswers'
  | 'Dating'
  | 'EarnedMoney'
  | 'FreeInventorySlots'
  | 'Friendship'
  | 'Gender'
  | 'HasItem'
  | 'HasMoney'
  | 'LocalMail'
  | 'MissingPet'
  | 'ReachedMineBottom'
  | 'Roommate'
  | 'SawEvent'
  | 'SawSecretNote'
  | 'Shipped'
  | 'Skill'
  | 'Spouse'
  | 'SpouseBed'
  | 'Tile'
  | 'CommunityCenterOrWarehouseDone'
  | 'DaysPlayed'
  | 'HostMail'
  | 'HostOrLocalMail'
  | 'IsHost'
  | 'JojaBundlesDone'
  | 'SendMail'
  | 'Custom'

export interface ParsedEventPrecondition {
  raw: string
  key: string
  args: string[]
  canonicalKey: CanonicalEventPreconditionKey
  category: EventPreconditionCategory
  negated: boolean
  deprecated: boolean
  isKnown: boolean
  gameStateQuery?: ParsedGameStateQuerySet
}

export interface EventPreconditionGroups {
  environment: ParsedEventPrecondition[]
  player: ParsedEventPrecondition[]
  progress: ParsedEventPrecondition[]
}

interface PreconditionDefinition {
  canonicalKey: CanonicalEventPreconditionKey
  category: EventPreconditionCategory
}

interface LegacyAliasDefinition extends PreconditionDefinition {
  negated?: boolean
}

const BUILT_IN_PRECONDITIONS: Record<string, PreconditionDefinition> = {
  gamestatequery: { canonicalKey: 'GameStateQuery', category: 'environment' },
  activedialogueevent: { canonicalKey: 'ActiveDialogueEvent', category: 'environment' },
  dayofmonth: { canonicalKey: 'DayOfMonth', category: 'environment' },
  dayofweek: { canonicalKey: 'DayOfWeek', category: 'environment' },
  festivalday: { canonicalKey: 'FestivalDay', category: 'environment' },
  goldenwalnuts: { canonicalKey: 'GoldenWalnuts', category: 'progress' },
  inupgradedhouse: { canonicalKey: 'InUpgradedHouse', category: 'environment' },
  npcvisible: { canonicalKey: 'NPCVisible', category: 'environment' },
  npcvisiblehere: { canonicalKey: 'NpcVisibleHere', category: 'environment' },
  random: { canonicalKey: 'Random', category: 'environment' },
  season: { canonicalKey: 'Season', category: 'environment' },
  time: { canonicalKey: 'Time', category: 'environment' },
  upcomingfestival: { canonicalKey: 'UpcomingFestival', category: 'environment' },
  weather: { canonicalKey: 'Weather', category: 'environment' },
  worldstate: { canonicalKey: 'WorldState', category: 'environment' },
  year: { canonicalKey: 'Year', category: 'environment' },
  chosedialogueanswers: { canonicalKey: 'ChoseDialogueAnswers', category: 'player' },
  dating: { canonicalKey: 'Dating', category: 'player' },
  earnedmoney: { canonicalKey: 'EarnedMoney', category: 'player' },
  freeinventoryslots: { canonicalKey: 'FreeInventorySlots', category: 'player' },
  friendship: { canonicalKey: 'Friendship', category: 'player' },
  gender: { canonicalKey: 'Gender', category: 'player' },
  hasitem: { canonicalKey: 'HasItem', category: 'player' },
  hasmoney: { canonicalKey: 'HasMoney', category: 'player' },
  localmail: { canonicalKey: 'LocalMail', category: 'progress' },
  missingpet: { canonicalKey: 'MissingPet', category: 'player' },
  reachedminebottom: { canonicalKey: 'ReachedMineBottom', category: 'progress' },
  roommate: { canonicalKey: 'Roommate', category: 'player' },
  sawevent: { canonicalKey: 'SawEvent', category: 'progress' },
  sawsecretnote: { canonicalKey: 'SawSecretNote', category: 'progress' },
  shipped: { canonicalKey: 'Shipped', category: 'progress' },
  skill: { canonicalKey: 'Skill', category: 'player' },
  spouse: { canonicalKey: 'Spouse', category: 'player' },
  spousebed: { canonicalKey: 'SpouseBed', category: 'player' },
  tile: { canonicalKey: 'Tile', category: 'environment' },
  communitycenterorwarehousedone: { canonicalKey: 'CommunityCenterOrWarehouseDone', category: 'progress' },
  daysplayed: { canonicalKey: 'DaysPlayed', category: 'progress' },
  hostmail: { canonicalKey: 'HostMail', category: 'progress' },
  hostorlocalmail: { canonicalKey: 'HostOrLocalMail', category: 'progress' },
  ishost: { canonicalKey: 'IsHost', category: 'progress' },
  jojabundlesdone: { canonicalKey: 'JojaBundlesDone', category: 'progress' },
}

const LEGACY_ALIASES: Record<string, LegacyAliasDefinition> = {
  '*': { canonicalKey: 'WorldState', category: 'environment' },
  '*n': { canonicalKey: 'HostOrLocalMail', category: 'progress' },
  '*l': { canonicalKey: 'HostOrLocalMail', category: 'progress', negated: true },
  a: { canonicalKey: 'Tile', category: 'environment' },
  A: { canonicalKey: 'ActiveDialogueEvent', category: 'environment', negated: true },
  b: { canonicalKey: 'ReachedMineBottom', category: 'progress' },
  B: { canonicalKey: 'SpouseBed', category: 'player' },
  c: { canonicalKey: 'FreeInventorySlots', category: 'player' },
  C: { canonicalKey: 'CommunityCenterOrWarehouseDone', category: 'progress' },
  d: { canonicalKey: 'DayOfWeek', category: 'environment', negated: true },
  D: { canonicalKey: 'Dating', category: 'player' },
  e: { canonicalKey: 'SawEvent', category: 'progress' },
  f: { canonicalKey: 'Friendship', category: 'player' },
  F: { canonicalKey: 'FestivalDay', category: 'environment', negated: true },
  g: { canonicalKey: 'Gender', category: 'player' },
  G: { canonicalKey: 'GameStateQuery', category: 'environment' },
  h: { canonicalKey: 'MissingPet', category: 'player' },
  H: { canonicalKey: 'IsHost', category: 'progress' },
  Hn: { canonicalKey: 'HostMail', category: 'progress' },
  Hl: { canonicalKey: 'HostMail', category: 'progress', negated: true },
  i: { canonicalKey: 'HasItem', category: 'player' },
  j: { canonicalKey: 'DaysPlayed', category: 'progress' },
  J: { canonicalKey: 'JojaBundlesDone', category: 'progress' },
  k: { canonicalKey: 'SawEvent', category: 'progress', negated: true },
  l: { canonicalKey: 'LocalMail', category: 'progress', negated: true },
  L: { canonicalKey: 'InUpgradedHouse', category: 'environment' },
  m: { canonicalKey: 'EarnedMoney', category: 'player' },
  M: { canonicalKey: 'HasMoney', category: 'player' },
  n: { canonicalKey: 'LocalMail', category: 'progress' },
  N: { canonicalKey: 'GoldenWalnuts', category: 'progress' },
  o: { canonicalKey: 'Spouse', category: 'player', negated: true },
  O: { canonicalKey: 'Spouse', category: 'player' },
  p: { canonicalKey: 'NpcVisibleHere', category: 'environment' },
  q: { canonicalKey: 'ChoseDialogueAnswers', category: 'player' },
  r: { canonicalKey: 'Random', category: 'environment' },
  R: { canonicalKey: 'Roommate', category: 'player' },
  Rf: { canonicalKey: 'Roommate', category: 'player', negated: true },
  s: { canonicalKey: 'Shipped', category: 'progress' },
  S: { canonicalKey: 'SawSecretNote', category: 'progress' },
  t: { canonicalKey: 'Time', category: 'environment' },
  u: { canonicalKey: 'DayOfMonth', category: 'environment' },
  U: { canonicalKey: 'UpcomingFestival', category: 'environment', negated: true },
  v: { canonicalKey: 'NPCVisible', category: 'environment' },
  w: { canonicalKey: 'Weather', category: 'environment' },
  x: { canonicalKey: 'SendMail', category: 'progress' },
  X: { canonicalKey: 'CommunityCenterOrWarehouseDone', category: 'progress', negated: true },
  y: { canonicalKey: 'Year', category: 'environment' },
  z: { canonicalKey: 'Season', category: 'environment', negated: true },
}

const LEGACY_NEGATED_NAMES: Record<string, PreconditionDefinition> = {
  notactivedialogueevent: { canonicalKey: 'ActiveDialogueEvent', category: 'environment' },
  notcommunitycenterorwarehousedone: { canonicalKey: 'CommunityCenterOrWarehouseDone', category: 'progress' },
  notdayofweek: { canonicalKey: 'DayOfWeek', category: 'environment' },
  notfestivalday: { canonicalKey: 'FestivalDay', category: 'environment' },
  nothostmail: { canonicalKey: 'HostMail', category: 'progress' },
  nothostorlocalmail: { canonicalKey: 'HostOrLocalMail', category: 'progress' },
  notlocalmail: { canonicalKey: 'LocalMail', category: 'progress' },
  notroommate: { canonicalKey: 'Roommate', category: 'player' },
  notsawevent: { canonicalKey: 'SawEvent', category: 'progress' },
  notseason: { canonicalKey: 'Season', category: 'environment' },
  notspouse: { canonicalKey: 'Spouse', category: 'player' },
  notupcomingfestival: { canonicalKey: 'UpcomingFestival', category: 'environment' },
}

function emptyGroups(): EventPreconditionGroups {
  return { environment: [], player: [], progress: [] }
}

function stripOuterQuotes(value: string) {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1).replace(/\\"/gu, '"')
  }
  return value
}

function tokenizePrecondition(source: string) {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const previous = index > 0 ? source[index - 1] : ''

    if (char === '"' && previous !== '\\') {
      inQuotes = !inQuotes
      current += char
      continue
    }

    if (!inQuotes && /\s/u.test(char)) {
      const trimmed = current.trim()
      if (trimmed) {
        result.push(stripOuterQuotes(trimmed))
      }
      current = ''
      continue
    }

    current += char
  }

  const tail = current.trim()
  if (tail) {
    result.push(stripOuterQuotes(tail))
  }

  return result
}

function resolvePreconditionDefinition(rawKey: string): PreconditionDefinition & { deprecated: boolean; negated: boolean } {
  let key = rawKey
  let negated = false

  if (key.startsWith('!')) {
    key = key.slice(1)
    negated = true
  }

  const alias = LEGACY_ALIASES[key]
  if (alias) {
    return {
      canonicalKey: alias.canonicalKey,
      category: alias.category,
      deprecated: true,
      negated: negated || alias.negated === true,
    }
  }

  const legacyNegated = LEGACY_NEGATED_NAMES[key.toLowerCase()]
  if (legacyNegated) {
    return {
      canonicalKey: legacyNegated.canonicalKey,
      category: legacyNegated.category,
      deprecated: true,
      negated: true,
    }
  }

  const builtIn = BUILT_IN_PRECONDITIONS[key.toLowerCase()]
  if (builtIn) {
    return {
      canonicalKey: builtIn.canonicalKey,
      category: builtIn.category,
      deprecated: false,
      negated,
    }
  }

  return {
    canonicalKey: 'Custom',
    category: 'progress',
    deprecated: false,
    negated,
  }
}

export class EventPreconditionParser {
  parse(rawPreconditions: string[]): EventPreconditionGroups {
    const groups = emptyGroups()

    for (const raw of rawPreconditions) {
      if (!raw.trim()) {
        continue
      }

      const parsed = this.parseOne(raw)
      groups[parsed.category].push(parsed)
    }

    return groups
  }

  parseOne(raw: string): ParsedEventPrecondition {
    const tokens = tokenizePrecondition(raw)
    const key = tokens[0] ?? raw.trim()
    const definition = resolvePreconditionDefinition(key)
    const args = tokens.slice(1)

    return {
      raw,
      key,
      args,
      canonicalKey: definition.canonicalKey,
      category: definition.category,
      negated: definition.negated,
      deprecated: definition.deprecated,
      isKnown: definition.canonicalKey !== 'Custom',
      gameStateQuery: definition.canonicalKey === 'GameStateQuery'
        ? parseGameStateQuery(args.join(' '))
        : undefined,
    }
  }
}

type HubCopy = EditorCopy['studioDesk']['eventPatchHub']

function firstArg(args: string[], fallback = '') {
  return args[0] ?? fallback
}

function secondArg(args: string[], fallback = '') {
  return args[1] ?? fallback
}

function toClock(value: string) {
  const numeric = Number.parseInt(value, 10)
  if (!Number.isFinite(numeric)) {
    return value
  }

  const hours = Math.floor(numeric / 100)
  const minutes = Math.abs(numeric % 100)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function pairArgs(args: string[], formatter: (left: string, right: string) => string) {
  const pairs: string[] = []
  for (let index = 0; index + 1 < args.length; index += 2) {
    pairs.push(formatter(args[index] ?? '', args[index + 1] ?? ''))
  }
  return pairs
}

function tileArgs(args: string[]) {
  return pairArgs(args, (x, y) => `(${x}, ${y})`)
}

function friendshipPairs(args: string[], locale: HubCopy) {
  return pairArgs(args, (name, points) => {
    if (locale.preconditionGroupLabels.environment === '触发环境') {
      return `${name} 友谊至少 ${points}`
    }
    return `${name} friendship at least ${points}`
  })
}

function shippedPairs(args: string[], locale: HubCopy) {
  return pairArgs(args, (item, count) => {
    if (locale.preconditionGroupLabels.environment === '触发环境') {
      return `${item} 出货至少 ${count}`
    }
    return `${item} shipped at least ${count}`
  })
}

export function formatEventPreconditionForHub(precondition: ParsedEventPrecondition, hub: HubCopy) {
  const { args } = precondition
  let label: string

  switch (precondition.canonicalKey) {
    case 'GameStateQuery':
      label = formatGameStateQueryForHub(precondition.gameStateQuery ?? args.join(' '), hub)
      break
    case 'ActiveDialogueEvent':
      label = hub.preconditions.activeDialogueEvent(firstArg(args))
      break
    case 'DayOfMonth':
      label = hub.preconditions.dayOfMonth(args)
      break
    case 'DayOfWeek':
      label = hub.preconditions.dayOfWeek(args.map(hub.preconditionDayName))
      break
    case 'FestivalDay':
      label = hub.preconditions.festivalDay
      break
    case 'GoldenWalnuts':
      label = hub.preconditions.goldenWalnuts(firstArg(args))
      break
    case 'InUpgradedHouse':
      label = hub.preconditions.inUpgradedHouse(firstArg(args, '2'))
      break
    case 'NPCVisible':
      label = hub.preconditions.npcVisible(firstArg(args))
      break
    case 'NpcVisibleHere':
      label = hub.preconditions.npcVisibleHere(firstArg(args))
      break
    case 'Random':
      label = hub.preconditions.random(firstArg(args))
      break
    case 'Season':
      label = hub.preconditions.season(args.map(hub.preconditionSeasonName))
      break
    case 'Time':
      label = hub.preconditions.time(toClock(firstArg(args)), toClock(secondArg(args)))
      break
    case 'UpcomingFestival':
      label = hub.preconditions.upcomingFestival(firstArg(args))
      break
    case 'Weather':
      label = hub.preconditions.weather(hub.preconditionWeatherName(firstArg(args)))
      break
    case 'WorldState':
      label = hub.preconditions.worldState(firstArg(args))
      break
    case 'Year':
      label = hub.preconditions.year(firstArg(args))
      break
    case 'ChoseDialogueAnswers':
      label = hub.preconditions.choseDialogueAnswers(args)
      break
    case 'Dating':
      label = hub.preconditions.dating(firstArg(args))
      break
    case 'EarnedMoney':
      label = hub.preconditions.earnedMoney(firstArg(args))
      break
    case 'FreeInventorySlots':
      label = hub.preconditions.freeInventorySlots(firstArg(args))
      break
    case 'Friendship':
      label = hub.preconditions.friendship(friendshipPairs(args, hub))
      break
    case 'Gender':
      label = hub.preconditions.gender(hub.preconditionGenderName(firstArg(args)))
      break
    case 'HasItem':
      label = hub.preconditions.hasItem(firstArg(args))
      break
    case 'HasMoney':
      label = hub.preconditions.hasMoney(firstArg(args))
      break
    case 'LocalMail':
      label = hub.preconditions.localMail(firstArg(args))
      break
    case 'MissingPet':
      label = hub.preconditions.missingPet(args[0] ?? null)
      break
    case 'ReachedMineBottom':
      label = hub.preconditions.reachedMineBottom(firstArg(args, '1'))
      break
    case 'Roommate':
      label = hub.preconditions.roommate
      break
    case 'SawEvent':
      label = hub.preconditions.sawEvent(args)
      break
    case 'SawSecretNote':
      label = hub.preconditions.sawSecretNote(firstArg(args))
      break
    case 'Shipped':
      label = hub.preconditions.shipped(shippedPairs(args, hub))
      break
    case 'Skill':
      label = hub.preconditions.skill(firstArg(args), secondArg(args))
      break
    case 'Spouse':
      label = hub.preconditions.spouse(firstArg(args))
      break
    case 'SpouseBed':
      label = hub.preconditions.spouseBed
      break
    case 'Tile':
      label = hub.preconditions.tile(tileArgs(args))
      break
    case 'CommunityCenterOrWarehouseDone':
      label = hub.preconditions.communityCenterOrWarehouseDone
      break
    case 'DaysPlayed':
      label = hub.preconditions.daysPlayed(firstArg(args))
      break
    case 'HostMail':
      label = hub.preconditions.hostMail(firstArg(args))
      break
    case 'HostOrLocalMail':
      label = hub.preconditions.hostOrLocalMail(firstArg(args))
      break
    case 'IsHost':
      label = hub.preconditions.isHost
      break
    case 'JojaBundlesDone':
      label = hub.preconditions.jojaBundlesDone
      break
    case 'SendMail':
      label = hub.preconditions.sendMail(firstArg(args))
      break
    case 'Custom':
    default:
      label = hub.preconditionUnknownLabel(precondition.raw)
      break
  }

  return precondition.negated ? hub.preconditionNegatedLabel(label) : label
}
