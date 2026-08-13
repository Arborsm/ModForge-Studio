import { describe, expect, it } from 'vite-plus/test'
import type { AssetEntryDraft } from '@entities/asset-schema'
import { evaluateBuildingReadiness } from '@pages/workbench/workspaces/building-data/state/buildingReadiness'

function draft(fields: Record<string, unknown>): AssetEntryDraft {
  return { fields, unknown: {}, keyOrder: Object.keys(fields) }
}

describe('evaluateBuildingReadiness', () => {
  it('requires readable identity, available artwork, a footprint, and a builder', () => {
    const result = evaluateBuildingReadiness(
      draft({
        Name: '[LocalizedText Strings\\Buildings:Barn_Name]',
        Description: '[LocalizedText Strings\\Buildings:Barn_Description]',
        Texture: 'Buildings/Barn',
        Size: { X: 7, Y: 4 },
        Builder: 'Robin',
      }),
      { textureAvailable: true, errorCount: 0 },
    )

    expect(result.ready).toBe(true)
    expect(result.completeRequired).toBe(4)
    expect(result.steps.filter((step) => step.status === 'needs-attention')).toEqual([])
  })

  it('does not treat a texture path without an actual image as completed artwork', () => {
    const result = evaluateBuildingReadiness(
      draft({ Name: 'Aviary', Description: 'Bird home', Texture: 'Buildings/Aviary', Size: { X: 3, Y: 2 }, Builder: 'Robin' }),
      { textureAvailable: false, errorCount: 0 },
    )

    expect(result.ready).toBe(false)
    expect(result.steps.find((step) => step.id === 'artwork')?.status).toBe('needs-attention')
  })

  it('keeps cost, interior, and upgrade as explicit optional tasks', () => {
    const result = evaluateBuildingReadiness(
      draft({ Name: 'Shed', Description: 'Storage', Texture: 'Buildings/Shed', Size: { X: 7, Y: 3 }, Builder: 'Robin' }),
      { textureAvailable: true, errorCount: 0 },
    )

    expect(result.steps.slice(4).map((step) => step.status)).toEqual(['optional', 'optional', 'optional'])
  })

  it('blocks the ready state while the active entry has validation errors', () => {
    const result = evaluateBuildingReadiness(
      draft({ Name: 'Shed', Description: 'Storage', Texture: 'Buildings/Shed', Size: { X: 7, Y: 3 }, Builder: 'Robin' }),
      { textureAvailable: true, errorCount: 1 },
    )

    expect(result.completeRequired).toBe(4)
    expect(result.ready).toBe(false)
  })
})
