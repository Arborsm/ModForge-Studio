import { describe, expect, test } from 'vite-plus/test'
import { getAssetSchema, registerAssetSchema } from '@entities/asset-schema'

describe('asset schema registry', () => {
  test('exact match wins and ignores case and slash direction', () => {
    registerAssetSchema({ assetId: 'Data/CompatTestExact', keyOrder: [], groups: [], fields: [] })
    expect(getAssetSchema('data/compatTestExact')).toBeDefined()
    expect(getAssetSchema('Data\\CompatTestExact')).toBeDefined()
  })

  test('wildcard schema matches targets under its prefix', () => {
    registerAssetSchema({ assetId: 'compat.test.Wildcard/*', keyOrder: [], groups: [], fields: [] })
    expect(getAssetSchema('compat.test.Wildcard/Objects')).toBeDefined()
    expect(getAssetSchema('Compat.Test.Wildcard/Nested/Deep')).toBeDefined()
    expect(getAssetSchema('compat.test.Wildcard')).toBeUndefined()
    expect(getAssetSchema('compat.test.Other/Objects')).toBeUndefined()
  })

  test('exact match takes precedence over wildcard', () => {
    registerAssetSchema({ assetId: 'compat.test.Wildcard/Special', keyOrder: ['Exact'], groups: [], fields: [] })
    expect(getAssetSchema('compat.test.Wildcard/Special')?.keyOrder).toEqual(['Exact'])
  })
})
