import { describe, expect, it } from 'vite-plus/test'
import {
  generateContentPatcherI18n,
  generateContentPatcherProjectI18n,
  suggestTargetPrefix,
} from '@pages/workbench/tools/i18n-generator/contentPatcherI18nGenerator'

describe('Content Patcher i18n generator', () => {
  it('suggests semantic prefixes for dialogue and calendar-based festival assets', () => {
    expect(suggestTargetPrefix('Characters/Dialogue/MarriageDialogueAlex')).toBe('MarriageDialogue')
    expect(suggestTargetPrefix('Data/Festivals/spring13')).toBe('EggFestival')
    expect(suggestTargetPrefix('Data/Festivals/summer11')).toBe('Luau')
    expect(suggestTargetPrefix('Data/Festivals/fall27')).toBe('SpiritEve')
    expect(suggestTargetPrefix('Data/Festivals/customDay')).toBe('Festival.customDay')
  })
  it('parses JSON5, localizes nested Entries, preserves protocol fields, and resolves conflicting keys', () => {
    const result = generateContentPatcherI18n(
      `{
      changes: [
        { Action: 'EditData', Target: 'Characters/Dialogue/Alex', Entries: { Greeting: 'Hello', Nested: { Line: 'One' } } },
        { Action: 'EditData', Target: 'Data/Festivals/spring13', Entries: { Greeting: 'Festival hello', Existing: '{{i18n:Old.Key}}' } },
      ],
    }`,
      'ST.Sample',
    )

    expect(result.translations).toEqual({
      'ST.Sample.Alex.Greeting': 'Hello',
      'ST.Sample.Nested.Line': 'One',
      'ST.Sample.spring13.Greeting': 'Festival hello',
    })
    expect(result.skippedExisting).toBe(1)
    expect(result.conflictsResolved).toBe(2)
    expect((result.patch.changes as Array<Record<string, unknown>>)[0].Target).toBe('Characters/Dialogue/Alex')
    expect(((result.patch.changes as Array<Record<string, any>>)[0].Entries as Record<string, unknown>).Greeting).toBe(
      '{{i18n:ST.Sample.Alex.Greeting}}',
    )
  })

  it('applies different optional prefixes by patch target', () => {
    const result = generateContentPatcherI18n(
      `{ Changes: [
        { Action: 'EditData', Target: 'Characters/Dialogue/MarriageDialogueAlex', Entries: { Rainy_Day: 'Rain' } },
        { Action: 'EditData', Target: 'Data/Movies/Reactions', Entries: { Alex: 'Movie' } }
      ] }`,
      'ST.KivoValley.Shiroko',
      { targetPrefixes: { 'Characters/Dialogue/MarriageDialogueAlex': 'MarriageDialogue', 'Data/Movies/Reactions': 'MovieReactions' } },
    )

    expect(result.translations).toEqual({
      'ST.KivoValley.Shiroko.MarriageDialogue.Rainy_Day': 'Rain',
      'ST.KivoValley.Shiroko.MovieReactions.Alex': 'Movie',
    })
  })

  it('composes enabled path prefixes from parent to child without affecting siblings', () => {
    const source = `{ Changes: [
      { Action: 'EditData', Target: 'Data/Festivals/spring13', Entries: { Alex: 'Eggs' } },
      { Action: 'EditData', Target: 'Data/Festivals/fall27', Entries: { Alex: 'Ghosts' } }
    ] }`
    const inherited = generateContentPatcherI18n(source, 'ST.Sample', {
      targetPrefixes: { 'Data/Festivals': 'Festivals' },
    })
    expect(inherited.translations).toEqual({
      'ST.Sample.Festivals.spring13.Alex': 'Eggs',
      'ST.Sample.Festivals.fall27.Alex': 'Ghosts',
    })

    const composed = generateContentPatcherI18n(source, 'ST.Sample', {
      targetPrefixes: { 'Data/Festivals': 'Festivals', 'Data/Festivals/spring13': 'EggFestival' },
    })
    expect(composed.translations).toHaveProperty('ST.Sample.Festivals.EggFestival.Alex', 'Eggs')
    expect(composed.translations).toHaveProperty('ST.Sample.Festivals.Alex', 'Ghosts')
  })

  it('keeps generated patch tokens consistent with a fully enabled prefix tree preview', () => {
    const result = generateContentPatcherI18n(
      `{ Changes: [
        { Action: 'EditData', Target: 'Characters/Dialogue/Alex', Entries: { Greeting: 'Hello' } }
      ] }`,
      'Author.ModName',
      {
        targetPrefixes: {
          Characters: 'Characters',
          'Characters/Dialogue': 'Dialogue',
          'Characters/Dialogue/Alex': 'Alex',
        },
      },
    )

    const expectedKey = 'Author.ModName.Characters.Dialogue.Alex.Greeting'
    expect(result.translations).toEqual({ [expectedKey]: 'Hello' })
    expect(((result.patch.Changes as Array<Record<string, any>>)[0].Entries as Record<string, unknown>).Greeting).toBe(
      `{{i18n:${expectedKey}}}`,
    )
  })

  it('converts a complete project and merges existing default translations', () => {
    const result = generateContentPatcherProjectI18n(
      [
        { path: 'manifest.json', text: '{ Name: "Example" }' },
        { path: 'content.json', text: '{ Changes: [{ Action: "Include", FromFile: "patches/dialogue.json" }] }' },
        {
          path: 'patches/dialogue.json',
          text: '{ Changes: [{ Action: "EditData", Target: "Characters/Dialogue/Alex", Entries: { Hi: "Hello" } }] }',
        },
        { path: 'i18n/default.json', text: '{ "Existing.Key": "Existing" }' },
      ],
      'Author.Example',
    )
    expect(result.transformedFileCount).toBe(1)
    expect(result.translations).toEqual({ 'Existing.Key': 'Existing', 'Author.Example.Hi': 'Hello' })
    expect(result.files.get('patches/dialogue.json')).toContain('{{i18n:Author.Example.Hi}}')
    expect(result.files.get('manifest.json')).toBe('{ Name: "Example" }')
  })
})
