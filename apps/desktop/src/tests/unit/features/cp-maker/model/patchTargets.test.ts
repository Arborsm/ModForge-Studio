import { describe, expect, it } from 'vite-plus/test'
import { listAssetSchemaIds, registerAssetSchema, VANILLA_DATA_TARGETS } from '@entities/asset-schema'
import { listPatchTargetSuggestions } from '@features/cp-maker'

/** Assets Stardew Valley 1.6 renamed or removed; offering them writes a dead patch. */
const RETIRED_TARGETS = [
  'Data/BigCraftablesInformation',
  'Data/ClothingInformation',
  'Data/BundleSets',
  'Data/MineCarts',
  'Data/Events/BeachNightMarket',
  'Maps/IslandEast',
  'TileSheets/animals',
]

describe('add-patch target suggestions', () => {
  it('offers every asset that already has a structured editor', () => {
    registerAssetSchema({ assetId: 'Data/PatchTargetsProbe', keyOrder: [], groups: [], fields: [] })

    const suggestions = listPatchTargetSuggestions('EditData', 'mods')
    for (const assetId of listAssetSchemaIds()) {
      expect(suggestions).toContain(assetId)
    }
  })

  it('leaves out targets the 1.6 update retired', () => {
    const everything = (['EditData', 'EditImage', 'EditMap', 'Load'] as const).flatMap((action) =>
      listPatchTargetSuggestions(action, 'mods'),
    )
    for (const retired of RETIRED_TARGETS) {
      expect(everything).not.toContain(retired)
    }
  })

  it('spells the lowercase vanilla assets the way the game ships them', () => {
    const suggestions = listPatchTargetSuggestions('EditData', 'mods')
    expect(suggestions).toContain('Data/mail')
    expect(suggestions).toContain('Data/hats')
    expect(suggestions).toContain('Data/animationDescriptions')
  })

  it('narrows suggestions to the assets a workspace authors', () => {
    expect([...listPatchTargetSuggestions('EditData', 'mail')].sort()).toEqual(['Data/TriggerActions', 'Data/mail'])
    expect(listPatchTargetSuggestions('EditData', 'events').every((target) => target.startsWith('Data/Events/'))).toBe(true)
    expect(listPatchTargetSuggestions('EditData', 'schedules').every((target) => target.startsWith('Characters/schedules/'))).toBe(true)
    expect(listPatchTargetSuggestions('EditData', 'schedules')).toContain('Characters/schedules/Abigail')
  })

  it('keeps per-NPC dialogue and schedule files out of the character workspace', () => {
    const characters = listPatchTargetSuggestions('EditData', 'characters')
    expect(characters).toContain('Data/Characters')
    expect(characters).not.toContain('Characters/Dialogue/Abigail')
    expect(characters).not.toContain('Characters/schedules/Abigail')
  })

  it('never repeats a target, whatever the registry spells it as', () => {
    registerAssetSchema({ assetId: 'data/OBJECTS', keyOrder: [], groups: [], fields: [] })

    const suggestions = listPatchTargetSuggestions('EditData', 'items')
    const keys = suggestions.map((target) => target.toLowerCase())
    expect(new Set(keys).size).toBe(keys.length)
    // The registered spelling wins, because that is the one with an editor.
    expect(suggestions).toContain('data/OBJECTS')
    expect(suggestions).not.toContain('Data/Objects')
  })

  it('reaches the whole vanilla data catalog when no workspace filter applies', () => {
    const suggestions = listPatchTargetSuggestions('EditData', 'mods')
    for (const target of VANILLA_DATA_TARGETS) {
      expect(suggestions.some((candidate) => candidate.toLowerCase() === target.toLowerCase())).toBe(true)
    }
  })
})
