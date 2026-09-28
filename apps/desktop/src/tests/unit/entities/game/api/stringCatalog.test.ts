import { describe, expect, it, vi } from 'vite-plus/test'
import { invokeDesktop } from '@platform/host/runtime'
import {
  buildLocalizedTextToken,
  findStringCatalogAsset,
  invalidateLocalizedTextCache,
  loadStringCatalogAsset,
  loadStringCatalogCategory,
  searchStringCatalog,
  STRING_CATALOG_ASSETS,
  STRING_CATALOG_CATEGORIES,
  stringCatalogAssetsInCategory,
  stringCatalogEntryMatches,
  type StringCatalogEntry,
} from '@entities/game/api'

vi.mock('@platform/host/runtime', () => ({
  invokeDesktop: vi.fn(),
}))

const ROOT = 'E:/Stardew Valley'

/** Keys tables by bare `Strings` name so locale-suffixed paths still match. */
function mockTables(tables: Record<string, Record<string, string>>) {
  vi.mocked(invokeDesktop).mockImplementation(async (_command: string, args: unknown) => {
    const assetPath = ((args as { assetPath?: string }).assetPath ?? '').replaceAll('/', '\\')
    const name = /Strings\\([^\\.]+)/u.exec(assetPath)?.[1] ?? ''
    const table = tables[name]
    if (table === undefined) {
      throw new Error(`not found: ${assetPath}`)
    }
    return { absolutePath: assetPath, relativePath: assetPath, content: JSON.stringify(table) }
  })
}

function entry(key: string, value: string): StringCatalogEntry {
  return {
    id: `Strings\\Objects:${key}`,
    assetName: 'Objects',
    category: 'items',
    key,
    value,
    token: buildLocalizedTextToken('Strings\\Objects', key),
  }
}

describe('catalog layout', () => {
  it('lists the eight display categories in order', () => {
    expect(STRING_CATALOG_CATEGORIES).toEqual(['items', 'characters', 'locations', 'dialogue', 'events', 'quests', 'ui', 'misc'])
  })

  it('gives every asset a known category and consistent paths', () => {
    expect(STRING_CATALOG_ASSETS.length).toBeGreaterThan(0)
    for (const asset of STRING_CATALOG_ASSETS) {
      expect(STRING_CATALOG_CATEGORIES).toContain(asset.category)
      expect(asset.referenceName).toBe(`Strings\\${asset.name}`)
      expect(asset.assetPath).toBe(`Content\\Strings\\${asset.name}.xnb`)
    }
  })

  it('never repeats an asset name', () => {
    const names = STRING_CATALOG_ASSETS.map((asset) => asset.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('partitions every asset into exactly one category bucket', () => {
    const bucketed = STRING_CATALOG_CATEGORIES.flatMap((category) => stringCatalogAssetsInCategory(category))
    expect(bucketed).toHaveLength(STRING_CATALOG_ASSETS.length)
    expect(stringCatalogAssetsInCategory('items').map((asset) => asset.name)).toContain('Objects')
    for (const asset of stringCatalogAssetsInCategory('events')) {
      expect(asset.category).toBe('events')
    }
  })
})

describe('findStringCatalogAsset', () => {
  it('accepts the bare name, both reference spellings, and any casing', () => {
    for (const input of ['Objects', 'Strings\\Objects', 'Strings/Objects', 'strings\\objects', '  objects  ']) {
      expect(findStringCatalogAsset(input)?.name, input).toBe('Objects')
    }
  })

  it('returns null for empty and unknown names', () => {
    expect(findStringCatalogAsset('')).toBeNull()
    expect(findStringCatalogAsset('   ')).toBeNull()
    expect(findStringCatalogAsset(null)).toBeNull()
    expect(findStringCatalogAsset(undefined)).toBeNull()
    expect(findStringCatalogAsset('Strings\\NotAnAsset')).toBeNull()
  })
})

describe('buildLocalizedTextToken', () => {
  it('emits the game token with backslash separators', () => {
    expect(buildLocalizedTextToken('Strings\\Objects', 'Blue_Name')).toBe('[LocalizedText Strings\\Objects:Blue_Name]')
    expect(buildLocalizedTextToken('Strings/Objects', 'Blue_Name')).toBe('[LocalizedText Strings\\Objects:Blue_Name]')
  })
})

describe('stringCatalogEntryMatches', () => {
  const sample = entry('Blue_Name', 'Blue Jazz')

  it('matches everything on an empty query', () => {
    expect(stringCatalogEntryMatches(sample, '')).toBe(true)
    expect(stringCatalogEntryMatches(sample, '   ')).toBe(true)
  })

  it('matches key and value case-insensitively', () => {
    expect(stringCatalogEntryMatches(sample, 'blue_n')).toBe(true)
    expect(stringCatalogEntryMatches(sample, 'JAZZ')).toBe(true)
  })

  it('rejects a query present in neither field', () => {
    expect(stringCatalogEntryMatches(sample, 'parsnip')).toBe(false)
  })
})

describe('searchStringCatalog', () => {
  const entries = Array.from({ length: 250 }, (_, index) => entry(`Key_${index}`, `Value ${index}`))

  it('caps results at 200 by default while reporting the true total', () => {
    const { results, total } = searchStringCatalog(entries, '')
    expect(results).toHaveLength(200)
    expect(total).toBe(250)
  })

  it('honours a custom limit', () => {
    const { results, total } = searchStringCatalog(entries, '', 5)
    expect(results).toHaveLength(5)
    expect(results[0]?.key).toBe('Key_0')
    expect(total).toBe(250)
  })

  it('filters before capping', () => {
    const { results, total } = searchStringCatalog(entries, 'Value 24')
    expect(total).toBe(11)
    expect(results.map((item) => item.key)).toContain('Key_24')
  })

  it('returns nothing when no entry matches', () => {
    expect(searchStringCatalog(entries, 'nothing here')).toEqual({ results: [], total: 0 })
  })
})

describe('loadStringCatalogAsset', () => {
  it('sorts entries by key and builds ids and tokens', async () => {
    invalidateLocalizedTextCache()
    mockTables({ Objects: { Zebra_Name: 'Zebra', Blue_Name: 'Blue Jazz' } })
    const asset = findStringCatalogAsset('Objects')!
    const result = await loadStringCatalogAsset(ROOT, asset, 'en-US')

    expect(result.loaded).toBe(true)
    expect(result.asset).toBe(asset)
    expect(result.entries.map((item) => item.key)).toEqual(['Blue_Name', 'Zebra_Name'])
    expect(result.entries[0]).toEqual({
      id: 'Strings\\Objects:Blue_Name',
      assetName: 'Objects',
      category: 'items',
      key: 'Blue_Name',
      value: 'Blue Jazz',
      token: '[LocalizedText Strings\\Objects:Blue_Name]',
    })
  })

  it('reports an unreadable table instead of throwing', async () => {
    invalidateLocalizedTextCache()
    mockTables({})
    const result = await loadStringCatalogAsset(ROOT, findStringCatalogAsset('Objects')!, 'en-US')
    expect(result).toMatchObject({ loaded: false, entries: [] })
  })
})

describe('loadStringCatalogCategory', () => {
  it('loads every table in the category and keeps the failures visible', async () => {
    invalidateLocalizedTextCache()
    mockTables({ Events: { 'Foo/1': 'bar' } })
    const results = await loadStringCatalogCategory(ROOT, 'quests', 'en-US')

    expect(results).toHaveLength(stringCatalogAssetsInCategory('quests').length)
    for (const result of results) {
      expect(result.loaded).toBe(false)
      expect(result.entries).toEqual([])
    }
  })
})
