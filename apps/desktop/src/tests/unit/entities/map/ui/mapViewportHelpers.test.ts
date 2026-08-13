import { describe, expect, it } from 'vite-plus/test'
import type { MapDocument, MapObject, MapObjectGroup } from '@entities/map'
import { hitTestMapObject } from '@entities/map/ui/mapViewportHelpers'

function createObject(overrides: Partial<MapObject> = {}): MapObject {
  return {
    id: 1,
    name: '',
    type: '',
    x: 0,
    y: 0,
    width: 32,
    height: 32,
    rotation: 0,
    properties: {},
    ...overrides,
  }
}

function createObjectGroup(overrides: Partial<MapObjectGroup> = {}): MapObjectGroup {
  return {
    id: 1,
    name: 'TestGroup',
    kind: 'object',
    visible: true,
    opacity: 1,
    drawOrder: 'top-down',
    properties: {},
    objects: [],
    ...overrides,
  }
}

function createMapDocument(objectGroups: MapObjectGroup[]): MapDocument {
  return {
    name: 'TestMap',
    format: 'tmx',
    sourcePath: '/maps/TestMap.tmx',
    relativePath: 'TestMap.tmx',
    width: 10,
    height: 10,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    properties: {},
    tilesets: [],
    layers: [],
    objectGroups,
  }
}

describe('hitTestMapObject', () => {
  it('returns the object whose bounds contain the world point', () => {
    const object = createObject({ id: 7, x: 10, y: 20, width: 32, height: 64 })
    const document = createMapDocument([createObjectGroup({ id: 1, objects: [object] })])
    const visible = new Set([1])

    expect(hitTestMapObject(document, visible, 25, 50)).toBe(object)
    expect(hitTestMapObject(document, visible, 10, 20)).toBe(object)
    expect(hitTestMapObject(document, visible, 42, 84)).toBe(object)
  })

  it('returns null when the point is outside every object bounds', () => {
    const object = createObject({ id: 7, x: 10, y: 20, width: 32, height: 64 })
    const document = createMapDocument([createObjectGroup({ id: 1, objects: [object] })])
    const visible = new Set([1])

    expect(hitTestMapObject(document, visible, 9, 50)).toBeNull()
    expect(hitTestMapObject(document, visible, 25, 19)).toBeNull()
    expect(hitTestMapObject(document, visible, 100, 100)).toBeNull()
  })

  it('returns null when no groups are visible or in the visible set', () => {
    const object = createObject({ id: 7, x: 10, y: 20, width: 32, height: 64 })
    const document = createMapDocument([createObjectGroup({ id: 1, objects: [object] })])

    expect(hitTestMapObject(document, new Set(), 25, 50)).toBeNull()
    expect(hitTestMapObject(document, new Set([2]), 25, 50)).toBeNull()
  })

  it('skips hidden groups even when they are in the visible set', () => {
    const object = createObject({ id: 7, x: 10, y: 20, width: 32, height: 64 })
    const document = createMapDocument([createObjectGroup({ id: 1, visible: false, objects: [object] })])

    expect(hitTestMapObject(document, new Set([1]), 25, 50)).toBeNull()
  })

  it('prefers the last painted object within a group when multiple overlap', () => {
    const bottom = createObject({ id: 1, x: 0, y: 0, width: 64, height: 64 })
    const top = createObject({ id: 2, x: 16, y: 16, width: 32, height: 32 })
    const document = createMapDocument([createObjectGroup({ id: 1, objects: [bottom, top] })])

    expect(hitTestMapObject(document, new Set([1]), 30, 30)).toBe(top)
  })

  it('prefers an object in a later group over an earlier group when both hit', () => {
    const firstGroupObject = createObject({ id: 1, x: 0, y: 0, width: 64, height: 64 })
    const laterGroupObject = createObject({ id: 2, x: 16, y: 16, width: 32, height: 32 })
    const document = createMapDocument([
      createObjectGroup({ id: 1, objects: [firstGroupObject] }),
      createObjectGroup({ id: 2, objects: [laterGroupObject] }),
    ])

    expect(hitTestMapObject(document, new Set([1, 2]), 30, 30)).toBe(laterGroupObject)
  })

  it('hits zero-sized point objects through their minimum bounds', () => {
    const object = createObject({ id: 3, x: 40, y: 40, width: 0, height: 0 })
    const document = createMapDocument([createObjectGroup({ id: 1, objects: [object] })])
    const visible = new Set([1])

    expect(hitTestMapObject(document, visible, 40, 40)).toBe(object)
    expect(hitTestMapObject(document, visible, 40 + 5.9, 40)).toBe(object)
    expect(hitTestMapObject(document, visible, 40 + 7, 40)).toBeNull()
  })

  it('skips objects rejected by the skipObject option', () => {
    const ruleObject = createObject({ id: 4, name: 'TileData', properties: { Action: 'Warp 10 11 Farm' } })
    const document = createMapDocument([createObjectGroup({ id: 1, objects: [ruleObject] })])
    const visible = new Set([1])

    expect(hitTestMapObject(document, visible, 16, 16)).toBe(ruleObject)
    expect(hitTestMapObject(document, visible, 16, 16, { skipObject: () => false })).toBe(ruleObject)
    expect(hitTestMapObject(document, visible, 16, 16, { skipObject: (object) => object.name === 'TileData' })).toBeNull()
  })
})
