/**
 * `Data/Characters` field schema.
 *
 * Declares every known CharacterData key as a control, group and validation
 * rule, so the shared `AssetEntryCanvas` renders the whole form and the browser
 * page renders the same declaration read-only. Registering the schema and its
 * enum catalogs is a module side effect, mirroring how workspace plugins
 * register during workbench assembly.
 */

import {
  registerAssetSchema,
  registerEnumCatalog,
  type AssetFieldSchema,
  type AssetIssue,
  type AssetSchema,
  type AssetValidationContext,
} from '@entities/asset-schema'
import {
  AGE_VALUES,
  CALENDAR_VALUES,
  CHARACTER_FIELD_ORDER,
  END_SLIDE_SHOW_VALUES,
  GENDER_VALUES,
  HOME_DIRECTION_VALUES,
  HOME_REGION_SUGGESTIONS,
  LANGUAGE_VALUES,
  MANNER_VALUES,
  OPTIMISM_VALUES,
  SEASON_VALUES,
  SOCIAL_ANXIETY_VALUES,
  SOCIAL_TAB_VALUES,
} from './characterFields'

/** Content Patcher target this schema describes. */
export const CHARACTER_DATA_ASSET_ID = 'Data/Characters'

const ENUM_CATALOGS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['character.gender', GENDER_VALUES],
  ['character.age', AGE_VALUES],
  ['character.season', SEASON_VALUES],
  ['character.manner', MANNER_VALUES],
  ['character.socialAnxiety', SOCIAL_ANXIETY_VALUES],
  ['character.optimism', OPTIMISM_VALUES],
  ['character.language', LANGUAGE_VALUES],
  ['character.calendar', CALENDAR_VALUES],
  ['character.socialTab', SOCIAL_TAB_VALUES],
  ['character.endSlideShow', END_SLIDE_SHOW_VALUES],
  ['character.direction', HOME_DIRECTION_VALUES],
]

for (const [catalogId, values] of ENUM_CATALOGS) {
  registerEnumCatalog(catalogId, values)
}

/** Birthdays outside 1-28 never fire in game; the calendar has 28 days per season. */
function validateBirthDay(value: unknown, context: AssetValidationContext): AssetIssue[] {
  if (typeof value !== 'number' || !Number.isFinite(value) || (value >= 1 && value <= 28)) {
    return []
  }
  return [
    {
      severity: 'error',
      code: 'birthDayRange',
      messageKey: 'character.birthDayRange',
      path: context.path,
      params: { value },
    },
  ]
}

/** A home tile with non-numeric coordinates spawns the NPC at the map origin. */
function validateHomeTile(value: unknown, context: AssetValidationContext): AssetIssue[] {
  if (value === undefined || value === null) {
    return []
  }
  const tile = typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const numeric = (axis: unknown) => typeof axis === 'number' && Number.isFinite(axis)
  if (numeric(tile['X']) && numeric(tile['Y'])) {
    return []
  }
  return [
    {
      severity: 'error',
      code: 'homeTileNotNumeric',
      messageKey: 'character.homeTileNotNumeric',
      path: context.path,
      params: {},
    },
  ]
}

/** Weight is the tie-break draw among equal-precedence matches; zero never wins. */
function validateAppearanceWeight(value: unknown, context: AssetValidationContext): AssetIssue[] {
  if (value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value) && value > 0)) {
    return []
  }
  return [
    {
      severity: 'warning',
      code: 'appearanceWeightNonPositive',
      messageKey: 'character.appearanceWeightNonPositive',
      path: context.path,
      params: { value: typeof value === 'number' ? value : (JSON.stringify(value) ?? 'undefined') },
    },
  ]
}

const HOME_ITEM_SCHEMA: readonly AssetFieldSchema[] = [
  { key: 'Id', group: 'spawn', control: 'text', labelKey: 'character.homeId' },
  { key: 'Condition', group: 'spawn', control: 'gsq', labelKey: 'character.homeCondition' },
  { key: 'Location', group: 'spawn', control: 'location_ref', labelKey: 'character.homeLocation' },
  { key: 'Tile', group: 'spawn', control: 'point', labelKey: 'character.homeTile', validate: validateHomeTile },
  { key: 'Direction', group: 'spawn', control: 'enum', enumCatalog: 'character.direction', labelKey: 'character.homeDirection' },
]

/**
 * One `Appearance` record. Season, condition and the indoor/outdoor flags are
 * the match filter; precedence and weight resolve which match wins; portrait
 * and sprite are the textures the winning record swaps in.
 */
const APPEARANCE_ITEM_SCHEMA: readonly AssetFieldSchema[] = [
  { key: 'Id', group: 'render', control: 'text', labelKey: 'character.appearanceId', required: true },
  { key: 'Condition', group: 'render', control: 'gsq', labelKey: 'character.appearanceCondition', wide: true },
  { key: 'Season', group: 'render', control: 'season', enumCatalog: 'character.season', labelKey: 'character.appearanceSeason' },
  { key: 'Indoors', group: 'render', control: 'tri_bool', labelKey: 'character.appearanceIndoors' },
  { key: 'Outdoors', group: 'render', control: 'tri_bool', labelKey: 'character.appearanceOutdoors' },
  { key: 'Portrait', group: 'render', control: 'texture_ref', labelKey: 'character.appearancePortrait' },
  { key: 'Sprite', group: 'render', control: 'texture_ref', labelKey: 'character.appearanceSprite' },
  { key: 'IsIslandAttire', group: 'render', control: 'tri_bool', labelKey: 'character.appearanceIsIslandAttire' },
  { key: 'Precedence', group: 'render', control: 'number', step: 1, labelKey: 'character.appearancePrecedence' },
  {
    key: 'Weight',
    group: 'render',
    control: 'number',
    step: 1,
    min: 0,
    labelKey: 'character.appearanceWeight',
    validate: validateAppearanceWeight,
  },
]

const WINTER_STAR_GIFT_ITEM_SCHEMA: readonly AssetFieldSchema[] = [
  { key: 'Id', group: 'festival', control: 'text', labelKey: 'character.winterStarGiftId' },
  { key: 'ItemId', group: 'festival', control: 'item_ref', labelKey: 'character.winterStarGiftItemId' },
  { key: 'MinStack', group: 'festival', control: 'number', step: 1, labelKey: 'character.winterStarGiftMinStack' },
  { key: 'MaxStack', group: 'festival', control: 'number', step: 1, labelKey: 'character.winterStarGiftMaxStack' },
]

const SHADOW_ITEM_SCHEMA: readonly AssetFieldSchema[] = [
  { key: 'Visible', group: 'render', control: 'tri_bool', labelKey: 'character.shadowVisible' },
  { key: 'Offset', group: 'render', control: 'point', labelKey: 'character.shadowOffset' },
  { key: 'Scale', group: 'render', control: 'number', step: 0.1, labelKey: 'character.shadowScale' },
]

const FIELDS: readonly AssetFieldSchema[] = [
  // 核心档案
  { key: 'DisplayName', group: 'core', control: 'text', labelKey: 'character.displayName', required: true },
  { key: 'HomeRegion', group: 'core', control: 'text', labelKey: 'character.homeRegion', suggestions: HOME_REGION_SUGGESTIONS },
  { key: 'Gender', group: 'core', control: 'enum', enumCatalog: 'character.gender', labelKey: 'character.gender' },
  { key: 'Age', group: 'core', control: 'enum', enumCatalog: 'character.age', labelKey: 'character.age' },
  { key: 'BirthSeason', group: 'core', control: 'season', enumCatalog: 'character.season', labelKey: 'character.birthSeason' },
  {
    key: 'BirthDay',
    group: 'core',
    control: 'number',
    min: 1,
    max: 28,
    step: 1,
    labelKey: 'character.birthDay',
    validate: validateBirthDay,
  },
  { key: 'CanBeRomanced', group: 'core', control: 'tri_bool', labelKey: 'character.canBeRomanced' },
  { key: 'LoveInterest', group: 'core', control: 'npc_ref', labelKey: 'character.loveInterest' },

  // 性格标签
  { key: 'Manner', group: 'personality', control: 'enum', enumCatalog: 'character.manner', labelKey: 'character.manner' },
  {
    key: 'SocialAnxiety',
    group: 'personality',
    control: 'enum',
    enumCatalog: 'character.socialAnxiety',
    labelKey: 'character.socialAnxiety',
  },
  { key: 'Optimism', group: 'personality', control: 'enum', enumCatalog: 'character.optimism', labelKey: 'character.optimism' },

  // 生成与住所
  { key: 'Home', group: 'spawn', control: 'nested_list', labelKey: 'character.home', wide: true, itemSchema: HOME_ITEM_SCHEMA },
  { key: 'SpawnIfMissing', group: 'spawn', control: 'tri_bool', labelKey: 'character.spawnIfMissing' },
  { key: 'UnlockConditions', group: 'spawn', control: 'gsq', labelKey: 'character.unlockConditions', wide: true },

  // 社交与任务
  { key: 'Calendar', group: 'social', control: 'enum', enumCatalog: 'character.calendar', labelKey: 'character.calendar' },
  { key: 'SocialTab', group: 'social', control: 'enum', enumCatalog: 'character.socialTab', labelKey: 'character.socialTab' },
  { key: 'CanSocialize', group: 'social', control: 'gsq', labelKey: 'character.canSocialize' },
  { key: 'CanReceiveGifts', group: 'social', control: 'tri_bool', labelKey: 'character.canReceiveGifts' },
  { key: 'CanGreetNearbyCharacters', group: 'social', control: 'tri_bool', labelKey: 'character.canGreetNearbyCharacters' },
  { key: 'CanCommentOnPurchasedShopItems', group: 'social', control: 'tri_bool', labelKey: 'character.canCommentOnPurchasedShopItems' },
  { key: 'CanVisitIsland', group: 'social', control: 'gsq', labelKey: 'character.canVisitIsland' },
  { key: 'IntroductionsQuest', group: 'social', control: 'tri_bool', labelKey: 'character.introductionsQuest' },
  { key: 'ItemDeliveryQuests', group: 'social', control: 'gsq', labelKey: 'character.itemDeliveryQuests' },
  { key: 'PerfectionScore', group: 'social', control: 'tri_bool', labelKey: 'character.perfectionScore' },
  { key: 'EndSlideShow', group: 'social', control: 'enum', enumCatalog: 'character.endSlideShow', labelKey: 'character.endSlideShow' },
  { key: 'FriendsAndFamily', group: 'social', control: 'key_value_list', labelKey: 'character.friendsAndFamily', wide: true },

  // 互动、节日与礼物
  {
    key: 'DumpsterDiveFriendshipEffect',
    group: 'festival',
    control: 'number',
    step: 1,
    labelKey: 'character.dumpsterDiveFriendshipEffect',
  },
  { key: 'DumpsterDiveEmote', group: 'festival', control: 'number', step: 1, labelKey: 'character.dumpsterDiveEmote' },
  { key: 'FlowerDanceCanDance', group: 'festival', control: 'tri_bool', labelKey: 'character.flowerDanceCanDance' },
  { key: 'WinterStarParticipant', group: 'festival', control: 'gsq', labelKey: 'character.winterStarParticipant' },
  {
    key: 'WinterStarGifts',
    group: 'festival',
    control: 'nested_list',
    labelKey: 'character.winterStarGifts',
    wide: true,
    itemSchema: WINTER_STAR_GIFT_ITEM_SCHEMA,
  },

  // 绘制、动画与头像
  { key: 'TextureName', group: 'render', control: 'texture_ref', labelKey: 'character.textureName' },
  {
    key: 'Appearance',
    group: 'render',
    control: 'nested_list',
    labelKey: 'character.appearance',
    wide: true,
    itemSchema: APPEARANCE_ITEM_SCHEMA,
  },
  { key: 'Size', group: 'render', control: 'point', labelKey: 'character.size' },
  { key: 'Breather', group: 'render', control: 'tri_bool', labelKey: 'character.breather' },
  { key: 'BreathChestRect', group: 'render', control: 'rect', labelKey: 'character.breathChestRect' },
  { key: 'BreathChestPosition', group: 'render', control: 'point', labelKey: 'character.breathChestPosition' },
  { key: 'Shadow', group: 'render', control: 'nested_object', labelKey: 'character.shadow', wide: true, itemSchema: SHADOW_ITEM_SCHEMA },
  { key: 'EmoteOffset', group: 'render', control: 'point', labelKey: 'character.emoteOffset' },
  { key: 'ShakePortraits', group: 'render', control: 'number_list', labelKey: 'character.shakePortraits' },
  { key: 'KissSpriteIndex', group: 'render', control: 'number', step: 1, labelKey: 'character.kissSpriteIndex' },
  { key: 'KissSpriteFacingRight', group: 'render', control: 'tri_bool', labelKey: 'character.kissSpriteFacingRight' },
  { key: 'MugShotSourceRect', group: 'render', control: 'rect', labelKey: 'character.mugShotSourceRect' },
  { key: 'HiddenProfileEmoteSound', group: 'render', control: 'text', labelKey: 'character.hiddenProfileEmoteSound' },
  { key: 'HiddenProfileEmoteDuration', group: 'render', control: 'number', step: 1, labelKey: 'character.hiddenProfileEmoteDuration' },
  { key: 'HiddenProfileEmoteStartFrame', group: 'render', control: 'number', step: 1, labelKey: 'character.hiddenProfileEmoteStartFrame' },
  { key: 'HiddenProfileEmoteFrameCount', group: 'render', control: 'number', step: 1, labelKey: 'character.hiddenProfileEmoteFrameCount' },
  {
    key: 'HiddenProfileEmoteFrameDuration',
    group: 'render',
    control: 'number',
    step: 0.1,
    labelKey: 'character.hiddenProfileEmoteFrameDuration',
  },

  // 高级与自定义
  { key: 'Language', group: 'advanced', control: 'enum', enumCatalog: 'character.language', labelKey: 'character.language' },
  { key: 'IsDarkSkinned', group: 'advanced', control: 'tri_bool', labelKey: 'character.isDarkSkinned' },
  { key: 'FormerCharacterNames', group: 'advanced', control: 'string_list', labelKey: 'character.formerCharacterNames' },
  { key: 'FestivalVanillaActorIndex', group: 'advanced', control: 'number', step: 1, labelKey: 'character.festivalVanillaActorIndex' },
  { key: 'SpouseAdopts', group: 'advanced', control: 'gsq', labelKey: 'character.spouseAdopts' },
  { key: 'SpouseWantsChildren', group: 'advanced', control: 'gsq', labelKey: 'character.spouseWantsChildren' },
  { key: 'SpouseGiftJealousy', group: 'advanced', control: 'gsq', labelKey: 'character.spouseGiftJealousy' },
  {
    key: 'SpouseGiftJealousyFriendshipChange',
    group: 'advanced',
    control: 'number',
    step: 1,
    labelKey: 'character.spouseGiftJealousyFriendshipChange',
  },
  { key: 'SpouseRoom', group: 'advanced', control: 'raw', rawShape: 'object', labelKey: 'character.spouseRoom' },
  { key: 'SpousePatio', group: 'advanced', control: 'raw', rawShape: 'object', labelKey: 'character.spousePatio' },
  { key: 'SpouseFloors', group: 'advanced', control: 'string_list', labelKey: 'character.spouseFloors' },
  { key: 'SpouseWallpapers', group: 'advanced', control: 'string_list', labelKey: 'character.spouseWallpapers' },
  { key: 'CustomFields', group: 'advanced', control: 'key_value_list', labelKey: 'character.customFields', wide: true },
]

export const CHARACTER_DATA_SCHEMA: AssetSchema = {
  assetId: CHARACTER_DATA_ASSET_ID,
  keyOrder: CHARACTER_FIELD_ORDER,
  groups: [
    { id: 'core', labelKey: 'character.core' },
    { id: 'personality', labelKey: 'character.personality' },
    { id: 'spawn', labelKey: 'character.spawn' },
    { id: 'social', labelKey: 'character.social', collapsedByDefault: true },
    { id: 'festival', labelKey: 'character.festival', collapsedByDefault: true },
    { id: 'render', labelKey: 'character.render', collapsedByDefault: true },
    { id: 'advanced', labelKey: 'character.advanced', collapsedByDefault: true },
  ],
  fields: FIELDS,
}

registerAssetSchema(CHARACTER_DATA_SCHEMA)
