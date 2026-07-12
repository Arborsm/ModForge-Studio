import { Armchair, ChefHat, Fish as FishIcon, Gem, Grid2x2, Shirt, Sprout, Sword, Wrench } from 'lucide-react'
import type { ItemBrowseCategory, ItemMachineLink, ItemRecipeEntry, ItemTextureAssetState, ItemWorkspaceEntry } from '../entities/item'
import type {
  AsideRow,
  AsideSection,
  BrowseTab,
  HeroChip,
  ItemsCopy,
  ObjectDataCard,
  SignalCard,
  SourceCard,
  Tone,
  UseCard,
} from './itemWorkspaceTypes'

const BROWSE_TAB_ORDER: ItemBrowseCategory[] = [
  'all',
  'mineral',
  'cooking',
  'fish',
  'crop',
  'equipment',
  'apparel',
  'furniture',
  'crafting',
]

function formatTime(value: number) {
  const hours = Math.floor(value / 100)
  const minutes = value % 100
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatTimeSpans(timeSpans: Array<{ start: number; end: number }>) {
  return timeSpans.map((span) => `${formatTime(span.start)}-${formatTime(span.end)}`).join(' / ')
}

export function formatPrice(value: number | null | undefined, copy: ItemsCopy) {
  return value != null ? `${value}G` : copy.noneLabel
}

export function formatEdibility(item: ItemWorkspaceEntry, copy: ItemsCopy) {
  if (item.edibility == null) {
    return copy.noneLabel
  }

  return String(item.edibility)
}

function formatBoolean(value: boolean, copy: ItemsCopy) {
  return value ? copy.yesLabel : copy.noLabel
}

function formatChance(value: number, copy: ItemsCopy) {
  if (!Number.isFinite(value)) {
    return copy.noneLabel
  }

  return `${Math.round(value * 1000) / 10}%`
}

function formatItemOutput(itemId: string | null, randomItemIds: string[], copy: ItemsCopy) {
  if (itemId) {
    return itemId
  }
  if (randomItemIds.length) {
    return randomItemIds.join(' / ')
  }
  return copy.noneLabel
}

function getNonZeroAttributeRows(item: ItemWorkspaceEntry, copy: ItemsCopy): AsideRow[] {
  const stats = item.objectStats
  if (!stats) {
    return []
  }

  return stats.buffs.flatMap((buff) =>
    Object.entries(buff.customAttributes).flatMap(([key, value]) =>
      value !== 0
        ? [
            {
              label: `${buff.id ?? copy.buffDataTitle}:${key}`,
              value: String(value),
            },
          ]
        : [],
    ),
  )
}

function getChipToneForEdibility(value: number | null | undefined): Tone {
  if (value == null) {
    return 'neutral'
  }
  if (value < 0) {
    return 'danger'
  }
  if (value > 0) {
    return 'positive'
  }
  return 'neutral'
}

export function getWorkspaceText(copy: ItemsCopy) {
  const isEnglish = copy.statsAllLabel === 'All'

  return {
    catalogTitle: isEnglish ? 'Catalog' : '目录',
    detailTitle: isEnglish ? 'Inspector' : '检查器',
    viewTitle: isEnglish ? 'View Controls' : '视图控制',
    railTitle: isEnglish ? 'Browse' : '浏览',
    filtersTitle: copy.filtersTitle,
    selectionTitle: isEnglish ? 'Selected' : '已选',
    sourceOriginalLabel: isEnglish ? 'Original' : '原版',
    sourceModLabel: isEnglish ? 'Mod' : '模组',
    infoTab: isEnglish ? 'Info' : '基础信息',
    relationsTab: isEnglish ? 'Relations / Recipes' : '关联 / 配方',
    resourcesTab: isEnglish ? 'Dev / Resources' : '技术 / 资源',
    descriptionTitle: isEnglish ? 'Description' : '描述',
    relationsEmpty: isEnglish ? 'No related recipes or acquisition routes yet.' : '暂无相关配方/途径记录',
    giftsEmpty: isEnglish ? 'No villager preference records.' : '暂无村民喜好记录',
    spriteSizeLabel: isEnglish ? 'Sprite Size' : '贴图尺寸',
    catalogItemsLabel: isEnglish ? 'items' : '物品',
    catalogGridLabel: isEnglish ? 'grid' : '网格',
    catalogPageLabel: isEnglish ? 'Page' : '页',
    catalogItemsPerPageLabel: isEnglish ? 'per page' : '每页',
    catalogWheelHint: isEnglish ? 'Wheel to flip pages' : '滚轮翻页',
    previousPageLabel: isEnglish ? 'Prev' : '上一页',
    nextPageLabel: isEnglish ? 'Next' : '下一页',
    customFieldsTitle: isEnglish ? 'Custom Fields' : '自定义字段',
    customFieldsEmpty: isEnglish ? 'No custom fields.' : '暂无自定义字段',
    moduleLabels: {
      map: isEnglish ? 'Map' : '地图',
      events: isEnglish ? 'Events' : '事件',
      characters: isEnglish ? 'Characters' : '角色',
      buildings: isEnglish ? 'Buildings' : '建筑',
      items: isEnglish ? 'Items' : '物品',
    },
  }
}

export function buildHeroChips(item: ItemWorkspaceEntry, copy: ItemsCopy) {
  const chips: HeroChip[] = [
    { key: 'price', label: copy.priceLabel, value: formatPrice(item.price ?? item.salePrice, copy), tone: 'accent', icon: 'coins' },
  ]

  if (item.edibility != null) {
    chips.push({
      key: 'edibility',
      label: copy.edibilityLabel,
      value: formatEdibility(item, copy),
      tone: getChipToneForEdibility(item.edibility),
      icon: item.edibility < 0 ? 'skull' : 'heart',
    })
  }

  if (item.cropData) {
    chips.push({ key: 'crop-seasons', label: copy.cropSeasonsLabel, value: item.cropData.seasons.join(' / ') || copy.noneLabel })
    chips.push({ key: 'crop-growth', label: copy.cropGrowthLabel, value: String(item.cropData.totalGrowthDays) })
  } else if (item.cropHarvests.length) {
    chips.push({ key: 'harvested-from', label: copy.harvestSectionTitle, value: String(item.cropHarvests.length) })
  }

  if (item.fishData) {
    chips.push({
      key: 'fish-time',
      label: copy.fishTimeLabel,
      value: item.fishData.timeSpans.length ? formatTimeSpans(item.fishData.timeSpans) : copy.noneLabel,
    })
    chips.push({ key: 'fish-level', label: copy.fishLevelLabel, value: String(item.fishData.minFishingLevel) })
  }

  if (item.footwearStats) {
    chips.push({ key: 'defense', label: 'DEF', value: String(item.footwearStats.defense), tone: 'positive' })
    chips.push({ key: 'immunity', label: 'IMM', value: String(item.footwearStats.immunity), tone: 'positive' })
  }

  if (item.weaponStats) {
    chips.push({ key: 'damage', label: 'DMG', value: `${item.weaponStats.minDamage}-${item.weaponStats.maxDamage}`, tone: 'positive' })
  }

  if (item.furnitureStats?.furnitureType) {
    chips.push({ key: 'furniture-type', label: copy.kindLabel, value: item.furnitureStats.furnitureType })
  }

  return chips.slice(0, 6)
}

export function buildSourceCards(item: ItemWorkspaceEntry, copy: ItemsCopy) {
  const cards: SourceCard[] = []

  for (const crop of item.cropHarvests) {
    cards.push({
      key: `crop:${crop.seedQualifiedItemId}`,
      badge: copy.harvestSectionTitle,
      title: crop.seedDisplayName,
      detail: `${copy.cropSeasonsLabel}: ${crop.seasons.join(' / ') || copy.noneLabel}`,
      meta: [
        `${copy.cropGrowthLabel}: ${crop.totalGrowthDays}`,
        `${copy.cropRegrowLabel}: ${crop.regrowDays > 0 ? crop.regrowDays : copy.noneLabel}`,
      ],
      relatedQualifiedItemId: crop.seedQualifiedItemId,
    })
  }

  for (const source of item.fishCatchLocations) {
    cards.push({
      key: `fish:${source.locationName}:${source.fishAreaId ?? 'any'}`,
      badge: copy.fishSectionTitle,
      title: source.locationDisplayName,
      detail: source.season ?? copy.noneLabel,
      meta: [`${copy.fishLevelLabel}: ${source.minFishingLevel}`, source.condition ?? copy.noneLabel].filter(
        (value) => value !== copy.noneLabel,
      ),
      chance: source.chance != null ? `${Math.round(source.chance * 100)}%` : null,
    })
  }

  for (const source of item.shopEntries) {
    cards.push({
      key: `shop:${source.shopId}:${source.price ?? 'na'}`,
      badge: copy.shopSectionTitle,
      title: source.shopId,
      detail: source.ownerLabels.join(' / ') || copy.noneLabel,
      meta: [formatPrice(source.price, copy), source.tradeItemAmount > 0 ? `Trade x${source.tradeItemAmount}` : ''].filter(Boolean),
      relatedQualifiedItemId: source.tradeItemQualifiedId,
    })
  }

  for (const source of item.artifactSpotSources) {
    cards.push({
      key: `artifact:${source.locationName}:${source.condition ?? 'none'}`,
      badge: copy.artifactSourceLabel,
      title: source.locationDisplayName,
      detail: source.condition ?? copy.noneLabel,
      meta: [],
      chance: source.chance != null ? `${Math.round(source.chance * 100)}%` : null,
    })
  }

  for (const source of item.forageSources) {
    cards.push({
      key: `forage:${source.locationName}:${source.condition ?? 'none'}`,
      badge: copy.forageSourceLabel,
      title: source.locationDisplayName,
      detail: source.season ?? copy.noneLabel,
      meta: source.condition ? [source.condition] : [],
      chance: source.chance != null ? `${Math.round(source.chance * 100)}%` : null,
    })
  }

  for (const source of item.fishPondSources) {
    cards.push({
      key: `pond:${source.pondItemQualifiedId ?? source.pondItemDisplayName}`,
      badge: copy.pondSourceLabel,
      title: source.pondItemDisplayName,
      detail: `Population ${source.requiredPopulation}`,
      meta: [source.requiredTags.join(' / '), `${source.minStack}-${source.maxStack}`].filter(Boolean),
      relatedQualifiedItemId: source.pondItemQualifiedId,
      chance: source.chance != null ? `${Math.round(source.chance * 100)}%` : null,
    })
  }

  for (const machine of item.machineOutputs) {
    cards.push({
      key: `machine:${machine.machineDisplayName}:${machine.machineRuleId ?? machine.outputItemQualifiedId ?? 'na'}`,
      badge: copy.machineSectionTitle,
      title: machine.machineDisplayName,
      detail: machine.triggerLabel,
      meta: [
        machine.minutesUntilReady > 0 ? `${machine.minutesUntilReady}m` : '',
        machine.daysUntilReady > 0 ? `${machine.daysUntilReady}d` : '',
      ].filter(Boolean),
      relatedQualifiedItemId: machine.machineQualifiedItemId,
    })
  }

  return cards
}

export function createRecipeUseCard(recipe: ItemRecipeEntry, item: ItemWorkspaceEntry, copy: ItemsCopy): UseCard {
  return {
    key: recipe.key,
    badge: recipe.kind === 'crafting' ? copy.craftingRecipeLabel : copy.cookingRecipeLabel,
    title: recipe.displayName,
    subtitle: recipe.unlockLabel,
    outputQualifiedItemId: recipe.outputQualifiedItemId,
    outputCount: recipe.outputCount,
    ingredients: recipe.ingredients.map((ingredient) => ({
      key: ingredient.key,
      label: ingredient.displayName,
      amount: ingredient.amount,
      qualifiedItemId: ingredient.qualifiedItemId,
      isCurrent: ingredient.qualifiedItemId === item.qualifiedItemId,
    })),
  }
}

export function createMachineUseCard(machine: ItemMachineLink, item: ItemWorkspaceEntry, copy: ItemsCopy): UseCard {
  const ingredients = machine.requiredItemQualifiedId
    ? [
        {
          key: machine.requiredItemQualifiedId,
          label: item.displayName,
          amount: machine.requiredItemCount,
          qualifiedItemId: machine.requiredItemQualifiedId,
          isCurrent: machine.requiredItemQualifiedId === item.qualifiedItemId,
        },
      ]
    : [
        {
          key: `${machine.machineDisplayName}:${machine.machineRuleId ?? 'trigger'}`,
          label: machine.triggerLabel,
          amount: machine.requiredItemCount,
          qualifiedItemId: null,
          isCurrent: true,
        },
      ]

  return {
    key: `${machine.machineDisplayName}:${machine.machineRuleId ?? machine.outputItemQualifiedId ?? 'na'}`,
    badge: copy.machineSectionTitle,
    title: machine.machineDisplayName,
    subtitle: [
      machine.triggerLabel,
      machine.minutesUntilReady > 0 ? `${machine.minutesUntilReady}m` : '',
      machine.daysUntilReady > 0 ? `${machine.daysUntilReady}d` : '',
    ]
      .filter(Boolean)
      .join(' / '),
    outputQualifiedItemId: machine.outputItemQualifiedId,
    outputCount: machine.outputCount,
    ingredients,
  }
}

export function getTabDefinitions(copy: ItemsCopy, items: ItemWorkspaceEntry[]): BrowseTab[] {
  const isZh = copy.statsAllLabel !== 'All'
  const labels: Record<ItemBrowseCategory, string> = {
    all: copy.statsAllLabel,
    mineral: isZh ? '矿物' : 'Minerals',
    cooking: copy.statsCookingLabel,
    fish: copy.statsFishLabel,
    crop: copy.statsCropLabel,
    equipment: isZh ? '装备' : 'Gear',
    apparel: isZh ? '服饰' : 'Apparel',
    furniture: copy.kindLabels.furniture,
    crafting: copy.statsCraftingLabel,
  }

  const icons: Record<ItemBrowseCategory, BrowseTab['Icon']> = {
    all: Grid2x2,
    mineral: Gem,
    cooking: ChefHat,
    fish: FishIcon,
    crop: Sprout,
    equipment: Sword,
    apparel: Shirt,
    furniture: Armchair,
    crafting: Wrench,
  }

  const counts = Object.fromEntries(BROWSE_TAB_ORDER.map((id) => [id, 0])) as Record<ItemBrowseCategory, number>
  counts.all = items.length

  for (const entry of items) {
    for (const category of entry.browseCategories) {
      if (category !== 'all') {
        counts[category] += 1
      }
    }
  }

  return BROWSE_TAB_ORDER.map((id) => ({
    id,
    label: labels[id],
    count: counts[id],
    Icon: icons[id],
  }))
}

export function buildSignalCards(
  item: ItemWorkspaceEntry,
  copy: ItemsCopy,
  sourceCards: SourceCard[],
  recipeUseCards: UseCard[],
  machineUseCards: UseCard[],
  recipeOutputCards: UseCard[],
): SignalCard[] {
  return [
    {
      key: 'sources',
      label: copy.sourceSectionTitle,
      value: String(sourceCards.length),
      detail: item.shopEntries.length ? copy.shopSectionTitle : copy.noneLabel,
    },
    {
      key: 'recipes',
      label: copy.recipeSectionTitle,
      value: String(recipeUseCards.length + recipeOutputCards.length),
      detail: recipeOutputCards.length ? copy.recipeOutputTitle : copy.recipeInputTitle,
    },
    {
      key: 'machines',
      label: copy.machineSectionTitle,
      value: String(item.machineOutputs.length + machineUseCards.length),
      detail: item.machineOutputs.length ? copy.itemSaleLabel : copy.noneLabel,
    },
    {
      key: 'gifts',
      label: copy.giftSectionTitle,
      value: String(item.lovedBy.length + item.likedBy.length),
      detail: item.lovedBy.length ? copy.giftLoveTitle : copy.giftLikeTitle,
    },
  ]
}

export function buildSpecificSections(item: ItemWorkspaceEntry, copy: ItemsCopy): AsideSection[] {
  const sections: AsideSection[] = []

  if (item.cropData) {
    sections.push({
      key: 'crop',
      title: copy.cropSectionTitle,
      rows: [
        { label: copy.cropSeasonsLabel, value: item.cropData.seasons.join(' / ') || copy.noneLabel },
        { label: copy.cropGrowthLabel, value: String(item.cropData.totalGrowthDays) },
        { label: copy.cropRegrowLabel, value: item.cropData.regrowDays > 0 ? String(item.cropData.regrowDays) : copy.noneLabel },
        { label: copy.cropYieldLabel, value: `${item.cropData.harvestMinStack}-${item.cropData.harvestMaxStack}` },
      ],
    })
  }

  if (item.fishData) {
    sections.push({
      key: 'fish',
      title: copy.fishSectionTitle,
      rows: [
        { label: copy.fishDifficultyLabel, value: item.fishData.difficulty != null ? String(item.fishData.difficulty) : copy.noneLabel },
        { label: copy.fishTimeLabel, value: item.fishData.timeSpans.length ? formatTimeSpans(item.fishData.timeSpans) : copy.noneLabel },
        { label: copy.fishWeatherLabel, value: item.fishData.weather ?? copy.noneLabel },
        { label: copy.fishLevelLabel, value: String(item.fishData.minFishingLevel) },
      ],
    })
  }

  if (item.weaponStats) {
    sections.push({
      key: 'weapon',
      title: copy.kindLabels[item.kind],
      rows: [
        { label: 'DMG', value: `${item.weaponStats.minDamage}-${item.weaponStats.maxDamage}` },
        { label: 'DEF', value: String(item.weaponStats.defense) },
        { label: 'CRIT', value: `${Math.round(item.weaponStats.critChance * 100)}%` },
        { label: 'SPD', value: String(item.weaponStats.speed) },
      ],
    })
  }

  if (item.toolStats) {
    sections.push({
      key: 'tool',
      title: copy.kindLabels[item.kind],
      rows: [
        { label: 'Class', value: item.toolStats.className ?? copy.noneLabel },
        { label: 'Upgrade', value: String(item.toolStats.upgradeLevel) },
        { label: 'Slots', value: String(item.toolStats.attachmentSlots) },
        { label: 'From', value: item.toolStats.conventionalUpgradeFrom ?? copy.noneLabel },
      ],
    })
  }

  if (item.footwearStats) {
    sections.push({
      key: 'boots',
      title: copy.kindLabels[item.kind],
      rows: [
        { label: 'DEF', value: String(item.footwearStats.defense) },
        { label: 'IMM', value: String(item.footwearStats.immunity) },
        { label: 'Color', value: item.footwearStats.colorIndex != null ? String(item.footwearStats.colorIndex) : copy.noneLabel },
      ],
    })
  }

  if (item.furnitureStats) {
    sections.push({
      key: 'furniture',
      title: copy.kindLabels[item.kind],
      rows: [
        { label: copy.typeLabel, value: item.furnitureStats.furnitureType ?? copy.noneLabel },
        { label: 'Rotations', value: String(item.furnitureStats.rotations) },
        {
          label: 'Source',
          value: item.furnitureStats.sourceSize
            ? `${item.furnitureStats.sourceSize.width}x${item.furnitureStats.sourceSize.height}`
            : copy.noneLabel,
        },
        {
          label: 'Bounds',
          value: item.furnitureStats.boundingSize
            ? `${item.furnitureStats.boundingSize.width}x${item.furnitureStats.boundingSize.height}`
            : copy.noneLabel,
        },
      ],
    })
  }

  if (item.objectStats) {
    const objectRows: AsideRow[] = [
      { label: copy.giftableLabel, value: formatBoolean(item.canBeGivenAsGift, copy) },
      { label: copy.trashableLabel, value: formatBoolean(item.canBeTrashed, copy) },
      { label: copy.colorOverlayLabel, value: formatBoolean(item.objectStats.colorOverlayFromNextIndex, copy) },
      { label: copy.geodeDefaultDropsLabel, value: formatBoolean(item.objectStats.geodeDropsDefaultItems, copy) },
      { label: copy.excludeFishingCollectionLabel, value: formatBoolean(item.objectStats.excludeFromFishingCollection, copy) },
      { label: copy.excludeShippingCollectionLabel, value: formatBoolean(item.objectStats.excludeFromShippingCollection, copy) },
      { label: copy.excludeRandomSaleLabel, value: formatBoolean(item.objectStats.excludeFromRandomSale, copy) },
    ]

    sections.push({
      key: 'object-data',
      title: copy.kindLabels.object,
      rows: objectRows,
    })
  }

  return sections
}

export function buildInfoRows(item: ItemWorkspaceEntry, copy: ItemsCopy) {
  return [
    { label: copy.qualifiedIdLabel, value: item.qualifiedItemId },
    { label: copy.kindLabel, value: copy.kindLabels[item.kind] },
    { label: copy.typeLabel, value: item.kindMetaLabel ?? copy.noneLabel },
    { label: copy.priceLabel, value: formatPrice(item.price ?? item.salePrice, copy) },
    { label: copy.edibilityLabel, value: formatEdibility(item, copy) },
    { label: copy.giftableLabel, value: formatBoolean(item.canBeGivenAsGift, copy) },
    { label: copy.trashableLabel, value: formatBoolean(item.canBeTrashed, copy) },
    { label: copy.internalNameLabel, value: item.internalName },
  ] satisfies AsideRow[]
}

export function buildObjectDataCards(item: ItemWorkspaceEntry, copy: ItemsCopy) {
  const stats = item.objectStats
  if (!stats) {
    return [] satisfies ObjectDataCard[]
  }

  const cards: ObjectDataCard[] = []

  cards.push(
    ...stats.buffs.map((buff, index) => {
      const attributeRows = Object.entries(buff.customAttributes).flatMap(([key, value]) =>
        value !== 0 ? [{ label: `${copy.attributesLabel}:${key}`, value: String(value) }] : [],
      )

      return {
        key: `buff:${buff.id ?? index}`,
        title: buff.id ?? buff.buffId ?? `${copy.buffDataTitle} ${index + 1}`,
        rows: [
          { label: copy.buffIdLabel, value: buff.buffId ?? copy.noneLabel },
          { label: copy.durationLabel, value: String(buff.duration) },
          { label: copy.debuffLabel, value: formatBoolean(buff.isDebuff, copy) },
          { label: copy.iconLabel, value: buff.iconTexture ? `${buff.iconTexture}:${buff.iconSpriteIndex}` : String(buff.iconSpriteIndex) },
          { label: copy.glowColorLabel, value: buff.glowColor ?? copy.noneLabel },
          ...attributeRows,
        ],
      }
    }),
  )

  cards.push(
    ...stats.geodeDrops.map((drop, index) => ({
      key: `geode:${drop.id ?? index}`,
      title: drop.id ?? `${copy.geodeDropsTitle} ${index + 1}`,
      rows: [
        { label: copy.outputLabel, value: formatItemOutput(drop.itemId, drop.randomItemIds, copy) },
        { label: copy.chanceLabel, value: formatChance(drop.chance, copy) },
        { label: copy.conditionLabel, value: drop.condition ?? copy.noneLabel },
        { label: copy.stackLabel, value: `${drop.minStack}-${drop.maxStack}` },
        { label: copy.maxItemsLabel, value: drop.maxItems != null ? String(drop.maxItems) : copy.noneLabel },
        { label: copy.qualityLabel, value: String(drop.quality) },
        { label: copy.toolUpgradeLabel, value: String(drop.toolUpgradeLevel) },
        { label: copy.recipeLabel, value: formatBoolean(drop.isRecipe, copy) },
        { label: copy.setFlagLabel, value: drop.setFlagOnPickup ?? copy.noneLabel },
        { label: copy.precedenceLabel, value: String(drop.precedence) },
        { label: copy.stackModeLabel, value: drop.stackModifierMode != null ? String(drop.stackModifierMode) : copy.noneLabel },
        { label: copy.qualityModeLabel, value: drop.qualityModifierMode != null ? String(drop.qualityModifierMode) : copy.noneLabel },
        { label: copy.stackModifiersLabel, value: drop.stackModifiers.length ? String(drop.stackModifiers.length) : copy.noneLabel },
        { label: copy.qualityModifiersLabel, value: drop.qualityModifiers.length ? String(drop.qualityModifiers.length) : copy.noneLabel },
        { label: copy.modDataLabel, value: Object.keys(drop.modData).length ? String(Object.keys(drop.modData).length) : copy.noneLabel },
        { label: copy.perItemConditionLabel, value: drop.perItemCondition ?? copy.noneLabel },
      ],
    })),
  )

  cards.push(
    ...Object.entries(stats.artifactSpotChances).map(([location, chance]) => ({
      key: `artifact-chance:${location}`,
      title: location,
      rows: [{ label: copy.chanceLabel, value: formatChance(chance, copy) }],
    })),
  )

  const attributeRows = getNonZeroAttributeRows(item, copy)
  if (attributeRows.length) {
    cards.push({
      key: 'buff-attribute-summary',
      title: copy.attributesLabel,
      rows: attributeRows,
    })
  }

  return cards
}

export function buildResourceRows(
  item: ItemWorkspaceEntry,
  textureState: ItemTextureAssetState | null,
  copy: ItemsCopy,
  spriteSizeLabel: string,
) {
  return [
    { label: copy.textureLabel, value: textureState?.path?.replaceAll('/', '\\') ?? item.texturePathLabel },
    { label: copy.spriteIndexLabel, value: item.menuSpriteIndex != null ? String(item.menuSpriteIndex) : copy.noneLabel },
    { label: spriteSizeLabel, value: `${item.spriteWidth}x${item.spriteHeight}` },
    {
      label: copy.textureSizeLabel,
      value: textureState?.width && textureState.height ? `${textureState.width}x${textureState.height}` : copy.noneLabel,
    },
  ] satisfies AsideRow[]
}
