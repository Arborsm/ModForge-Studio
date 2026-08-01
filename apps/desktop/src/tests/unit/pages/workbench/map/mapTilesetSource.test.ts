import { describe, expect, it } from 'vite-plus/test'
import { defaultTsxSourceForTileset, isValidTsxSource } from '@pages/workbench/workspaces/map/model/mapTilesetSource'

describe('map tileset source', () => {
  it('places the default TSX beside the map in a tilesets folder', () => {
    expect(defaultTsxSourceForTileset('assets/maps/Town.tmx', 'TownTiles')).toBe('tilesets/TownTiles.tsx')
  })

  it('keeps the reference map-relative for maps in nested directories', () => {
    expect(defaultTsxSourceForTileset('assets/maps/interiors/Shop.tmx', 'Furniture')).toBe('tilesets/Furniture.tsx')
    expect(defaultTsxSourceForTileset('assets/maps/Town.tmx', 'TownTiles')).toBe('tilesets/TownTiles.tsx')
  })

  it('sanitizes tileset names into file-safe TSX file names', () => {
    expect(defaultTsxSourceForTileset('assets/maps/Town.tmx', 'Outdoor Tiles (Winter)')).toBe('tilesets/Outdoor_Tiles_Winter.tsx')
    expect(defaultTsxSourceForTileset('assets/maps/Town.tmx', '  Tiles  ')).toBe('tilesets/Tiles.tsx')
    expect(defaultTsxSourceForTileset('assets/maps/Town.tmx', '!!!')).toBe('tilesets/tileset.tsx')
  })

  it('keeps letters and digits from localized tileset names', () => {
    expect(defaultTsxSourceForTileset('assets/maps/Town.tmx', '室外 瓷砖')).toBe('tilesets/室外_瓷砖.tsx')
    expect(defaultTsxSourceForTileset('assets/maps/Town.tmx', '秋日·丰收')).toBe('tilesets/秋日_丰收.tsx')
  })

  it('accepts project-relative TSX paths without escapes or tokens', () => {
    expect(isValidTsxSource('tilesets/TownTiles.tsx')).toBe(true)
    expect(isValidTsxSource('tilesets\\TownTiles.tsx')).toBe(true)
    expect(isValidTsxSource('tilesets/TownTiles.TSX')).toBe(true)
    expect(isValidTsxSource('  tilesets/TownTiles.tsx  ')).toBe(true)
  })

  it('rejects non-TSX suffixes, .., absolute paths, drive letters, and tokens', () => {
    expect(isValidTsxSource('tilesets/TownTiles.png')).toBe(false)
    expect(isValidTsxSource('tilesets/../TownTiles.tsx')).toBe(false)
    expect(isValidTsxSource('../tilesets/TownTiles.tsx')).toBe(false)
    expect(isValidTsxSource('/abs/tiles.tsx')).toBe(false)
    expect(isValidTsxSource('\\abs\\tiles.tsx')).toBe(false)
    expect(isValidTsxSource('C:\\tiles\\a.tsx')).toBe(false)
    expect(isValidTsxSource('c:/tiles/a.tsx')).toBe(false)
    expect(isValidTsxSource('tilesets/{{Target}}.tsx')).toBe(false)
  })
})
