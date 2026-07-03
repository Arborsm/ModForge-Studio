import type { EditorCopy } from '@locales'

type HubCopy = EditorCopy['studioDesk']['eventPatchHub']

export const GAME_STATE_QUERY_KEYS = [
  'ANY',
  'DATE_RANGE',
  'SEASON_DAY',
  'DAY_OF_MONTH',
  'DAY_OF_WEEK',
  'DAYS_PLAYED',
  'IS_GREEN_RAIN_DAY',
  'IS_FESTIVAL_DAY',
  'IS_PASSIVE_FESTIVAL_OPEN',
  'IS_PASSIVE_FESTIVAL_TODAY',
  'SEASON',
  'YEAR',
  'TIME',
  'IS_EVENT',
  'CAN_BUILD_CABIN',
  'CAN_BUILD_FOR_CABINS',
  'BUILDINGS_CONSTRUCTED',
  'FARM_CAVE',
  'FARM_NAME',
  'FARM_TYPE',
  'FOUND_ALL_LOST_BOOKS',
  'HAS_TARGET_LOCATION',
  'IS_COMMUNITY_CENTER_COMPLETE',
  'IS_CUSTOM_FARM_TYPE',
  'IS_HOST',
  'IS_ISLAND_NORTH_BRIDGE_FIXED',
  'IS_JOJA_MART_COMPLETE',
  'IS_MULTIPLAYER',
  'IS_VISITING_ISLAND',
  'LOCATION_ACCESSIBLE',
  'LOCATION_CONTEXT',
  'LOCATION_HAS_CUSTOM_FIELD',
  'LOCATION_IS_INDOORS',
  'LOCATION_IS_OUTDOORS',
  'LOCATION_IS_MINES',
  'LOCATION_IS_SKULL_CAVE',
  'LOCATION_NAME',
  'LOCATION_UNIQUE_NAME',
  'LOCATION_SEASON',
  'MUSEUM_DONATIONS',
  'WEATHER',
  'WORLD_STATE_FIELD',
  'WORLD_STATE_ID',
  'MINE_LOWEST_LEVEL_REACHED',
  'PLAYER_BASE_COMBAT_LEVEL',
  'PLAYER_BASE_FARMING_LEVEL',
  'PLAYER_BASE_FISHING_LEVEL',
  'PLAYER_BASE_FORAGING_LEVEL',
  'PLAYER_BASE_LUCK_LEVEL',
  'PLAYER_BASE_MINING_LEVEL',
  'PLAYER_COMBAT_LEVEL',
  'PLAYER_FARMING_LEVEL',
  'PLAYER_FISHING_LEVEL',
  'PLAYER_FORAGING_LEVEL',
  'PLAYER_LUCK_LEVEL',
  'PLAYER_MINING_LEVEL',
  'PLAYER_CURRENT_MONEY',
  'PLAYER_FARMHOUSE_UPGRADE',
  'PLAYER_GENDER',
  'PLAYER_HAS_ACHIEVEMENT',
  'PLAYER_HAS_ALL_ACHIEVEMENTS',
  'PLAYER_HAS_BUFF',
  'PLAYER_HAS_CAUGHT_FISH',
  'PLAYER_HAS_CONVERSATION_TOPIC',
  'PLAYER_HAS_CRAFTING_RECIPE',
  'PLAYER_HAS_COOKING_RECIPE',
  'PLAYER_HAS_DIALOGUE_ANSWER',
  'PLAYER_HAS_HEARD_SONG',
  'PLAYER_HAS_ITEM',
  'PLAYER_HAS_MAIL',
  'PLAYER_HAS_PROFESSION',
  'PLAYER_HAS_RUN_TRIGGER_ACTION',
  'PLAYER_HAS_SECRET_NOTE',
  'PLAYER_HAS_SEEN_EVENT',
  'PLAYER_HAS_TOWN_KEY',
  'PLAYER_HAS_TRASH_CAN_LEVEL',
  'PLAYER_HAS_TRINKET',
  'PLAYER_LOCATION_CONTEXT',
  'PLAYER_LOCATION_NAME',
  'PLAYER_LOCATION_UNIQUE_NAME',
  'PLAYER_MOD_DATA',
  'PLAYER_MONEY_EARNED',
  'PLAYER_SHIPPED_BASIC_ITEM',
  'PLAYER_SPECIAL_ORDER_ACTIVE',
  'PLAYER_SPECIAL_ORDER_RULE_ACTIVE',
  'PLAYER_SPECIAL_ORDER_COMPLETE',
  'PLAYER_KILLED_MONSTERS',
  'PLAYER_STAT',
  'PLAYER_VISITED_LOCATION',
  'PLAYER_FRIENDSHIP_POINTS',
  'PLAYER_HAS_CHILDREN',
  'PLAYER_HAS_PET',
  'PLAYER_HEARTS',
  'PLAYER_HAS_MET',
  'PLAYER_NPC_RELATIONSHIP',
  'PLAYER_PLAYER_RELATIONSHIP',
  'PLAYER_PREFERRED_PET',
  'RANDOM',
  'SYNCED_CHOICE',
  'SYNCED_RANDOM',
  'SYNCED_SUMMER_RAIN_RANDOM',
  'ITEM_CONTEXT_TAG',
  'ITEM_CATEGORY',
  'ITEM_HAS_EXPLICIT_OBJECT_CATEGORY',
  'ITEM_ID',
  'ITEM_ID_PREFIX',
  'ITEM_NUMERIC_ID',
  'ITEM_OBJECT_TYPE',
  'ITEM_PRICE',
  'ITEM_QUALITY',
  'ITEM_STACK',
  'ITEM_TYPE',
  'ITEM_EDIBILITY',
  'TRUE',
  'FALSE',
] as const

export type GameStateQueryKey = (typeof GAME_STATE_QUERY_KEYS)[number]
type CustomGameStateQueryKey = string & {}

export interface ParsedGameStateQuerySet {
  raw: string
  clauses: ParsedGameStateQueryClause[]
}

export interface ParsedGameStateQueryClause {
  raw: string
  key: string
  canonicalKey: GameStateQueryKey | CustomGameStateQueryKey
  args: string[]
  negated: boolean
  isKnown: boolean
  alternatives?: ParsedGameStateQuerySet[]
}

const GAME_STATE_QUERY_KEY_SET = new Set<string>(GAME_STATE_QUERY_KEYS)

const GAME_STATE_QUERY_ALIASES: Record<string, GameStateQueryKey> = {
  event_id: 'IS_EVENT',
}

function stripOuterQuotes(value: string) {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1).replace(/\\(["\\])/gu, '$1')
  }
  return value
}

function splitQuoteAware(source: string, delimiter: ',' | 'space') {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? ''
    const previous = index > 0 ? source[index - 1] : ''

    if (char === '"' && previous !== '\\') {
      inQuotes = !inQuotes
      current += char
      continue
    }

    const isDelimiter = delimiter === ',' ? char === ',' : /\s/u.test(char)
    if (!inQuotes && isDelimiter) {
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

function resolveGameStateQueryKey(rawKey: string) {
  const normalized = rawKey.trim().toUpperCase()
  const alias = GAME_STATE_QUERY_ALIASES[normalized.toLowerCase()]
  if (alias) {
    return alias
  }
  return GAME_STATE_QUERY_KEY_SET.has(normalized) ? normalized : null
}

function parseGameStateQueryClause(raw: string): ParsedGameStateQueryClause {
  const tokens = splitQuoteAware(raw, 'space')
  let key = tokens[0] ?? ''
  let negated = false

  if (key.startsWith('!')) {
    key = key.slice(1)
    negated = true
  }

  const canonicalKey = resolveGameStateQueryKey(key)
  const args = tokens.slice(1)
  const clause: ParsedGameStateQueryClause = {
    raw,
    key,
    canonicalKey: canonicalKey ?? key,
    args,
    negated,
    isKnown: canonicalKey != null,
  }

  if (canonicalKey === 'ANY') {
    clause.alternatives = args.map(parseGameStateQuery)
  }

  return clause
}

export function parseGameStateQuery(source: string): ParsedGameStateQuerySet {
  return {
    raw: source,
    clauses: splitQuoteAware(source, ',').map(parseGameStateQueryClause),
  }
}

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

function formatKnownGameStateQueryClause(clause: ParsedGameStateQueryClause, hub: HubCopy): string {
  const { args } = clause
  const semantics = hub.gameStateQuerySemantics

  switch (clause.canonicalKey) {
    case 'ANY': {
      const alternatives: string[] = clause.alternatives?.map((item) => formatGameStateQuerySetForHub(item, hub)) ?? []
      return alternatives.length > 0 ? semantics.any(alternatives) : semantics.generic(semantics.label('ANY'), args)
    }
    case 'DAY_OF_MONTH':
      return hub.preconditions.dayOfMonth(args)
    case 'DAY_OF_WEEK':
      return hub.preconditions.dayOfWeek(args.map(hub.preconditionDayName))
    case 'DAYS_PLAYED':
      return hub.preconditions.daysPlayed(firstArg(args))
    case 'SEASON':
      return hub.preconditions.season(args.map(hub.preconditionSeasonName))
    case 'YEAR':
      return hub.preconditions.year(firstArg(args))
    case 'TIME':
      return hub.preconditions.time(toClock(firstArg(args)), toClock(secondArg(args)))
    case 'IS_EVENT':
      return semantics.generic(semantics.label('IS_EVENT'), args)
    case 'IS_HOST':
      return hub.preconditions.isHost
    case 'LOCATION_SEASON':
      return semantics.locationSeason(semantics.location(firstArg(args)), args.slice(1).map(hub.preconditionSeasonName))
    case 'WEATHER':
      return semantics.weather(semantics.location(firstArg(args)), args.slice(1).map(hub.preconditionWeatherName))
    case 'WORLD_STATE_ID':
      return hub.preconditions.worldState(firstArg(args))
    case 'MINE_LOWEST_LEVEL_REACHED':
      return hub.preconditions.reachedMineBottom(firstArg(args))
    case 'PLAYER_CURRENT_MONEY':
      return hub.preconditions.hasMoney(secondArg(args))
    case 'PLAYER_GENDER':
      return hub.preconditions.gender(hub.preconditionGenderName(secondArg(args)))
    case 'PLAYER_HAS_ITEM':
      return hub.preconditions.hasItem(secondArg(args))
    case 'PLAYER_HAS_MAIL':
      return hub.preconditions.localMail(secondArg(args))
    case 'PLAYER_HAS_SECRET_NOTE':
      return hub.preconditions.sawSecretNote(secondArg(args))
    case 'PLAYER_HAS_SEEN_EVENT':
      return hub.preconditions.sawEvent(args.slice(1))
    case 'PLAYER_FRIENDSHIP_POINTS':
      return semantics.generic(semantics.label('PLAYER_FRIENDSHIP_POINTS'), args.slice(1))
    case 'RANDOM':
      return hub.preconditions.random(firstArg(args))
    case 'TRUE':
      return semantics.trueLabel
    case 'FALSE':
      return semantics.falseLabel
    default:
      return semantics.generic(semantics.label(clause.canonicalKey), args)
  }
}

function formatGameStateQueryClauseForHub(clause: ParsedGameStateQueryClause, hub: HubCopy): string {
  const label: string = clause.isKnown ? formatKnownGameStateQueryClause(clause, hub) : hub.preconditions.gameStateQuery(clause.raw)

  return clause.negated ? hub.preconditionNegatedLabel(label) : label
}

function formatGameStateQuerySetForHub(query: ParsedGameStateQuerySet, hub: HubCopy): string {
  if (query.clauses.length === 0) {
    return hub.preconditions.gameStateQuery(query.raw)
  }

  return hub.gameStateQuerySemantics.all(query.clauses.map((clause) => formatGameStateQueryClauseForHub(clause, hub)))
}

export function formatGameStateQueryForHub(query: ParsedGameStateQuerySet | string, hub: HubCopy): string {
  return formatGameStateQuerySetForHub(typeof query === 'string' ? parseGameStateQuery(query) : query, hub)
}
