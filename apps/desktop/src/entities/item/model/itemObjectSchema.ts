/**
 * `Data/Objects` field schema.
 *
 * Declares every `ObjectData` key as a control, group and validation rule, so
 * the shared `AssetEntryCanvas` renders the whole form and the validation rail
 * reports the same findings the item pages show. Registering the schema is a
 * module side effect, mirroring the character and building schemas.
 *
 * Nested structures follow what the game data actually contains: `Buffs` and
 * their `CustomAttributes` are declared field by field because food is the main
 * reason to author an object at all, while the two quantity-modifier lists
 * inside a geode drop stay `raw` — they are the generic item-spawn modifier
 * shape shared with shops and machines, not object data.
 */

import {
  isPlainObject,
  registerAssetSchema,
  type AssetFieldSchema,
  type AssetIssue,
  type AssetSchema,
  type AssetValidationContext,
} from '@entities/asset-schema'
import {
  OBJECT_BUFF_ID_SUGGESTIONS,
  OBJECT_DATA_ASSET_ID,
  OBJECT_FIELD_ORDER,
  OBJECT_INEDIBLE,
  OBJECT_TYPE_SUGGESTIONS,
  OBJECT_VANILLA_CATEGORIES,
} from './itemObjectFields'

/** Renders a rejected value for an issue parameter without throwing on cycles. */
function describeValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return Array.isArray(value) ? 'array' : typeof value
}

/** An object priced below zero is sold for nothing and cannot be bought back. */
function validatePrice(value: unknown, context: AssetValidationContext): AssetIssue[] {
  if (typeof value !== 'number' || value >= 0) {
    return []
  }
  return [{ severity: 'warning', code: 'objectPriceNegative', messageKey: 'object.priceNegative', path: context.path, params: { value } }]
}

/**
 * `Category` drives shop tabs, gift tastes and machine rules. Custom numbers do
 * work — the game simply has no special case for them — so an unfamiliar value
 * is reported as information rather than as a mistake.
 */
function validateCategory(value: unknown, context: AssetValidationContext): AssetIssue[] {
  if (typeof value !== 'number' || OBJECT_VANILLA_CATEGORIES.includes(value)) {
    return []
  }
  return [{ severity: 'info', code: 'objectCategoryUnusual', messageKey: 'object.categoryUnusual', path: context.path, params: { value } }]
}

/**
 * `Edibility` is a stamina delta, except for the `-300` sentinel that marks the
 * object inedible. Anything below the sentinel is neither, so the game treats
 * the object as inedible while the author expects a penalty.
 */
function validateEdibility(value: unknown, context: AssetValidationContext): AssetIssue[] {
  if (value === undefined || value === null || (typeof value === 'number' && value >= OBJECT_INEDIBLE)) {
    return []
  }
  return [
    {
      severity: 'warning',
      code: 'objectEdibilityBelowSentinel',
      messageKey: 'object.edibilityBelowSentinel',
      path: context.path,
      params: { value: describeValue(value), sentinel: OBJECT_INEDIBLE },
    },
  ]
}

/** A negative or fractional sprite index points outside the sheet, so the item draws blank. */
function validateSpriteIndex(value: unknown, context: AssetValidationContext): AssetIssue[] {
  if (value === undefined || value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0)) {
    return []
  }
  return [
    {
      severity: 'error',
      code: 'objectSpriteIndexInvalid',
      messageKey: 'object.spriteIndexInvalid',
      path: context.path,
      params: { value: describeValue(value) },
    },
  ]
}

/**
 * Buffs are keyed by `Id` within one object, and they only ever fire when the
 * player can actually consume it — so both the duplicate ids the game silently
 * drops and the buff list an inedible object can never apply are reported here,
 * where the whole list and its `Edibility` sibling are visible.
 */
function validateBuffs(value: unknown, context: AssetValidationContext): AssetIssue[] {
  if (!Array.isArray(value) || value.length === 0) {
    return []
  }

  const issues: AssetIssue[] = []
  const seen = new Map<string, number>()

  value.forEach((raw, index) => {
    const row = isPlainObject(raw) ? raw : {}
    const id = typeof row['Id'] === 'string' ? row['Id'].trim() : ''
    if (id === '') {
      return
    }
    const lower = id.toLowerCase()
    const previous = seen.get(lower)
    if (previous === undefined) {
      seen.set(lower, index)
    } else {
      issues.push({
        severity: 'error',
        code: 'objectBuffIdDuplicate',
        messageKey: 'object.buffIdDuplicate',
        path: [...context.path, index, 'Id'],
        params: { id, index: previous + 1 },
      })
    }
  })

  const edibility = context.siblings['Edibility']
  if (typeof edibility !== 'number' || edibility <= OBJECT_INEDIBLE) {
    issues.push({
      severity: 'warning',
      code: 'objectBuffsWithoutEdibility',
      messageKey: 'object.buffsWithoutEdibility',
      path: context.path,
      params: { count: value.length },
    })
  }

  return issues
}

/** Geode drops are keyed by `Id` too; a repeated id makes the later row unreachable. */
function validateGeodeDrops(value: unknown, context: AssetValidationContext): AssetIssue[] {
  if (!Array.isArray(value)) {
    return []
  }

  const issues: AssetIssue[] = []
  const seen = new Map<string, number>()

  value.forEach((raw, index) => {
    const row = isPlainObject(raw) ? raw : {}
    const id = typeof row['Id'] === 'string' ? row['Id'].trim() : ''
    if (id === '') {
      return
    }
    const lower = id.toLowerCase()
    const previous = seen.get(lower)
    if (previous === undefined) {
      seen.set(lower, index)
    } else {
      issues.push({
        severity: 'error',
        code: 'objectGeodeDropIdDuplicate',
        messageKey: 'object.geodeDropIdDuplicate',
        path: [...context.path, index, 'Id'],
        params: { id, index: previous + 1 },
      })
    }
  })

  return issues
}

/** `MaxStack` below `MinStack` gives the drop an empty range, so nothing is granted. */
function validateGeodeMaxStack(value: unknown, context: AssetValidationContext): AssetIssue[] {
  const min = context.siblings['MinStack']
  if (typeof value !== 'number' || typeof min !== 'number' || value < 0 || min < 0 || value >= min) {
    return []
  }
  return [
    {
      severity: 'error',
      code: 'objectGeodeStackRangeInvalid',
      messageKey: 'object.geodeStackRangeInvalid',
      path: context.path,
      params: { min, max: value },
    },
  ]
}

/** A drop chance of zero or less can never roll, so the row is dead weight. */
function validateGeodeChance(value: unknown, context: AssetValidationContext): AssetIssue[] {
  if (typeof value !== 'number' || value > 0) {
    return []
  }
  return [
    {
      severity: 'warning',
      code: 'objectGeodeChanceUnreachable',
      messageKey: 'object.geodeChanceUnreachable',
      path: context.path,
      params: { value },
    },
  ]
}

/**
 * `ArtifactSpotChances` maps a location name to a drop probability. It is edited
 * as raw JSON because the values are numbers rather than the strings a key/value
 * list writes, so the shape is checked here instead of by the control.
 */
function validateArtifactSpotChances(value: unknown, context: AssetValidationContext): AssetIssue[] {
  if (value === undefined || value === null) {
    return []
  }
  if (!isPlainObject(value)) {
    return [
      {
        severity: 'error',
        code: 'objectArtifactSpotChancesShape',
        messageKey: 'object.artifactSpotChancesShape',
        path: context.path,
        params: { value: describeValue(value) },
      },
    ]
  }

  const issues: AssetIssue[] = []
  for (const [location, chance] of Object.entries(value)) {
    if (typeof chance !== 'number' || !(chance > 0)) {
      issues.push({
        severity: 'error',
        code: 'objectArtifactSpotChanceInvalid',
        messageKey: 'object.artifactSpotChanceInvalid',
        path: [...context.path, location],
        params: { location, value: describeValue(chance) },
      })
    }
  }
  return issues
}

/** One `Buffs[].CustomAttributes` record: the stat deltas a buff applies. */
const BUFF_ATTRIBUTE_SCHEMA: readonly AssetFieldSchema[] = [
  { key: 'FarmingLevel', group: 'consumable', control: 'number', step: 1, labelKey: 'object.attrFarmingLevel' },
  { key: 'FishingLevel', group: 'consumable', control: 'number', step: 1, labelKey: 'object.attrFishingLevel' },
  { key: 'MiningLevel', group: 'consumable', control: 'number', step: 1, labelKey: 'object.attrMiningLevel' },
  { key: 'ForagingLevel', group: 'consumable', control: 'number', step: 1, labelKey: 'object.attrForagingLevel' },
  { key: 'CombatLevel', group: 'consumable', control: 'number', step: 1, labelKey: 'object.attrCombatLevel' },
  { key: 'LuckLevel', group: 'consumable', control: 'number', step: 1, labelKey: 'object.attrLuckLevel' },
  { key: 'MaxStamina', group: 'consumable', control: 'number', step: 1, labelKey: 'object.attrMaxStamina' },
  { key: 'MagneticRadius', group: 'consumable', control: 'number', step: 1, labelKey: 'object.attrMagneticRadius' },
  { key: 'Speed', group: 'consumable', control: 'number', step: 1, labelKey: 'object.attrSpeed' },
  { key: 'Defense', group: 'consumable', control: 'number', step: 1, labelKey: 'object.attrDefense' },
  { key: 'Attack', group: 'consumable', control: 'number', step: 1, labelKey: 'object.attrAttack' },
  { key: 'Immunity', group: 'consumable', control: 'number', step: 1, labelKey: 'object.attrImmunity' },
  { key: 'AttackMultiplier', group: 'consumable', control: 'number', step: 0.05, labelKey: 'object.attrAttackMultiplier' },
  { key: 'KnockbackMultiplier', group: 'consumable', control: 'number', step: 0.05, labelKey: 'object.attrKnockbackMultiplier' },
  { key: 'WeaponSpeedMultiplier', group: 'consumable', control: 'number', step: 0.05, labelKey: 'object.attrWeaponSpeedMultiplier' },
  {
    key: 'WeaponPrecisionMultiplier',
    group: 'consumable',
    control: 'number',
    step: 0.05,
    labelKey: 'object.attrWeaponPrecisionMultiplier',
  },
  { key: 'CriticalChanceMultiplier', group: 'consumable', control: 'number', step: 0.05, labelKey: 'object.attrCriticalChanceMultiplier' },
  { key: 'CriticalPowerMultiplier', group: 'consumable', control: 'number', step: 0.05, labelKey: 'object.attrCriticalPowerMultiplier' },
]

/** One `Buffs` row: an effect applied when the object is eaten or drunk. */
const BUFF_ITEM_SCHEMA: readonly AssetFieldSchema[] = [
  { key: 'Id', group: 'consumable', control: 'text', labelKey: 'object.buffRowId', required: true },
  { key: 'BuffId', group: 'consumable', control: 'text', labelKey: 'object.buffBuffId', suggestions: OBJECT_BUFF_ID_SUGGESTIONS },
  { key: 'Duration', group: 'consumable', control: 'number', min: 0, step: 1, labelKey: 'object.buffDuration' },
  { key: 'IsDebuff', group: 'consumable', control: 'tri_bool', labelKey: 'object.buffIsDebuff' },
  { key: 'IconTexture', group: 'consumable', control: 'texture_ref', labelKey: 'object.buffIconTexture' },
  { key: 'IconSpriteIndex', group: 'consumable', control: 'number', min: 0, step: 1, labelKey: 'object.buffIconSpriteIndex' },
  { key: 'GlowColor', group: 'consumable', control: 'color_rgb', labelKey: 'object.buffGlowColor' },
  {
    key: 'CustomAttributes',
    group: 'consumable',
    control: 'nested_object',
    labelKey: 'object.buffCustomAttributes',
    wide: true,
    itemSchema: BUFF_ATTRIBUTE_SCHEMA,
  },
  { key: 'CustomFields', group: 'consumable', control: 'key_value_list', labelKey: 'object.buffCustomFields', wide: true },
]

/** One `GeodeDrops` row: an item this object can yield when it is broken open. */
const GEODE_DROP_ITEM_SCHEMA: readonly AssetFieldSchema[] = [
  { key: 'Id', group: 'geode', control: 'text', labelKey: 'object.geodeRowId', required: true },
  { key: 'ItemId', group: 'geode', control: 'item_ref', labelKey: 'object.geodeItemId' },
  { key: 'RandomItemId', group: 'geode', control: 'string_list', labelKey: 'object.geodeRandomItemId', wide: true },
  { key: 'MaxItems', group: 'geode', control: 'number', min: 1, step: 1, labelKey: 'object.geodeMaxItems' },
  { key: 'MinStack', group: 'geode', control: 'number', min: -1, step: 1, labelKey: 'object.geodeMinStack' },
  {
    key: 'MaxStack',
    group: 'geode',
    control: 'number',
    min: -1,
    step: 1,
    labelKey: 'object.geodeMaxStack',
    validate: validateGeodeMaxStack,
  },
  { key: 'Quality', group: 'geode', control: 'number', min: -1, max: 4, step: 1, labelKey: 'object.geodeQuality' },
  {
    key: 'Chance',
    group: 'geode',
    control: 'number',
    min: 0,
    max: 1,
    step: 0.05,
    labelKey: 'object.geodeChance',
    validate: validateGeodeChance,
  },
  { key: 'Precedence', group: 'geode', control: 'number', step: 1, labelKey: 'object.geodePrecedence' },
  { key: 'Condition', group: 'geode', control: 'gsq', labelKey: 'object.geodeCondition', wide: true },
  { key: 'PerItemCondition', group: 'geode', control: 'gsq', labelKey: 'object.geodePerItemCondition', wide: true },
  { key: 'IsRecipe', group: 'geode', control: 'tri_bool', labelKey: 'object.geodeIsRecipe' },
  { key: 'ToolUpgradeLevel', group: 'geode', control: 'number', min: -1, step: 1, labelKey: 'object.geodeToolUpgradeLevel' },
  { key: 'ObjectInternalName', group: 'geode', control: 'text', labelKey: 'object.geodeObjectInternalName' },
  { key: 'ObjectDisplayName', group: 'geode', control: 'text', labelKey: 'object.geodeObjectDisplayName' },
  { key: 'ObjectColor', group: 'geode', control: 'text', labelKey: 'object.geodeObjectColor' },
  { key: 'SetFlagOnPickup', group: 'geode', control: 'text', labelKey: 'object.geodeSetFlagOnPickup' },
  { key: 'StackModifiers', group: 'geode', control: 'raw', rawShape: 'array', labelKey: 'object.geodeStackModifiers', wide: true },
  { key: 'StackModifierMode', group: 'geode', control: 'text', labelKey: 'object.geodeStackModifierMode' },
  { key: 'QualityModifiers', group: 'geode', control: 'raw', rawShape: 'array', labelKey: 'object.geodeQualityModifiers', wide: true },
  { key: 'QualityModifierMode', group: 'geode', control: 'text', labelKey: 'object.geodeQualityModifierMode' },
  { key: 'ModData', group: 'geode', control: 'key_value_list', labelKey: 'object.geodeModData', wide: true },
]

const FIELDS: readonly AssetFieldSchema[] = [
  { key: 'Name', group: 'basics', control: 'text', labelKey: 'object.name', required: true },
  { key: 'DisplayName', group: 'basics', control: 'text', labelKey: 'object.displayName', required: true },
  { key: 'Description', group: 'basics', control: 'textarea', labelKey: 'object.description', wide: true },
  { key: 'Type', group: 'basics', control: 'text', labelKey: 'object.type', required: true, suggestions: OBJECT_TYPE_SUGGESTIONS },
  { key: 'Category', group: 'basics', control: 'number', step: 1, labelKey: 'object.category', validate: validateCategory },
  { key: 'ContextTags', group: 'basics', control: 'string_list', labelKey: 'object.contextTags', wide: true },

  { key: 'Price', group: 'economy', control: 'number', step: 1, labelKey: 'object.price', validate: validatePrice },
  { key: 'CanBeGivenAsGift', group: 'economy', control: 'tri_bool', labelKey: 'object.canBeGivenAsGift' },
  { key: 'CanBeTrashed', group: 'economy', control: 'tri_bool', labelKey: 'object.canBeTrashed' },
  { key: 'ExcludeFromShippingCollection', group: 'economy', control: 'tri_bool', labelKey: 'object.excludeFromShippingCollection' },
  { key: 'ExcludeFromFishingCollection', group: 'economy', control: 'tri_bool', labelKey: 'object.excludeFromFishingCollection' },
  { key: 'ExcludeFromRandomSale', group: 'economy', control: 'tri_bool', labelKey: 'object.excludeFromRandomSale' },

  { key: 'Edibility', group: 'consumable', control: 'number', step: 1, labelKey: 'object.edibility', validate: validateEdibility },
  { key: 'IsDrink', group: 'consumable', control: 'tri_bool', labelKey: 'object.isDrink' },
  {
    key: 'Buffs',
    group: 'consumable',
    control: 'nested_list',
    labelKey: 'object.buffs',
    wide: true,
    itemSchema: BUFF_ITEM_SCHEMA,
    validate: validateBuffs,
  },

  { key: 'Texture', group: 'sprite', control: 'texture_ref', labelKey: 'object.texture' },
  {
    key: 'SpriteIndex',
    group: 'sprite',
    control: 'number',
    min: 0,
    step: 1,
    labelKey: 'object.spriteIndex',
    required: true,
    validate: validateSpriteIndex,
  },
  { key: 'ColorOverlayFromNextIndex', group: 'sprite', control: 'tri_bool', labelKey: 'object.colorOverlayFromNextIndex' },

  { key: 'GeodeDropsDefaultItems', group: 'geode', control: 'tri_bool', labelKey: 'object.geodeDropsDefaultItems' },
  {
    key: 'GeodeDrops',
    group: 'geode',
    control: 'nested_list',
    labelKey: 'object.geodeDrops',
    wide: true,
    itemSchema: GEODE_DROP_ITEM_SCHEMA,
    validate: validateGeodeDrops,
  },
  {
    key: 'ArtifactSpotChances',
    group: 'geode',
    control: 'raw',
    rawShape: 'object',
    labelKey: 'object.artifactSpotChances',
    wide: true,
    validate: validateArtifactSpotChances,
  },

  { key: 'CustomFields', group: 'advanced', control: 'key_value_list', labelKey: 'object.customFields', wide: true },
]

export const OBJECT_DATA_SCHEMA: AssetSchema = {
  assetId: OBJECT_DATA_ASSET_ID,
  keyOrder: OBJECT_FIELD_ORDER,
  groups: [
    { id: 'basics', labelKey: 'object.basics' },
    { id: 'economy', labelKey: 'object.economy' },
    { id: 'consumable', labelKey: 'object.consumable' },
    { id: 'sprite', labelKey: 'object.sprite' },
    { id: 'geode', labelKey: 'object.geode', collapsedByDefault: true },
    { id: 'advanced', labelKey: 'object.advanced', collapsedByDefault: true },
  ],
  fields: FIELDS,
}

registerAssetSchema(OBJECT_DATA_SCHEMA)
