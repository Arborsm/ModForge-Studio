/**
 * `Data/Objects` domain constants: key order, value suggestions and the minimal
 * entry a newly created object starts from.
 *
 * The key list and the `Type` suggestions are taken from the shipped
 * `Content/Data/Objects.json` rather than from prose, so the editor writes keys
 * in the same order the game data uses and an author picking a type from the
 * list picks one the game already understands.
 */

/** Content Patcher target of the object asset family. */
export const OBJECT_DATA_ASSET_ID = 'Data/Objects'

/** `ObjectData` keys in game schema order; also the serialization order. */
export const OBJECT_FIELD_ORDER: readonly string[] = [
  'Name',
  'DisplayName',
  'Description',
  'Type',
  'Category',
  'Price',
  'Texture',
  'SpriteIndex',
  'ColorOverlayFromNextIndex',
  'Edibility',
  'IsDrink',
  'Buffs',
  'GeodeDropsDefaultItems',
  'GeodeDrops',
  'ArtifactSpotChances',
  'CanBeGivenAsGift',
  'CanBeTrashed',
  'ExcludeFromFishingCollection',
  'ExcludeFromShippingCollection',
  'ExcludeFromRandomSale',
  'ContextTags',
  'CustomFields',
]

/** `Type` values used by the vanilla object records. */
export const OBJECT_TYPE_SUGGESTIONS: readonly string[] = [
  'Basic',
  'Cooking',
  'Crafting',
  'Fish',
  'Minerals',
  'Arch',
  'Seeds',
  'Ring',
  'Quest',
  'Litter',
  'interactive',
  'asdf',
]

/** Buff ids the game applies from food, offered as free-text suggestions. */
export const OBJECT_BUFF_ID_SUGGESTIONS: readonly string[] = [
  'food',
  'drink',
  'Fishing',
  'Farming',
  'Mining',
  'Foraging',
  'Combat',
  'Luck',
  'Speed',
  'Defense',
  'Attack',
  'MaxEnergy',
  'MagneticRadius',
  'Immunity',
  'Tipsy',
  'Nauseated',
  'Slimed',
]

/** Sentinel `Edibility` value marking an object the player cannot eat. */
export const OBJECT_INEDIBLE = -300

/**
 * Prefix that expands to the project's own mod id at patch time.
 *
 * Item ids share one namespace across every installed mod, so an unprefixed id
 * silently overwrites whichever mod loads later; the create dialog offers this
 * token instead of asking the author to paste their unique id by hand.
 */
export const ITEM_ID_TOKEN_PREFIX = '{{ModId}}_'

/**
 * The `Category` numbers vanilla objects use, so the editor can tell an author
 * that an unusual number is unusual without claiming it is wrong: mods do ship
 * custom categories, and the game only special-cases the ones below.
 */
export const OBJECT_VANILLA_CATEGORIES: readonly number[] = [
  -999, -103, -102, -81, -80, -79, -75, -74, -28, -27, -26, -24, -23, -22, -21, -20, -19, -18, -17, -16, -15, -12, -8, -7, -6, -5, -4, -2,
  0,
]

/** Turns an object id into a readable default display name (`Aspen_Cake` → `Aspen Cake`). */
export function displayNameFromObjectId(objectId: string): string {
  const bare = objectId.includes('_') ? (objectId.split('_').at(-1) ?? objectId) : objectId
  return (
    bare
      .replaceAll(/[_-]+/gu, ' ')
      .replaceAll(/([a-z\d])([A-Z])/gu, '$1 $2')
      .trim() || objectId
  )
}

/**
 * Minimal entry a newly created object starts from.
 *
 * Every key here is one the game reads on load: an object without `Name`,
 * `Type`, `Category`, `Texture` or `SpriteIndex` either fails to load or draws
 * as a blank tile, so the create dialog collects them instead of leaving the
 * author with a record the game rejects.
 */
export function createMinimalObjectEntry(objectId: string, seed: ObjectEntrySeed): Record<string, unknown> {
  return {
    Name: objectId,
    DisplayName: seed.displayName.trim() || displayNameFromObjectId(objectId),
    Description: seed.description.trim(),
    Type: seed.type.trim() || 'Basic',
    Category: seed.category,
    Price: Math.max(0, Math.trunc(seed.price)),
    Texture: seed.texture.trim() || undefined,
    SpriteIndex: Math.max(0, Math.trunc(seed.spriteIndex)),
    Edibility: Math.trunc(seed.edibility),
  }
}

/** Values the create dialog collects before an object entry can exist. */
export type ObjectEntrySeed = {
  displayName: string
  description: string
  type: string
  category: number
  price: number
  /** Sprite sheet asset name; blank means the vanilla `Maps/springobjects` sheet. */
  texture: string
  spriteIndex: number
  edibility: number
}

/** Seed the create dialog opens with: a plain, sellable, inedible object. */
export const DEFAULT_OBJECT_ENTRY_SEED: ObjectEntrySeed = {
  displayName: '',
  description: '',
  type: 'Basic',
  category: 0,
  price: 0,
  texture: '',
  spriteIndex: 0,
  edibility: OBJECT_INEDIBLE,
}

export type AddObjectEntryResult =
  | { ok: true; entries: Record<string, unknown>; objectId: string }
  | { ok: false; error: 'empty' | 'duplicate' }

/** Adds a minimal entry under a trimmed id, rejecting blanks and case-insensitive duplicates. */
export function addObjectEntry(entries: Record<string, unknown>, objectId: string, seed: ObjectEntrySeed): AddObjectEntryResult {
  const trimmed = objectId.trim()
  if (!trimmed) {
    return { ok: false, error: 'empty' }
  }
  const lower = trimmed.toLowerCase()
  if (Object.keys(entries).some((key) => key.toLowerCase() === lower)) {
    return { ok: false, error: 'duplicate' }
  }
  const entry = createMinimalObjectEntry(trimmed, seed)
  for (const [key, value] of Object.entries(entry)) {
    if (value === undefined) {
      delete entry[key]
    }
  }
  return { ok: true, objectId: trimmed, entries: { ...entries, [trimmed]: entry } }
}
