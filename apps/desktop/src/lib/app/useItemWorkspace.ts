import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { loadImageDataUrl, loadTextAsset, type GameDirectoryInfo } from '../desktop'
import type { ItemsPanelCopy, LocaleCode } from '../editor-shell'
import { CHARACTER_DATA_ASSET_PATH, CHARACTER_GIFT_TASTES_ASSET_PATH } from './characterWorkspace'
import {
  BIG_CRAFTABLE_DATA_ASSET_PATH,
  BOOTS_DATA_ASSET_PATH,
  buildItemSearchAliases,
  buildGameContentPath,
  CRAFTING_RECIPES_ASSET_PATH,
  COOKING_RECIPES_ASSET_PATH,
  CROP_DATA_ASSET_PATH,
  createBootsEntryIndex,
  createBigCraftableEntryIndex,
  createFurnitureEntryIndex,
  createHatEntryIndex,
  createItemEntryLookup,
  createObjectEntryIndex,
  createPantsEntryIndex,
  createRecipeEntryIndex,
  createShirtEntryIndex,
  createToolEntryIndex,
  createTrinketEntryIndex,
  createWeaponEntryIndex,
  FISH_DATA_ASSET_PATH,
  FISH_POND_DATA_ASSET_PATH,
  FURNITURE_DATA_ASSET_PATH,
  getAllTextureAssetNames,
  hydrateItemRelations,
  HAT_DATA_ASSET_PATH,
  itemMatchesFilter,
  LOCATION_DATA_ASSET_PATH,
  MACHINE_DATA_ASSET_PATH,
  OBJECT_DATA_ASSET_PATH,
  PANTS_DATA_ASSET_PATH,
  SHIRT_DATA_ASSET_PATH,
  SHOP_DATA_ASSET_PATH,
  TOOL_DATA_ASSET_PATH,
  TRINKET_DATA_ASSET_PATH,
  type ItemGiftTasteNpc,
  type ItemTextureAssetState,
  type ItemWorkspaceEntry,
  WEAPON_DATA_ASSET_PATH,
} from './itemWorkspace'

type UseItemWorkspaceOptions = {
  directoryInfo: GameDirectoryInfo | null
  locale: LocaleCode
  copy: ItemsPanelCopy
}

const stringTableCache = new Map<string, Promise<Record<string, string>>>()

function getLocalizedImagePathCandidates(path: string, locale: LocaleCode) {
  if (locale === 'en-US') {
    return [path]
  }

  return [path.replace(/\.xnb$/iu, `.${locale}.xnb`), path]
}

function measureImage(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('Failed to decode image asset.'))
    image.src = url
  })
}

async function createObjectUrlFromDataUrl(dataUrl: string) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return URL.createObjectURL(blob)
}

async function loadImageState(path: string | null, locale: LocaleCode): Promise<ItemTextureAssetState> {
  if (!path) {
    return {
      path: null,
      url: null,
      width: null,
      height: null,
    }
  }

  let lastError: unknown = null

  for (const candidatePath of getLocalizedImagePathCandidates(path, locale)) {
    try {
      const dataUrl = await loadImageDataUrl(candidatePath, locale)
      const dimensions = await measureImage(dataUrl)
      return {
        path: candidatePath,
        url: await createObjectUrlFromDataUrl(dataUrl),
        width: dimensions.width,
        height: dimensions.height,
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function getStringTableCacheKey(rootPath: string, assetPath: string, locale: LocaleCode) {
  return `${rootPath}::${assetPath.replaceAll('/', '\\')}::${locale}`
}

function tryParseStringAssetReference(value: string | null | undefined) {
  const rawValue = value?.trim() ?? ''
  if (!rawValue) {
    return null
  }

  const localizedTextMatch = /^\[LocalizedText\s+(.+)\]$/u.exec(rawValue)
  const trimmed = localizedTextMatch?.[1]?.trim() ?? rawValue
  const separatorIndex = trimmed.indexOf(':')
  if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) {
    return null
  }

  const assetName = trimmed.slice(0, separatorIndex).replaceAll('/', '\\')
  const key = trimmed.slice(separatorIndex + 1)
  if (!/[\\/]/u.test(assetName)) {
    return null
  }

  return {
    assetPath: `Content\\${assetName}.xnb`,
    key,
  }
}

async function loadStringTable(rootPath: string, assetPath: string, locale: LocaleCode) {
  const cacheKey = getStringTableCacheKey(rootPath, assetPath, locale)
  const cached = stringTableCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const pending: Promise<Record<string, string>> = loadTextAsset(rootPath, assetPath, locale)
    .then((asset) => {
      const parsed = JSON.parse(asset.content) as Record<string, unknown>
      return Object.fromEntries(
        Object.entries(parsed).flatMap(([key, value]) => (typeof value === 'string' ? ([[key, value]] as const) : [])),
      )
    })
    .catch(() => ({} as Record<string, string>))

  stringTableCache.set(cacheKey, pending)
  return pending
}

async function resolveLocalizedText(rootPath: string, locale: LocaleCode, value: string | null | undefined, depth = 0): Promise<string | null> {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) {
    return null
  }

  if (depth > 3) {
    return trimmed
  }

  const reference = tryParseStringAssetReference(trimmed)
  if (!reference) {
    return trimmed
  }

  const table = await loadStringTable(rootPath, reference.assetPath, locale)
  const resolved = table[reference.key]
  if (!resolved) {
    return trimmed
  }

  return resolveLocalizedText(rootPath, locale, resolved, depth + 1)
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
        searchText: [entry.searchText, displayName, description, buildItemSearchAliases(displayName, description, entry.internalName, entry.qualifiedItemId)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      } satisfies ItemWorkspaceEntry
    }),
  )

  return localized.sort((left, right) => left.displayName.localeCompare(right.displayName))
}

type GiftTasteBuckets = {
  love: string[]
  like: string[]
  neutral: string[]
  dislike: string[]
  hate: string[]
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

function parseGiftTasteTokens(value: string | null | undefined, tokenIndex: number) {
  if (!value) {
    return []
  }

  const segments = value.split('/')
  const bucket = segments[tokenIndex]?.trim() ?? ''
  return bucket ? bucket.split(/\s+/u).filter(Boolean) : []
}

function parseQualifiedGiftTasteObjectId(token: string) {
  const trimmed = token.trim()
  if (!trimmed) {
    return null
  }

  const qualifiedObjectMatch = /^\(O\)(.+)$/iu.exec(trimmed)
  if (qualifiedObjectMatch) {
    return qualifiedObjectMatch[1]?.trim() || null
  }

  return trimmed
}

function normalizeContextTag(value: string) {
  return value.trim().toLowerCase()
}

function normalizeTagFragment(value: string) {
  return value.trim().toLowerCase().replaceAll("'", '').replace(/\s+/gu, '_')
}

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

function buildUniversalGiftTasteBuckets(giftTasteEntries: Record<string, string>) {
  return {
    love: giftTasteEntries.Universal_Love?.split(/\s+/u).filter(Boolean) ?? [],
    hate: giftTasteEntries.Universal_Hate?.split(/\s+/u).filter(Boolean) ?? [],
    like: giftTasteEntries.Universal_Like?.split(/\s+/u).filter(Boolean) ?? [],
    dislike: giftTasteEntries.Universal_Dislike?.split(/\s+/u).filter(Boolean) ?? [],
    neutral: giftTasteEntries.Universal_Neutral?.split(/\s+/u).filter(Boolean) ?? [],
  } satisfies GiftTasteBuckets
}

function buildNpcGiftTasteBuckets(rawValue: string | null | undefined): GiftTasteBuckets {
  return {
    love: parseGiftTasteTokens(rawValue, 1),
    like: parseGiftTasteTokens(rawValue, 3),
    dislike: parseGiftTasteTokens(rawValue, 5),
    hate: parseGiftTasteTokens(rawValue, 7),
    neutral: parseGiftTasteTokens(rawValue, 9),
  }
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

async function loadTextureAtlasStates(rootPath: string, locale: LocaleCode, entries: ItemWorkspaceEntry[]) {
  const assetNames = getAllTextureAssetNames(entries)
  const loadedStates = await Promise.all(
    assetNames.map(async (assetName) => {
      const texturePath = buildGameContentPath(rootPath, assetName)
      try {
        return [assetName, await loadImageState(texturePath, locale)] as const
      } catch {
        return [
          assetName,
          {
            path: texturePath,
            url: null,
            width: null,
            height: null,
          } satisfies ItemTextureAssetState,
        ] as const
      }
    }),
  )

  return Object.fromEntries(loadedStates) as Record<string, ItemTextureAssetState>
}

function revokeTextureAtlasUrls(states: Record<string, ItemTextureAssetState>) {
  for (const state of Object.values(states)) {
    if (state.url?.startsWith('blob:')) {
      URL.revokeObjectURL(state.url)
    }
  }
}

export function useItemWorkspace({ directoryInfo, locale, copy }: UseItemWorkspaceOptions) {
  const [items, setItems] = useState<ItemWorkspaceEntry[]>([])
  const [itemFilter, setItemFilter] = useState('')
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [itemStatusMessage, setItemStatusMessage] = useState('')
  const [textureStatesByAssetName, setTextureStatesByAssetName] = useState<Record<string, ItemTextureAssetState>>({})
  const textureStatesRef = useRef<Record<string, ItemTextureAssetState>>({})

  const deferredFilter = useDeferredValue(itemFilter.trim().toLowerCase())
  const filteredItems = useMemo(
    () => items.filter((item) => itemMatchesFilter(item, deferredFilter)),
    [deferredFilter, items],
  )
  const activeItem = items.find((item) => item.key === activeItemId) ?? filteredItems[0] ?? items[0] ?? null
  const itemLookup = useMemo(() => createItemEntryLookup(items), [items])

  useEffect(() => {
    textureStatesRef.current = textureStatesByAssetName
  }, [textureStatesByAssetName])

  useEffect(() => () => revokeTextureAtlasUrls(textureStatesRef.current), [])

  useEffect(() => {
    if (!directoryInfo?.rootPath) {
      const timeout = window.setTimeout(() => {
        setItems([])
        setActiveItemId(null)
        setItemStatusMessage('')
        setTextureStatesByAssetName((current) => {
          revokeTextureAtlasUrls(current)
          return {}
        })
      }, 0)

      return () => window.clearTimeout(timeout)
    }

    let cancelled = false

    void (async () => {
      try {
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
          loadTextAsset(directoryInfo.rootPath, OBJECT_DATA_ASSET_PATH, locale),
          loadTextAsset(directoryInfo.rootPath, BIG_CRAFTABLE_DATA_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, WEAPON_DATA_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, TOOL_DATA_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, SHIRT_DATA_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, PANTS_DATA_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, TRINKET_DATA_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, HAT_DATA_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, BOOTS_DATA_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, FURNITURE_DATA_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, CROP_DATA_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, FISH_DATA_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, LOCATION_DATA_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, SHOP_DATA_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, MACHINE_DATA_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, FISH_POND_DATA_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, CRAFTING_RECIPES_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, COOKING_RECIPES_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, CHARACTER_DATA_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, CHARACTER_GIFT_TASTES_ASSET_PATH, locale).catch(() => null),
        ])
        if (cancelled) {
          return
        }

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

        const localizedEntries = await localizeItemEntries(baseEntries, directoryInfo.rootPath, locale)
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
          directoryInfo.rootPath,
          locale,
          charactersAsset?.content ?? null,
          giftTastesAsset?.content ?? null,
        )
        const atlasStates = await loadTextureAtlasStates(directoryInfo.rootPath, locale, giftHydratedEntries)
        if (cancelled) {
          revokeTextureAtlasUrls(atlasStates)
          return
        }

        setItems(giftHydratedEntries)
        setTextureStatesByAssetName((current) => {
          revokeTextureAtlasUrls(current)
          return atlasStates
        })
        setActiveItemId((current) =>
          current && giftHydratedEntries.some((entry) => entry.key === current) ? current : giftHydratedEntries[0]?.key ?? null,
        )
        setItemStatusMessage(
          giftHydratedEntries.length
            ? copy.indexedStatusTemplate.replace('{count}', String(giftHydratedEntries.length))
            : copy.noEntriesStatus,
        )
      } catch (error) {
        if (!cancelled) {
          setItems([])
          setActiveItemId(null)
          setTextureStatesByAssetName((current) => {
            revokeTextureAtlasUrls(current)
            return {}
          })
          setItemStatusMessage(error instanceof Error ? error.message : String(error))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [copy.indexedStatusTemplate, copy.noEntriesStatus, directoryInfo?.rootPath, locale])

  function handleSelectItem(itemKey: string) {
    setActiveItemId(itemKey)
  }

  return {
    items,
    filteredItems,
    itemFilter,
    setItemFilter,
    activeItemId: activeItem?.key ?? null,
    activeItem,
    itemLookup,
    itemStatusMessage,
    textureStatesByAssetName,
    handleSelectItem,
  }
}
