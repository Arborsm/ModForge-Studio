import { describe, expect, test } from 'vite-plus/test'
import {
  BIG_CRAFTABLE_LAMP_LIGHT_COLOR,
  BONFIRE_LIGHT_COLOR,
  EVENT_LANTERN_LIGHT_COLOR,
  FIREPLACE_FURNITURE_TYPE,
  INDOOR_LIGHTMAP_DAY,
  INDOOR_LIGHTMAP_NIGHT,
  MINE_LIGHTMAP_COLOR,
  OBJECT_FIRE_LIGHT_COLOR,
  PATHS_LAMP_TILE_ID,
  STRANGE_CAPSULE_LIGHT_COLOR,
  TORCH_FURNITURE_TYPE,
  buildEventLanternGlow,
  buildMapPropertyLightGlows,
  buildObjectLightItemIndex,
  buildPlacedObjectLightGlow,
  buildPlacedObjectLightGlows,
  buildTileLampLightGlows,
  clockToMinutes,
  computeLightingOverlayChannel,
  deriveIndoorLightmapColor,
  deriveMapDocumentLighting,
  deriveOutdoorLightFactor,
  deriveOutdoorLightmapColor,
  getEveningColor,
  getLightingPreviewTimeOfDay,
  getStartingToGetDarkTime,
  getTrulyDarkTime,
  getWindowLightsOffTime,
  isIndoorMapDocument,
  isMineLikeMapName,
  isObjectLightItemIndexEmpty,
  parseMapAmbientLightProperty,
  resolveMapObjectItemReference,
  resolvePlacedItemQualifiedId,
  resolvePlacedObjectLightMarkers,
  toGameClockUnits,
} from '@entities/map/model/lighting'

describe('game clock conversion', () => {
  test('converts HHMM to game clock units (ten-minute steps scaled by 16.66)', () => {
    expect(toGameClockUnits(1800)).toBe(1800)
    expect(toGameClockUnits(1830)).toBeCloseTo(1800 + 3 * 16.66, 5)
    expect(toGameClockUnits(2059)).toBeCloseTo(2000 + 5 * 16.66, 5)
  })

  test('converts HHMM to plain minutes', () => {
    expect(clockToMinutes(2000)).toBe(1200)
    expect(clockToMinutes(1830)).toBe(1110)
  })
})

describe('darkness schedule', () => {
  test('start/truly-dark/window-off times follow the season', () => {
    expect(getStartingToGetDarkTime('spring')).toBe(1800)
    expect(getStartingToGetDarkTime('summer')).toBe(1800)
    expect(getStartingToGetDarkTime('fall')).toBe(1700)
    expect(getStartingToGetDarkTime('winter')).toBe(1500)
    expect(getTrulyDarkTime('spring')).toBe(2000)
    expect(getTrulyDarkTime('winter')).toBe(1700)
    expect(getWindowLightsOffTime('spring')).toBe(1900)
    expect(getWindowLightsOffTime('winter')).toBe(1600)
  })

  test('evening color is yellow except in winter', () => {
    expect(getEveningColor('spring')).toEqual({ r: 255, g: 255, b: 0 })
    expect(getEveningColor('winter')).toEqual({ r: 245, g: 225, b: 170 })
  })
})

describe('outdoor light factor', () => {
  test('is null before the world starts getting dark', () => {
    expect(deriveOutdoorLightFactor(600, 'spring')).toBeNull()
    expect(deriveOutdoorLightFactor(1759, 'spring')).toBeNull()
    expect(deriveOutdoorLightFactor(1459, 'winter')).toBeNull()
  })

  test('ramps 0.3 -> 0.93 between start and fully dark', () => {
    expect(deriveOutdoorLightFactor(1800, 'spring')).toBeCloseTo(0.3, 5)
    // One hour into the transition: 100 clock units past the start.
    expect(deriveOutdoorLightFactor(1900, 'spring')).toBeCloseTo(0.3 + 100 * 0.00225, 5)
    expect(deriveOutdoorLightFactor(2000, 'spring')).toBeCloseTo(0.75, 5)
  })

  test('creeps 0.75 -> 0.93 after fully dark', () => {
    expect(deriveOutdoorLightFactor(2100, 'spring')).toBeCloseTo(0.75 + 100 * 0.000625, 5)
    expect(deriveOutdoorLightFactor(2400, 'spring')).toBe(0.93)
    expect(deriveOutdoorLightFactor(2600, 'spring')).toBe(0.93)
  })
})

describe('outdoor lightmap color', () => {
  test('is null in daylight', () => {
    expect(deriveOutdoorLightmapColor(1200, 'spring')).toBeNull()
  })

  test('stores the evening color premultiplied by the squared factor', () => {
    // Fully dark spring: 0.75^2 = 0.5625 -> (143, 143, 0).
    expect(deriveOutdoorLightmapColor(2000, 'spring')).toEqual({ r: 143, g: 143, b: 0 })
  })

  test('winter uses the warm evening color and its own schedule', () => {
    // Winter 1600: 100 units past the 1500 start -> factor 0.525, squared 0.275625.
    const color = deriveOutdoorLightmapColor(1600, 'winter')
    expect(color).not.toBeNull()
    expect(color!.r).toBe(Math.round(245 * 0.525 * 0.525))
    expect(color!.g).toBe(Math.round(225 * 0.525 * 0.525))
    expect(color!.b).toBe(Math.round(170 * 0.525 * 0.525))
  })
})

describe('indoor lightmap color', () => {
  test('uses the default indoor color before evening', () => {
    expect(deriveIndoorLightmapColor(1200, 'spring')).toEqual(INDOOR_LIGHTMAP_DAY)
  })

  test('lerps to the night color across the two hours before fully dark', () => {
    expect(deriveIndoorLightmapColor(2000, 'spring')).toEqual(INDOOR_LIGHTMAP_NIGHT)
    const halfway = deriveIndoorLightmapColor(1900, 'spring')
    expect(halfway).toEqual({
      r: Math.round((INDOOR_LIGHTMAP_DAY.r + INDOOR_LIGHTMAP_NIGHT.r) / 2),
      g: Math.round((INDOOR_LIGHTMAP_DAY.g + INDOOR_LIGHTMAP_NIGHT.g) / 2),
      b: 30,
    })
  })

  test('a custom ambient overrides the day color', () => {
    expect(deriveIndoorLightmapColor(1200, 'spring', { ambientLight: { r: 10, g: 20, b: 30 } })).toEqual({ r: 10, g: 20, b: 30 })
  })
})

describe('map ambient properties', () => {
  test('absent property keeps the default', () => {
    expect(parseMapAmbientLightProperty({})).toEqual({ kind: 'default', color: null })
  })

  test('white means fully bright (no darkening)', () => {
    expect(parseMapAmbientLightProperty({ AmbientLight: 'White' })).toEqual({ kind: 'bright', color: null })
    expect(parseMapAmbientLightProperty({ AmbientLight: '255 255 255' })).toEqual({ kind: 'bright', color: null })
  })

  test('an rgb triple becomes the ambient color', () => {
    expect(parseMapAmbientLightProperty({ AmbientLight: '40 50 60' })).toEqual({ kind: 'color', color: { r: 40, g: 50, b: 60 } })
  })
})

describe('location detection', () => {
  test('mine-like map names', () => {
    expect(isMineLikeMapName('Mine')).toBe(true)
    expect(isMineLikeMapName('UndergroundMine1')).toBe(true)
    expect(isMineLikeMapName('SkullCavern')).toBe(true)
    expect(isMineLikeMapName('Town')).toBe(false)
  })

  test('indoor detection uses the Outdoors flag or a custom ambient', () => {
    expect(isIndoorMapDocument({ properties: { Outdoors: 'false' } })).toBe(true)
    expect(isIndoorMapDocument({ properties: { AmbientLight: '40 50 60' } })).toBe(true)
    expect(isIndoorMapDocument({ properties: { Outdoors: 'true' } })).toBe(false)
    expect(isIndoorMapDocument({ properties: {} })).toBe(false)
  })
})

describe('map property light glows', () => {
  test('parses Light triples into tile-centered black glows', () => {
    const glows = buildMapPropertyLightGlows({ Light: '5 6 1 7 8 2' }, { windowLightsVisible: false })
    expect(glows).toHaveLength(2)
    expect(glows[0]).toMatchObject({ worldX: 5 * 64 + 32, worldY: 6 * 64 + 32, textureIndex: 1, scale: 1, color: { r: 0, g: 0, b: 0 } })
    expect(glows[1]).toMatchObject({ worldX: 7 * 64 + 32, worldY: 8 * 64 + 32, textureIndex: 2, scale: 1 })
  })

  test('window lights are only included while visible', () => {
    const properties = { WindowLight: '1 2 2' }
    expect(buildMapPropertyLightGlows(properties, { windowLightsVisible: true })).toHaveLength(1)
    expect(buildMapPropertyLightGlows(properties, { windowLightsVisible: false })).toHaveLength(0)
  })
})

describe('event lantern glow', () => {
  test('uses the sconce texture scaled by radius, tinted like the game, centered on the tile', () => {
    const glow = buildEventLanternGlow({ worldX: 46 * 64, worldY: 86 * 64, radius: 2 })
    expect(glow).toEqual({
      worldX: 46 * 64 + 32,
      worldY: 86 * 64 + 32,
      textureIndex: 4,
      scale: 2,
      color: EVENT_LANTERN_LIGHT_COLOR,
    })
  })
})

describe('placed-object lights (Object.initializeLightSource)', () => {
  const bigCraftablesContent = JSON.stringify({
    '143': { Name: 'Wooden Brazier', IsLamp: false, ContextTags: ['light_source', 'torch_item'] },
    '146': { Name: 'Campfire', IsLamp: false, ContextTags: ['campfire_item', 'light_source', 'torch_item'] },
    '152': { Name: 'Wood Lamp-post', IsLamp: true },
    '74': { Name: 'Bonfire', IsLamp: false },
    '96': { Name: 'Strange Capsule', IsLamp: false },
    '8': { Name: 'Keg', IsLamp: false },
  })
  const furnitureContent = JSON.stringify({
    '1792': 'Brick Fireplace/fireplace/-1/-1/1/1000/-1/[LocalizedText Strings\\Furniture:BrickFireplace]',
    '2397': 'Plain Torch/torch/-1/-1/1/500/-1/[LocalizedText Strings\\Furniture:PlainTorch]',
    '0': 'Oak Chair/chair/-1/-1/1/250/-1/x',
    BedFurniture: { Name: 'Double Bed', Type: 'bed' },
  })
  const index = buildObjectLightItemIndex(bigCraftablesContent, furnitureContent)

  describe('buildObjectLightItemIndex', () => {
    test('parses big-craftable lamp and torch facts', () => {
      expect(index.bigCraftables['143']).toMatchObject({ isTorch: true, isCampfire: false, isLamp: false })
      expect(index.bigCraftables['146']).toMatchObject({ isTorch: true, isCampfire: true })
      expect(index.bigCraftables['152']).toMatchObject({ isTorch: false, isLamp: true })
      expect(isObjectLightItemIndexEmpty(index)).toBe(false)
    })

    test('parses legacy and modern furniture entries into type numbers', () => {
      expect(index.furnitureTypes['1792']).toBe(FIREPLACE_FURNITURE_TYPE)
      expect(index.furnitureTypes['2397']).toBe(TORCH_FURNITURE_TYPE)
      expect(index.furnitureTypes['0']).toBe(0)
      expect(index.furnitureTypes.BedFurniture).toBe(15)
    })

    test('malformed or missing content yields an empty index', () => {
      expect(isObjectLightItemIndexEmpty(buildObjectLightItemIndex(null, null))).toBe(true)
      expect(isObjectLightItemIndexEmpty(buildObjectLightItemIndex('{nope', 'also not json'))).toBe(true)
    })
  })

  describe('resolvePlacedItemQualifiedId', () => {
    test('accepts qualified ids for known items', () => {
      expect(resolvePlacedItemQualifiedId('(BC)152', index)).toBe('(BC)152')
      expect(resolvePlacedItemQualifiedId('(F)1792', index)).toBe('(F)1792')
      expect(resolvePlacedItemQualifiedId('(BC)9999', index)).toBeNull()
      expect(resolvePlacedItemQualifiedId('(O)95', index)).toBeNull()
    })

    test('bare numeric ids prefer light-relevant big craftables over furniture', () => {
      expect(resolvePlacedItemQualifiedId('152', index)).toBe('(BC)152')
      expect(resolvePlacedItemQualifiedId('1792', index)).toBe('(F)1792')
    })

    test('resolves exact internal names case-insensitively', () => {
      expect(resolvePlacedItemQualifiedId('wood lamp-post', index)).toBe('(BC)152')
      expect(resolvePlacedItemQualifiedId('Brick Fireplace', index)).toBe('(F)1792')
      expect(resolvePlacedItemQualifiedId('Not An Item', index)).toBeNull()
    })
  })

  describe('resolvePlacedObjectLightMarkers', () => {
    const makeObject = (overrides: Record<string, unknown>) => ({
      id: 1,
      name: '',
      type: '',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rotation: 0,
      visible: true,
      properties: {},
      ...overrides,
    })

    test('reference precedence: QualifiedItemId property, then type, then name', () => {
      const fromProperty = makeObject({ properties: { QualifiedItemId: '(BC)152' }, type: '(BC)143', name: 'Campfire' })
      const fromType = makeObject({ type: '(BC)143', name: 'Campfire' })
      const fromName = makeObject({ name: 'Campfire' })
      expect(resolveMapObjectItemReference(fromProperty)).toBe('(BC)152')
      expect(resolveMapObjectItemReference(fromType)).toBe('(BC)143')
      expect(resolveMapObjectItemReference(fromName)).toBe('Campfire')
      expect(resolveMapObjectItemReference(makeObject({ name: 'TileData' }))).toBe('TileData')
      expect(resolveMapObjectItemReference(makeObject({}))).toBeNull()
    })

    test('markers land on the tile under the object bounds center and dedupe per tile', () => {
      const groups = [
        {
          objects: [
            makeObject({ id: 1, type: '(BC)143', x: 3 * 16, y: 4 * 16, width: 16, height: 16 }),
            makeObject({ id: 2, type: '(BC)152', x: 3 * 16, y: 4 * 16 }),
            makeObject({ id: 3, name: 'TileData', x: 8 * 16, y: 8 * 16 }),
          ],
        },
      ]
      const markers = resolvePlacedObjectLightMarkers(groups, { tileWidth: 16, tileHeight: 16 }, index)
      expect(markers).toEqual([{ qualifiedItemId: '(BC)143', tileX: 3, tileY: 4, isOn: true }])
    })

    test('IsOn property models an unlit fixture', () => {
      const groups = [{ objects: [makeObject({ type: '(BC)143', properties: { IsOn: 'false' } })] }]
      expect(resolvePlacedObjectLightMarkers(groups, { tileWidth: 16, tileHeight: 16 }, index)[0]?.isOn).toBe(false)
      const truthy = [{ objects: [makeObject({ type: '(BC)143', properties: { IsOn: 'T' } })] }]
      expect(resolvePlacedObjectLightMarkers(truthy, { tileWidth: 16, tileHeight: 16 }, index)[0]?.isOn).toBe(true)
    })
  })

  describe('buildPlacedObjectLightGlow', () => {
    test('lit fireplace furniture glows at radius 2.5 one tile above', () => {
      const glow = buildPlacedObjectLightGlow({ qualifiedItemId: '(F)1792', tileX: 3, tileY: 4, isOn: true }, index)
      expect(glow).toEqual({
        worldX: 3 * 64 + 32,
        worldY: 4 * 64 - 64,
        textureIndex: 4,
        scale: 2.5,
        color: OBJECT_FIRE_LIGHT_COLOR,
      })
    })

    test('lamp furniture glows at radius 1.5; unlit fixtures stay dark', () => {
      expect(buildPlacedObjectLightGlow({ qualifiedItemId: '(F)2397', tileX: 0, tileY: 0, isOn: true }, index)?.scale).toBe(1.5)
      expect(buildPlacedObjectLightGlow({ qualifiedItemId: '(F)1792', tileX: 0, tileY: 0, isOn: false }, index)).toBeNull()
      expect(buildPlacedObjectLightGlow({ qualifiedItemId: '(F)0', tileX: 0, tileY: 0, isOn: true }, index)).toBeNull()
    })

    test('torches glow at radius 2.5; campfires hang one half tile lower', () => {
      const brazier = buildPlacedObjectLightGlow({ qualifiedItemId: '(BC)143', tileX: 3, tileY: 4, isOn: true }, index)
      expect(brazier).toMatchObject({
        worldX: 3 * 64 + 32,
        worldY: 4 * 64 - 64,
        textureIndex: 4,
        scale: 2.5,
        color: OBJECT_FIRE_LIGHT_COLOR,
      })
      const campfire = buildPlacedObjectLightGlow({ qualifiedItemId: '(BC)146', tileX: 3, tileY: 4, isOn: true }, index)
      expect(campfire).toMatchObject({ worldY: 4 * 64 + 32 })
      expect(buildPlacedObjectLightGlow({ qualifiedItemId: '(BC)143', tileX: 3, tileY: 4, isOn: false }, index)).toBeNull()
    })

    test('IsLamp big craftables use the dimmer tint at radius 3 regardless of IsOn', () => {
      const glow = buildPlacedObjectLightGlow({ qualifiedItemId: '(BC)152', tileX: 3, tileY: 4, isOn: false }, index)
      expect(glow).toMatchObject({
        worldX: 3 * 64 + 32,
        worldY: 4 * 64 - 64,
        textureIndex: 4,
        scale: 3,
        color: BIG_CRAFTABLE_LAMP_LIGHT_COLOR,
      })
    })

    test('Bonfire and Strange Capsule use their special tints at the tile anchor', () => {
      expect(buildPlacedObjectLightGlow({ qualifiedItemId: '(BC)74', tileX: 3, tileY: 4, isOn: true }, index)).toMatchObject({
        worldX: 3 * 64 + 32,
        worldY: 4 * 64,
        textureIndex: 4,
        scale: 1.5,
        color: BONFIRE_LIGHT_COLOR,
      })
      expect(buildPlacedObjectLightGlow({ qualifiedItemId: '(BC)96', tileX: 3, tileY: 4, isOn: true }, index)).toMatchObject({
        worldY: 4 * 64,
        scale: 1,
        color: STRANGE_CAPSULE_LIGHT_COLOR,
      })
      expect(buildPlacedObjectLightGlow({ qualifiedItemId: '(BC)8', tileX: 3, tileY: 4, isOn: true }, index)).toBeNull()
    })
  })

  describe('map document lighting with placed objects', () => {
    const objectGroups = [
      {
        id: 1,
        name: 'Objects',
        kind: 'object' as const,
        visible: true,
        opacity: 1,
        drawOrder: 'topdown',
        properties: {},
        objects: [
          {
            id: 1,
            name: '',
            type: '(BC)152',
            x: 5 * 16,
            y: 6 * 16,
            width: 16,
            height: 16,
            rotation: 0,
            visible: true,
            properties: {},
          },
        ],
      },
    ]
    const farm = { name: 'Farm', properties: { Outdoors: 'true' }, layers: [], tilesets: [], objectGroups, tileWidth: 16, tileHeight: 16 }

    test('object lamp markers glow at night but not in bright daylight', () => {
      expect(deriveMapDocumentLighting(farm, 1200, 'spring', { objectLightIndex: index })).toBeNull()
      const state = deriveMapDocumentLighting(farm, 2200, 'spring', { objectLightIndex: index })
      expect(state?.glows).toHaveLength(1)
      expect(state?.glows[0]).toMatchObject({ worldX: 5 * 64 + 32, worldY: 6 * 64 - 64, color: BIG_CRAFTABLE_LAMP_LIGHT_COLOR })
    })

    test('without an item index the markers contribute nothing', () => {
      expect(deriveMapDocumentLighting(farm, 2200, 'spring')?.glows).toHaveLength(0)
      expect(buildPlacedObjectLightGlows(farm, null)).toHaveLength(0)
    })
  })
})

describe('multiply overlay channel', () => {
  test('black stays white and white goes black', () => {
    expect(computeLightingOverlayChannel(0)).toBe(255)
    expect(computeLightingOverlayChannel(255)).toBe(0)
  })

  test('mid values follow 255 - stored^2 / 255', () => {
    expect(computeLightingOverlayChannel(143)).toBe(Math.round(255 - (143 * 143) / 255))
  })
})

describe('tile lamp glows (GameLocation.loadLights)', () => {
  const makeLayer = (name: string, gids: number[], width = 4) => ({
    id: 1,
    name,
    kind: 'tile' as const,
    width,
    height: Math.ceil(gids.length / width),
    visible: true,
    opacity: 1,
    offsetX: 0,
    offsetY: 0,
    properties: {},
    gids: Uint32Array.from(gids),
    nonEmptyTiles: gids.filter(Boolean).length,
  })
  const makeTileset = (name: string, firstGid: number) => ({
    firstGid,
    name,
    tileWidth: 16,
    tileHeight: 16,
    tileCount: 4096,
    columns: 64,
    imageSource: null,
    imagePath: null,
    imageWidth: null,
    imageHeight: null,
    properties: {},
    tileProperties: {},
    animations: {},
  })
  // firstGid 1: Paths lamp tile 8 -> gid 9; indoor tilesheet firstGid 1025: sconce 480 -> gid 1505, window 256 -> gid 1281.
  const indoorTiles = [makeTileset('paths', 1), makeTileset('indoor', 1025)]
  const indoorProperties = { Outdoors: 'false' }
  const base = { name: 'SeedShop', properties: indoorProperties, tilesets: indoorTiles }

  test('Paths tile 8 spawns a sconce glow on interior maps', () => {
    const doc = { ...base, layers: [makeLayer('Paths', [0, 9, 0, 0])] }
    const glows = buildTileLampLightGlows(doc, { windowLightsVisible: true })
    expect(glows).toHaveLength(1)
    expect(glows[0]).toMatchObject({ worldX: 1 * 64 + 32, worldY: 32, textureIndex: 4, scale: 1 })
  })

  test('outdoor and farmhouse maps skip tile lights', () => {
    const layers = [makeLayer('Paths', [0, 9, 0, 0])]
    expect(buildTileLampLightGlows({ ...base, properties: {}, layers }, { windowLightsVisible: true })).toHaveLength(0)
    expect(buildTileLampLightGlows({ ...base, name: 'FarmHouse', layers }, { windowLightsVisible: true })).toHaveLength(0)
  })

  test('indoor tilesheet sconce tiles spawn glows on Front', () => {
    const doc = { ...base, layers: [makeLayer('Front', [1505, 0, 0, 0])] }
    const glows = buildTileLampLightGlows(doc, { windowLightsVisible: true })
    expect(glows).toHaveLength(1)
    expect(glows[0]).toMatchObject({ worldX: 32, worldY: 32 })
  })

  test('IgnoreLightingTiles disables Front/Buildings scanning but keeps Paths', () => {
    const doc = {
      ...base,
      properties: { ...indoorProperties, IgnoreLightingTiles: 'true' },
      layers: [makeLayer('Front', [1505, 0, 0, 0]), makeLayer('Paths', [0, 9, 0, 0])],
    }
    const glows = buildTileLampLightGlows(doc, { windowLightsVisible: true })
    expect(glows).toHaveLength(1)
    expect(glows[0]).toMatchObject({ worldX: 1 * 64 + 32 })
  })

  test('window lamp tiles spawn two stacked glows while window lights are on', () => {
    const doc = { ...base, name: 'JoshHouse', layers: [makeLayer('Buildings', [0, 1281, 0, 0])] }
    const glows = buildTileLampLightGlows(doc, { windowLightsVisible: true })
    expect(glows).toHaveLength(2)
    expect(glows[0]).toMatchObject({ worldX: 1 * 64 + 32, worldY: 32 })
    expect(glows[1]).toMatchObject({ worldX: 1 * 64 + 32, worldY: 1 * 64 + 32 })
    expect(buildTileLampLightGlows(doc, { windowLightsVisible: false })).toHaveLength(0)
  })

  test('the SeedShop window-lamp exclusion applies to tile 225 at x 36/37', () => {
    const makeRow = (x: number) => {
      const gids = Array.from({ length: 40 }, () => 0)
      gids[x] = 1025 + 225
      return makeLayer('Front', gids, 40)
    }
    expect(buildTileLampLightGlows({ ...base, layers: [makeRow(36)] }, { windowLightsVisible: true })).toHaveLength(0)
    expect(buildTileLampLightGlows({ ...base, layers: [makeRow(37)] }, { windowLightsVisible: true })).toHaveLength(0)
    expect(buildTileLampLightGlows({ ...base, layers: [makeRow(35)] }, { windowLightsVisible: true })).toHaveLength(2)
  })

  test('PATHS_LAMP_TILE_ID matches the game constant', () => {
    expect(PATHS_LAMP_TILE_ID).toBe(8)
  })
})

describe('map document lighting', () => {
  const town = { name: 'Town', properties: { Outdoors: 'true', Light: '5 6 1' }, layers: [], tilesets: [] }

  test('outdoor daylight produces no overlay', () => {
    expect(deriveMapDocumentLighting(town, 1200, 'spring')).toBeNull()
  })

  test('outdoor night darkens and includes map lights', () => {
    const state = deriveMapDocumentLighting(town, 2200, 'spring')
    expect(state).not.toBeNull()
    expect(state!.baseColor).toEqual(deriveOutdoorLightmapColor(2200, 'spring'))
    expect(state!.glows).toHaveLength(1)
  })

  test('window lights drop out after they turn off', () => {
    const withWindows = { name: 'Town', properties: { WindowLight: '1 2 2' }, layers: [], tilesets: [] }
    expect(deriveMapDocumentLighting(withWindows, 1850, 'spring')!.glows).toHaveLength(1)
    expect(deriveMapDocumentLighting(withWindows, 2200, 'spring')!.glows).toHaveLength(0)
  })

  test('mines always use the shaft color', () => {
    expect(
      deriveMapDocumentLighting({ name: 'UndergroundMine1', properties: {}, layers: [], tilesets: [] }, 1200, 'spring')!.baseColor,
    ).toEqual(MINE_LIGHTMAP_COLOR)
  })

  test('indoor maps use the ambient light day and night', () => {
    const farmhouse = { name: 'FarmHouse', properties: { Outdoors: 'false' }, layers: [], tilesets: [] }
    expect(deriveMapDocumentLighting(farmhouse, 1200, 'spring')!.baseColor).toEqual(INDOOR_LIGHTMAP_DAY)
    expect(deriveMapDocumentLighting(farmhouse, 2200, 'spring')!.baseColor).toEqual(INDOOR_LIGHTMAP_NIGHT)
  })

  test('preview modes map to representative clock times', () => {
    expect(getLightingPreviewTimeOfDay('day', 'spring')).toBe(1200)
    expect(getLightingPreviewTimeOfDay('dusk', 'spring')).toBe(1850)
    expect(getLightingPreviewTimeOfDay('night', 'spring')).toBe(2200)
    expect(getLightingPreviewTimeOfDay('night', 'winter')).toBe(1900)
  })
})
