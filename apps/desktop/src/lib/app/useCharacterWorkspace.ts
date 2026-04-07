import {useDeferredValue, useEffect, useMemo, useState} from 'react'
import {deferToAnimationFrame, deferToTimeout} from '../react/deferred'
import {type GameDirectoryInfo, loadTextAsset} from '../desktop'
import type {CharactersPanelCopy, LocaleCode} from '../../locales'
import {loadImageResourceFromPath} from '../imageMetrics'
import {
  CHARACTER_DATA_ASSET_PATH,
  CHARACTER_GIFT_TASTES_ASSET_PATH,
  type CharacterAppearanceVariant,
  type CharacterGiftGroup,
  type CharacterGiftGroupKind,
  type CharacterGiftItem,
  type CharacterVisualAssetState,
  type CharacterWorkspaceEntry,
  createCharacterEntryIndex,
  OBJECT_DATA_ASSET_PATH,
  resolveCharacterVariantPaths,
  SPRING_OBJECTS_ASSET_PATH,
} from './characterWorkspace'
import {
  type BrowserSourceMode,
  buildModBrowserGroups,
  buildModEntryLookup,
  findModBrowserEntry,
  findModSources,
  type ModBrowserEntry,
  useModAssetIndex,
} from './modAssetIndex'
import {loadModResultImageState, loadModResultJsonValue} from './modResultAssets'

const MONSTER_DATA_ASSET_PATH = 'Content\\Data\\Monsters.xnb'

type UseCharacterWorkspaceOptions = {
  directoryInfo: GameDirectoryInfo | null
  locale: LocaleCode
  copy: CharactersPanelCopy
  enableVisualAssets?: boolean
}

const stringTableCache = new Map<string, Promise<Record<string, string>>>()
const characterEntriesCache = new Map<string, Promise<CharacterWorkspaceEntry[]>>()
const imageStateCache = new Map<
  string,
  Promise<{
    path: string | null
    url: string | null
    width: number | null
    height: number | null
    originalWidth: number | null
    originalHeight: number | null
  }>
>()

function normalizeCachePathSegment(value: string) {
  return value.trim().replaceAll('/', '\\')
}

function getRootLocaleCacheKey(rootPath: string, locale: LocaleCode) {
  return `${normalizeCachePathSegment(rootPath)}::${locale}`
}

function getLocalizedPathCacheKey(path: string, locale: LocaleCode) {
  return `${normalizeCachePathSegment(path)}::${locale}`
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

type ObjectDataEntry = {
  DisplayName?: string | null
  Name?: string | null
  Category?: number | string | null
  Price?: number | string | null
  Edibility?: number | string | null
  Type?: string | null
  ContextTags?: string[] | Record<string, string> | string | null
  SpriteIndex?: number | string | null
  Texture?: string | null
}

type ObjectGiftCandidate = CharacterGiftItem & {
  qualifiedItemId: string
  category: number
  price: number
  edibility: number
  type: string
  contextTags: Set<string>
}

type GiftTasteBuckets = {
  love: string[]
  like: string[]
  dislike: string[]
  hate: string[]
  neutral: string[]
}

type GiftMatchSource = {
  kind: CharacterGiftGroupKind
  key: string
  label: string
}

type GiftTasteResult = {
  taste: 'love' | 'like' | 'neutral' | 'dislike' | 'hate'
  source: GiftMatchSource
}

const GIFT_TASTE_ORDER: Array<{ key: keyof GiftTasteBuckets; result: 'love' | 'hate' | 'like' | 'dislike' | 'neutral' }> = [
  { key: 'love', result: 'love' },
  { key: 'hate', result: 'hate' },
  { key: 'like', result: 'like' },
  { key: 'dislike', result: 'dislike' },
  { key: 'neutral', result: 'neutral' },
]

function getLocalizedImagePathCandidates(path: string, locale: LocaleCode) {
  if (locale === 'en-US') {
    return [path]
  }

  return [path.replace(/\.xnb$/iu, `.${locale}.xnb`), path]
}

function getMonsterImagePathFallbacks(path: string) {
  const match = /^(.*\\Monsters\\)([^\\]+)(\.xnb)$/iu.exec(path)
  if (!match) {
    return [path]
  }

  const directory = match[1] ?? ''
  const stem = match[2] ?? ''
  const extension = match[3] ?? ''
  const variants = new Set([path])

  if (stem.includes('_')) {
    variants.add(`${directory}${stem.replaceAll('_', ' ')}${extension}`)
  }

  if (stem.includes(' ')) {
    variants.add(`${directory}${stem.replaceAll(' ', '_')}${extension}`)
  }

  return Array.from(variants)
}

function getImagePathCandidates(path: string, locale: LocaleCode) {
  return getMonsterImagePathFallbacks(path).flatMap((candidatePath) => getLocalizedImagePathCandidates(candidatePath, locale))
}

async function loadImageState(path: string | null, locale: LocaleCode) {
  if (!path) {
    return {
      path: null,
      url: null,
      width: null,
      height: null,
      originalWidth: null,
      originalHeight: null,
    }
  }

  const cacheKey = getLocalizedPathCacheKey(path, locale)
  return readCachedPromise(imageStateCache, cacheKey, async () => {
    let lastError: unknown = null

    for (const candidatePath of getImagePathCandidates(path, locale)) {
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
          originalWidth: null,
          originalHeight: null,
        }
      } catch (error) {
        lastError = error
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  })
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
        Object.entries(parsed).flatMap(([key, value]) =>
          typeof value === 'string' ? ([[key, value]] as const) : [],
        ),
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

function normalizeMonsterTextureLookupKey(value: string) {
  return value.trim().replaceAll('\\', '/').replace(/^Content\//iu, '').toLowerCase()
}

function buildMonsterTextureLookupKeys(value: string) {
  const normalized = normalizeMonsterTextureLookupKey(value)
  const basename = normalized.split('/').at(-1) ?? normalized
  const variants = new Set<string>([normalized, basename])

  if (!normalized.startsWith('monsters/')) {
    variants.add(`monsters/${basename}`)
  }

  for (const candidate of Array.from(variants)) {
    variants.add(candidate.replaceAll('_', ' '))
    variants.add(candidate.replaceAll(' ', '_'))
  }

  return Array.from(variants)
}

function parseMonsterDisplayName(rawValue: string, fallbackName: string) {
  const displayName = rawValue.split('/').at(-1)?.trim()
  return displayName || fallbackName
}

function buildMonsterDisplayNameIndex(content: string | null) {
  if (!content) {
    return new Map<string, string>()
  }

  const parsed = JSON.parse(content) as Record<string, string>
  return new Map(
    Object.entries(parsed).flatMap(([monsterName, rawValue]) => {
      const displayName = parseMonsterDisplayName(rawValue, monsterName)
      return buildMonsterTextureLookupKeys(`Monsters/${monsterName}`).map((lookupKey) => [lookupKey, displayName] as const)
    }),
  )
}

function resolveMonsterDisplayName(entry: CharacterWorkspaceEntry, monsterDisplayNameByTextureKey: Map<string, string>) {
  return buildMonsterTextureLookupKeys(entry.textureName)
    .map((lookupKey) => monsterDisplayNameByTextureKey.get(lookupKey) ?? null)
    .find((value): value is string => Boolean(value))
}

function isPlaceholderDisplayName(value: string) {
  return /^\?+$/u.test(value.trim())
}

async function localizeCharacterEntries(
  entries: CharacterWorkspaceEntry[],
  rootPath: string,
  locale: LocaleCode,
  monsterDataContent: string | null,
) {
  const monsterDisplayNameByTextureKey = buildMonsterDisplayNameIndex(monsterDataContent)
  const localizedDisplayNameEntries = await Promise.all(
    entries.map(async (entry) => {
      const localizedDisplayName = (await resolveLocalizedText(rootPath, locale, entry.rawDisplayName)) ?? entry.rawDisplayName
      const monsterDisplayName = resolveMonsterDisplayName(entry, monsterDisplayNameByTextureKey)
      return [
        entry.internalName,
        isPlaceholderDisplayName(localizedDisplayName) ? (monsterDisplayName ?? localizedDisplayName) : localizedDisplayName,
      ] as const
    }),
  )
  const displayNameByInternalName = new Map<string, string>(localizedDisplayNameEntries)

  const localizedEntries = await Promise.all(
    entries.map(async (entry) => {
      const displayName = displayNameByInternalName.get(entry.internalName) ?? entry.displayName
      const loveInterestDisplayName = entry.loveInterest
        ? (displayNameByInternalName.get(entry.loveInterest) ?? (await resolveLocalizedText(rootPath, locale, entry.loveInterest)) ?? entry.loveInterest)
        : null
      const friendsAndFamilyEntries = (
        await Promise.all(
        Object.entries(entry.friendsAndFamily).map(async ([internalName, relation]) => ({
          internalName,
          displayName:
            displayNameByInternalName.get(internalName) ??
            (await resolveLocalizedText(rootPath, locale, internalName)) ??
            internalName,
          relation: (await resolveLocalizedText(rootPath, locale, relation)) ?? relation,
        })),
      )
      ).sort((left, right) => left.displayName.localeCompare(right.displayName))

      return {
        ...entry,
        displayName,
        loveInterestDisplayName,
        friendsAndFamilyEntries,
        searchText: [
          entry.searchText,
          displayName,
          loveInterestDisplayName,
          ...friendsAndFamilyEntries.map((item) => `${item.displayName} ${item.relation}`),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      }
    }),
  )

  return localizedEntries.sort((left, right) => left.displayName.localeCompare(right.displayName))
}

function parseGiftTasteObjectId(token: string) {
  const trimmed = token.trim()
  if (!trimmed) {
    return null
  }

  const qualifiedObjectMatch = /^\(O\)(\d+)$/u.exec(trimmed)
  if (qualifiedObjectMatch) {
    return qualifiedObjectMatch[1] ?? null
  }

  if (/^\d+$/u.test(trimmed)) {
    return trimmed
  }

  return null
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

function parseGiftTasteTokens(value: string | null | undefined, tokenIndex: number) {
  if (!value) {
    return []
  }

  const segments = value.split('/')
  const bucket = segments[tokenIndex]?.trim() ?? ''
  if (!bucket) {
    return []
  }

  return bucket.split(/\s+/u).filter(Boolean)
}

function parseNumber(value: number | string | null | undefined, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

function collectStringValues(value: string[] | Record<string, string> | string | null | undefined) {
  if (Array.isArray(value)) {
    return value
  }

  if (typeof value === 'string') {
    return value.split(',').map((entry) => entry.trim())
  }

  if (value && typeof value === 'object') {
    return Object.values(value)
  }

  return []
}

function normalizeContextTag(value: string) {
  return value.trim().toLowerCase()
}

function normalizeTagFragment(value: string) {
  return value.trim().toLowerCase().replaceAll("'", '').replace(/\s+/gu, '_')
}

function buildBaseObjectContextTags(itemId: string, entry: ObjectDataEntry) {
  const tags = new Set<string>()

  for (const rawTag of collectStringValues(entry.ContextTags)) {
    const normalized = normalizeContextTag(rawTag)
    if (normalized) {
      tags.add(normalized)
    }
  }

  const normalizedId = normalizeTagFragment(itemId)
  if (normalizedId) {
    tags.add(`id_(o)${normalizedId}`)
  }

  const normalizedName = normalizeTagFragment(entry.Name?.trim() || '')
  if (normalizedName) {
    tags.add(`item_${normalizedName}`)
  }

  const normalizedType = normalizeTagFragment(entry.Type?.trim() || '')
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

function buildCategorySource(category: number): GiftMatchSource {
  return {
    kind: 'category',
    key: `category:${category}`,
    label: String(category),
  }
}

function buildTagSource(tag: string): GiftMatchSource {
  return {
    kind: 'tag',
    key: `tag:${normalizeContextTag(tag)}`,
    label: tag.trim(),
  }
}

function buildItemSource(token: string, objectDisplayNameById: Map<string, string>): GiftMatchSource | null {
  const resolvedId = parseQualifiedGiftTasteObjectId(token)
  if (!resolvedId) {
    return null
  }

  return {
    kind: 'item',
    key: `item:${resolvedId.toLowerCase()}`,
    label: objectDisplayNameById.get(resolvedId) ?? resolvedId,
  }
}

function buildDefaultSource(key: string, label: string): GiftMatchSource {
  return {
    kind: 'default',
    key: `default:${key}`,
    label,
  }
}

function buildSpecialSource(key: string, label: string): GiftMatchSource {
  return {
    kind: 'special',
    key: `special:${key}`,
    label,
  }
}

function findCategorySource(tokens: string[], category: number) {
  return hasCategoryToken(tokens, category) ? buildCategorySource(category) : null
}

function findContextTagSource(tokens: string[], candidate: ObjectGiftCandidate) {
  const matchedToken = tokens.find((token) => {
    const trimmed = token.trim()
    if (!trimmed || trimmed.startsWith('-') || /^\d+$/u.test(trimmed) || /^-\d+$/u.test(trimmed)) {
      return false
    }

    return candidate.contextTags.has(normalizeContextTag(trimmed))
  })

  return matchedToken ? buildTagSource(matchedToken) : null
}

function findItemSource(tokens: string[], candidate: ObjectGiftCandidate, objectDisplayNameById: Map<string, string>) {
  const matchedToken = tokens.find((token) => matchesGiftTasteItemToken(token, candidate))
  return matchedToken ? buildItemSource(matchedToken, objectDisplayNameById) : null
}

function matchesGiftTasteItemToken(token: string, candidate: ObjectGiftCandidate) {
  const trimmed = token.trim()
  if (!trimmed || trimmed.startsWith('-')) {
    return false
  }

  const resolvedId = parseQualifiedGiftTasteObjectId(trimmed)?.toLowerCase()
  if (!resolvedId) {
    return false
  }

  return resolvedId === candidate.itemId.toLowerCase()
}

function hasCategoryToken(tokens: string[], category: number) {
  return tokens.includes(String(category))
}

function resolveGiftTasteForCandidate(
  npcName: string,
  candidate: ObjectGiftCandidate,
  universalBuckets: GiftTasteBuckets,
  npcBuckets: GiftTasteBuckets,
  objectDisplayNameById: Map<string, string>,
) {
  if (candidate.qualifiedItemId.toLowerCase() === '(o)stardroptea') {
    return {
      taste: 'love',
      source: buildSpecialSource('stardrop-tea', objectDisplayNameById.get('StardropTea') ?? 'StardropTea'),
    } satisfies GiftTasteResult
  }

  let result: GiftTasteResult = {
    taste: 'neutral',
    source: buildDefaultSource('neutral', 'neutral'),
  }
  let matchedUniversalItem = false
  let matchedUniversalNeutralItem = false

  const universalLoveCategory = findCategorySource(universalBuckets.love, candidate.category)
  const universalHateCategory = findCategorySource(universalBuckets.hate, candidate.category)
  const universalLikeCategory = findCategorySource(universalBuckets.like, candidate.category)
  const universalDislikeCategory = findCategorySource(universalBuckets.dislike, candidate.category)

  if (universalLoveCategory) {
    result = { taste: 'love', source: universalLoveCategory }
  } else if (universalHateCategory) {
    result = { taste: 'hate', source: universalHateCategory }
  } else if (universalLikeCategory) {
    result = { taste: 'like', source: universalLikeCategory }
  } else if (universalDislikeCategory) {
    result = { taste: 'dislike', source: universalDislikeCategory }
  }

  const universalLoveTag = findContextTagSource(universalBuckets.love, candidate)
  const universalHateTag = findContextTagSource(universalBuckets.hate, candidate)
  const universalLikeTag = findContextTagSource(universalBuckets.like, candidate)
  const universalDislikeTag = findContextTagSource(universalBuckets.dislike, candidate)

  if (universalLoveTag) {
    result = { taste: 'love', source: universalLoveTag }
  } else if (universalHateTag) {
    result = { taste: 'hate', source: universalHateTag }
  } else if (universalLikeTag) {
    result = { taste: 'like', source: universalLikeTag }
  } else if (universalDislikeTag) {
    result = { taste: 'dislike', source: universalDislikeTag }
  }

  const universalLoveItem = findItemSource(universalBuckets.love, candidate, objectDisplayNameById)
  const universalHateItem = findItemSource(universalBuckets.hate, candidate, objectDisplayNameById)
  const universalLikeItem = findItemSource(universalBuckets.like, candidate, objectDisplayNameById)
  const universalDislikeItem = findItemSource(universalBuckets.dislike, candidate, objectDisplayNameById)
  const universalNeutralItem = findItemSource(universalBuckets.neutral, candidate, objectDisplayNameById)

  if (universalLoveItem) {
    result = { taste: 'love', source: universalLoveItem }
    matchedUniversalItem = true
  } else if (universalHateItem) {
    result = { taste: 'hate', source: universalHateItem }
    matchedUniversalItem = true
  } else if (universalLikeItem) {
    result = { taste: 'like', source: universalLikeItem }
    matchedUniversalItem = true
  } else if (universalDislikeItem) {
    result = { taste: 'dislike', source: universalDislikeItem }
    matchedUniversalItem = true
  } else if (universalNeutralItem) {
    result = { taste: 'neutral', source: universalNeutralItem }
    matchedUniversalItem = true
    matchedUniversalNeutralItem = true
  }

  if (candidate.type === 'Arch') {
    result = {
      taste: npcName === 'Penny' || npcName === 'Dwarf' ? 'like' : 'dislike',
      source: buildSpecialSource('arch', 'Arch'),
    }
  }

  if (result.taste === 'neutral' && !matchedUniversalNeutralItem) {
    if (candidate.edibility !== -300 && candidate.edibility < 0) {
      result = { taste: 'hate', source: buildDefaultSource('inedible', 'inedible') }
    } else if (candidate.price < 20) {
      result = { taste: 'dislike', source: buildDefaultSource('low-price', 'price < 20') }
    }
  }

  for (const { key, result } of GIFT_TASTE_ORDER) {
    const matchedItemSource = findItemSource(npcBuckets[key], candidate, objectDisplayNameById)
    if (matchedItemSource) {
      return { taste: result, source: matchedItemSource }
    }
  }

  for (const { key, result } of GIFT_TASTE_ORDER) {
    const matchedTagSource = findContextTagSource(npcBuckets[key], candidate)
    if (matchedTagSource) {
      return { taste: result, source: matchedTagSource }
    }
  }

  if (!matchedUniversalItem && candidate.category !== 0) {
    for (const { key, result } of GIFT_TASTE_ORDER) {
      const matchedCategorySource = findCategorySource(npcBuckets[key], candidate.category)
      if (matchedCategorySource) {
        return { taste: result, source: matchedCategorySource }
      }
    }
  }

  return result
}

async function buildObjectGiftCandidates(rootPath: string, locale: LocaleCode, content: string) {
  const parsed = JSON.parse(content) as Record<string, ObjectDataEntry>
  const candidates = await Promise.all(
    Object.entries(parsed).map(async ([rawItemId, entry]) => {
      const itemId = parseQualifiedGiftTasteObjectId(rawItemId)
      if (!itemId) {
        return null
      }

      const rawDisplayName = entry.DisplayName?.trim() || entry.Name?.trim() || itemId
      const displayName = (await resolveLocalizedText(rootPath, locale, rawDisplayName)) ?? rawDisplayName
      const rawObjectIndex = entry.SpriteIndex ?? parseGiftTasteObjectId(itemId)
      const parsedObjectIndex = parseNumber(rawObjectIndex, Number.NaN)
      return {
        itemId,
        objectIndex: Number.isFinite(parsedObjectIndex) ? parsedObjectIndex : null,
        qualifiedItemId: `(O)${itemId}`,
        displayName,
        category: parseNumber(entry.Category, 0),
        price: parseNumber(entry.Price, 0),
        edibility: parseNumber(entry.Edibility, -300),
        type: entry.Type?.trim() || '',
        contextTags: buildBaseObjectContextTags(itemId, entry),
      } satisfies ObjectGiftCandidate
    }),
  )

  const resolvedCandidates = candidates
    .filter((entry): entry is ObjectGiftCandidate => entry != null)
    .sort((left, right) => left.displayName.localeCompare(right.displayName))

  return {
    candidates: resolvedCandidates,
    displayNameById: new Map<string, string>(resolvedCandidates.map((entry) => [entry.itemId, entry.displayName])),
  }
}

function buildGiftGroups(itemsWithSource: Array<{ item: CharacterGiftItem; source: GiftMatchSource }>) {
  const groups = new Map<string, CharacterGiftGroup>()

  for (const { item, source } of itemsWithSource) {
    const existing = groups.get(source.key)
    if (existing) {
      existing.items.push(item)
      continue
    }

    groups.set(source.key, {
      key: source.key,
      kind: source.kind,
      label: source.label,
      items: [item],
    })
  }

  return Array.from(groups.values()).sort((left, right) => {
    if (left.kind !== right.kind) {
      const order: CharacterGiftGroupKind[] = ['item', 'special', 'category', 'tag', 'default']
      return order.indexOf(left.kind) - order.indexOf(right.kind)
    }

    return left.label.localeCompare(right.label)
  })
}

async function attachGiftTasteEntries(
  entries: CharacterWorkspaceEntry[],
  rootPath: string,
  locale: LocaleCode,
  giftTastesContent: string | null,
  objectsContent: string | null,
) {
  if (!giftTastesContent || !objectsContent) {
    return entries
  }

  const { candidates: objectGiftCandidates, displayNameById: objectDisplayNameById } = await buildObjectGiftCandidates(
    rootPath,
    locale,
    objectsContent,
  )
  const giftTasteEntries = JSON.parse(giftTastesContent) as Record<string, string>
  const universalBuckets = buildUniversalGiftTasteBuckets(giftTasteEntries)

  return entries.map((entry) => {
    const npcBuckets = buildNpcGiftTasteBuckets(giftTasteEntries[entry.internalName] ?? null)
    const lovedGiftMatches: Array<{ item: CharacterGiftItem; source: GiftMatchSource }> = []
    const likedGiftMatches: Array<{ item: CharacterGiftItem; source: GiftMatchSource }> = []
    const neutralGiftMatches: Array<{ item: CharacterGiftItem; source: GiftMatchSource }> = []
    const dislikedGiftMatches: Array<{ item: CharacterGiftItem; source: GiftMatchSource }> = []
    const hatedGiftMatches: Array<{ item: CharacterGiftItem; source: GiftMatchSource }> = []

    for (const candidate of objectGiftCandidates) {
      const match = resolveGiftTasteForCandidate(
        entry.internalName,
        candidate,
        universalBuckets,
        npcBuckets,
        objectDisplayNameById,
      )
      const giftItem: CharacterGiftItem = {
        itemId: candidate.itemId,
        objectIndex: candidate.objectIndex,
        displayName: candidate.displayName,
      }

      if (match.taste === 'love') {
        lovedGiftMatches.push({ item: giftItem, source: match.source })
      } else if (match.taste === 'like') {
        likedGiftMatches.push({ item: giftItem, source: match.source })
      } else if (match.taste === 'dislike') {
        dislikedGiftMatches.push({ item: giftItem, source: match.source })
      } else if (match.taste === 'hate') {
        hatedGiftMatches.push({ item: giftItem, source: match.source })
      } else {
        neutralGiftMatches.push({ item: giftItem, source: match.source })
      }
    }

    const lovedGiftGroups = buildGiftGroups(lovedGiftMatches)
    const likedGiftGroups = buildGiftGroups(likedGiftMatches)
    const neutralGiftGroups = buildGiftGroups(neutralGiftMatches)
    const dislikedGiftGroups = buildGiftGroups(dislikedGiftMatches)
    const hatedGiftGroups = buildGiftGroups(hatedGiftMatches)
    const lovedGifts = lovedGiftGroups.flatMap((group) => group.items)
    const likedGifts = likedGiftGroups.flatMap((group) => group.items)
    const neutralGifts = neutralGiftGroups.flatMap((group) => group.items)
    const dislikedGifts = dislikedGiftGroups.flatMap((group) => group.items)
    const hatedGifts = hatedGiftGroups.flatMap((group) => group.items)

    return {
      ...entry,
      lovedGifts,
      likedGifts,
      neutralGifts,
      dislikedGifts,
      hatedGifts,
      lovedGiftGroups,
      likedGiftGroups,
      neutralGiftGroups,
      dislikedGiftGroups,
      hatedGiftGroups,
      searchText: [
        entry.searchText,
        ...lovedGifts.map((item) => item.displayName),
        ...likedGifts.map((item) => item.displayName),
        ...neutralGifts.map((item) => item.displayName),
        ...dislikedGifts.map((item) => item.displayName),
        ...hatedGifts.map((item) => item.displayName),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    }
  })
}

async function loadCharacterWorkspaceEntries(rootPath: string, locale: LocaleCode) {
  const cacheKey = getRootLocaleCacheKey(rootPath, locale)
  return readCachedPromise(characterEntriesCache, cacheKey, async () => {
    const [asset, giftTastesAsset, objectDataAsset, monsterDataAsset] = await Promise.all([
      loadTextAsset(rootPath, CHARACTER_DATA_ASSET_PATH, locale),
      loadTextAsset(rootPath, CHARACTER_GIFT_TASTES_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, OBJECT_DATA_ASSET_PATH, locale).catch(() => null),
      loadTextAsset(rootPath, MONSTER_DATA_ASSET_PATH, locale).catch(() => null),
    ])

    const nextCharacters = createCharacterEntryIndex(asset.content)
    const localizedCharacters = await localizeCharacterEntries(
      nextCharacters,
      rootPath,
      locale,
      monsterDataAsset?.content ?? null,
    )

    return attachGiftTasteEntries(
      localizedCharacters,
      rootPath,
      locale,
      giftTastesAsset?.content ?? null,
      objectDataAsset?.content ?? null,
    )
  })
}

function mergeCharacterAppearanceOverride(baseCharacter: CharacterWorkspaceEntry, overrideCharacter: CharacterWorkspaceEntry) {
  return {
    ...baseCharacter,
    textureName: overrideCharacter.textureName,
    spriteAssetName: overrideCharacter.spriteAssetName,
    portraitAssetName: overrideCharacter.portraitAssetName,
    spriteWidth: overrideCharacter.spriteWidth,
    spriteHeight: overrideCharacter.spriteHeight,
    breather: overrideCharacter.breather,
    breathChestRect: overrideCharacter.breathChestRect,
    breathChestPosition: overrideCharacter.breathChestPosition,
    mugShotSourceRect: overrideCharacter.mugShotSourceRect,
    shakePortraits: overrideCharacter.shakePortraits,
    variants: overrideCharacter.variants,
  } satisfies CharacterWorkspaceEntry
}

export function useCharacterWorkspace({
  directoryInfo,
  locale,
  copy,
  enableVisualAssets = true,
}: UseCharacterWorkspaceOptions) {
  const [characters, setCharacters] = useState<CharacterWorkspaceEntry[]>([])
  const [modCharacterOverride, setModCharacterOverride] = useState<CharacterWorkspaceEntry | null>(null)
  const [characterFilter, setCharacterFilter] = useState('')
  const [browserSourceMode, setBrowserSourceMode] = useState<BrowserSourceMode>('original')
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null)
  const [activeModCharacterSelectionId, setActiveModCharacterSelectionId] = useState<string | null>(null)
  const [activeVariantKey, setActiveVariantKey] = useState<string>('default')
  const [characterStatusMessage, setCharacterStatusMessage] = useState('')
  const [assetState, setAssetState] = useState<CharacterVisualAssetState>({
    spritePath: null,
    portraitPath: null,
    spriteUrl: null,
    portraitUrl: null,
    springObjectsPath: null,
    springObjectsUrl: null,
    spriteSheetWidth: null,
    spriteSheetHeight: null,
    portraitSheetWidth: null,
    portraitSheetHeight: null,
    portraitOriginalWidth: null,
    portraitOriginalHeight: null,
    springObjectsSheetWidth: null,
    springObjectsSheetHeight: null,
  })
  const { modIndex } = useModAssetIndex(directoryInfo)

  const deferredFilter = useDeferredValue(characterFilter.trim().toLowerCase())
  const filteredCharacters = useMemo(
    () => characters.filter((character) => !deferredFilter || character.searchText.includes(deferredFilter)),
    [characters, deferredFilter],
  )
  const characterLookup = useMemo(() => buildModEntryLookup(characters, (character) => character.key), [characters])
  const modCharacterGroups = useMemo(
    () =>
      buildModBrowserGroups({
        mods: modIndex.mods,
        selectReferences: (group) => group.characters,
        entryLookup: characterLookup,
        filterText: characterFilter,
        getSearchText: (character) => character.searchText,
        getFallbackLabel: (character) => character.displayName,
      }),
    [characterFilter, characterLookup, modIndex.mods],
  )
  const activeCharacterModSources = useMemo(
    () =>
      findModSources({
        mods: modIndex.mods,
        selectReferences: (group) => group.characters,
        key: activeCharacterId,
      }),
    [activeCharacterId, modIndex.mods],
  )
  const activeModCharacterEntry = useMemo(
    () => findModBrowserEntry(modCharacterGroups, activeModCharacterSelectionId),
    [activeModCharacterSelectionId, modCharacterGroups],
  )
  const baseActiveCharacter = characters.find((character) => character.key === activeCharacterId) ?? filteredCharacters[0] ?? characters[0] ?? null
  const activeCharacter =
    modCharacterOverride?.key === baseActiveCharacter?.key ? modCharacterOverride : baseActiveCharacter
  const activeVariant =
    activeCharacter?.variants.find((variant) => variant.key === activeVariantKey) ?? activeCharacter?.variants[0] ?? null

  useEffect(() => {
    if (!directoryInfo?.rootPath) {
      return deferToTimeout(() => {
        setCharacters([])
        setModCharacterOverride(null)
        setActiveCharacterId(null)
        setActiveVariantKey('default')
        setCharacterStatusMessage('')
        setAssetState({
          spritePath: null,
          portraitPath: null,
          spriteUrl: null,
          portraitUrl: null,
          springObjectsPath: null,
          springObjectsUrl: null,
          spriteSheetWidth: null,
          spriteSheetHeight: null,
          portraitSheetWidth: null,
          portraitSheetHeight: null,
          portraitOriginalWidth: null,
          portraitOriginalHeight: null,
          springObjectsSheetWidth: null,
          springObjectsSheetHeight: null,
        })
      })
    }

    let cancelled = false

    void (async () => {
      try {
        const hydratedCharacters = await loadCharacterWorkspaceEntries(directoryInfo.rootPath, locale)
        if (cancelled) {
          return
        }

        setCharacters(hydratedCharacters)
        setActiveCharacterId((current) =>
          current && hydratedCharacters.some((character) => character.key === current)
            ? current
            : hydratedCharacters[0]?.key ?? null,
        )
        setCharacterStatusMessage(
          hydratedCharacters.length
            ? copy.indexedStatusTemplate.replace('{count}', String(hydratedCharacters.length))
            : copy.noEntriesStatus,
        )
      } catch (error) {
        if (!cancelled) {
          setCharacters([])
          setModCharacterOverride(null)
          setActiveCharacterId(null)
          setCharacterStatusMessage(error instanceof Error ? error.message : String(error))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [copy.indexedStatusTemplate, copy.noEntriesStatus, directoryInfo?.rootPath, locale])

  useEffect(() => {
    if (browserSourceMode !== 'mod' || !directoryInfo?.rootPath || !activeModCharacterEntry || !baseActiveCharacter) {
      return deferToAnimationFrame(() => {
        setModCharacterOverride(null)
      })
    }

    let cancelled = false

    const cancel = deferToAnimationFrame(() => {
      void (async () => {
        try {
          const modContent = await loadModResultJsonValue({
            rootPath: directoryInfo.rootPath,
            entry: activeModCharacterEntry,
            preferredTargets: ['Data/Characters'],
          })

          if (cancelled) {
            return
          }

          if (!modContent || typeof modContent !== 'object' || Array.isArray(modContent)) {
            setModCharacterOverride(null)
            return
          }

          const overrideCharacter =
            createCharacterEntryIndex(JSON.stringify(modContent)).find((character) => character.key === baseActiveCharacter.key) ?? null
          setModCharacterOverride(
            overrideCharacter ? mergeCharacterAppearanceOverride(baseActiveCharacter, overrideCharacter) : null,
          )
        } catch {
          if (!cancelled) {
            setModCharacterOverride(null)
          }
        }
      })()
    })

    return () => {
      cancelled = true
      cancel()
    }
  }, [activeModCharacterEntry, baseActiveCharacter, browserSourceMode, directoryInfo?.rootPath])

  useEffect(() => {
    return deferToAnimationFrame(() => {
      if (!activeCharacter) {
        setActiveVariantKey('default')
        return
      }

      setActiveVariantKey((current) =>
          activeCharacter.variants.some((variant) => variant.key === current) ? current : activeCharacter.variants[0]?.key ?? 'default',
      )
    })
  }, [activeCharacter])

  useEffect(() => {
    if (browserSourceMode !== 'mod') {
      return
    }

    return deferToAnimationFrame(() => {
      const nextEntry =
          activeModCharacterEntry ??
          modCharacterGroups
              .flatMap((group) => group.items)
              .find((item) => item.value.key === activeCharacterId) ??
          modCharacterGroups[0]?.items[0] ??
          null

      if (!nextEntry) {
        return
      }

      setActiveModCharacterSelectionId(nextEntry.selectionId)
      if (nextEntry.value.key !== activeCharacterId) {
        setActiveCharacterId(nextEntry.value.key)
      }
    })
  }, [activeCharacterId, activeModCharacterEntry, browserSourceMode, modCharacterGroups])

  useEffect(() => {
    let cancelled = false
    const cancel = deferToAnimationFrame(() => {
      const { spritePath, portraitPath } = resolveCharacterVariantPaths(directoryInfo?.rootPath ?? null, activeVariant)
      const springObjectsPath = directoryInfo?.rootPath ? `${directoryInfo.rootPath}\\${SPRING_OBJECTS_ASSET_PATH}` : null

      if (!enableVisualAssets) {
        setAssetState({
          spritePath,
          portraitPath,
          spriteUrl: null,
          portraitUrl: null,
          springObjectsPath,
          springObjectsUrl: null,
          spriteSheetWidth: null,
          spriteSheetHeight: null,
          portraitSheetWidth: null,
          portraitSheetHeight: null,
          portraitOriginalWidth: null,
          portraitOriginalHeight: null,
          springObjectsSheetWidth: null,
          springObjectsSheetHeight: null,
        })
        return
      }

      if (!spritePath && !portraitPath && !springObjectsPath) {
        setAssetState({
          spritePath: null,
          portraitPath: null,
          spriteUrl: null,
          portraitUrl: null,
          springObjectsPath: null,
          springObjectsUrl: null,
          spriteSheetWidth: null,
          spriteSheetHeight: null,
          portraitSheetWidth: null,
          portraitSheetHeight: null,
          portraitOriginalWidth: null,
          portraitOriginalHeight: null,
          springObjectsSheetWidth: null,
          springObjectsSheetHeight: null,
        })
        return
      }

      void (async () => {
        try {
          const [sprite, portrait, springObjects] = await Promise.all([
            browserSourceMode === 'mod' && directoryInfo?.rootPath && activeModCharacterEntry
              ? loadModResultImageState({
                  rootPath: directoryInfo.rootPath,
                  entry: activeModCharacterEntry,
                  preferredTargets: [activeVariant?.spriteAssetName ?? activeCharacter?.spriteAssetName ?? ''],
                  fallbackPathLabel: activeVariant?.spritePathLabel ?? activeCharacter?.internalName ?? 'Characters\\Unknown',
                })
                  .then((result) => result ?? loadImageState(spritePath, locale))
                  .catch(() => ({ path: spritePath, url: null, width: null, height: null, originalWidth: null, originalHeight: null }))
              : loadImageState(spritePath, locale).catch(
                  () => ({ path: spritePath, url: null, width: null, height: null, originalWidth: null, originalHeight: null }),
                ),
            browserSourceMode === 'mod' && directoryInfo?.rootPath && activeModCharacterEntry
              ? loadModResultImageState({
                  rootPath: directoryInfo.rootPath,
                  entry: activeModCharacterEntry,
                  preferredTargets: [activeVariant?.portraitAssetName ?? activeCharacter?.portraitAssetName ?? ''],
                  fallbackPathLabel: activeVariant?.portraitPathLabel ?? activeCharacter?.internalName ?? 'Portraits\\Unknown',
                })
                  .then((result) => result ?? loadImageState(portraitPath, locale))
                  .catch(() => ({ path: portraitPath, url: null, width: null, height: null, originalWidth: null, originalHeight: null }))
              : loadImageState(portraitPath, locale).catch(
                  () => ({ path: portraitPath, url: null, width: null, height: null, originalWidth: null, originalHeight: null }),
                ),
            loadImageState(springObjectsPath, locale).catch(
              () => ({ path: springObjectsPath, url: null, width: null, height: null, originalWidth: null, originalHeight: null }),
            ),
          ])

          if (cancelled) {
            return
          }

          setAssetState({
            spritePath: sprite.path,
            portraitPath: portrait.path,
            spriteUrl: sprite.url,
            portraitUrl: portrait.url,
            springObjectsPath: springObjects.path,
            springObjectsUrl: springObjects.url,
            spriteSheetWidth: sprite.width,
            spriteSheetHeight: sprite.height,
            portraitSheetWidth: portrait.width,
            portraitSheetHeight: portrait.height,
            portraitOriginalWidth: portrait.originalWidth ?? null,
            portraitOriginalHeight: portrait.originalHeight ?? null,
            springObjectsSheetWidth: springObjects.width,
            springObjectsSheetHeight: springObjects.height,
          })
        } catch {
          if (!cancelled) {
            setAssetState({
              spritePath,
              portraitPath,
              spriteUrl: null,
              portraitUrl: null,
              springObjectsPath,
              springObjectsUrl: null,
              spriteSheetWidth: null,
              spriteSheetHeight: null,
              portraitSheetWidth: null,
              portraitSheetHeight: null,
              portraitOriginalWidth: null,
              portraitOriginalHeight: null,
              springObjectsSheetWidth: null,
              springObjectsSheetHeight: null,
            })
          }
        }
      })()
    })

    return () => {
      cancelled = true
      cancel()
    }
  }, [
    activeCharacter?.internalName,
    activeCharacter?.portraitAssetName,
    activeCharacter?.spriteAssetName,
    activeModCharacterEntry,
    activeVariant,
    browserSourceMode,
    directoryInfo?.rootPath,
    enableVisualAssets,
    locale,
  ])

  function handleSetBrowserSourceMode(mode: BrowserSourceMode) {
    setBrowserSourceMode(mode)
    if (mode !== 'mod') {
      setActiveModCharacterSelectionId(null)
    }
  }

  function handleSelectCharacter(characterKey: string) {
    setActiveCharacterId(characterKey)
  }

  function handleSelectModCharacter(entry: ModBrowserEntry<CharacterWorkspaceEntry>) {
    setActiveModCharacterSelectionId(entry.selectionId)
    setActiveCharacterId(entry.value.key)
  }

  function handleSelectVariant(variant: CharacterAppearanceVariant) {
    setActiveVariantKey(variant.key)
  }

  return {
    characters,
    filteredCharacters,
    browserSourceMode,
    setBrowserSourceMode: handleSetBrowserSourceMode,
    modCharacterGroups,
    activeModCharacterSelectionId,
    activeCharacterModSources,
    characterFilter,
    setCharacterFilter,
    activeCharacterId: activeCharacter?.key ?? null,
    activeCharacter,
    activeVariant,
    characterStatusMessage,
    assetState,
    handleSelectCharacter,
    handleSelectModCharacter,
    handleSelectVariant,
  }
}
