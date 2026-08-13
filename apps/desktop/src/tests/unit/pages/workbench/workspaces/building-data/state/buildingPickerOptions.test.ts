import { describe, expect, it } from 'vite-plus/test'
import type { MapAssetSummary } from '@entities/game/api'
import type { ItemWorkspaceEntry } from '@entities/item'
import {
  buildMaterialOptions,
  buildTextureRefOptions,
  findMapAssetByName,
  mapAssetNameFromSummary,
} from '@pages/workbench/workspaces/building-data/state/buildingPickerOptions'

const FARM_ASSET: MapAssetSummary = {
  id: 'farm',
  name: 'Farm',
  fileName: 'Farm.xnb',
  format: 'xnb',
  absolutePath: 'C:\\Game\\Content\\Maps\\Farm.xnb',
  relativePath: 'Content\\Maps\\Farm.xnb',
  sizeBytes: 123,
}

describe('building picker options', () => {
  it('maps scanned map paths to logical asset names', () => {
    expect(mapAssetNameFromSummary(FARM_ASSET)).toBe('Maps/Farm')
    expect(findMapAssetByName('maps\\farm', [FARM_ASSET])).toBe(FARM_ASSET)
  })

  it('attaches loaded texture previews by normalized asset name', () => {
    expect(buildTextureRefOptions(['Buildings/Barn'], 'Content', { 'buildings/barn': 'blob:barn' })).toEqual([
      {
        value: 'Buildings/Barn',
        label: 'Barn',
        category: 'Buildings',
        detail: 'Buildings/Barn',
        preview: 'blob:barn',
        sourceKind: 'game',
      },
    ])
    expect(buildTextureRefOptions(['Buildings/Custom'], 'Content', {}, ['Buildings/Custom'])[0]?.sourceKind).toBe('project')
  })

  it('uses canonical qualified ids while accepting the legacy bare id as an alias', () => {
    const item = {
      itemId: '388',
      qualifiedItemId: '(O)388',
      displayName: 'Wood',
      internalName: 'Wood',
      kind: 'object',
      kindMetaLabel: 'Basic',
      textureAssetName: null,
      spriteIndex: 388,
      menuSpriteIndex: null,
      spriteWidth: 16,
      spriteHeight: 16,
    } as ItemWorkspaceEntry
    expect(buildMaterialOptions([item], {})).toEqual([
      {
        value: '(O)388',
        aliases: ['388'],
        label: 'Wood',
        category: 'Basic',
        detail: undefined,
        sourceKind: 'catalog',
        sprite: undefined,
      },
    ])
  })
})
