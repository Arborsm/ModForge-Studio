import { convertFileSrc } from '@tauri-apps/api/core'
import type { MapDocument, MapTileset } from './types'

import { getMapDirectory, normalizePath } from './path'

export function resolveTilesetImagePath(mapDocument: MapDocument, tileset: MapTileset) {
  if (tileset.imagePath) {
    return tileset.imagePath
  }

  if (!tileset.imageSource) {
    return null
  }

  const mapDirectory = getMapDirectory(mapDocument.sourcePath)
  const sourceName = normalizePath(tileset.imageSource)
  const fileName = /\.[A-Za-z0-9]+$/.test(sourceName) ? sourceName : `${sourceName}.xnb`

  return `${mapDirectory}\\${fileName}`
}

export function toAssetUrl(path: string) {
  return convertFileSrc(path)
}
