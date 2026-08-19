import {
  GAME_SHEET_PROPERTY,
  VANILLA_TILESHEET_TILE_SIZE,
  findTilesheetByKey,
  gameSheetImageSourceTbin,
  gameSheetImageSourceTmx,
  gameSheetKeyOfTileset,
  parseTilesheetCatalogJson,
  vanillaTilesheetHasEvenSplit,
  vanillaTilesheetSplit,
  type MapDocument,
  type MapTileset,
  type VanillaTilesheetEntry,
} from '@entities/map'

/**
 * Well-known project asset that lets users describe extra game-directory
 * sheets (content-modified installs, sheets added by game updates) with the
 * same JSON schema as the bundled vanilla catalog. Descriptors registered
 * from here are dynamically referenceable exactly like vanilla sheets.
 */
export const PROJECT_TILESHEET_CATALOG_PATH = 'assets/tilesheets.json'

/** Registry source key used when the project descriptor is registered. */
export const PROJECT_TILESHEET_CATALOG_SOURCE = 'project:assets/tilesheets.json'

function base64ToText(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new TextDecoder().decode(bytes)
}

export type ProjectTilesheetCatalogLoad =
  | { status: 'ok'; sheets: VanillaTilesheetEntry[] }
  | { status: 'missing' }
  | { status: 'error'; message: string }

/**
 * Reads and parses the project's custom tilesheet descriptor. A 404-style
 * read failure reports `missing` (the file is optional); a JSON/schema
 * problem reports `error` with the parser message.
 */
export async function loadProjectTilesheetCatalog(
  readProjectAsset: (relativePath: string) => Promise<{ bytesBase64: string }>,
  relativePath: string = PROJECT_TILESHEET_CATALOG_PATH,
): Promise<ProjectTilesheetCatalogLoad> {
  let payload: { bytesBase64: string }
  try {
    payload = await readProjectAsset(relativePath)
  } catch {
    return { status: 'missing' }
  }
  const parsed = parseTilesheetCatalogJson(base64ToText(payload.bytesBase64), relativePath)
  if (!parsed.ok) return { status: 'error', message: parsed.error }
  return { status: 'ok', sheets: parsed.sheets }
}

function nextTilesetFirstGid(document: MapDocument) {
  return document.tilesets.reduce((maximum, tileset) => Math.max(maximum, tileset.firstGid + tileset.tileCount), 1)
}

/**
 * Builds the tileset that dynamically references a vanilla game sheet: no
 * project image is copied, `imagePath` stays null, and the catalog key rides
 * in a namespaced tileset property so the reference survives save/reload.
 * The canonical `imageSource` is the TMX form; `saveGameSheetImageSources`
 * rewrites it for TBin output. Returns null when the sheet cannot divide into
 * the map's tile grid.
 */
export function buildGameSheetTileset(document: MapDocument, sheet: VanillaTilesheetEntry): MapTileset | null {
  if (
    !vanillaTilesheetHasEvenSplit(sheet) ||
    document.tileWidth !== VANILLA_TILESHEET_TILE_SIZE ||
    document.tileHeight !== VANILLA_TILESHEET_TILE_SIZE
  ) {
    return null
  }
  const split = vanillaTilesheetSplit(sheet)
  const usedNames = new Set(document.tilesets.map((tileset) => tileset.name.toLowerCase()))
  let name = sheet.name
  for (let suffix = 2; usedNames.has(name.toLowerCase()); suffix += 1) name = `${sheet.name}_${suffix}`
  return {
    firstGid: nextTilesetFirstGid(document),
    name,
    tileWidth: VANILLA_TILESHEET_TILE_SIZE,
    tileHeight: VANILLA_TILESHEET_TILE_SIZE,
    tileCount: split.tileCount,
    columns: split.columns,
    source: null,
    margin: 0,
    spacing: 0,
    tileOffsetX: 0,
    tileOffsetY: 0,
    imageSource: gameSheetImageSourceTmx(sheet),
    imagePath: null,
    imageWidth: sheet.imageWidth,
    imageHeight: sheet.imageHeight,
    imageTrans: null,
    properties: { [GAME_SHEET_PROPERTY]: sheet.key },
    tileProperties: {},
    animations: {},
  }
}

/**
 * Rewrites dynamically referenced game-sheet image sources for the save
 * format: TMX keeps the relative reference that resolves against the deployed
 * `Maps/` location, while TBin stores the bare content key like vanilla tBIN
 * maps do. The input document identity is preserved when nothing changes, so
 * callers can cheaply skip downstream work.
 */
export function saveGameSheetImageSources(document: MapDocument, format: 'tmx' | 'tbin'): MapDocument {
  let changed = false
  const tilesets = document.tilesets.map((tileset) => {
    const key = gameSheetKeyOfTileset(tileset)
    if (!key) return tileset
    const sheet = findTilesheetByKey(key)
    if (!sheet) return tileset
    const imageSource = format === 'tbin' ? gameSheetImageSourceTbin(sheet) : gameSheetImageSourceTmx(sheet)
    if (tileset.imageSource === imageSource) return tileset
    changed = true
    return { ...tileset, imageSource }
  })
  return changed ? { ...document, tilesets } : document
}
