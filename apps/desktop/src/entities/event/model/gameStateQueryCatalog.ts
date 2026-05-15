import {
  GAME_STATE_QUERY_KEYS,
  parseGameStateQuery,
  type GameStateQueryKey,
  type ParsedGameStateQueryClause,
} from './gameStateQuerySemantics'

export {
  GAME_STATE_QUERY_KEYS,
  parseGameStateQuery,
  type GameStateQueryKey,
  type ParsedGameStateQueryClause,
  type ParsedGameStateQuerySet,
} from './gameStateQuerySemantics'

export type GameStateQueryCategory = 'logic' | 'world' | 'location' | 'player' | 'item' | 'system'
export type GameStateQueryFieldKind = 'choice' | 'multi-choice' | 'number' | 'text'
export type GameStateQueryFieldLabel =
  | 'achievement'
  | 'answer'
  | 'buff'
  | 'building'
  | 'cave'
  | 'chance'
  | 'context'
  | 'count'
  | 'day'
  | 'days'
  | 'end'
  | 'event'
  | 'farm'
  | 'field'
  | 'fish'
  | 'gender'
  | 'item'
  | 'level'
  | 'location'
  | 'mail'
  | 'monster'
  | 'money'
  | 'npc'
  | 'pet'
  | 'player'
  | 'profession'
  | 'quality'
  | 'recipe'
  | 'relationship'
  | 'season'
  | 'song'
  | 'specialOrder'
  | 'start'
  | 'stat'
  | 'tag'
  | 'target'
  | 'type'
  | 'value'
  | 'weather'
  | 'year'

export interface GameStateQueryFieldDefinition {
  id: string
  label: GameStateQueryFieldLabel
  kind: GameStateQueryFieldKind
  defaultValue: string
  options?: readonly string[]
}

export interface GameStateQueryDefinition {
  key: GameStateQueryKey
  title: string
  category: GameStateQueryCategory
  fields: GameStateQueryFieldDefinition[]
}

export interface GameStateQueryClauseDraft {
  id: string
  key: GameStateQueryKey
  negated: boolean
  values: Record<string, string>
  branches?: GameStateQueryClauseDraft[]
}

const PLAYER_OPTIONS = ['Current', 'Host', 'Target'] as const
const LOCATION_OPTIONS = ['Here', 'Farm', 'Town', 'Beach', 'Forest', 'Mine', 'Island'] as const
const SEASON_OPTIONS = ['Spring', 'Summer', 'Fall', 'Winter'] as const
const WEATHER_OPTIONS = ['Sun', 'Rain', 'Storm', 'Snow', 'GreenRain'] as const
const WEEKDAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const GENDER_OPTIONS = ['Male', 'Female'] as const
const FARM_TYPE_OPTIONS = ['Standard', 'Riverland', 'Forest', 'HillTop', 'Wilderness', 'FourCorners', 'Beach', 'Meadowlands'] as const
const CAVE_OPTIONS = ['Bats', 'Mushrooms'] as const
const RELATIONSHIP_OPTIONS = ['Dating', 'Engaged', 'Married', 'Divorced', 'Roommate'] as const
const ITEM_TYPE_OPTIONS = ['Object', 'BigCraftable', 'Boots', 'Clothing', 'Hat', 'MeleeWeapon', 'Ring', 'Tool'] as const
const QUALITY_OPTIONS = ['0', '1', '2', '4'] as const

function field(
  id: string,
  label: GameStateQueryFieldLabel,
  kind: GameStateQueryFieldKind,
  defaultValue: string,
  options?: readonly string[],
): GameStateQueryFieldDefinition {
  return { id, label, kind, defaultValue, options }
}

const playerField = () => field('player', 'player', 'choice', 'Current', PLAYER_OPTIONS)
const locationField = () => field('location', 'location', 'choice', 'Here', LOCATION_OPTIONS)
const itemField = () => field('itemId', 'item', 'text', '24')
const targetField = () => field('target', 'target', 'text', 'Abigail')
const valueField = (defaultValue = '1') => field('value', 'value', 'text', defaultValue)
const countField = (defaultValue = '1') => field('count', 'count', 'number', defaultValue)
const levelField = (defaultValue = '1') => field('level', 'level', 'number', defaultValue)
const moneyField = () => field('money', 'money', 'number', '10000')
const chanceField = () => field('chance', 'chance', 'number', '0.2')
const seasonField = () => field('season', 'season', 'multi-choice', 'Spring', SEASON_OPTIONS)
const weatherField = () => field('weather', 'weather', 'choice', 'Sun', WEATHER_OPTIONS)

const KEY_FIELDS: Partial<Record<GameStateQueryKey, GameStateQueryFieldDefinition[]>> = {
  ANY: [],
  DATE_RANGE: [field('start', 'start', 'text', 'spring 1'), field('end', 'end', 'text', 'winter 28')],
  SEASON_DAY: [field('season', 'season', 'choice', 'Spring', SEASON_OPTIONS), field('day', 'day', 'number', '1')],
  DAY_OF_MONTH: [field('day', 'day', 'multi-choice', '1')],
  DAY_OF_WEEK: [field('day', 'day', 'multi-choice', 'Mon', WEEKDAY_OPTIONS)],
  DAYS_PLAYED: [field('days', 'days', 'number', '28')],
  IS_GREEN_RAIN_DAY: [],
  IS_FESTIVAL_DAY: [],
  IS_PASSIVE_FESTIVAL_OPEN: [],
  IS_PASSIVE_FESTIVAL_TODAY: [],
  SEASON: [seasonField()],
  YEAR: [field('year', 'year', 'number', '2')],
  TIME: [field('min', 'start', 'number', '1900'), field('max', 'end', 'number', '2300')],
  IS_EVENT: [field('eventId', 'event', 'text', 'event_square_meeting_1900')],
  CAN_BUILD_CABIN: [],
  CAN_BUILD_FOR_CABINS: [],
  BUILDINGS_CONSTRUCTED: [field('building', 'building', 'text', 'Cabin'), countField()],
  FARM_CAVE: [field('cave', 'cave', 'choice', 'Bats', CAVE_OPTIONS)],
  FARM_NAME: [field('farmName', 'farm', 'text', 'Stardew Farm')],
  FARM_TYPE: [field('farmType', 'farm', 'choice', 'Standard', FARM_TYPE_OPTIONS)],
  FOUND_ALL_LOST_BOOKS: [],
  HAS_TARGET_LOCATION: [locationField()],
  IS_COMMUNITY_CENTER_COMPLETE: [],
  IS_CUSTOM_FARM_TYPE: [field('farmType', 'farm', 'text', 'CustomFarm')],
  IS_HOST: [],
  IS_ISLAND_NORTH_BRIDGE_FIXED: [],
  IS_JOJA_MART_COMPLETE: [],
  IS_MULTIPLAYER: [],
  IS_VISITING_ISLAND: [],
  LOCATION_ACCESSIBLE: [locationField()],
  LOCATION_CONTEXT: [locationField(), field('context', 'context', 'text', 'Default')],
  LOCATION_HAS_CUSTOM_FIELD: [locationField(), field('fieldId', 'field', 'text', 'fieldId'), valueField('true')],
  LOCATION_IS_INDOORS: [locationField()],
  LOCATION_IS_OUTDOORS: [locationField()],
  LOCATION_IS_MINES: [locationField()],
  LOCATION_IS_SKULL_CAVE: [locationField()],
  LOCATION_NAME: [locationField()],
  LOCATION_UNIQUE_NAME: [locationField()],
  LOCATION_SEASON: [locationField(), seasonField()],
  MUSEUM_DONATIONS: [countField('60')],
  WEATHER: [locationField(), weatherField()],
  WORLD_STATE_FIELD: [field('stateId', 'field', 'text', 'world_state'), valueField('true')],
  WORLD_STATE_ID: [field('stateId', 'field', 'text', 'ccPantry')],
  MINE_LOWEST_LEVEL_REACHED: [levelField('120')],
  PLAYER_BASE_COMBAT_LEVEL: [playerField(), levelField('5')],
  PLAYER_BASE_FARMING_LEVEL: [playerField(), levelField('5')],
  PLAYER_BASE_FISHING_LEVEL: [playerField(), levelField('5')],
  PLAYER_BASE_FORAGING_LEVEL: [playerField(), levelField('5')],
  PLAYER_BASE_LUCK_LEVEL: [playerField(), levelField('5')],
  PLAYER_BASE_MINING_LEVEL: [playerField(), levelField('5')],
  PLAYER_COMBAT_LEVEL: [playerField(), levelField('5')],
  PLAYER_FARMING_LEVEL: [playerField(), levelField('5')],
  PLAYER_FISHING_LEVEL: [playerField(), levelField('5')],
  PLAYER_FORAGING_LEVEL: [playerField(), levelField('5')],
  PLAYER_LUCK_LEVEL: [playerField(), levelField('5')],
  PLAYER_MINING_LEVEL: [playerField(), levelField('5')],
  PLAYER_CURRENT_MONEY: [playerField(), moneyField()],
  PLAYER_FARMHOUSE_UPGRADE: [playerField(), levelField('2')],
  PLAYER_GENDER: [playerField(), field('gender', 'gender', 'choice', 'Female', GENDER_OPTIONS)],
  PLAYER_HAS_ACHIEVEMENT: [playerField(), field('achievementId', 'achievement', 'text', '0')],
  PLAYER_HAS_ALL_ACHIEVEMENTS: [playerField()],
  PLAYER_HAS_BUFF: [playerField(), field('buffId', 'buff', 'text', 'food')],
  PLAYER_HAS_CAUGHT_FISH: [playerField(), field('fishId', 'fish', 'text', '128')],
  PLAYER_HAS_CONVERSATION_TOPIC: [playerField(), field('topicId', 'tag', 'text', 'ccDoorUnlock')],
  PLAYER_HAS_CRAFTING_RECIPE: [playerField(), field('recipeId', 'recipe', 'text', 'Chest')],
  PLAYER_HAS_COOKING_RECIPE: [playerField(), field('recipeId', 'recipe', 'text', 'Fried Egg')],
  PLAYER_HAS_DIALOGUE_ANSWER: [playerField(), field('answerId', 'answer', 'text', 'intro_yes')],
  PLAYER_HAS_HEARD_SONG: [playerField(), field('songId', 'song', 'text', 'spring_day_ambient')],
  PLAYER_HAS_ITEM: [playerField(), itemField()],
  PLAYER_HAS_MAIL: [playerField(), field('mailId', 'mail', 'text', 'ccDoorUnlock')],
  PLAYER_HAS_PROFESSION: [playerField(), field('professionId', 'profession', 'text', '0')],
  PLAYER_HAS_RUN_TRIGGER_ACTION: [playerField(), field('actionId', 'tag', 'text', 'action_id')],
  PLAYER_HAS_SECRET_NOTE: [playerField(), field('noteId', 'tag', 'number', '10')],
  PLAYER_HAS_SEEN_EVENT: [playerField(), field('eventId', 'event', 'text', 'event_square_meeting_1900')],
  PLAYER_HAS_TOWN_KEY: [playerField()],
  PLAYER_HAS_TRASH_CAN_LEVEL: [playerField(), levelField('4')],
  PLAYER_HAS_TRINKET: [playerField(), field('trinketId', 'item', 'text', 'TrinketId')],
  PLAYER_LOCATION_CONTEXT: [playerField(), field('context', 'context', 'text', 'Default')],
  PLAYER_LOCATION_NAME: [playerField(), locationField()],
  PLAYER_LOCATION_UNIQUE_NAME: [playerField(), locationField()],
  PLAYER_MOD_DATA: [playerField(), field('fieldId', 'field', 'text', 'mod/id'), valueField('true')],
  PLAYER_MONEY_EARNED: [playerField(), moneyField()],
  PLAYER_SHIPPED_BASIC_ITEM: [playerField(), itemField(), countField()],
  PLAYER_SPECIAL_ORDER_ACTIVE: [playerField(), field('orderId', 'specialOrder', 'text', 'OrderId')],
  PLAYER_SPECIAL_ORDER_RULE_ACTIVE: [
    playerField(),
    field('orderId', 'specialOrder', 'text', 'OrderId'),
    field('ruleId', 'field', 'text', 'Rule'),
  ],
  PLAYER_SPECIAL_ORDER_COMPLETE: [playerField(), field('orderId', 'specialOrder', 'text', 'OrderId')],
  PLAYER_KILLED_MONSTERS: [playerField(), field('monsterId', 'monster', 'text', 'Green Slime'), countField('10')],
  PLAYER_STAT: [playerField(), field('statId', 'stat', 'text', 'StepsTaken'), valueField('1000')],
  PLAYER_VISITED_LOCATION: [playerField(), locationField()],
  PLAYER_FRIENDSHIP_POINTS: [playerField(), field('npc', 'npc', 'text', 'Abigail'), field('points', 'value', 'number', '1000')],
  PLAYER_HAS_CHILDREN: [playerField(), countField('1')],
  PLAYER_HAS_PET: [playerField(), field('pet', 'pet', 'text', 'Cat')],
  PLAYER_HEARTS: [playerField(), field('npc', 'npc', 'text', 'Abigail'), levelField('4')],
  PLAYER_HAS_MET: [playerField(), field('npc', 'npc', 'text', 'Abigail')],
  PLAYER_NPC_RELATIONSHIP: [
    playerField(),
    field('npc', 'npc', 'text', 'Abigail'),
    field('relationship', 'relationship', 'choice', 'Dating', RELATIONSHIP_OPTIONS),
  ],
  PLAYER_PLAYER_RELATIONSHIP: [
    playerField(),
    targetField(),
    field('relationship', 'relationship', 'choice', 'Friend', RELATIONSHIP_OPTIONS),
  ],
  PLAYER_PREFERRED_PET: [playerField(), field('pet', 'pet', 'text', 'Cat')],
  RANDOM: [chanceField()],
  SYNCED_CHOICE: [field('choiceId', 'field', 'text', 'choice_id'), valueField('A')],
  SYNCED_RANDOM: [field('randomId', 'field', 'text', 'random_id'), chanceField()],
  SYNCED_SUMMER_RAIN_RANDOM: [field('randomId', 'field', 'text', 'summer_rain'), chanceField()],
  ITEM_CONTEXT_TAG: [itemField(), field('tag', 'tag', 'text', 'category_fruit')],
  ITEM_CATEGORY: [itemField(), field('category', 'type', 'text', '-75')],
  ITEM_HAS_EXPLICIT_OBJECT_CATEGORY: [itemField(), field('category', 'type', 'text', '-75')],
  ITEM_ID: [itemField(), field('targetId', 'target', 'text', '24')],
  ITEM_ID_PREFIX: [itemField(), field('prefix', 'target', 'text', '(O)')],
  ITEM_NUMERIC_ID: [itemField(), field('targetId', 'target', 'number', '24')],
  ITEM_OBJECT_TYPE: [itemField(), field('type', 'type', 'choice', 'Object', ITEM_TYPE_OPTIONS)],
  ITEM_PRICE: [itemField(), moneyField()],
  ITEM_QUALITY: [itemField(), field('quality', 'quality', 'choice', '0', QUALITY_OPTIONS)],
  ITEM_STACK: [itemField(), countField()],
  ITEM_TYPE: [itemField(), field('type', 'type', 'choice', 'Object', ITEM_TYPE_OPTIONS)],
  ITEM_EDIBILITY: [itemField(), valueField('10')],
  TRUE: [],
  FALSE: [],
}

function categoryForKey(key: GameStateQueryKey): GameStateQueryCategory {
  if (key === 'ANY') {
    return 'logic'
  }
  if (key === 'TRUE' || key === 'FALSE' || key.startsWith('SYNCED_') || key === 'RANDOM') {
    return 'system'
  }
  if (key.startsWith('PLAYER_') || key === 'IS_HOST') {
    return 'player'
  }
  if (key.startsWith('ITEM_')) {
    return 'item'
  }
  if (key.startsWith('LOCATION_') || key === 'HAS_TARGET_LOCATION' || key === 'WEATHER') {
    return 'location'
  }
  return 'world'
}

function titleForKey(key: GameStateQueryKey) {
  return key
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function inferFieldsForKey(key: GameStateQueryKey): GameStateQueryFieldDefinition[] {
  if (key.startsWith('PLAYER_')) {
    return [playerField(), valueField()]
  }
  if (key.startsWith('ITEM_')) {
    return [itemField(), valueField()]
  }
  if (key.startsWith('LOCATION_')) {
    return [locationField(), valueField()]
  }
  if (key.startsWith('IS_') || key.startsWith('CAN_') || key.startsWith('FOUND_')) {
    return []
  }
  return [valueField()]
}

export const GAME_STATE_QUERY_DEFINITIONS: GameStateQueryDefinition[] = GAME_STATE_QUERY_KEYS.map((key) => ({
  key,
  title: titleForKey(key),
  category: categoryForKey(key),
  fields: KEY_FIELDS[key] ?? inferFieldsForKey(key),
}))

const GAME_STATE_QUERY_DEFINITION_BY_KEY = new Map(GAME_STATE_QUERY_DEFINITIONS.map((definition) => [definition.key, definition]))

function quoteGameStateQueryToken(value: string) {
  return /[\s,"]/u.test(value) ? `"${value.replace(/(["\\])/gu, '\\$1')}"` : value
}

export function createDefaultGameStateQueryClause(
  key: GameStateQueryKey,
  id = `${key.toLowerCase()}-${Date.now()}`,
): GameStateQueryClauseDraft {
  const definition = GAME_STATE_QUERY_DEFINITION_BY_KEY.get(key)
  const values = Object.fromEntries(definition?.fields.map((item) => [item.id, item.defaultValue]) ?? [])
  return {
    id,
    key,
    negated: false,
    values,
  }
}

function serializeFieldValues(definition: GameStateQueryDefinition | undefined, values: Record<string, string>) {
  return (definition?.fields ?? [])
    .flatMap((fieldDefinition) => {
      const rawValue = values[fieldDefinition.id]?.trim() ?? ''
      if (!rawValue) {
        return []
      }
      if (fieldDefinition.kind === 'multi-choice') {
        return rawValue.split(/\s+/u).filter(Boolean)
      }
      return [rawValue]
    })
    .map(quoteGameStateQueryToken)
}

export function serializeGameStateQueryClause(clause: GameStateQueryClauseDraft): string {
  const prefix = clause.negated ? '!' : ''
  if (clause.key === 'ANY') {
    const branches = (clause.branches ?? []).map(serializeGameStateQueryClause).filter(Boolean).map(quoteGameStateQueryToken)
    return `${prefix}ANY${branches.length > 0 ? ` ${branches.join(' ')}` : ''}`
  }

  const definition = GAME_STATE_QUERY_DEFINITION_BY_KEY.get(clause.key)
  const args = serializeFieldValues(definition, clause.values)
  return `${prefix}${clause.key}${args.length > 0 ? ` ${args.join(' ')}` : ''}`
}

export function serializeGameStateQueryClauses(clauses: GameStateQueryClauseDraft[]): string {
  return clauses.map(serializeGameStateQueryClause).filter(Boolean).join(', ')
}

function hydrateClauseFromParsed(clause: ParsedGameStateQueryClause, id: string): GameStateQueryClauseDraft {
  const key = GAME_STATE_QUERY_DEFINITION_BY_KEY.has(clause.canonicalKey as GameStateQueryKey)
    ? (clause.canonicalKey as GameStateQueryKey)
    : 'TRUE'
  const draft = createDefaultGameStateQueryClause(key, id)
  draft.negated = clause.negated

  if (key === 'ANY') {
    draft.branches =
      clause.alternatives?.flatMap((query, index) => {
        const branch = query.clauses[0]
        return branch ? [hydrateClauseFromParsed(branch, `${id}-branch-${index}`)] : []
      }) ?? []
    return draft
  }

  const definition = GAME_STATE_QUERY_DEFINITION_BY_KEY.get(key)
  let argIndex = 0
  for (const fieldDefinition of definition?.fields ?? []) {
    if (fieldDefinition.kind === 'multi-choice') {
      draft.values[fieldDefinition.id] = clause.args.slice(argIndex).join(' ') || fieldDefinition.defaultValue
      break
    }
    draft.values[fieldDefinition.id] = clause.args[argIndex] ?? fieldDefinition.defaultValue
    argIndex += 1
  }

  return draft
}

export function parseGameStateQueryClauses(source: string): GameStateQueryClauseDraft[] {
  const trimmed = source.trim()
  if (!trimmed) {
    return []
  }

  return parseGameStateQuery(trimmed).clauses.map((clause, index) => hydrateClauseFromParsed(clause, `initial-${index}`))
}
