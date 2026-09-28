import { describe, expect, it } from 'vite-plus/test'
import { formatIssuePath, parseAssetEntry, serializeAssetEntry, setAssetField } from '@entities/asset-schema'
import {
  buildCharacterAppearanceVariants,
  CHARACTER_DATA_SCHEMA,
  validateCharacterEntries,
  type CharacterAppearanceEntry,
} from '@entities/character'

const aspenWithVariants = {
  DisplayName: 'Aspen',
  TextureName: '{{ModId}}_Aspen',
  Appearance: [
    {
      Id: 'Winter',
      Season: 'Winter',
      Condition: 'WEATHER Here Snow',
      Indoors: false,
      Outdoors: true,
      Portrait: 'Portraits/{{ModId}}_Aspen_Winter',
      Sprite: 'Characters/{{ModId}}_Aspen_Winter',
      Precedence: -10,
      Weight: 2,
      'ModAuthor/VariantNote': 'keep me',
    },
    {
      Id: 'Beach',
      IsIslandAttire: true,
      Portrait: 'Portraits/{{ModId}}_Aspen_Beach',
    },
  ],
}

describe('Appearance schema round-trip', () => {
  it('parses Appearance as a structured list and writes it back unchanged', () => {
    const draft = parseAssetEntry(CHARACTER_DATA_SCHEMA, aspenWithVariants)
    const variants = draft.fields['Appearance'] as CharacterAppearanceEntry[]
    expect(variants).toHaveLength(2)
    expect(variants[0]!.Season).toBe('Winter')
    expect(variants[0]!.Condition).toBe('WEATHER Here Snow')
    expect(variants[0]!.Precedence).toBe(-10)
    expect(draft.unknown).toEqual({})
    expect(serializeAssetEntry(CHARACTER_DATA_SCHEMA, draft)).toEqual(aspenWithVariants)
  })

  it('keeps third-party keys on a variant when one variant field is edited', () => {
    const draft = parseAssetEntry(CHARACTER_DATA_SCHEMA, aspenWithVariants)
    const variants = draft.fields['Appearance'] as CharacterAppearanceEntry[]
    const edited = variants.map((variant, index) => (index === 0 ? { ...variant, Season: 'Fall' } : variant))
    const serialized = serializeAssetEntry(CHARACTER_DATA_SCHEMA, setAssetField(draft, 'Appearance', edited))
    const winter = (serialized['Appearance'] as CharacterAppearanceEntry[])[0]!
    expect(winter.Season).toBe('Fall')
    expect(winter['ModAuthor/VariantNote']).toBe('keep me')
    expect(winter.Condition).toBe('WEATHER Here Snow')
  })

  it('drops the Appearance field when the last variant is removed', () => {
    const draft = parseAssetEntry(CHARACTER_DATA_SCHEMA, aspenWithVariants)
    // The nested-list control clears a field by committing `undefined`, so the
    // key disappears and the game default applies again.
    const serialized = serializeAssetEntry(CHARACTER_DATA_SCHEMA, setAssetField(draft, 'Appearance', undefined))
    expect('Appearance' in serialized).toBe(false)
  })
})

describe('Appearance validation', () => {
  it('accepts the sample variants', () => {
    expect(validateCharacterEntries({ Aspen: aspenWithVariants })).toEqual([])
  })

  it('requires an id on every variant', () => {
    const issues = validateCharacterEntries({
      Aspen: { DisplayName: 'Aspen', Appearance: [{ Portrait: 'Portraits/Aspen_Alt' }] },
    })
    expect(issues.map((issue) => [issue.code, formatIssuePath(issue.path)])).toEqual([['requiredMissing', 'Aspen.Appearance[1].Id']])
  })

  it('reports duplicate ids case-insensitively and points at the first occurrence', () => {
    const issues = validateCharacterEntries({
      Aspen: {
        DisplayName: 'Aspen',
        Appearance: [
          { Id: 'Winter', Sprite: 'Characters/A' },
          { Id: 'winter', Sprite: 'Characters/B' },
        ],
      },
    })
    expect(issues.map((issue) => [issue.severity, issue.code, issue.params?.['index']])).toEqual([['error', 'appearanceIdDuplicate', 1]])
  })

  it('warns about variants that swap no texture and variants excluded everywhere', () => {
    const issues = validateCharacterEntries({
      Aspen: {
        DisplayName: 'Aspen',
        Appearance: [{ Id: 'Empty' }, { Id: 'Nowhere', Sprite: 'Characters/A', Indoors: false, Outdoors: false }],
      },
    })
    expect(issues.map((issue) => [issue.severity, issue.code])).toEqual([
      ['warning', 'appearanceNoTexture'],
      ['warning', 'appearanceNeverVisible'],
    ])
  })

  it('warns when a weight can never be drawn', () => {
    const issues = validateCharacterEntries({
      Aspen: { DisplayName: 'Aspen', Appearance: [{ Id: 'Zero', Sprite: 'Characters/A', Weight: 0 }] },
    })
    expect(issues.map((issue) => [issue.severity, issue.code])).toEqual([['warning', 'appearanceWeightNonPositive']])
  })
})

describe('buildCharacterAppearanceVariants', () => {
  it('always starts with the default textures derived from the texture name', () => {
    const variants = buildCharacterAppearanceVariants('Aspen', 'Custom_Aspen', [])
    expect(variants).toHaveLength(1)
    expect(variants[0]!.kind).toBe('default')
    expect(variants[0]!.portraitAssetName).toBe('Portraits/Custom_Aspen')
    expect(variants[0]!.spriteAssetName).toBe('Characters/Custom_Aspen')
  })

  it('carries condition, season and selection weights onto each variant', () => {
    const variants = buildCharacterAppearanceVariants('Aspen', 'Aspen', aspenWithVariants.Appearance)
    expect(variants.map((variant) => variant.id)).toEqual(['default', 'Winter', 'Beach'])
    const winter = variants[1]!
    expect(winter.season).toBe('Winter')
    expect(winter.condition).toBe('WEATHER Here Snow')
    expect(winter.outdoors).toBe(true)
    expect(winter.precedence).toBe(-10)
    expect(winter.weight).toBe(2)
    expect(winter.portraitAssetName).toBe('Portraits/{{ModId}}_Aspen_Winter')
  })

  it('falls back to the base textures for whatever a variant leaves unset', () => {
    const beach = buildCharacterAppearanceVariants('Aspen', 'Aspen', aspenWithVariants.Appearance)[2]!
    expect(beach.portraitAssetName).toBe('Portraits/{{ModId}}_Aspen_Beach')
    expect(beach.spriteAssetName).toBe('Characters/Aspen')
    expect(beach.isIslandAttire).toBe(true)
    expect(beach.precedence).toBe(0)
    expect(beach.weight).toBe(1)
  })
})
