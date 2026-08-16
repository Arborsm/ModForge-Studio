import type { MapDocument, MapTileset } from './types'

import { gameSheetImagePath, gameSheetKeyOfTileset } from './gameSheets'
import { getMapDirectory, normalizePath } from './path'

/**
 * Resolves the loadable image path for a tileset. Tilesets carrying a dynamic
 * vanilla-sheet reference resolve to the sheet texture inside the connected
 * game directory (null when no game directory is configured); everything else
 * keeps the project/map-relative behavior.
 */
export function resolveTilesetImagePath(mapDocument: MapDocument, tileset: MapTileset, gameRootPath?: string | null) {
  const gameSheetKey = gameSheetKeyOfTileset(tileset)
  if (gameSheetKey) {
    return gameRootPath ? gameSheetImagePath(gameSheetKey, gameRootPath) : null
  }

  if (tileset.imagePath) {
    return tileset.imagePath
  }

  if (!tileset.imageSource) {
    return null
  }

  const mapDirectory = getMapDirectory(mapDocument.sourcePath)
  const sourceName = normalizePath(tileset.imageSource)
  const fileName = /\.[A-Za-z0-9]+$/.test(sourceName) ? sourceName : `${sourceName}.xnb`

  return mapDirectory ? `${mapDirectory}\\${fileName}` : fileName
}
