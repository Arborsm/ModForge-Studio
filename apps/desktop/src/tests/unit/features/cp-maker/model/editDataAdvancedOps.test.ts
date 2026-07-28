import { describe, expect, test } from 'vite-plus/test'
import type { CpMakerDraft, DraftPatch } from '@features/cp-maker'
import { buildContentJson, collectProjectIssues } from '@features/cp-maker'
import {
  readAdvancedFields,
  readMoveEntries,
  readReplacedEntryKeys,
  readTextOperations,
  writeAdvancedFields,
  writeMoveEntries,
  writeTextOperations,
} from '@features/cp-maker/model/editDataAdvancedOps'

describe('textOperations read/write', () => {
  test('round-trips rows and drops empty optional fields', () => {
    const state = writeTextOperations({ entries: { A: 1 } }, [
      { operation: 'Append', target: '/Entries/Blue/Description', value: 'extra' },
      { operation: 'RemoveDelimited', target: '/Entries/Blue/Name', delimiter: ' ', search: 'x', replaceMode: 'All' },
    ])
    expect(readTextOperations(state)).toEqual([
      {
        operation: 'Append',
        target: '/Entries/Blue/Description',
        value: 'extra',
        delimiter: undefined,
        search: undefined,
        replaceMode: undefined,
      },
      { operation: 'RemoveDelimited', target: '/Entries/Blue/Name', value: undefined, delimiter: ' ', search: 'x', replaceMode: 'All' },
    ])
    // untouched sibling keys survive
    expect(state['entries']).toEqual({ A: 1 })
  })

  test('drops the key when no rows remain', () => {
    const state = writeTextOperations({ textOperations: [{ operation: 'Append', target: 'x' }] }, [])
    expect('textOperations' in state).toBe(false)
  })
})

describe('moveEntries read/write', () => {
  test('round-trips each position mode', () => {
    const state = writeMoveEntries({}, [
      { id: 'A', beforeId: 'B' },
      { id: 'C', afterId: 'D' },
      { id: 'E', toPosition: 0 },
    ])
    expect(readMoveEntries(state)).toEqual([
      { id: 'A', beforeId: 'B', afterId: undefined, toPosition: undefined },
      { id: 'C', beforeId: undefined, afterId: 'D', toPosition: undefined },
      { id: 'E', beforeId: undefined, afterId: undefined, toPosition: 0 },
    ])
  })
})

describe('advanced fields read/write', () => {
  test('round-trips the entry → field map', () => {
    const state = writeAdvancedFields({}, { Blue: { Price: 500, Name: 'Blue X' } })
    expect(readAdvancedFields(state)).toEqual({ Blue: { Price: 500, Name: 'Blue X' } })
  })

  test('drops the key when the map empties', () => {
    const state = writeAdvancedFields({ fields: { Blue: { Price: 1 } } }, {})
    expect('fields' in state).toBe(false)
  })
})

describe('readReplacedEntryKeys', () => {
  test('excludes disabled entries', () => {
    expect(readReplacedEntryKeys({ entries: { A: 1, B: 2 }, disabledEntries: { B: true } })).toEqual(['A'])
  })
})

function patchWith(editorState: unknown): DraftPatch {
  return {
    id: 'patch-1',
    workspace: 'items',
    target: 'Data/Objects',
    action: 'EditData',
    logName: '',
    enabled: true,
    editorState,
  }
}

describe('export integration', () => {
  test('buildContentJson PascalCases the advanced operations', () => {
    const draft: CpMakerDraft = {
      draftStorageKey: 'draft-1',
      projectMetadata: {
        projectName: 'Pack',
        projectDescription: '',
        projectAuthor: 'Arbor',
        projectVersion: '1.0.0',
        projectUniqueId: 'Arbor.Pack',
        gameRootPath: null,
        contentPackForUniqueId: 'Pathoschild.ContentPatcher',
      },
      configSchema: [],
      patches: [
        patchWith({
          fields: { Blue: { Price: 500 } },
          moveEntries: [{ id: 'Blue', afterId: 'Red' }],
          textOperations: [{ operation: 'Append', target: '/Entries/Blue/Description', value: '!' }],
        }),
      ],
      virtualAssets: [],
      dynamicTokens: [],
      customLocations: [],
      aliasTokenNames: {},
      eventSourceSnapshotsByTarget: {},
      i18nFiles: [],
    }
    const result = buildContentJson(draft)
    const changesFile = result.includeFiles.find((file) => file.relativePath === 'changes/items.json')
    expect(changesFile).toBeDefined()
    const changes = (JSON.parse(changesFile!.content) as { Changes: Array<Record<string, unknown>> }).Changes
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      Action: 'EditData',
      Target: 'Data/Objects',
      Fields: { Blue: { Price: 500 } },
      MoveEntries: [{ ID: 'Blue', AfterId: 'Red' }],
      TextOperations: [{ Operation: 'Append', Target: '/Entries/Blue/Description', Value: '!' }],
    })
  })
})

describe('overlap validation', () => {
  test('warns when fields or text operations touch a wholesale-replaced entry', () => {
    const issues = collectProjectIssues([
      patchWith({
        entries: { Blue: { Name: 'Blue' } },
        fields: { Blue: { Price: 500 } },
        textOperations: [{ operation: 'Append', target: '/Entries/Blue/Description', value: '!' }],
      }),
    ])
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['editDataFieldsOverlapEntries', 'editDataTextOpOverlapsEntries']),
    )
  })

  test('stays quiet when operations target other entries', () => {
    const issues = collectProjectIssues([
      patchWith({
        entries: { Blue: { Name: 'Blue' } },
        fields: { Red: { Price: 500 } },
        textOperations: [{ operation: 'Append', target: '/Entries/Red/Description', value: '!' }],
      }),
    ])
    expect(issues.filter((issue) => issue.code.startsWith('editData'))).toEqual([])
  })
})
