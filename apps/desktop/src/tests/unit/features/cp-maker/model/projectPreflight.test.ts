import { describe, expect, test } from 'vite-plus/test'
import { countAssetIssues } from '@entities/asset-schema'
import type { CpMakerDraft } from '@features/cp-maker'
import { collectDraftIssues } from '@features/cp-maker'

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

describe('collectDraftIssues preflight roll-up', () => {
  test('a clean draft has no blocking errors', () => {
    const counts = countAssetIssues(collectDraftIssues(draft()))
    expect(counts.errors).toBe(0)
  })

  test('manifest findings come first, then top-level, then patch findings', () => {
    const issues = collectDraftIssues(
      draft({
        projectMetadata: {
          ...draft().projectMetadata,
          projectUniqueId: '',
        },
        dynamicTokens: [{ name: '', value: 'x' }],
        patches: [
          {
            id: 'p1',
            workspace: 'mods',
            target: 'Maps/Farm',
            action: 'Load',
            logName: '',
            enabled: true,
            editorState: {},
          },
        ],
      }),
    )
    expect(issues.map((issue) => issue.code)).toEqual(['manifestUniqueIdMissing', 'dynamicTokenNameMissing', 'patchSourceFileMissing'])
  })

  test('manifest errors are blocking, shape warnings are not', () => {
    const blockingDraft = draft({
      projectMetadata: { ...draft().projectMetadata, projectVersion: '1.0' },
    })
    expect(countAssetIssues(collectDraftIssues(blockingDraft)).errors).toBeGreaterThan(0)

    const warningDraft = draft({
      projectMetadata: { ...draft().projectMetadata, projectUniqueId: 'NoDots' },
    })
    const warningCounts = countAssetIssues(collectDraftIssues(warningDraft))
    expect(warningCounts.errors).toBe(0)
    expect(warningCounts.warnings).toBeGreaterThan(0)
  })

  test('disabled patches do not contribute findings', () => {
    const issues = collectDraftIssues(
      draft({
        patches: [
          {
            id: 'p1',
            workspace: 'mods',
            target: 'Maps/Farm',
            action: 'Load',
            logName: '',
            enabled: false,
            editorState: {},
          },
        ],
      }),
    )
    expect(issues).toEqual([])
  })
})
