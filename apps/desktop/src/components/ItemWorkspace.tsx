import {
  Armchair,
  ArrowRight,
  ChefHat,
  Coins,
  Fish as FishIcon,
  Gem,
  Grid2x2,
  Heart,
  Search,
  Shirt,
  Skull,
  Sprout,
  Sword,
  Wrench,
} from 'lucide-react'
import { useCallback, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import {
  getContainedItemSpriteFrame,
  getContainedItemSpriteScale,
  getItemBrowseCategories,
  type ItemBrowseCategory,
  type ItemGiftTasteNpc,
  type ItemMachineLink,
  type ItemRecipeEntry,
  type ItemTextureAssetState,
  type ItemWorkspaceEntry,
} from '../lib/app/itemWorkspace'
import { ItemSprite } from './ItemSprite'

type ItemWorkspaceProps = {
  copy: import('../lib/editor-shell').ItemsPanelCopy
  item: ItemWorkspaceEntry | null
  items: ItemWorkspaceEntry[]
  filteredItems: ItemWorkspaceEntry[]
  activeItemId: string | null
  itemFilter: string
  itemLookup: Map<string, ItemWorkspaceEntry>
  textureStatesByAssetName: Record<string, ItemTextureAssetState>
  onItemFilterChange: (value: string) => void
  onSelectItem: (itemKey: string) => void
}

type Tone = 'neutral' | 'positive' | 'danger' | 'accent'

type HeroChip = {
  key: string
  label: string
  value: string
  tone?: Tone
  icon?: 'coins' | 'heart' | 'skull'
}

type SourceCard = {
  key: string
  badge: string
  title: string
  detail: string
  meta: string[]
  relatedQualifiedItemId?: string | null
  chance?: string | null
}

type UseCard = {
  key: string
  badge: string
  title: string
  subtitle: string
  outputQualifiedItemId?: string | null
  outputCount?: number
  ingredients: Array<{
    key: string
    label: string
    amount: number
    qualifiedItemId?: string | null
    isCurrent?: boolean
  }>
}

type BrowseTab = {
  id: ItemBrowseCategory
  label: string
  count: number
  Icon: typeof Grid2x2
}

type SignalCard = {
  key: string
  label: string
  value: string
  detail: string
}

type AsideRow = {
  label: string
  value: string
}

type AsideSection = {
  key: string
  title: string
  rows: AsideRow[]
}

const BROWSE_TAB_ORDER: ItemBrowseCategory[] = ['all', 'mineral', 'cooking', 'fish', 'crop', 'equipment', 'apparel', 'furniture', 'crafting']

function formatTime(value: number) {
  const hours = Math.floor(value / 100)
  const minutes = value % 100
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatTimeSpans(timeSpans: Array<{ start: number; end: number }>) {
  return timeSpans.map((span) => `${formatTime(span.start)}-${formatTime(span.end)}`).join(' / ')
}

function formatPrice(value: number | null | undefined, copy: ItemWorkspaceProps['copy']) {
  return value != null ? `${value}G` : copy.noneLabel
}

function formatEdibility(item: ItemWorkspaceEntry, copy: ItemWorkspaceProps['copy']) {
  if (item.edibility == null) {
    return copy.noneLabel
  }

  return String(item.edibility)
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

function getToneClass(tone: Tone) {
  switch (tone) {
    case 'positive':
      return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
    case 'danger':
      return 'border-rose-400/25 bg-rose-500/10 text-rose-200'
    case 'accent':
      return 'border-[color-mix(in_srgb,var(--accent)_36%,transparent)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--text-primary)]'
    default:
      return 'border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-primary)]'
  }
}

function renderKv(label: string, value: string) {
  return (
    <div className="kv-row compact-kv-row">
      <span>{label}</span>
      <span className="max-w-[62%] truncate text-right">{value}</span>
    </div>
  )
}

function buildHeroChips(item: ItemWorkspaceEntry, copy: ItemWorkspaceProps['copy']) {
  const chips: HeroChip[] = [
    { key: 'price', label: copy.priceLabel, value: formatPrice(item.price ?? item.salePrice, copy), tone: 'accent', icon: 'coins' },
    { key: 'type', label: copy.typeLabel, value: item.kindMetaLabel ?? copy.kindLabels[item.kind] },
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
    chips.push({ key: 'fish-time', label: copy.fishTimeLabel, value: item.fishData.timeSpans.length ? formatTimeSpans(item.fishData.timeSpans) : copy.noneLabel })
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

function buildSourceCards(item: ItemWorkspaceEntry, copy: ItemWorkspaceProps['copy']) {
  const cards: SourceCard[] = []

  for (const crop of item.cropHarvests) {
    cards.push({
      key: `crop:${crop.seedQualifiedItemId}`,
      badge: copy.harvestSectionTitle,
      title: crop.seedDisplayName,
      detail: `${copy.cropSeasonsLabel}: ${crop.seasons.join(' / ') || copy.noneLabel}`,
      meta: [`${copy.cropGrowthLabel}: ${crop.totalGrowthDays}`, `${copy.cropRegrowLabel}: ${crop.regrowDays > 0 ? crop.regrowDays : copy.noneLabel}`],
      relatedQualifiedItemId: crop.seedQualifiedItemId,
    })
  }

  for (const source of item.fishCatchLocations) {
    cards.push({
      key: `fish:${source.locationName}:${source.fishAreaId ?? 'any'}`,
      badge: copy.fishSectionTitle,
      title: source.locationDisplayName,
      detail: source.season ?? copy.noneLabel,
      meta: [`${copy.fishLevelLabel}: ${source.minFishingLevel}`, source.condition ?? copy.noneLabel].filter((value) => value !== copy.noneLabel),
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
      meta: [machine.minutesUntilReady > 0 ? `${machine.minutesUntilReady}m` : '', machine.daysUntilReady > 0 ? `${machine.daysUntilReady}d` : ''].filter(Boolean),
      relatedQualifiedItemId: machine.machineQualifiedItemId,
    })
  }

  return cards
}

function createRecipeUseCard(recipe: ItemRecipeEntry, item: ItemWorkspaceEntry, copy: ItemWorkspaceProps['copy']): UseCard {
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

function createMachineUseCard(machine: ItemMachineLink, item: ItemWorkspaceEntry, copy: ItemWorkspaceProps['copy']): UseCard {
  const ingredients = machine.requiredItemQualifiedId
    ? [{ key: machine.requiredItemQualifiedId, label: item.displayName, amount: machine.requiredItemCount, qualifiedItemId: machine.requiredItemQualifiedId, isCurrent: machine.requiredItemQualifiedId === item.qualifiedItemId }]
    : [{ key: `${machine.machineDisplayName}:${machine.machineRuleId ?? 'trigger'}`, label: machine.triggerLabel, amount: machine.requiredItemCount, qualifiedItemId: null, isCurrent: true }]

  return {
    key: `${machine.machineDisplayName}:${machine.machineRuleId ?? machine.outputItemQualifiedId ?? 'na'}`,
    badge: copy.machineSectionTitle,
    title: machine.machineDisplayName,
    subtitle: [machine.triggerLabel, machine.minutesUntilReady > 0 ? `${machine.minutesUntilReady}m` : '', machine.daysUntilReady > 0 ? `${machine.daysUntilReady}d` : '']
      .filter(Boolean)
      .join(' / '),
    outputQualifiedItemId: machine.outputItemQualifiedId,
    outputCount: machine.outputCount,
    ingredients,
  }
}

function getTabDefinitions(copy: ItemWorkspaceProps['copy'], items: ItemWorkspaceEntry[]): BrowseTab[] {
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

  const icons: Record<ItemBrowseCategory, typeof Grid2x2> = {
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

  return BROWSE_TAB_ORDER.map((id) => ({
    id,
    label: labels[id],
    count: id === 'all' ? items.length : items.filter((entry) => getItemBrowseCategories(entry).includes(id)).length,
    Icon: icons[id],
  }))
}

function buildSignalCards(
  item: ItemWorkspaceEntry,
  copy: ItemWorkspaceProps['copy'],
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

function buildSpecificSections(item: ItemWorkspaceEntry, copy: ItemWorkspaceProps['copy']): AsideSection[] {
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
          value: item.furnitureStats.sourceSize ? `${item.furnitureStats.sourceSize.width}x${item.furnitureStats.sourceSize.height}` : copy.noneLabel,
        },
        {
          label: 'Bounds',
          value: item.furnitureStats.boundingSize ? `${item.furnitureStats.boundingSize.width}x${item.furnitureStats.boundingSize.height}` : copy.noneLabel,
        },
      ],
    })
  }

  return sections
}

function HeroStatChip({ chip }: { chip: HeroChip }) {
  const Icon = chip.icon === 'coins' ? Coins : chip.icon === 'skull' ? Skull : chip.icon === 'heart' ? Heart : null

  return (
    <div className={`rounded-2xl border px-3 py-3 ${getToneClass(chip.tone ?? 'neutral')}`}>
      <p className="text-[10px] uppercase tracking-[0.16em] opacity-70">{chip.label}</p>
      <div className="mt-2 flex items-center gap-2">
        {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
        <p className="text-sm font-semibold">{chip.value}</p>
      </div>
    </div>
  )
}

function WorkbenchSignalCard({ card }: { card: SignalCard }) {
  return (
    <article className="panel-section px-4 py-3">
      <p className="panel-section-title text-[10px]">{card.label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">{card.value}</p>
        <p className="text-right text-[11px] text-[var(--text-tertiary)]">{card.detail}</p>
      </div>
    </article>
  )
}

function TasteGroup({
  title,
  entries,
  tone,
}: {
  title: string
  entries: ItemGiftTasteNpc[]
  tone: Tone
}) {
  if (!entries.length) {
    return null
  }

  return (
    <div className="panel-section p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${getToneClass(tone)}`}>
          <Heart className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
          <p className="text-xs text-[var(--text-secondary)]">{entries.length}</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {entries.map((npc) => (
          <div key={`${npc.taste}:${npc.internalName}`} className="panel-list-card flex items-center gap-3 px-3 py-2.5">
            <div className={`inline-flex h-10 w-10 shrink-0 items-center justify-center border text-sm font-semibold uppercase ${getToneClass(tone)}`}>
              {npc.displayName.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{npc.displayName}</p>
              <p className="truncate text-xs text-[var(--text-secondary)]">{npc.internalName}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RelatedVisual({
  itemId,
  itemLookup,
  textureStatesByAssetName,
  fallback,
}: {
  itemId?: string | null
  itemLookup: Map<string, ItemWorkspaceEntry>
  textureStatesByAssetName: Record<string, ItemTextureAssetState>
  fallback: string
}) {
  const relatedItem = itemId ? (itemLookup.get(itemId) ?? null) : null
  const textureState = relatedItem?.textureAssetName ? (textureStatesByAssetName[relatedItem.textureAssetName] ?? null) : null

  return relatedItem ? (
    <ItemSprite item={relatedItem} textureState={textureState} scale={getContainedItemSpriteScale(relatedItem, 56, 1.9)} className="h-14 w-14 shrink-0" />
  ) : (
    <div className="panel-list-card flex h-14 w-14 shrink-0 items-center justify-center text-sm font-semibold text-[var(--text-secondary)]">
      {fallback.slice(0, 1)}
    </div>
  )
}

function SourceGrid({
  cards,
  copy,
  itemLookup,
  textureStatesByAssetName,
}: {
  cards: SourceCard[]
  copy: ItemWorkspaceProps['copy']
  itemLookup: Map<string, ItemWorkspaceEntry>
  textureStatesByAssetName: Record<string, ItemTextureAssetState>
}) {
  return (
    <section className="panel-section p-4 sm:p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="panel-section-title">{copy.sourceSectionTitle}</p>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">{cards.length ? `${cards.length}` : copy.noneLabel}</p>
        </div>
      </div>

      {cards.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {cards.map((card) => (
            <article key={card.key} className="panel-section-muted panel-section p-4">
              <div className="flex items-start gap-3">
                <RelatedVisual itemId={card.relatedQualifiedItemId} itemLookup={itemLookup} textureStatesByAssetName={textureStatesByAssetName} fallback={card.title} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <span className="dock-chip">{card.badge}</span>
                    {card.chance ? <span className="dock-chip">{card.chance}</span> : null}
                  </div>
                  <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">{card.title}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{card.detail}</p>
                  {card.meta.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {card.meta.map((meta) => (
                        <span key={meta} className="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
                          {meta}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel-empty-state">
          {copy.sourceSectionEmpty}
        </div>
      )}
    </section>
  )
}

function FormulaChip({
  ingredient,
  relatedItem,
  textureState,
}: {
  ingredient: UseCard['ingredients'][number]
  relatedItem: ItemWorkspaceEntry | null
  textureState: ItemTextureAssetState | null
}) {
  return (
    <div
      className={cx(
        'flex items-center gap-2 rounded-2xl border px-3 py-2',
        ingredient.isCurrent
          ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]'
          : 'border-[var(--border-color)] bg-[var(--bg-panel-muted)]',
      )}
    >
      {relatedItem ? <ItemSprite item={relatedItem} textureState={textureState} scale={getContainedItemSpriteScale(relatedItem, 40, 1.45)} className="h-10 w-10 shrink-0" /> : null}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{ingredient.label}</p>
        <p className="text-xs text-[var(--text-secondary)]">x{ingredient.amount}</p>
      </div>
    </div>
  )
}

function UseGrid({
  title,
  cards,
  copy,
  itemLookup,
  textureStatesByAssetName,
}: {
  title: string
  cards: UseCard[]
  copy: ItemWorkspaceProps['copy']
  itemLookup: Map<string, ItemWorkspaceEntry>
  textureStatesByAssetName: Record<string, ItemTextureAssetState>
}) {
  return (
    <section className="panel-section p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="panel-section-title">{title}</p>
          <p className="text-xs text-[var(--text-secondary)]">{cards.length}</p>
        </div>
      </div>

      {cards.length ? (
        <div className="mt-3 grid gap-3">
          {cards.map((card) => {
            const outputItem = card.outputQualifiedItemId ? (itemLookup.get(card.outputQualifiedItemId) ?? null) : null
            const outputTexture = outputItem?.textureAssetName ? (textureStatesByAssetName[outputItem.textureAssetName] ?? null) : null

            return (
              <article key={card.key} className="panel-section-muted panel-section p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="dock-chip">{card.badge}</span>
                    <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">{card.title}</p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{card.subtitle}</p>
                  </div>
                  {outputItem ? (
                    <div className="shrink-0 text-right">
                      <ItemSprite item={outputItem} textureState={outputTexture} scale={getContainedItemSpriteScale(outputItem, 56, 1.75)} className="ml-auto h-14 w-14" />
                      <p className="mt-2 text-xs text-[var(--text-secondary)]">x{card.outputCount ?? 1}</p>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {card.ingredients.map((ingredient, index) => {
                    const relatedItem = ingredient.qualifiedItemId ? (itemLookup.get(ingredient.qualifiedItemId) ?? null) : null
                    const textureState = relatedItem?.textureAssetName ? (textureStatesByAssetName[relatedItem.textureAssetName] ?? null) : null

                    return (
                      <div key={ingredient.key} className="flex items-center gap-2">
                        <FormulaChip ingredient={ingredient} relatedItem={relatedItem} textureState={textureState} />
                        {index < card.ingredients.length - 1 ? <span className="text-[var(--text-tertiary)]">+</span> : null}
                      </div>
                    )
                  })}
                  {outputItem ? (
                    <>
                      <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)]" />
                      <div className="panel-list-card flex items-center gap-2 px-3 py-2">
                        <ItemSprite item={outputItem} textureState={outputTexture} scale={getContainedItemSpriteScale(outputItem, 40, 1.45)} className="h-10 w-10 shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{outputItem.displayName}</p>
                          <p className="text-xs text-[var(--text-secondary)]">x{card.outputCount ?? 1}</p>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="panel-empty-state mt-3">
          {copy.noneLabel}
        </div>
      )}
    </section>
  )
}

function ItemTooltip({
  copy,
  item,
}: {
  copy: ItemWorkspaceProps['copy']
  item: ItemWorkspaceEntry | null
}) {
  if (!item) {
    return null
  }

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-10 w-[260px] rounded-2xl border border-white/10 bg-[rgba(10,12,16,0.88)] px-4 py-3 text-white shadow-2xl backdrop-blur-md">
      <div className="flex items-center gap-2">
        <span className="dock-chip">{copy.kindLabels[item.kind]}</span>
      </div>
      <p className="mt-3 text-base font-semibold">{item.displayName}</p>
      <div className="mt-3 space-y-1 text-xs text-white/80">
        <p>{copy.qualifiedIdLabel}: {item.qualifiedItemId}</p>
        <p>{copy.typeLabel}: {item.kindMetaLabel ?? copy.kindLabels[item.kind]}</p>
        <p>{copy.priceLabel}: {formatPrice(item.price ?? item.salePrice, copy)}</p>
      </div>
    </div>
  )
}

type DetailTab = 'info' | 'relations' | 'resources'

type ItemWorkspaceUiState = {
  activeBrowseTab: ItemBrowseCategory
  activeDetailTab: DetailTab
  hoveredItemId: string | null
}

const DEFAULT_ITEM_WORKSPACE_UI_STATE: ItemWorkspaceUiState = {
  activeBrowseTab: 'all',
  activeDetailTab: 'info',
  hoveredItemId: null,
}

let itemWorkspaceUiState = DEFAULT_ITEM_WORKSPACE_UI_STATE
const itemWorkspaceUiListeners = new Set<() => void>()

function subscribeItemWorkspaceUi(listener: () => void) {
  itemWorkspaceUiListeners.add(listener)
  return () => itemWorkspaceUiListeners.delete(listener)
}

function getItemWorkspaceUiSnapshot() {
  return itemWorkspaceUiState
}

function updateItemWorkspaceUiState(partial: Partial<ItemWorkspaceUiState>) {
  itemWorkspaceUiState = {
    ...itemWorkspaceUiState,
    ...partial,
  }

  itemWorkspaceUiListeners.forEach((listener) => listener())
}

function useItemWorkspaceUi() {
  const state = useSyncExternalStore(subscribeItemWorkspaceUi, getItemWorkspaceUiSnapshot)

  const setActiveBrowseTab = useCallback((tab: ItemBrowseCategory) => {
    updateItemWorkspaceUiState({ activeBrowseTab: tab })
  }, [])

  const setActiveDetailTab = useCallback((tab: DetailTab) => {
    updateItemWorkspaceUiState({ activeDetailTab: tab })
  }, [])

  const setHoveredItemId = useCallback((itemKey: string | null) => {
    updateItemWorkspaceUiState({ hoveredItemId: itemKey })
  }, [])

  return {
    ...state,
    setActiveBrowseTab,
    setActiveDetailTab,
    setHoveredItemId,
  }
}

function getWorkspaceText(copy: ItemWorkspaceProps['copy']) {
  const isEnglish = copy.statsAllLabel === 'All'

  return {
    catalogTitle: isEnglish ? 'Catalog' : '目录',
    detailTitle: isEnglish ? 'Inspector' : '检查器',
    viewTitle: isEnglish ? 'View Controls' : '视图控制',
    railTitle: isEnglish ? 'Workspace Rail' : '工作区导航',
    filtersTitle: isEnglish ? 'Category Filters' : '分类过滤',
    selectionTitle: isEnglish ? 'Current Focus' : '当前焦点',
    infoTab: isEnglish ? 'Info' : '基础信息',
    relationsTab: isEnglish ? 'Relations / Recipes' : '关联 / 配方',
    resourcesTab: isEnglish ? 'Dev / Resources' : '技术 / 资源',
    descriptionTitle: isEnglish ? 'Description' : '描述',
    relationsEmpty: isEnglish ? 'No related recipes or acquisition routes yet.' : '暂无相关配方/途径记录',
    giftsEmpty: isEnglish ? 'No villager preference records.' : '暂无村民喜好记录',
    spriteSizeLabel: isEnglish ? 'Sprite Size' : '贴图尺寸',
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

function buildInfoRows(item: ItemWorkspaceEntry, copy: ItemWorkspaceProps['copy']) {
  return [
    { label: copy.qualifiedIdLabel, value: item.qualifiedItemId },
    { label: copy.kindLabel, value: copy.kindLabels[item.kind] },
    { label: copy.typeLabel, value: item.kindMetaLabel ?? copy.noneLabel },
    { label: copy.priceLabel, value: formatPrice(item.price ?? item.salePrice, copy) },
    { label: copy.edibilityLabel, value: formatEdibility(item, copy) },
    { label: copy.internalNameLabel, value: item.internalName },
  ] satisfies AsideRow[]
}

function buildResourceRows(
  item: ItemWorkspaceEntry,
  textureState: ItemTextureAssetState | null,
  copy: ItemWorkspaceProps['copy'],
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

function getPillClass(isActive: boolean) {
  return isActive
    ? 'border-transparent bg-[var(--accent)] text-white shadow-[0_12px_28px_color-mix(in_srgb,var(--accent)_28%,transparent)]'
    : 'border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:bg-[var(--bg-panel-muted)]'
}

function EmptyNotice({ message }: { message: string }) {
  return <div className="panel-empty-state">{message}</div>
}

function DetailSectionCard({
  title,
  rows,
  children,
}: {
  title: string
  rows?: AsideRow[]
  children?: ReactNode
}) {
  return (
    <section className="panel-section p-4">
      <p className="panel-section-title">{title}</p>
      {rows?.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={`${title}:${row.label}`} className="panel-section px-3 py-3">
              {renderKv(row.label, row.value)}
            </div>
          ))}
        </div>
      ) : null}
      {children}
    </section>
  )
}

function NavigationPane({
  copy,
  text,
  tabs,
  activeBrowseTab,
  onBrowseTabChange,
  itemFilter,
  onItemFilterChange,
  item,
  textureState,
  visibleCount,
  totalVisibleCount,
}: {
  copy: ItemWorkspaceProps['copy']
  text: ReturnType<typeof getWorkspaceText>
  tabs: BrowseTab[]
  activeBrowseTab: ItemBrowseCategory
  onBrowseTabChange: (tab: ItemBrowseCategory) => void
  itemFilter: string
  onItemFilterChange: (value: string) => void
  item: ItemWorkspaceEntry | null
  textureState: ItemTextureAssetState | null
  visibleCount: number
  totalVisibleCount: number
}) {
  return (
    <aside className="panel-surface h-full">
      <div className="panel-header">
        <div>
          <p className="panel-title">{text.railTitle}</p>
          <p className="panel-subtitle">{visibleCount} / {totalVisibleCount}</p>
        </div>
      </div>
      <div className="panel-body min-h-0 overflow-auto p-4">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            className="control-input pl-9"
            value={itemFilter}
            onChange={(event) => onItemFilterChange(event.target.value)}
            placeholder={copy.browserFilterPlaceholder}
            spellCheck={false}
          />
        </div>

        <div className="space-y-2">
          {tabs.map((tab) => {
            const isActive = tab.id === activeBrowseTab
            return (
              <button
                key={tab.id}
                type="button"
                className={cx('flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors', getPillClass(isActive))}
                onClick={() => onBrowseTabChange(tab.id)}
              >
                <span className={cx('inline-flex h-10 w-10 shrink-0 items-center justify-center border', isActive ? 'border-white/15 bg-white/10 text-white' : 'border-[var(--border-color)] bg-[var(--bg-panel-muted)]')}>
                  <tab.Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{tab.label}</span>
                  <span className={cx('block text-xs', isActive ? 'text-white/80' : 'text-[var(--text-tertiary)]')}>{tab.count}</span>
                </span>
              </button>
            )
          })}
        </div>

        <section className="mt-4 border-t border-[var(--border-color)] pt-4">
          {item ? (
            <div className="panel-section p-3">
              <div className="flex items-center gap-3">
                <div className="panel-list-card flex h-14 w-14 shrink-0 items-center justify-center">
                  <ItemSprite item={item} textureState={textureState} scale={getContainedItemSpriteScale(item, 40, 1.75)} className="h-10 w-10" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{item.displayName}</p>
                  <p className="truncate text-xs text-[var(--text-secondary)]">{item.qualifiedItemId}</p>
                </div>
              </div>
            </div>
          ) : (
            <EmptyNotice message={copy.workspaceEmpty} />
          )}
        </section>
      </div>
    </aside>
  )
}

function CatalogPane({
  copy,
  text,
  items,
  activeItemId,
  textureStatesByAssetName,
  onSelectItem,
  hoveredItemId,
  onHoverItem,
}: {
  copy: ItemWorkspaceProps['copy']
  text: ReturnType<typeof getWorkspaceText>
  items: ItemWorkspaceEntry[]
  activeItemId: string | null
  textureStatesByAssetName: Record<string, ItemTextureAssetState>
  onSelectItem: (itemKey: string, tab?: DetailTab) => void
  hoveredItemId: string | null
  onHoverItem: (itemKey: string | null) => void
}) {
  const hoveredItem = hoveredItemId ? (items.find((entry) => entry.key === hoveredItemId) ?? null) : null

  return (
    <section className="panel-surface relative h-full">
      <div className="panel-header">
        <div>
          <p className="panel-title">{text.catalogTitle}</p>
          <p className="panel-subtitle">{items.length}</p>
        </div>
      </div>
      <div className="panel-body min-h-0 flex-1 overflow-auto p-4">
        {items.length ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {items.map((entry) => {
              const textureState = entry.textureAssetName ? (textureStatesByAssetName[entry.textureAssetName] ?? null) : null
              const isActive = entry.key === activeItemId

              return (
                <button
                  key={entry.key}
                  type="button"
                  className={cx(
                    'group flex aspect-square flex-col items-center justify-center rounded-2xl border p-2 text-center transition-all',
                    isActive
                      ? 'border-[color-mix(in_srgb,var(--accent)_44%,transparent)] bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-[0_16px_32px_color-mix(in_srgb,var(--accent)_18%,transparent)]'
                      : 'border-[var(--border-color)] bg-[var(--bg-panel)] hover:bg-[var(--bg-panel-muted)] hover:shadow-[0_12px_24px_rgba(15,23,42,0.08)]',
                  )}
                  onClick={() => onSelectItem(entry.key, 'info')}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    onSelectItem(entry.key, 'relations')
                  }}
                  onMouseEnter={() => onHoverItem(entry.key)}
                  onMouseLeave={() => onHoverItem(null)}
                  onFocus={() => onHoverItem(entry.key)}
                  onBlur={() => onHoverItem(null)}
                  aria-label={`${entry.displayName} ${entry.qualifiedItemId}`}
                >
                  <ItemSprite item={entry} textureState={textureState} scale={getContainedItemSpriteScale(entry, 40, 1.55)} className="h-10 w-10" />
                  <span className="mt-2 line-clamp-2 text-[10px] leading-4 text-[var(--text-secondary)]">{entry.displayName}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <EmptyNotice message={copy.browserFilteredEmpty} />
        )}
      </div>

      <ItemTooltip copy={copy} item={hoveredItem} />
    </section>
  )
}

function DetailPane({
  copy,
  text,
  item,
  textureState,
  heroChips,
  signalCards,
  infoRows,
  resourceRows,
  sourceCards,
  recipeUseCards,
  machineUseCards,
  recipeOutputCards,
  specificSections,
  activeDetailTab,
  onDetailTabChange,
  itemLookup,
  textureStatesByAssetName,
}: {
  copy: ItemWorkspaceProps['copy']
  text: ReturnType<typeof getWorkspaceText>
  item: ItemWorkspaceEntry | null
  textureState: ItemTextureAssetState | null
  heroChips: HeroChip[]
  signalCards: SignalCard[]
  infoRows: AsideRow[]
  resourceRows: AsideRow[]
  sourceCards: SourceCard[]
  recipeUseCards: UseCard[]
  machineUseCards: UseCard[]
  recipeOutputCards: UseCard[]
  specificSections: AsideSection[]
  activeDetailTab: DetailTab
  onDetailTabChange: (tab: DetailTab) => void
  itemLookup: Map<string, ItemWorkspaceEntry>
  textureStatesByAssetName: Record<string, ItemTextureAssetState>
}) {
  const detailTabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'info', label: text.infoTab },
    { id: 'relations', label: text.relationsTab },
    { id: 'resources', label: text.resourcesTab },
  ]

  if (!item) {
    return (
      <section className="panel-surface h-full">
        <div className="panel-header">
          <div>
            <p className="panel-title">{text.detailTitle}</p>
            <p className="panel-subtitle">{copy.workspaceEmpty}</p>
          </div>
        </div>
        <div className="panel-body flex h-full min-h-0 items-center justify-center p-6 text-center">
          <p className="max-w-md text-sm text-[var(--text-secondary)]">{copy.workspaceEmpty}</p>
        </div>
      </section>
    )
  }

  const hasRelations = sourceCards.length > 0 || recipeUseCards.length > 0 || machineUseCards.length > 0 || recipeOutputCards.length > 0
  const giftCount = item.lovedBy.length + item.likedBy.length
  const customFields = Object.entries(item.customFields)
  const heroSpriteFrame = getContainedItemSpriteFrame(item, 128, 6, 12, 80)

  return (
    <section className="panel-surface h-full">
      <div className="panel-header">
        <div>
          <p className="panel-title">{text.detailTitle}</p>
          <p className="panel-subtitle">{item.displayName}</p>
        </div>
        <span className="dock-chip">{item.qualifiedItemId}</span>
      </div>
      <div className="mx-5 mb-5 overflow-hidden rounded-[24px] border border-[var(--border-color)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--bg-elevated)_94%,transparent),color-mix(in_srgb,var(--accent)_12%,var(--bg-panel)))] px-5 py-5">
        <div className="grid gap-5 lg:grid-cols-[160px_minmax(0,1fr)]">
          <div className="panel-section flex min-h-[160px] items-center justify-center bg-[radial-gradient(circle_at_30%_20%,color-mix(in_srgb,var(--accent)_26%,transparent),transparent_38%),radial-gradient(circle_at_70%_78%,rgba(255,255,255,0.08),transparent_34%),var(--bg-panel)] p-5">
            <ItemSprite
              item={item}
              textureState={textureState}
              scale={heroSpriteFrame.scale}
              className="border-white/10 bg-transparent"
              style={{ width: `${heroSpriteFrame.width}px`, height: `${heroSpriteFrame.height}px` }}
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="dock-chip">{copy.kindLabels[item.kind]}</span>
              {item.kindMetaLabel ? <span className="dock-chip">{item.kindMetaLabel}</span> : null}
              {giftCount ? <span className="dock-chip">{copy.giftSectionTitle}</span> : null}
            </div>

            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">{item.displayName}</h2>
            <p className="mt-2 truncate text-sm text-[var(--text-secondary)]">{item.internalName}</p>
            <p className="mt-1 truncate text-xs text-[var(--text-tertiary)]">{item.qualifiedItemId}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {heroChips.map((chip) => (
                <HeroStatChip key={chip.key} chip={chip} />
              ))}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {signalCards.map((card) => (
                <WorkbenchSignalCard key={card.key} card={card} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="panel-body min-h-0 flex-1 overflow-auto px-5 py-5">
        <div className="flex flex-wrap gap-2">
            {detailTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={cx('rounded-full border px-4 py-2 text-sm font-semibold transition-colors', getPillClass(tab.id === activeDetailTab))}
                onClick={() => onDetailTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
        </div>

        <div className="mt-5">
          {activeDetailTab === 'info' ? (
            <div className="space-y-4">
              <DetailSectionCard title={copy.basicsTitle} rows={infoRows} />

              <DetailSectionCard title={text.descriptionTitle}>
                <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">{item.description ?? copy.noDescription}</p>
              </DetailSectionCard>

              <DetailSectionCard title={copy.giftSectionTitle}>
                <div className="mt-3 space-y-3">
                  {giftCount ? (
                    <>
                      <TasteGroup title={copy.giftLoveTitle} entries={item.lovedBy} tone="danger" />
                      <TasteGroup title={copy.giftLikeTitle} entries={item.likedBy} tone="positive" />
                    </>
                  ) : (
                    <EmptyNotice message={text.giftsEmpty} />
                  )}
                </div>
              </DetailSectionCard>

              {specificSections.map((section) => (
                <DetailSectionCard key={section.key} title={section.title} rows={section.rows} />
              ))}
            </div>
          ) : null}

          {activeDetailTab === 'relations' ? (
            <div className="space-y-4">
              {hasRelations ? (
                <>
                  {sourceCards.length ? <SourceGrid cards={sourceCards} copy={copy} itemLookup={itemLookup} textureStatesByAssetName={textureStatesByAssetName} /> : null}
                  {recipeUseCards.length ? <UseGrid title={copy.recipeInputTitle} cards={recipeUseCards} copy={copy} itemLookup={itemLookup} textureStatesByAssetName={textureStatesByAssetName} /> : null}
                  {machineUseCards.length ? <UseGrid title={copy.machineSectionTitle} cards={machineUseCards} copy={copy} itemLookup={itemLookup} textureStatesByAssetName={textureStatesByAssetName} /> : null}
                  {recipeOutputCards.length ? <UseGrid title={copy.recipeOutputTitle} cards={recipeOutputCards} copy={copy} itemLookup={itemLookup} textureStatesByAssetName={textureStatesByAssetName} /> : null}
                </>
              ) : (
                <EmptyNotice message={text.relationsEmpty} />
              )}
            </div>
          ) : null}

          {activeDetailTab === 'resources' ? (
            <div className="space-y-4">
              <DetailSectionCard title={copy.assetTitle} rows={resourceRows} />

              <DetailSectionCard title={text.customFieldsTitle}>
                <div className="mt-3 space-y-2">
                  {customFields.length ? (
                    customFields.map(([key, value]) => (
                      <div key={key} className="panel-section px-3 py-3">
                        {renderKv(key, value)}
                      </div>
                    ))
                  ) : (
                    <EmptyNotice message={text.customFieldsEmpty} />
                  )}
                </div>
              </DetailSectionCard>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function useItemWorkspaceViewModel({
  copy,
  item,
  items,
  filteredItems,
  activeItemId,
  itemFilter,
  itemLookup,
  textureStatesByAssetName,
  onItemFilterChange,
  onSelectItem,
}: ItemWorkspaceProps) {
  const ui = useItemWorkspaceUi()
  const text = useMemo(() => getWorkspaceText(copy), [copy])
  const tabs = useMemo(() => getTabDefinitions(copy, items), [copy, items])
  const matchedKeys = useMemo(() => new Set(filteredItems.map((entry) => entry.key)), [filteredItems])

  const visibleItems = useMemo(
    () => items.filter((entry) => ui.activeBrowseTab === 'all' || getItemBrowseCategories(entry).includes(ui.activeBrowseTab)),
    [ui.activeBrowseTab, items],
  )
  const matchingVisibleItems = useMemo(
    () => visibleItems.filter((entry) => !itemFilter || matchedKeys.has(entry.key)),
    [itemFilter, matchedKeys, visibleItems],
  )

  const activeTextureState = item?.textureAssetName ? (textureStatesByAssetName[item.textureAssetName] ?? null) : null
  const heroChips = item ? buildHeroChips(item, copy) : []
  const sourceCards = item ? buildSourceCards(item, copy) : []
  const recipeUseCards = item ? item.recipesUsing.map((recipe) => createRecipeUseCard(recipe, item, copy)) : []
  const machineUseCards = item ? item.machineInputs.map((machine) => createMachineUseCard(machine, item, copy)) : []
  const recipeOutputCards = item ? item.recipesProduced.map((recipe) => createRecipeUseCard(recipe, item, copy)) : []
  const signalCards = item ? buildSignalCards(item, copy, sourceCards, recipeUseCards, machineUseCards, recipeOutputCards) : []
  const infoRows = item ? buildInfoRows(item, copy) : []
  const resourceRows = item ? buildResourceRows(item, activeTextureState, copy, text.spriteSizeLabel) : []
  const specificSections = item ? buildSpecificSections(item, copy) : []

  const handleSelectItem = useCallback((itemKey: string, tab: DetailTab = 'info') => {
    ui.setActiveDetailTab(tab)
    onSelectItem(itemKey)
  }, [onSelectItem, ui])

  return {
    copy,
    item,
    items,
    activeItemId,
    itemFilter,
    itemLookup,
    textureStatesByAssetName,
    onItemFilterChange,
    text,
    tabs,
    visibleItems,
    matchingVisibleItems,
    activeTextureState,
    heroChips,
    sourceCards,
    recipeUseCards,
    machineUseCards,
    recipeOutputCards,
    signalCards,
    infoRows,
    resourceRows,
    specificSections,
    activeBrowseTab: ui.activeBrowseTab,
    setActiveBrowseTab: ui.setActiveBrowseTab,
    activeDetailTab: ui.activeDetailTab,
    setActiveDetailTab: ui.setActiveDetailTab,
    hoveredItemId: ui.hoveredItemId,
    setHoveredItemId: ui.setHoveredItemId,
    handleSelectItem,
  }
}

export function ItemNavigationPanel(props: ItemWorkspaceProps) {
  const view = useItemWorkspaceViewModel(props)

  return (
    <NavigationPane
      copy={view.copy}
      text={view.text}
      tabs={view.tabs}
      activeBrowseTab={view.activeBrowseTab}
      onBrowseTabChange={view.setActiveBrowseTab}
      itemFilter={view.itemFilter}
      onItemFilterChange={view.onItemFilterChange}
      item={view.item}
      textureState={view.activeTextureState}
      visibleCount={view.matchingVisibleItems.length}
      totalVisibleCount={view.visibleItems.length}
    />
  )
}

export function ItemCatalogPanel(props: ItemWorkspaceProps) {
  const view = useItemWorkspaceViewModel(props)

  return (
    <CatalogPane
      copy={view.copy}
      text={view.text}
      items={view.matchingVisibleItems}
      activeItemId={view.activeItemId}
      textureStatesByAssetName={view.textureStatesByAssetName}
      onSelectItem={view.handleSelectItem}
      hoveredItemId={view.hoveredItemId}
      onHoverItem={view.setHoveredItemId}
    />
  )
}

export function ItemDetailPanel(props: ItemWorkspaceProps) {
  const view = useItemWorkspaceViewModel(props)

  return (
    <DetailPane
      copy={view.copy}
      text={view.text}
      item={view.item}
      textureState={view.activeTextureState}
      heroChips={view.heroChips}
      signalCards={view.signalCards}
      infoRows={view.infoRows}
      resourceRows={view.resourceRows}
      sourceCards={view.sourceCards}
      recipeUseCards={view.recipeUseCards}
      machineUseCards={view.machineUseCards}
      recipeOutputCards={view.recipeOutputCards}
      specificSections={view.specificSections}
      activeDetailTab={view.activeDetailTab}
      onDetailTabChange={view.setActiveDetailTab}
      itemLookup={view.itemLookup}
      textureStatesByAssetName={view.textureStatesByAssetName}
    />
  )
}

export default function ItemWorkspace({
  copy,
  item,
  items,
  filteredItems,
  activeItemId,
  itemFilter,
  itemLookup,
  textureStatesByAssetName,
  onItemFilterChange,
  onSelectItem,
}: ItemWorkspaceProps) {
  const [activeBrowseTab, setActiveBrowseTab] = useState<ItemBrowseCategory>('all')
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('info')
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null)

  const text = useMemo(() => getWorkspaceText(copy), [copy])
  const tabs = useMemo(() => getTabDefinitions(copy, items), [copy, items])
  const matchedKeys = useMemo(() => new Set(filteredItems.map((entry) => entry.key)), [filteredItems])

  const visibleItems = useMemo(
    () => items.filter((entry) => activeBrowseTab === 'all' || getItemBrowseCategories(entry).includes(activeBrowseTab)),
    [activeBrowseTab, items],
  )
  const matchingVisibleItems = useMemo(
    () => visibleItems.filter((entry) => !itemFilter || matchedKeys.has(entry.key)),
    [itemFilter, matchedKeys, visibleItems],
  )

  const activeTextureState = item?.textureAssetName ? (textureStatesByAssetName[item.textureAssetName] ?? null) : null
  const heroChips = item ? buildHeroChips(item, copy) : []
  const sourceCards = item ? buildSourceCards(item, copy) : []
  const recipeUseCards = item ? item.recipesUsing.map((recipe) => createRecipeUseCard(recipe, item, copy)) : []
  const machineUseCards = item ? item.machineInputs.map((machine) => createMachineUseCard(machine, item, copy)) : []
  const recipeOutputCards = item ? item.recipesProduced.map((recipe) => createRecipeUseCard(recipe, item, copy)) : []
  const signalCards = item ? buildSignalCards(item, copy, sourceCards, recipeUseCards, machineUseCards, recipeOutputCards) : []
  const infoRows = item ? buildInfoRows(item, copy) : []
  const resourceRows = item ? buildResourceRows(item, activeTextureState, copy, text.spriteSizeLabel) : []
  const specificSections = item ? buildSpecificSections(item, copy) : []

  const handleSelectItem = useCallback((itemKey: string, tab: DetailTab = 'info') => {
    setActiveDetailTab(tab)
    onSelectItem(itemKey)
  }, [onSelectItem])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-app)]">
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 xl:px-5 xl:py-5">
        <div className="mx-auto grid w-full max-w-[1760px] gap-5 xl:grid-cols-[minmax(220px,0.72fr)_minmax(420px,1.18fr)_minmax(520px,1.6fr)]">
          <NavigationPane
            copy={copy}
            text={text}
            tabs={tabs}
            activeBrowseTab={activeBrowseTab}
            onBrowseTabChange={setActiveBrowseTab}
            itemFilter={itemFilter}
            onItemFilterChange={onItemFilterChange}
            item={item}
            textureState={activeTextureState}
            visibleCount={matchingVisibleItems.length}
            totalVisibleCount={visibleItems.length}
          />

          <CatalogPane
            copy={copy}
            text={text}
            items={matchingVisibleItems}
            activeItemId={activeItemId}
            textureStatesByAssetName={textureStatesByAssetName}
            onSelectItem={handleSelectItem}
            hoveredItemId={hoveredItemId}
            onHoverItem={setHoveredItemId}
          />

          <DetailPane
            copy={copy}
            text={text}
            item={item}
            textureState={activeTextureState}
            heroChips={heroChips}
            signalCards={signalCards}
            infoRows={infoRows}
            resourceRows={resourceRows}
            sourceCards={sourceCards}
            recipeUseCards={recipeUseCards}
            machineUseCards={machineUseCards}
            recipeOutputCards={recipeOutputCards}
            specificSections={specificSections}
            activeDetailTab={activeDetailTab}
            onDetailTabChange={setActiveDetailTab}
            itemLookup={itemLookup}
            textureStatesByAssetName={textureStatesByAssetName}
          />
        </div>
      </div>
    </div>
  )
}
