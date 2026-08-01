import { describe, expect, test } from 'vite-plus/test'
import type { CpMakerDraft } from '@features/cp-maker'
import { buildContentJson } from '@features/cp-maker'

function draft(overrides: Partial<CpMakerDraft> = {}): CpMakerDraft {
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
    patches: [],
    virtualAssets: [],
    projectAssets: [],
    dynamicTokens: [],
    customLocations: [],
    aliasTokenNames: {},
    eventSourceSnapshotsByTarget: {},
    i18nFiles: [],
    ...overrides,
  }
}

function contentOf(draftValue: CpMakerDraft): Record<string, unknown> {
  return JSON.parse(buildContentJson(draftValue).contentJson) as Record<string, unknown>
}

describe('buildContentJson top-level structures', () => {
  test('an empty draft only carries Format and Changes', () => {
    expect(contentOf(draft())).toEqual({ Format: '2.9.0', Changes: [] })
  })

  test('emits DynamicTokens with normalized When values', () => {
    const content = contentOf(
      draft({
        dynamicTokens: [
          { name: 'IsRainy', value: 'true', when: { Weather: 'rain' } },
          { name: 'AlwaysOn', value: 'yes' },
        ],
      }),
    )
    expect(content['DynamicTokens']).toEqual([
      { Name: 'IsRainy', Value: 'true', When: { Weather: 'rain' } },
      { Name: 'AlwaysOn', Value: 'yes' },
    ])
  })

  test('emits CustomLocations with optional MigrateLegacyNames', () => {
    const content = contentOf(
      draft({
        customLocations: [
          { name: 'MyMod_Greenhouse', fromMapFile: 'assets/greenhouse.tbin', migrateLegacyNames: ['OldName'] },
          { name: 'MyMod_Cellar' },
        ],
      }),
    )
    expect(content['CustomLocations']).toEqual([
      { Name: 'MyMod_Greenhouse', FromMapFile: 'assets/greenhouse.tbin', MigrateLegacyNames: ['OldName'] },
      { Name: 'MyMod_Cellar' },
    ])
  })

  test('emits AliasTokenNames and ConfigSchema at the root', () => {
    const content = contentOf(
      draft({
        aliasTokenNames: { FarmHouse: 'LocationName' },
        configSchema: [{ key: 'EnableEverything', defaultValue: true, allowValues: 'true, false' }],
      }),
    )
    expect(content['AliasTokenNames']).toEqual({ FarmHouse: 'LocationName' })
    expect(content['ConfigSchema']).toEqual({ EnableEverything: { Default: true, AllowValues: 'true, false' } })
  })
})
