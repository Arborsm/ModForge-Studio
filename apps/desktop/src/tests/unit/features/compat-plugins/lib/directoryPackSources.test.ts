import { describe, expect, it } from 'vite-plus/test'

import {
  collectContentPackRoots,
  collectDirectoryPackSourceRoots,
  compatEntryKey,
  groupEntriesBySource,
  isPathWithinDirectory,
} from '@features/compat-plugins/lib/directoryPackSources'
import type { ScannedProjectLike } from '@features/compat-plugins/lib/resolveTargetModRoot'

const projects: ScannedProjectLike[] = [
  {
    uniqueId: 'PeacefulEnd.AlternativeTextures',
    absolutePath: '/game/Mods/AlternativeTextures',
    name: 'Alternative Textures',
    folderName: 'AlternativeTextures',
  },
  {
    uniqueId: 'Pathoschild.ContentPatcher',
    absolutePath: '/game/Mods/ContentPatcher',
    name: 'Content Patcher',
    folderName: 'ContentPatcher',
  },
  {
    uniqueId: 'DustBeauty.IndustrialFurniture',
    absolutePath: '/game/Mods/[AT] DustBeauty Industrial',
    contentPackFor: 'PeacefulEnd.AlternativeTextures',
    name: "DustBeauty's Industrial Furniture",
    folderName: '[AT] DustBeauty Industrial',
  },
  {
    uniqueId: 'Another.ATPack',
    absolutePath: '/game/Mods/[AT] AnotherPack',
    contentPackFor: 'peacefulend.alternativetextures',
    name: 'Another AT Pack',
    folderName: '[AT] AnotherPack',
  },
  {
    uniqueId: 'Unrelated.Mod',
    absolutePath: '/game/Mods/Unrelated',
    contentPackFor: 'SomeOther.Mod',
    name: 'Unrelated',
    folderName: 'Unrelated',
  },
  { uniqueId: null, absolutePath: '/game/Mods/NoManifest', folderName: 'NoManifest' },
]

const targetIds = ['PeacefulEnd.AlternativeTextures']

describe('collectContentPackRoots', () => {
  it('collects content packs whose ContentPackFor matches any target id', () => {
    const roots = collectContentPackRoots(projects, targetIds)
    expect(roots.map((r) => r.modName)).toEqual(["DustBeauty's Industrial Furniture", 'Another AT Pack'])
  })

  it('matches ContentPackFor case-insensitively and trims surrounding whitespace', () => {
    const roots = collectContentPackRoots(projects, ['  PEACEFUL END.ALTERNATIVETEXTURES '])
    // Internal whitespace is preserved (not a real id); only surrounding
    // whitespace is trimmed, so this does not match.
    expect(roots).toHaveLength(0)
    // The real id with different casing and surrounding whitespace matches.
    expect(collectContentPackRoots(projects, ['  peacefulend.alternativetextures  '])).toHaveLength(2)
  })

  it('returns empty when no content packs target the mod', () => {
    expect(collectContentPackRoots(projects, ['Missing.Mod'])).toEqual([])
  })

  it('returns empty for an empty target id list', () => {
    expect(collectContentPackRoots(projects, [])).toEqual([])
  })

  it('deduplicates content packs by path', () => {
    const dup = {
      uniqueId: 'Dup.ATPack',
      absolutePath: '/game/Mods/[AT] AnotherPack',
      contentPackFor: 'PeacefulEnd.AlternativeTextures',
      name: 'Dup',
      folderName: '[AT] AnotherPack',
    }
    const roots = collectContentPackRoots([...projects, dup], targetIds)
    expect(roots.filter((r) => r.modName === 'Dup')).toHaveLength(0)
  })

  it('skips projects without ContentPackFor', () => {
    const roots = collectContentPackRoots(projects, targetIds)
    expect(roots.find((r) => r.modName === 'Alternative Textures')).toBeUndefined()
  })
})

describe('collectDirectoryPackSourceRoots', () => {
  it('lists the target mod first, then content packs', () => {
    const roots = collectDirectoryPackSourceRoots(projects, targetIds)
    expect(roots.map((r) => r.modName)).toEqual(['Alternative Textures', "DustBeauty's Industrial Furniture", 'Another AT Pack'])
  })

  it('returns empty when the target mod is not installed', () => {
    expect(collectDirectoryPackSourceRoots(projects, ['Missing.Mod'])).toEqual([])
  })

  it('returns empty for an empty target id list', () => {
    expect(collectDirectoryPackSourceRoots(projects, [])).toEqual([])
  })

  it('falls back to a historical UniqueID declared later in targets', () => {
    const roots = collectDirectoryPackSourceRoots(projects, [
      'PeacefulAlternativeTextures.AlternativeTextures',
      'PeacefulEnd.AlternativeTextures',
    ])
    expect(roots[0].modName).toBe('Alternative Textures')
  })
})

describe('compatEntryKey', () => {
  it('combines normalized source root and entry id', () => {
    expect(compatEntryKey({ sourceModRoot: '/game/Mods/AT', id: 'Anchor' })).toBe('/game/mods/at::Anchor')
  })

  it('treats different source roots as different keys', () => {
    expect(compatEntryKey({ sourceModRoot: '/mods/A', id: 'X' })).not.toBe(compatEntryKey({ sourceModRoot: '/mods/B', id: 'X' }))
  })
})

describe('groupEntriesBySource', () => {
  const entries = [
    { sourceModRoot: '/mods/A', sourceModName: 'A', id: '1' },
    { sourceModRoot: '/mods/B', sourceModName: 'B', id: '2' },
    { sourceModRoot: '/mods/A', sourceModName: 'A', id: '3' },
  ]

  it('groups entries by source root preserving first-seen order', () => {
    const groups = groupEntriesBySource(entries)
    expect(groups.map((g) => g.sourceModName)).toEqual(['A', 'B'])
    expect(groups[0].entries.map((e) => e.id)).toEqual(['1', '3'])
    expect(groups[1].entries.map((e) => e.id)).toEqual(['2'])
  })

  it('returns an empty list for no entries', () => {
    expect(groupEntriesBySource([])).toEqual([])
  })

  it('produces a single group when all entries share one source', () => {
    const groups = groupEntriesBySource([
      { sourceModRoot: '/mods/A', sourceModName: 'A', id: '1' },
      { sourceModRoot: '/mods/A', sourceModName: 'A', id: '2' },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].entries).toHaveLength(2)
  })
})

describe('isPathWithinDirectory', () => {
  it('accepts a child path nested under the parent', () => {
    expect(isPathWithinDirectory('/game/Mods', '/game/Mods/AT')).toBe(true)
  })

  it('rejects the parent directory itself', () => {
    expect(isPathWithinDirectory('/game/Mods', '/game/Mods')).toBe(false)
  })

  it('rejects a sibling that shares a prefix but is not nested', () => {
    expect(isPathWithinDirectory('/game/Mods', '/game/ModsExtra')).toBe(false)
  })

  it('rejects a path outside the parent', () => {
    expect(isPathWithinDirectory('/game/Mods', '/game/Content')).toBe(false)
  })

  it('normalizes backslashes to forward slashes', () => {
    expect(isPathWithinDirectory('C:\\game\\Mods', 'C:\\game\\Mods\\AT')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isPathWithinDirectory('/Game/Mods', '/game/mods/AT')).toBe(true)
  })

  it('ignores trailing slashes on the parent', () => {
    expect(isPathWithinDirectory('/game/Mods/', '/game/Mods/AT')).toBe(true)
  })
})
