import { describe, expect, it } from 'vite-plus/test'
import { parseAssetEntry, serializeAssetEntry, setAssetField, validateAssetEntries } from '@entities/asset-schema'
import {
  addCharacterEntry,
  CHARACTER_DATA_SCHEMA,
  CHARACTER_FIELD_ORDER,
  DEFAULT_HOME_DIRECTION,
  findCharacterAssetPatchState,
  HOME_DIRECTION_VALUES,
  validateHomePlacement,
  type CharacterHomeEntry,
  type CharacterHomePlacement,
} from '@entities/character'

const homePlacement: CharacterHomePlacement = {
  location: 'SeedShop',
  tileX: 1,
  tileY: 9,
  direction: DEFAULT_HOME_DIRECTION,
}

const abigailLike = {
  DisplayName: 'Abigail',
  BirthSeason: 'Fall',
  BirthDay: 13,
  HomeRegion: 'Town',
  Gender: 'Female',
  Age: 'Teen',
  Manner: 'Rude',
  SocialAnxiety: 'Outgoing',
  Optimism: 'Negative',
  CanBeRomanced: true,
  LoveInterest: 'Sebastian',
  'ModAuthor/CustomExtension': { keep: ['me'] },
  Home: [
    {
      Id: 'Default',
      Location: 'SeedShop',
      Tile: { X: 1, Y: 9 },
      Direction: 'down',
      'ModAuthor/HomeMarker': true,
    },
  ],
  UnlockConditions: null,
  CustomFields: { 'ModAuthor/Flag': 'yes' },
}

describe('Data/Characters schema round-trip', () => {
  it('recognizes every vanilla-shaped key and preserves unknown ones', () => {
    const draft = parseAssetEntry(CHARACTER_DATA_SCHEMA, abigailLike)
    expect(draft.unknown).toEqual({ 'ModAuthor/CustomExtension': { keep: ['me'] } })
    const serialized = serializeAssetEntry(CHARACTER_DATA_SCHEMA, draft)
    expect(serialized).toEqual(abigailLike)
    expect(Object.keys(serialized)).toEqual(Object.keys(abigailLike))
  })

  it('declares every field of the shared field order exactly once', () => {
    const schemaKeys = CHARACTER_DATA_SCHEMA.fields.map((field) => field.key)
    // Fields are declared in presentation order; `keyOrder` is what serialization
    // uses, and that one has to be the game's own schema order verbatim.
    expect([...schemaKeys].sort()).toEqual([...CHARACTER_FIELD_ORDER].sort())
    expect(new Set(schemaKeys).size).toBe(schemaKeys.length)
    expect(CHARACTER_DATA_SCHEMA.keyOrder).toEqual([...CHARACTER_FIELD_ORDER])
  })

  it('places every field in a declared group', () => {
    const groupIds = new Set(CHARACTER_DATA_SCHEMA.groups.map((group) => group.id))
    expect(CHARACTER_DATA_SCHEMA.fields.filter((field) => !groupIds.has(field.group))).toEqual([])
  })

  it('keeps extra keys on a home entry when one home field is edited', () => {
    const draft = parseAssetEntry(CHARACTER_DATA_SCHEMA, abigailLike)
    const homes = draft.fields['Home'] as CharacterHomeEntry[]
    const nextHomes = homes.map((home, index) => (index === 0 ? { ...home, Direction: 'left' } : home))
    const serialized = serializeAssetEntry(CHARACTER_DATA_SCHEMA, setAssetField(draft, 'Home', nextHomes))
    const serializedHome = (serialized['Home'] as CharacterHomeEntry[])[0]!
    expect(serializedHome.Direction).toBe('left')
    expect(serializedHome['ModAuthor/HomeMarker']).toBe(true)
    expect(serializedHome.Tile).toEqual({ X: 1, Y: 9 })
  })

  it('removes the Home field entirely when the list becomes empty', () => {
    const draft = parseAssetEntry(CHARACTER_DATA_SCHEMA, abigailLike)
    expect('Home' in serializeAssetEntry(CHARACTER_DATA_SCHEMA, setAssetField(draft, 'Home', undefined))).toBe(false)
  })

  it('preserves unknown enum spellings through an unrelated edit', () => {
    const draft = parseAssetEntry(CHARACTER_DATA_SCHEMA, { Gender: 'fem-custom', Age: 'Teen' })
    const edited = serializeAssetEntry(CHARACTER_DATA_SCHEMA, setAssetField(draft, 'Age', 'Adult'))
    expect(edited['Gender']).toBe('fem-custom')
    expect(edited['Age']).toBe('Adult')
  })
})

describe('validateHomePlacement', () => {
  it('requires a location and non-negative integer tiles', () => {
    expect(validateHomePlacement(homePlacement)).toBeNull()
    expect(validateHomePlacement({ ...homePlacement, location: '   ' })).toBe('locationMissing')
    expect(validateHomePlacement({ ...homePlacement, tileX: Number.NaN })).toBe('tileNotNumeric')
    expect(validateHomePlacement({ ...homePlacement, tileY: -1 })).toBe('tileNotNumeric')
    expect(validateHomePlacement({ ...homePlacement, tileX: 1.5 })).toBe('tileNotNumeric')
  })
})

describe('addCharacterEntry', () => {
  it('creates a valid entry at the requested home and strips the {{ModId}} prefix from the display name', () => {
    const result = addCharacterEntry({}, '  {{ModId}}_Aspen  ', homePlacement)
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.npcId).toBe('{{ModId}}_Aspen')
    const entry = result.entries['{{ModId}}_Aspen'] as Record<string, unknown>
    expect(entry['DisplayName']).toBe('Aspen')
    const homes = entry['Home'] as CharacterHomeEntry[]
    expect(homes).toHaveLength(1)
    expect(homes[0]!.Location).toBe('SeedShop')
    expect(homes[0]!.Tile).toEqual({ X: 1, Y: 9 })
    expect(HOME_DIRECTION_VALUES).toContain(homes[0]!.Direction)
    expect(validateAssetEntries(CHARACTER_DATA_SCHEMA, result.entries)).toEqual([])
  })

  it('rejects blank ids, case-insensitive duplicates and unusable home placements', () => {
    expect(addCharacterEntry({}, '   ', homePlacement)).toEqual({ ok: false, error: 'empty' })
    expect(addCharacterEntry({ Aspen: {} }, 'aspen', homePlacement)).toEqual({ ok: false, error: 'duplicate' })
    expect(addCharacterEntry({}, 'Aspen', { ...homePlacement, location: '' })).toEqual({ ok: false, error: 'locationMissing' })
    expect(addCharacterEntry({}, 'Aspen', { ...homePlacement, tileY: Number.NaN })).toEqual({ ok: false, error: 'tileNotNumeric' })
  })
})

describe('findCharacterAssetPatchState', () => {
  const virtualAssets = [{ relativePath: 'assets/aspen-portrait.png' }]

  it('matches Load/EditImage patches case-insensitively and normalizes slashes', () => {
    const state = findCharacterAssetPatchState(
      [
        { action: 'EditData', target: 'Data/Characters' },
        { action: 'Load', target: 'portraits\\{{ModId}}_Aspen', fromFile: 'assets/aspen-portrait.png', logName: 'Aspen portrait' },
      ],
      'Portraits',
      '{{ModId}}_Aspen',
      virtualAssets,
    )
    expect(state.patchFound).toBe(true)
    expect(state.patchAction).toBe('Load')
    expect(state.patchLogName).toBe('Aspen portrait')
    expect(state.fromFile).toBe('assets/aspen-portrait.png')
    expect(state.fileInDraft).toBe(true)
    expect(state.assetTarget).toBe('Portraits/{{ModId}}_Aspen')
  })

  it('reports missing patches and files not present in the draft', () => {
    const missing = findCharacterAssetPatchState([], 'Characters', 'Aspen', virtualAssets)
    expect(missing.patchFound).toBe(false)
    expect(missing.fromFile).toBeNull()
    expect(missing.fileInDraft).toBe(false)

    const noFile = findCharacterAssetPatchState(
      [{ action: 'EditImage', target: 'Characters/Aspen', fromFile: 'assets/other.png' }],
      'Characters',
      'Aspen',
      virtualAssets,
    )
    expect(noFile.patchFound).toBe(true)
    expect(noFile.fileInDraft).toBe(false)
  })

  it('ignores non-image patch actions for the same target', () => {
    const state = findCharacterAssetPatchState([{ action: 'EditData', target: 'Portraits/Aspen' }], 'Portraits', 'Aspen', virtualAssets)
    expect(state.patchFound).toBe(false)
  })
})
