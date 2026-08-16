import vanillaCatalogJson from './vanillaTilesheets.json'

/**
 * Predefined catalog of the vanilla Stardew Valley 1.6 tilesheets that maps
 * can reference, plus a registry for user-authored sheet descriptors.
 *
 * The catalog is described by JSON (`vanillaTilesheets.json` for the shipped
 * vanilla data): every entry names a Content asset key (`Maps/townInterior`,
 * `TileSheets/furniture`, ...) and its decoded pixel size, which yields the
 * predefined 16px tile split without decoding the texture first. Entries
 * under `Content/Maps` form the `maps` group (the sheets vanilla maps draw
 * with); every other Content folder forms the `tilesheets` group. Localized
 * variants (`spring_outdoorsTileSheet.zh-CN`, ...) are intentionally absent:
 * the image loader resolves them from the base key for the active locale.
 *
 * Users can describe additional game-directory sheets (content-modified
 * installs, sheets added by game updates) in a project JSON file with the
 * same schema and register them through `registerCustomTilesheets`; every
 * lookup in this module then resolves the merged catalog. Regenerate the
 * vanilla JSON after a game update with:
 * `SDV_GAME_PATH=<game dir> cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --features installed-game-validation --example tilesheet_catalog_report`
 */

/** Vanilla tiles are always 16x16 pixels; every map in the game agrees. */
export const VANILLA_TILESHEET_TILE_SIZE = 16

/** Picker grouping of a catalog sheet: `Content/Maps` sheets vs other Content folders. */
export type VanillaTilesheetGroup = 'maps' | 'tilesheets'

export type VanillaTilesheetEntry = {
  /** Content asset key, e.g. `Maps/townInterior` or `TileSheets/furniture`. */
  key: string
  /** Sheet file stem, e.g. `townInterior`. */
  name: string
  group: VanillaTilesheetGroup
  imageWidth: number
  imageHeight: number
}

export type TilesheetCatalogParseResult = { ok: true; sheets: VanillaTilesheetEntry[] } | { ok: false; error: string }

function groupOfKey(key: string): VanillaTilesheetGroup {
  return key.split('/')[0]?.toLowerCase() === 'maps' ? 'maps' : 'tilesheets'
}

function fail(source: string, detail: string): TilesheetCatalogParseResult {
  return { ok: false, error: `${source}: ${detail}` }
}

/**
 * Parses and validates a tilesheet catalog JSON document. The schema is
 * `{ "version": 1, "sheets": [{ "key", "name"?, "imageWidth", "imageHeight" }] }`;
 * `name` defaults to the key's file stem. Duplicate keys (case-insensitive)
 * and non-positive dimensions are rejected.
 */
export function parseTilesheetCatalogJson(text: string, source: string): TilesheetCatalogParseResult {
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch (error) {
    return fail(source, error instanceof Error ? error.message : String(error))
  }
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    return fail(source, 'the catalog root must be an object')
  }
  const version = (root as Record<string, unknown>).version
  if (version !== undefined && version !== 1) {
    return fail(source, `unsupported catalog version ${JSON.stringify(version)}`)
  }
  const sheets = (root as Record<string, unknown>).sheets
  if (!Array.isArray(sheets)) {
    return fail(source, 'the catalog must contain a "sheets" array')
  }
  const seen = new Set<string>()
  const entries: VanillaTilesheetEntry[] = []
  for (const [index, raw] of sheets.entries()) {
    const label = `sheets[${index}]`
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return fail(source, `${label} must be an object`)
    }
    const candidate = raw as Record<string, unknown>
    const key = typeof candidate.key === 'string' ? candidate.key.trim().replaceAll('\\', '/') : ''
    if (!/^[^/]+\/[^/]+$/u.test(key)) {
      return fail(source, `${label}.key must be a Content asset key like "Maps/townInterior"`)
    }
    const name = typeof candidate.name === 'string' && candidate.name.trim() !== '' ? candidate.name.trim() : (key.split('/').at(-1) ?? '')
    const { imageWidth, imageHeight } = candidate
    if (!Number.isInteger(imageWidth) || (imageWidth as number) <= 0) {
      return fail(source, `${label}.imageWidth must be a positive integer`)
    }
    if (!Number.isInteger(imageHeight) || (imageHeight as number) <= 0) {
      return fail(source, `${label}.imageHeight must be a positive integer`)
    }
    const dedupeKey = key.toLowerCase()
    if (seen.has(dedupeKey)) {
      return fail(source, `${label} duplicates the key "${key}"`)
    }
    seen.add(dedupeKey)
    entries.push({ key, name, group: groupOfKey(key), imageWidth: imageWidth as number, imageHeight: imageHeight as number })
  }
  return { ok: true, sheets: entries }
}

const parsedVanilla = parseTilesheetCatalogJson(JSON.stringify(vanillaCatalogJson), 'vanillaTilesheets.json')
if (!parsedVanilla.ok) {
  throw new Error(`Invalid bundled vanilla tilesheet catalog: ${parsedVanilla.error}`)
}

/** The shipped vanilla tilesheet catalog (without any registered custom entries). */
export const VANILLA_TILESHEETS: readonly VanillaTilesheetEntry[] = parsedVanilla.sheets

const customEntriesBySource = new Map<string, readonly VanillaTilesheetEntry[]>()
const catalogListeners = new Set<() => void>()
let mergedCatalog: readonly VanillaTilesheetEntry[] = VANILLA_TILESHEETS

function rebuildMergedCatalog() {
  const byKey = new Map<string, VanillaTilesheetEntry>()
  for (const sheet of VANILLA_TILESHEETS) byKey.set(sheet.key.toLowerCase(), sheet)
  for (const sheets of customEntriesBySource.values()) {
    for (const sheet of sheets) byKey.set(sheet.key.toLowerCase(), sheet)
  }
  mergedCatalog = Object.freeze([...byKey.values()])
  for (const listener of catalogListeners) listener()
}

/**
 * Registers (or replaces) the custom sheet descriptors contributed by one
 * source — for example the project's `assets/tilesheets.json`. Custom entries
 * override vanilla entries with the same key. Pair every registration with
 * `unregisterCustomTilesheets` when the source goes away.
 */
export function registerCustomTilesheets(source: string, sheets: readonly VanillaTilesheetEntry[]) {
  customEntriesBySource.set(source, sheets)
  rebuildMergedCatalog()
}

/** Removes all custom sheet descriptors contributed by the given source. */
export function unregisterCustomTilesheets(source: string) {
  if (!customEntriesBySource.delete(source)) return
  rebuildMergedCatalog()
}

/** The merged tilesheet catalog: vanilla entries plus registered custom descriptors. */
export function getTilesheetCatalog(): readonly VanillaTilesheetEntry[] {
  return mergedCatalog
}

/** useSyncExternalStore subscribe: fires whenever custom registrations change the catalog. */
export function subscribeTilesheetCatalog(listener: () => void) {
  catalogListeners.add(listener)
  return () => {
    catalogListeners.delete(listener)
  }
}

/** Whether the sheet divides evenly into 16px tiles; a few cutscene sheets do not. */
export function vanillaTilesheetHasEvenSplit(sheet: VanillaTilesheetEntry) {
  return sheet.imageWidth % VANILLA_TILESHEET_TILE_SIZE === 0 && sheet.imageHeight % VANILLA_TILESHEET_TILE_SIZE === 0
}

/** Predefined tile split for an evenly divided sheet: columns, rows, and tile count. */
export function vanillaTilesheetSplit(sheet: VanillaTilesheetEntry) {
  const columns = Math.floor(sheet.imageWidth / VANILLA_TILESHEET_TILE_SIZE)
  const rows = Math.floor(sheet.imageHeight / VANILLA_TILESHEET_TILE_SIZE)
  return { columns, rows, tileCount: columns * rows }
}

/** Finds a catalog sheet by content key (`Maps/townInterior`), case-insensitively. */
export function findTilesheetByKey(key: string) {
  // 游戏数据里偶发反斜杠与双斜杠（如 `TileSheets\/furniture_3` → `TileSheets//furniture_3`），统一归一。
  const normalized = key
    .trim()
    .replaceAll('\\', '/')
    .replaceAll(/\/{2,}/gu, '/')
    .toLowerCase()
  return mergedCatalog.find((sheet) => sheet.key.toLowerCase() === normalized) ?? null
}
