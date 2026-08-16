import type { MapTileset } from './types'
import { findTilesheetByKey, type VanillaTilesheetEntry } from '../model/vanillaTilesheets'

/**
 * Tileset property that marks a tilesheet as a dynamic reference to a vanilla
 * game sheet instead of a project image. The value is the catalog content key
 * (for example `Maps/townInterior`). The property rides along in TMX/TBIN
 * tileset properties, so the reference survives saving and reopening without
 * any project-side file; the game ignores the unknown property.
 */
export const GAME_SHEET_PROPERTY = 'modforge:game-sheet'

/** Reads the validated vanilla sheet key of a dynamically referenced tileset. */
export function gameSheetKeyOfTileset(tileset: Pick<MapTileset, 'properties'>): string | null {
  const raw = tileset.properties[GAME_SHEET_PROPERTY]
  if (typeof raw !== 'string') return null
  return findTilesheetByKey(raw)?.key ?? null
}

/** Absolute texture path of a vanilla sheet inside the connected game directory. */
export function gameSheetImagePath(key: string, gameRootPath: string) {
  const root = gameRootPath.replaceAll('\\', '/').replace(/\/+$/u, '')
  return `${root}/Content/${key}.xnb`
}

/**
 * TMX image source for a vanilla sheet reference. Maps deployed by Content
 * Patcher live under `Maps/`, so a bare file name resolves to a `Maps/` sheet
 * and `../<Folder>/...` escapes to the sheet's Content folder; both fall back
 * to the vanilla asset when the mod ships no matching file.
 */
export function gameSheetImageSourceTmx(sheet: VanillaTilesheetEntry) {
  const folder = sheet.key.split('/')[0] ?? 'Maps'
  return sheet.group === 'maps' ? `${sheet.name}.png` : `../${folder}/${sheet.name}.png`
}

/**
 * TBin image string for a vanilla sheet reference. Vanilla tBIN maps store
 * bare content keys resolved against `Content/Maps` and then the content
 * root, so sheets outside `Maps/` carry their Content folder prefix.
 */
export function gameSheetImageSourceTbin(sheet: VanillaTilesheetEntry) {
  const folder = sheet.key.split('/')[0] ?? 'Maps'
  return sheet.group === 'maps' ? sheet.name : `${folder}\\${sheet.name}`
}
