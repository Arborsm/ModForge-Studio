import { relativeMapAssetReference } from './mapAssetReducer'

function sanitizeTilesetFileName(name: string): string {
  const cleaned = name.replaceAll(/[^\p{L}\p{N}._-]+/gu, '_').replaceAll(/^_+|_+$/gu, '')
  return cleaned || 'tileset'
}

/** Default map-relative TSX reference for a tileset, in a `tilesets/` folder beside the map. */
export function defaultTsxSourceForTileset(mapAssetPath: string, tilesetName: string): string {
  const mapDirectory = mapAssetPath.replaceAll('\\', '/').split('/').slice(0, -1).join('/')
  const tsxPath = `${mapDirectory}/tilesets/${sanitizeTilesetFileName(tilesetName)}.tsx`
  return relativeMapAssetReference(mapAssetPath, tsxPath)
}

/** External TSX references must stay project-relative and cannot escape via `..`, absolutes, or tokens. */
export function isValidTsxSource(source: string): boolean {
  const value = source.trim()
  if (!value.toLowerCase().endsWith('.tsx')) return false
  if (value.includes('{{') || value.includes('}}')) return false
  if (/^[a-zA-Z]:/.test(value) || value.startsWith('/') || value.startsWith('\\')) return false
  return !value.split(/[\\/]/).includes('..')
}
