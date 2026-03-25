import { convertFileSrc } from '@tauri-apps/api/core'
import type { MapDocument, MapTileset } from './types'

function normalizePath(path: string) {
  return path.replaceAll('/', '\\')
}

export function resolveTilesetImagePath(mapDocument: MapDocument, tileset: MapTileset) {
  if (tileset.imagePath) {
    return tileset.imagePath
  }

  if (!tileset.imageSource) {
    return null
  }

  const normalizedMapPath = normalizePath(mapDocument.sourcePath)
  const separatorIndex = normalizedMapPath.lastIndexOf('\\')
  const mapDirectory =
    separatorIndex >= 0 ? normalizedMapPath.slice(0, separatorIndex) : normalizedMapPath
  const sourceName = normalizePath(tileset.imageSource)
  const fileName = /\.[A-Za-z0-9]+$/.test(sourceName) ? sourceName : `${sourceName}.png`

  return `${mapDirectory}\\${fileName}`
}

export function toAssetUrl(path: string) {
  return convertFileSrc(path)
}
