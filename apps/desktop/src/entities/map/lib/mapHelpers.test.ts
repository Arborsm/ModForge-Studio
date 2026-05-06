import { describe, expect, it } from 'vitest'

import { normalizeMapName } from './mapNames'
import { asMapPropertyString } from './properties'
import { getActionTargetMap, getPortalTargetMapFromProperties, parsePortalTargetMapFromAction } from './portalTargets'
import {
  extractTileFlags,
  FLIPPED_DIAGONALLY_FLAG,
  FLIPPED_HORIZONTALLY_FLAG,
  FLIPPED_VERTICALLY_FLAG,
  ROTATED_HEXAGONAL_120_FLAG,
  TILE_GID_FLAG_MASK,
  TILE_ID_MASK,
  stripTileGidFlags,
} from './tileFlags'
import { findTilesetForGid } from './tilesets'
import { isExteriorWarp, parseWarpEntries, parseWarpProperty } from './warps'
import type { MapDocument, MapTileset } from './types'

function createTileset(firstGid: number, tileProperties: MapTileset['tileProperties'] = {}): MapTileset {
  return {
    firstGid,
    name: `Tileset ${firstGid}`,
    tileWidth: 16,
    tileHeight: 16,
    tileCount: 32,
    columns: 8,
    imageSource: null,
    imagePath: null,
    imageWidth: null,
    imageHeight: null,
    properties: {},
    tileProperties,
    animations: {},
  }
}

function createMapDocument(tilesets: MapTileset[]): MapDocument {
  return {
    name: 'TestMap',
    format: 'tmx',
    sourcePath: 'maps/TestMap.tmx',
    relativePath: 'maps/TestMap.tmx',
    width: 10,
    height: 10,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    properties: {},
    tilesets,
    layers: [],
    objectGroups: [],
  }
}

describe('map helpers', () => {
  it('converts map property values to strings', () => {
    expect(normalizeMapName('  Town  ')).toBe('town')
    expect(asMapPropertyString('Warp Town 10 20')).toBe('Warp Town 10 20')
    expect(asMapPropertyString(42)).toBe('42')
    expect(asMapPropertyString(false)).toBe('false')
    expect(asMapPropertyString(undefined)).toBe('')
  })

  it('finds the last matching tileset for a gid', () => {
    const firstTileset = createTileset(1)
    const secondTileset = createTileset(17)

    expect(findTilesetForGid([firstTileset, secondTileset], 22)).toBe(secondTileset)
    expect(findTilesetForGid([firstTileset, secondTileset], 8)).toBe(firstTileset)
    expect(findTilesetForGid([firstTileset, secondTileset], 0)).toBeNull()
  })

  it('strips tiled flip and rotation flags from gids', () => {
    const rawGid =
      37 |
      FLIPPED_HORIZONTALLY_FLAG |
      FLIPPED_VERTICALLY_FLAG |
      FLIPPED_DIAGONALLY_FLAG |
      ROTATED_HEXAGONAL_120_FLAG

    expect(stripTileGidFlags(rawGid)).toBe(37)
  })

  it('extracts tiled flip and rotation flags without losing bits', () => {
    const rawGid = 22 | FLIPPED_HORIZONTALLY_FLAG | FLIPPED_DIAGONALLY_FLAG

    expect(extractTileFlags(rawGid)).toBe(FLIPPED_HORIZONTALLY_FLAG | FLIPPED_DIAGONALLY_FLAG)
  })

  it('has the correct flag mask values', () => {
    const expectedFlags = FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG | FLIPPED_DIAGONALLY_FLAG | ROTATED_HEXAGONAL_120_FLAG
    expect(TILE_GID_FLAG_MASK).toBe(expectedFlags >>> 0)
    expect(TILE_ID_MASK).toBe((~expectedFlags) >>> 0)
  })

  it('strips no flags when gid has none set', () => {
    expect(stripTileGidFlags(42)).toBe(42)
  })

  it('extracts no flags when gid has none set', () => {
    expect(extractTileFlags(42)).toBe(0)
  })

  it('parses target maps from supported portal action formats', () => {
    expect(parsePortalTargetMapFromAction('LockedDoorWarp 1 2 ScienceHouse')).toBe('ScienceHouse')
    expect(parsePortalTargetMapFromAction('MagicWarp WizardHouse')).toBe('WizardHouse')
    expect(parsePortalTargetMapFromAction('Warp 10 11 FarmHouse')).toBe('FarmHouse')
    expect(parsePortalTargetMapFromAction('Warp Town')).toBe('Town')
    expect(parsePortalTargetMapFromAction('Animate 1 2 3')).toBeNull()
  })

  it('returns null for empty action string', () => {
    expect(parsePortalTargetMapFromAction('')).toBeNull()
    expect(parsePortalTargetMapFromAction('   ')).toBeNull()
  })

  it('extracts portal targets from map object properties', () => {
    expect(
      getPortalTargetMapFromProperties({
        Action: 'MagicWarp BoatTunnel',
      }),
    ).toBe('BoatTunnel')

    expect(
      getPortalTargetMapFromProperties({
        TouchAction: 'Warp 10 11 Hospital',
      }),
    ).toBe('Hospital')
  })

  it('returns null from properties when no action/touchaction is present', () => {
    expect(getPortalTargetMapFromProperties({ SomeKey: 'value' })).toBeNull()
    expect(getPortalTargetMapFromProperties({})).toBeNull()
  })

  it('extracts action targets from tile properties on the matching tileset', () => {
    const mapDocument = createMapDocument([
      createTileset(1),
      createTileset(17, {
        5: {
          TouchAction: 'Warp 10 11 AdventureGuild',
        },
      }),
    ])

    expect(getActionTargetMap(22, mapDocument)).toBe('AdventureGuild')
    expect(getActionTargetMap(0, mapDocument)).toBeNull()
  })

  it('returns null for gid with no tileset match', () => {
    const mapDocument = createMapDocument([createTileset(100)])
    expect(getActionTargetMap(5, mapDocument)).toBeNull()
  })

  it('returns null for gid with no tile properties on the matching tileset', () => {
    const mapDocument = createMapDocument([createTileset(1)])
    expect(getActionTargetMap(1, mapDocument)).toBeNull()
  })

  it('parses warp entries with redundant whitespace safely', () => {
    const entries = parseWarpProperty('  1   2   Farm   10  11   3 4  Town  5 6  ')
    expect(entries).toEqual([
      { sourceX: 1, sourceY: 2, targetMap: 'Farm', targetX: 10, targetY: 11 },
      { sourceX: 3, sourceY: 4, targetMap: 'Town', targetX: 5, targetY: 6 },
    ])
  })

  it('parses warp entries from Warp and NPCWarp properties', () => {
    const mapDocument = {
      ...createMapDocument([]),
      properties: {
        Warp: '1 2 Farm 10 11',
        NPCWarp: '3 4 Town 5 6',
      },
      width: 5,
      height: 5,
    }

    const entries = parseWarpEntries(mapDocument)
    expect(entries).toEqual([
      { sourceX: 1, sourceY: 2, targetMap: 'Farm', targetX: 10, targetY: 11 },
      { sourceX: 3, sourceY: 4, targetMap: 'Town', targetX: 5, targetY: 6 },
    ])
    expect(isExteriorWarp(mapDocument, entries[0]!)).toBe(false)
    expect(isExteriorWarp(mapDocument, { sourceX: -1, sourceY: 0, targetMap: 'Farm', targetX: 1, targetY: 1 })).toBe(
      true,
    )
  })
})
