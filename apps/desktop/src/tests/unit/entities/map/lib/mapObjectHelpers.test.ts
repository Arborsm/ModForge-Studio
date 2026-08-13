import { describe, expect, it } from 'vite-plus/test'
import type { EditorCopy } from '@locales/api'
import type { MapObject, MapObjectGroup, MapPropertyValue } from '@entities/map'
import {
  formatObjectPreviewMeta,
  getObjectDisplayName,
  getObjectInteractionTag,
  getObjectPropertyKeys,
  isLightMarkerObject,
  rankObjectForPreview,
} from '@entities/map'

function createObject(overrides: Partial<MapObject> = {}): MapObject {
  return {
    id: 1,
    name: '',
    type: '',
    x: 100,
    y: 200,
    width: 32,
    height: 64,
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

const mockCopy: EditorCopy = {
  common: {
    objectLabel: (id: number) => `Object #${id}`,
    type: 'Type',
    bounds: 'Bounds',
  },
} as EditorCopy

describe('getObjectDisplayName', () => {
  it('returns the object name if present', () => {
    const object = createObject({ name: 'Door' })
    expect(getObjectDisplayName(object, mockCopy)).toBe('Door')
  })

  it('falls back to type if name is empty', () => {
    const object = createObject({ name: '', type: 'Warp' })
    expect(getObjectDisplayName(object, mockCopy)).toBe('Warp')
  })

  it('falls back to the generated label if name and type are empty', () => {
    const object = createObject({ name: '', type: '', id: 42 })
    expect(getObjectDisplayName(object, mockCopy)).toBe('Object #42')
  })
})

describe('getObjectInteractionTag', () => {
  it('returns Action when both Action and TouchAction are present (Action checked first)', () => {
    const object = createObject({
      properties: { Action: 'MagicWarp Town', TouchAction: 'Warp 10 11 Farm' },
    })
    expect(getObjectInteractionTag(object)).toBe('Action')
  })

  it('returns Warp when present without Action/TouchAction', () => {
    const object = createObject({
      properties: { Warp: '1 2 Farm 10 11' },
    })
    expect(getObjectInteractionTag(object)).toBe('Warp')
  })

  it('returns NPCWarp when present', () => {
    const object = createObject({
      properties: { NPCWarp: '1 2 Town 10 11' },
    })
    expect(getObjectInteractionTag(object)).toBe('NPCWarp')
  })

  it('returns LockedDoorWarp when present', () => {
    const object = createObject({
      properties: { LockedDoorWarp: '1 2 ScienceHouse' },
    })
    expect(getObjectInteractionTag(object)).toBe('LockedDoorWarp')
  })

  it('returns MagicWarp when present', () => {
    const object = createObject({
      properties: { MagicWarp: 'WizardHouse' },
    })
    expect(getObjectInteractionTag(object)).toBe('MagicWarp')
  })

  it('returns null when no interactive property is present', () => {
    const object = createObject({
      properties: { SomeOtherKey: 'value' },
    })
    expect(getObjectInteractionTag(object)).toBeNull()
  })

  it('returns null for empty properties', () => {
    expect(getObjectInteractionTag(createObject())).toBeNull()
  })
})

describe('getObjectPropertyKeys', () => {
  it('collects unique property keys from all objects in the group', () => {
    const group = createObjectGroup({
      objects: [createObject({ properties: { foo: 'a', bar: 'b' } }), createObject({ properties: { bar: 'c', baz: 'd' } })],
    })
    const keys = getObjectPropertyKeys(group)
    expect(keys.sort()).toEqual(['bar', 'baz', 'foo'])
  })

  it('returns at most 4 keys', () => {
    const group = createObjectGroup({
      objects: [
        createObject({
          properties: { a: '1', b: '2', c: '3', d: '4', e: '5' },
        }),
      ],
    })
    expect(getObjectPropertyKeys(group)).toHaveLength(4)
  })

  it('returns an empty array when no objects have properties', () => {
    const group = createObjectGroup({
      objects: [createObject(), createObject()],
    })
    expect(getObjectPropertyKeys(group)).toEqual([])
  })
})

describe('rankObjectForPreview', () => {
  it('gives 100 points for having an interaction tag', () => {
    const object = createObject({
      properties: { Action: 'Warp 10 11 Farm' },
    })
    expect(rankObjectForPreview(object)).toBe(100)
  })

  it('gives 40 points for having a name', () => {
    const object = createObject({ name: 'Door' })
    expect(rankObjectForPreview(object)).toBe(40)
  })

  it('gives 20 points for having a type', () => {
    const object = createObject({ type: 'Building' })
    expect(rankObjectForPreview(object)).toBe(20)
  })

  it('gives 10 points for zero-sized objects', () => {
    const object = createObject({ width: 0, height: 0 })
    expect(rankObjectForPreview(object)).toBe(10)
  })

  it('stacks scores correctly', () => {
    const object = createObject({
      name: 'Door',
      type: 'Warp',
      width: 0,
      height: 0,
      properties: { Action: 'Warp 10 11 Farm' },
    })
    expect(rankObjectForPreview(object)).toBe(170)
  })

  it('returns 0 for an object with no distinguishing features', () => {
    expect(rankObjectForPreview(createObject())).toBe(0)
  })
})

describe('formatObjectPreviewMeta', () => {
  it('includes the interaction tag, type, and bounds', () => {
    const object = createObject({
      name: 'Door',
      type: 'Warp',
      properties: { Action: 'Warp 10 11 Farm' },
    })
    const result = formatObjectPreviewMeta(object, mockCopy)
    expect(result).toContain('Action')
    expect(result).toContain('Type: Warp')
    expect(result).toContain('Bounds: 100, 200 / 32 x 64')
  })

  it('omits the type segment when type is empty', () => {
    const object = createObject({
      properties: { Action: 'Warp 10 11 Farm' },
    })
    const result = formatObjectPreviewMeta(object, mockCopy)
    expect(result).not.toContain('Type:')
    expect(result).toContain('Action')
    expect(result).toContain('Bounds:')
  })

  it('rounds coordinates in bounds', () => {
    const object = createObject({
      type: 'Chest',
      x: 10.5,
      y: 20.3,
      width: 16,
      height: 16,
    })
    const result = formatObjectPreviewMeta(object, mockCopy)
    expect(result).not.toContain('Action')
    expect(result).toContain('Type: Chest')
    expect(result).toContain('Bounds: 11, 20 / 16 x 16')
  })
})

describe('isLightMarkerObject', () => {
  it('matches TileData objects carrying the MFMarker light flag', () => {
    const object = createObject({ name: 'TileData', properties: { MFMarker: 'light' } })
    expect(isLightMarkerObject(object)).toBe(true)
  })

  it('matches TileData objects with light-item properties in either casing', () => {
    const cases: Array<Record<string, MapPropertyValue>> = [
      { QualifiedItemId: '(BC)1' },
      { qualifiedItemId: '(BC)1' },
      { ItemId: '(F)torch' },
      { itemId: '(F)torch' },
      { IsOn: 'false' },
      { isOn: 'true' },
    ]
    for (const properties of cases) {
      expect(isLightMarkerObject(createObject({ name: 'TileData', properties }))).toBe(true)
    }
  })

  it('matches legacy TileData objects with no properties and a real footprint', () => {
    const object = createObject({ name: 'TileData', width: 16, height: 16, properties: {} })
    expect(isLightMarkerObject(object)).toBe(true)
  })

  it('does not match 0×0 point objects without properties', () => {
    const object = createObject({ name: 'TileData', width: 0, height: 0, properties: {} })
    expect(isLightMarkerObject(object)).toBe(false)
  })

  it('does not match TileData rule objects carrying community property keys', () => {
    const cases: Array<Record<string, MapPropertyValue>> = [{ Action: 'Warp 10 11 Farm' }, { NoSpawn: 'Farm' }, { NPCBarrier: '4 6 8 9' }]
    for (const properties of cases) {
      expect(isLightMarkerObject(createObject({ name: 'TileData', properties }))).toBe(false)
    }
  })

  it('does not match objects not named TileData even with empty properties', () => {
    const object = createObject({ name: 'Light', width: 16, height: 16, properties: {} })
    expect(isLightMarkerObject(object)).toBe(false)
  })
})
