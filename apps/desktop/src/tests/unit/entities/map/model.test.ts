import { describe, expect, it } from 'vite-plus/test'
import type { MapAssetSummary } from '@entities/game/api'
import { getMapContentBounds, getMapPreviewBounds, hasVisibleMapContent, type MapDocument } from '@entities/map'
import {
  buildMapWorkspaceTabs,
  getDefaultVisibleLayerIds,
  getDefaultVisibleObjectGroupIds,
  getMapDocumentDisplayTitle,
  getMapDocumentPathLabel,
  getMapWorkspaceTabId,
  getInitialWorldAtlasSeedNames,
  getPreferredScene,
  isRemoteWorldAtlasDocument,
  pickWorldAtlasRootMapName,
  matchesWorldAtlasMapName,
  withWorldAtlasViewMetadata,
  WORLD_ATLAS_TAB_ID,
} from '@entities/map/model'

function makeDoc(overrides: Partial<MapDocument>): MapDocument {
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
    tilesets: [],
    layers: [
      {
        id: 1,
        name: 'Layer1',
        kind: 'tile',
        width: 10,
        height: 10,
        visible: true,
        opacity: 1,
        offsetX: 0,
        offsetY: 0,
        properties: {},
        gids: new Uint32Array(100),
        nonEmptyTiles: 50,
      },
      {
        id: 2,
        name: 'Layer2',
        kind: 'tile',
        width: 10,
        height: 10,
        visible: false,
        opacity: 1,
        offsetX: 0,
        offsetY: 0,
        properties: {},
        gids: new Uint32Array(100),
        nonEmptyTiles: 0,
      },
      {
        id: 3,
        name: 'Layer3',
        kind: 'tile',
        width: 10,
        height: 10,
        visible: true,
        opacity: 1,
        offsetX: 0,
        offsetY: 0,
        properties: {},
        gids: new Uint32Array(100),
        nonEmptyTiles: 30,
      },
    ],
    objectGroups: [
      { id: 1, name: 'Group1', kind: 'object', visible: true, opacity: 1, drawOrder: 'top-down', properties: {}, objects: [] },
      { id: 2, name: 'Group2', kind: 'object', visible: false, opacity: 1, drawOrder: 'top-down', properties: {}, objects: [] },
    ],
    ...overrides,
  }
}

function makeAsset(overrides: Partial<MapAssetSummary> = {}): MapAssetSummary {
  return {
    id: 'asset-1',
    name: 'town',
    format: 'xnb',
    sourcePath: 'Maps\\town.xnb',
    relativePath: 'Maps\\town.xnb',
    ...overrides,
  } as MapAssetSummary
}

describe('getMapWorkspaceTabId', () => {
  it('generates a tab id from an asset id', () => {
    expect(getMapWorkspaceTabId('asset-maps_town')).toBe('map:asset-maps_town')
  })
})

describe('getMapDocumentDisplayTitle', () => {
  it('returns the document name when present', () => {
    expect(getMapDocumentDisplayTitle(makeDoc({ name: 'Town' }))).toBe('Town')
  })

  it('trims the document name', () => {
    expect(getMapDocumentDisplayTitle(makeDoc({ name: '  Town  ' }))).toBe('Town')
  })

  it('falls back to the relative path stem when name is empty', () => {
    expect(getMapDocumentDisplayTitle(makeDoc({ name: '', relativePath: 'Maps/MapTown.tmx' }))).toBe('MapTown')
  })

  it('falls back to the source path stem when name and relativePath are empty', () => {
    expect(getMapDocumentDisplayTitle(makeDoc({ name: '', relativePath: '', sourcePath: 'Maps/SourceTown.xnb' }))).toBe('SourceTown')
  })

  it('returns "Untitled Map" when all identifiers are empty', () => {
    expect(getMapDocumentDisplayTitle(makeDoc({ name: '', relativePath: '', sourcePath: '' }))).toBe('Untitled Map')
  })

  it('returns "Untitled Map" for null/undefined', () => {
    expect(getMapDocumentDisplayTitle(null)).toBe('Untitled Map')
    expect(getMapDocumentDisplayTitle(undefined)).toBe('Untitled Map')
  })
})

describe('getMapDocumentPathLabel', () => {
  it('returns the relative path when present', () => {
    expect(getMapDocumentPathLabel(makeDoc({ relativePath: 'Maps/TestMap.tmx' }))).toBe('Maps/TestMap.tmx')
  })

  it('falls back to the source path when relativePath is empty', () => {
    expect(getMapDocumentPathLabel(makeDoc({ relativePath: '', sourcePath: 'Maps/OtherMap.xnb' }))).toBe('Maps/OtherMap.xnb')
  })

  it('falls back to display title when both are empty', () => {
    expect(getMapDocumentPathLabel(makeDoc({ name: 'MyMap', relativePath: '', sourcePath: '' }))).toBe('MyMap')
  })

  it('returns "Untitled Map" for null/undefined', () => {
    expect(getMapDocumentPathLabel(null)).toBe('Untitled Map')
    expect(getMapDocumentPathLabel(undefined)).toBe('Untitled Map')
  })
})

describe('getPreferredScene', () => {
  it('returns the "town" xnb asset when available', () => {
    const assets = [makeAsset({ name: 'forest' }), makeAsset({ name: 'town' }), makeAsset({ name: 'mountain' })]
    expect(getPreferredScene(assets)?.name).toBe('town')
  })

  it('falls back to the first xnb asset when no town exists', () => {
    const assets = [makeAsset({ name: 'forest' }), makeAsset({ name: 'mountain' })]
    expect(getPreferredScene(assets)?.name).toBe('forest')
  })

  it('returns null for empty assets', () => {
    expect(getPreferredScene([])).toBeNull()
  })
})

describe('getInitialWorldAtlasSeedNames', () => {
  it('keeps first atlas paint limited to the requested root map', () => {
    expect(
      getInitialWorldAtlasSeedNames('Town', {
        Farm: { x: 0, y: 0, width: 1, height: 1 },
        Forest: { x: 1, y: 0, width: 1, height: 1 },
      }),
    ).toEqual(['Town'])
  })

  it('preserves custom root map names for targeted initial loads', () => {
    expect(getInitialWorldAtlasSeedNames('Island_S')).toEqual(['Island_S'])
  })
})

describe('getDefaultVisibleLayerIds', () => {
  it('returns ids of visible layers only', () => {
    expect(getDefaultVisibleLayerIds(makeDoc({}))).toEqual([1, 3])
  })

  it('returns empty array when no layers are visible', () => {
    expect(
      getDefaultVisibleLayerIds(
        makeDoc({
          layers: [
            {
              id: 9,
              name: 'Hidden',
              kind: 'tile',
              width: 10,
              height: 10,
              visible: false,
              opacity: 1,
              offsetX: 0,
              offsetY: 0,
              properties: {},
              gids: new Uint32Array(100),
              nonEmptyTiles: 0,
            },
          ],
        }),
      ),
    ).toEqual([])
  })
})

describe('getDefaultVisibleObjectGroupIds', () => {
  it('returns ids of visible object groups only', () => {
    expect(getDefaultVisibleObjectGroupIds(makeDoc({}))).toEqual([1])
  })

  it('returns empty array when no groups are visible', () => {
    expect(
      getDefaultVisibleObjectGroupIds(
        makeDoc({
          objectGroups: [
            { id: 9, name: 'Hidden', kind: 'object', visible: false, opacity: 1, drawOrder: 'top-down', properties: {}, objects: [] },
          ],
        }),
      ),
    ).toEqual([])
  })
})

describe('getMapContentBounds', () => {
  it('crops to visible non-empty tiles with tile padding', () => {
    const gids = new Uint32Array(100)
    gids[3 * 10 + 4] = 7
    gids[4 * 10 + 5] = 8
    const document = makeDoc({
      layers: [
        {
          id: 1,
          name: 'Back',
          kind: 'tile',
          width: 10,
          height: 10,
          visible: true,
          opacity: 1,
          offsetX: 0,
          offsetY: 0,
          properties: {},
          gids,
          nonEmptyTiles: 2,
        },
      ],
      objectGroups: [],
    })

    expect(getMapContentBounds(document)).toEqual({ x: 48, y: 32, width: 64, height: 64 })
  })

  it('ignores hidden layers and falls back to the full map', () => {
    const gids = new Uint32Array(100)
    gids[3] = 7
    const document = makeDoc({
      layers: [
        {
          id: 1,
          name: 'Hidden',
          kind: 'tile',
          width: 10,
          height: 10,
          visible: false,
          opacity: 1,
          offsetX: 0,
          offsetY: 0,
          properties: {},
          gids,
          nonEmptyTiles: 1,
        },
      ],
      objectGroups: [],
    })

    expect(getMapContentBounds(document)).toEqual({ x: 0, y: 0, width: 160, height: 160 })
    expect(hasVisibleMapContent(document)).toBe(false)
    expect(hasVisibleMapContent(document, { includeHiddenLayers: true })).toBe(true)
    expect(getMapContentBounds(document, { includeHiddenLayers: true, paddingTiles: 0 })).toEqual({
      x: 48,
      y: 0,
      width: 16,
      height: 16,
    })
  })

  it('includes point objects when a map has no non-empty tiles', () => {
    const document = makeDoc({
      layers: [],
      objectGroups: [
        {
          id: 1,
          name: 'Objects',
          kind: 'object',
          visible: true,
          opacity: 1,
          drawOrder: 'top-down',
          properties: {},
          objects: [{ id: 1, name: 'Warp', type: 'Warp', x: 96, y: 80, width: 0, height: 0, rotation: 0, properties: {} }],
        },
      ],
    })

    expect(getMapContentBounds(document, { paddingTiles: 0 })).toEqual({ x: 88, y: 72, width: 16, height: 16 })
  })

  it('reports whether a map has visible thumbnail content', () => {
    const emptyDocument = makeDoc({
      layers: [
        {
          id: 1,
          name: 'Back',
          kind: 'tile',
          width: 10,
          height: 10,
          visible: true,
          opacity: 1,
          offsetX: 0,
          offsetY: 0,
          properties: {},
          gids: new Uint32Array(100),
          nonEmptyTiles: 0,
        },
      ],
      objectGroups: [],
    })
    const contentDocument = makeDoc({
      layers: [
        {
          id: 1,
          name: 'Back',
          kind: 'tile',
          width: 10,
          height: 10,
          visible: true,
          opacity: 1,
          offsetX: 0,
          offsetY: 0,
          properties: {},
          gids: Uint32Array.from([1, ...Array.from({ length: 99 }, () => 0)]),
          nonEmptyTiles: 1,
        },
      ],
      objectGroups: [],
    })

    expect(hasVisibleMapContent(emptyDocument)).toBe(false)
    expect(hasVisibleMapContent(contentDocument)).toBe(true)
  })

  it('expands narrow fragment bounds for catalog previews', () => {
    const gids = new Uint32Array(100)
    for (let y = 1; y <= 8; y += 1) {
      gids[y * 10 + 5] = 7
    }
    const document = makeDoc({
      layers: [
        {
          id: 1,
          name: 'Back',
          kind: 'tile',
          width: 10,
          height: 10,
          visible: true,
          opacity: 1,
          offsetX: 0,
          offsetY: 0,
          properties: {},
          gids,
          nonEmptyTiles: 8,
        },
      ],
      objectGroups: [],
    })

    const tight = getMapContentBounds(document, { paddingTiles: 0 })
    const preview = getMapPreviewBounds(document, { paddingTiles: 0, minimumCoverageRatio: 0.5, targetAspectRatio: 4 / 3 })

    expect(tight).toEqual({ x: 80, y: 16, width: 16, height: 128 })
    expect(preview.width).toBeGreaterThan(80)
    expect(preview.height).toBe(128)
    expect(preview.x).toBeGreaterThan(0)
  })

  it('ignores transparent tile gids when reporting visible thumbnail content', () => {
    const document = makeDoc({
      layers: [
        {
          id: 1,
          name: 'Back',
          kind: 'tile',
          width: 10,
          height: 10,
          visible: true,
          opacity: 1,
          offsetX: 0,
          offsetY: 0,
          properties: {},
          gids: Uint32Array.from({ length: 100 }, () => 9),
          nonEmptyTiles: 100,
        },
      ],
      objectGroups: [],
    })

    expect(hasVisibleMapContent(document)).toBe(true)
    expect(hasVisibleMapContent(document, { transparentTileGids: new Set([9]) })).toBe(false)
  })

  it('crops around visible tiles after transparent blocks are preprocessed', () => {
    const gids = Uint32Array.from({ length: 100 }, () => 9)
    gids[4 * 10 + 6] = 7
    const document = makeDoc({
      layers: [
        {
          id: 1,
          name: 'Back',
          kind: 'tile',
          width: 10,
          height: 10,
          visible: true,
          opacity: 1,
          offsetX: 0,
          offsetY: 0,
          properties: {},
          gids,
          nonEmptyTiles: 100,
        },
      ],
      objectGroups: [],
    })

    expect(getMapContentBounds(document, { paddingTiles: 0, transparentTileGids: new Set([9]) })).toEqual({
      x: 96,
      y: 64,
      width: 16,
      height: 16,
    })
  })
})

describe('buildMapWorkspaceTabs', () => {
  it('builds an array with the world atlas tab followed by map tabs', () => {
    const mapTabs = [
      { id: 'map:asset-1', assetId: 'asset-1', document: makeDoc({ name: 'Town' }), preview: true, dirty: false },
      { id: 'map:asset-2', assetId: 'asset-2', document: makeDoc({ name: 'Forest' }), preview: true, dirty: false },
    ]
    const tabs = buildMapWorkspaceTabs(makeDoc({ name: 'World Atlas' }), mapTabs)
    expect(tabs).toHaveLength(3)
    expect(tabs[0]!.id).toBe(WORLD_ATLAS_TAB_ID)
    expect(tabs[0]!.closable).toBe(false)
    expect(tabs[0]!.pinned).toBe(true)
    expect(tabs[1]!.id).toBe('map:asset-1')
    expect(tabs[1]!.closable).toBe(true)
    expect(tabs[2]!.id).toBe('map:asset-2')
  })

  it('handles null world atlas gracefully', () => {
    const tabs = buildMapWorkspaceTabs(null, [])
    expect(tabs).toHaveLength(1)
    expect(tabs[0]!.id).toBe(WORLD_ATLAS_TAB_ID)
    expect(tabs[0]!.title).toBe('Untitled Map')
  })

  it('handles empty map tabs', () => {
    const tabs = buildMapWorkspaceTabs(makeDoc({ name: 'World Atlas' }), [])
    expect(tabs).toHaveLength(1)
  })
})

describe('pickWorldAtlasRootMapName', () => {
  it('picks the first matching candidate from the available maps', () => {
    const documents = [makeDoc({ name: 'Forest' }), makeDoc({ name: 'Town' }), makeDoc({ name: 'Mountain' })]
    expect(pickWorldAtlasRootMapName(documents, ['Forest', 'Town'])).toBe('Forest')
  })

  it('picks the second candidate if the first is not available', () => {
    const documents = [makeDoc({ name: 'Mountain' }), makeDoc({ name: 'Town' })]
    expect(pickWorldAtlasRootMapName(documents, ['Forest', 'Town'])).toBe('Town')
  })

  it('falls back to the first document when no candidate matches', () => {
    const documents = [makeDoc({ name: 'Desert' }), makeDoc({ name: 'Mountain' })]
    expect(pickWorldAtlasRootMapName(documents, ['Town', 'Forest'])).toBe('Desert')
  })

  it('returns null for empty documents', () => {
    expect(pickWorldAtlasRootMapName([], ['Town'])).toBeNull()
  })

  it('matches case-insensitively', () => {
    expect(pickWorldAtlasRootMapName([makeDoc({ name: 'town' })], ['Town'])).toBe('Town')
  })
})

describe('isRemoteWorldAtlasDocument', () => {
  it('returns true for desert', () => {
    expect(isRemoteWorldAtlasDocument(makeDoc({ name: 'Desert' }))).toBe(true)
  })

  it('returns true for summit', () => {
    expect(isRemoteWorldAtlasDocument(makeDoc({ name: 'Summit' }))).toBe(true)
  })

  it('returns true for island_ prefixed names', () => {
    expect(isRemoteWorldAtlasDocument(makeDoc({ name: 'Island_S' }))).toBe(true)
  })

  it('returns true when LocationContext is island', () => {
    expect(
      isRemoteWorldAtlasDocument(
        makeDoc({
          name: 'GingerIsland',
          properties: { LocationContext: 'Island' },
        }),
      ),
    ).toBe(true)
  })

  it('returns false for normal outdoor maps', () => {
    expect(isRemoteWorldAtlasDocument(makeDoc({ name: 'Town' }))).toBe(false)
  })
})

describe('withWorldAtlasViewMetadata', () => {
  it('sets the name, relativePath, and view metadata', () => {
    const result = withWorldAtlasViewMetadata(makeDoc({ name: 'WorldBase' }), 'main', 'Main View')
    expect(result.name).toBe('World Atlas / Main View')
    expect(result.relativePath).toBe('World Atlas / Main View')
    expect(result.properties.atlasViewId).toBe('main')
    expect(result.properties.atlasViewLabel).toBe('Main View')
  })

  it('includes default viewport center for main view when town placement exists', () => {
    const doc = makeDoc({
      name: 'WorldBase',
      tileWidth: 16,
      atlas: {
        rootMapName: 'WorldBase',
        originOffsetX: 0,
        originOffsetY: 0,
        placements: [
          {
            mapName: 'Town',
            sourcePath: 'Maps\\Town.tmx',
            relativePath: 'Maps\\Town.tmx',
            offsetX: 10,
            offsetY: 20,
            width: 50,
            height: 30,
          },
          {
            mapName: 'Forest',
            sourcePath: 'Maps\\Forest.tmx',
            relativePath: 'Maps\\Forest.tmx',
            offsetX: 100,
            offsetY: 50,
            width: 40,
            height: 40,
          },
        ],
        warpRoutes: [],
        portals: [],
      },
    })
    const result = withWorldAtlasViewMetadata(doc, 'main', 'Main View')
    expect(result.properties.defaultViewportCenterX).toBe((10 + 25) * 16)
    expect(result.properties.defaultViewportCenterY).toBe((20 + 15) * 16)
    expect(result.properties.defaultViewportZoom).toBe(1)
  })

  it('does not include viewport center for remote view', () => {
    const doc = makeDoc({
      name: 'WorldBase',
      atlas: {
        rootMapName: 'WorldBase',
        originOffsetX: 0,
        originOffsetY: 0,
        placements: [
          {
            mapName: 'Town',
            sourcePath: 'Maps\\Town.tmx',
            relativePath: 'Maps\\Town.tmx',
            offsetX: 10,
            offsetY: 20,
            width: 50,
            height: 30,
          },
        ],
        warpRoutes: [],
        portals: [],
      },
    })
    const result = withWorldAtlasViewMetadata(doc, 'remote', 'Remote View')
    expect(result.properties.defaultViewportCenterX).toBeUndefined()
    expect(result.properties.defaultViewportZoom).toBeUndefined()
  })
})

describe('matchesWorldAtlasMapName', () => {
  it('matches island long name with short name', () => {
    expect(matchesWorldAtlasMapName('IslandEast', 'Island_E')).toBe(true)
  })

  it('matches island short name with long name', () => {
    expect(matchesWorldAtlasMapName('Island_E', 'IslandEast')).toBe(true)
  })

  it('returns false for unrelated names', () => {
    expect(matchesWorldAtlasMapName('Town', 'Forest')).toBe(false)
  })
})
