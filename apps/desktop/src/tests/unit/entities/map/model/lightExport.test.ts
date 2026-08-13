import { describe, expect, test } from 'vite-plus/test'
import { lightTextureIndexForItem, syncLightMapProperty } from '@entities/map/model/lighting'
import type { MapDocument, MapObject, MapObjectGroup, MapPropertyValue } from '@entities/map'

function makeObject(overrides: Partial<MapObject> = {}): MapObject {
  return {
    id: 1,
    name: 'TileData',
    type: '',
    x: 0,
    y: 0,
    width: 16,
    height: 16,
    rotation: 0,
    visible: true,
    properties: {},
    ...overrides,
  }
}

function makeGroup(objects: MapObject[], id = 1): MapObjectGroup {
  return { id, name: 'Objects', kind: 'object', visible: true, opacity: 1, drawOrder: 'topdown', properties: {}, objects }
}

function makeDocument(overrides: Partial<MapDocument> = {}): MapDocument {
  return {
    name: 'TestMap',
    format: 'tmx',
    sourcePath: 'maps/TestMap.tmx',
    relativePath: 'maps/TestMap.tmx',
    width: 40,
    height: 40,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    properties: {},
    tilesets: [],
    layers: [],
    objectGroups: [],
    ...overrides,
  }
}

/** One editor light marker standing on the given tile. */
function markerAt(tileX: number, tileY: number, properties: Record<string, MapPropertyValue> = {}, id = 1): MapObject {
  return makeObject({ id, x: tileX * 16, y: tileY * 16, properties: { MFMarker: 'light', ...properties } })
}

describe('lightTextureIndexForItem', () => {
  test('lantern names map to the lantern texture', () => {
    expect(lightTextureIndexForItem('Lantern')).toBe(1)
    expect(lightTextureIndexForItem('wall lantern')).toBe(1)
  })

  test('window names map to the window light', () => {
    expect(lightTextureIndexForItem('Window')).toBe(2)
    expect(lightTextureIndexForItem('DiningRoomWindow')).toBe(2)
  })

  test('anything else falls back to the sconce', () => {
    expect(lightTextureIndexForItem(null)).toBe(4)
    expect(lightTextureIndexForItem('')).toBe(4)
    expect(lightTextureIndexForItem('(O)146')).toBe(4)
    expect(lightTextureIndexForItem('(BC)146')).toBe(4)
    expect(lightTextureIndexForItem('Torch')).toBe(4)
  })
})

describe('syncLightMapProperty', () => {
  test('an empty document stays unchanged with no Light key', () => {
    const document = makeDocument()
    expect(syncLightMapProperty(document)).toBe(document)
    expect(document.properties.Light).toBeUndefined()
  })

  test('a marker writes one Light triple', () => {
    const document = makeDocument({ objectGroups: [makeGroup([markerAt(3, 5)])] })
    const synced = syncLightMapProperty(document)
    expect(synced).not.toBe(document)
    expect(synced.properties.Light).toBe('3 5 4')
  })

  test('moving a marker rewrites its triple; deleting the last marker removes the key', () => {
    const document = makeDocument({ objectGroups: [makeGroup([markerAt(3, 5)])] })
    const moved = syncLightMapProperty({
      ...document,
      objectGroups: [makeGroup([markerAt(4, 6, {}, 1)])],
    })
    expect(moved.properties.Light).toBe('4 6 4')
    const deleted = syncLightMapProperty({ ...document, objectGroups: [makeGroup([])] })
    expect(deleted.properties.Light).toBeUndefined()
    expect('Light' in deleted.properties).toBe(false)
  })

  test('unlit markers (IsOn false) never enter Light', () => {
    const document = makeDocument({
      objectGroups: [makeGroup([markerAt(3, 5, { IsOn: 'false' }), markerAt(7, 8)])],
    })
    expect(syncLightMapProperty(document).properties.Light).toBe('7 8 4')
  })

  test('heuristic objects (empty properties or a bare QualifiedItemId) produce no triples', () => {
    const empty = makeObject({ name: 'TileData', x: 3 * 16, y: 5 * 16 })
    const heuristic = makeObject({ name: 'TileData', id: 2, x: 3 * 16, y: 5 * 16, properties: { QualifiedItemId: '(BC)152' } })
    const document = makeDocument({ objectGroups: [makeGroup([empty, heuristic])] })
    expect(syncLightMapProperty(document)).toBe(document)
    expect(document.properties.Light).toBeUndefined()
  })

  test('marker triples sort by (y, x)', () => {
    const document = makeDocument({
      objectGroups: [makeGroup([markerAt(1, 7, {}, 1), markerAt(2, 3, {}, 2), markerAt(9, 3, {}, 3)])],
    })
    expect(syncLightMapProperty(document).properties.Light).toBe('2 3 4 9 3 4 1 7 4')
  })

  test('two markers on the same tile emit one triple (first wins)', () => {
    const document = makeDocument({
      objectGroups: [makeGroup([markerAt(3, 5, {}, 1), markerAt(3, 5, { MFLightTexture: '7' }, 2)])],
    })
    expect(syncLightMapProperty(document).properties.Light).toBe('3 5 4')
  })

  test('hand-written triples on other tiles are preserved verbatim and stay first', () => {
    const document = makeDocument({
      properties: { Light: '10 20 1 11 21 2' },
      objectGroups: [makeGroup([markerAt(3, 5)])],
    })
    expect(syncLightMapProperty(document).properties.Light).toBe('10 20 1 11 21 2 3 5 4')
  })

  test('a hand-written triple on a marker tile is replaced by the marker (deduped)', () => {
    const document = makeDocument({
      properties: { Light: '3 5 2' },
      objectGroups: [makeGroup([markerAt(3, 5)])],
    })
    expect(syncLightMapProperty(document).properties.Light).toBe('3 5 4')
  })

  test('MFLightTexture overrides the exported shape', () => {
    const document = makeDocument({ objectGroups: [makeGroup([markerAt(3, 5, { MFLightTexture: '7' })])] })
    expect(syncLightMapProperty(document).properties.Light).toBe('3 5 7')
  })

  test('invalid or unsupported texture indexes fall back to the item mapping', () => {
    const invalid = makeDocument({ objectGroups: [makeGroup([markerAt(3, 5, { MFLightTexture: '3' })])] })
    expect(syncLightMapProperty(invalid).properties.Light).toBe('3 5 4')
    const junk = makeDocument({ objectGroups: [makeGroup([markerAt(3, 5, { MFLightTexture: 'abc' })])] })
    expect(syncLightMapProperty(junk).properties.Light).toBe('3 5 4')
    const lanternObject = makeObject({
      x: 3 * 16,
      y: 5 * 16,
      type: 'Lantern',
      properties: { MFMarker: 'light', MFLightTexture: '3' },
    })
    const lantern = makeDocument({ objectGroups: [makeGroup([lanternObject])] })
    expect(syncLightMapProperty(lantern).properties.Light).toBe('3 5 1')
  })

  test('trailing partial tokens in the existing value are kept as-is at the end', () => {
    const document = makeDocument({
      properties: { Light: '10 20 1 5' },
      objectGroups: [makeGroup([markerAt(3, 5)])],
    })
    expect(syncLightMapProperty(document).properties.Light).toBe('10 20 1 3 5 4 5')
  })

  test('returns the original document when the value already matches', () => {
    const document = makeDocument({
      properties: { Light: '3 5 4' },
      objectGroups: [makeGroup([markerAt(3, 5)])],
    })
    expect(syncLightMapProperty(document)).toBe(document)
  })

  test('sync is idempotent: a second pass returns the first result unchanged', () => {
    const document = makeDocument({
      properties: { Light: '10 20 1' },
      objectGroups: [makeGroup([markerAt(3, 5), markerAt(1, 7)])],
    })
    const first = syncLightMapProperty(document)
    expect(first.properties.Light).toBe('10 20 1 3 5 4 1 7 4')
    expect(syncLightMapProperty(first)).toBe(first)
  })
})
