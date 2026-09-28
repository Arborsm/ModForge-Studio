import { describe, expect, it } from 'vite-plus/test'
import { buildItemTextureTarget, needsProjectItemTexture } from '@pages/workbench/workspaces/item-data/state/itemTextureTarget'

describe('item texture target', () => {
  it('builds a project-owned target without discarding localized identifiers', () => {
    expect(buildItemTextureTarget('Codex.物品页面验证', 'Codex.物品页面验证_Cinnamon Roll')).toBe(
      'TileSheets/Mods/Codex.物品页面验证/Items/Codex.物品页面验证_Cinnamon_Roll',
    )
  })

  it('replaces vanilla sheets but preserves an existing project target', () => {
    expect(needsProjectItemTexture('Maps/springobjects')).toBe(true)
    expect(needsProjectItemTexture('TileSheets/Objects_2')).toBe(true)
    expect(needsProjectItemTexture('Characters/Farmer/shirts')).toBe(true)
    expect(needsProjectItemTexture('TileSheets/Mods/Example.Mod/Items/CinnamonRoll')).toBe(false)
    expect(needsProjectItemTexture('Mods/Example.Mod/Items/CinnamonRoll')).toBe(false)
  })
})
