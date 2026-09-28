import bundledJson from './mapObjects.json'

/**
 * @file Catalog schema and registry for the map editor "object library": describes
 * predefined rectangular objects (furniture, structural pieces, etc.) on tilesheets,
 * where a click yields the whole rectangle stamp. The bundled catalog is registered
 * on module load; game furniture and project custom objects can be appended by source
 * via `registerMapObjects`, where later sources override entries with the same id.
 */

/** Object library category: a value of `MAP_OBJECT_CATEGORIES`, order defines UI grouping. */
export type MapObjectCategory =
  | 'seating'
  | 'tables'
  | 'beds'
  | 'rugs'
  | 'lighting'
  | 'electronics'
  | 'plants'
  | 'decor'
  | 'storage'
  | 'windows'
  | 'structure'
  | 'walls-floors'
  | 'outdoor'
  | 'festival'
  | 'other'

/** All supported object categories, in the order defined above. */
export const MAP_OBJECT_CATEGORIES: readonly MapObjectCategory[] = [
  'seating',
  'tables',
  'beds',
  'rugs',
  'lighting',
  'electronics',
  'plants',
  'decor',
  'storage',
  'windows',
  'structure',
  'walls-floors',
  'outdoor',
  'festival',
  'other',
]

/** Rectangular region of the object on the sheet (in tile units). */
export type MapCatalogObjectRect = { x: number; y: number; width: number; height: number }

/**
 * Multi-frame layout description for furniture-like objects. On the tilesheet,
 * a furniture's frames are laid out horizontally as "rotation frames × state
 * frames": first `rotations` rotation frames (rotation 0→1→2→3), then a set
 * of alternate state frames with the same layout (lit, rain-closed windows,
 * etc.), with an overall offset of `sourceRect.Width * sourceIndexOffset`.
 *
 * - `rotations`: number of direction frames (1/2/4). 1 means non-rotatable,
 *   2/4 means rotated frames are arranged to the right of defaultSourceRect
 *   on the tilesheet.
 * - `furnitureTypeId`: the type ID (0–17) returned by the game's
 *   `Furniture.getTypeNumberFromName`, which determines the sourceRect
 *   conversion rules on rotation (whether to flip, swap width/height, etc.).
 * - `hasAlternateState`: lamps (lamp=7/sconce=17/torch=16), windows
 *   (window=13), etc. have day/night or weather alternate frames; on the
 *   tilesheet a set of equal-width, equal-height alternate frames follows
 *   the rotation frames.
 */
export type MapCatalogObjectFrameInfo = {
  /** Number of direction frames: 1 = no rotation, 2 = front+back, 4 = four-way. */
  rotations: number
  /** Game Furniture type ID (0–17), determines rotation sourceRect conversion. */
  furnitureTypeId: number
  /** Whether alternate state frames exist (lit/rainy), offset by one width after rotation frames. */
  hasAlternateState: boolean
}

/**
 * A predefined object in the object catalog: references a rectangular stamp on
 * a tilesheet catalog key (e.g. `TileSheets/furniture`, `Maps/townInterior`).
 */
export type MapCatalogObject = {
  id: string
  /** tilesheet catalog key, e.g. `TileSheets/furniture`. */
  sheet: string
  rect: MapCatalogObjectRect
  category: MapObjectCategory
  /** Display names keyed by locale code ('en-US', 'zh-CN', …). */
  names: Record<string, string>
  /**
   * Multi-frame info (optional): populated when a furniture-like object
   * occupies multiple direction or state frames on the tilesheet. Objects
   * on hand-drawn sheets like townInterior do not have this field (they
   * do not participate in rotation or day/night switching).
   */
  frameInfo?: MapCatalogObjectFrameInfo
}

/** Result of `parseMapObjectsJson`: success returns an object list, failure returns an error prefixed with source. */
export type MapObjectsParseResult = { ok: true; objects: MapCatalogObject[] } | { ok: false; error: string }

const OBJECT_CATEGORY_SET = new Set<string>(MAP_OBJECT_CATEGORIES)

function fail(source: string, detail: string): MapObjectsParseResult {
  return { ok: false, error: `${source}: ${detail}` }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parses and validates an object catalog JSON document. The schema is
 * `{ "version": 1, "objects": [{ "id", "sheet", "rect", "category", "names" }] }`,
 * where version only accepts 1 or omitted. id must be non-empty and
 * case-insensitively deduplicated; sheet must be a Content asset key in
 * `folder/filename` form; rect's four fields must be integers with
 * x/y>=0 and width/height>=1; category must be a known enum value; names
 * is a locale-code-to-display-name mapping with at least one non-empty
 * value (en-US may be missing). Any failure includes the `source` prefix
 * and `objects[i]` index; no partial success.
 */
export function parseMapObjectsJson(text: string, source: string): MapObjectsParseResult {
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch (error) {
    return fail(source, error instanceof Error ? error.message : String(error))
  }
  if (!isPlainObject(root)) {
    return fail(source, 'the catalog root must be an object')
  }
  const version = root.version
  if (version !== undefined && version !== 1) {
    return fail(source, `unsupported catalog version ${JSON.stringify(version)}`)
  }
  const objects = root.objects
  if (!Array.isArray(objects)) {
    return fail(source, 'the catalog must contain an "objects" array')
  }
  const seen = new Set<string>()
  const entries: MapCatalogObject[] = []
  for (const [index, raw] of objects.entries()) {
    const label = `objects[${index}]`
    if (!isPlainObject(raw)) {
      return fail(source, `${label} must be an object`)
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    if (id === '') {
      return fail(source, `${label}.id must be a non-empty string`)
    }
    const sheet = typeof raw.sheet === 'string' ? raw.sheet : ''
    if (!/^[^/]+\/[^/]+$/u.test(sheet)) {
      return fail(source, `${label}.sheet must be a Content asset key like "Maps/townInterior"`)
    }
    const rect = raw.rect
    if (!isPlainObject(rect)) {
      return fail(source, `${label}.rect must be an object`)
    }
    if (!Number.isInteger(rect.x) || (rect.x as number) < 0) {
      return fail(source, `${label}.rect.x must be a non-negative integer`)
    }
    if (!Number.isInteger(rect.y) || (rect.y as number) < 0) {
      return fail(source, `${label}.rect.y must be a non-negative integer`)
    }
    if (!Number.isInteger(rect.width) || (rect.width as number) < 1) {
      return fail(source, `${label}.rect.width must be a positive integer`)
    }
    if (!Number.isInteger(rect.height) || (rect.height as number) < 1) {
      return fail(source, `${label}.rect.height must be a positive integer`)
    }
    const category = raw.category
    if (typeof category !== 'string' || !OBJECT_CATEGORY_SET.has(category)) {
      return fail(source, `${label}.category must be one of: ${MAP_OBJECT_CATEGORIES.join(', ')}`)
    }
    const names = raw.names
    if (!isPlainObject(names)) {
      return fail(source, `${label}.names must be an object mapping locale codes to display names`)
    }
    const nameValues = Object.values(names)
    const hasInvalidName = nameValues.some((value) => typeof value !== 'string')
    const hasNonEmptyName = nameValues.some((value) => typeof value === 'string' && value.trim() !== '')
    if (hasInvalidName || !hasNonEmptyName) {
      return fail(source, `${label}.names must map locale codes to non-empty display names`)
    }
    const dedupeKey = id.toLowerCase()
    if (seen.has(dedupeKey)) {
      return fail(source, `${label} duplicates the id "${id}"`)
    }
    seen.add(dedupeKey)
    entries.push({
      id,
      sheet,
      rect: { x: rect.x as number, y: rect.y as number, width: rect.width as number, height: rect.height as number },
      category: category as MapObjectCategory,
      names: names as Record<string, string>,
    })
  }
  return { ok: true, objects: entries }
}

/** Registry source for the bundled object catalog. */
export const BUNDLED_MAP_OBJECTS_SOURCE = 'bundled'
/** Registry source for vanilla game furniture and other in-game objects. */
export const GAME_FURNITURE_SOURCE = 'game-furniture'
/** Registry source for the project custom objects file (`assets/map-objects.json`). */
export const PROJECT_MAP_OBJECTS_SOURCE = 'project:assets/map-objects.json'

const bundledParse = parseMapObjectsJson(JSON.stringify(bundledJson), 'mapObjects.json')
if (!bundledParse.ok) {
  throw new Error(`Invalid bundled map objects catalog: ${bundledParse.error}`)
}

const customObjectsBySource = new Map<string, readonly MapCatalogObject[]>()
const objectListeners = new Set<() => void>()
let mergedObjects: readonly MapCatalogObject[] = []

function rebuildMergedObjects() {
  const byId = new Map<string, MapCatalogObject>()
  for (const objects of customObjectsBySource.values()) {
    for (const object of objects) byId.set(object.id.toLowerCase(), object)
  }
  mergedObjects = Object.freeze([...byId.values()])
  for (const listener of objectListeners) listener()
}

/**
 * Registers (or replaces) the object catalog entries contributed by a source;
 * later-registered sources override earlier entries with the same id. When a
 * source becomes invalid, call `unregisterMapObjects` accordingly.
 */
export function registerMapObjects(source: string, objects: readonly MapCatalogObject[]) {
  customObjectsBySource.set(source, objects)
  rebuildMergedObjects()
}

/** Removes all object catalog entries contributed by a source; no-op if the source does not exist. */
export function unregisterMapObjects(source: string) {
  if (!customObjectsBySource.delete(source)) return
  rebuildMergedObjects()
}

/** Merged object catalog (bundled plus registered custom entries); reference is stable until registration changes. */
export function getMapObjects(): readonly MapCatalogObject[] {
  return mergedObjects
}

/** useSyncExternalStore subscribe: fires when the registry changes. */
export function subscribeMapObjects(listener: () => void) {
  objectListeners.add(listener)
  return () => {
    objectListeners.delete(listener)
  }
}

/**
 * Returns the object display name by locale: prefers an exact match, then
 * falls back to en-US, then the first non-empty name, then the id. Still
 * yields a readable result when en-US is missing or names is empty.
 */
export function mapObjectDisplayName(object: MapCatalogObject, locale: string): string {
  return object.names[locale] ?? object.names['en-US'] ?? Object.values(object.names).find((name) => name.trim() !== '') ?? object.id
}

// Bundled objects enter the registry on module load; a build-time data parse failure throws.
registerMapObjects(BUNDLED_MAP_OBJECTS_SOURCE, bundledParse.objects)
