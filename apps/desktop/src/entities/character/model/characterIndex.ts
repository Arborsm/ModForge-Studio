/**
 * Read-only index over the vanilla `Data/Characters` asset.
 *
 * Turns the raw game JSON into the entry shape both character pages render:
 * the browser lists and previews it, the authoring page uses it for the "仅原版"
 * side of its NPC index and for the walking/portrait preview of an entry it is
 * about to override. Pure data — loading and caching live in `../api`.
 */

import { buildGameContentPath } from '@shared/infra/stardew-assets/contentPaths'

export { buildGameContentPath } from '@shared/infra/stardew-assets/contentPaths'

export const CHARACTER_DATA_ASSET_PATH = 'Content\\Data\\Characters.xnb'
export const CHARACTER_GIFT_TASTES_ASSET_PATH = 'Content\\Data\\NPCGiftTastes.xnb'
export const OBJECT_DATA_ASSET_PATH = 'Content\\Data\\Objects.xnb'
export const SPRING_OBJECTS_ASSET_PATH = 'Content\\Maps\\springobjects.xnb'
export const MONSTER_DATA_ASSET_PATH = 'Content\\Data\\Monsters.xnb'

type CharacterPoint = {
  X: number
  Y: number
}

type CharacterRectangle = CharacterPoint & {
  Width: number
  Height: number
}

type CharacterAppearanceDataEntry = {
  Id?: string | null
  Condition?: string | null
  Season?: string | null
  Indoors?: boolean | null
  Outdoors?: boolean | null
  Portrait?: string | null
  Sprite?: string | null
  IsIslandAttire?: boolean | null
  Precedence?: number | null
  Weight?: number | null
}

type CharacterHomeDataEntry = {
  Location?: string | null
  Tile?: CharacterPoint | null
  Direction?: number | null
  Condition?: string | null
}

export type CharacterDataEntry = {
  DisplayName?: string | null
  BirthSeason?: string | null
  BirthDay?: number | null
  HomeRegion?: string | null
  Language?: string | null
  Gender?: string | null
  Age?: string | null
  Manner?: string | null
  SocialAnxiety?: string | null
  Optimism?: string | null
  IsDarkSkinned?: boolean | null
  CanBeRomanced?: boolean | null
  LoveInterest?: string | null
  CanReceiveGifts?: boolean | null
  CanGreetNearbyCharacters?: boolean | null
  CanVisitIsland?: string | null
  SpawnIfMissing?: boolean | null
  Home?: CharacterHomeDataEntry[] | null
  TextureName?: string | null
  Appearance?: CharacterAppearanceDataEntry[] | null
  MugShotSourceRect?: CharacterRectangle | null
  Size?: CharacterPoint | null
  Breather?: boolean | null
  BreathChestRect?: CharacterRectangle | null
  BreathChestPosition?: CharacterPoint | null
  ShakePortraits?: number[] | null
  FriendsAndFamily?: Record<string, string> | null
  FormerCharacterNames?: string[] | null
  FestivalVanillaActorIndex?: number | null
}

export type CharacterAppearanceVariant = {
  id: string
  key: string
  kind: 'default' | 'appearance'
  label: string
  condition: string | null
  season: string | null
  indoors: boolean
  outdoors: boolean
  isIslandAttire: boolean
  precedence: number
  weight: number
  portraitAssetName: string | null
  spriteAssetName: string | null
  portraitPathLabel: string
  spritePathLabel: string
}

export type CharacterGiftItem = {
  itemId: string
  objectIndex: number | null
  displayName: string
}

export type CharacterGiftGroupKind = 'item' | 'category' | 'tag' | 'default' | 'special'

export type CharacterGiftGroup = {
  key: string
  kind: CharacterGiftGroupKind
  label: string
  items: CharacterGiftItem[]
}

export type CharacterWorkspaceEntry = {
  key: string
  /**
   * The `Data/Characters` record this view was built from, kept so read-only
   * surfaces can render it through the shared `AssetSchema` instead of
   * duplicating the field list.
   */
  rawEntry: Record<string, unknown>
  rawDisplayName: string
  displayName: string
  internalName: string
  searchText: string
  textureName: string
  spriteAssetName: string
  portraitAssetName: string
  birthSeason: string | null
  birthDay: number | null
  homeRegion: string | null
  language: string | null
  gender: string | null
  age: string | null
  manner: string | null
  socialAnxiety: string | null
  optimism: string | null
  isDarkSkinned: boolean
  canBeRomanced: boolean
  loveInterest: string | null
  loveInterestDisplayName: string | null
  canReceiveGifts: boolean
  canGreetNearbyCharacters: boolean
  canVisitIsland: string | null
  spawnIfMissing: boolean
  spriteWidth: number
  spriteHeight: number
  breather: boolean
  breathChestRect: CharacterRectangle | null
  breathChestPosition: CharacterPoint | null
  mugShotSourceRect: CharacterRectangle | null
  shakePortraits: number[]
  homes: CharacterHomeDataEntry[]
  friendsAndFamily: Record<string, string>
  friendsAndFamilyEntries: Array<{
    internalName: string
    displayName: string
    relation: string
  }>
  lovedGifts: CharacterGiftItem[]
  likedGifts: CharacterGiftItem[]
  neutralGifts: CharacterGiftItem[]
  dislikedGifts: CharacterGiftItem[]
  hatedGifts: CharacterGiftItem[]
  lovedGiftGroups: CharacterGiftGroup[]
  likedGiftGroups: CharacterGiftGroup[]
  neutralGiftGroups: CharacterGiftGroup[]
  dislikedGiftGroups: CharacterGiftGroup[]
  hatedGiftGroups: CharacterGiftGroup[]
  formerCharacterNames: string[]
  festivalVanillaActorIndex: number | null
  variants: CharacterAppearanceVariant[]
}

export type CharacterVisualAssetState = {
  loading?: boolean
  spritePath: string | null
  portraitPath: string | null
  spriteUrl: string | null
  portraitUrl: string | null
  springObjectsPath: string | null
  springObjectsUrl: string | null
  spriteSheetWidth: number | null
  spriteSheetHeight: number | null
  portraitSheetWidth: number | null
  portraitSheetHeight: number | null
  portraitOriginalWidth?: number | null
  portraitOriginalHeight?: number | null
  springObjectsSheetWidth: number | null
  springObjectsSheetHeight: number | null
  /** Decoded sprite sheet image, used for pixel-based frame-grid inference (e.g. Bear). */
  spriteImage?: HTMLImageElement | null
}

/** Empty visual state, used before assets resolve and when no NPC is selected. */
export const EMPTY_CHARACTER_VISUAL_ASSET_STATE: CharacterVisualAssetState = {
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
  spriteImage: null,
}

export function normalizeCharacterAssetName(assetName: string | null | undefined, folderName: 'Characters' | 'Portraits') {
  const trimmed = assetName?.trim().replaceAll('\\', '/') ?? ''
  if (!trimmed) {
    return null
  }

  if (/^(Characters|Portraits)\//iu.test(trimmed)) {
    return trimmed
  }

  return `${folderName}/${trimmed}`
}

function buildAssetPathLabel(assetName: string | null | undefined, folderName: 'Characters' | 'Portraits') {
  return normalizeCharacterAssetName(assetName, folderName)?.replaceAll('/', '\\') ?? `${folderName}\\Unknown`
}

function inferVariantLabel(entry: CharacterAppearanceDataEntry, index: number) {
  const id = entry.Id?.trim()
  if (id) {
    return id
  }

  const season = entry.Season?.trim()
  if (season) {
    return season
  }

  if (entry.IsIslandAttire) {
    return 'Island'
  }

  if (entry.Condition?.trim()) {
    return `Variant ${index + 1}`
  }

  return `Appearance ${index + 1}`
}

/**
 * Builds the appearance variant list of one entry: the base textures first,
 * then one variant per `Appearance` record with its own texture overrides.
 * Shared so the authoring preview shows the same variants the browser does.
 */
export function buildCharacterAppearanceVariants(
  key: string,
  textureName: string,
  appearance: readonly CharacterAppearanceDataEntry[] | null | undefined,
): CharacterAppearanceVariant[] {
  const spriteAssetName = normalizeCharacterAssetName(textureName, 'Characters') ?? `Characters/${key}`
  const portraitAssetName = normalizeCharacterAssetName(textureName, 'Portraits') ?? `Portraits/${key}`

  return [
    {
      id: 'default',
      key: 'default',
      kind: 'default',
      label: 'Default',
      condition: null,
      season: null,
      indoors: false,
      outdoors: false,
      isIslandAttire: false,
      precedence: 0,
      weight: 1,
      portraitAssetName,
      spriteAssetName,
      portraitPathLabel: buildAssetPathLabel(portraitAssetName, 'Portraits'),
      spritePathLabel: buildAssetPathLabel(spriteAssetName, 'Characters'),
    },
    ...(appearance ?? []).map((variant, index) => {
      const resolvedPortraitAssetName = normalizeCharacterAssetName(variant.Portrait, 'Portraits') ?? portraitAssetName
      const resolvedSpriteAssetName = normalizeCharacterAssetName(variant.Sprite, 'Characters') ?? spriteAssetName

      return {
        id: variant.Id?.trim() || `appearance-${index + 1}`,
        key: `appearance:${variant.Id?.trim() || index}`,
        kind: 'appearance' as const,
        label: inferVariantLabel(variant, index),
        condition: variant.Condition?.trim() || null,
        season: variant.Season?.trim() || null,
        indoors: Boolean(variant.Indoors),
        outdoors: Boolean(variant.Outdoors),
        isIslandAttire: Boolean(variant.IsIslandAttire),
        precedence: variant.Precedence ?? 0,
        weight: variant.Weight ?? 1,
        portraitAssetName: resolvedPortraitAssetName,
        spriteAssetName: resolvedSpriteAssetName,
        portraitPathLabel: buildAssetPathLabel(resolvedPortraitAssetName, 'Portraits'),
        spritePathLabel: buildAssetPathLabel(resolvedSpriteAssetName, 'Characters'),
      }
    }),
  ]
}

/** Builds one workspace entry from a raw `Data/Characters` record. */
export function createCharacterWorkspaceEntry(key: string, entry: CharacterDataEntry): CharacterWorkspaceEntry {
  const displayName = entry.DisplayName?.trim() || key
  const textureName = entry.TextureName?.trim() || key
  const spriteAssetName = normalizeCharacterAssetName(textureName, 'Characters') ?? `Characters/${key}`
  const portraitAssetName = normalizeCharacterAssetName(textureName, 'Portraits') ?? `Portraits/${key}`
  const formerCharacterNames = (entry.FormerCharacterNames ?? []).filter((value): value is string => Boolean(value?.trim()))
  const variants = buildCharacterAppearanceVariants(key, textureName, entry.Appearance)

  return {
    key,
    rawEntry: entry as Record<string, unknown>,
    rawDisplayName: displayName,
    displayName,
    internalName: key,
    searchText: [
      key,
      displayName,
      textureName,
      entry.HomeRegion,
      entry.LoveInterest,
      ...formerCharacterNames,
      ...variants.map((variant) => variant.label),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
    textureName,
    spriteAssetName,
    portraitAssetName,
    birthSeason: entry.BirthSeason?.trim() || null,
    birthDay: entry.BirthDay ?? null,
    homeRegion: entry.HomeRegion?.trim() || null,
    language: entry.Language?.trim() || null,
    gender: entry.Gender?.trim() || null,
    age: entry.Age?.trim() || null,
    manner: entry.Manner?.trim() || null,
    socialAnxiety: entry.SocialAnxiety?.trim() || null,
    optimism: entry.Optimism?.trim() || null,
    isDarkSkinned: Boolean(entry.IsDarkSkinned),
    canBeRomanced: Boolean(entry.CanBeRomanced),
    loveInterest: entry.LoveInterest?.trim() || null,
    loveInterestDisplayName: null,
    canReceiveGifts: Boolean(entry.CanReceiveGifts),
    canGreetNearbyCharacters: Boolean(entry.CanGreetNearbyCharacters),
    canVisitIsland: entry.CanVisitIsland?.trim() || null,
    spawnIfMissing: Boolean(entry.SpawnIfMissing),
    spriteWidth: Math.max(16, entry.Size?.X ?? 16),
    spriteHeight: Math.max(16, entry.Size?.Y ?? 32),
    breather: entry.Breather ?? true,
    breathChestRect: entry.BreathChestRect ?? null,
    breathChestPosition: entry.BreathChestPosition ?? null,
    mugShotSourceRect: entry.MugShotSourceRect ?? null,
    shakePortraits: (entry.ShakePortraits ?? []).filter((value): value is number => Number.isFinite(value)),
    homes: entry.Home ?? [],
    friendsAndFamily: entry.FriendsAndFamily ?? {},
    friendsAndFamilyEntries: [],
    lovedGifts: [],
    likedGifts: [],
    neutralGifts: [],
    dislikedGifts: [],
    hatedGifts: [],
    lovedGiftGroups: [],
    likedGiftGroups: [],
    neutralGiftGroups: [],
    dislikedGiftGroups: [],
    hatedGiftGroups: [],
    formerCharacterNames,
    festivalVanillaActorIndex: entry.FestivalVanillaActorIndex ?? null,
    variants,
  }
}

export function createCharacterEntryIndex(content: string) {
  const parsed = JSON.parse(content) as Record<string, CharacterDataEntry>

  return Object.entries(parsed)
    .map(([key, entry]) => createCharacterWorkspaceEntry(key, entry))
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
}

export function resolveCharacterVariantPaths(rootPath: string | null, variant: CharacterAppearanceVariant | null) {
  if (!rootPath || !variant) {
    return { spritePath: null, portraitPath: null }
  }

  return {
    spritePath: buildGameContentPath(rootPath, variant.spriteAssetName),
    portraitPath: buildGameContentPath(rootPath, variant.portraitAssetName),
  }
}

export function getCharacterPortraitFrameCount(width: number | null, height: number | null) {
  if (!width || !height) {
    return 0
  }

  return Math.max(1, Math.floor(width / 64) * Math.floor(height / 64))
}

/**
 * Applies an override's appearance-affecting fields onto a base entry, so the
 * preview follows the override's textures while keeping the base metadata the
 * override does not redefine.
 */
export function mergeCharacterAppearanceOverride(
  baseCharacter: CharacterWorkspaceEntry,
  overrideCharacter: CharacterWorkspaceEntry,
): CharacterWorkspaceEntry {
  return {
    ...baseCharacter,
    rawEntry: { ...baseCharacter.rawEntry, ...overrideCharacter.rawEntry },
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
  }
}
