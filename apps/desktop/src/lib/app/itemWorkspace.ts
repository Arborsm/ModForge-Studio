import {
  getClothingPantsMenuSourceRect,
  getClothingShirtMenuMaskSourceRect,
  getClothingShirtMenuSourceRect,
} from './clothingSprites'
export { buildGameContentPath } from './contentPaths'

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
  Edibility?: number | null
  IsDrink?: boolean | null
  CanBeGivenAsGift?: boolean | null
  CanBeTrashed?: boolean | null
  ContextTags?: string[] | null
  CustomFields?: Record<string, string> | null
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

type RawToolUpgradeEntry = {
  Condition?: string | null
  Price?: number | null
  RequireToolId?: string | null
  TradeItemId?: string | null
  TradeItemAmount?: number | null
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
  ItemId?: string | null
  RandomItemId?: string[] | null
  MinStack?: number | null
  MaxStack?: number | null
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

export type ItemKind = 'object' | 'big-craftable' | 'weapon' | 'tool' | 'shirt' | 'pants' | 'trinket' | 'hat' | 'boots' | 'furniture'
export type ItemRecipeKind = 'crafting' | 'cooking'
export type ItemBrowseCategory = 'all' | 'mineral' | 'cooking' | 'fish' | 'crop' | 'equipment' | 'apparel' | 'furniture' | 'crafting'

export type ItemTextureAssetState = {
  path: string | null
  url: string | null
  width: number | null
  height: number | null
}

export type ItemIngredient = {
  key: string
  kind: 'item' | 'category'
  qualifiedItemId: string | null
  displayName: string
  amount: number
  category: number | null
}

export type ItemRecipeEntry = {
  key: string
  displayName: string
  kind: ItemRecipeKind
  ingredients: ItemIngredient[]
  outputQualifiedItemId: string
  outputCount: number
  outputIsBigCraftable: boolean
  unlockType: 'default' | 'home' | 'skill' | 'friendship' | 'other'
  unlockLabel: string
}

export type ItemCropEntry = {
  seedQualifiedItemId: string
  seedDisplayName: string
  harvestQualifiedItemId: string
  harvestDisplayName: string
  seasons: string[]
  daysInPhase: number[]
  totalGrowthDays: number
  regrowDays: number
  isRaised: boolean
  isPaddyCrop: boolean
  needsWatering: boolean
  harvestMinStack: number
  harvestMaxStack: number
  extraHarvestChance: number
  harvestMethod: string
}

export type ItemFishCatchLocation = {
  locationName: string
  locationDisplayName: string
  season: string | null
  chance: number | null
  minFishingLevel: number
  minDistanceFromShore: number
  maxDistanceFromShore: number | null
  fishAreaId: string | null
  condition: string | null
}

export type ItemFishData = {
  difficulty: number | null
  behavior: string | null
  minSize: number | null
  maxSize: number | null
  timeSpans: Array<{ start: number; end: number }>
  seasons: string[]
  weather: string | null
  maxDepth: number | null
  chance: number | null
  depthMultiplier: number | null
  minFishingLevel: number
  isTutorialFish: boolean
}

export type ItemShopEntry = {
  shopId: string
  ownerLabels: string[]
  price: number | null
  tradeItemQualifiedId: string | null
  tradeItemAmount: number
  availableStock: number | null
  availableStockLimit: string | null
  usesObjectDataPrice: boolean
  isRecipe: boolean
  condition: string | null
}

export type ItemMachineLink = {
  machineQualifiedItemId: string | null
  machineDisplayName: string
  machineRuleId: string | null
  triggerLabel: string
  requiredItemQualifiedId: string | null
  requiredItemCount: number
  requiredTags: string[]
  outputItemQualifiedId: string | null
  outputCount: number
  minutesUntilReady: number
  daysUntilReady: number
  condition: string | null
}

export type ItemLocationSource = {
  locationName: string
  locationDisplayName: string
  season: string | null
  chance: number | null
  condition: string | null
}

export type ItemFishPondSource = {
  pondItemQualifiedId: string | null
  pondItemDisplayName: string
  requiredTags: string[]
  requiredPopulation: number
  chance: number | null
  minStack: number
  maxStack: number
  condition: string | null
}

export type ItemFishPondProfile = {
  requiredTags: string[]
  maxPopulation: number
  spawnTime: number
  populationGateKeys: number[]
  producedItemCount: number
}

export type ItemGiftTasteNpc = {
  internalName: string
  displayName: string
  taste: 'love' | 'like'
}

export type ItemWorkspaceEntry = {
  key: string
  qualifiedItemId: string
  itemId: string
  rawDisplayName: string
  displayName: string
  rawDescription: string | null
  description: string | null
  internalName: string
  kind: ItemKind
  category: number | null
  rawType: string | null
  kindMetaLabel: string | null
  textureAssetName: string | null
  texturePathLabel: string
  spriteIndex: number | null
  menuSpriteIndex: number | null
  spriteWidth: number
  spriteHeight: number
  price: number | null
  salePrice: number | null
  edibility: number | null
  isDrink: boolean
  canBeGivenAsGift: boolean
  canBeTrashed: boolean
  searchText: string
  browseCategories: ItemBrowseCategory[]
  categorySearchTokens: string[]
  contextTags: string[]
  customFields: Record<string, string>
  cropData: ItemCropEntry | null
  cropHarvests: ItemCropEntry[]
  fishData: ItemFishData | null
  fishCatchLocations: ItemFishCatchLocation[]
  recipesProduced: ItemRecipeEntry[]
  recipesUsing: ItemRecipeEntry[]
  shopEntries: ItemShopEntry[]
  shopRecipeEntries: ItemShopEntry[]
  machineOutputs: ItemMachineLink[]
  machineInputs: ItemMachineLink[]
  artifactSpotSources: ItemLocationSource[]
  forageSources: ItemLocationSource[]
  fishPondSources: ItemFishPondSource[]
  fishPondProfile: ItemFishPondProfile | null
  lovedBy: ItemGiftTasteNpc[]
  likedBy: ItemGiftTasteNpc[]
  weaponStats: {
    minDamage: number
    maxDamage: number
    knockback: number
    speed: number
    precision: number
    defense: number
    critChance: number
    critMultiplier: number
    mineBaseLevel: number
    mineMinLevel: number
    areaOfEffect: number
  } | null
  toolStats: {
    className: string | null
    attachmentSlots: number
    upgradeLevel: number
    conventionalUpgradeFrom: string | null
    upgrades: RawToolUpgradeEntry[]
  } | null
  apparelStats: {
    defaultColor: string | null
    canBeDyed: boolean
    isPrismatic: boolean
    hasSleeves: boolean | null
    canChooseDuringCharacterCustomization: boolean
  } | null
  placementStats: {
    fragility: number
    canBePlacedOutdoors: boolean
    canBePlacedIndoors: boolean
    isLamp: boolean
  } | null
  trinketStats: {
    effectClass: string | null
    dropsNaturally: boolean
    canBeReforged: boolean
  } | null
  hatStats: {
    hairDrawMode: 'normal' | 'cover' | 'hide'
    ignoreHairstyleOffset: boolean
    skipHairDraw: boolean
    customColor: string | null
  } | null
  footwearStats: {
    defense: number
    immunity: number
    colorIndex: number | null
  } | null
  furnitureStats: {
    furnitureType: string | null
    rotations: number
    sourceSize: { width: number; height: number } | null
    boundingSize: { width: number; height: number } | null
  } | null
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

function getDefaultSpriteMetrics(kind: ItemKind) {
  if (kind === 'big-craftable') {
    return { width: 16, height: 32 }
  }

  if (kind === 'shirt') {
    return { width: 8, height: 8 }
  }

  if (kind === 'hat') {
    return { width: 20, height: 20 }
  }

  return { width: 16, height: 16 }
}

function normalizeSearchParts(parts: Array<string | number | null | undefined>) {
  return parts
    .filter((value): value is string | number => value != null && value !== '')
    .join(' ')
    .toLowerCase()
}

const PINYIN_INITIAL_BOUNDARIES = [
  ['芭', 'b'],
  ['擦', 'c'],
  ['搭', 'd'],
  ['蛾', 'e'],
  ['发', 'f'],
  ['噶', 'g'],
  ['哈', 'h'],
  ['击', 'j'],
  ['喀', 'k'],
  ['垃', 'l'],
  ['妈', 'm'],
  ['拿', 'n'],
  ['哦', 'o'],
  ['啪', 'p'],
  ['期', 'q'],
  ['然', 'r'],
  ['撒', 's'],
  ['塌', 't'],
  ['挖', 'w'],
  ['昔', 'x'],
  ['压', 'y'],
  ['匝', 'z'],
] as const

function getPinyinInitial(char: string) {
  const lower = char.toLowerCase()
  if (/[a-z0-9]/u.test(lower)) {
    return lower
  }

  if (!/[\u4e00-\u9fff]/u.test(char)) {
    return ''
  }

  for (let index = PINYIN_INITIAL_BOUNDARIES.length - 1; index >= 0; index -= 1) {
    const [boundary, initial] = PINYIN_INITIAL_BOUNDARIES[index]
    if (char.localeCompare(boundary, 'zh-CN') >= 0) {
      return initial
    }
  }

  return 'a'
}

function buildInitialism(value: string | null | undefined) {
  const text = value?.trim() ?? ''
  if (!text) {
    return ''
  }

  const parts = text.split(/[\s\-_/\\()]+/u).filter(Boolean)
  const latinInitials = parts.map((part) => part[0]?.toLowerCase() ?? '').join('')
  const cjkInitials = Array.from(text)
    .map((char) => getPinyinInitial(char))
    .join('')

  return [latinInitials, cjkInitials].filter(Boolean).join(' ')
}

export function buildItemSearchAliases(...values: Array<string | null | undefined>) {
  return values
    .flatMap((value) => {
      const trimmed = value?.trim() ?? ''
      if (!trimmed) {
        return []
      }

      const compact = trimmed.replace(/[\s\-_/\\()]+/gu, '').toLowerCase()
      const initialism = buildInitialism(trimmed)
      return [compact, initialism].filter(Boolean)
    })
    .join(' ')
    .toLowerCase()
}

export function getQualifiedItemId(kind: ItemKind, itemId: string) {
  const normalizedId = itemId.trim()
  switch (kind) {
    case 'object':
      return `(O)${normalizedId}`
    case 'big-craftable':
      return `(BC)${normalizedId}`
    case 'weapon':
      return `(W)${normalizedId}`
    case 'tool':
      return `(T)${normalizedId}`
    case 'shirt':
      return `(S)${normalizedId}`
    case 'pants':
      return `(P)${normalizedId}`
    case 'trinket':
      return `(TR)${normalizedId}`
    case 'hat':
      return `(H)${normalizedId}`
    case 'boots':
      return `(B)${normalizedId}`
    case 'furniture':
      return `(F)${normalizedId}`
  }
}

export function normalizeQualifiedItemId(value: string | null | undefined, fallbackKind: ItemKind = 'object') {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) {
    return null
  }

  if (/^\([A-Za-z]+\).+/u.test(trimmed)) {
    return trimmed
  }

  return getQualifiedItemId(fallbackKind, trimmed)
}

export function getItemKindLabel(kind: ItemKind) {
  switch (kind) {
    case 'object':
      return 'Object'
    case 'big-craftable':
      return 'Big Craftable'
    case 'weapon':
      return 'Weapon'
    case 'tool':
      return 'Tool'
    case 'shirt':
      return 'Shirt'
    case 'pants':
      return 'Pants'
    case 'trinket':
      return 'Trinket'
    case 'hat':
      return 'Hat'
    case 'boots':
      return 'Boots'
    case 'furniture':
      return 'Furniture'
  }
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
  const defaultMetrics = getDefaultSpriteMetrics(input.kind)

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

export function getItemSpriteMetrics(entry: Pick<ItemWorkspaceEntry, 'kind' | 'spriteWidth' | 'spriteHeight'>) {
  return {
    width: entry.spriteWidth || getDefaultSpriteMetrics(entry.kind).width,
    height: entry.spriteHeight || getDefaultSpriteMetrics(entry.kind).height,
  }
}

export function getItemSpriteSourceRect(
  entry: Pick<ItemWorkspaceEntry, 'kind' | 'spriteIndex' | 'menuSpriteIndex' | 'spriteWidth' | 'spriteHeight'>,
  textureState: Pick<ItemTextureAssetState, 'width'> | null,
) {
  const spriteIndex = entry.menuSpriteIndex ?? entry.spriteIndex
  if (spriteIndex == null || !textureState?.width) {
    return null
  }

  const metrics = getItemSpriteMetrics(entry)
  if (entry.kind === 'shirt') {
    return getClothingShirtMenuSourceRect(textureState.width, spriteIndex)
  }

  if (entry.kind === 'pants') {
    return getClothingPantsMenuSourceRect(textureState.width, spriteIndex)
  }

  if (entry.kind === 'furniture') {
    const pixelOffset = spriteIndex * 16
    return {
      x: pixelOffset % textureState.width,
      y: Math.floor(pixelOffset / textureState.width) * 16,
      width: metrics.width,
      height: metrics.height,
    }
  }

  const columns = Math.max(1, Math.floor(textureState.width / metrics.width))

  return {
    x: (spriteIndex % columns) * metrics.width,
    y: Math.floor(spriteIndex / columns) * metrics.height,
    width: metrics.width,
    height: metrics.height,
  }
}

export function getItemSpriteTintMaskSourceRect(
  entry: Pick<ItemWorkspaceEntry, 'kind' | 'spriteIndex' | 'menuSpriteIndex' | 'spriteWidth' | 'spriteHeight'>,
  textureState: Pick<ItemTextureAssetState, 'width'> | null,
) {
  const spriteIndex = entry.menuSpriteIndex ?? entry.spriteIndex
  const sourceRect = getItemSpriteSourceRect(entry, textureState)
  if (spriteIndex == null || !sourceRect || !textureState?.width) {
    return null
  }

  if (entry.kind === 'shirt') {
    return getClothingShirtMenuMaskSourceRect(textureState.width, spriteIndex)
  }

  if (entry.kind === 'pants') {
    return sourceRect
  }

  return null
}

export function getContainedItemSpriteScale(
  entry: Pick<ItemWorkspaceEntry, 'spriteWidth' | 'spriteHeight'>,
  frameSize: number,
  preferredScale: number,
) {
  return Math.min(preferredScale, frameSize / Math.max(1, entry.spriteWidth, entry.spriteHeight))
}

export function getContainedItemSpriteFrame(
  entry: Pick<ItemWorkspaceEntry, 'kind' | 'spriteWidth' | 'spriteHeight'>,
  maxFrameSize: number,
  preferredScale: number,
  padding = 0,
  minFrameSize = 0,
) {
  const metrics = getItemSpriteMetrics(entry)
  const availableWidth = Math.max(1, maxFrameSize - padding * 2)
  const availableHeight = Math.max(1, maxFrameSize - padding * 2)
  const scale = Math.min(preferredScale, availableWidth / metrics.width, availableHeight / metrics.height)
  const width = Math.min(maxFrameSize, Math.max(minFrameSize, Math.round(metrics.width * scale + padding * 2)))
  const height = Math.min(maxFrameSize, Math.max(minFrameSize, Math.round(metrics.height * scale + padding * 2)))

  return {
    scale,
    width,
    height,
  }
}

export function createItemEntryLookup(entries: ItemWorkspaceEntry[]) {
  return new Map(entries.map((entry) => [entry.qualifiedItemId, entry] as const))
}

export function getItemBrowseCategories(entry: Pick<ItemWorkspaceEntry, 'kind' | 'rawType' | 'cropData' | 'cropHarvests' | 'fishData' | 'recipesProduced' | 'contextTags'>) {
  if ('browseCategories' in entry && Array.isArray(entry.browseCategories) && entry.browseCategories.length > 0) {
    return entry.browseCategories
  }

  const categories = new Set<ItemBrowseCategory>(['all'])
  const rawType = (entry.rawType ?? '').toLowerCase()
  const tags = entry.contextTags.map((tag) => tag.toLowerCase())

  if (
    entry.kind === 'object' &&
    (/mineral|gem|arch/iu.test(rawType) || tags.some((tag) => /gem|mineral|artifact/iu.test(tag)))
  ) {
    categories.add('mineral')
  }

  if (entry.kind === 'object' && (rawType === 'cooking' || entry.recipesProduced.some((recipe) => recipe.kind === 'cooking'))) {
    categories.add('cooking')
  }

  if (entry.fishData || /fish/iu.test(rawType) || tags.some((tag) => /fish|ocean|river|lake/iu.test(tag))) {
    categories.add('fish')
  }

  if (entry.cropData || entry.cropHarvests.length > 0 || tags.some((tag) => /crop|seed|vegetable|fruit|flower/iu.test(tag))) {
    categories.add('crop')
  }

  if (entry.kind === 'weapon' || entry.kind === 'tool' || entry.kind === 'boots' || tags.some((tag) => /ring|weapon|tool|equipment/iu.test(tag))) {
    categories.add('equipment')
  }

  if (entry.kind === 'shirt' || entry.kind === 'pants' || entry.kind === 'hat' || entry.kind === 'trinket') {
    categories.add('apparel')
  }

  if (entry.kind === 'furniture') {
    categories.add('furniture')
  }

  if (entry.kind === 'big-craftable' || entry.recipesProduced.some((recipe) => recipe.kind === 'crafting')) {
    categories.add('crafting')
  }

  return Array.from(categories)
}

export function getItemCategorySearchTokens(entry: Pick<ItemWorkspaceEntry, 'kind' | 'rawType' | 'cropData' | 'cropHarvests' | 'fishData' | 'recipesProduced' | 'contextTags'>) {
  if ('categorySearchTokens' in entry && Array.isArray(entry.categorySearchTokens) && entry.categorySearchTokens.length > 0) {
    return entry.categorySearchTokens
  }

  const categories = getItemBrowseCategories(entry)
  const aliases = new Set<string>()

  for (const category of categories) {
    aliases.add(category)
  }

  if (categories.includes('mineral')) {
    aliases.add('minerals')
    aliases.add('mineral')
    aliases.add('矿物')
    aliases.add('宝石')
  }
  if (categories.includes('cooking')) {
    aliases.add('cooking')
    aliases.add('料理')
    aliases.add('食物')
  }
  if (categories.includes('fish')) {
    aliases.add('fish')
    aliases.add('鱼')
    aliases.add('鱼类')
  }
  if (categories.includes('crop')) {
    aliases.add('crop')
    aliases.add('crops')
    aliases.add('作物')
    aliases.add('种子')
  }
  if (categories.includes('equipment')) {
    aliases.add('equipment')
    aliases.add('gear')
    aliases.add('装备')
    aliases.add('工具')
  }
  if (categories.includes('apparel')) {
    aliases.add('apparel')
    aliases.add('clothing')
    aliases.add('服饰')
    aliases.add('帽子')
    aliases.add('靴子')
  }
  if (categories.includes('furniture')) {
    aliases.add('furniture')
    aliases.add('家具')
  }
  if (categories.includes('crafting')) {
    aliases.add('crafting')
    aliases.add('制作')
  }

  return Array.from(aliases).map((token) => token.toLowerCase())
}

export function decorateItemBrowseMetadata(entries: ItemWorkspaceEntry[]) {
  return entries.map((entry) => {
    const browseCategories = getItemBrowseCategories({
      kind: entry.kind,
      rawType: entry.rawType,
      cropData: entry.cropData,
      cropHarvests: entry.cropHarvests,
      fishData: entry.fishData,
      recipesProduced: entry.recipesProduced,
      contextTags: entry.contextTags,
    })
    const categorySearchTokens = getItemCategorySearchTokens({
      kind: entry.kind,
      rawType: entry.rawType,
      cropData: entry.cropData,
      cropHarvests: entry.cropHarvests,
      fishData: entry.fishData,
      recipesProduced: entry.recipesProduced,
      contextTags: entry.contextTags,
    })

    return {
      ...entry,
      browseCategories,
      categorySearchTokens,
    }
  })
}

export function itemMatchesFilter(entry: ItemWorkspaceEntry, rawFilter: string) {
  const filter = rawFilter.trim().toLowerCase()
  if (!filter) {
    return true
  }

  const tokens = filter.split(/\s+/u).filter(Boolean)
  return tokens.every((token) => {
    if (token.startsWith('@')) {
      const needle = token.slice(1)
      return entry.itemId.toLowerCase().includes(needle) || entry.qualifiedItemId.toLowerCase().includes(needle)
    }

    if (token.startsWith('#')) {
      const needle = token.slice(1)
      return getItemCategorySearchTokens(entry).some((candidate) => candidate.includes(needle))
    }

    return entry.searchText.includes(token)
  })
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
