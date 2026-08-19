import {
  findTilesetForGid,
  gameSheetKeyOfTileset,
  getMapObjects,
  mapObjectDisplayName,
  stripTileGidFlags,
  type MapCatalogObject,
  type MapDocument,
  type MapTileset,
} from '@entities/map'

/**
 * Reverse lookup: given a raw gid (with flip flags) on the map, finds the
 * `MapCatalogObject` in the object catalog registry that contains that tile.
 * Used by the Inspector panel to match a placed tile on the map to a
 * furniture/structure catalog entry.
 *
 * Lookup logic:
 * 1. Parse the owning tileset and tileId from the gid
 * 2. Get the corresponding game sheet key from tileset properties
 * 3. Convert tileId to (tileX, tileY) coordinates on the sheet
 * 4. Iterate the object catalog, finding an entry whose sheet matches and whose rect contains (tileX, tileY)
 *
 * Returns the first matching catalog entry, or null.
 */
export function matchTileToCatalogObject(rawGid: number, tilesets: readonly MapTileset[]): MapCatalogObject | null {
  const gid = stripTileGidFlags(rawGid)
  if (gid === 0) return null

  const tileset = findTilesetForGid(tilesets as MapTileset[], gid)
  if (!tileset) return null

  const sheetKey = gameSheetKeyOfTileset(tileset)
  if (!sheetKey) return null

  const tileId = gid - tileset.firstGid
  const tileX = tileId % tileset.columns
  const tileY = Math.floor(tileId / tileset.columns)

  const sheetKeyLower = sheetKey.toLowerCase()
  const objects = getMapObjects()
  for (const obj of objects) {
    if (obj.sheet.toLowerCase() !== sheetKeyLower) continue
    const { x, y, width, height } = obj.rect
    if (tileX >= x && tileX < x + width && tileY >= y && tileY < y + height) {
      return obj
    }
  }
  return null
}

// Placed furniture scanning

/** A scanned, recognized placed furniture instance. */
export type PlacedFurnitureEntry = {
  /** Catalog entry. */
  catalogObject: MapCatalogObject
  /** Top-left tile coordinate of the furniture on the map. */
  tileX: number
  tileY: number
  /** Name of the layer it resides on. */
  layerName: string
}

/**
 * Scans all tile layers of the document, matching each non-zero gid to the
 * object catalog to identify placed furniture and derive its top-left position.
 * The same furniture at the same position is recorded only once.
 *
 * Algorithm:
 * 1. Pre-build a sheetKey lookup table for tilesets in the document that have a game-sheet mapping
 * 2. Bucket the object catalog by sheet key
 * 3. Iterate each cell of each layer: gid → tileset → sheetKey → bucket lookup
 * 4. On a hit, compute the furniture's top-left tile coordinate on the map and
 *    dedupe by `id+x+y+layer` (multiple tiles of the same furniture yield only one record)
 *
 * Pure function, no side effects. The object catalog is passed in by the caller.
 */
export function scanPlacedFurniture(document: MapDocument, catalogObjects: readonly MapCatalogObject[]): PlacedFurnitureEntry[] {
  if (catalogObjects.length === 0 || document.layers.length === 0) return []

  // Pre-parse sheetKey for each tileset
  const tilesetSheetKeys = new Map<MapTileset, string>()
  for (const tileset of document.tilesets) {
    const key = gameSheetKeyOfTileset(tileset)
    if (key) tilesetSheetKeys.set(tileset, key.toLowerCase())
  }
  if (tilesetSheetKeys.size === 0) return []

  // Build an index by bucketing on sheet key
  const objectsBySheet = new Map<string, MapCatalogObject[]>()
  for (const obj of catalogObjects) {
    const sheetLower = obj.sheet.toLowerCase()
    let bucket = objectsBySheet.get(sheetLower)
    if (!bucket) {
      bucket = []
      objectsBySheet.set(sheetLower, bucket)
    }
    bucket.push(obj)
  }

  const results: PlacedFurnitureEntry[] = []
  const seen = new Set<string>()

  for (const layer of document.layers) {
    const gids = layer.gids
    for (let cellIndex = 0; cellIndex < gids.length; cellIndex++) {
      const gid = stripTileGidFlags(gids[cellIndex])
      if (gid === 0) continue

      const tileset = findTilesetForGid(document.tilesets as MapTileset[], gid)
      if (!tileset) continue

      const sheetKey = tilesetSheetKeys.get(tileset)
      if (!sheetKey) continue

      const bucket = objectsBySheet.get(sheetKey)
      if (!bucket) continue

      const tileId = gid - tileset.firstGid
      const sheetTileX = tileId % tileset.columns
      const sheetTileY = Math.floor(tileId / tileset.columns)

      for (const obj of bucket) {
        const { x, y, width, height } = obj.rect
        if (sheetTileX < x || sheetTileX >= x + width || sheetTileY < y || sheetTileY >= y + height) continue

        // Derive the furniture top-left from the cell coordinate and the tile's offset within the furniture rect
        const cellX = cellIndex % layer.width
        const cellY = Math.floor(cellIndex / layer.width)
        const furnitureX = cellX - (sheetTileX - x)
        const furnitureY = cellY - (sheetTileY - y)
        const dedupeKey = `${obj.id}\0${furnitureX}\0${furnitureY}\0${layer.name}`
        if (seen.has(dedupeKey)) break
        seen.add(dedupeKey)

        results.push({ catalogObject: obj, tileX: furnitureX, tileY: furnitureY, layerName: layer.name })
        break
      }
    }
  }

  // Sort by y → x → layer name for readability
  results.sort((a, b) => a.tileY - b.tileY || a.tileX - b.tileX || a.layerName.localeCompare(b.layerName))
  return results
}

/** Display label for placed furniture. */
export function placedFurnitureLabel(entry: PlacedFurnitureEntry, locale: string): string {
  return mapObjectDisplayName(entry.catalogObject, locale)
}
