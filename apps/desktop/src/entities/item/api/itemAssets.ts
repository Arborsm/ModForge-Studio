import { loadTextAsset, resolveLocalizedText } from '@entities/game/api'
import type { LocaleCode } from '@locales'
import {
  getLocalizedImagePathCandidates,
  getLocalizedPathCacheKey,
  loadImageResourceFromPath,
  normalizeCachePathSegment,
} from '@shared/lib/assets'
import {
  CHARACTER_DATA_ASSET_PATH,
  CHARACTER_GIFT_TASTES_ASSET_PATH,
  buildGameContentPath,
} from '@shared/infra/stardew-assets/contentPaths'
import {
  buildNpcGiftTasteBuckets,
  buildUniversalGiftTasteBuckets,
  type GiftTasteBuckets,
  normalizeContextTag,
  normalizeTagFragment,
  parseQualifiedGiftTasteObjectId,
} from '@entities/character/lib/giftTasteHelpers'
import {
  BIG_CRAFTABLE_DATA_ASSET_PATH,
  BOOTS_DATA_ASSET_PATH,
  buildItemSearchAliases,
  COOKING_RECIPES_ASSET_PATH,
  CRAFTING_RECIPES_ASSET_PATH,
  createBigCraftableEntryIndex,
  createBootsEntryIndex,
  createFurnitureEntryIndex,
  createHatEntryIndex,
  createObjectEntryIndex,
  createPantsEntryIndex,
  createRecipeEntryIndex,
  createShirtEntryIndex,
  createToolEntryIndex,
  createTrinketEntryIndex,
  createWeaponEntryIndex,
  CROP_DATA_ASSET_PATH,
  decorateItemBrowseMetadata,
  FISH_DATA_ASSET_PATH,
  FISH_POND_DATA_ASSET_PATH,
  FURNITURE_DATA_ASSET_PATH,
  HAT_DATA_ASSET_PATH,
  hydrateItemRelations,
  LOCATION_DATA_ASSET_PATH,
  MACHINE_DATA_ASSET_PATH,
  OBJECT_DATA_ASSET_PATH,
  PANTS_DATA_ASSET_PATH,
  SHIRT_DATA_ASSET_PATH,
  SHOP_DATA_ASSET_PATH,
  TOOL_DATA_ASSET_PATH,
  TRINKET_DATA_ASSET_PATH,
  WEAPON_DATA_ASSET_PATH,
} from '../model/itemIndex'
import type { ItemBrowseCategory, ItemGiftTasteNpc, ItemKind, ItemTextureAssetState, ItemWorkspaceEntry } from '../model/itemTypes'

const itemEntriesCache = new Map<string, Promise<ItemWorkspaceEntry[]>>()
const imageStateCache = new Map<string, Promise<ItemTextureAssetState>>()

function getRootLocaleCacheKey(rootPath: string, locale: LocaleCode) {
  return `${normalizeCachePathSegment(rootPath)}::${locale}`
}

async function readCachedPromise<T>(cache: Map<string, Promise<T>>, key: string, loader: () => Promise<T>) {
  const cached = cache.get(key)
  if (cached) {
    return cached
  }

  const pending = loader().catch((error) => {
    cache.delete(key)
    throw error
  })

  cache.set(key, pending)
  return pending
}

async function loadImageState(path: string | null, locale: LocaleCode): Promise<ItemTextureAssetState> {
  if (!path) {
    return {
      path: null,
      url: null,
      width: null,
      height: null,
      loading: false,
    }
  }

  const cacheKey = getLocalizedPathCacheKey(path, locale)
  return readCachedPromise(imageStateCache, cacheKey, async () => {
    let lastError: unknown = null

    for (const candidatePath of getLocalizedImagePathCandidates(path, locale)) {
      try {
        const resource = await loadImageResourceFromPath(candidatePath, locale)
        if (!resource) {
          continue
        }
        return {
          path: candidatePath,
          url: resource.url,
          width: resource.width,
          height: resource.height,
          loading: false,
        }
      } catch (error) {
        lastError = error
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  })
}

async function localizeItemEntries(entries: ItemWorkspaceEntry[], rootPath: string, locale: LocaleCode) {
  const localized = await Promise.all(
    entries.map(async (entry) => {
      const displayName = (await resolveLocalizedText(rootPath, locale, entry.rawDisplayName)) ?? entry.rawDisplayName
      const description = (await resolveLocalizedText(rootPath, locale, entry.rawDescription)) ?? entry.rawDescription

      return {
        ...entry,
        displayName,
        description,
        searchText: [
          entry.searchText,
          displayName,
          description,
          buildItemSearchAliases(displayName, description, entry.internalName, entry.qualifiedItemId),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      } satisfies ItemWorkspaceEntry
    }),
  )

  const collator = buildItemCollator(locale)
  return localized.sort((left, right) => compareLocalizedItemEntries(left, right, collator))
}

const ITEM_SORT_CATEGORY_ORDER: ItemBrowseCategory[] = [
  'crop',
  'fish',
  'cooking',
  'mineral',
  'equipment',
  'apparel',
  'furniture',
  'crafting',
]
const ITEM_SORT_KIND_ORDER: ItemKind[] = [
  'object',
  'tool',
  'weapon',
  'boots',
  'trinket',
  'shirt',
  'pants',
  'hat',
  'big-craftable',
  'furniture',
]

function buildItemCollator(locale: LocaleCode) {
  return new Intl.Collator(locale, {
    numeric: true,
    sensitivity: 'base',
  })
}

function getItemPrimaryBrowseCategoryRank(entry: ItemWorkspaceEntry) {
  const rank = ITEM_SORT_CATEGORY_ORDER.findIndex((category) => entry.browseCategories.includes(category))
  return rank >= 0 ? rank : ITEM_SORT_CATEGORY_ORDER.length
}

function getItemKindRank(kind: ItemKind) {
  const rank = ITEM_SORT_KIND_ORDER.indexOf(kind)
  return rank >= 0 ? rank : ITEM_SORT_KIND_ORDER.length
}

function compareLocalizedItemEntries(left: ItemWorkspaceEntry, right: ItemWorkspaceEntry, collator: Intl.Collator) {
  const displayCompare = collator.compare(left.displayName, right.displayName)
  if (displayCompare !== 0) {
    return displayCompare
  }

  const internalCompare = collator.compare(left.internalName, right.internalName)
  if (internalCompare !== 0) {
    return internalCompare
  }

  const itemIdCompare = collator.compare(left.itemId, right.itemId)
  if (itemIdCompare !== 0) {
    return itemIdCompare
  }

  return collator.compare(left.qualifiedItemId, right.qualifiedItemId)
}

function sortItemEntries(entries: ItemWorkspaceEntry[], locale: LocaleCode) {
  const collator = buildItemCollator(locale)

  return [...entries].sort((left, right) => {
    const categoryRankDiff = getItemPrimaryBrowseCategoryRank(left) - getItemPrimaryBrowseCategoryRank(right)
    if (categoryRankDiff !== 0) {
      return categoryRankDiff
    }

    const kindRankDiff = getItemKindRank(left.kind) - getItemKindRank(right.kind)
    if (kindRankDiff !== 0) {
      return kindRankDiff
    }

    const displayCompare = collator.compare(left.displayName, right.displayName)
    if (displayCompare !== 0) {
      return displayCompare
    }

    const itemIdCompare = collator.compare(left.itemId, right.itemId)
    if (itemIdCompare !== 0) {
      return itemIdCompare
    }

    return collator.compare(left.qualifiedItemId, right.qualifiedItemId)
  })
}

type CharacterGiftTarget = {
  internalName: string
  displayName: string
}

const GIFT_TASTE_ORDER: Array<{ key: keyof GiftTasteBuckets; result: 'love' | 'hate' | 'like' | 'dislike' | 'neutral' }> = [
  { key: 'love', result: 'love' },
  { key: 'hate', result: 'hate' },
  { key: 'like', result: 'like' },
  { key: 'dislike', result: 'dislike' },
  { key: 'neutral', result: 'neutral' },
]

function buildCandidateContextTags(entry: ItemWorkspaceEntry) {
  const tags = new Set(entry.contextTags.map((tag) => normalizeContextTag(tag)))
  const normalizedId = normalizeTagFragment(entry.itemId)
  const normalizedName = normalizeTagFragment(entry.internalName)
  const normalizedType = normalizeTagFragment(entry.rawType ?? '')

  if (normalizedId) {
    tags.add(`id_(o)${normalizedId}`)
  }
  if (normalizedName) {
    tags.add(`item_${normalizedName}`)
  }
  if (normalizedType) {
    tags.add(`item_type_${normalizedType}`)
  }

  return tags
}

function hasCategoryToken(tokens: string[], category: number | null) {
  return category != null && category !== 0 && tokens.includes(String(category))
}

function hasContextTagToken(tokens: string[], tags: Set<string>) {
  return tokens.some((token) => {
    const trimmed = token.trim()
    if (!trimmed || trimmed.startsWith('-') || /^\d+$/u.test(trimmed) || /^-\d+$/u.test(trimmed)) {
      return false
    }

    return tags.has(normalizeContextTag(trimmed))
  })
}

function hasItemToken(tokens: string[], candidateId: string) {
  return tokens.some((token) => parseQualifiedGiftTasteObjectId(token)?.toLowerCase() === candidateId.toLowerCase())
}

function resolveGiftTasteForItem(
  npcName: string,
  entry: ItemWorkspaceEntry,
  universalBuckets: GiftTasteBuckets,
  npcBuckets: GiftTasteBuckets,
) {
  const candidateTags = buildCandidateContextTags(entry)

  if (entry.qualifiedItemId.toLowerCase() === '(o)stardroptea') {
    return 'love' as const
  }

  let result: 'love' | 'hate' | 'like' | 'dislike' | 'neutral' = 'neutral'
  let matchedUniversalItem = false
  let matchedUniversalNeutralItem = false

  if (hasCategoryToken(universalBuckets.love, entry.category)) {
    result = 'love'
  } else if (hasCategoryToken(universalBuckets.hate, entry.category)) {
    result = 'hate'
  } else if (hasCategoryToken(universalBuckets.like, entry.category)) {
    result = 'like'
  } else if (hasCategoryToken(universalBuckets.dislike, entry.category)) {
    result = 'dislike'
  }

  if (hasContextTagToken(universalBuckets.love, candidateTags)) {
    result = 'love'
  } else if (hasContextTagToken(universalBuckets.hate, candidateTags)) {
    result = 'hate'
  } else if (hasContextTagToken(universalBuckets.like, candidateTags)) {
    result = 'like'
  } else if (hasContextTagToken(universalBuckets.dislike, candidateTags)) {
    result = 'dislike'
  }

  if (hasItemToken(universalBuckets.love, entry.itemId)) {
    result = 'love'
    matchedUniversalItem = true
  } else if (hasItemToken(universalBuckets.hate, entry.itemId)) {
    result = 'hate'
    matchedUniversalItem = true
  } else if (hasItemToken(universalBuckets.like, entry.itemId)) {
    result = 'like'
    matchedUniversalItem = true
  } else if (hasItemToken(universalBuckets.dislike, entry.itemId)) {
    result = 'dislike'
    matchedUniversalItem = true
  } else if (hasItemToken(universalBuckets.neutral, entry.itemId)) {
    result = 'neutral'
    matchedUniversalItem = true
    matchedUniversalNeutralItem = true
  }

  if (entry.rawType === 'Arch') {
    result = npcName === 'Penny' || npcName === 'Dwarf' ? 'like' : 'dislike'
  }

  if (result === 'neutral' && !matchedUniversalNeutralItem) {
    if (entry.edibility !== -300 && (entry.edibility ?? -300) < 0) {
      result = 'hate'
    } else if ((entry.price ?? 0) < 20) {
      result = 'dislike'
    }
  }

  for (const { key, result: taste } of GIFT_TASTE_ORDER) {
    if (hasItemToken(npcBuckets[key], entry.itemId)) {
      return taste
    }
  }

  for (const { key, result: taste } of GIFT_TASTE_ORDER) {
    if (hasContextTagToken(npcBuckets[key], candidateTags)) {
      return taste
    }
  }

  if (!matchedUniversalItem && entry.category != null && entry.category !== 0) {
    for (const { key, result: taste } of GIFT_TASTE_ORDER) {
      if (hasCategoryToken(npcBuckets[key], entry.category)) {
        return taste
      }
    }
  }

  return result
}

async function buildGiftTargets(rootPath: string, locale: LocaleCode, content: string) {
  const parsed = JSON.parse(content) as Record<string, { DisplayName?: string | null; CanReceiveGifts?: boolean | null }>
  const localizedTargets = await Promise.all(
    Object.entries(parsed).map(async ([internalName, entry]) => {
      if (entry.CanReceiveGifts === false) {
        return null
      }

      const rawDisplayName = entry.DisplayName?.trim() || internalName
      return {
        internalName,
        displayName: (await resolveLocalizedText(rootPath, locale, rawDisplayName)) ?? rawDisplayName,
      } satisfies CharacterGiftTarget
    }),
  )

  return localizedTargets
    .filter((entry): entry is CharacterGiftTarget => entry != null)
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
}

async function attachGiftTasteEntries(
  entries: ItemWorkspaceEntry[],
  rootPath: string,
  locale: LocaleCode,
  charactersContent: string | null,
  giftTastesContent: string | null,
) {
  if (!charactersContent || !giftTastesContent) {
    return entries
  }

  const targets = await buildGiftTargets(rootPath, locale, charactersContent)
  const giftTasteEntries = JSON.parse(giftTastesContent) as Record<string, string>
  const universalBuckets = buildUniversalGiftTasteBuckets(giftTasteEntries)

  return entries.map((entry) => {
    if (entry.kind !== 'object' || !entry.canBeGivenAsGift) {
      return entry
    }

    const lovedBy: ItemGiftTasteNpc[] = []
    const likedBy: ItemGiftTasteNpc[] = []

    for (const target of targets) {
      const npcBuckets = buildNpcGiftTasteBuckets(giftTasteEntries[target.internalName] ?? null)
      const taste = resolveGiftTasteForItem(target.internalName, entry, universalBuckets, npcBuckets)

      if (taste === 'love') {
        lovedBy.push({ ...target, taste })
      } else if (taste === 'like') {
        likedBy.push({ ...target, taste })
      }
    }

    return {
      ...entry,
      lovedBy,
      likedBy,
      searchText: [entry.searchText, ...lovedBy.map((npc) => npc.displayName), ...likedBy.map((npc) => npc.displayName)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    } satisfies ItemWorkspaceEntry
  })
}

/** Loads the full item catalog used by the Items workspace, including localized names, relations, browse metadata, and gift context. */
export async function loadItemWorkspaceEntries(rootPath: string, locale: LocaleCode) {
  const cacheKey = getRootLocaleCacheKey(rootPath, locale)
  return readCachedPromise(itemEntriesCache, cacheKey, async () => {
    const [
      objectsAsset,
      bigCraftablesAsset,
      weaponsAsset,
      toolsAsset,
      shirtsAsset,
      pantsAsset,
      trinketsAsset,
      hatsAsset,
      bootsAsset,
      furnitureAsset,
      cropsAsset,
      fishAsset,
      locationsAsset,
      shopsAsset,
      machinesAsset,
      fishPondAsset,
      craftingRecipesAsset,
      cookingRecipesAsset,
      charactersAsset,
      giftTastesAsset,
    ] = await Promise.all([
      loadTextAsset(rootPath, OBJECT_DATA_ASSET_PATH, locale),
      loadTextAsset(rootPath, BIG_CRAFTABLE_DATA_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, WEAPON_DATA_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, TOOL_DATA_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, SHIRT_DATA_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, PANTS_DATA_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, TRINKET_DATA_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, HAT_DATA_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, BOOTS_DATA_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, FURNITURE_DATA_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, CROP_DATA_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, FISH_DATA_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, LOCATION_DATA_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, SHOP_DATA_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, MACHINE_DATA_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, FISH_POND_DATA_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, CRAFTING_RECIPES_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, COOKING_RECIPES_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, CHARACTER_DATA_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, CHARACTER_GIFT_TASTES_ASSET_PATH, locale).catch(() => null),
    ])

    const baseEntries = [
      ...createObjectEntryIndex(objectsAsset.content),
      ...(bigCraftablesAsset ? createBigCraftableEntryIndex(bigCraftablesAsset.content) : []),
      ...(weaponsAsset ? createWeaponEntryIndex(weaponsAsset.content) : []),
      ...(toolsAsset ? createToolEntryIndex(toolsAsset.content) : []),
      ...(shirtsAsset ? createShirtEntryIndex(shirtsAsset.content) : []),
      ...(pantsAsset ? createPantsEntryIndex(pantsAsset.content) : []),
      ...(trinketsAsset ? createTrinketEntryIndex(trinketsAsset.content) : []),
      ...(hatsAsset ? createHatEntryIndex(hatsAsset.content) : []),
      ...(bootsAsset ? createBootsEntryIndex(bootsAsset.content) : []),
      ...(furnitureAsset ? createFurnitureEntryIndex(furnitureAsset.content) : []),
    ]

    const localizedEntries = await localizeItemEntries(baseEntries, rootPath, locale)
    const recipes = [
      ...(craftingRecipesAsset ? createRecipeEntryIndex(craftingRecipesAsset.content, 'crafting') : []),
      ...(cookingRecipesAsset ? createRecipeEntryIndex(cookingRecipesAsset.content, 'cooking') : []),
    ]
    const hydratedEntries = hydrateItemRelations(
      localizedEntries,
      recipes,
      cropsAsset?.content ?? null,
      fishAsset?.content ?? null,
      locationsAsset?.content ?? null,
      shopsAsset?.content ?? null,
      machinesAsset?.content ?? null,
      fishPondAsset?.content ?? null,
    )

    const giftHydratedEntries = await attachGiftTasteEntries(
      hydratedEntries,
      rootPath,
      locale,
      charactersAsset?.content ?? null,
      giftTastesAsset?.content ?? null,
    )

    return sortItemEntries(decorateItemBrowseMetadata(giftHydratedEntries), locale)
  })
}

/**
 * Untouched `Data/Objects` records, keyed by object id.
 *
 * The authoring page seeds an override from the raw record, so it needs the
 * game's JSON rather than the derived index `loadItemWorkspaceEntries` returns.
 */
export async function loadVanillaObjectRecords(rootPath: string, locale: LocaleCode): Promise<Record<string, unknown>> {
  const asset = await loadTextAsset(rootPath, OBJECT_DATA_ASSET_PATH, locale)
  const parsed = JSON.parse(asset.content) as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => typeof value === 'object' && value !== null && !Array.isArray(value)),
  )
}

/** Loads one item texture atlas by asset name using the same localized image fallback path as the Items workspace. */
export async function loadItemTextureAssetState(rootPath: string, assetName: string, locale: LocaleCode): Promise<ItemTextureAssetState> {
  const texturePath = buildGameContentPath(rootPath, assetName)
  try {
    return await loadImageState(texturePath, locale)
  } catch {
    return {
      path: texturePath,
      url: null,
      width: null,
      height: null,
      loading: false,
    }
  }
}
