import { describe, expect, it } from 'vite-plus/test'
import {
  countAssetIssues,
  fieldsInGroup,
  formatIssuePath,
  indexAssetFields,
  matchEnumValue,
  parseAssetEditorState,
  parseAssetEntry,
  registerEnumCatalog,
  serializeAssetEditorState,
  serializeAssetEntry,
  setAssetField,
  setNestedValue,
  validateAssetEntries,
  validateAssetEntry,
  type AssetSchema,
} from '@entities/asset-schema'

registerEnumCatalog('test.season', ['Spring', 'Summer', 'Fall', 'Winter'])

const schema: AssetSchema = {
  assetId: 'Test/Asset',
  keyOrder: ['Name', 'Season', 'Count', 'Homes', 'Shadow'],
  groups: [
    { id: 'main', labelKey: 'character.core' },
    { id: 'extra', labelKey: 'character.advanced' },
  ],
  fields: [
    { key: 'Name', group: 'main', control: 'text', labelKey: 'character.displayName', required: true },
    { key: 'Season', group: 'main', control: 'enum', enumCatalog: 'test.season', labelKey: 'character.birthSeason' },
    {
      key: 'Count',
      group: 'main',
      control: 'number',
      labelKey: 'character.birthDay',
      validate: (value, context) =>
        typeof value === 'number' && value > 10
          ? [{ severity: 'warning', code: 'tooBig', messageKey: 'character.birthDayRange', path: context.path, params: { value } }]
          : [],
    },
    {
      key: 'Homes',
      group: 'extra',
      control: 'nested_list',
      labelKey: 'character.home',
      itemSchema: [{ key: 'Direction', group: 'extra', control: 'enum', enumCatalog: 'test.season', labelKey: 'character.homeDirection' }],
    },
    {
      key: 'Shadow',
      group: 'extra',
      control: 'nested_object',
      labelKey: 'character.shadow',
      itemSchema: [{ key: 'Scale', group: 'extra', control: 'number', labelKey: 'character.shadowScale', required: true }],
    },
  ],
}

const entry = {
  Name: 'Aspen',
  'ModAuthor/Custom': { keep: ['me'] },
  Season: 'Fall',
  Count: 3,
  Homes: [{ Direction: 'Spring', 'ModAuthor/Marker': true }],
}

describe('parseAssetEntry / serializeAssetEntry', () => {
  it('round-trips an entry, preserving unknown keys and key order', () => {
    const draft = parseAssetEntry(schema, entry)
    expect(draft.unknown).toEqual({ 'ModAuthor/Custom': { keep: ['me'] } })
    const serialized = serializeAssetEntry(schema, draft)
    expect(serialized).toEqual(entry)
    expect(Object.keys(serialized)).toEqual(Object.keys(entry))
  })

  it('omits removed fields and appends newly set fields in schema order', () => {
    let draft = parseAssetEntry(schema, entry)
    draft = setAssetField(draft, 'Count', undefined)
    draft = setAssetField(draft, 'Shadow', { Scale: 2 })
    const serialized = serializeAssetEntry(schema, draft)
    expect('Count' in serialized).toBe(false)
    expect(serialized['Shadow']).toEqual({ Scale: 2 })
    expect(serialized['ModAuthor/Custom']).toEqual({ keep: ['me'] })
    expect(Object.keys(serialized).at(-1)).toBe('Shadow')
  })

  it('keeps explicit null values, which mean "game default" rather than "absent"', () => {
    const serialized = serializeAssetEntry(schema, parseAssetEntry(schema, { Name: 'Aspen', Season: null }))
    expect('Season' in serialized).toBe(true)
    expect(serialized['Season']).toBeNull()
  })

  it('parses non-object payloads as an empty draft', () => {
    for (const raw of [null, undefined, 'text', 42, ['x']]) {
      const draft = parseAssetEntry(schema, raw)
      expect(draft.fields).toEqual({})
      expect(draft.unknown).toEqual({})
      expect(serializeAssetEntry(schema, draft)).toEqual({})
    }
  })
})

describe('setNestedValue', () => {
  it('sets and removes keys, dropping the object once it is empty', () => {
    expect(setNestedValue({ Scale: 1 }, 'Offset', { X: 1 })).toEqual({ Scale: 1, Offset: { X: 1 } })
    expect(setNestedValue({ Scale: 1, Offset: { X: 1 } }, 'Offset', undefined)).toEqual({ Scale: 1 })
    expect(setNestedValue({ Scale: 1 }, 'Scale', undefined)).toBeUndefined()
  })
})

describe('parseAssetEditorState / serializeAssetEditorState', () => {
  it('reads camelCase entries and preserves sibling editorState keys', () => {
    const state = parseAssetEditorState({ entries: { Aspen: { Name: 'Aspen' } }, fields: ['x'] })
    expect(Object.keys(state.entries)).toEqual(['Aspen'])
    expect(state.rest).toEqual({ fields: ['x'] })
    expect(serializeAssetEditorState(state)).toEqual({ fields: ['x'], entries: { Aspen: { Name: 'Aspen' } } })
  })

  it('accepts imported PascalCase Entries and migrates them on write', () => {
    const written = serializeAssetEditorState(parseAssetEditorState({ Entries: { Aspen: { Name: 'Aspen' } } }))
    expect('Entries' in written).toBe(false)
    expect(written['entries']).toEqual({ Aspen: { Name: 'Aspen' } })
  })

  it('prefers camelCase entries when both spellings exist', () => {
    const state = parseAssetEditorState({ Entries: { Aspen: { Name: 'Old' } }, entries: { Aspen: { Name: 'New' } } })
    expect(state.entries['Aspen']).toEqual({ Name: 'New' })
  })

  it('tolerates non-object editorState', () => {
    expect(parseAssetEditorState(undefined)).toEqual({ entries: {}, rest: {} })
    expect(parseAssetEditorState('broken')).toEqual({ entries: {}, rest: {} })
  })
})

describe('matchEnumValue', () => {
  it('matches catalog values case-insensitively like the game parser', () => {
    expect(matchEnumValue(['Spring', 'Fall'], 'fall')).toBe('Fall')
    expect(matchEnumValue(['up', 'down'], 'UP')).toBe('up')
  })

  it('returns null for unknown or non-string values', () => {
    expect(matchEnumValue(['Spring'], 'Rainy')).toBeNull()
    expect(matchEnumValue(['Spring'], 3)).toBeNull()
    expect(matchEnumValue(['Spring'], null)).toBeNull()
  })
})

describe('validateAssetEntry', () => {
  it('reports missing required fields with the value path', () => {
    const issues = validateAssetEntry(schema, 'Aspen', { Season: 'Fall' })
    expect(issues).toEqual([
      { severity: 'error', code: 'requiredMissing', messageKey: 'requiredMissing', path: ['Aspen', 'Name'], params: { field: 'Name' } },
    ])
  })

  it('warns about unknown enum values but accepts case variants and integers', () => {
    expect(validateAssetEntry(schema, 'Aspen', { Name: 'A', Season: 'fall' })).toEqual([])
    expect(validateAssetEntry(schema, 'Aspen', { Name: 'A', Season: 2 })).toEqual([])
    expect(validateAssetEntry(schema, 'Aspen', { Name: 'A', Season: null })).toEqual([])
    const issues = validateAssetEntry(schema, 'Aspen', { Name: 'A', Season: 'Rainy' })
    expect(issues).toEqual([
      {
        severity: 'warning',
        code: 'enumUnknown',
        messageKey: 'enumUnknown',
        path: ['Aspen', 'Season'],
        params: { field: 'Season', value: 'Rainy' },
      },
    ])
  })

  it('runs field-level rules and recurses into nested lists and objects', () => {
    const issues = validateAssetEntry(schema, 'Aspen', {
      Name: 'A',
      Count: 42,
      Homes: [{ Direction: 'Fall' }, { Direction: 'sideways' }],
      Shadow: {},
    })
    expect(issues.map((issue) => [issue.code, formatIssuePath(issue.path)])).toEqual([
      ['tooBig', 'Aspen.Count'],
      ['enumUnknown', 'Aspen.Homes[2].Direction'],
      ['requiredMissing', 'Aspen.Shadow.Scale'],
    ])
  })
})

describe('validateAssetEntries', () => {
  it('flags case-insensitive duplicate entry ids once per extra occurrence', () => {
    const issues = validateAssetEntries(schema, { Aspen: { Name: 'A' }, aspen: { Name: 'A' } })
    expect(issues).toEqual([
      {
        severity: 'error',
        code: 'duplicateEntryKey',
        messageKey: 'duplicateEntryKey',
        path: ['aspen'],
        relatedKeys: ['Aspen'],
        params: { entryKey: 'aspen' },
      },
    ])
  })

  it('counts issues by severity', () => {
    const issues = validateAssetEntries(schema, { Aspen: {}, aspen: { Name: 'A', Season: 'Rainy' } })
    expect(countAssetIssues(issues)).toEqual({ errors: 2, warnings: 1, infos: 0, total: 3 })
  })
})

describe('schema lookups', () => {
  it('indexes fields by key and filters them by group', () => {
    expect(indexAssetFields(schema).get('Season')?.control).toBe('enum')
    expect(fieldsInGroup(schema, 'extra').map((field) => field.key)).toEqual(['Homes', 'Shadow'])
  })
})
