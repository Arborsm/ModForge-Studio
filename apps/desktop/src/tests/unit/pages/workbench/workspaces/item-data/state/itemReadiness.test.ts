import { describe, expect, it } from 'vite-plus/test'
import type { AssetEntryDraft } from '@entities/asset-schema'
import { evaluateItemReadiness } from '@pages/workbench/workspaces/item-data/state/itemReadiness'

function draft(fields: Record<string, unknown>): AssetEntryDraft {
  return { fields, unknown: {}, keyOrder: Object.keys(fields) }
}

describe('evaluateItemReadiness', () => {
  it('requires player-facing identity and a valid sprite index', () => {
    const result = evaluateItemReadiness(draft({}), { issueGroups: [] })

    expect(result.ready).toBe(false)
    expect(result.groups.basics).toBe('needs-attention')
    expect(result.groups.sprite).toBe('needs-attention')
  })

  it('marks secondary item systems optional when untouched', () => {
    const result = evaluateItemReadiness(draft({ Name: 'CinnamonRoll', DisplayName: 'Cinnamon Roll', Type: 'Basic', SpriteIndex: 0 }), {
      issueGroups: [],
    })

    expect(result.ready).toBe(true)
    expect(result.groups.basics).toBe('complete')
    expect(result.groups.economy).toBe('optional')
    expect(result.groups.consumable).toBe('optional')
    expect(result.groups.geode).toBe('optional')
  })

  it('folds validation findings into their owning tab', () => {
    const result = evaluateItemReadiness(
      draft({ Name: 'CinnamonRoll', DisplayName: 'Cinnamon Roll', Type: 'Basic', SpriteIndex: 0, Price: 120 }),
      { issueGroups: ['economy'] },
    )

    expect(result.groups.economy).toBe('needs-attention')
    expect(result.ready).toBe(false)
  })
})
