import { describe, expect, it, vi } from 'vite-plus/test'
import { invokeDesktop } from '@platform/host/runtime'
import {
  invalidateLocalizedTextCache,
  resolveLocalizedText,
  resolveLocalizedTextDetailed,
  tryParseStringAssetReference,
} from '@entities/game/api'

vi.mock('@platform/host/runtime', () => ({
  invokeDesktop: vi.fn(),
}))

const ROOT = 'E:/Stardew Valley'

function mockTables(tables: Record<string, Record<string, string>>) {
  vi.mocked(invokeDesktop).mockImplementation(async (_command: string, args: unknown) => {
    const assetPath = ((args as { assetPath?: string }).assetPath ?? '').replaceAll('/', '\\')
    const table = tables[assetPath]
    if (table === undefined) {
      throw new Error(`not found: ${assetPath}`)
    }
    return { absolutePath: assetPath, relativePath: assetPath, content: JSON.stringify(table) }
  })
}

describe('tryParseStringAssetReference', () => {
  it('parses the bracketed and bare forms', () => {
    expect(tryParseStringAssetReference('[LocalizedText Strings\\Objects:Blue_Name]')).toEqual({
      assetPath: 'Content\\Strings\\Objects.xnb',
      key: 'Blue_Name',
    })
    expect(tryParseStringAssetReference('Strings/Objects:Blue_Name')).toEqual({
      assetPath: 'Content\\Strings\\Objects.xnb',
      key: 'Blue_Name',
    })
  })

  it('rejects plain text and missing keys', () => {
    expect(tryParseStringAssetReference('Blue Jazz')).toBeNull()
    expect(tryParseStringAssetReference('')).toBeNull()
    expect(tryParseStringAssetReference('NoSeparator')).toBeNull()
  })
})

describe('resolveLocalizedTextDetailed', () => {
  it('resolves a reference against its string table', async () => {
    invalidateLocalizedTextCache()
    mockTables({ 'Content\\Strings\\Objects.xnb': { Blue_Name: '蓝色爵士' } })
    const result = await resolveLocalizedTextDetailed(ROOT, 'zh-CN', '[LocalizedText Strings\\Objects:Blue_Name]')
    expect(result).toMatchObject({ text: '蓝色爵士', isReference: true, resolved: true, tableLoadFailed: false })
  })

  it('passes plain text through untouched', async () => {
    const result = await resolveLocalizedTextDetailed(ROOT, 'zh-CN', 'Blue Jazz')
    expect(result).toMatchObject({ text: 'Blue Jazz', isReference: false, resolved: false })
  })

  it('follows nested references up to the depth cap', async () => {
    invalidateLocalizedTextCache()
    mockTables({
      'Content\\Strings\\Objects.xnb': { Nested: '[LocalizedText Strings\\Buildings:Barn_Name]' },
      'Content\\Strings\\Buildings.xnb': { Barn_Name: '畜棚' },
    })
    const nested = await resolveLocalizedTextDetailed(ROOT, 'zh-CN', '[LocalizedText Strings\\Objects:Nested]')
    expect(nested.text).toBe('畜棚')
  })

  it('reports table load failure instead of silently falling back', async () => {
    invalidateLocalizedTextCache()
    mockTables({})
    const result = await resolveLocalizedTextDetailed(ROOT, 'zh-CN', '[LocalizedText Strings\\Missing:Key]')
    expect(result).toMatchObject({ isReference: true, resolved: false, tableLoadFailed: true })
    expect(result.text).toBe('[LocalizedText Strings\\Missing:Key]')
  })

  it('keeps the compat wrapper semantics', async () => {
    invalidateLocalizedTextCache()
    mockTables({ 'Content\\Strings\\Objects.xnb': { Blue_Name: '蓝色爵士' } })
    expect(await resolveLocalizedText(ROOT, 'zh-CN', '')).toBeNull()
    expect(await resolveLocalizedText(ROOT, 'zh-CN', 'plain')).toBe('plain')
    expect(await resolveLocalizedText(ROOT, 'zh-CN', '[LocalizedText Strings\\Objects:Blue_Name]')).toBe('蓝色爵士')
  })
})
