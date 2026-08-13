/**
 * Domain types and entry-level operations for the `Data/Buildings` asset.
 *
 * Single definition site for the building field shape: the authoring page, the
 * building codex and the validation layer all read these types, this key order
 * and these suggestion catalogs. Parsing, serialization and generic validation
 * stay in `@entities/asset-schema` and run against `./buildingSchema`.
 * No React, no host access.
 */

import { findTexturePatchState, type AssetTexturePatchInput, type AssetTexturePatchState } from '@entities/asset-schema'

/** XNA point payload; extra keys are preserved for round-trip fidelity. */
export type BuildingPoint = { X?: number; Y?: number } & Record<string, unknown>

/** XNA rectangle payload; extra keys are preserved for round-trip fidelity. */
export type BuildingRectangle = { X?: number; Y?: number; Width?: number; Height?: number } & Record<string, unknown>

/** One `BuildMaterials` row: a qualified item id plus how many it costs. */
export type BuildingMaterialFields = {
  ItemId?: string | null
  Amount?: number | null
} & Record<string, unknown>

/**
 * One `Skins` row: an alternate look for the same building.
 *
 * A skin overrides the presentation fields (name, description, texture) and may
 * carry its own build cost; `ShowAsSeparateConstructionEntry` decides whether it
 * gets its own row in the carpenter menu instead of a paint-bucket variant.
 */
export type BuildingSkinFields = {
  Id?: string
  Name?: string | null
  NameForGeneralType?: string | null
  Description?: string | null
  Texture?: string | null
  Condition?: string | null
  BuildDays?: number | null
  BuildCost?: number | null
  BuildMaterials?: BuildingMaterialFields[] | null
  ShowAsSeparateConstructionEntry?: boolean | null
  Metadata?: Record<string, string> | null
} & Record<string, unknown>

/**
 * One `AdditionalPlacementTiles` row: tiles that must be clear on top of the
 * building footprint. `TileArea` is relative to the building's top-left corner,
 * so areas outside `Size` are legitimate (the Mill reserves the tile row below
 * itself this way).
 */
export type BuildingPlacementTileFields = {
  TileArea?: BuildingRectangle | null
  OnlyNeedsToBePassable?: boolean | null
} & Record<string, unknown>

/**
 * Known StardewValley.GameData.Buildings.BuildingData fields (game-shape
 * PascalCase keys). Values stay loosely typed because entries round-trip
 * user-authored JSON.
 */
export interface BuildingDataFields {
  Name?: string | null
  NameForGeneralType?: string | null
  Description?: string | null
  Texture?: string | null
  Skins?: BuildingSkinFields[] | null
  DrawShadow?: boolean | null
  UpgradeSignTile?: BuildingPoint | string | null
  UpgradeSignHeight?: number | null
  Size?: BuildingPoint | string | null
  FadeWhenBehind?: boolean | null
  SourceRect?: BuildingRectangle | string | null
  SeasonOffset?: BuildingPoint | string | null
  DrawOffset?: BuildingPoint | string | null
  SortTileOffset?: number | null
  CollisionMap?: string | null
  AdditionalPlacementTiles?: BuildingPlacementTileFields[] | null
  BuildingType?: string | null
  Builder?: string | null
  BuildCondition?: string | null
  BuildDays?: number | null
  BuildCost?: number | null
  BuildMaterials?: BuildingMaterialFields[] | null
  BuildingToUpgrade?: string | null
  MagicalConstruction?: boolean | null
  BuildMenuDrawOffset?: BuildingPoint | string | null
  HumanDoor?: BuildingPoint | string | null
  AnimalDoor?: BuildingRectangle | string | null
  AnimalDoorOpenDuration?: number | null
  AnimalDoorOpenSound?: string | null
  AnimalDoorCloseDuration?: number | null
  AnimalDoorCloseSound?: string | null
  NonInstancedIndoorLocation?: string | null
  IndoorMap?: string | null
  IndoorMapType?: string | null
  MaxOccupants?: number | null
  ValidOccupantTypes?: string[] | null
  AllowAnimalPregnancy?: boolean | null
  IndoorItemMoves?: unknown[] | null
  IndoorItems?: unknown[] | null
  AddMailOnBuild?: string[] | null
  Metadata?: Record<string, string> | null
  ModData?: Record<string, string> | null
  HayCapacity?: number | null
  Chests?: unknown[] | null
  DefaultAction?: string | null
  AdditionalTilePropertyRadius?: number | null
  AllowsFlooringUnderneath?: boolean | null
  ActionTiles?: unknown[] | null
  TileProperties?: unknown[] | null
  ItemConversions?: unknown[] | null
  DrawLayers?: unknown[] | null
  CustomFields?: Record<string, string> | null
}

/** All known BuildingData keys in game data schema order. */
export const BUILDING_FIELD_ORDER = [
  'Name',
  'NameForGeneralType',
  'Description',
  'Texture',
  'Skins',
  'DrawShadow',
  'UpgradeSignTile',
  'UpgradeSignHeight',
  'Size',
  'FadeWhenBehind',
  'SourceRect',
  'SeasonOffset',
  'DrawOffset',
  'SortTileOffset',
  'CollisionMap',
  'AdditionalPlacementTiles',
  'BuildingType',
  'Builder',
  'BuildCondition',
  'BuildDays',
  'BuildCost',
  'BuildMaterials',
  'BuildingToUpgrade',
  'MagicalConstruction',
  'BuildMenuDrawOffset',
  'HumanDoor',
  'AnimalDoor',
  'AnimalDoorOpenDuration',
  'AnimalDoorOpenSound',
  'AnimalDoorCloseDuration',
  'AnimalDoorCloseSound',
  'NonInstancedIndoorLocation',
  'IndoorMap',
  'IndoorMapType',
  'MaxOccupants',
  'ValidOccupantTypes',
  'AllowAnimalPregnancy',
  'IndoorItemMoves',
  'IndoorItems',
  'AddMailOnBuild',
  'Metadata',
  'ModData',
  'HayCapacity',
  'Chests',
  'DefaultAction',
  'AdditionalTilePropertyRadius',
  'AllowsFlooringUnderneath',
  'ActionTiles',
  'TileProperties',
  'ItemConversions',
  'DrawLayers',
  'CustomFields',
] as const satisfies ReadonlyArray<keyof BuildingDataFields>

/** Content Patcher token prefix recommended for custom building internal names. */
export const BUILDING_ID_TOKEN_PREFIX = '{{ModId}}_'

// --- Suggestion catalogs (free-text in game, so suggestions rather than enums) ---

/** Vanilla `Builder` values; a custom builder is legal, so this only suggests. */
export const BUILDER_SUGGESTIONS = ['Robin', 'Wizard'] as const

/** Vanilla `BuildingType` class names a custom building can reuse. */
export const BUILDING_TYPE_SUGGESTIONS = [
  'StardewValley.Buildings.Building',
  'StardewValley.Buildings.Barn',
  'StardewValley.Buildings.Coop',
  'StardewValley.Buildings.FishPond',
  'StardewValley.Buildings.GreenhouseBuilding',
  'StardewValley.Buildings.JunimoHut',
  'StardewValley.Buildings.Mill',
  'StardewValley.Buildings.PetBowl',
  'StardewValley.Buildings.ShippingBin',
  'StardewValley.Buildings.Stable',
] as const

/** Vanilla `IndoorMapType` class names for the interior location instance. */
export const INDOOR_MAP_TYPE_SUGGESTIONS = [
  'StardewValley.AnimalHouse',
  'StardewValley.Locations.Cabin',
  'StardewValley.Locations.FarmHouse',
  'StardewValley.Locations.Cellar',
  'StardewValley.SlimeHutch',
  'StardewValley.Shed',
] as const

/** Vanilla `ValidOccupantTypes` values used by animal housing. */
export const OCCUPANT_TYPE_SUGGESTIONS = ['Barn', 'Coop'] as const

/** Derives a friendly default `Name` from an internal id (strips `{{ModId}}_`). */
export function displayNameFromBuildingId(buildingId: string): string {
  const stripped = buildingId.replace(/^\{\{[^}]+\}\}_?/u, '')
  return stripped || buildingId
}

/**
 * Footprint the new building occupies. Required on create: a building without a
 * positive `Size` cannot be placed at all, and the game reports it as a silent
 * no-op rather than an error, so the create dialog collects it instead of
 * guessing.
 */
export type BuildingFootprint = {
  tilesWide: number
  tilesHigh: number
  /** Carpenter that sells the building; empty means it is not sold anywhere. */
  builder: string
}

export type BuildingFootprintError = 'sizeNotPositive'

/** Validates a create-dialog footprint before it becomes a game entry. */
export function validateBuildingFootprint(footprint: BuildingFootprint): BuildingFootprintError | null {
  const positive = (value: number) => Number.isInteger(value) && value > 0
  return positive(footprint.tilesWide) && positive(footprint.tilesHigh) ? null : 'sizeNotPositive'
}

/**
 * Minimal valid new-building entry.
 *
 * `Texture` is seeded from the building id because the game resolves an omitted
 * texture to `Buildings/<id>` anyway; writing it makes the companion image patch
 * the author has to add discoverable instead of implicit.
 */
export function createMinimalBuildingEntry(buildingId: string, displayName: string, footprint: BuildingFootprint): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    Name: displayName,
    Description: displayName,
    Texture: `Buildings/${buildingId}`,
    Size: { X: footprint.tilesWide, Y: footprint.tilesHigh },
    BuildDays: 1,
    BuildCost: 0,
    BuildMaterials: [],
  }
  const builder = footprint.builder.trim()
  if (builder) {
    entry['Builder'] = builder
  }
  return entry
}

// --- Companion texture patch lookup (Buildings/<id>) ---

/** Minimal structural view over a draft patch used for texture lookups. */
export type BuildingAssetPatchInput = AssetTexturePatchInput

/** Read-only status of the Load/EditImage patch backing a building texture. */
export type BuildingAssetPatchState = AssetTexturePatchState

/**
 * Building-facing name for the shared texture-patch lookup.
 *
 * `assetName` is the entry's own `Texture` value, so an entry that points at a
 * shared sheet reports on that sheet rather than on a guessed `Buildings/<id>`.
 */
export function findBuildingTexturePatchState(
  patches: ReadonlyArray<BuildingAssetPatchInput>,
  assetName: string,
  virtualAssets: ReadonlyArray<{ relativePath: string }>,
): BuildingAssetPatchState {
  return findTexturePatchState(patches, assetName, virtualAssets)
}

export type AddBuildingEntryResult =
  | { ok: true; entries: Record<string, unknown>; buildingId: string }
  | { ok: false; error: 'empty' | 'duplicate' | BuildingFootprintError }

/**
 * Adds a minimal entry under a trimmed id. Rejects blanks, (case-insensitive)
 * duplicates and footprints the game cannot place.
 */
export function addBuildingEntry(
  entries: Record<string, unknown>,
  buildingId: string,
  footprint: BuildingFootprint,
): AddBuildingEntryResult {
  const trimmed = buildingId.trim()
  if (!trimmed) {
    return { ok: false, error: 'empty' }
  }
  const lower = trimmed.toLowerCase()
  if (Object.keys(entries).some((key) => key.toLowerCase() === lower)) {
    return { ok: false, error: 'duplicate' }
  }
  const footprintError = validateBuildingFootprint(footprint)
  if (footprintError !== null) {
    return { ok: false, error: footprintError }
  }
  return {
    ok: true,
    buildingId: trimmed,
    entries: {
      ...entries,
      [trimmed]: createMinimalBuildingEntry(trimmed, displayNameFromBuildingId(trimmed), footprint),
    },
  }
}
