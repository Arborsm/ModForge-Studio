import { describe, expect, test } from 'vite-plus/test'
import type { CpMakerDraft } from '@features/cp-maker'
import { collectManifestIssues } from '@features/cp-maker'

function metadata(overrides: Partial<CpMakerDraft['projectMetadata']> = {}): CpMakerDraft['projectMetadata'] {
  return {
    projectName: 'Summer Festival',
    projectDescription: '',
    projectAuthor: 'Arbor',
    projectVersion: '1.0.0',
    projectUniqueId: 'Arbor.SummerFestival',
    gameRootPath: null,
    contentPackForUniqueId: 'Pathoschild.ContentPatcher',
    ...overrides,
  }
}

function codes(metadataValue: CpMakerDraft['projectMetadata']): string[] {
  return collectManifestIssues(metadataValue).map((issue) => issue.code)
}

describe('collectManifestIssues', () => {
  test('accepts a complete, well-formed manifest', () => {
    expect(
      codes(
        metadata({
          contentPackForMinimumVersion: '1.30.0',
          minimumApiVersion: '4.1.0',
          updateKeys: ['Nexus:12345', 'GitHub:owner/repo'],
          dependencies: [{ uniqueId: 'Pathoschild.ContentPatcher', minimumVersion: '2.0.0', isRequired: true }],
        }),
      ),
    ).toEqual([])
  })

  test('flags missing name and UniqueID as errors', () => {
    const issues = collectManifestIssues(metadata({ projectName: ' ', projectUniqueId: '' }))
    expect(issues.find((issue) => issue.code === 'manifestNameMissing')?.severity).toBe('error')
    expect(issues.find((issue) => issue.code === 'manifestUniqueIdMissing')?.severity).toBe('error')
  })

  test('warns on unconventional UniqueID shape', () => {
    expect(codes(metadata({ projectUniqueId: 'NoDotsHere' }))).toContain('manifestUniqueIdShape')
    expect(codes(metadata({ projectUniqueId: 'Has Spaces.Mod' }))).toContain('manifestUniqueIdShape')
  })

  test('rejects non-semver project version as an error', () => {
    const issues = collectManifestIssues(metadata({ projectVersion: '1.0' }))
    expect(issues.find((issue) => issue.code === 'manifestVersionInvalid')?.severity).toBe('error')
  })

  test('accepts semver prerelease suffixes', () => {
    expect(codes(metadata({ projectVersion: '1.0.0-beta.1' }))).toEqual([])
  })

  test('warns on empty author and empty ContentPackFor', () => {
    const issues = collectManifestIssues(metadata({ projectAuthor: '', contentPackForUniqueId: ' ' }))
    expect(issues.find((issue) => issue.code === 'manifestAuthorMissing')?.severity).toBe('warning')
    expect(issues.find((issue) => issue.code === 'manifestContentPackForMissing')?.severity).toBe('error')
  })

  test('warns on misshapen optional versions and update keys', () => {
    const found = codes(
      metadata({
        contentPackForMinimumVersion: '2.0',
        minimumApiVersion: 'soon',
        updateKeys: ['just-a-number'],
      }),
    )
    expect(found.filter((code) => code === 'manifestVersionShape')).toHaveLength(2)
    expect(found).toContain('manifestUpdateKeyShape')
  })

  test('flags dependency problems without flagging valid ones', () => {
    const found = codes(
      metadata({
        dependencies: [
          { uniqueId: '', isRequired: true },
          { uniqueId: 'Some.Mod', minimumVersion: 'abc', isRequired: false },
          { uniqueId: 'some.mod', isRequired: true },
        ],
      }),
    )
    expect(found).toContain('manifestDependencyUniqueIdMissing')
    expect(found).toContain('manifestVersionShape')
    expect(found).toContain('manifestDependencyDuplicate')
  })
})
