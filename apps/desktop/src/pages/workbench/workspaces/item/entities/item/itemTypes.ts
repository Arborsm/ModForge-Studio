export type RawToolUpgradeEntry = {
  Condition?: string | null
  Price?: number | null
  RequireToolId?: string | null
  TradeItemId?: string | null
  TradeItemAmount?: number | null
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

/** Normalized Stardew ObjectData buff stat deltas used by object inspectors without exposing raw PascalCase fields. */
export type ItemObjectBuffAttributes = {
  combatLevel: number
  farmingLevel: number
  fishingLevel: number
  miningLevel: number
  luckLevel: number
  foragingLevel: number
  maxStamina: number
  magneticRadius: number
  speed: number
  defense: number
  attack: number
  attackMultiplier: number
  immunity: number
  knockbackMultiplier: number
  weaponSpeedMultiplier: number
  criticalChanceMultiplier: number
  criticalPowerMultiplier: number
  weaponPrecisionMultiplier: number
}

/** Quantity modifier attached to generated object drops; values are kept structured for future rule editors. */
export type ItemQuantityModifier = {
  id: string | null
  condition: string | null
  modification: string | number | null
  amount: number
  randomAmount: number[]
}

/** ObjectData Buffs entry preserved from edible/drink objects, including icon metadata and custom fields. */
export type ItemObjectBuff = {
  id: string | null
  buffId: string | null
  iconTexture: string | null
  iconSpriteIndex: number
  duration: number
  isDebuff: boolean
  glowColor: string | null
  customAttributes: ItemObjectBuffAttributes
  customFields: Record<string, string>
}

/** ObjectData GeodeDrops entry with generic spawn fields plus geode-specific condition and precedence data. */
export type ItemObjectGeodeDrop = {
  id: string | null
  itemId: string | null
  randomItemIds: string[]
  maxItems: number | null
  minStack: number
  maxStack: number
  quality: number
  objectInternalName: string | null
  objectDisplayName: string | null
  objectColor: string | null
  toolUpgradeLevel: number
  isRecipe: boolean
  stackModifiers: ItemQuantityModifier[]
  stackModifierMode: string | number | null
  qualityModifiers: ItemQuantityModifier[]
  qualityModifierMode: string | number | null
  modData: Record<string, string>
  perItemCondition: string | null
  condition: string | null
  chance: number
  setFlagOnPickup: string | null
  precedence: number
}

/** Object-only Stardew fields that do not apply to other item kinds but must survive catalog normalization. */
export type ItemObjectStats = {
  colorOverlayFromNextIndex: boolean
  buffs: ItemObjectBuff[]
  geodeDropsDefaultItems: boolean
  geodeDrops: ItemObjectGeodeDrop[]
  artifactSpotChances: Record<string, number>
  excludeFromFishingCollection: boolean
  excludeFromShippingCollection: boolean
  excludeFromRandomSale: boolean
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
  objectStats: ItemObjectStats | null
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
