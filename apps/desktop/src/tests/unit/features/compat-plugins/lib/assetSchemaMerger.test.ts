import { describe, expect, test } from 'vite-plus/test'
import { mergePluginAssetSchema, mergePluginAssetSchemas } from '@features/compat-plugins'
import type { AssetSchemaContribution } from '@features/compat-plugins'

function contribution(overrides: Partial<AssetSchemaContribution> = {}): AssetSchemaContribution {
  return {
    assetPath: 'spacechase0.SpaceCore/Objects',
    fields: [
      { id: 'name', path: 'Name', type: 'text', labelKey: 'spacecore.name' },
      { id: 'price', path: 'Price', type: 'number' },
      { id: 'category', path: 'Category', type: 'choice' },
      { id: 'edible', path: 'IsEdible', type: 'bool' },
      { id: 'tags', path: 'Tags', type: 'string-list' },
      { id: 'buffs', path: 'Buffs', type: 'record-list' },
      { id: 'meta', path: 'Metadata', type: 'object' },
      { id: 'custom', path: 'CustomFields', type: 'unknown-type' },
    ],
    ...overrides,
  }
}

describe('mergePluginAssetSchema', () => {
  test('maps assetPath to assetId', () => {
    const schema = mergePluginAssetSchema(contribution())
    expect(schema.assetId).toBe('spacechase0.SpaceCore/Objects')
  })

  test('keyOrder follows field declaration order', () => {
    const schema = mergePluginAssetSchema(contribution())
    expect(schema.keyOrder).toEqual(['Name', 'Price', 'Category', 'IsEdible', 'Tags', 'Buffs', 'Metadata', 'CustomFields'])
  })

  test('places all fields in a single default group', () => {
    const schema = mergePluginAssetSchema(contribution())
    expect(schema.groups).toHaveLength(1)
    expect(schema.fields.every((field) => field.group === schema.groups[0].id)).toBe(true)
  })

  test('maps plugin type strings to FieldControl kinds', () => {
    const schema = mergePluginAssetSchema(contribution())
    const controls = schema.fields.map((field) => field.control)
    expect(controls).toEqual(['text', 'number', 'enum', 'toggle', 'string_list', 'nested_list', 'nested_object', 'raw'])
  })

  test('uses field path as JSON key', () => {
    const schema = mergePluginAssetSchema(contribution())
    expect(schema.fields.map((field) => field.key)).toEqual([
      'Name',
      'Price',
      'Category',
      'IsEdible',
      'Tags',
      'Buffs',
      'Metadata',
      'CustomFields',
    ])
  })

  test('uses labelKey when provided, falls back to path', () => {
    const schema = mergePluginAssetSchema(contribution())
    expect(schema.fields[0].labelKey).toBe('spacecore.name')
    expect(schema.fields[1].labelKey).toBe('Price')
  })

  test('falls back to raw for unknown types', () => {
    const schema = mergePluginAssetSchema(contribution({ fields: [{ id: 'x', path: 'X', type: 'color' }] }))
    expect(schema.fields[0].control).toBe('raw')
  })

  test('handles empty fields list', () => {
    const schema = mergePluginAssetSchema(contribution({ fields: [] }))
    expect(schema.fields).toEqual([])
    expect(schema.keyOrder).toEqual([])
    expect(schema.groups).toHaveLength(1)
  })
})

describe('mergePluginAssetSchemas', () => {
  test('flattens contributions across multiple plugins', () => {
    const plugins = [
      { assetSchemas: [contribution({ assetPath: 'A/B' })] },
      { assetSchemas: [contribution({ assetPath: 'C/D' }), contribution({ assetPath: 'E/F' })] },
      { assetSchemas: [] },
    ]
    const schemas = mergePluginAssetSchemas(plugins)
    expect(schemas.map((schema) => schema.assetId)).toEqual(['A/B', 'C/D', 'E/F'])
  })

  test('returns empty array when no plugins contribute schemas', () => {
    expect(mergePluginAssetSchemas([{ assetSchemas: [] }, { assetSchemas: [] }])).toEqual([])
  })
})
