/**
 * `Data/Buildings` field schema.
 *
 * Declares every known BuildingData key as a control, group and validation
 * rule, so the shared `AssetEntryCanvas` renders the whole form and the codex
 * page renders the same declaration read-only. Registering the schema is a
 * module side effect, mirroring how workspace plugins register during workbench
 * assembly.
 */

import {
  registerAssetSchema,
  type AssetFieldSchema,
  type AssetIssue,
  type AssetSchema,
  type AssetValidationContext,
} from '@entities/asset-schema'
import {
  BUILDER_SUGGESTIONS,
  BUILDING_FIELD_ORDER,
  BUILDING_TYPE_SUGGESTIONS,
  INDOOR_MAP_TYPE_SUGGESTIONS,
  OCCUPANT_TYPE_SUGGESTIONS,
} from './buildingFields'

/** Content Patcher target this schema describes. */
export const BUILDING_DATA_ASSET_ID = 'Data/Buildings'

function readAxis(value: unknown, axis: string): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>)[axis] : undefined
}

function isWholeAbove(value: unknown, minimum: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum
}

/**
 * A building without a positive tile footprint can never be placed: the game
 * treats the zero-size rectangle as "occupies nothing" and the carpenter menu
 * silently refuses the placement.
 */
function validateSize(value: unknown, context: AssetValidationContext): AssetIssue[] {
  if (value === undefined || value === null) {
    return []
  }
  if (isWholeAbove(readAxis(value, 'X'), 1) && isWholeAbove(readAxis(value, 'Y'), 1)) {
    return []
  }
  return [
    {
      severity: 'error',
      code: 'buildingSizeInvalid',
      messageKey: 'building.sizeInvalid',
      path: context.path,
      params: {},
    },
  ]
}

/** A material row costing zero (or a negative count) is dropped by the game. */
function validateMaterialAmount(value: unknown, context: AssetValidationContext): AssetIssue[] {
  if (value === undefined || value === null || isWholeAbove(value, 1)) {
    return []
  }
  return [
    {
      severity: 'warning',
      code: 'buildingMaterialAmountInvalid',
      messageKey: 'building.materialAmountInvalid',
      path: context.path,
      params: { value: typeof value === 'number' ? value : (JSON.stringify(value) ?? 'undefined') },
    },
  ]
}

/** One `BuildMaterials` row, shared by the building and by each of its skins. */
const MATERIAL_ITEM_SCHEMA: readonly AssetFieldSchema[] = [
  { key: 'ItemId', group: 'construction', control: 'item_ref', labelKey: 'building.materialItemId', required: true },
  {
    key: 'Amount',
    group: 'construction',
    control: 'number',
    min: 1,
    step: 1,
    labelKey: 'building.materialAmount',
    validate: validateMaterialAmount,
  },
]

/**
 * One `Skins` row: an alternate look sold next to the base building. Everything
 * it omits falls back to the building's own value.
 */
const SKIN_ITEM_SCHEMA: readonly AssetFieldSchema[] = [
  { key: 'Id', group: 'skins', control: 'text', labelKey: 'building.skinId', required: true },
  { key: 'Name', group: 'skins', control: 'text', labelKey: 'building.skinName' },
  { key: 'NameForGeneralType', group: 'skins', control: 'text', labelKey: 'building.skinNameForGeneralType' },
  { key: 'Description', group: 'skins', control: 'textarea', labelKey: 'building.skinDescription', wide: true },
  { key: 'Texture', group: 'skins', control: 'texture_ref', labelKey: 'building.skinTexture' },
  { key: 'Condition', group: 'skins', control: 'gsq', labelKey: 'building.skinCondition', wide: true },
  { key: 'BuildDays', group: 'skins', control: 'number', min: 0, step: 1, labelKey: 'building.skinBuildDays' },
  { key: 'BuildCost', group: 'skins', control: 'number', min: 0, step: 1, labelKey: 'building.skinBuildCost' },
  {
    key: 'BuildMaterials',
    group: 'skins',
    control: 'nested_list',
    labelKey: 'building.skinBuildMaterials',
    wide: true,
    itemSchema: MATERIAL_ITEM_SCHEMA,
  },
  { key: 'ShowAsSeparateConstructionEntry', group: 'skins', control: 'tri_bool', labelKey: 'building.skinShowAsSeparateEntry' },
  { key: 'Metadata', group: 'skins', control: 'key_value_list', labelKey: 'building.skinMetadata', wide: true },
]

/** One `AdditionalPlacementTiles` row. */
const PLACEMENT_TILE_ITEM_SCHEMA: readonly AssetFieldSchema[] = [
  { key: 'TileArea', group: 'placement', control: 'rect', labelKey: 'building.placementTileArea' },
  { key: 'OnlyNeedsToBePassable', group: 'placement', control: 'tri_bool', labelKey: 'building.placementTileOnlyPassable' },
]

const FIELDS: readonly AssetFieldSchema[] = [
  // 基础信息
  { key: 'Name', group: 'basics', control: 'text', labelKey: 'building.name', required: true },
  { key: 'NameForGeneralType', group: 'basics', control: 'text', labelKey: 'building.nameForGeneralType' },
  { key: 'Description', group: 'basics', control: 'textarea', labelKey: 'building.description', wide: true },
  { key: 'BuildingType', group: 'basics', control: 'text', labelKey: 'building.buildingType', suggestions: BUILDING_TYPE_SUGGESTIONS },
  { key: 'MagicalConstruction', group: 'basics', control: 'tri_bool', labelKey: 'building.magicalConstruction' },
  { key: 'DefaultAction', group: 'basics', control: 'text', labelKey: 'building.defaultAction' },

  // 建造
  { key: 'Builder', group: 'construction', control: 'text', labelKey: 'building.builder', suggestions: BUILDER_SUGGESTIONS },
  { key: 'BuildCondition', group: 'construction', control: 'gsq', labelKey: 'building.buildCondition', wide: true },
  { key: 'BuildDays', group: 'construction', control: 'number', min: 0, step: 1, labelKey: 'building.buildDays' },
  { key: 'BuildCost', group: 'construction', control: 'number', min: 0, step: 1, labelKey: 'building.buildCost' },
  {
    key: 'BuildMaterials',
    group: 'construction',
    control: 'nested_list',
    labelKey: 'building.buildMaterials',
    wide: true,
    itemSchema: MATERIAL_ITEM_SCHEMA,
  },
  { key: 'AddMailOnBuild', group: 'construction', control: 'string_list', labelKey: 'building.addMailOnBuild', wide: true },

  // 皮肤
  { key: 'Skins', group: 'skins', control: 'nested_list', labelKey: 'building.skins', wide: true, itemSchema: SKIN_ITEM_SCHEMA },

  // 放置
  { key: 'Size', group: 'placement', control: 'point', labelKey: 'building.size', required: true, validate: validateSize },
  { key: 'CollisionMap', group: 'placement', control: 'textarea', labelKey: 'building.collisionMap', wide: true },
  {
    key: 'AdditionalPlacementTiles',
    group: 'placement',
    control: 'nested_list',
    labelKey: 'building.additionalPlacementTiles',
    wide: true,
    itemSchema: PLACEMENT_TILE_ITEM_SCHEMA,
  },
  { key: 'AllowsFlooringUnderneath', group: 'placement', control: 'tri_bool', labelKey: 'building.allowsFlooringUnderneath' },
  { key: 'HumanDoor', group: 'placement', control: 'point', labelKey: 'building.humanDoor' },
  { key: 'AnimalDoor', group: 'placement', control: 'rect', labelKey: 'building.animalDoor' },
  { key: 'AnimalDoorOpenDuration', group: 'placement', control: 'number', min: 0, step: 1, labelKey: 'building.animalDoorOpenDuration' },
  { key: 'AnimalDoorOpenSound', group: 'placement', control: 'text', labelKey: 'building.animalDoorOpenSound' },
  { key: 'AnimalDoorCloseDuration', group: 'placement', control: 'number', min: 0, step: 1, labelKey: 'building.animalDoorCloseDuration' },
  { key: 'AnimalDoorCloseSound', group: 'placement', control: 'text', labelKey: 'building.animalDoorCloseSound' },
  {
    key: 'AdditionalTilePropertyRadius',
    group: 'placement',
    control: 'number',
    min: 0,
    step: 1,
    labelKey: 'building.additionalTilePropertyRadius',
  },
  { key: 'ActionTiles', group: 'placement', control: 'raw', rawShape: 'array', labelKey: 'building.actionTiles', wide: true },
  { key: 'TileProperties', group: 'placement', control: 'raw', rawShape: 'array', labelKey: 'building.tileProperties', wide: true },

  // 升级链
  { key: 'BuildingToUpgrade', group: 'upgrade', control: 'building_ref', labelKey: 'building.buildingToUpgrade' },
  { key: 'UpgradeSignTile', group: 'upgrade', control: 'point', labelKey: 'building.upgradeSignTile' },
  { key: 'UpgradeSignHeight', group: 'upgrade', control: 'number', step: 1, labelKey: 'building.upgradeSignHeight' },

  // 室内地图
  { key: 'IndoorMap', group: 'indoor', control: 'map_ref', labelKey: 'building.indoorMap' },
  { key: 'IndoorMapType', group: 'indoor', control: 'text', labelKey: 'building.indoorMapType', suggestions: INDOOR_MAP_TYPE_SUGGESTIONS },
  { key: 'NonInstancedIndoorLocation', group: 'indoor', control: 'location_ref', labelKey: 'building.nonInstancedIndoorLocation' },
  { key: 'MaxOccupants', group: 'indoor', control: 'number', min: 0, step: 1, labelKey: 'building.maxOccupants' },
  {
    key: 'ValidOccupantTypes',
    group: 'indoor',
    control: 'string_list',
    labelKey: 'building.validOccupantTypes',
    wide: true,
    suggestions: OCCUPANT_TYPE_SUGGESTIONS,
  },
  { key: 'AllowAnimalPregnancy', group: 'indoor', control: 'tri_bool', labelKey: 'building.allowAnimalPregnancy' },
  { key: 'HayCapacity', group: 'indoor', control: 'number', min: 0, step: 1, labelKey: 'building.hayCapacity' },
  { key: 'IndoorItems', group: 'indoor', control: 'raw', rawShape: 'array', labelKey: 'building.indoorItems', wide: true },
  { key: 'IndoorItemMoves', group: 'indoor', control: 'raw', rawShape: 'array', labelKey: 'building.indoorItemMoves', wide: true },
  { key: 'Chests', group: 'indoor', control: 'raw', rawShape: 'array', labelKey: 'building.chests', wide: true },

  // 纹理
  { key: 'Texture', group: 'texture', control: 'texture_ref', labelKey: 'building.texture' },
  { key: 'SourceRect', group: 'texture', control: 'rect', labelKey: 'building.sourceRect' },
  { key: 'SeasonOffset', group: 'texture', control: 'point', labelKey: 'building.seasonOffset' },
  { key: 'DrawOffset', group: 'texture', control: 'point', labelKey: 'building.drawOffset' },
  { key: 'BuildMenuDrawOffset', group: 'texture', control: 'point', labelKey: 'building.buildMenuDrawOffset' },
  { key: 'SortTileOffset', group: 'texture', control: 'number', step: 0.5, labelKey: 'building.sortTileOffset' },
  { key: 'DrawShadow', group: 'texture', control: 'tri_bool', labelKey: 'building.drawShadow' },
  { key: 'FadeWhenBehind', group: 'texture', control: 'tri_bool', labelKey: 'building.fadeWhenBehind' },
  { key: 'DrawLayers', group: 'texture', control: 'raw', rawShape: 'array', labelKey: 'building.drawLayers', wide: true },

  // 高级与自定义
  { key: 'ItemConversions', group: 'advanced', control: 'raw', rawShape: 'array', labelKey: 'building.itemConversions', wide: true },
  { key: 'Metadata', group: 'advanced', control: 'key_value_list', labelKey: 'building.metadata', wide: true },
  { key: 'ModData', group: 'advanced', control: 'key_value_list', labelKey: 'building.modData', wide: true },
  { key: 'CustomFields', group: 'advanced', control: 'key_value_list', labelKey: 'building.customFields', wide: true },
]

export const BUILDING_DATA_SCHEMA: AssetSchema = {
  assetId: BUILDING_DATA_ASSET_ID,
  keyOrder: BUILDING_FIELD_ORDER,
  groups: [
    { id: 'basics', labelKey: 'building.basics' },
    { id: 'construction', labelKey: 'building.construction' },
    { id: 'placement', labelKey: 'building.placement' },
    { id: 'skins', labelKey: 'building.skins', collapsedByDefault: true },
    { id: 'upgrade', labelKey: 'building.upgrade', collapsedByDefault: true },
    { id: 'indoor', labelKey: 'building.indoor', collapsedByDefault: true },
    { id: 'texture', labelKey: 'building.texture', collapsedByDefault: true },
    { id: 'advanced', labelKey: 'building.advanced', collapsedByDefault: true },
  ],
  fields: FIELDS,
}

registerAssetSchema(BUILDING_DATA_SCHEMA)
