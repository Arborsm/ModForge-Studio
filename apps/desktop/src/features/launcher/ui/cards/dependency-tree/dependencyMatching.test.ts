import { describe, expect, it } from 'vite-plus/test'
import type { LauncherLibraryItem } from '../../../model/types'
import {
  buildDependencySearchQuery,
  buildLocalDependencyLookup,
  findLocalDependency,
  getDependencyMatchKeys,
  isSmapiDependencyName,
  mergeDependencyNames,
} from './dependencyMatching'

function mod(overrides: Partial<LauncherLibraryItem>): LauncherLibraryItem {
  return {
    id: 'mod',
    labelKey: 'ModForge.Mod',
    name: 'Example Mod',
    author: null,
    version: null,
    description: null,
    uniqueId: 'ModForge.Mod',
    folderName: 'ExampleMod',
    absolutePath: '/mods/ExampleMod',
    enabled: true,
    nexusModId: null,
    updateKeys: [],
    modUrl: null,
    imageUrl: null,
    dependencies: [],
    requiredDependencies: [],
    missingRequiredDependencies: [],
    ...overrides,
  }
}

describe('dependency matching', () => {
  it('builds exact aliases from full UniqueID and dotted tail', () => {
    expect(getDependencyMatchKeys('TheMightyAmondee.CustomTokens')).toEqual(['themightyamondeecustomtokens', 'customtokens'])
  })

  it('matches local dependencies by identity before display aliases without partial UniqueID matches', () => {
    const core = mod({ id: 'core', uniqueId: 'ModForge.Core', labelKey: 'ModForge.Core', name: 'Core', folderName: 'Core' })
    const corePlus = mod({
      id: 'core-plus',
      uniqueId: 'ModForge.CorePlus',
      labelKey: 'ModForge.CorePlus',
      name: 'Core Plus',
      folderName: 'CorePlus',
    })
    const lookup = buildLocalDependencyLookup([corePlus, core], null)

    expect(findLocalDependency(lookup, 'ModForge.Core')).toBe(core)
    expect(findLocalDependency(lookup, 'Core Plus')).toBe(corePlus)
    expect(findLocalDependency(lookup, 'CoreP')).toBeNull()
  })

  it('recognizes SMAPI aliases as the loader dependency', () => {
    expect(isSmapiDependencyName('SMAPI')).toBe(true)
    expect(isSmapiDependencyName('Pathoschild.SMAPI')).toBe(true)
    expect(isSmapiDependencyName('SMAPI - Stardew Modding API')).toBe(true)
    expect(isSmapiDependencyName('Content Patcher')).toBe(false)
  })

  it('builds readable Discover search queries from UniqueID tails and display names', () => {
    expect(buildDependencySearchQuery('furypx639.CustomBush', 'furypx639.CustomBush')).toBe('Custom Bush')
    expect(buildDependencySearchQuery('Cornucopia - More Flowers', 'Cornucopia.MoreFlowers')).toBe('Cornucopia More Flowers')
  })

  it('deduplicates equivalent dependency references while preserving display order', () => {
    expect(mergeDependencyNames(['Pathoschild.SMAPI', 'SMAPI - Stardew Modding API', 'ModForge.Core', 'Core'])).toEqual([
      'Pathoschild.SMAPI',
      'ModForge.Core',
    ])
  })
})
