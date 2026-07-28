import { describe, expect, it } from 'vite-plus/test'
import { parseAssetEntry, serializeAssetEntry, setAssetField } from '@entities/asset-schema'
import {
  addObjectEntry,
  createMinimalObjectEntry,
  DEFAULT_OBJECT_ENTRY_SEED,
  displayNameFromObjectId,
  OBJECT_DATA_SCHEMA,
  OBJECT_FIELD_ORDER,
  OBJECT_INEDIBLE,
  validateObjectEntries,
} from '@entities/item'

/** A shipped `Data/Objects` record, plus the unknown keys a mod may add. */
const cheeseLike = {
  Name: 'Cheese',
  DisplayName: '[LocalizedText Strings\\Objects:Cheese_Name]',
  Description: '[LocalizedText Strings\\Objects:Cheese_Description]',
  Type: 'Basic',
  Category: -26,
  Price: 230,
  Texture: null,
  SpriteIndex: 424,
  Edibility: 50,
  IsDrink: false,
  Buffs: [
    {
      Id: 'Farming',
      BuffId: null,
      Duration: 120,
      CustomAttributes: { FarmingLevel: 1, Speed: 0 },
      CustomFields: { 'ModAuthor/Flag': 'yes' },
    },
  ],
  GeodeDropsDefaultItems: false,
  GeodeDrops: null,
  ArtifactSpotChances: null,
  CanBeGivenAsGift: true,
  CanBeTrashed: true,
  ExcludeFromFishingCollection: false,
  ExcludeFromShippingCollection: false,
  ExcludeFromRandomSale: false,
  ContextTags: ['cheese_item', 'color_yellow'],
  CustomFields: { 'ModAuthor/Note': 'kept' },
  'ModAuthor/CustomExtension': { keep: ['me'] },
}

function issueCodes(entries: Record<string, unknown>, knownTextureAssets?: readonly string[]): string[] {
  return validateObjectEntries(entries, knownTextureAssets ? { knownTextureAssets } : {}).map((issue) => issue.code)
}

describe('Data/Objects schema round-trip', () => {
  it('recognizes every vanilla-shaped key and preserves unknown ones', () => {
    const draft = parseAssetEntry(OBJECT_DATA_SCHEMA, cheeseLike)

    expect(draft.fields['Name']).toBe('Cheese')
    expect(draft.fields['Category']).toBe(-26)
    expect(draft.fields['ContextTags']).toEqual(['cheese_item', 'color_yellow'])
    expect(Object.keys(draft.unknown)).toContain('ModAuthor/CustomExtension')
    expect(Object.keys(draft.unknown)).not.toContain('CustomFields')
  })

  it('serializes back to the same record, in game key order', () => {
    const draft = parseAssetEntry(OBJECT_DATA_SCHEMA, cheeseLike)
    const serialized = serializeAssetEntry(OBJECT_DATA_SCHEMA, draft) as Record<string, unknown>

    expect(serialized).toEqual(cheeseLike)
    const knownKeys = Object.keys(serialized).filter((key) => OBJECT_FIELD_ORDER.includes(key))
    expect(knownKeys).toEqual(OBJECT_FIELD_ORDER.filter((key) => key in cheeseLike))
  })

  it('keeps an edited field and every neighbouring key', () => {
    const draft = parseAssetEntry(OBJECT_DATA_SCHEMA, cheeseLike)
    const next = setAssetField(draft, 'Price', 500)
    const serialized = serializeAssetEntry(OBJECT_DATA_SCHEMA, next) as Record<string, unknown>

    expect(serialized['Price']).toBe(500)
    expect(serialized['ModAuthor/CustomExtension']).toEqual({ keep: ['me'] })
    expect(serialized['Buffs']).toEqual(cheeseLike.Buffs)
  })
})

describe('object entry creation', () => {
  it('derives a readable display name from the id', () => {
    expect(displayNameFromObjectId('Aspen.Bakery_CinnamonRoll')).toBe('Cinnamon Roll')
    expect(displayNameFromObjectId('CinnamonRoll')).toBe('Cinnamon Roll')
    expect(displayNameFromObjectId('Cheese')).toBe('Cheese')
  })

  it('writes only the keys the game reads on load', () => {
    const entry = createMinimalObjectEntry('Aspen_Cake', { ...DEFAULT_OBJECT_ENTRY_SEED, price: 120, spriteIndex: 12 })

    expect(entry['Name']).toBe('Aspen_Cake')
    expect(entry['DisplayName']).toBe('Cake')
    expect(entry['Type']).toBe('Basic')
    expect(entry['Price']).toBe(120)
    expect(entry['SpriteIndex']).toBe(12)
    expect(entry['Edibility']).toBe(OBJECT_INEDIBLE)
  })

  it('rejects blank and case-insensitively duplicate ids', () => {
    const entries = { Cheese: cheeseLike }

    expect(addObjectEntry(entries, '  ', DEFAULT_OBJECT_ENTRY_SEED)).toEqual({ ok: false, error: 'empty' })
    expect(addObjectEntry(entries, 'cheese', DEFAULT_OBJECT_ENTRY_SEED)).toEqual({ ok: false, error: 'duplicate' })

    const added = addObjectEntry(entries, ' Aspen_Cake ', DEFAULT_OBJECT_ENTRY_SEED)
    expect(added.ok).toBe(true)
    if (added.ok) {
      expect(added.objectId).toBe('Aspen_Cake')
      expect(Object.keys(added.entries)).toEqual(['Cheese', 'Aspen_Cake'])
      // A blank texture keeps the vanilla sheet, so the key is dropped entirely.
      expect('Texture' in (added.entries['Aspen_Cake'] as Record<string, unknown>)).toBe(false)
    }
  })
})

describe('Data/Objects validation', () => {
  it('accepts a shipped record', () => {
    expect(issueCodes({ Cheese: cheeseLike })).toEqual([])
  })

  it('reports the fields the game needs to load an object', () => {
    const codes = issueCodes({ Broken: { Description: 'no name, no type, no sprite' } })

    expect(codes.filter((code) => code === 'requiredMissing')).toHaveLength(4)
  })

  it('warns about a negative price and flags an unusual category as information', () => {
    const issues = validateObjectEntries({ Cheese: { ...cheeseLike, Price: -5, Category: -4242 } })

    expect(issues.find((issue) => issue.code === 'objectPriceNegative')?.severity).toBe('warning')
    expect(issues.find((issue) => issue.code === 'objectCategoryUnusual')?.severity).toBe('info')
  })

  it('rejects a sprite index outside the sheet', () => {
    expect(issueCodes({ Cheese: { ...cheeseLike, SpriteIndex: -1 } })).toContain('objectSpriteIndexInvalid')
    expect(issueCodes({ Cheese: { ...cheeseLike, SpriteIndex: 4.5 } })).toContain('objectSpriteIndexInvalid')
    expect(issueCodes({ Cheese: { ...cheeseLike, SpriteIndex: 0 } })).not.toContain('objectSpriteIndexInvalid')
  })

  it('treats an edibility below the sentinel as a mistake, not as a penalty', () => {
    expect(issueCodes({ Cheese: { ...cheeseLike, Edibility: OBJECT_INEDIBLE } })).not.toContain('objectEdibilityBelowSentinel')
    expect(issueCodes({ Cheese: { ...cheeseLike, Edibility: OBJECT_INEDIBLE - 1 } })).toContain('objectEdibilityBelowSentinel')
  })

  it('reports buffs an inedible object can never apply, and duplicate buff ids', () => {
    const inedible = issueCodes({ Cheese: { ...cheeseLike, Edibility: OBJECT_INEDIBLE } })
    expect(inedible).toContain('objectBuffsWithoutEdibility')

    const duplicated = validateObjectEntries({
      Cheese: { ...cheeseLike, Buffs: [{ Id: 'Farming' }, { Id: 'farming' }] },
    })
    const duplicate = duplicated.find((issue) => issue.code === 'objectBuffIdDuplicate')
    expect(duplicate?.severity).toBe('error')
    expect(duplicate?.path).toEqual(['Cheese', 'Buffs', 1, 'Id'])
  })

  it('checks a geode drop against its siblings', () => {
    const codes = issueCodes({
      Geode: {
        ...cheeseLike,
        GeodeDrops: [{ Id: 'first', MinStack: 5, MaxStack: 2 }, { Id: 'second', Chance: 0 }, { Id: 'FIRST' }],
      },
    })

    expect(codes).toContain('objectGeodeStackRangeInvalid')
    expect(codes).toContain('objectGeodeChanceUnreachable')
    expect(codes).toContain('objectGeodeDropIdDuplicate')
  })

  it('checks the shape and the values of ArtifactSpotChances', () => {
    expect(issueCodes({ Cheese: { ...cheeseLike, ArtifactSpotChances: [] } })).toContain('objectArtifactSpotChancesShape')

    const issues = validateObjectEntries({ Cheese: { ...cheeseLike, ArtifactSpotChances: { Farm: 0, Town: 0.5 } } })
    const invalid = issues.find((issue) => issue.code === 'objectArtifactSpotChanceInvalid')
    expect(invalid?.path).toEqual(['Cheese', 'ArtifactSpotChances', 'Farm'])
    expect(issues.filter((issue) => issue.code === 'objectArtifactSpotChanceInvalid')).toHaveLength(1)
  })

  it('rejects two entries claiming one internal name', () => {
    const issues = validateObjectEntries({
      Cheese: cheeseLike,
      Aspen_Cheese: { ...cheeseLike, Name: 'cheese' },
    })
    const duplicate = issues.find((issue) => issue.code === 'objectInternalNameDuplicate')

    expect(duplicate?.path).toEqual(['Aspen_Cheese', 'Name'])
    expect(duplicate?.relatedKeys).toEqual(['Cheese'])
  })

  it('reports an unresolvable texture only once the known sheets are known', () => {
    const entry = { Cheese: { ...cheeseLike, Texture: 'Aspen/Sheet' } }

    expect(issueCodes(entry)).not.toContain('objectTextureMissing')
    expect(issueCodes(entry, ['Maps/springobjects'])).toContain('objectTextureMissing')
    expect(issueCodes(entry, ['maps/springobjects', 'Aspen/Sheet'])).not.toContain('objectTextureMissing')
  })
})
