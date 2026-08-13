import { describe, expect, test } from 'vite-plus/test'
import { deriveUniqueId, emptyManifestFormValue, formValueToMetadata, metadataToFormValue } from '@features/cp-maker'

describe('deriveUniqueId', () => {
  test('combines author and name without whitespace', () => {
    expect(deriveUniqueId('Summer Festival', 'Arbor Mods')).toBe('ArborMods.SummerFestival')
  })

  test('returns empty when either side is missing', () => {
    expect(deriveUniqueId('', 'Arbor')).toBe('')
    expect(deriveUniqueId('Summer Festival', '')).toBe('')
  })
})

describe('formValueToMetadata', () => {
  test('trims values and drops empty optional fields', () => {
    const metadata = formValueToMetadata({
      ...emptyManifestFormValue(),
      projectName: '  Summer Festival  ',
      projectUniqueId: ' Arbor.SummerFestival ',
      contentPackForMinimumVersion: '  ',
      minimumApiVersion: '',
      updateKeysText: '',
    })
    expect(metadata.projectName).toBe('Summer Festival')
    expect(metadata.projectUniqueId).toBe('Arbor.SummerFestival')
    expect(metadata.contentPackForMinimumVersion).toBeUndefined()
    expect(metadata.minimumApiVersion).toBeUndefined()
    expect(metadata.updateKeys).toEqual([])
    expect(metadata.dependencies).toEqual([])
  })

  test('parses update keys one per line and filters empty dependency rows', () => {
    const metadata = formValueToMetadata({
      ...emptyManifestFormValue(),
      projectName: 'Pack',
      projectUniqueId: 'A.Pack',
      updateKeysText: 'Nexus:12345\n\nGitHub:owner/repo\n',
      dependencies: [
        { uniqueId: ' Some.Mod ', minimumVersion: ' 2.0.0 ', isRequired: false },
        { uniqueId: '', minimumVersion: '', isRequired: true },
      ],
    })
    expect(metadata.updateKeys).toEqual(['Nexus:12345', 'GitHub:owner/repo'])
    expect(metadata.dependencies).toEqual([{ uniqueId: 'Some.Mod', minimumVersion: '2.0.0', isRequired: false }])
  })

  test('falls back to defaults for blank version and ContentPackFor', () => {
    const metadata = formValueToMetadata({
      ...emptyManifestFormValue(),
      projectName: 'Pack',
      projectUniqueId: 'A.Pack',
      projectVersion: ' ',
      contentPackForUniqueId: ' ',
    })
    expect(metadata.projectVersion).toBe('1.0.0')
    expect(metadata.contentPackForUniqueId).toBe('Pathoschild.ContentPatcher')
  })
})

describe('metadataToFormValue', () => {
  test('round-trips through formValueToMetadata', () => {
    const original = {
      projectName: 'Summer Festival',
      projectDescription: 'Desc',
      projectAuthor: 'Arbor',
      projectVersion: '1.2.3',
      projectUniqueId: 'Arbor.SummerFestival',
      contentPackForUniqueId: 'Pathoschild.ContentPatcher',
      contentPackForMinimumVersion: '2.0.0',
      minimumApiVersion: '4.1.0',
      updateKeys: ['Nexus:12345'],
      dependencies: [{ uniqueId: 'Some.Mod', minimumVersion: '2.0.0', isRequired: true }],
    }
    expect(formValueToMetadata(metadataToFormValue(original))).toEqual(original)
  })

  test('fills missing fields with defaults', () => {
    const value = metadataToFormValue({})
    expect(value.projectVersion).toBe('1.0.0')
    expect(value.contentPackForUniqueId).toBe('Pathoschild.ContentPatcher')
    expect(value.dependencies).toEqual([])
  })
})
