import { describe, expect, it } from 'vite-plus/test'
import type { AssetEntryDraft } from '@entities/asset-schema'
import { evaluateCharacterReadiness } from '@pages/workbench/workspaces/character-data/state/characterReadiness'

function draft(fields: Record<string, unknown>): AssetEntryDraft {
  return { fields, unknown: {}, keyOrder: Object.keys(fields) }
}

describe('evaluateCharacterReadiness', () => {
  it('requires identity, a valid home, and visual data', () => {
    const result = evaluateCharacterReadiness(draft({}), { issueGroups: [], hasGiftTastes: false })

    expect(result.ready).toBe(false)
    expect(result.groups.core).toBe('needs-attention')
    expect(result.groups.spawn).toBe('needs-attention')
    expect(result.groups.render).toBe('needs-attention')
  })

  it('marks a usable character ready while leaving untouched secondary tabs optional', () => {
    const result = evaluateCharacterReadiness(
      draft({
        DisplayName: 'Aspen',
        Home: [{ Location: 'Town', Tile: { X: 4, Y: 8 } }],
        TextureName: '{{ModId}}_Aspen',
      }),
      { issueGroups: [], hasGiftTastes: false },
    )

    expect(result.ready).toBe(true)
    expect(result.groups.core).toBe('complete')
    expect(result.groups.personality).toBe('optional')
    expect(result.groups.festival).toBe('optional')
  })

  it('folds gift tastes and validation findings into their owning tabs', () => {
    const result = evaluateCharacterReadiness(
      draft({
        DisplayName: 'Aspen',
        Home: [{ Location: 'Town', Tile: { X: 4, Y: 8 } }],
        Appearance: [{ Id: 'Default', Sprite: '{{ModId}}_Aspen' }],
      }),
      { issueGroups: ['render'], hasGiftTastes: true },
    )

    expect(result.groups.festival).toBe('complete')
    expect(result.groups.render).toBe('needs-attention')
    expect(result.ready).toBe(false)
  })
})
