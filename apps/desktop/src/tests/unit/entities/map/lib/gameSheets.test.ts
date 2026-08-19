import { describe, expect, it } from 'vite-plus/test'
import {
  GAME_SHEET_PROPERTY,
  gameSheetImagePath,
  gameSheetImageSourceTbin,
  gameSheetImageSourceTmx,
  gameSheetKeyOfTileset,
} from '@entities/map/lib/gameSheets'
import { findTilesheetByKey } from '@entities/map/model/vanillaTilesheets'

function sheet(key: string) {
  const entry = findTilesheetByKey(key)
  if (!entry) throw new Error(`catalog is missing ${key}`)
  return entry
}

describe('gameSheetKeyOfTileset', () => {
  it('returns the canonical key for a marked tileset', () => {
    expect(gameSheetKeyOfTileset({ properties: { [GAME_SHEET_PROPERTY]: 'maps/TOWNINTERIOR' } })).toBe('Maps/townInterior')
  })

  it('returns null without the property or for unknown keys', () => {
    expect(gameSheetKeyOfTileset({ properties: {} })).toBeNull()
    expect(gameSheetKeyOfTileset({ properties: { [GAME_SHEET_PROPERTY]: 42 } })).toBeNull()
    expect(gameSheetKeyOfTileset({ properties: { [GAME_SHEET_PROPERTY]: 'Maps/nope' } })).toBeNull()
  })
})

describe('gameSheetImagePath', () => {
  it('joins the content key under the game root with forward slashes', () => {
    expect(gameSheetImagePath('Maps/townInterior', 'C:\\Game\\SDV\\')).toBe('C:/Game/SDV/Content/Maps/townInterior.xnb')
    expect(gameSheetImagePath('TileSheets/furniture', '/games/sdv')).toBe('/games/sdv/Content/TileSheets/furniture.xnb')
  })
})

describe('game sheet save references', () => {
  it('writes Maps sheets as bare references in both formats', () => {
    const townInterior = sheet('Maps/townInterior')
    expect(gameSheetImageSourceTmx(townInterior)).toBe('townInterior.png')
    expect(gameSheetImageSourceTbin(townInterior)).toBe('townInterior')
  })

  it('escapes non-Maps sheets to their content folder', () => {
    const furniture = sheet('TileSheets/furniture')
    expect(gameSheetImageSourceTmx(furniture)).toBe('../TileSheets/furniture.png')
    expect(gameSheetImageSourceTbin(furniture)).toBe('TileSheets\\furniture')
  })
})
