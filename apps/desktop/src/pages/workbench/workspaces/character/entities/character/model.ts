import { buildGameContentPath } from '@shared/infra/stardew-assets/contentPaths'

export { buildGameContentPath } from '@shared/infra/stardew-assets/contentPaths'

export const CHARACTER_DATA_ASSET_PATH = 'Content\\Data\\Characters.xnb'
export const CHARACTER_GIFT_TASTES_ASSET_PATH = 'Content\\Data\\NPCGiftTastes.xnb'
export const OBJECT_DATA_ASSET_PATH = 'Content\\Data\\Objects.xnb'
export const SPRING_OBJECTS_ASSET_PATH = 'Content\\Maps\\springobjects.xnb'

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

type CharacterDataEntry = {
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
}

function normalizeAssetName(assetName: string | null | undefined, folderName: 'Characters' | 'Portraits') {
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
  return normalizeAssetName(assetName, folderName)?.replaceAll('/', '\\') ?? `${folderName}\\Unknown`
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

export function createCharacterEntryIndex(content: string) {
  const parsed = JSON.parse(content) as Record<string, CharacterDataEntry>

  return Object.entries(parsed)
    .map(([key, entry]): CharacterWorkspaceEntry => {
      const displayName = entry.DisplayName?.trim() || key
      const textureName = entry.TextureName?.trim() || key
      const spriteAssetName = normalizeAssetName(textureName, 'Characters') ?? `Characters/${key}`
      const portraitAssetName = normalizeAssetName(textureName, 'Portraits') ?? `Portraits/${key}`
      const formerCharacterNames = (entry.FormerCharacterNames ?? []).filter((value): value is string => Boolean(value?.trim()))
      const variants: CharacterAppearanceVariant[] = [
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
        ...(entry.Appearance ?? []).map((appearance, index) => {
          const resolvedPortraitAssetName = normalizeAssetName(appearance.Portrait, 'Portraits') ?? portraitAssetName
          const resolvedSpriteAssetName = normalizeAssetName(appearance.Sprite, 'Characters') ?? spriteAssetName

          return {
            id: appearance.Id?.trim() || `appearance-${index + 1}`,
            key: `appearance:${appearance.Id?.trim() || index}`,
            kind: 'appearance' as const,
            label: inferVariantLabel(appearance, index),
            condition: appearance.Condition?.trim() || null,
            season: appearance.Season?.trim() || null,
            indoors: Boolean(appearance.Indoors),
            outdoors: Boolean(appearance.Outdoors),
            isIslandAttire: Boolean(appearance.IsIslandAttire),
            precedence: appearance.Precedence ?? 0,
            weight: appearance.Weight ?? 1,
            portraitAssetName: resolvedPortraitAssetName,
            spriteAssetName: resolvedSpriteAssetName,
            portraitPathLabel: buildAssetPathLabel(resolvedPortraitAssetName, 'Portraits'),
            spritePathLabel: buildAssetPathLabel(resolvedSpriteAssetName, 'Characters'),
          }
        }),
      ]

      return {
        key,
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
    })
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
