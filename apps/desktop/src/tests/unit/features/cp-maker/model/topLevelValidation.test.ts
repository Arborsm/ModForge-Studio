import { describe, expect, test } from 'vite-plus/test'
import type { CpMakerDraft } from '@features/cp-maker'
import { collectTopLevelIssues } from '@features/cp-maker'

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

function codes(draftValue: CpMakerDraft): string[] {
  return collectTopLevelIssues(draftValue).map((issue) => issue.code)
}

describe('collectTopLevelIssues', () => {
  test('accepts well-formed structures', () => {
    expect(
      codes(
        draft({
          dynamicTokens: [{ name: 'IsRainy', value: 'true' }],
          customLocations: [{ name: 'MyMod_Greenhouse', fromMapFile: 'assets/greenhouse.tbin' }],
          aliasTokenNames: { FarmHouse: 'LocationName' },
        }),
      ),
    ).toEqual([])
  })

  test('flags unnamed and duplicated dynamic tokens', () => {
    const issues = collectTopLevelIssues(
      draft({
        dynamicTokens: [
          { name: ' ', value: 'x' },
          { name: 'Season2', value: 'a' },
          { name: 'season2', value: 'b' },
        ],
      }),
    )
    expect(issues.find((issue) => issue.code === 'dynamicTokenNameMissing')?.severity).toBe('error')
    expect(issues.find((issue) => issue.code === 'dynamicTokenDuplicate')?.severity).toBe('warning')
  })

  test('flags custom locations without a name or map file', () => {
    const found = codes(
      draft({
        customLocations: [{ name: '' }, { name: 'MyMod_Cellar' }],
      }),
    )
    expect(found).toContain('customLocationNameMissing')
    expect(found).toContain('customLocationMapMissing')
  })

  test('flags empty and self-referencing aliases', () => {
    const found = codes(draft({ aliasTokenNames: { '': 'LocationName', FarmHouse: 'farmhouse' } }))
    expect(found).toContain('aliasTokenEmpty')
    expect(found).toContain('aliasTokenSelfReference')
  })

  test('warns when a dynamic token shadows a builtin or config name', () => {
    const found = codes(
      draft({
        configSchema: [{ key: 'EnableExtra', defaultValue: true }],
        dynamicTokens: [
          { name: 'Season', value: 'spring' },
          { name: 'enableextra', value: 'true' },
        ],
      }),
    )
    expect(found).toContain('dynamicTokenShadowsBuiltin')
    expect(found).toContain('dynamicTokenShadowsConfig')
  })

  test('warns when an alias target does not resolve to any token', () => {
    expect(codes(draft({ aliasTokenNames: { MyAlias: 'NotAToken' } }))).toContain('aliasTokenUnknownTarget')
    // Builtin, config, dynamic and alias targets all resolve.
    expect(
      codes(
        draft({
          configSchema: [{ key: 'EnableExtra', defaultValue: true }],
          dynamicTokens: [{ name: 'MyDynamic', value: 'x' }],
          aliasTokenNames: { A1: 'Season', A2: 'EnableExtra', A3: 'MyDynamic', A4: 'a1' },
        }),
      ),
    ).toEqual([])
  })
})
