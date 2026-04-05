import {
  Armchair,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
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
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type WheelEvent } from 'react'
import { useItemsCopy } from '../lib/app/localeContext'
import { cx } from '../lib/cx'
import type { BrowserSourceMode, ModBrowserGroup, ModSourceEntry } from '../lib/app/modAssetIndex'
import {
  getContainedItemSpriteFrame,
  getContainedItemSpriteScale,
  type ItemBrowseCategory,
  type ItemGiftTasteNpc,
  type ItemMachineLink,
  type ItemRecipeEntry,
  type ItemTextureAssetState,
  type ItemWorkspaceEntry,
} from '../lib/app/itemWorkspace'
import { ItemSprite } from './ItemSprite'
import { BrowserSourceSwitch } from './ui/BrowserSourceSwitch'
import { ModSourceList } from './ui/ModSourceList'

type ItemsCopy = import('../lib/editor-shell').ItemsPanelCopy

type ItemWorkspaceProps = {
  item: ItemWorkspaceEntry | null
  items: ItemWorkspaceEntry[]
  filteredItems: ItemWorkspaceEntry[]
  browserSourceMode: BrowserSourceMode
  onBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  modItemGroups: ModBrowserGroup<ItemWorkspaceEntry>[]
  activeItemModSources: ModSourceEntry[]
  activeItemId: string | null
  itemFilter: string
  itemLookup: Map<string, ItemWorkspaceEntry>
  textureStatesByAssetName: Record<string, ItemTextureAssetState>
  ensureTextureAssetStates: (assetNames: string[]) => void
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

function formatPrice(value: number | null | undefined, copy: ItemsCopy) {
  return value != null ? `${value}G` : copy.noneLabel
}

function formatEdibility(item: ItemWorkspaceEntry, copy: ItemsCopy) {
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

function buildHeroChips(item: ItemWorkspaceEntry, copy: ItemsCopy) {
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

function buildSourceCards(item: ItemWorkspaceEntry, copy: ItemsCopy) {
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

function createRecipeUseCard(recipe: ItemRecipeEntry, item: ItemWorkspaceEntry, copy: ItemsCopy): UseCard {
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

function createMachineUseCard(machine: ItemMachineLink, item: ItemWorkspaceEntry, copy: ItemsCopy): UseCard {
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

function getTabDefinitions(copy: ItemsCopy, items: ItemWorkspaceEntry[]): BrowseTab[] {
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

function buildSignalCards(
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

function buildSpecificSections(item: ItemWorkspaceEntry, copy: ItemsCopy): AsideSection[] {
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
  itemLookup,
  textureStatesByAssetName,
}: {
  cards: SourceCard[]
  itemLookup: Map<string, ItemWorkspaceEntry>
  textureStatesByAssetName: Record<string, ItemTextureAssetState>
}) {
  const copy = useItemsCopy()
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
  itemLookup,
  textureStatesByAssetName,
}: {
  title: string
  cards: UseCard[]
  itemLookup: Map<string, ItemWorkspaceEntry>
  textureStatesByAssetName: Record<string, ItemTextureAssetState>
}) {
  const copy = useItemsCopy()
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
  item,
}: {
  item: ItemWorkspaceEntry | null
}) {
  const copy = useItemsCopy()
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
  currentPage: number
  itemsPerPage: number
}

const DEFAULT_ITEM_WORKSPACE_UI_STATE: ItemWorkspaceUiState = {
  activeBrowseTab: 'all',
  activeDetailTab: 'info',
  hoveredItemId: null,
  currentPage: 1,
  itemsPerPage: 48,
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
    updateItemWorkspaceUiState({ activeBrowseTab: tab, currentPage: 1 })
  }, [])

  const setActiveDetailTab = useCallback((tab: DetailTab) => {
    updateItemWorkspaceUiState({ activeDetailTab: tab })
  }, [])

  const setHoveredItemId = useCallback((itemKey: string | null) => {
    updateItemWorkspaceUiState({ hoveredItemId: itemKey })
  }, [])

  const setCurrentPage = useCallback((page: number) => {
    updateItemWorkspaceUiState({ currentPage: page })
  }, [])

  const setItemsPerPage = useCallback((itemsPerPage: number) => {
    updateItemWorkspaceUiState({ itemsPerPage })
  }, [])

  return {
    ...state,
    setActiveBrowseTab,
    setActiveDetailTab,
    setHoveredItemId,
    setCurrentPage,
    setItemsPerPage,
  }
}

type PaginationToken =
  | {
      type: 'page'
      value: number
    }
  | {
      type: 'ellipsis'
      key: string
    }

const CATALOG_GRID_GAP_PX = 8
const CATALOG_CARD_MIN_HEIGHT_PX = 118
const CATALOG_GRID_MIN_ROWS = 2

function getPageCount(totalItems: number, itemsPerPage: number) {
  return Math.max(1, Math.ceil(totalItems / itemsPerPage))
}

function clampPage(page: number, totalItems: number, itemsPerPage: number) {
  return Math.min(getPageCount(totalItems, itemsPerPage), Math.max(1, page))
}

function paginateItems<T>(items: T[], currentPage: number, itemsPerPage: number) {
  const safePage = clampPage(currentPage, items.length, itemsPerPage)
  const startIndex = (safePage - 1) * itemsPerPage
  return {
    items: items.slice(startIndex, startIndex + itemsPerPage),
    currentPage: safePage,
    pageCount: getPageCount(items.length, itemsPerPage),
    startIndex,
  }
}

function getCatalogColumnCount(width: number) {
  if (width >= 1536) {
    return 6
  }

  if (width >= 1280) {
    return 5
  }

  if (width >= 640) {
    return 4
  }

  return 3
}

function computeCatalogGridMetrics(width: number, height: number) {
  const columns = getCatalogColumnCount(width)
  const rows = Math.max(CATALOG_GRID_MIN_ROWS, Math.floor((height + CATALOG_GRID_GAP_PX) / (CATALOG_CARD_MIN_HEIGHT_PX + CATALOG_GRID_GAP_PX)))

  return {
    columns,
    rows,
    itemsPerPage: Math.max(columns * rows, columns),
  }
}

function buildPaginationTokens(currentPage: number, pageCount: number): PaginationToken[] {
  if (pageCount <= 1) {
    return [{ type: 'page', value: 1 }]
  }

  const pages = new Set<number>([1, pageCount, currentPage - 1, currentPage, currentPage + 1])
  if (currentPage <= 3) {
    pages.add(2)
    pages.add(3)
    pages.add(4)
  }

  if (currentPage >= pageCount - 2) {
    pages.add(pageCount - 1)
    pages.add(pageCount - 2)
    pages.add(pageCount - 3)
  }

  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((left, right) => left - right)

  const tokens: PaginationToken[] = []
  sortedPages.forEach((page, index) => {
    const previousPage = sortedPages[index - 1]
    if (previousPage != null && page - previousPage > 1) {
      tokens.push({ type: 'ellipsis', key: `ellipsis:${previousPage}-${page}` })
    }

    tokens.push({ type: 'page', value: page })
  })

  return tokens
}

function buildSearchPriorityScore(entry: ItemWorkspaceEntry, tokens: string[]) {
  if (!tokens.length) {
    return 0
  }

  const displayName = entry.displayName.toLowerCase()
  const qualifiedItemId = entry.qualifiedItemId.toLowerCase()
  const internalName = entry.internalName.toLowerCase()
  const description = entry.description?.toLowerCase() ?? ''

  return tokens.reduce((score, token) => {
    if (token.startsWith('@')) {
      const needle = token.slice(1)
      if (!needle) {
        return score
      }
      if (qualifiedItemId === needle || entry.itemId.toLowerCase() === needle) {
        return score
      }
      if (qualifiedItemId.startsWith(needle) || entry.itemId.toLowerCase().startsWith(needle)) {
        return score + 1
      }
      if (qualifiedItemId.includes(needle) || entry.itemId.toLowerCase().includes(needle)) {
        return score + 2
      }
      return score + 4
    }

    if (displayName === token) {
      return score
    }
    if (displayName.startsWith(token)) {
      return score + 1
    }
    if (displayName.includes(token)) {
      return score + 2
    }
    if (qualifiedItemId.includes(token)) {
      return score + 3
    }
    if (internalName.includes(token)) {
      return score + 4
    }
    if (description.includes(token)) {
      return score + 5
    }
    return score + 6
  }, 0)
}

function sortItemsBySearchPriority(items: ItemWorkspaceEntry[], rawFilter: string) {
  const tokens = rawFilter
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    .filter(Boolean)

  if (!tokens.length) {
    return items
  }

  return [...items].sort((left, right) => {
    const scoreDiff = buildSearchPriorityScore(left, tokens) - buildSearchPriorityScore(right, tokens)
    if (scoreDiff !== 0) {
      return scoreDiff
    }

    const displayCompare = left.displayName.localeCompare(right.displayName, undefined, { numeric: true, sensitivity: 'base' })
    if (displayCompare !== 0) {
      return displayCompare
    }

    return left.qualifiedItemId.localeCompare(right.qualifiedItemId, undefined, { numeric: true, sensitivity: 'base' })
  })
}

function useCatalogGridMetrics(itemsPerPage: number, onItemsPerPageChange: (itemsPerPage: number) => void) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [metrics, setMetrics] = useState(() => ({
    columns: 4,
    rows: Math.max(CATALOG_GRID_MIN_ROWS, Math.ceil(itemsPerPage / 4)),
  }))

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    let frameId = 0

    const measure = () => {
      frameId = 0
      const nextMetrics = computeCatalogGridMetrics(viewport.clientWidth, viewport.clientHeight)

      setMetrics((current) => {
        if (current.columns === nextMetrics.columns && current.rows === nextMetrics.rows) {
          return current
        }

        return {
          columns: nextMetrics.columns,
          rows: nextMetrics.rows,
        }
      })

      if (nextMetrics.itemsPerPage !== itemsPerPage) {
        onItemsPerPageChange(nextMetrics.itemsPerPage)
      }
    }

    const scheduleMeasure = () => {
      if (frameId) {
        return
      }

      frameId = window.requestAnimationFrame(measure)
    }

    scheduleMeasure()

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      scheduleMeasure()
    })
    resizeObserver?.observe(viewport)

    const handleWindowResize = () => {
      scheduleMeasure()
    }

    window.addEventListener('resize', handleWindowResize)

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
      window.removeEventListener('resize', handleWindowResize)
      resizeObserver?.disconnect()
    }
  }, [itemsPerPage, onItemsPerPageChange])

  return {
    viewportRef,
    columns: metrics.columns,
    rows: metrics.rows,
  }
}

function getWorkspaceText(copy: ItemsCopy) {
  const isEnglish = copy.statsAllLabel === 'All'

  return {
    catalogTitle: isEnglish ? 'Catalog' : '目录',
    detailTitle: isEnglish ? 'Inspector' : '检查器',
    viewTitle: isEnglish ? 'View Controls' : '视图控制',
    railTitle: isEnglish ? 'Workspace Rail' : '工作区导航',
    filtersTitle: copy.filtersTitle,
    selectionTitle: isEnglish ? 'Current Focus' : '当前焦点',
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

function buildInfoRows(item: ItemWorkspaceEntry, copy: ItemsCopy) {
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
  text,
  browserSourceMode,
  onBrowserSourceModeChange,
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
  text: ReturnType<typeof getWorkspaceText>
  browserSourceMode: BrowserSourceMode
  onBrowserSourceModeChange: (mode: BrowserSourceMode) => void
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
  const copy = useItemsCopy()
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

        <div className="mb-4">
          <BrowserSourceSwitch value={browserSourceMode} onChange={onBrowserSourceModeChange} />
        </div>

        {browserSourceMode === 'original' ? (
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
        ) : (
          <div className="panel-section p-3 text-sm text-[var(--text-secondary)]">Grouped by mod. Only modified items are shown.</div>
        )}

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
  text,
  browserSourceMode,
  modItemGroups,
  items,
  totalItems,
  currentPage,
  pageCount,
  itemsPerPage,
  activeItemId,
  textureStatesByAssetName,
  onSelectItem,
  hoveredItemId,
  onHoverItem,
  onPageChange,
  onItemsPerPageChange,
}: {
  text: ReturnType<typeof getWorkspaceText>
  browserSourceMode: BrowserSourceMode
  modItemGroups: ModBrowserGroup<ItemWorkspaceEntry>[]
  items: ItemWorkspaceEntry[]
  totalItems: number
  currentPage: number
  pageCount: number
  itemsPerPage: number
  activeItemId: string | null
  textureStatesByAssetName: Record<string, ItemTextureAssetState>
  onSelectItem: (itemKey: string, tab?: DetailTab) => void
  hoveredItemId: string | null
  onHoverItem: (itemKey: string | null) => void
  onPageChange: (page: number) => void
  onItemsPerPageChange: (itemsPerPage: number) => void
}) {
  const copy = useItemsCopy()
  const hoveredItem = hoveredItemId ? (items.find((entry) => entry.key === hoveredItemId) ?? null) : null
  const paginationTokens = useMemo(() => buildPaginationTokens(currentPage, pageCount), [currentPage, pageCount])
  const { viewportRef, columns, rows } = useCatalogGridMetrics(itemsPerPage, onItemsPerPageChange)
  const wheelAccumulatorRef = useRef(0)
  const lastWheelFlipRef = useRef(0)
  const rangeStart = totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0
  const rangeEnd = totalItems > 0 ? Math.min(currentPage * itemsPerPage, totalItems) : 0
  const emptySlotCount = Math.max(0, itemsPerPage - items.length)

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLElement>) => {
      if (browserSourceMode === 'mod' || pageCount <= 1 || event.ctrlKey || Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
        return
      }

      event.preventDefault()
      const now = performance.now()
      if (now - lastWheelFlipRef.current < 180) {
        return
      }

      if (wheelAccumulatorRef.current !== 0 && Math.sign(wheelAccumulatorRef.current) !== Math.sign(event.deltaY)) {
        wheelAccumulatorRef.current = 0
      }

      wheelAccumulatorRef.current += event.deltaY
      if (Math.abs(wheelAccumulatorRef.current) < 56) {
        return
      }

      const nextPage = Math.max(1, Math.min(pageCount, currentPage + (wheelAccumulatorRef.current > 0 ? 1 : -1)))
      wheelAccumulatorRef.current = 0
      if (nextPage !== currentPage) {
        lastWheelFlipRef.current = now
        onPageChange(nextPage)
      }
    },
    [browserSourceMode, currentPage, onPageChange, pageCount],
  )

  return (
    <section className="panel-surface relative h-full" onWheel={handleWheel}>
      <div className="panel-header">
        <div className="min-w-0">
          <p className="panel-title">{text.catalogTitle}</p>
          <p className="panel-subtitle">
            {browserSourceMode === 'mod'
              ? `${modItemGroups.reduce((total, group) => total + group.items.length, 0)} ${text.catalogItemsLabel}`
              : `${totalItems} ${text.catalogItemsLabel} / ${itemsPerPage} ${text.catalogItemsPerPageLabel}`}
          </p>
        </div>
        {browserSourceMode === 'original' ? (
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent)_12%,var(--bg-panel))] px-3 py-1 text-[11px] font-semibold text-[var(--text-primary)]">
              {columns} x {rows} {text.catalogGridLabel}
            </span>
          </div>
        ) : null}
      </div>
      <div className="panel-body flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        {browserSourceMode === 'mod' ? (
          modItemGroups.length ? (
            <div className="min-h-0 flex-1 space-y-4 overflow-auto">
              {modItemGroups.map((group) => (
                <section key={group.modPath} className="panel-section rounded-[24px] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{group.modName}</p>
                      <p className="truncate text-xs text-[var(--text-secondary)]">{group.items.length} modified items</p>
                    </div>
                    <span className="dock-chip shrink-0">{group.items.length}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {group.items.map(({ value: entry, targets }) => {
                      const textureState = entry.textureAssetName ? (textureStatesByAssetName[entry.textureAssetName] ?? null) : null
                      const isActive = entry.key === activeItemId

                      return (
                        <button
                          key={`${group.modId}:${entry.key}`}
                          type="button"
                          className={cx(
                            'panel-list-card flex items-center gap-3 px-3 py-3 text-left transition-colors',
                            isActive && 'border-[color-mix(in_srgb,var(--accent)_40%,var(--border-color))] bg-[var(--bg-active)]',
                          )}
                          onClick={() => onSelectItem(entry.key)}
                          onMouseEnter={() => onHoverItem(entry.key)}
                          onMouseLeave={() => onHoverItem(null)}
                        >
                          <div className="panel-list-card flex h-12 w-12 shrink-0 items-center justify-center px-2 py-2">
                            <ItemSprite item={entry} textureState={textureState} scale={getContainedItemSpriteScale(entry, 32, 2)} className="h-8 w-8" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{entry.displayName}</p>
                            <p className="truncate text-xs text-[var(--text-secondary)]">{targets[0] ?? entry.qualifiedItemId}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <EmptyNotice message="No modded items match the current filter." />
          )
        ) : items.length ? (
          <div ref={viewportRef} className="min-h-0 flex-1 overflow-hidden">
            <div
              className="grid h-full"
              style={{
                gap: `${CATALOG_GRID_GAP_PX}px`,
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              }}
            >
              {items.map((entry) => {
                const textureState = entry.textureAssetName ? (textureStatesByAssetName[entry.textureAssetName] ?? null) : null
                const isActive = entry.key === activeItemId

                return (
                  <button
                    key={entry.key}
                    type="button"
                    className={cx(
                      'group flex h-full min-h-0 flex-col items-center justify-center rounded-[22px] border px-2 py-3 text-center transition-all duration-200',
                      isActive
                        ? 'border-[color-mix(in_srgb,var(--accent)_44%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_18%,transparent),color-mix(in_srgb,var(--accent)_10%,var(--bg-panel)))] shadow-[0_18px_36px_color-mix(in_srgb,var(--accent)_16%,transparent)]'
                        : 'border-[var(--border-color)] bg-[linear-gradient(180deg,var(--bg-panel),color-mix(in_srgb,var(--bg-panel-muted)_68%,transparent))] hover:-translate-y-0.5 hover:bg-[var(--bg-panel-muted)] hover:shadow-[0_14px_28px_rgba(15,23,42,0.10)]',
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
                    <span className="mb-2 inline-flex rounded-full border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                      {copy.kindLabels[entry.kind]}
                    </span>
                    <ItemSprite item={entry} textureState={textureState} scale={getContainedItemSpriteScale(entry, 40, 1.55)} className="h-10 w-10 shrink-0" />
                    <span className="mt-2 line-clamp-2 text-[11px] font-semibold leading-4 text-[var(--text-primary)]">{entry.displayName}</span>
                    <span className="mt-1 line-clamp-1 text-[10px] leading-4 text-[var(--text-tertiary)]">{entry.qualifiedItemId}</span>
                  </button>
                )
              })}

              {Array.from({ length: emptySlotCount }, (_, index) => (
                <div
                  key={`empty-slot:${currentPage}:${index}`}
                  aria-hidden="true"
                  className="rounded-[22px] border border-dashed border-[color-mix(in_srgb,var(--border-color)_85%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-panel-muted)_55%,transparent),transparent)]"
                />
              ))}
            </div>
          </div>
        ) : (
          <EmptyNotice message={copy.browserFilteredEmpty} />
        )}

        {browserSourceMode === 'original' && totalItems > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[var(--border-color)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-panel)_90%,transparent),color-mix(in_srgb,var(--bg-panel-muted)_82%,transparent))] px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--bg-app)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)]">
                {rangeStart}-{rangeEnd}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">{text.catalogPageLabel} {currentPage} / {pageCount}</span>
              <span className="text-[11px] text-[var(--text-tertiary)]">{text.catalogWheelHint}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-full border border-[var(--border-color)] bg-[var(--bg-app)] px-3 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-panel)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                title={text.previousPageLabel}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{text.previousPageLabel}</span>
              </button>
              <div className="flex items-center gap-1 rounded-full border border-[var(--border-color)] bg-[var(--bg-app)] p-1">
                {paginationTokens.map((token) => {
                  if (token.type === 'ellipsis') {
                    return (
                      <span
                        key={token.key}
                        className="inline-flex min-w-8 items-center justify-center px-1 text-xs font-semibold text-[var(--text-tertiary)]"
                      >
                        ...
                      </span>
                    )
                  }

                  return (
                    <button
                      key={`page:${token.value}`}
                      type="button"
                      className={cx(
                        'min-w-9 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                        token.value === currentPage
                          ? 'bg-[var(--accent)] text-white shadow-[0_10px_22px_color-mix(in_srgb,var(--accent)_24%,transparent)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel)] hover:text-[var(--text-primary)]',
                      )}
                      onClick={() => onPageChange(token.value)}
                    >
                      {token.value}
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-full border border-[var(--border-color)] bg-[var(--bg-app)] px-3 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-panel)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
                disabled={currentPage >= pageCount}
                title={text.nextPageLabel}
              >
                <span className="hidden sm:inline">{text.nextPageLabel}</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {browserSourceMode === 'original' ? <ItemTooltip item={hoveredItem} /> : null}
    </section>
  )
}

function DetailPane({
  text,
  item,
  textureState,
  heroChips,
  signalCards,
  infoRows,
  resourceRows,
  modSources,
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
  text: ReturnType<typeof getWorkspaceText>
  item: ItemWorkspaceEntry | null
  textureState: ItemTextureAssetState | null
  heroChips: HeroChip[]
  signalCards: SignalCard[]
  infoRows: AsideRow[]
  resourceRows: AsideRow[]
  modSources: ModSourceEntry[]
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
  const copy = useItemsCopy()
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
                  {sourceCards.length ? <SourceGrid cards={sourceCards} itemLookup={itemLookup} textureStatesByAssetName={textureStatesByAssetName} /> : null}
                  {recipeUseCards.length ? <UseGrid title={copy.recipeInputTitle} cards={recipeUseCards} itemLookup={itemLookup} textureStatesByAssetName={textureStatesByAssetName} /> : null}
                  {machineUseCards.length ? <UseGrid title={copy.machineSectionTitle} cards={machineUseCards} itemLookup={itemLookup} textureStatesByAssetName={textureStatesByAssetName} /> : null}
                  {recipeOutputCards.length ? <UseGrid title={copy.recipeOutputTitle} cards={recipeOutputCards} itemLookup={itemLookup} textureStatesByAssetName={textureStatesByAssetName} /> : null}
                </>
              ) : (
                <EmptyNotice message={text.relationsEmpty} />
              )}
            </div>
          ) : null}

          {activeDetailTab === 'resources' ? (
            <div className="space-y-4">
              <DetailSectionCard title={copy.assetTitle} rows={resourceRows} />

              <DetailSectionCard title="Mod Sources">
                <div className="mt-3">
                  <ModSourceList sources={modSources} />
                </div>
              </DetailSectionCard>

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
  item,
  items,
  filteredItems,
  browserSourceMode,
  onBrowserSourceModeChange,
  modItemGroups,
  activeItemModSources,
  activeItemId,
  itemFilter,
  itemLookup,
  textureStatesByAssetName,
  ensureTextureAssetStates,
  onItemFilterChange,
  onSelectItem,
}: ItemWorkspaceProps) {
  const copy = useItemsCopy()
  const ui = useItemWorkspaceUi()
  const text = useMemo(() => getWorkspaceText(copy), [copy])
  const tabs = useMemo(() => getTabDefinitions(copy, items), [copy, items])
  const matchedKeys = useMemo(() => new Set(filteredItems.map((entry) => entry.key)), [filteredItems])

  const visibleItems = useMemo(
    () => items.filter((entry) => ui.activeBrowseTab === 'all' || entry.browseCategories.includes(ui.activeBrowseTab)),
    [ui.activeBrowseTab, items],
  )
  const matchingVisibleItems = useMemo(
    () => sortItemsBySearchPriority(visibleItems.filter((entry) => !itemFilter || matchedKeys.has(entry.key)), itemFilter),
    [itemFilter, matchedKeys, visibleItems],
  )
  const pagination = useMemo(
    () => paginateItems(matchingVisibleItems, ui.currentPage, ui.itemsPerPage),
    [matchingVisibleItems, ui.currentPage, ui.itemsPerPage],
  )
  const paginatedItems = pagination.items
  const currentPage = pagination.currentPage
  const pageCount = pagination.pageCount

  useEffect(() => {
    if (currentPage !== ui.currentPage) {
      ui.setCurrentPage(currentPage)
    }
  }, [currentPage, ui])

  useEffect(() => {
    const assetNames =
      browserSourceMode === 'mod'
        ? modItemGroups.flatMap((group) => group.items.flatMap(({ value }) => (value.textureAssetName ? [value.textureAssetName] : [])))
        : paginatedItems.flatMap((entry) => (entry.textureAssetName ? [entry.textureAssetName] : []))
    ensureTextureAssetStates(assetNames)
  }, [browserSourceMode, ensureTextureAssetStates, modItemGroups, paginatedItems])

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

  const handleItemFilterChange = useCallback(
    (value: string) => {
      ui.setCurrentPage(1)
      onItemFilterChange(value)
    },
    [onItemFilterChange, ui],
  )

  return {
    item,
    items,
    browserSourceMode,
    onBrowserSourceModeChange,
    modItemGroups,
    activeItemModSources,
    activeItemId,
    itemFilter,
    itemLookup,
    textureStatesByAssetName,
    onItemFilterChange: handleItemFilterChange,
    text,
    tabs,
    visibleItems,
    matchingVisibleItems,
    navigationVisibleCount:
      browserSourceMode === 'mod'
        ? modItemGroups.reduce((total, group) => total + group.items.length, 0)
        : matchingVisibleItems.length,
    navigationTotalVisibleCount:
      browserSourceMode === 'mod'
        ? modItemGroups.reduce((total, group) => total + group.items.length, 0)
        : visibleItems.length,
    paginatedItems,
    currentPage,
    pageCount,
    itemsPerPage: ui.itemsPerPage,
    activeTextureState,
    heroChips,
    sourceCards,
    recipeUseCards,
    machineUseCards,
    recipeOutputCards,
    signalCards,
    infoRows,
    resourceRows,
    modSources: activeItemModSources,
    specificSections,
    activeBrowseTab: ui.activeBrowseTab,
    setActiveBrowseTab: ui.setActiveBrowseTab,
    setCurrentPage: ui.setCurrentPage,
    setItemsPerPage: ui.setItemsPerPage,
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
      text={view.text}
      browserSourceMode={view.browserSourceMode}
      onBrowserSourceModeChange={view.onBrowserSourceModeChange}
      tabs={view.tabs}
      activeBrowseTab={view.activeBrowseTab}
      onBrowseTabChange={view.setActiveBrowseTab}
      itemFilter={view.itemFilter}
      onItemFilterChange={view.onItemFilterChange}
      item={view.item}
      textureState={view.activeTextureState}
      visibleCount={view.navigationVisibleCount}
      totalVisibleCount={view.navigationTotalVisibleCount}
    />
  )
}

export function ItemCatalogPanel(props: ItemWorkspaceProps) {
  const view = useItemWorkspaceViewModel(props)

  return (
    <CatalogPane
      text={view.text}
      browserSourceMode={view.browserSourceMode}
      modItemGroups={view.modItemGroups}
      items={view.paginatedItems}
      totalItems={view.matchingVisibleItems.length}
      currentPage={view.currentPage}
      pageCount={view.pageCount}
      itemsPerPage={view.itemsPerPage}
      activeItemId={view.activeItemId}
      textureStatesByAssetName={view.textureStatesByAssetName}
      onSelectItem={view.handleSelectItem}
      hoveredItemId={view.hoveredItemId}
      onHoverItem={view.setHoveredItemId}
      onPageChange={view.setCurrentPage}
      onItemsPerPageChange={view.setItemsPerPage}
    />
  )
}

export function ItemDetailPanel(props: ItemWorkspaceProps) {
  const view = useItemWorkspaceViewModel(props)

  return (
    <DetailPane
      text={view.text}
      item={view.item}
      textureState={view.activeTextureState}
      heroChips={view.heroChips}
      signalCards={view.signalCards}
      infoRows={view.infoRows}
      resourceRows={view.resourceRows}
      modSources={view.modSources}
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
  ...props
}: ItemWorkspaceProps) {
  const view = useItemWorkspaceViewModel(props)

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-app)]">
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 xl:px-5 xl:py-5">
        <div className="mx-auto grid w-full max-w-[1760px] gap-5 xl:grid-cols-[minmax(220px,0.72fr)_minmax(420px,1.18fr)_minmax(520px,1.6fr)]">
            <NavigationPane
              text={view.text}
              browserSourceMode={view.browserSourceMode}
              onBrowserSourceModeChange={view.onBrowserSourceModeChange}
              tabs={view.tabs}
              activeBrowseTab={view.activeBrowseTab}
            onBrowseTabChange={view.setActiveBrowseTab}
            itemFilter={view.itemFilter}
              onItemFilterChange={view.onItemFilterChange}
              item={view.item}
              textureState={view.activeTextureState}
              visibleCount={view.navigationVisibleCount}
              totalVisibleCount={view.navigationTotalVisibleCount}
            />

            <CatalogPane
              text={view.text}
              browserSourceMode={view.browserSourceMode}
              modItemGroups={view.modItemGroups}
              items={view.paginatedItems}
            totalItems={view.matchingVisibleItems.length}
            currentPage={view.currentPage}
            pageCount={view.pageCount}
            itemsPerPage={view.itemsPerPage}
            activeItemId={view.activeItemId}
            textureStatesByAssetName={view.textureStatesByAssetName}
            onSelectItem={view.handleSelectItem}
            hoveredItemId={view.hoveredItemId}
            onHoverItem={view.setHoveredItemId}
            onPageChange={view.setCurrentPage}
            onItemsPerPageChange={view.setItemsPerPage}
          />

          <DetailPane
            text={view.text}
            item={view.item}
            textureState={view.activeTextureState}
            heroChips={view.heroChips}
            signalCards={view.signalCards}
            infoRows={view.infoRows}
            resourceRows={view.resourceRows}
            modSources={view.modSources}
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
        </div>
      </div>
    </div>
  )
}

