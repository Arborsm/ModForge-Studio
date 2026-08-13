import type { MapPropertyValue } from './types'

/** Map-level property keys the semantic cards and top-bar chips read and write. */
export const OUTDOORS_PROPERTY_KEY = 'Outdoors'
export const AMBIENT_LIGHT_PROPERTY_KEY = 'AmbientLight'
export const AMBIENT_NIGHT_LIGHT_PROPERTY_KEY = 'AmbientNightLight'
export const MUSIC_PROPERTY_KEY = 'Music'
export const WARP_PROPERTY_KEY = 'Warp'
export const DOORS_PROPERTY_KEY = 'Doors'
export const DAY_TILES_PROPERTY_KEY = 'DayTiles'
export const NIGHT_TILES_PROPERTY_KEY = 'NightTiles'

/** Property-key categories used to group the categorized raw property editor. */
export const MAP_PROPERTY_CATEGORY_KEYS: Record<Exclude<MapPropertyCategory, 'other'>, readonly string[]> = {
  map: [OUTDOORS_PROPERTY_KEY, 'LocationContext', 'IsFarm', 'FarmType', 'TreatAsOutdoors', 'CanPlantTrees', 'CanPlaceFurniture'],
  warps: [WARP_PROPERTY_KEY, 'NPCWarp', DOORS_PROPERTY_KEY, 'EntryAction', 'TouchAction'],
  lighting: [AMBIENT_LIGHT_PROPERTY_KEY, 'Light', 'WindowLight', DAY_TILES_PROPERTY_KEY, NIGHT_TILES_PROPERTY_KEY],
  music: [MUSIC_PROPERTY_KEY, 'MusicContext', 'AmbientSound'],
  spawning: ['NoSpawn', 'Spawnable', 'SpawnTreasure', 'ForageSpawn', 'Diggable'],
  buildings: ['Buildings', 'FarmHouse', 'Greenhouse', 'Cellar', 'SpouseRooms'],
}

export const MAP_PROPERTY_CATEGORY_ORDER: readonly MapPropertyCategory[] = [
  'map',
  'warps',
  'lighting',
  'music',
  'spawning',
  'buildings',
  'other',
]

/** Category buckets for the categorized raw-property editor; `other` holds unmatched keys. */
export type MapPropertyCategory = 'map' | 'warps' | 'lighting' | 'music' | 'spawning' | 'buildings' | 'other'

/** Resolves a property key's category; unknown keys fall into `other`. */
export function mapPropertyCategory(key: string): MapPropertyCategory {
  const normalized = key.trim().toLowerCase()
  for (const [category, keys] of Object.entries(MAP_PROPERTY_CATEGORY_KEYS) as Array<
    [Exclude<MapPropertyCategory, 'other'>, readonly string[]]
  >) {
    if (keys.some((candidate) => candidate.toLowerCase() === normalized)) return category
  }
  return 'other'
}

export function unwrapMapPropertyValue(value: MapPropertyValue | undefined): string | number | boolean | undefined {
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return unwrapMapPropertyValue(value.value)
  }
  return value
}

export function asMapPropertyString(value: MapPropertyValue | undefined) {
  const unwrapped = unwrapMapPropertyValue(value)
  if (typeof unwrapped === 'string') {
    return unwrapped
  }

  if (typeof unwrapped === 'number' || typeof unwrapped === 'boolean') {
    return String(unwrapped)
  }

  return ''
}
