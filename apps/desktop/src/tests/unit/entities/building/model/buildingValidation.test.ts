import { describe, expect, it } from 'vite-plus/test'
import { formatIssuePath } from '@entities/asset-schema'
import { validateBuildingEntries } from '@entities/building'

/** A schema-clean entry, so each case only reports what it is about. */
function building(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return { Name: 'Aviary', Size: { X: 3, Y: 3 }, ...fields }
}

function codes(entries: Record<string, unknown>, context?: Parameters<typeof validateBuildingEntries>[1]) {
  return validateBuildingEntries(entries, context).map((issue) => issue.code)
}

describe('validateBuildingEntries · build materials', () => {
  // `loadBuildingMaterialItemIds` unqualifies every id it indexes, so the rule
  // only has to resolve the author's spelling back to that form.
  const knownItemIds = ['388', '390']

  it('accepts qualified and unqualified spellings of a known item', () => {
    const entries = {
      Aviary: building({
        BuildMaterials: [
          { ItemId: '(O)388', Amount: 10 },
          { ItemId: '390', Amount: 5 },
        ],
      }),
    }
    expect(validateBuildingEntries(entries, { knownItemIds })).toEqual([])
  })

  it('warns about a material the project cannot resolve', () => {
    const entries = { Aviary: building({ BuildMaterials: [{ ItemId: '(O)9999', Amount: 1 }] }) }
    const issues = validateBuildingEntries(entries, { knownItemIds })
    expect(issues.map((issue) => [issue.severity, issue.code, formatIssuePath(issue.path)])).toEqual([
      ['warning', 'buildingMaterialItemUnknown', 'Aviary.BuildMaterials[1].ItemId'],
    ])
  })

  it('stays quiet about unknown items when the game directory is not connected', () => {
    expect(codes({ Aviary: building({ BuildMaterials: [{ ItemId: '(O)9999', Amount: 1 }] }) })).toEqual([])
  })

  it('checks a skin override list with the same rule', () => {
    const entries = {
      Aviary: building({ Skins: [{ Id: 'Deluxe', BuildMaterials: [{ ItemId: '(O)9999', Amount: 1 }] }] }),
    }
    const issues = validateBuildingEntries(entries, { knownItemIds })
    expect(issues.map((issue) => formatIssuePath(issue.path))).toEqual(['Aviary.Skins[1].BuildMaterials[1].ItemId'])
  })

  it('warns about a material row the game would drop', () => {
    expect(codes({ Aviary: building({ BuildMaterials: [{ ItemId: '(O)388', Amount: 0 }] }) })).toEqual(['buildingMaterialAmountInvalid'])
  })
})

describe('validateBuildingEntries · skins', () => {
  it('rejects a duplicate skin id and points at the first occurrence', () => {
    const entries = { Aviary: building({ Skins: [{ Id: 'Deluxe' }, { Id: 'deluxe' }] }) }
    const issues = validateBuildingEntries(entries)
    expect(issues.map((issue) => [issue.severity, issue.code, formatIssuePath(issue.path)])).toEqual([
      ['error', 'buildingSkinIdDuplicate', 'Aviary.Skins[2].Id'],
    ])
    expect(issues[0]!.params?.['index']).toBe(1)
  })

  it('accepts distinct skin ids', () => {
    expect(codes({ Aviary: building({ Skins: [{ Id: 'Deluxe' }, { Id: 'Rustic' }] }) })).toEqual([])
  })
})

describe('validateBuildingEntries · upgrade chain', () => {
  it('accepts a linear chain inside the patch', () => {
    const entries = {
      Coop: building(),
      BigCoop: building({ BuildingToUpgrade: 'Coop' }),
      DeluxeCoop: building({ BuildingToUpgrade: 'BigCoop' }),
    }
    expect(validateBuildingEntries(entries)).toEqual([])
  })

  it('reports every entry on a cycle and lists the rest of the loop as related keys', () => {
    const entries = {
      Alpha: building({ BuildingToUpgrade: 'Gamma' }),
      Beta: building({ BuildingToUpgrade: 'Alpha' }),
      Gamma: building({ BuildingToUpgrade: 'Beta' }),
    }
    const issues = validateBuildingEntries(entries).filter((issue) => issue.code === 'buildingUpgradeChainCycle')
    expect(issues.map((issue) => formatIssuePath(issue.path)).sort()).toEqual([
      'Alpha.BuildingToUpgrade',
      'Beta.BuildingToUpgrade',
      'Gamma.BuildingToUpgrade',
    ])
    expect(issues.every((issue) => issue.severity === 'error')).toBe(true)
    const alpha = issues.find((issue) => issue.path[0] === 'Alpha')!
    expect([...(alpha.relatedKeys ?? [])].sort()).toEqual(['Beta', 'Gamma'])
  })

  it('reports a building that upgrades itself', () => {
    const issues = validateBuildingEntries({ Aviary: building({ BuildingToUpgrade: 'aviary' }) })
    expect(issues.map((issue) => issue.code)).toEqual(['buildingUpgradeChainCycle'])
    expect(issues[0]!.relatedKeys).toEqual([])
  })

  it('does not mistake a shared upgrade target for a cycle', () => {
    const entries = {
      Coop: building(),
      BigCoop: building({ BuildingToUpgrade: 'Coop' }),
      WideCoop: building({ BuildingToUpgrade: 'Coop' }),
    }
    expect(validateBuildingEntries(entries)).toEqual([])
  })

  it('mentions an upgrade target that exists in neither the patch nor the game', () => {
    const issues = validateBuildingEntries({ BigCoop: building({ BuildingToUpgrade: 'Coop' }) }, { knownBuildingKeys: ['Barn'] })
    expect(issues.map((issue) => [issue.severity, issue.code])).toEqual([['info', 'buildingUpgradeTargetUnknown']])
  })

  it('accepts an upgrade target that only the game provides', () => {
    expect(codes({ BigCoop: building({ BuildingToUpgrade: 'coop' }) }, { knownBuildingKeys: ['Coop'] })).toEqual([])
  })
})

describe('validateBuildingEntries · placement', () => {
  it('rejects door tiles outside the footprint', () => {
    const entries = {
      Aviary: building({ Size: { X: 3, Y: 3 }, HumanDoor: { X: 3, Y: 0 }, UpgradeSignTile: { X: -1, Y: 0 } }),
    }
    const issues = validateBuildingEntries(entries)
    expect(issues.map((issue) => [issue.code, formatIssuePath(issue.path)])).toEqual([
      ['buildingTileOutOfBounds', 'Aviary.HumanDoor'],
      ['buildingTileOutOfBounds', 'Aviary.UpgradeSignTile'],
    ])
  })

  it('accepts door tiles on the footprint edge', () => {
    expect(codes({ Aviary: building({ HumanDoor: { X: 2, Y: 2 }, AnimalDoor: { X: 0, Y: 2, Width: 1, Height: 1 } }) })).toEqual([])
  })

  it('rejects an additional placement tile that reserves nothing', () => {
    const entries = { Aviary: building({ AdditionalPlacementTiles: [{ TileArea: { X: 0, Y: 3, Width: 0, Height: 1 } }] }) }
    const issues = validateBuildingEntries(entries)
    expect(issues.map((issue) => [issue.code, formatIssuePath(issue.path)])).toEqual([
      ['buildingPlacementTileEmptyArea', 'Aviary.AdditionalPlacementTiles[1].TileArea'],
    ])
  })

  it('notes an additional placement tile already covered by the footprint', () => {
    const entries = { Aviary: building({ AdditionalPlacementTiles: [{ TileArea: { X: 0, Y: 0, Width: 2, Height: 2 } }] }) }
    expect(validateBuildingEntries(entries).map((issue) => [issue.severity, issue.code])).toEqual([
      ['info', 'buildingPlacementTileRedundant'],
    ])
  })

  it('accepts an additional placement tile reserving ground outside the footprint', () => {
    expect(codes({ Aviary: building({ AdditionalPlacementTiles: [{ TileArea: { X: 0, Y: 3, Width: 3, Height: 1 } }] }) })).toEqual([])
  })
})

describe('validateBuildingEntries · interior', () => {
  const knownMapAssets = ['Maps/Barn', 'Maps/{{ModId}}_Aviary']

  it('accepts an indoor map the project ships, written either way', () => {
    expect(codes({ Aviary: building({ IndoorMap: 'Barn' }) }, { knownMapAssets })).toEqual([])
    expect(codes({ Aviary: building({ IndoorMap: 'Maps/{{ModId}}_Aviary' }) }, { knownMapAssets })).toEqual([])
  })

  it('warns about an indoor map that is nowhere in the project', () => {
    const issues = validateBuildingEntries({ Aviary: building({ IndoorMap: 'Nowhere' }) }, { knownMapAssets })
    expect(issues.map((issue) => [issue.severity, issue.code, formatIssuePath(issue.path)])).toEqual([
      ['warning', 'buildingIndoorMapMissing', 'Aviary.IndoorMap'],
    ])
  })

  it('stays quiet about indoor maps when no map index is available', () => {
    expect(codes({ Aviary: building({ IndoorMap: 'Nowhere' }) })).toEqual([])
  })

  it('warns when occupants have no interior to live in', () => {
    const issues = validateBuildingEntries({ Aviary: building({ MaxOccupants: 4 }) })
    expect(issues.map((issue) => [issue.code, formatIssuePath(issue.path)])).toEqual([
      ['buildingOccupantsWithoutInterior', 'Aviary.MaxOccupants'],
    ])
  })

  it('accepts occupants living in a non-instanced location', () => {
    expect(codes({ Aviary: building({ MaxOccupants: 4, NonInstancedIndoorLocation: 'FarmHouse' }) })).toEqual([])
  })
})
