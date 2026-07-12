import { describe, expect, it } from 'vite-plus/test'
import { buildTranslationEntries, extractI18nTokens, updateI18nFileEntry } from '@features/translation-editor/model/translationEditor'

describe('translation editor model', () => {
  it('builds status-aware rows and detects missing placeholder tokens', () => {
    const entries = buildTranslationEntries({
      sourceFile: {
        locale: 'default',
        path: 'E:\\Mods\\Example\\i18n\\default.json',
        relativePath: 'i18n/default.json',
        rawJson: JSON.stringify({
          'ui.delete': 'Delete {{itemName}}?',
          'ui.save': 'Save $1',
          'ui.cancel': 'Cancel',
        }),
        entryCount: 3,
      },
      targetFile: {
        locale: 'zh-CN',
        path: 'E:\\Mods\\Example\\i18n\\zh-CN.json',
        relativePath: 'i18n/zh-CN.json',
        rawJson: JSON.stringify({
          'ui.delete': '删除？',
          'ui.save': '保存 $1',
        }),
        entryCount: 2,
      },
      query: '',
      status: 'all',
    })

    expect(entries).toHaveLength(3)
    expect(entries[0]).toMatchObject({
      key: 'ui.cancel',
      status: 'missing',
    })
    expect(entries[1]).toMatchObject({
      key: 'ui.delete',
      status: 'error',
      missingTokens: ['{{itemName}}'],
    })
    expect(entries[2]).toMatchObject({
      key: 'ui.save',
      status: 'translated',
    })
  })

  it('filters by text and status', () => {
    const rows = buildTranslationEntries({
      sourceFile: {
        locale: 'default',
        path: 'E:\\Mods\\Example\\i18n\\default.json',
        relativePath: 'i18n/default.json',
        rawJson: JSON.stringify({
          title: 'Seasonal Garden',
          greeting: 'Hello {{name}}',
        }),
        entryCount: 2,
      },
      targetFile: {
        locale: 'zh-CN',
        path: 'E:\\Mods\\Example\\i18n\\zh-CN.json',
        relativePath: 'i18n/zh-CN.json',
        rawJson: JSON.stringify({
          title: '季节花园',
          greeting: '你好',
        }),
        entryCount: 2,
      },
      query: 'hello',
      status: 'error',
    })

    expect(rows.map((row) => row.key)).toEqual(['greeting'])
  })

  it('updates a target file entry with pretty json output', () => {
    const next = updateI18nFileEntry(
      {
        locale: 'zh-CN',
        path: 'E:\\Mods\\Example\\i18n\\zh-CN.json',
        relativePath: 'i18n/zh-CN.json',
        rawJson: '{\n  "title": "旧标题"\n}\n',
        entryCount: 1,
      },
      'title',
      '新标题',
    )

    expect(next.entryCount).toBe(1)
    expect(next.rawJson).toContain('"title": "新标题"')
    expect(next.rawJson.endsWith('\n')).toBe(true)
  })

  it('extracts Content Patcher placeholders without duplicates', () => {
    expect(extractI18nTokens('Hello {{name}}, item $1 and {{name}}')).toEqual(['$1', '{{name}}'])
  })
})
