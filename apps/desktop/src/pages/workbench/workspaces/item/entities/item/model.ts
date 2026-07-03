import { getQualifiedItemId, normalizeQualifiedItemId } from './itemIdentity'
import { getDefaultItemSpriteMetrics } from './itemSpriteMetrics'
import type {
  ItemCropEntry,
  ItemFishData,
  ItemIngredient,
  ItemKind,
  ItemMachineLink,
  ItemRecipeEntry,
  ItemRecipeKind,
  ItemShopEntry,
  ItemWorkspaceEntry,
  RawToolUpgradeEntry,
} from './itemTypes'

export * from '@entities/character/lib/clothingSprites'
export { buildGameContentPath } from '@shared/infra/stardew-assets/contentPaths'
export * from './itemBrowseMetadata'
export * from './itemIdentity'
export * from './itemSpriteMetrics'
export type * from './itemTypes'

export const OBJECT_DATA_ASSET_PATH = 'Content\\Data\\Objects.xnb'
export const BIG_CRAFTABLE_DATA_ASSET_PATH = 'Content\\Data\\BigCraftables.xnb'
export const WEAPON_DATA_ASSET_PATH = 'Content\\Data\\Weapons.xnb'
export const TOOL_DATA_ASSET_PATH = 'Content\\Data\\Tools.xnb'
export const SHIRT_DATA_ASSET_PATH = 'Content\\Data\\Shirts.xnb'
export const PANTS_DATA_ASSET_PATH = 'Content\\Data\\Pants.xnb'
export const TRINKET_DATA_ASSET_PATH = 'Content\\Data\\Trinkets.xnb'
export const HAT_DATA_ASSET_PATH = 'Content\\Data\\hats.xnb'
export const BOOTS_DATA_ASSET_PATH = 'Content\\Data\\Boots.xnb'
export const FURNITURE_DATA_ASSET_PATH = 'Content\\Data\\Furniture.xnb'
export const CROP_DATA_ASSET_PATH = 'Content\\Data\\Crops.xnb'
export const FISH_DATA_ASSET_PATH = 'Content\\Data\\Fish.xnb'
export const LOCATION_DATA_ASSET_PATH = 'Content\\Data\\Locations.xnb'
export const SHOP_DATA_ASSET_PATH = 'Content\\Data\\Shops.xnb'
export const MACHINE_DATA_ASSET_PATH = 'Content\\Data\\Machines.xnb'
export const FISH_POND_DATA_ASSET_PATH = 'Content\\Data\\FishPondData.xnb'
export const CRAFTING_RECIPES_ASSET_PATH = 'Content\\Data\\CraftingRecipes.xnb'
export const COOKING_RECIPES_ASSET_PATH = 'Content\\Data\\CookingRecipes.xnb'

type RawObjectDataEntry = {
  Name?: string | null
  DisplayName?: string | null
  Description?: string | null
  Type?: string | null
  Category?: number | null
  Price?: number | null
  Texture?: string | null
  SpriteIndex?: number | null
  ColorOverlayFromNextIndex?: boolean | null
  Edibility?: number | null
  IsDrink?: boolean | null
  Buffs?: RawObjectBuffDataEntry[] | null
  GeodeDropsDefaultItems?: boolean | null
  GeodeDrops?: RawObjectGeodeDropDataEntry[] | null
  ArtifactSpotChances?: Record<string, number> | null
  CanBeGivenAsGift?: boolean | null
  CanBeTrashed?: boolean | null
  ExcludeFromFishingCollection?: boolean | null
  ExcludeFromShippingCollection?: boolean | null
  ExcludeFromRandomSale?: boolean | null
  ContextTags?: string[] | null
  CustomFields?: Record<string, string> | null
}

type RawObjectBuffAttributesData = {
  CombatLevel?: number | null
  FarmingLevel?: number | null
  FishingLevel?: number | null
  MiningLevel?: number | null
  LuckLevel?: number | null
  ForagingLevel?: number | null
  MaxStamina?: number | null
  MagneticRadius?: number | null
  Speed?: number | null
  Defense?: number | null
  Attack?: number | null
  AttackMultiplier?: number | null
  Immunity?: number | null
  KnockbackMultiplier?: number | null
  WeaponSpeedMultiplier?: number | null
  CriticalChanceMultiplier?: number | null
  CriticalPowerMultiplier?: number | null
  WeaponPrecisionMultiplier?: number | null
}

type RawObjectBuffDataEntry = {
  Id?: string | null
  BuffId?: string | null
  IconTexture?: string | null
  IconSpriteIndex?: number | null
  Duration?: number | null
  IsDebuff?: boolean | null
  GlowColor?: string | null
  CustomAttributes?: RawObjectBuffAttributesData | null
  CustomFields?: Record<string, string> | null
}

type RawQuantityModifier = {
  Id?: string | null
  Condition?: string | null
  Modification?: string | number | null
  Amount?: number | null
  RandomAmount?: number[] | null
}

type RawObjectGeodeDropDataEntry = RawSpawnEntry & {
  ObjectInternalName?: string | null
  ObjectDisplayName?: string | null
  ObjectColor?: string | null
  ToolUpgradeLevel?: number | null
  IsRecipe?: boolean | null
  StackModifiers?: RawQuantityModifier[] | null
  StackModifierMode?: string | number | null
  QualityModifiers?: RawQuantityModifier[] | null
  QualityModifierMode?: string | number | null
  ModData?: Record<string, string> | null
  PerItemCondition?: string | null
  SetFlagOnPickup?: string | null
  Precedence?: number | null
}

type RawBigCraftableDataEntry = {
  Name?: string | null
  DisplayName?: string | null
  Description?: string | null
  Price?: number | null
  Fragility?: number | null
  CanBePlacedOutdoors?: boolean | null
  CanBePlacedIndoors?: boolean | null
  IsLamp?: boolean | null
  Texture?: string | null
  SpriteIndex?: number | null
  ContextTags?: string[] | null
  CustomFields?: Record<string, string> | null
}

type RawWeaponDataEntry = {
  Name?: string | null
  DisplayName?: string | null
  Description?: string | null
  MinDamage?: number | null
  MaxDamage?: number | null
  Knockback?: number | null
  Speed?: number | null
  Precision?: number | null
  Defense?: number | null
  Type?: number | null
  MineBaseLevel?: number | null
  MineMinLevel?: number | null
  AreaOfEffect?: number | null
  CritChance?: number | null
  CritMultiplier?: number | null
  Texture?: string | null
  SpriteIndex?: number | null
  CustomFields?: Record<string, string> | null
}

type RawToolDataEntry = {
  ClassName?: string | null
  Name?: string | null
  AttachmentSlots?: number | null
  SalePrice?: number | null
  DisplayName?: string | null
  Description?: string | null
  Texture?: string | null
  SpriteIndex?: number | null
  MenuSpriteIndex?: number | null
  UpgradeLevel?: number | null
  ConventionalUpgradeFrom?: string | null
  UpgradeFrom?: RawToolUpgradeEntry[] | null
  CustomFields?: Record<string, string> | null
}

type RawShirtDataEntry = {
  Name?: string | null
  DisplayName?: string | null
  Description?: string | null
  Price?: number | null
  Texture?: string | null
  SpriteIndex?: number | null
  DefaultColor?: string | null
  CanBeDyed?: boolean | null
  IsPrismatic?: boolean | null
  HasSleeves?: boolean | null
  CanChooseDuringCharacterCustomization?: boolean | null
  CustomFields?: Record<string, string> | null
}

type RawPantsDataEntry = {
  Name?: string | null
  DisplayName?: string | null
  Description?: string | null
  Price?: number | null
  Texture?: string | null
  SpriteIndex?: number | null
  DefaultColor?: string | null
  CanBeDyed?: boolean | null
  IsPrismatic?: boolean | null
  CanChooseDuringCharacterCustomization?: boolean | null
  CustomFields?: Record<string, string> | null
}

type RawTrinketDataEntry = {
  DisplayName?: string | null
  Description?: string | null
  Texture?: string | null
  SheetIndex?: number | null
  TrinketEffectClass?: string | null
  DropsNaturally?: boolean | null
  CanBeReforged?: boolean | null
  CustomFields?: Record<string, string> | null
}

type RawCropDataEntry = {
  Seasons?: string[] | null
  DaysInPhase?: number[] | null
  RegrowDays?: number | null
  IsRaised?: boolean | null
  IsPaddyCrop?: boolean | null
  NeedsWatering?: boolean | null
  HarvestItemId?: string | null
  HarvestMinStack?: number | null
  HarvestMaxStack?: number | null
  ExtraHarvestChance?: number | null
  HarvestMethod?: string | number | null
}

type RawSpawnEntry = {
  Id?: string | null
  ItemId?: string | null
  RandomItemId?: string[] | null
  MaxItems?: number | null
  MinStack?: number | null
  MaxStack?: number | null
  Quality?: number | null
  Chance?: number | null
  Condition?: string | null
  Season?: string | null
  MinFishingLevel?: number | null
  MinDistanceFromShore?: number | null
  MaxDistanceFromShore?: number | null
  FishAreaId?: string | null
  RequiredPopulation?: number | null
}

type RawLocationDataEntry = {
  DisplayName?: string | null
  Fish?: RawSpawnEntry[] | null
  Forage?: RawSpawnEntry[] | null
  ArtifactSpots?: RawSpawnEntry[] | null
}

type RawShopItemData = RawSpawnEntry & {
  TradeItemId?: string | null
  TradeItemAmount?: number | null
  Price?: number | null
  AvailableStock?: number | null
  AvailableStockLimit?: string | number | null
  UseObjectDataPrice?: boolean | null
  IsRecipe?: boolean | null
}

type RawShopDataEntry = {
  Owners?: Array<{
    Id?: string | null
    Name?: string | null
  }> | null
  Items?: RawShopItemData[] | null
}

type RawMachineOutputTriggerEntry = {
  Trigger?: string | number | null
  RequiredItemId?: string | null
  RequiredTags?: string[] | null
  RequiredCount?: number | null
  Condition?: string | null
}

type RawMachineItemOutputEntry = RawSpawnEntry

type RawMachineOutputRuleEntry = {
  Id?: string | null
  Triggers?: RawMachineOutputTriggerEntry[] | null
  OutputItem?: RawMachineItemOutputEntry[] | null
  MinutesUntilReady?: number | null
  DaysUntilReady?: number | null
}

type RawMachineDataEntry = {
  OutputRules?: RawMachineOutputRuleEntry[] | null
}

type RawFishPondDataEntry = {
  Id?: string | null
  RequiredTags?: string[] | null
  MaxPopulation?: number | null
  SpawnTime?: number | null
  ProducedItems?: RawSpawnEntry[] | null
  PopulationGates?: Record<string, string[]> | null
}

function trimString(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed || null
}

function parseNumber(value: number | string | null | undefined, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim())
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

function normalizeAssetName(assetName: string | null | undefined) {
  const trimmed = trimString(assetName)?.replaceAll('\\', '/') ?? ''
  if (!trimmed) {
    return null
  }

  return trimmed.replace(/^Content\//iu, '')
}

function buildTexturePathLabel(assetName: string | null) {
  return assetName ? assetName.replaceAll('/', '\\') : 'Unknown'
}

function normalizeStringRecord(value: Record<string, string> | null | undefined) {
  return value ? { ...value } : {}
}

function normalizeNumberRecord(value: Record<string, number> | null | undefined) {
  return value ? { ...value } : {}
}

function createObjectBuffAttributes(input: RawObjectBuffAttributesData | null | undefined) {
  return {
    combatLevel: input?.CombatLevel ?? 0,
    farmingLevel: input?.FarmingLevel ?? 0,
    fishingLevel: input?.FishingLevel ?? 0,
    miningLevel: input?.MiningLevel ?? 0,
    luckLevel: input?.LuckLevel ?? 0,
    foragingLevel: input?.ForagingLevel ?? 0,
    maxStamina: input?.MaxStamina ?? 0,
    magneticRadius: input?.MagneticRadius ?? 0,
    speed: input?.Speed ?? 0,
    defense: input?.Defense ?? 0,
    attack: input?.Attack ?? 0,
    attackMultiplier: input?.AttackMultiplier ?? 0,
    immunity: input?.Immunity ?? 0,
    knockbackMultiplier: input?.KnockbackMultiplier ?? 0,
    weaponSpeedMultiplier: input?.WeaponSpeedMultiplier ?? 0,
    criticalChanceMultiplier: input?.CriticalChanceMultiplier ?? 0,
    criticalPowerMultiplier: input?.CriticalPowerMultiplier ?? 0,
    weaponPrecisionMultiplier: input?.WeaponPrecisionMultiplier ?? 0,
  }
}

function createQuantityModifiers(input: RawQuantityModifier[] | null | undefined) {
  return (input ?? []).map((modifier) => ({
    id: trimString(modifier.Id),
    condition: trimString(modifier.Condition),
    modification: modifier.Modification ?? null,
    amount: modifier.Amount ?? 0,
    randomAmount: [...(modifier.RandomAmount ?? [])],
  }))
}

function createObjectBuffs(input: RawObjectBuffDataEntry[] | null | undefined) {
  return (input ?? []).map((buff) => ({
    id: trimString(buff.Id),
    buffId: trimString(buff.BuffId),
    iconTexture: normalizeAssetName(buff.IconTexture),
    iconSpriteIndex: buff.IconSpriteIndex ?? 0,
    duration: buff.Duration ?? 0,
    isDebuff: Boolean(buff.IsDebuff),
    glowColor: trimString(buff.GlowColor),
    customAttributes: createObjectBuffAttributes(buff.CustomAttributes),
    customFields: normalizeStringRecord(buff.CustomFields),
  }))
}

function createObjectGeodeDrops(input: RawObjectGeodeDropDataEntry[] | null | undefined) {
  return (input ?? []).map((drop) => ({
    id: trimString(drop.Id),
    itemId: trimString(drop.ItemId),
    randomItemIds: [...(drop.RandomItemId ?? [])],
    maxItems: drop.MaxItems ?? null,
    minStack: drop.MinStack ?? -1,
    maxStack: drop.MaxStack ?? -1,
    quality: drop.Quality ?? -1,
    objectInternalName: trimString(drop.ObjectInternalName),
    objectDisplayName: trimString(drop.ObjectDisplayName),
    objectColor: trimString(drop.ObjectColor),
    toolUpgradeLevel: drop.ToolUpgradeLevel ?? -1,
    isRecipe: Boolean(drop.IsRecipe),
    stackModifiers: createQuantityModifiers(drop.StackModifiers),
    stackModifierMode: drop.StackModifierMode ?? null,
    qualityModifiers: createQuantityModifiers(drop.QualityModifiers),
    qualityModifierMode: drop.QualityModifierMode ?? null,
    modData: normalizeStringRecord(drop.ModData),
    perItemCondition: trimString(drop.PerItemCondition),
    condition: trimString(drop.Condition),
    chance: drop.Chance ?? 1,
    setFlagOnPickup: trimString(drop.SetFlagOnPickup),
    precedence: drop.Precedence ?? 0,
  }))
}

function getFurnitureTypeKey(rawType: string | null | undefined) {
  const normalized = (rawType ?? '').trim().toLowerCase()
  if (!normalized) {
    return 'other'
  }

  return normalized.startsWith('bed') ? 'bed' : normalized
}

function getDefaultFurnitureSourceSize(rawType: string | null | undefined) {
  switch (getFurnitureTypeKey(rawType)) {
    case 'chair':
      return { width: 1, height: 2 }
    case 'bench':
      return { width: 2, height: 2 }
    case 'couch':
      return { width: 3, height: 2 }
    case 'armchair':
    case 'dresser':
      return { width: 2, height: 2 }
    case 'long table':
      return { width: 5, height: 3 }
    case 'painting':
      return { width: 2, height: 2 }
    case 'lamp':
      return { width: 1, height: 3 }
    case 'decor':
      return { width: 1, height: 2 }
    case 'bookcase':
    case 'table':
      return { width: 2, height: 3 }
    case 'rug':
      return { width: 3, height: 2 }
    case 'window':
    case 'sconce':
    case 'torch':
      return { width: 1, height: 2 }
    case 'fireplace':
      return { width: 2, height: 5 }
    default:
      return { width: 1, height: 2 }
  }
}

function getDefaultFurnitureBoundingSize(rawType: string | null | undefined) {
  switch (getFurnitureTypeKey(rawType)) {
    case 'chair':
    case 'lamp':
    case 'decor':
    case 'torch':
      return { width: 1, height: 1 }
    case 'bench':
      return { width: 2, height: 1 }
    case 'couch':
      return { width: 3, height: 1 }
    case 'armchair':
    case 'dresser':
    case 'bookcase':
      return { width: 2, height: 1 }
    case 'long table':
      return { width: 5, height: 2 }
    case 'painting':
      return { width: 2, height: 2 }
    case 'table':
      return { width: 2, height: 2 }
    case 'rug':
      return { width: 3, height: 2 }
    case 'window':
    case 'sconce':
      return { width: 1, height: 2 }
    case 'fireplace':
      return { width: 2, height: 1 }
    default:
      return { width: 1, height: 1 }
  }
}

function normalizeSearchParts(parts: Array<string | number | null | undefined>) {
  return parts
    .filter((value): value is string | number => value != null && value !== '')
    .join(' ')
    .toLowerCase()
}

function parseFishDataEntry(rawValue: string | null | undefined): ItemFishData | null {
  const trimmed = rawValue?.trim() ?? ''
  if (!trimmed) {
    return null
  }

  const segments = trimmed.split('/')
  const behavior = trimString(segments[1])
  const rawSize = (segments[3] ?? '').trim().split(/\s+/u).filter(Boolean)
  const rawTimeSpans = (segments[5] ?? '').trim().split(/\s+/u).filter(Boolean)
  const timeSpans = new Array<{ start: number; end: number }>()

  for (let index = 0; index + 1 < rawTimeSpans.length; index += 2) {
    timeSpans.push({
      start: parseNumber(rawTimeSpans[index], 0),
      end: parseNumber(rawTimeSpans[index + 1], 0),
    })
  }

  return {
    difficulty: behavior === 'trap' ? null : parseNumber(segments[1], Number.NaN),
    behavior,
    minSize: parseNumber(rawSize[0], Number.NaN),
    maxSize: parseNumber(rawSize[1], Number.NaN),
    timeSpans,
    seasons: (segments[6] ?? '').split(/\s+/u).filter(Boolean),
    weather: trimString(segments[7]),
    maxDepth: parseNumber(segments[9], Number.NaN),
    chance: parseNumber(segments[10], Number.NaN),
    depthMultiplier: parseNumber(segments[11], Number.NaN),
    minFishingLevel: parseNumber(segments[12], 0),
    isTutorialFish: segments[13]?.trim().toLowerCase() === 'true',
  }
}

function parseTileSize(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  if (!trimmed || trimmed === '-1') {
    return null
  }

  const [rawWidth, rawHeight] = trimmed.split(/\s+/u)
  const width = parseNumber(rawWidth, Number.NaN)
  const height = parseNumber(rawHeight, Number.NaN)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }

  return {
    width,
    height,
  }
}

function parseIngredients(rawValue: string) {
  const tokens = rawValue.trim().split(/\s+/u).filter(Boolean)
  const ingredients = new Array<ItemIngredient>()

  for (let index = 0; index + 1 < tokens.length; index += 2) {
    const rawId = tokens[index] ?? ''
    const amount = Math.max(1, parseNumber(tokens[index + 1], 1))
    const parsedCategory = rawId.startsWith('-') ? parseNumber(rawId, Number.NaN) : Number.NaN

    if (Number.isFinite(parsedCategory)) {
      ingredients.push({
        key: `category:${parsedCategory}`,
        kind: 'category',
        qualifiedItemId: null,
        displayName: `Category ${parsedCategory}`,
        amount,
        category: parsedCategory,
      })
      continue
    }

    const qualifiedItemId = normalizeQualifiedItemId(rawId, 'object')
    ingredients.push({
      key: qualifiedItemId ?? rawId,
      kind: 'item',
      qualifiedItemId,
      displayName: qualifiedItemId ?? rawId,
      amount,
      category: null,
    })
  }

  return ingredients
}

function parseRecipeUnlock(rawValue: string) {
  const trimmed = rawValue.trim()
  if (!trimmed) {
    return { unlockType: 'default' as const, unlockLabel: 'Default' }
  }

  if (trimmed.toLowerCase() === 'home') {
    return { unlockType: 'home' as const, unlockLabel: 'Starter' }
  }

  const skillMatch = /^s\s+([A-Za-z]+)\s+(\d+)$/iu.exec(trimmed)
  if (skillMatch) {
    return { unlockType: 'skill' as const, unlockLabel: `${skillMatch[1]} Lv.${skillMatch[2]}` }
  }

  const friendshipMatch = /^f\s+([^ ]+)\s+(\d+)$/iu.exec(trimmed)
  if (friendshipMatch) {
    return { unlockType: 'friendship' as const, unlockLabel: `${friendshipMatch[1]} ${friendshipMatch[2]}\u2665` }
  }

  return { unlockType: 'other' as const, unlockLabel: trimmed }
}

function createBaseEntry(input: {
  kind: ItemKind
  itemId: string
  rawDisplayName: string
  rawDescription: string | null
  internalName: string
  category?: number | null
  rawType?: string | null
  kindMetaLabel?: string | null
  textureAssetName: string | null
  spriteIndex: number | null
  menuSpriteIndex?: number | null
  spriteWidth?: number
  spriteHeight?: number
  price?: number | null
  salePrice?: number | null
  edibility?: number | null
  isDrink?: boolean
  canBeGivenAsGift?: boolean
  canBeTrashed?: boolean
  searchParts: Array<string | number | null | undefined>
  contextTags?: string[]
  customFields?: Record<string, string>
  objectStats?: ItemWorkspaceEntry['objectStats']
  weaponStats?: ItemWorkspaceEntry['weaponStats']
  toolStats?: ItemWorkspaceEntry['toolStats']
  apparelStats?: ItemWorkspaceEntry['apparelStats']
  placementStats?: ItemWorkspaceEntry['placementStats']
  trinketStats?: ItemWorkspaceEntry['trinketStats']
  hatStats?: ItemWorkspaceEntry['hatStats']
  footwearStats?: ItemWorkspaceEntry['footwearStats']
  furnitureStats?: ItemWorkspaceEntry['furnitureStats']
}) {
  const qualifiedItemId = getQualifiedItemId(input.kind, input.itemId)
  const defaultMetrics = getDefaultItemSpriteMetrics(input.kind)

  return {
    key: qualifiedItemId,
    qualifiedItemId,
    itemId: input.itemId,
    rawDisplayName: input.rawDisplayName,
    displayName: input.rawDisplayName,
    rawDescription: input.rawDescription,
    description: input.rawDescription,
    internalName: input.internalName,
    kind: input.kind,
    category: input.category ?? null,
    rawType: input.rawType ?? null,
    kindMetaLabel: input.kindMetaLabel ?? null,
    textureAssetName: input.textureAssetName,
    texturePathLabel: buildTexturePathLabel(input.textureAssetName),
    spriteIndex: input.spriteIndex,
    menuSpriteIndex: input.menuSpriteIndex ?? input.spriteIndex,
    spriteWidth: input.spriteWidth ?? defaultMetrics.width,
    spriteHeight: input.spriteHeight ?? defaultMetrics.height,
    price: input.price ?? null,
    salePrice: input.salePrice ?? null,
    edibility: input.edibility ?? null,
    isDrink: Boolean(input.isDrink),
    canBeGivenAsGift: input.canBeGivenAsGift ?? false,
    canBeTrashed: input.canBeTrashed ?? true,
    searchText: normalizeSearchParts(input.searchParts),
    browseCategories: ['all'],
    categorySearchTokens: ['all'],
    contextTags: [...(input.contextTags ?? [])],
    customFields: input.customFields ?? {},
    objectStats: input.objectStats ?? null,
    cropData: null,
    cropHarvests: [],
    fishData: null,
    fishCatchLocations: [],
    recipesProduced: [],
    recipesUsing: [],
    shopEntries: [],
    shopRecipeEntries: [],
    machineOutputs: [],
    machineInputs: [],
    artifactSpotSources: [],
    forageSources: [],
    fishPondSources: [],
    fishPondProfile: null,
    lovedBy: [],
    likedBy: [],
    weaponStats: input.weaponStats ?? null,
    toolStats: input.toolStats ?? null,
    apparelStats: input.apparelStats ?? null,
    placementStats: input.placementStats ?? null,
    trinketStats: input.trinketStats ?? null,
    hatStats: input.hatStats ?? null,
    footwearStats: input.footwearStats ?? null,
    furnitureStats: input.furnitureStats ?? null,
  } satisfies ItemWorkspaceEntry
}

export function createRecipeEntryIndex(content: string, kind: ItemRecipeKind) {
  const parsed = JSON.parse(content) as Record<string, string>

  return Object.entries(parsed)
    .map(([key, rawValue]): ItemRecipeEntry | null => {
      const segments = rawValue.split('/')
      const outputItemId = trimString(segments[2]) ?? key
      const outputIsBigCraftable = kind === 'crafting' ? segments[4]?.trim().toLowerCase() === 'true' : false
      const outputQualifiedItemId = getQualifiedItemId(outputIsBigCraftable ? 'big-craftable' : 'object', outputItemId)

      if (!outputQualifiedItemId) {
        return null
      }

      return {
        key: `${kind}:${key}`,
        displayName: key,
        kind,
        ingredients: parseIngredients(segments[0] ?? ''),
        outputQualifiedItemId,
        outputCount: Math.max(1, parseNumber(segments[3], 1)),
        outputIsBigCraftable,
        unlockType: parseRecipeUnlock(segments[1] ?? '').unlockType,
        unlockLabel: parseRecipeUnlock(segments[1] ?? '').unlockLabel,
      }
    })
    .filter((entry): entry is ItemRecipeEntry => entry != null)
}

export function createObjectEntryIndex(content: string) {
  const parsed = JSON.parse(content) as Record<string, RawObjectDataEntry>

  return Object.entries(parsed).map(([itemId, entry]) =>
    createBaseEntry({
      kind: 'object',
      itemId,
      rawDisplayName: trimString(entry.DisplayName) ?? trimString(entry.Name) ?? itemId,
      rawDescription: trimString(entry.Description),
      internalName: trimString(entry.Name) ?? itemId,
      category: entry.Category ?? null,
      rawType: trimString(entry.Type),
      kindMetaLabel: trimString(entry.Type),
      textureAssetName: normalizeAssetName(entry.Texture) ?? 'Maps/springobjects',
      spriteIndex: entry.SpriteIndex ?? null,
      price: entry.Price ?? null,
      salePrice: entry.Price ?? null,
      edibility: entry.Edibility ?? null,
      isDrink: Boolean(entry.IsDrink),
      canBeGivenAsGift: entry.CanBeGivenAsGift ?? true,
      canBeTrashed: entry.CanBeTrashed ?? true,
      searchParts: [itemId, entry.Name, entry.DisplayName, entry.Description, entry.Type, entry.Category, ...(entry.ContextTags ?? [])],
      contextTags: entry.ContextTags ?? [],
      customFields: entry.CustomFields ?? {},
      objectStats: {
        colorOverlayFromNextIndex: Boolean(entry.ColorOverlayFromNextIndex),
        buffs: createObjectBuffs(entry.Buffs),
        geodeDropsDefaultItems: Boolean(entry.GeodeDropsDefaultItems),
        geodeDrops: createObjectGeodeDrops(entry.GeodeDrops),
        artifactSpotChances: normalizeNumberRecord(entry.ArtifactSpotChances),
        excludeFromFishingCollection: Boolean(entry.ExcludeFromFishingCollection),
        excludeFromShippingCollection: Boolean(entry.ExcludeFromShippingCollection),
        excludeFromRandomSale: Boolean(entry.ExcludeFromRandomSale),
      },
    }),
  )
}

export function createBigCraftableEntryIndex(content: string) {
  const parsed = JSON.parse(content) as Record<string, RawBigCraftableDataEntry>

  return Object.entries(parsed).map(([itemId, entry]) =>
    createBaseEntry({
      kind: 'big-craftable',
      itemId,
      rawDisplayName: trimString(entry.DisplayName) ?? trimString(entry.Name) ?? itemId,
      rawDescription: trimString(entry.Description),
      internalName: trimString(entry.Name) ?? itemId,
      textureAssetName: normalizeAssetName(entry.Texture) ?? 'TileSheets/Craftables',
      spriteIndex: entry.SpriteIndex ?? null,
      price: entry.Price ?? null,
      salePrice: entry.Price ?? null,
      searchParts: [itemId, entry.Name, entry.DisplayName, entry.Description, ...(entry.ContextTags ?? [])],
      contextTags: entry.ContextTags ?? [],
      customFields: entry.CustomFields ?? {},
      placementStats: {
        fragility: entry.Fragility ?? 0,
        canBePlacedOutdoors: Boolean(entry.CanBePlacedOutdoors),
        canBePlacedIndoors: Boolean(entry.CanBePlacedIndoors),
        isLamp: Boolean(entry.IsLamp),
      },
    }),
  )
}

export function createWeaponEntryIndex(content: string) {
  const parsed = JSON.parse(content) as Record<string, RawWeaponDataEntry>

  return Object.entries(parsed).map(([itemId, entry]) =>
    createBaseEntry({
      kind: 'weapon',
      itemId,
      rawDisplayName: trimString(entry.DisplayName) ?? trimString(entry.Name) ?? itemId,
      rawDescription: trimString(entry.Description),
      internalName: trimString(entry.Name) ?? itemId,
      rawType: entry.Type != null ? String(entry.Type) : null,
      kindMetaLabel: entry.Type != null ? `Type ${entry.Type}` : null,
      textureAssetName: normalizeAssetName(entry.Texture) ?? 'TileSheets/weapons',
      spriteIndex: entry.SpriteIndex ?? null,
      searchParts: [itemId, entry.Name, entry.DisplayName, entry.Description, entry.Type],
      customFields: entry.CustomFields ?? {},
      weaponStats: {
        minDamage: entry.MinDamage ?? 0,
        maxDamage: entry.MaxDamage ?? 0,
        knockback: entry.Knockback ?? 0,
        speed: entry.Speed ?? 0,
        precision: entry.Precision ?? 0,
        defense: entry.Defense ?? 0,
        critChance: entry.CritChance ?? 0,
        critMultiplier: entry.CritMultiplier ?? 0,
        mineBaseLevel: entry.MineBaseLevel ?? 0,
        mineMinLevel: entry.MineMinLevel ?? 0,
        areaOfEffect: entry.AreaOfEffect ?? 0,
      },
    }),
  )
}

export function createToolEntryIndex(content: string) {
  const parsed = JSON.parse(content) as Record<string, RawToolDataEntry>

  return Object.entries(parsed).map(([itemId, entry]) =>
    createBaseEntry({
      kind: 'tool',
      itemId,
      rawDisplayName: trimString(entry.DisplayName) ?? trimString(entry.Name) ?? itemId,
      rawDescription: trimString(entry.Description),
      internalName: trimString(entry.Name) ?? itemId,
      rawType: trimString(entry.ClassName),
      kindMetaLabel: trimString(entry.ClassName),
      textureAssetName: normalizeAssetName(entry.Texture) ?? 'TileSheets/tools',
      spriteIndex: entry.SpriteIndex ?? null,
      menuSpriteIndex: entry.MenuSpriteIndex ?? entry.SpriteIndex ?? null,
      price: entry.SalePrice ?? null,
      salePrice: entry.SalePrice ?? null,
      searchParts: [itemId, entry.Name, entry.DisplayName, entry.Description, entry.ClassName],
      customFields: entry.CustomFields ?? {},
      toolStats: {
        className: trimString(entry.ClassName),
        attachmentSlots: entry.AttachmentSlots ?? 0,
        upgradeLevel: entry.UpgradeLevel ?? 0,
        conventionalUpgradeFrom: trimString(entry.ConventionalUpgradeFrom),
        upgrades: entry.UpgradeFrom ?? [],
      },
    }),
  )
}

export function createShirtEntryIndex(content: string) {
  const parsed = JSON.parse(content) as Record<string, RawShirtDataEntry>

  return Object.entries(parsed).map(([itemId, entry]) =>
    createBaseEntry({
      kind: 'shirt',
      itemId,
      rawDisplayName: trimString(entry.DisplayName) ?? trimString(entry.Name) ?? itemId,
      rawDescription: trimString(entry.Description),
      internalName: trimString(entry.Name) ?? itemId,
      textureAssetName: normalizeAssetName(entry.Texture) ?? 'Characters/Farmer/shirts',
      spriteIndex: entry.SpriteIndex ?? null,
      price: entry.Price ?? null,
      salePrice: entry.Price ?? null,
      searchParts: [itemId, entry.Name, entry.DisplayName, entry.Description, entry.DefaultColor],
      customFields: entry.CustomFields ?? {},
      apparelStats: {
        defaultColor: trimString(entry.DefaultColor),
        canBeDyed: Boolean(entry.CanBeDyed),
        isPrismatic: Boolean(entry.IsPrismatic),
        hasSleeves: entry.HasSleeves ?? null,
        canChooseDuringCharacterCustomization: Boolean(entry.CanChooseDuringCharacterCustomization),
      },
    }),
  )
}

export function createPantsEntryIndex(content: string) {
  const parsed = JSON.parse(content) as Record<string, RawPantsDataEntry>

  return Object.entries(parsed).map(([itemId, entry]) =>
    createBaseEntry({
      kind: 'pants',
      itemId,
      rawDisplayName: trimString(entry.DisplayName) ?? trimString(entry.Name) ?? itemId,
      rawDescription: trimString(entry.Description),
      internalName: trimString(entry.Name) ?? itemId,
      textureAssetName: normalizeAssetName(entry.Texture) ?? 'Characters/Farmer/pants',
      spriteIndex: entry.SpriteIndex ?? null,
      price: entry.Price ?? null,
      salePrice: entry.Price ?? null,
      searchParts: [itemId, entry.Name, entry.DisplayName, entry.Description, entry.DefaultColor],
      customFields: entry.CustomFields ?? {},
      apparelStats: {
        defaultColor: trimString(entry.DefaultColor),
        canBeDyed: Boolean(entry.CanBeDyed),
        isPrismatic: Boolean(entry.IsPrismatic),
        hasSleeves: null,
        canChooseDuringCharacterCustomization: Boolean(entry.CanChooseDuringCharacterCustomization),
      },
    }),
  )
}

export function createTrinketEntryIndex(content: string) {
  const parsed = JSON.parse(content) as Record<string, RawTrinketDataEntry>

  return Object.entries(parsed).map(([itemId, entry]) =>
    createBaseEntry({
      kind: 'trinket',
      itemId,
      rawDisplayName: trimString(entry.DisplayName) ?? itemId,
      rawDescription: trimString(entry.Description),
      internalName: itemId,
      rawType: trimString(entry.TrinketEffectClass),
      kindMetaLabel: trimString(entry.TrinketEffectClass),
      textureAssetName: normalizeAssetName(entry.Texture) ?? 'TileSheets/Objects_2',
      spriteIndex: entry.SheetIndex ?? null,
      searchParts: [itemId, entry.DisplayName, entry.Description, entry.TrinketEffectClass],
      customFields: entry.CustomFields ?? {},
      trinketStats: {
        effectClass: trimString(entry.TrinketEffectClass),
        dropsNaturally: Boolean(entry.DropsNaturally),
        canBeReforged: Boolean(entry.CanBeReforged),
      },
    }),
  )
}

export function createHatEntryIndex(content: string) {
  const parsed = JSON.parse(content) as Record<string, string>

  return Object.entries(parsed).map(([itemId, rawValue]) => {
    const segments = rawValue.split('/')
    const rawHairDraw = segments[2]?.trim().toLowerCase() ?? ''
    const hairDrawMode: NonNullable<ItemWorkspaceEntry['hatStats']>['hairDrawMode'] =
      rawHairDraw === 'hide' ? 'hide' : rawHairDraw === 'true' ? 'normal' : 'cover'

    return createBaseEntry({
      kind: 'hat',
      itemId,
      rawDisplayName: trimString(segments[5]) ?? trimString(segments[0]) ?? itemId,
      rawDescription: trimString(segments[1]),
      internalName: trimString(segments[0]) ?? itemId,
      rawType: 'hat',
      kindMetaLabel: 'Hat',
      textureAssetName: 'Characters/Farmer/hats',
      spriteIndex: parseNumber(itemId, Number.NaN),
      spriteWidth: 20,
      spriteHeight: 20,
      searchParts: [itemId, ...segments],
      hatStats: {
        hairDrawMode,
        ignoreHairstyleOffset: (segments[3]?.trim().toLowerCase() ?? '') === 'true',
        skipHairDraw: rawHairDraw === 'true' || rawHairDraw === 'hide',
        customColor: trimString(segments[4]),
      },
    })
  })
}

export function createBootsEntryIndex(content: string) {
  const parsed = JSON.parse(content) as Record<string, string>

  return Object.entries(parsed).map(([itemId, rawValue]) => {
    const segments = rawValue.split('/')

    return createBaseEntry({
      kind: 'boots',
      itemId,
      rawDisplayName: trimString(segments[6]) ?? trimString(segments[0]) ?? itemId,
      rawDescription: trimString(segments[1]),
      internalName: trimString(segments[0]) ?? itemId,
      rawType: 'boots',
      kindMetaLabel: 'Boots',
      textureAssetName: 'Maps/springobjects',
      spriteIndex: parseNumber(itemId, Number.NaN),
      price: parseNumber(segments[2], 0),
      salePrice: parseNumber(segments[2], 0),
      searchParts: [itemId, ...segments],
      footwearStats: {
        defense: parseNumber(segments[3], 0),
        immunity: parseNumber(segments[4], 0),
        colorIndex: Number.isFinite(parseNumber(segments[5], Number.NaN)) ? parseNumber(segments[5], Number.NaN) : null,
      },
    })
  })
}

export function createFurnitureEntryIndex(content: string) {
  const parsed = JSON.parse(content) as Record<string, string>

  return Object.entries(parsed).map(([itemId, rawValue]) => {
    const segments = rawValue.split('/')
    const rawType = trimString(segments[1])
    const sourceSize = parseTileSize(segments[2]) ?? getDefaultFurnitureSourceSize(rawType)
    const boundingSize = parseTileSize(segments[3]) ?? getDefaultFurnitureBoundingSize(rawType)
    const explicitSpriteIndex = parseNumber(segments[8], Number.NaN)
    const explicitTexture = normalizeAssetName(segments[9])

    return createBaseEntry({
      kind: 'furniture',
      itemId,
      rawDisplayName: trimString(segments[7]) ?? trimString(segments[0]) ?? itemId,
      rawDescription: null,
      internalName: trimString(segments[0]) ?? itemId,
      rawType,
      kindMetaLabel: rawType,
      textureAssetName: explicitTexture ?? 'TileSheets/furniture',
      spriteIndex: Number.isFinite(explicitSpriteIndex) ? explicitSpriteIndex : parseNumber(itemId, Number.NaN),
      price: parseNumber(segments[5], 0),
      salePrice: parseNumber(segments[5], 0),
      spriteWidth: sourceSize.width * 16,
      spriteHeight: sourceSize.height * 16,
      searchParts: [itemId, ...segments],
      furnitureStats: {
        furnitureType: rawType,
        rotations: parseNumber(segments[4], 1),
        sourceSize,
        boundingSize,
      },
    })
  })
}

export function createItemEntryLookup(entries: ItemWorkspaceEntry[]) {
  return new Map(entries.map((entry) => [entry.qualifiedItemId, entry] as const))
}

export function getAllTextureAssetNames(entries: ItemWorkspaceEntry[]) {
  return Array.from(new Set(entries.map((entry) => entry.textureAssetName).filter((value): value is string => Boolean(value))))
}

export function hydrateItemRelations(
  entries: ItemWorkspaceEntry[],
  recipes: ItemRecipeEntry[],
  cropsContent: string | null,
  fishContent: string | null,
  locationsContent: string | null,
  shopsContent: string | null,
  machinesContent: string | null,
  fishPondContent: string | null,
) {
  const nextEntries = new Map<string, ItemWorkspaceEntry>(
    entries.map((entry) => [
      entry.qualifiedItemId,
      {
        ...entry,
        cropHarvests: [...entry.cropHarvests],
        fishCatchLocations: [...entry.fishCatchLocations],
        recipesProduced: [...entry.recipesProduced],
        recipesUsing: [...entry.recipesUsing],
        shopEntries: [...entry.shopEntries],
        shopRecipeEntries: [...entry.shopRecipeEntries],
        machineOutputs: [...entry.machineOutputs],
        machineInputs: [...entry.machineInputs],
        artifactSpotSources: [...entry.artifactSpotSources],
        forageSources: [...entry.forageSources],
        fishPondSources: [...entry.fishPondSources],
      },
    ]),
  )
  const entryById = createItemEntryLookup(entries)

  for (const recipe of recipes) {
    const outputEntry = nextEntries.get(recipe.outputQualifiedItemId)
    if (outputEntry) {
      outputEntry.recipesProduced.push(recipe)
    }

    for (const ingredient of recipe.ingredients) {
      if (!ingredient.qualifiedItemId) {
        continue
      }

      const ingredientEntry = nextEntries.get(ingredient.qualifiedItemId)
      if (ingredientEntry) {
        ingredientEntry.recipesUsing.push(recipe)
      }
    }
  }

  if (cropsContent) {
    const parsedCrops = JSON.parse(cropsContent) as Record<string, RawCropDataEntry>
    for (const [seedId, crop] of Object.entries(parsedCrops)) {
      const seedQualifiedItemId = getQualifiedItemId('object', seedId)
      const harvestQualifiedItemId = normalizeQualifiedItemId(crop.HarvestItemId, 'object')
      const seedEntry = nextEntries.get(seedQualifiedItemId)
      const harvestEntry = harvestQualifiedItemId ? nextEntries.get(harvestQualifiedItemId) : null
      if (!seedEntry || !harvestQualifiedItemId) {
        continue
      }

      const cropEntry = {
        seedQualifiedItemId,
        seedDisplayName: seedEntry.displayName,
        harvestQualifiedItemId,
        harvestDisplayName: harvestEntry?.displayName ?? crop.HarvestItemId ?? harvestQualifiedItemId,
        seasons: crop.Seasons ?? [],
        daysInPhase: crop.DaysInPhase ?? [],
        totalGrowthDays: (crop.DaysInPhase ?? []).reduce((total, value) => total + value, 0),
        regrowDays: crop.RegrowDays ?? 0,
        isRaised: Boolean(crop.IsRaised),
        isPaddyCrop: Boolean(crop.IsPaddyCrop),
        needsWatering: crop.NeedsWatering ?? true,
        harvestMinStack: crop.HarvestMinStack ?? 1,
        harvestMaxStack: crop.HarvestMaxStack ?? 1,
        extraHarvestChance: crop.ExtraHarvestChance ?? 0,
        harvestMethod: String(crop.HarvestMethod ?? 'Grab'),
      } satisfies ItemCropEntry

      seedEntry.cropData = cropEntry
      if (harvestEntry) {
        harvestEntry.cropHarvests.push(cropEntry)
      }
    }
  }

  if (fishContent) {
    const parsedFish = JSON.parse(fishContent) as Record<string, string>
    for (const [itemId, rawValue] of Object.entries(parsedFish)) {
      const entry = nextEntries.get(getQualifiedItemId('object', itemId))
      if (entry) {
        entry.fishData = parseFishDataEntry(rawValue)
      }
    }
  }

  if (locationsContent) {
    const parsedLocations = JSON.parse(locationsContent) as Record<string, RawLocationDataEntry>
    for (const [locationName, location] of Object.entries(parsedLocations)) {
      const locationDisplayName = trimString(location.DisplayName) ?? locationName

      for (const source of location.Fish ?? []) {
        for (const rawId of [source.ItemId, ...(source.RandomItemId ?? [])]) {
          const qualifiedItemId = normalizeQualifiedItemId(rawId, 'object')
          const entry = qualifiedItemId ? nextEntries.get(qualifiedItemId) : null
          if (entry) {
            entry.fishCatchLocations.push({
              locationName,
              locationDisplayName,
              season: trimString(source.Season),
              chance: source.Chance ?? null,
              minFishingLevel: source.MinFishingLevel ?? 0,
              minDistanceFromShore: source.MinDistanceFromShore ?? 0,
              maxDistanceFromShore:
                source.MaxDistanceFromShore != null && source.MaxDistanceFromShore >= 0 ? source.MaxDistanceFromShore : null,
              fishAreaId: trimString(source.FishAreaId),
              condition: trimString(source.Condition),
            })
          }
        }
      }

      for (const source of location.Forage ?? []) {
        for (const rawId of [source.ItemId, ...(source.RandomItemId ?? [])]) {
          const qualifiedItemId = normalizeQualifiedItemId(rawId, 'object')
          const entry = qualifiedItemId ? nextEntries.get(qualifiedItemId) : null
          if (entry) {
            entry.forageSources.push({
              locationName,
              locationDisplayName,
              season: trimString(source.Season),
              chance: source.Chance ?? null,
              condition: trimString(source.Condition),
            })
          }
        }
      }

      for (const source of location.ArtifactSpots ?? []) {
        for (const rawId of [source.ItemId, ...(source.RandomItemId ?? [])]) {
          const qualifiedItemId = normalizeQualifiedItemId(rawId, 'object')
          const entry = qualifiedItemId ? nextEntries.get(qualifiedItemId) : null
          if (entry) {
            entry.artifactSpotSources.push({
              locationName,
              locationDisplayName,
              season: null,
              chance: source.Chance ?? null,
              condition: trimString(source.Condition),
            })
          }
        }
      }
    }
  }

  if (shopsContent) {
    const parsedShops = JSON.parse(shopsContent) as Record<string, RawShopDataEntry>
    for (const [shopId, shop] of Object.entries(parsedShops)) {
      const ownerLabels = (shop.Owners ?? [])
        .map((owner) => trimString(owner.Name) ?? trimString(owner.Id))
        .filter((value): value is string => Boolean(value))

      for (const item of shop.Items ?? []) {
        for (const rawId of [item.ItemId, ...(item.RandomItemId ?? [])]) {
          const qualifiedItemId = normalizeQualifiedItemId(rawId, 'object')
          const entry = qualifiedItemId ? nextEntries.get(qualifiedItemId) : null
          if (!entry) {
            continue
          }

          const source = {
            shopId,
            ownerLabels,
            price: item.Price ?? null,
            tradeItemQualifiedId: normalizeQualifiedItemId(item.TradeItemId, 'object'),
            tradeItemAmount: item.TradeItemAmount ?? 0,
            availableStock: item.AvailableStock ?? null,
            availableStockLimit: item.AvailableStockLimit != null ? String(item.AvailableStockLimit) : null,
            usesObjectDataPrice: Boolean(item.UseObjectDataPrice),
            isRecipe: Boolean(item.IsRecipe),
            condition: trimString(item.Condition),
          } satisfies ItemShopEntry

          if (source.isRecipe) {
            entry.shopRecipeEntries.push(source)
          } else {
            entry.shopEntries.push(source)
          }
        }
      }
    }
  }

  if (machinesContent) {
    const parsedMachines = JSON.parse(machinesContent) as Record<string, RawMachineDataEntry>
    for (const [machineId, machine] of Object.entries(parsedMachines)) {
      const machineQualifiedItemId =
        [normalizeQualifiedItemId(machineId, 'big-craftable'), normalizeQualifiedItemId(machineId, 'object')].find(
          (candidate): candidate is string => Boolean(candidate && nextEntries.has(candidate)),
        ) ?? null
      const machineDisplayName = machineQualifiedItemId ? (entryById.get(machineQualifiedItemId)?.displayName ?? machineId) : machineId

      for (const rule of machine.OutputRules ?? []) {
        for (const output of rule.OutputItem ?? []) {
          const outputQualifiedItemId = normalizeQualifiedItemId(output.ItemId, 'object')
          if (!outputQualifiedItemId) {
            continue
          }

          for (const trigger of rule.Triggers ?? []) {
            const link = {
              machineQualifiedItemId,
              machineDisplayName,
              machineRuleId: trimString(rule.Id),
              triggerLabel: trimString(trigger.Trigger != null ? String(trigger.Trigger) : null) ?? 'ItemPlacedInMachine',
              requiredItemQualifiedId: normalizeQualifiedItemId(trigger.RequiredItemId, 'object'),
              requiredItemCount: trigger.RequiredCount ?? 1,
              requiredTags: trigger.RequiredTags ?? [],
              outputItemQualifiedId: outputQualifiedItemId,
              outputCount: Math.max(1, output.MaxStack ?? output.MinStack ?? 1),
              minutesUntilReady: rule.MinutesUntilReady ?? 0,
              daysUntilReady: rule.DaysUntilReady ?? 0,
              condition: trimString(trigger.Condition),
            } satisfies ItemMachineLink

            const outputEntry = nextEntries.get(outputQualifiedItemId)
            if (outputEntry) {
              outputEntry.machineOutputs.push(link)
            }

            if (link.requiredItemQualifiedId) {
              const inputEntry = nextEntries.get(link.requiredItemQualifiedId)
              if (inputEntry) {
                inputEntry.machineInputs.push(link)
              }
            }
          }
        }
      }
    }
  }

  if (fishPondContent) {
    const parsedFishPonds = JSON.parse(fishPondContent) as RawFishPondDataEntry[] | Record<string, RawFishPondDataEntry>
    const pondEntries = Array.isArray(parsedFishPonds)
      ? parsedFishPonds
          .map((pond) => [trimString(pond.Id), pond] as const)
          .filter((entry): entry is [string, RawFishPondDataEntry] => Boolean(entry[0]))
      : Object.entries(parsedFishPonds)

    for (const [pondId, pond] of pondEntries) {
      const pondQualifiedItemId = normalizeQualifiedItemId(pondId, 'object')
      const pondEntry = pondQualifiedItemId ? nextEntries.get(pondQualifiedItemId) : null
      if (pondEntry) {
        pondEntry.fishPondProfile = {
          requiredTags: pond.RequiredTags ?? [],
          maxPopulation: pond.MaxPopulation ?? 0,
          spawnTime: pond.SpawnTime ?? 0,
          populationGateKeys: Object.keys(pond.PopulationGates ?? {})
            .map((value) => parseNumber(value, Number.NaN))
            .filter((value) => Number.isFinite(value)),
          producedItemCount: (pond.ProducedItems ?? []).length,
        }
      }

      for (const reward of pond.ProducedItems ?? []) {
        for (const rawId of [reward.ItemId, ...(reward.RandomItemId ?? [])]) {
          const outputQualifiedItemId = normalizeQualifiedItemId(rawId, 'object')
          const outputEntry = outputQualifiedItemId ? nextEntries.get(outputQualifiedItemId) : null
          if (outputEntry) {
            outputEntry.fishPondSources.push({
              pondItemQualifiedId: pondQualifiedItemId,
              pondItemDisplayName: pondEntry?.displayName ?? pondId,
              requiredTags: pond.RequiredTags ?? [],
              requiredPopulation: reward.RequiredPopulation ?? 0,
              chance: reward.Chance ?? null,
              minStack: reward.MinStack ?? 1,
              maxStack: reward.MaxStack ?? reward.MinStack ?? 1,
              condition: trimString(reward.Condition),
            })
          }
        }
      }
    }
  }

  return Array.from(nextEntries.values())
}
