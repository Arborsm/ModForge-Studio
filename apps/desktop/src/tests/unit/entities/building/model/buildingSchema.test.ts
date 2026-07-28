import { describe, expect, it } from 'vite-plus/test'
import { parseAssetEntry, serializeAssetEntry, setAssetField, validateAssetEntries } from '@entities/asset-schema'
import {
  addBuildingEntry,
  BUILDING_DATA_SCHEMA,
  BUILDING_FIELD_ORDER,
  BUILDING_ID_TOKEN_PREFIX,
  displayNameFromBuildingId,
  findBuildingTexturePatchState,
  validateBuildingFootprint,
  type BuildingFootprint,
  type BuildingMaterialFields,
  type BuildingSkinFields,
} from '@entities/building'

const footprint: BuildingFootprint = { tilesWide: 3, tilesHigh: 2, builder: 'Robin' }

const barnLike = {
  Name: 'Barn',
  Description: 'Houses barn animals.',
  Texture: 'Buildings/Barn',
  Builder: 'Robin',
  BuildCost: 6000,
  BuildDays: 2,
  BuildMaterials: [
    { ItemId: '(O)388', Amount: 350 },
    { ItemId: '(O)390', Amount: 150 },
  ],
  Size: { X: 7, Y: 4 },
  HumanDoor: { X: 3, Y: 3 },
  AnimalDoor: { X: 4, Y: 3, Width: 2, Height: 1 },
  IndoorMap: 'Barn',
  MaxOccupants: 4,
  ValidOccupantTypes: ['Cow', 'Ostrich'],
  Skins: [
    {
      Id: 'Barn2',
      Name: 'Big Barn',
      Texture: 'Buildings/Big Barn',
      BuildMaterials: [{ ItemId: '(O)388', Amount: 450 }],
      'ModAuthor/SkinMarker': true,
    },
  ],
  SourceRect: { X: 0, Y: 0, Width: 112, Height: 112 },
  'ModAuthor/CustomExtension': { keep: ['me'] },
  CustomFields: { 'ModAuthor/Flag': 'yes' },
}

describe('Data/Buildings schema round-trip', () => {
  it('recognizes every vanilla-shaped key and preserves unknown ones', () => {
    const draft = parseAssetEntry(BUILDING_DATA_SCHEMA, barnLike)
    expect(draft.unknown).toEqual({ 'ModAuthor/CustomExtension': { keep: ['me'] } })
    const serialized = serializeAssetEntry(BUILDING_DATA_SCHEMA, draft)
    expect(serialized).toEqual(barnLike)
    expect(Object.keys(serialized)).toEqual(Object.keys(barnLike))
  })

  it('declares every field of the shared field order exactly once', () => {
    const schemaKeys = BUILDING_DATA_SCHEMA.fields.map((field) => field.key)
    // Fields are declared in presentation order; `keyOrder` is what serialization
    // uses, and that one has to be the game's own schema order verbatim.
    expect([...schemaKeys].sort()).toEqual([...BUILDING_FIELD_ORDER].sort())
    expect(new Set(schemaKeys).size).toBe(schemaKeys.length)
    expect(BUILDING_DATA_SCHEMA.keyOrder).toEqual([...BUILDING_FIELD_ORDER])
  })

  it('places every field in a declared group', () => {
    const groupIds = new Set(BUILDING_DATA_SCHEMA.groups.map((group) => group.id))
    expect(BUILDING_DATA_SCHEMA.fields.filter((field) => !groupIds.has(field.group))).toEqual([])
  })

  it('keeps extra keys on a skin row when one skin field is edited', () => {
    const draft = parseAssetEntry(BUILDING_DATA_SCHEMA, barnLike)
    const skins = draft.fields['Skins'] as BuildingSkinFields[]
    const nextSkins = skins.map((skin, index) => (index === 0 ? { ...skin, Name: 'Deluxe Barn' } : skin))
    const serialized = serializeAssetEntry(BUILDING_DATA_SCHEMA, setAssetField(draft, 'Skins', nextSkins))
    const serializedSkin = (serialized['Skins'] as BuildingSkinFields[])[0]!
    expect(serializedSkin.Name).toBe('Deluxe Barn')
    expect(serializedSkin['ModAuthor/SkinMarker']).toBe(true)
    expect(serializedSkin.BuildMaterials).toEqual([{ ItemId: '(O)388', Amount: 450 }])
  })

  it('removes the BuildMaterials field entirely when the list becomes empty', () => {
    const draft = parseAssetEntry(BUILDING_DATA_SCHEMA, barnLike)
    expect('BuildMaterials' in serializeAssetEntry(BUILDING_DATA_SCHEMA, setAssetField(draft, 'BuildMaterials', undefined))).toBe(false)
  })

  it('keeps a point written with only one axis through an unrelated edit', () => {
    const draft = parseAssetEntry(BUILDING_DATA_SCHEMA, { Name: 'Shed', Size: { X: 3, Y: 2 }, DrawOffset: { X: 4 } })
    const edited = serializeAssetEntry(BUILDING_DATA_SCHEMA, setAssetField(draft, 'BuildDays', 3))
    expect(edited['DrawOffset']).toEqual({ X: 4 })
    expect(edited['BuildDays']).toBe(3)
  })

  it('reports a missing Name and a non-positive Size through the schema rules', () => {
    const codes = validateAssetEntries(BUILDING_DATA_SCHEMA, { Shed: { Size: { X: 0, Y: 2 } } }).map((issue) => issue.code)
    expect(codes).toContain('requiredMissing')
    expect(codes).toContain('buildingSizeInvalid')
  })
})

describe('validateBuildingFootprint', () => {
  it('requires whole positive tile counts', () => {
    expect(validateBuildingFootprint(footprint)).toBeNull()
    expect(validateBuildingFootprint({ ...footprint, tilesWide: 0 })).toBe('sizeNotPositive')
    expect(validateBuildingFootprint({ ...footprint, tilesHigh: -1 })).toBe('sizeNotPositive')
    expect(validateBuildingFootprint({ ...footprint, tilesWide: 2.5 })).toBe('sizeNotPositive')
  })
})

describe('displayNameFromBuildingId', () => {
  it('strips the mod id token and falls back to the raw id', () => {
    expect(displayNameFromBuildingId(`${BUILDING_ID_TOKEN_PREFIX}Aviary`)).toBe('Aviary')
    expect(displayNameFromBuildingId('Barn')).toBe('Barn')
    expect(displayNameFromBuildingId('{{ModId}}_')).toBe('{{ModId}}_')
  })
})

describe('addBuildingEntry', () => {
  it('creates a placeable entry that already passes schema validation', () => {
    const result = addBuildingEntry({}, `  ${BUILDING_ID_TOKEN_PREFIX}Aviary  `, footprint)
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.buildingId).toBe(`${BUILDING_ID_TOKEN_PREFIX}Aviary`)
    const entry = result.entries[`${BUILDING_ID_TOKEN_PREFIX}Aviary`] as Record<string, unknown>
    expect(entry['Name']).toBe('Aviary')
    expect(entry['Size']).toEqual({ X: 3, Y: 2 })
    expect(entry['Builder']).toBe('Robin')
    expect(entry['Texture']).toBe(`Buildings/${BUILDING_ID_TOKEN_PREFIX}Aviary`)
    expect(entry['BuildMaterials'] as BuildingMaterialFields[]).toEqual([])
    expect(validateAssetEntries(BUILDING_DATA_SCHEMA, result.entries)).toEqual([])
  })

  it('omits Builder when the building is not sold by a carpenter', () => {
    const result = addBuildingEntry({}, 'Aviary', { ...footprint, builder: '  ' })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect('Builder' in (result.entries['Aviary'] as Record<string, unknown>)).toBe(false)
  })

  it('rejects blank ids, case-insensitive duplicates and unplaceable footprints', () => {
    expect(addBuildingEntry({}, '   ', footprint)).toEqual({ ok: false, error: 'empty' })
    expect(addBuildingEntry({ Aviary: {} }, 'aviary', footprint)).toEqual({ ok: false, error: 'duplicate' })
    expect(addBuildingEntry({}, 'Aviary', { ...footprint, tilesHigh: 0 })).toEqual({ ok: false, error: 'sizeNotPositive' })
  })
})

describe('findBuildingTexturePatchState', () => {
  const virtualAssets = [{ relativePath: 'assets/aviary.png' }]

  it('matches Load/EditImage patches case-insensitively and normalizes slashes', () => {
    const state = findBuildingTexturePatchState(
      [
        { action: 'EditData', target: 'Data/Buildings' },
        { action: 'Load', target: 'buildings\\{{ModId}}_Aviary', fromFile: 'assets/aviary.png', logName: 'Aviary sheet' },
      ],
      'Buildings/{{ModId}}_Aviary',
      virtualAssets,
    )
    expect(state.patchFound).toBe(true)
    expect(state.patchAction).toBe('Load')
    expect(state.patchLogName).toBe('Aviary sheet')
    expect(state.fromFile).toBe('assets/aviary.png')
    expect(state.fileInDraft).toBe(true)
    expect(state.assetTarget).toBe('Buildings/{{ModId}}_Aviary')
  })

  it('reports missing patches and files not present in the draft', () => {
    const missing = findBuildingTexturePatchState([], 'Buildings/Aviary', virtualAssets)
    expect(missing.patchFound).toBe(false)
    expect(missing.fromFile).toBeNull()
    expect(missing.fileInDraft).toBe(false)

    const noFile = findBuildingTexturePatchState(
      [{ action: 'EditImage', target: 'Buildings/Aviary', fromFile: 'assets/other.png' }],
      'Buildings/Aviary',
      virtualAssets,
    )
    expect(noFile.patchFound).toBe(true)
    expect(noFile.fileInDraft).toBe(false)
  })

  it('ignores non-image patch actions for the same target', () => {
    const state = findBuildingTexturePatchState([{ action: 'EditData', target: 'Buildings/Aviary' }], 'Buildings/Aviary', virtualAssets)
    expect(state.patchFound).toBe(false)
  })
})
