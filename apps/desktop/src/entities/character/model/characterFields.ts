/**
 * Domain types and entry-level operations for the `Data/Characters` asset.
 *
 * Single definition site for the character field shape: the authoring page, the
 * character browser and the validation layer all read these types, this key
 * order and these enum catalogs. Parsing, serialization and generic validation
 * stay in `@entities/asset-schema` and run against `./characterSchema`.
 * No React, no host access.
 */

/** XNA point payload; extra keys are preserved for round-trip fidelity. */
export type CharacterPoint = { X?: number; Y?: number } & Record<string, unknown>

/** XNA rectangle payload; extra keys are preserved for round-trip fidelity. */
export type CharacterRect = { X?: number; Y?: number; Width?: number; Height?: number } & Record<string, unknown>

/** One entry of the CharacterData `Home` list (game shape). */
export type CharacterHomeEntry = {
  Id?: string
  Condition?: string | null
  Location?: string
  Tile?: CharacterPoint | null
  Direction?: string
} & Record<string, unknown>

/**
 * One entry of the CharacterData `Appearance` list (game shape, SDV 1.6).
 *
 * A record is picked when its `Condition`, `Season` and indoor/outdoor flags all
 * match; among the matches the highest `Precedence` wins and ties are broken by
 * a `Weight`-proportional random draw. `Portrait` and `Sprite` are asset names
 * relative to `Content`, and either may be omitted to keep the base texture.
 */
export type CharacterAppearanceEntry = {
  Id?: string
  Condition?: string | null
  Season?: string | null
  Indoors?: boolean
  Outdoors?: boolean
  Portrait?: string | null
  Sprite?: string | null
  IsIslandAttire?: boolean
  Precedence?: number
  Weight?: number
} & Record<string, unknown>

/** CharacterData `Shadow` payload (game shape). */
export type CharacterShadow = {
  Visible?: boolean
  Offset?: CharacterPoint | null
  Scale?: number
} & Record<string, unknown>

/** Basic subset of one `WinterStarGifts` row; extra keys are preserved. */
export type WinterStarGiftEntry = {
  Id?: string
  ItemId?: string | null
  MinStack?: number
  MaxStack?: number
} & Record<string, unknown>

/**
 * Known StardewValley.GameData.Characters.CharacterData fields (game-shape
 * PascalCase keys). Values stay loosely typed because entries round-trip
 * user-authored JSON.
 */
export interface CharacterDataFields {
  DisplayName?: string
  BirthSeason?: string | null
  BirthDay?: number
  HomeRegion?: string
  Language?: string
  Gender?: string
  Age?: string
  Manner?: string
  SocialAnxiety?: string
  Optimism?: string
  IsDarkSkinned?: boolean
  CanBeRomanced?: boolean
  LoveInterest?: string | null
  Calendar?: string
  SocialTab?: string
  CanSocialize?: string | null
  CanReceiveGifts?: boolean
  CanGreetNearbyCharacters?: boolean
  CanCommentOnPurchasedShopItems?: boolean | null
  CanVisitIsland?: string | null
  IntroductionsQuest?: boolean | null
  ItemDeliveryQuests?: string | null
  PerfectionScore?: boolean
  EndSlideShow?: string
  SpouseAdopts?: string | null
  SpouseWantsChildren?: string | null
  SpouseGiftJealousy?: string | null
  SpouseGiftJealousyFriendshipChange?: number
  SpouseRoom?: unknown
  SpousePatio?: unknown
  SpouseFloors?: string[]
  SpouseWallpapers?: string[]
  DumpsterDiveFriendshipEffect?: number
  DumpsterDiveEmote?: number | null
  FriendsAndFamily?: Record<string, string>
  FlowerDanceCanDance?: boolean | null
  WinterStarGifts?: WinterStarGiftEntry[]
  WinterStarParticipant?: string | null
  UnlockConditions?: string | null
  SpawnIfMissing?: boolean
  Home?: CharacterHomeEntry[]
  TextureName?: string | null
  Appearance?: CharacterAppearanceEntry[]
  MugShotSourceRect?: CharacterRect | null
  Size?: CharacterPoint
  Breather?: boolean
  BreathChestRect?: CharacterRect | null
  BreathChestPosition?: CharacterPoint | null
  Shadow?: CharacterShadow | null
  EmoteOffset?: CharacterPoint
  ShakePortraits?: number[]
  KissSpriteIndex?: number
  KissSpriteFacingRight?: boolean
  HiddenProfileEmoteSound?: string | null
  HiddenProfileEmoteDuration?: number
  HiddenProfileEmoteStartFrame?: number
  HiddenProfileEmoteFrameCount?: number
  HiddenProfileEmoteFrameDuration?: number
  FormerCharacterNames?: string[]
  FestivalVanillaActorIndex?: number
  CustomFields?: Record<string, string> | null
}

/** All known CharacterData keys in game data schema order. */
export const CHARACTER_FIELD_ORDER = [
  'DisplayName',
  'BirthSeason',
  'BirthDay',
  'HomeRegion',
  'Language',
  'Gender',
  'Age',
  'Manner',
  'SocialAnxiety',
  'Optimism',
  'IsDarkSkinned',
  'CanBeRomanced',
  'LoveInterest',
  'Calendar',
  'SocialTab',
  'CanSocialize',
  'CanReceiveGifts',
  'CanGreetNearbyCharacters',
  'CanCommentOnPurchasedShopItems',
  'CanVisitIsland',
  'IntroductionsQuest',
  'ItemDeliveryQuests',
  'PerfectionScore',
  'EndSlideShow',
  'SpouseAdopts',
  'SpouseWantsChildren',
  'SpouseGiftJealousy',
  'SpouseGiftJealousyFriendshipChange',
  'SpouseRoom',
  'SpousePatio',
  'SpouseFloors',
  'SpouseWallpapers',
  'DumpsterDiveFriendshipEffect',
  'DumpsterDiveEmote',
  'FriendsAndFamily',
  'FlowerDanceCanDance',
  'WinterStarGifts',
  'WinterStarParticipant',
  'UnlockConditions',
  'SpawnIfMissing',
  'Home',
  'TextureName',
  'Appearance',
  'MugShotSourceRect',
  'Size',
  'Breather',
  'BreathChestRect',
  'BreathChestPosition',
  'Shadow',
  'EmoteOffset',
  'ShakePortraits',
  'KissSpriteIndex',
  'KissSpriteFacingRight',
  'HiddenProfileEmoteSound',
  'HiddenProfileEmoteDuration',
  'HiddenProfileEmoteStartFrame',
  'HiddenProfileEmoteFrameCount',
  'HiddenProfileEmoteFrameDuration',
  'FormerCharacterNames',
  'FestivalVanillaActorIndex',
  'CustomFields',
] as const satisfies ReadonlyArray<keyof CharacterDataFields>

/** Content Patcher token prefix recommended for custom NPC internal names. */
export const MOD_ID_TOKEN_PREFIX = '{{ModId}}_'

/** Derives a friendly default DisplayName from an internal id (strips `{{ModId}}_`). */
export function displayNameFromNpcId(npcId: string): string {
  const stripped = npcId.replace(/^\{\{[^}]+\}\}_?/u, '')
  return stripped || npcId
}

/**
 * Where a new NPC spawns. Required on create: an NPC without a valid home tile
 * is placed at the map origin by the game, which reads as a broken mod rather
 * than an unset field, so the create dialog collects it instead of guessing.
 */
export type CharacterHomePlacement = {
  location: string
  tileX: number
  tileY: number
  direction: string
}

/** Default facing used by the create dialog until the author picks another. */
export const DEFAULT_HOME_DIRECTION = 'down'

export type CharacterHomePlacementError = 'locationMissing' | 'tileNotNumeric'

/** Validates a create-dialog home placement before it becomes a game entry. */
export function validateHomePlacement(placement: CharacterHomePlacement): CharacterHomePlacementError | null {
  if (!placement.location.trim()) {
    return 'locationMissing'
  }
  if (!Number.isInteger(placement.tileX) || !Number.isInteger(placement.tileY) || placement.tileX < 0 || placement.tileY < 0) {
    return 'tileNotNumeric'
  }
  return null
}

/** Minimal valid new-NPC entry: display name plus the home the author picked. */
export function createMinimalCharacterEntry(displayName: string, home: CharacterHomePlacement): Record<string, unknown> {
  return {
    DisplayName: displayName,
    Home: [
      {
        Id: 'Default',
        Location: home.location.trim(),
        Tile: { X: home.tileX, Y: home.tileY },
        Direction: home.direction,
      },
    ],
  }
}

export type AddCharacterEntryResult =
  | { ok: true; entries: Record<string, unknown>; npcId: string }
  | { ok: false; error: 'empty' | 'duplicate' | CharacterHomePlacementError }

/**
 * Adds a minimal entry under a trimmed id. Rejects blanks, (case-insensitive)
 * duplicates and home placements the game cannot resolve.
 */
export function addCharacterEntry(entries: Record<string, unknown>, npcId: string, home: CharacterHomePlacement): AddCharacterEntryResult {
  const trimmed = npcId.trim()
  if (!trimmed) {
    return { ok: false, error: 'empty' }
  }
  const lower = trimmed.toLowerCase()
  if (Object.keys(entries).some((key) => key.toLowerCase() === lower)) {
    return { ok: false, error: 'duplicate' }
  }
  const placementError = validateHomePlacement(home)
  if (placementError !== null) {
    return { ok: false, error: placementError }
  }
  return {
    ok: true,
    npcId: trimmed,
    entries: { ...entries, [trimmed]: createMinimalCharacterEntry(displayNameFromNpcId(trimmed), home) },
  }
}

// --- Enum catalogs (mirrored from gamedata_schema.json) ---

export const SEASON_VALUES = ['Spring', 'Summer', 'Fall', 'Winter'] as const
export const GENDER_VALUES = ['Undefined', 'Male', 'Female'] as const
export const AGE_VALUES = ['Adult', 'Teen', 'Child'] as const
export const MANNER_VALUES = ['Neutral', 'Polite', 'Rude'] as const
export const SOCIAL_ANXIETY_VALUES = ['Neutral', 'Outgoing', 'Shy'] as const
export const OPTIMISM_VALUES = ['Neutral', 'Positive', 'Negative'] as const
export const LANGUAGE_VALUES = ['Default', 'Dwarvish'] as const
export const CALENDAR_VALUES = ['AlwaysShown', 'HiddenUntilMet', 'HiddenAlways'] as const
export const SOCIAL_TAB_VALUES = ['UnknownUntilMet', 'AlwaysShown', 'HiddenUntilMet', 'HiddenAlways'] as const
export const END_SLIDE_SHOW_VALUES = ['Hidden', 'MainGroup', 'TrailingGroup'] as const
export const HOME_DIRECTION_VALUES = ['up', 'down', 'left', 'right'] as const
export const HOME_REGION_SUGGESTIONS = ['Town', 'Desert', 'Other'] as const

// --- Companion image patch lookup (Portraits/<npc>, Characters/<npc>) ---

/** Minimal structural view over a draft patch used for asset lookups. */
export type CharacterAssetPatchInput = {
  action: string
  target: string
  fromFile?: string
  logName?: string
}

/** Read-only status of the Load/EditImage patch backing an NPC image asset. */
export type CharacterAssetPatchState = {
  assetTarget: string
  patchFound: boolean
  patchAction: string | null
  patchLogName: string | null
  fromFile: string | null
  fileInDraft: boolean
}

function normalizeAssetTarget(target: string): string {
  return target.trim().replaceAll('\\', '/').toLowerCase()
}

/**
 * Scans draft patches for a Load/EditImage patch whose target matches
 * `<kind>/<npcId>` (case-insensitive) and reports its fromFile plus whether
 * that file is present among the draft's virtual assets.
 */
export function findCharacterAssetPatchState(
  patches: ReadonlyArray<CharacterAssetPatchInput>,
  kind: 'Portraits' | 'Characters',
  npcId: string,
  virtualAssets: ReadonlyArray<{ relativePath: string }>,
): CharacterAssetPatchState {
  const assetTarget = `${kind}/${npcId}`
  const wanted = normalizeAssetTarget(assetTarget)
  const match = patches.find(
    (patch) => (patch.action === 'Load' || patch.action === 'EditImage') && normalizeAssetTarget(patch.target) === wanted,
  )
  const fromFile = match?.fromFile?.trim() || null
  return {
    assetTarget,
    patchFound: Boolean(match),
    patchAction: match?.action ?? null,
    patchLogName: match?.logName?.trim() || null,
    fromFile,
    fileInDraft: fromFile !== null && virtualAssets.some((asset) => asset.relativePath === fromFile),
  }
}
