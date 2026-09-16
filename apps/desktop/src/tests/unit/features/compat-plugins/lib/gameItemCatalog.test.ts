import { describe, expect, it } from 'vite-plus/test'

import { buildGameItemOptions, gameItemSelectionPatches } from '@features/compat-plugins/lib/gameItemCatalog'
import type { CompatPluginField } from '@features/compat-plugins/api/types'
import type { ResourceRegistryEntry } from '@entities/game/api'

function itemEntry(overrides: Partial<ResourceRegistryEntry> = {}): ResourceRegistryEntry {
  return {
    id: 'item-16',
    kind: 'item',
    value: '(O)16',
    label: 'Cauliflower',
    source: 'game',
    sourceKind: 'game',
    category: 'Vegetable',
    metadata: { id: '16', name: 'Cauliflower' },
    relativePath: null,
    absolutePath: null,
    ...overrides,
  }
}

const entries: ResourceRegistryEntry[] = [
  itemEntry(),
  itemEntry({ id: 'item-24', value: '(O)24', label: 'Parsnip', metadata: { id: '24', name: 'Parsnip' } }),
  {
    id: 'actor-abigail',
    kind: 'actor',
    value: 'Abigail',
    label: 'Abigail',
    source: 'game',
    sourceKind: 'game',
    category: null,
    metadata: {},
    relativePath: null,
    absolutePath: null,
  },
  itemEntry({ id: 'item-noname', value: '(O)99', label: 'Unknown Item', metadata: { id: '99' }, category: null }),
]

describe('buildGameItemOptions', () => {
  it('filters to item entries only', () => {
    const options = buildGameItemOptions(entries)
    expect(options).toHaveLength(3)
    expect(options.find((o) => o.qualifiedId === 'Abigail')).toBeUndefined()
  })

  it('maps metadata.name as the internal name', () => {
    const options = buildGameItemOptions(entries)
    expect(options.find((o) => o.qualifiedId === '(O)16')?.name).toBe('Cauliflower')
  })

  it('falls back to metadata.id when metadata.name is absent', () => {
    const options = buildGameItemOptions(entries)
    const noName = options.find((o) => o.qualifiedId === '(O)99')
    expect(noName?.name).toBe('99')
  })

  it('carries the qualified id from value', () => {
    const options = buildGameItemOptions(entries)
    expect(options.find((o) => o.qualifiedId === '(O)24')?.id).toBe('24')
  })

  it('preserves label and category', () => {
    const options = buildGameItemOptions(entries)
    const cauliflower = options.find((o) => o.qualifiedId === '(O)16')
    expect(cauliflower?.label).toBe('Cauliflower')
    expect(cauliflower?.category).toBe('Vegetable')
  })
})

describe('gameItemSelectionPatches', () => {
  const field: CompatPluginField = {
    id: 'itemName',
    path: 'ItemName',
    type: 'game-item',
    idPath: 'ItemId',
  }

  it('writes the internal name to field.path and the id to idPath', () => {
    const patches = gameItemSelectionPatches(field, {
      id: '16',
      qualifiedId: '(O)16',
      name: 'Cauliflower',
      label: 'Cauliflower',
      category: 'Vegetable',
    })
    expect(patches).toEqual({ ItemName: 'Cauliflower', ItemId: '16' })
  })

  it('omits the id path when the field does not declare one', () => {
    const patches = gameItemSelectionPatches(
      { ...field, idPath: undefined },
      { id: '16', qualifiedId: '(O)16', name: 'Cauliflower', label: 'Cauliflower', category: 'Vegetable' },
    )
    expect(patches).toEqual({ ItemName: 'Cauliflower' })
  })
})
