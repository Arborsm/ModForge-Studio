import { describe, expect, test } from 'vite-plus/test'
import type { CpMakerDraft } from '@features/cp-maker'
import { buildManifestJson } from '@features/cp-maker'

function draft(metadataOverrides: Partial<CpMakerDraft['projectMetadata']> = {}): CpMakerDraft {
  return {
    draftStorageKey: 'draft-1',
    projectMetadata: {
      projectName: 'Summer Festival',
      projectDescription: 'A festival pack',
      projectAuthor: 'Arbor',
      projectVersion: '1.0.0',
      projectUniqueId: 'Arbor.SummerFestival',
      gameRootPath: null,
      contentPackForUniqueId: 'Pathoschild.ContentPatcher',
      ...metadataOverrides,
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
  }
}

function manifestOf(draftValue: CpMakerDraft): Record<string, unknown> {
  return JSON.parse(buildManifestJson(draftValue)) as Record<string, unknown>
}

describe('buildManifestJson', () => {
  test('emits the minimal manifest without optional keys', () => {
    const manifest = manifestOf(draft())
    expect(manifest).toEqual({
      Name: 'Summer Festival',
      Author: 'Arbor',
      Version: '1.0.0',
      Description: 'A festival pack',
      UniqueID: 'Arbor.SummerFestival',
      ContentPackFor: { UniqueID: 'Pathoschild.ContentPatcher' },
    })
  })

  test('emits ContentPackFor.MinimumVersion when set', () => {
    const manifest = manifestOf(draft({ contentPackForMinimumVersion: '2.0.0' }))
    expect(manifest['ContentPackFor']).toEqual({ UniqueID: 'Pathoschild.ContentPatcher', MinimumVersion: '2.0.0' })
  })

  test('emits Dependencies with IsRequired and optional MinimumVersion', () => {
    const manifest = manifestOf(
      draft({
        dependencies: [
          { uniqueId: 'Pathoschild.ContentPatcher', minimumVersion: '2.0.0', isRequired: true },
          { uniqueId: 'Some.Optional', isRequired: false },
        ],
      }),
    )
    expect(manifest['Dependencies']).toEqual([
      { UniqueID: 'Pathoschild.ContentPatcher', IsRequired: true, MinimumVersion: '2.0.0' },
      { UniqueID: 'Some.Optional', IsRequired: false },
    ])
  })

  test('omits Dependencies when the list is empty', () => {
    const manifest = manifestOf(draft({ dependencies: [] }))
    expect('Dependencies' in manifest).toBe(false)
  })

  test('keeps MinimumApiVersion and UpdateKeys passthrough', () => {
    const manifest = manifestOf(draft({ minimumApiVersion: '4.1.0', updateKeys: ['Nexus:123'] }))
    expect(manifest['MinimumApiVersion']).toBe('4.1.0')
    expect(manifest['UpdateKeys']).toEqual(['Nexus:123'])
  })
})
