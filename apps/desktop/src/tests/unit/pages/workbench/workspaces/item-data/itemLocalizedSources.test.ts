import { describe, expect, test } from 'vite-plus/test'
import type { ItemWorkspaceEntry } from '@entities/item'
import {
  buildItemSourceGroups,
  buildPreviewItem,
  type VanillaObjectIndexState,
} from '@pages/workbench/workspaces/item-data/state/useItemAuthoringSources'

function vanillaEntry(itemId: string, displayName: string, rawType = 'BASIC'): ItemWorkspaceEntry {
  return {
    kind: 'object',
    itemId,
    qualifiedItemId: `(O)${itemId}`,
    internalName: displayName,
    displayName,
    description: `${displayName} 描述`,
    rawType,
    searchText: displayName.toLowerCase(),
  } as ItemWorkspaceEntry
}

function vanilla(entries: ItemWorkspaceEntry[], records: Record<string, unknown> = {}): VanillaObjectIndexState {
  return {
    entries: new Map(entries.map((entry) => [entry.itemId.toLowerCase(), entry])),
    records,
    loading: false,
    available: true,
  }
}

describe('buildItemSourceGroups placeholder folding', () => {
  test('literal ??? placeholders leave the normal groups and land in placeholderRows', async () => {
    const groups = await buildItemSourceGroups({
      rootPath: null,
      locale: 'en-US',
      projectKeys: [],
      projectEntries: {},
      vanilla: vanilla([vanillaEntry('128', 'Blue Jazz'), vanillaEntry('930', '???'), vanillaEntry('931', '???')]),
      mode: 'all',
      search: '',
      ungroupedLabel: '未分组',
    })
    expect(groups.vanillaGroups.flatMap((group) => group.rows).map((row) => row.displayName)).toEqual(['Blue Jazz'])
    expect(groups.placeholderRows.map((row) => row.key)).toEqual(['930', '931'])
  })

  test('placeholders stay searchable', async () => {
    const groups = await buildItemSourceGroups({
      rootPath: null,
      locale: 'en-US',
      projectKeys: [],
      projectEntries: {},
      vanilla: vanilla([vanillaEntry('930', '???')]),
      mode: 'all',
      search: '930',
      ungroupedLabel: '未分组',
    })
    expect(groups.placeholderRows).toHaveLength(1)
  })
})

describe('buildPreviewItem localized fallback', () => {
  const records = {
    '128': {
      DisplayName: '[LocalizedText Strings\\Objects:BlueJazz_Name]',
      Description: '[LocalizedText Strings\\Objects:BlueJazz_Desc]',
      Price: 50,
    },
  }

  test('a cloned token field falls back to the vanilla localized text', () => {
    const preview = buildPreviewItem('128', records['128'], vanilla([vanillaEntry('128', '蓝色爵士')], records))
    expect(preview?.displayName).toBe('蓝色爵士')
    expect(preview?.description).toBe('蓝色爵士 描述')
  })

  test('plain text written by the author wins over the vanilla text', () => {
    const preview = buildPreviewItem(
      '128',
      { ...records['128'], DisplayName: '我的花' },
      vanilla([vanillaEntry('128', '蓝色爵士')], records),
    )
    expect(preview?.displayName).toBe('我的花')
  })

  test('without a vanilla row the entry renders as-is', () => {
    const preview = buildPreviewItem('999', { DisplayName: 'Custom' }, vanilla([]))
    expect(preview?.displayName).toBe('Custom')
  })
})
