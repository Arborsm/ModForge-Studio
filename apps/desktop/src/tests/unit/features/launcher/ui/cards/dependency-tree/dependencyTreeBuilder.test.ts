import { describe, expect, it } from 'vite-plus/test'
import type { LauncherDiscoverDetail, LauncherLibraryItem } from '@features/launcher/model/types'
import { buildLauncherDependencyTree } from '@features/launcher/ui/cards/dependency-tree/dependencyTreeBuilder'
import type { DependencyTreeCopy } from '@features/launcher/ui/cards/dependency-tree/dependencyTreeTypes'

const copy: DependencyTreeCopy = {
  localRequirement: 'Local manifest',
  remoteRequirement: 'Nexus requirement',
  externalRequirement: 'External requirement',
  modLoaderRequirement: 'Mod loader',
  missing: 'Missing',
  satisfied: 'Satisfied',
  optional: 'Optional',
  disabled: 'Disabled',
  dependencyIssue: 'Dependency issue',
  loading: 'Loading',
  loadError: 'Load error',
  cycle: 'Cycle',
}

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
    hasConfig: true,
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

function remote(overrides: Partial<LauncherDiscoverDetail>): LauncherDiscoverDetail {
  return {
    modId: 100,
    title: 'Remote Mod',
    summary: null,
    author: null,
    version: null,
    modUrl: 'https://www.nexusmods.com/stardewvalley/mods/100',
    imageUrl: null,
    galleryImages: [],
    requirements: [],
    files: [],
    ...overrides,
  }
}

describe('dependency tree builder', () => {
  it('merges local UniqueID dependencies with matching Nexus requirement names', () => {
    const consumer = mod({
      id: 'consumer',
      uniqueId: 'XiaoLeiWen.ImmersiveFamily',
      requiredDependencies: ['TheMightyAmondee.CustomTokens'],
      missingRequiredDependencies: ['TheMightyAmondee.CustomTokens'],
    })
    const tree = buildLauncherDependencyTree({
      mod: consumer,
      remote: remote({
        requirements: [
          {
            name: 'Custom Tokens',
            notes: 'Required',
            url: 'https://www.nexusmods.com/stardewvalley/mods/2400',
            modId: 2400,
            external: false,
          },
        ],
      }),
      libraryMods: [consumer],
      remoteDependencyDetails: {},
      copy,
      rootImageUrl: null,
    })

    expect(tree.items).toHaveLength(1)
    expect(tree.items[0]?.name).toBe('TheMightyAmondee.CustomTokens')
    expect(tree.items[0]?.meta).toContain('Local manifest')
    expect(tree.items[0]?.meta).toContain('Nexus requirement')
    expect(tree.items[0]?.modId).toBe(2400)
  })

  it('inherits optional state through local children and keeps them out of issue counts', () => {
    const consumer = mod({
      id: 'consumer',
      uniqueId: 'ModForge.OptionalConsumer',
      dependencies: [{ uniqueId: 'ModForge.OptionalProvider', required: false }],
    })
    const provider = mod({
      id: 'provider',
      name: 'Optional Provider',
      uniqueId: 'ModForge.OptionalProvider',
      dependencies: [{ uniqueId: 'ModForge.OptionalCore', required: true }],
      requiredDependencies: ['ModForge.OptionalCore'],
      missingRequiredDependencies: ['ModForge.OptionalCore'],
    })
    const tree = buildLauncherDependencyTree({
      mod: consumer,
      remote: null,
      libraryMods: [consumer, provider],
      remoteDependencyDetails: {},
      copy,
      rootImageUrl: null,
    })

    expect(tree.issueCount).toBe(0)
    expect(tree.items[0]?.statusKind).toBe('optional')
    expect(tree.items[0]?.children[0]?.statusKind).toBe('optional')
  })

  it('loads remote child requirements into the tree and exposes the next loadable mod id', () => {
    const tree = buildLauncherDependencyTree({
      mod: null,
      remote: remote({
        requirements: [{ name: 'Remote Core', notes: 'Required', modId: 2400, external: false }],
      }),
      libraryMods: [],
      remoteDependencyDetails: {
        2400: {
          state: 'ready',
          detail: remote({
            modId: 2400,
            title: 'Remote Core',
            requirements: [{ name: 'Remote Child', notes: 'Required', modId: 2500, external: false }],
          }),
        },
      },
      copy,
      rootImageUrl: null,
    })

    expect(tree.items[0]?.children[0]?.name).toBe('Remote Child')
    expect(tree.items[0]?.children[0]?.loadable).toBe(true)
    expect(Array.from(tree.loadableModIds)).toContain(2500)
  })

  it('renders external off-site requirement names instead of their notes', () => {
    const contentPatcher = mod({
      id: 'content-patcher',
      name: 'Content Patcher',
      uniqueId: 'Pathoschild.ContentPatcher',
      nexusModId: 1915,
    })
    const tree = buildLauncherDependencyTree({
      mod: null,
      remote: remote({
        requirements: [
          {
            name: 'Nexus #1915',
            notes: 'REQUIRED',
            url: 'https://www.nexusmods.com/stardewvalley/mods/1915',
            modId: 1915,
            external: true,
          },
        ],
      }),
      libraryMods: [contentPatcher],
      remoteDependencyDetails: {},
      copy,
      rootImageUrl: null,
    })

    expect(tree.items[0]?.name).toBe('Content Patcher')
    expect(tree.items[0]?.meta).toContain('External requirement')
    expect(tree.items[0]?.meta).toContain('REQUIRED')
    expect(tree.items[0]?.statusKind).toBe('satisfied')
  })

  it('loads external off-site requirement details when the mod id is known', () => {
    const loadingTree = buildLauncherDependencyTree({
      mod: null,
      remote: remote({
        requirements: [
          {
            name: 'Nexus #1915',
            notes: 'REQUIRED',
            url: 'https://www.nexusmods.com/stardewvalley/mods/1915',
            modId: 1915,
            external: true,
          },
        ],
      }),
      libraryMods: [],
      remoteDependencyDetails: {},
      copy,
      rootImageUrl: null,
    })

    expect(loadingTree.items[0]?.name).toBe('Nexus #1915')
    expect(loadingTree.items[0]?.statusKind).toBe('external')
    expect(loadingTree.items[0]?.loadable).toBe(true)
    expect(Array.from(loadingTree.loadableModIds)).toContain(1915)

    const readyTree = buildLauncherDependencyTree({
      mod: null,
      remote: remote({
        requirements: [
          {
            name: 'Nexus #1915',
            notes: 'REQUIRED',
            url: 'https://www.nexusmods.com/stardewvalley/mods/1915',
            modId: 1915,
            external: true,
          },
        ],
      }),
      libraryMods: [],
      remoteDependencyDetails: {
        1915: {
          state: 'ready',
          detail: remote({
            modId: 1915,
            title: 'Content Patcher',
            version: '2.9.1',
          }),
        },
      },
      copy,
      rootImageUrl: null,
    })

    expect(readyTree.items[0]?.name).toBe('Content Patcher')
    expect(readyTree.items[0]?.statusKind).toBe('external')
    expect(readyTree.items[0]?.loadable).toBe(false)
    expect(readyTree.items[0]?.version).toBe('2.9.1')
  })

  it('marks cycles, disabled, transitive, missing, and SMAPI loader states', () => {
    const consumer = mod({
      id: 'consumer',
      uniqueId: 'ModForge.Consumer',
      requiredDependencies: ['ModForge.Provider', 'ModForge.Missing', 'Pathoschild.SMAPI'],
      missingRequiredDependencies: ['ModForge.Provider', 'ModForge.Missing', 'Pathoschild.SMAPI'],
    })
    const provider = mod({
      id: 'provider',
      name: 'Provider',
      uniqueId: 'ModForge.Provider',
      enabled: false,
      requiredDependencies: ['ModForge.Consumer'],
      missingRequiredDependencies: ['ModForge.Consumer'],
    })
    const tree = buildLauncherDependencyTree({
      mod: consumer,
      remote: remote({
        requirements: [{ name: 'Pathoschild.SMAPI', notes: '4.4.0 or later', modId: 2400, external: false }],
      }),
      libraryMods: [consumer, provider],
      remoteDependencyDetails: {},
      copy,
      rootImageUrl: null,
    })

    expect(tree.items.find((item) => item.name === 'Provider')?.statusKind).toBe('disabled')
    expect(tree.items.find((item) => item.name === 'ModForge.Missing')?.statusKind).toBe('missing')
    expect(tree.items.find((item) => item.name === 'Pathoschild.SMAPI')?.status).toBe('Mod loader')
    expect(tree.items.find((item) => item.name === 'Provider')?.children[0]?.statusKind).toBe('cycle')
    expect(tree.issueCount).toBe(2)
  })

  it('deduplicates references that resolve to the same mod under different spellings', () => {
    const catalogue = mod({
      id: 'catalogue',
      name: 'OB7 Furni Catalogue',
      uniqueId: 'OB7.FurniCatalogue',
      nexusModId: 23073,
    })
    const consumer = mod({
      id: 'consumer',
      uniqueId: 'OB7.KichFurni',
      dependencies: [{ uniqueId: 'FurniCatalogue', required: true }],
    })
    const tree = buildLauncherDependencyTree({
      mod: consumer,
      remote: remote({
        requirements: [
          {
            name: 'OB7 Furni Catalogue',
            notes: 'Required',
            url: 'https://www.nexusmods.com/stardewvalley/mods/23073',
            modId: 23073,
            external: false,
          },
        ],
      }),
      libraryMods: [consumer, catalogue],
      remoteDependencyDetails: {},
      copy,
      rootImageUrl: null,
    })

    expect(tree.items).toHaveLength(1)
    expect(tree.items[0]?.id).toBe('root:OB7.KichFurni:ob7furnicatalogue:23073')
    expect(tree.items[0]?.name).toBe('OB7 Furni Catalogue')
    expect(tree.items[0]?.statusKind).toBe('satisfied')
  })
})
