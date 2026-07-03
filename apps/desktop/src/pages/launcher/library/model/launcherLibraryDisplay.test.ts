import { describe, expect, it } from 'vite-plus/test'
import type { LauncherLibraryItem, LauncherVirtualFolder } from '@features/launcher/model/types'
import {
  applyCustomOrder,
  buildLauncherFolderPreviewItems,
  buildLibraryCardMeta,
  computeLibraryRevealBatchSize,
  deriveLibraryViewKey,
  encodeCustomItemKey,
  getPackModIds,
  shortenLibraryPath,
  sortLibraryMods,
} from './launcherLibraryDisplay'

function mod(overrides: Partial<LauncherLibraryItem>): LauncherLibraryItem {
  return {
    id: overrides.id ?? 'mod-1',
    labelKey: overrides.labelKey ?? overrides.name ?? 'Mod.One',
    name: overrides.name ?? 'Mod One',
    author: overrides.author ?? null,
    version: overrides.version ?? null,
    description: overrides.description ?? null,
    uniqueId: overrides.uniqueId ?? overrides.labelKey ?? overrides.name ?? 'Mod.One',
    folderName: overrides.folderName ?? overrides.name ?? 'Mod One',
    absolutePath: overrides.absolutePath ?? `E:\\Mods\\${overrides.folderName ?? overrides.name ?? 'Mod One'}`,
    enabled: overrides.enabled ?? true,
    nexusModId: overrides.nexusModId ?? null,
    updateKeys: overrides.updateKeys ?? [],
    modUrl: overrides.modUrl ?? null,
    imageUrl: overrides.imageUrl ?? null,
    dependencies: overrides.dependencies ?? [],
    requiredDependencies: overrides.requiredDependencies ?? [],
    missingRequiredDependencies: overrides.missingRequiredDependencies ?? [],
    ...overrides,
  }
}

function folder(overrides: Partial<LauncherVirtualFolder>): LauncherVirtualFolder {
  return {
    id: overrides.id ?? 'folder-1',
    name: overrides.name ?? 'Folder One',
    packId: overrides.packId ?? null,
    hidden: overrides.hidden ?? false,
    parentFolderId: overrides.parentFolderId ?? null,
    modKeys: overrides.modKeys ?? [],
    coverModKeys: overrides.coverModKeys ?? [],
  }
}

describe('launcherLibraryDisplay', () => {
  it('shortens long library paths to the last three segments', () => {
    expect(shortenLibraryPath('E:/Games/Stardew Valley/Mods')).toBe('...\\Games\\Stardew Valley\\Mods')
    expect(shortenLibraryPath('E:\\Mods')).toBe('E:\\Mods')
  })

  it('sorts enabled mods first while preserving name order inside enabled groups', () => {
    const items = [
      mod({ id: 'b', name: 'Beta', enabled: false }),
      mod({ id: 'a', name: 'Alpha', enabled: true }),
      mod({ id: 'c', name: 'Core', enabled: true }),
    ]

    expect(sortLibraryMods(items, 'enabled-first').map((item) => item.id)).toEqual(['a', 'c', 'b'])
  })

  it('uses name order as the custom sort fallback before explicit custom order is applied', () => {
    const items = [mod({ id: 'b', name: 'Beta' }), mod({ id: 'a', name: 'Alpha' })]

    expect(sortLibraryMods(items, 'custom').map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('applies known custom order keys and appends unknown items to the end', () => {
    const items = [
      mod({ id: 'a', name: 'Alpha', uniqueId: 'Mod.Alpha' }),
      mod({ id: 'b', name: 'Beta', uniqueId: 'Mod.Beta' }),
      mod({ id: 'c', name: 'Core', uniqueId: 'Mod.Core' }),
    ]

    const ordered = applyCustomOrder(items, ['m:Mod.Beta', 'm:Missing', 'm:Mod.Alpha'], (item) =>
      encodeCustomItemKey('mod', item.uniqueId ?? item.labelKey),
    )

    expect(ordered.map((item) => item.id)).toEqual(['b', 'a', 'c'])
  })

  it('derives stable custom-order view keys for hidden, current pack, and all views', () => {
    expect(deriveLibraryViewKey({ hiddenViewOpen: true, scopeMode: 'current-pack', currentPackId: 'farm' })).toBe('hidden')
    expect(deriveLibraryViewKey({ hiddenViewOpen: false, scopeMode: 'current-pack', currentPackId: 'farm' })).toBe('pack:farm')
    expect(deriveLibraryViewKey({ hiddenViewOpen: false, scopeMode: 'all', currentPackId: 'farm' })).toBe('all')
  })

  it('builds compact card meta from author and version', () => {
    expect(buildLibraryCardMeta(mod({ author: 'ConcernedApe', version: '1.2.3' }), 'None')).toBe('ConcernedApe · v1.2.3')
    expect(buildLibraryCardMeta(mod({ author: 'ConcernedApe', version: null }), 'None')).toBe('ConcernedApe')
    expect(buildLibraryCardMeta(mod({ author: null, version: null }), 'None')).toBe('None')
  })

  it('maps pack mod keys back to launcher mod ids', () => {
    const items = [mod({ id: 'a', uniqueId: 'Mod.Alpha' }), mod({ id: 'b', uniqueId: 'Mod.Beta' })]

    expect(getPackModIds({ id: 'pack', name: 'Pack', modKeys: ['mod.beta'], folderClassificationMode: 'global' }, items)).toEqual(['b'])
  })

  it('uses mods first and child folders as remaining folder preview slots', () => {
    const preview = buildLauncherFolderPreviewItems(
      [mod({ id: 'a', name: 'Alpha', imageUrl: 'alpha.png' }), mod({ id: 'b', name: 'Beta' })],
      [
        folder({ id: 'nested-a', name: 'Nested A' }),
        folder({ id: 'nested-b', name: 'Nested B' }),
        folder({ id: 'nested-c', name: 'Nested C' }),
      ],
    )

    expect(preview).toEqual([
      { kind: 'mod', id: 'a', title: 'Alpha', imageUrl: 'alpha.png' },
      { kind: 'mod', id: 'b', title: 'Beta', imageUrl: null },
      { kind: 'folder', id: 'nested-a', title: 'Nested A' },
      { kind: 'folder', id: 'nested-b', title: 'Nested B' },
    ])
  })

  it('keeps reveal batch size bounded for large grids', () => {
    expect(
      computeLibraryRevealBatchSize({
        itemCount: 100,
        viewportWidth: 1200,
        viewportHeight: 800,
        cardWidth: 260,
        cardHeight: 226,
      }),
    ).toBeLessThanOrEqual(4)
  })
})
