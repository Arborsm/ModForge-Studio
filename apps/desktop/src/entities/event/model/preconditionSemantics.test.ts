import { describe, expect, test } from 'vitest'
import { localeBundles } from '@locales'
import { EventPreconditionParser, formatEventPreconditionForHub } from '@entities/event'

const builtInSamples = [
  'GameStateQuery "!WEATHER Here Sun"',
  'ActiveDialogueEvent Beach_Greeting',
  'DayOfMonth 12 13',
  'DayOfWeek Mon Friday',
  'FestivalDay',
  'GoldenWalnuts 10',
  'InUpgradedHouse 3',
  'NPCVisible Abigail',
  'NpcVisibleHere Sam',
  'Random 0.2',
  'Season Spring Summer',
  'Time 1400 2300',
  'UpcomingFestival 3',
  'Weather sunny',
  'WorldState IslandOpen',
  'Year 2',
  'ChoseDialogueAnswers summer_intro beach_yes',
  'Dating Abigail',
  'EarnedMoney 5000',
  'FreeInventorySlots 2',
  'Friendship Clint 750 Abigail 1000',
  'Gender male',
  'HasItem (O)388',
  'HasMoney 2500',
  'LocalMail ccVault',
  'MissingPet Cat',
  'ReachedMineBottom 1',
  'Roommate',
  'SawEvent FestivalIntroSeen MarketIntro',
  'SawSecretNote 14',
  'Shipped (O)388 10 (O)390 5',
  'Skill Mining 5',
  'Spouse Leah',
  'SpouseBed',
  'Tile 12 45 13 45',
  'CommunityCenterOrWarehouseDone',
  'DaysPlayed 28',
  'HostMail hostLetter',
  'HostOrLocalMail sharedLetter',
  'IsHost',
  'JojaBundlesDone',
] as const

const gameStateQueryResolverSamples = [
  'ANY "TRUE"',
  'DATE_RANGE Spring 1 1 Winter 28 2',
  'SEASON_DAY Spring 1',
  'DAY_OF_MONTH 1 even',
  'DAY_OF_WEEK Friday',
  'DAYS_PLAYED 28',
  'IS_GREEN_RAIN_DAY',
  'IS_FESTIVAL_DAY Any 0',
  'IS_PASSIVE_FESTIVAL_OPEN DesertFestival',
  'IS_PASSIVE_FESTIVAL_TODAY DesertFestival',
  'SEASON Spring',
  'YEAR 2',
  'TIME 600 1200',
  'IS_EVENT 1001',
  'EVENT_ID 1001',
  'CAN_BUILD_CABIN',
  'CAN_BUILD_FOR_CABINS Shed',
  'BUILDINGS_CONSTRUCTED Farm Shed 1 2 false',
  'FARM_CAVE Bats',
  'FARM_NAME My Farm',
  'FARM_TYPE Standard',
  'FOUND_ALL_LOST_BOOKS',
  'HAS_TARGET_LOCATION',
  'IS_COMMUNITY_CENTER_COMPLETE',
  'IS_CUSTOM_FARM_TYPE',
  'IS_HOST',
  'IS_ISLAND_NORTH_BRIDGE_FIXED',
  'IS_JOJA_MART_COMPLETE',
  'IS_MULTIPLAYER',
  'IS_VISITING_ISLAND Abigail',
  'LOCATION_ACCESSIBLE Farm',
  'LOCATION_CONTEXT Here Default',
  'LOCATION_HAS_CUSTOM_FIELD Here Key Value',
  'LOCATION_IS_INDOORS Here',
  'LOCATION_IS_OUTDOORS Here',
  'LOCATION_IS_MINES Here',
  'LOCATION_IS_SKULL_CAVE Here',
  'LOCATION_NAME Here Farm',
  'LOCATION_UNIQUE_NAME Here Farm',
  'LOCATION_SEASON Here Spring',
  'MUSEUM_DONATIONS 1 5 Minerals',
  'WEATHER Here Sun',
  'WORLD_STATE_FIELD GoldenWalnuts 10',
  'WORLD_STATE_ID IslandOpen',
  'MINE_LOWEST_LEVEL_REACHED 120',
  'PLAYER_BASE_COMBAT_LEVEL Current 1 10',
  'PLAYER_BASE_FARMING_LEVEL Current 1 10',
  'PLAYER_BASE_FISHING_LEVEL Current 1 10',
  'PLAYER_BASE_FORAGING_LEVEL Current 1 10',
  'PLAYER_BASE_LUCK_LEVEL Current 1 10',
  'PLAYER_BASE_MINING_LEVEL Current 1 10',
  'PLAYER_COMBAT_LEVEL Current 1 10',
  'PLAYER_FARMING_LEVEL Current 1 10',
  'PLAYER_FISHING_LEVEL Current 1 10',
  'PLAYER_FORAGING_LEVEL Current 1 10',
  'PLAYER_LUCK_LEVEL Current 1 10',
  'PLAYER_MINING_LEVEL Current 1 10',
  'PLAYER_CURRENT_MONEY Current 500',
  'PLAYER_FARMHOUSE_UPGRADE Current 2',
  'PLAYER_GENDER Current Male',
  'PLAYER_HAS_ACHIEVEMENT Current 1',
  'PLAYER_HAS_ALL_ACHIEVEMENTS Current',
  'PLAYER_HAS_BUFF Current buff',
  'PLAYER_HAS_CAUGHT_FISH Current (O)128',
  'PLAYER_HAS_CONVERSATION_TOPIC Current topic',
  'PLAYER_HAS_CRAFTING_RECIPE Current Chest',
  'PLAYER_HAS_COOKING_RECIPE Current Omelet',
  'PLAYER_HAS_DIALOGUE_ANSWER Current answer',
  'PLAYER_HAS_HEARD_SONG Current spring_day_ambient',
  'PLAYER_HAS_ITEM Current (O)388 1 10',
  'PLAYER_HAS_MAIL Current letter Received',
  'PLAYER_HAS_PROFESSION Current 1',
  'PLAYER_HAS_RUN_TRIGGER_ACTION Current action',
  'PLAYER_HAS_SECRET_NOTE Current 10',
  'PLAYER_HAS_SEEN_EVENT Current 1001',
  'PLAYER_HAS_TOWN_KEY Current',
  'PLAYER_HAS_TRASH_CAN_LEVEL Current 2 4',
  'PLAYER_HAS_TRINKET Current (TR)FrogEgg',
  'PLAYER_LOCATION_CONTEXT Current Default',
  'PLAYER_LOCATION_NAME Current Farm',
  'PLAYER_LOCATION_UNIQUE_NAME Current Farm',
  'PLAYER_MOD_DATA Current key value',
  'PLAYER_MONEY_EARNED Current 1000 9999',
  'PLAYER_SHIPPED_BASIC_ITEM Current 388 1 10',
  'PLAYER_SPECIAL_ORDER_ACTIVE Current order',
  'PLAYER_SPECIAL_ORDER_RULE_ACTIVE Current rule',
  'PLAYER_SPECIAL_ORDER_COMPLETE Current order',
  'PLAYER_KILLED_MONSTERS Current Slime 1 10',
  'PLAYER_STAT Current MonstersKilled 1 10',
  'PLAYER_VISITED_LOCATION Current Farm',
  'PLAYER_FRIENDSHIP_POINTS Current Abigail 750',
  'PLAYER_HAS_CHILDREN Current 1 3',
  'PLAYER_HAS_PET Current',
  'PLAYER_HEARTS Current Abigail 4 10',
  'PLAYER_HAS_MET Current Abigail',
  'PLAYER_NPC_RELATIONSHIP Current Abigail Dating',
  'PLAYER_PLAYER_RELATIONSHIP Current Host Married',
  'PLAYER_PREFERRED_PET Current Cat',
  'RANDOM 0.2',
  'SYNCED_CHOICE day key 1 3 2',
  'SYNCED_RANDOM day key 0.5',
  'SYNCED_SUMMER_RAIN_RANDOM',
  'ITEM_CONTEXT_TAG Target item_fish',
  'ITEM_CATEGORY Target -4',
  'ITEM_HAS_EXPLICIT_OBJECT_CATEGORY Target',
  'ITEM_ID Target (O)388',
  'ITEM_ID_PREFIX Target (O)',
  'ITEM_NUMERIC_ID Target 1 999',
  'ITEM_OBJECT_TYPE Target Basic',
  'ITEM_PRICE Target 10 100',
  'ITEM_QUALITY Target 0 4',
  'ITEM_STACK Target 1 999',
  'ITEM_TYPE Target O',
  'ITEM_EDIBILITY Target -300 100',
  'TRUE',
  'FALSE',
] as const

describe('EventPreconditionSemantics', () => {
  test('recognizes every built-in wiki event precondition', () => {
    const parser = new EventPreconditionParser()

    for (const raw of builtInSamples) {
      expect(parser.parseOne(raw), raw).toMatchObject({
        raw,
        isKnown: true,
      })
    }
  })

  test('groups semantic conditions for the hub expansion panel', () => {
    const parser = new EventPreconditionParser()
    const groups = parser.parse([
      'Season Spring',
      'Time 1400 2300',
      '!Weather rainy',
      'Friendship Clint 750',
      'SawEvent FestivalIntroSeen',
      'DaysPlayed 28',
    ])

    expect(groups.environment.map((item) => item.canonicalKey)).toEqual(['Season', 'Time', 'Weather'])
    expect(groups.environment[2]).toMatchObject({ negated: true })
    expect(groups.player.map((item) => item.canonicalKey)).toEqual(['Friendship'])
    expect(groups.progress.map((item) => item.canonicalKey)).toEqual(['SawEvent', 'DaysPlayed'])
  })

  test('handles deprecated aliases and legacy negative forms', () => {
    const parser = new EventPreconditionParser()

    expect(parser.parseOne('f Abigail 500')).toMatchObject({
      canonicalKey: 'Friendship',
      deprecated: true,
      category: 'player',
    })
    expect(parser.parseOne('z Winter')).toMatchObject({
      canonicalKey: 'Season',
      negated: true,
      deprecated: true,
      category: 'environment',
    })
    expect(parser.parseOne('NotSeason Winter')).toMatchObject({
      canonicalKey: 'Season',
      negated: true,
      deprecated: true,
      category: 'environment',
    })
    expect(parser.parseOne('Hl hostLetter')).toMatchObject({
      canonicalKey: 'HostMail',
      negated: true,
      deprecated: true,
      category: 'progress',
    })
  })

  test('formats conditions with Chinese semantic labels for the hub', () => {
    const parser = new EventPreconditionParser()
    const hub = localeBundles['zh-CN'].editor.studioDesk.eventPatchHub

    expect(formatEventPreconditionForHub(parser.parseOne('Time 1400 2300'), hub)).toBe('14:00 - 23:00')
    expect(formatEventPreconditionForHub(parser.parseOne('Friendship Clint 750'), hub)).toBe('Clint 友谊至少 750')
    expect(formatEventPreconditionForHub(parser.parseOne('!Season Winter'), hub)).toBe('非冬季')
    expect(formatEventPreconditionForHub(parser.parseOne('GameStateQuery "!WEATHER Here Sun"'), hub)).toBe('非当前位置天气为晴天')
    expect(formatEventPreconditionForHub(parser.parseOne('GameStateQuery "SEASON Spring, DAY_OF_WEEK Friday"'), hub)).toBe('春季，且星期为 周五')
    expect(formatEventPreconditionForHub(parser.parseOne('GameStateQuery "ANY \\"SEASON Winter\\" \\"SEASON Spring, DAY_OF_WEEK Friday\\""'), hub)).toBe('任一满足：冬季；春季，且星期为 周五')
  })

  test('recognizes every built-in GameStateQuery resolver from the game source', () => {
    const parser = new EventPreconditionParser()
    const hub = localeBundles['zh-CN'].editor.studioDesk.eventPatchHub

    for (const query of gameStateQueryResolverSamples) {
      const formatted = formatEventPreconditionForHub(parser.parseOne(`GameStateQuery "${query}"`), hub)

      expect(formatted, query).not.toBe(hub.preconditions.gameStateQuery(query))
    }
  })
})
