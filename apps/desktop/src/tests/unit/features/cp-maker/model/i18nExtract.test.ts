import { describe, expect, test } from 'vite-plus/test'
import type { CpMakerDraft, DraftPatch } from '@features/cp-maker'
import { buildI18nExtraction } from '@features/cp-maker'

function patch(id: string, target: string, editorState: unknown): DraftPatch {
  return { id, workspace: 'mods', target, action: 'EditData', logName: '', enabled: true, editorState }
}

function draft(patches: DraftPatch[], i18nFiles: CpMakerDraft['i18nFiles'] = []): CpMakerDraft {
  return {
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
    patches,
    virtualAssets: [],
    dynamicTokens: [],
    customLocations: [],
    aliasTokenNames: {},
    eventSourceSnapshotsByTarget: {},
    i18nFiles,
  }
}

describe('buildI18nExtraction', () => {
  test('rewrites localizable object fields and collects default entries', () => {
    const result = buildI18nExtraction(
      draft([
        patch('p1', 'Data/Objects', {
          entries: {
            Blue: { DisplayName: '蓝色爵士', Description: '一种花。', Price: 50 },
          },
        }),
      ]),
    )
    expect(result.rewrittenCount).toBe(2)
    expect(result.entries).toEqual({
      'objects.Blue.DisplayName': '蓝色爵士',
      'objects.Blue.Description': '一种花。',
    })
    const state = result.editorStates.get('p1') as { entries: Record<string, Record<string, unknown>> }
    expect(state.entries['Blue']).toEqual({
      DisplayName: '{{i18n:objects.Blue.DisplayName}}',
      Description: '{{i18n:objects.Blue.Description}}',
      Price: 50,
    })
  })

  test('rewrites whole entry strings for dialogue, mail and gift tastes', () => {
    const result = buildI18nExtraction(
      draft([
        patch('p1', 'Characters/Dialogue/Abigail', { entries: { Introduction: '你好，农场主！' } }),
        patch('p2', 'Data/mail', { entries: { my_letter: '给你带了礼物。[#]礼物' } }),
      ]),
    )
    expect(result.rewrittenCount).toBe(2)
    expect(result.entries['dialogue.Abigail.Introduction']).toBe('你好，农场主！')
    expect(result.entries['mail.my_letter']).toBe('给你带了礼物。[#]礼物')
    expect((result.editorStates.get('p1') as { entries: Record<string, unknown> }).entries['Introduction']).toBe(
      '{{i18n:dialogue.Abigail.Introduction}}',
    )
  })

  test('leaves tokenized and referenced values alone', () => {
    const result = buildI18nExtraction(
      draft([
        patch('p1', 'Data/Objects', {
          entries: {
            A: { DisplayName: '{{i18n:already.done}}' },
            B: { DisplayName: '[LocalizedText Strings\\Objects:B_Name]' },
          },
        }),
      ]),
    )
    expect(result.rewrittenCount).toBe(0)
    expect(result.editorStates.size).toBe(0)
  })

  test('never overwrites keys already in default.json', () => {
    const result = buildI18nExtraction(
      draft(
        [patch('p1', 'Data/Objects', { entries: { Blue: { DisplayName: '新文本' } } })],
        [{ locale: 'default', rawJson: JSON.stringify({ 'objects.Blue.DisplayName': '旧文本' }) }],
      ),
    )
    expect(result.rewrittenCount).toBe(0)
    expect(result.skippedCount).toBe(1)
    expect(result.entries).toEqual({})
  })

  test('skips disabled patches and non-EditData actions', () => {
    const disabled = patch('p1', 'Data/Objects', { entries: { A: { DisplayName: 'x' } } })
    disabled.enabled = false
    const result = buildI18nExtraction(draft([disabled, { ...patch('p2', 'Maps/Town', {}), action: 'EditMap' }]))
    expect(result.rewrittenCount).toBe(0)
  })

  test('sanitizes exotic entry keys into readable i18n keys', () => {
    const result = buildI18nExtraction(draft([patch('p1', 'Data/mail', { entries: { 'my letter!': '正文' } })]))
    expect(Object.keys(result.entries)).toEqual(['mail.my_letter'])
  })
})
