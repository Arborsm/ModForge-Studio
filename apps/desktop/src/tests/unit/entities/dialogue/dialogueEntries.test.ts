import { describe, expect, it } from 'vite-plus/test'
import {
  buildDialoguePatchLogName,
  buildDialogueTarget,
  getDialogueScriptPreview,
  mergeDialogueEntries,
  parseDialogueTargetNpc,
  readDialoguePatchEditorState,
} from '@entities/dialogue'

describe('dialogue entry merging', () => {
  it('merges vanilla and project entries with project overriding vanilla', () => {
    const merged = mergeDialogueEntries(
      { Mon: 'Vanilla monday.', Tue: 'Vanilla tuesday.$h' },
      { Mon: 'Project monday.#$e#Second page.', spring_1: 'Project spring.' },
      { spring_1: 'Spring greeting' },
    )

    expect(merged.map((entry) => entry.key)).toEqual(['Mon', 'spring_1', 'Tue'])

    const monday = merged.find((entry) => entry.key === 'Mon')
    expect(monday).toMatchObject({ origin: 'override', script: 'Project monday.#$e#Second page.', vanillaScript: 'Vanilla monday.' })
    expect(monday?.pageCount).toBe(2)

    expect(merged.find((entry) => entry.key === 'Tue')).toMatchObject({ origin: 'vanilla', script: 'Vanilla tuesday.$h', title: null })
    expect(merged.find((entry) => entry.key === 'spring_1')).toMatchObject({ origin: 'project', title: 'Spring greeting' })
  })

  it('builds token-free previews from the first page', () => {
    // Punctuation-only fragments around protocol tokens are literals, not text.
    expect(getDialogueScriptPreview('Hello, @!$h#$e#Second page.')).toBe('Hello,')
    expect(getDialogueScriptPreview('Nice to meet you, @. Welcome!$h')).toBe('Nice to meet you, . Welcome!')
    expect(getDialogueScriptPreview("You're an interesting ${guy^lady}$, @.$h")).toContain("You're an interesting")
    expect(getDialogueScriptPreview('')).toBe('')
    const long = getDialogueScriptPreview(`${'word '.repeat(40)}end`, 40)
    expect(long.length).toBeLessThanOrEqual(40)
    expect(long.endsWith('…')).toBe(true)
  })

  it('maps NPC ids to patch targets and back', () => {
    expect(buildDialogueTarget('Abigail')).toBe('Characters/Dialogue/Abigail')
    expect(parseDialogueTargetNpc('Characters/Dialogue/Abigail')).toBe('Abigail')
    expect(parseDialogueTargetNpc('characters\\dialogue\\Kel.Custom')).toBe('Kel.Custom')
    expect(parseDialogueTargetNpc('Data/Characters')).toBeNull()
    expect(parseDialogueTargetNpc('Characters/Dialogue/')).toBeNull()
    expect(buildDialoguePatchLogName('Abigail')).toBe('Dialogue: Abigail')
  })

  it('reads patch editor state defensively', () => {
    expect(readDialoguePatchEditorState(undefined)).toEqual({ entries: {} })
    expect(readDialoguePatchEditorState({ entries: { Mon: 'Hi', broken: 7 }, titles: { Mon: 'T' } })).toEqual({
      entries: { Mon: 'Hi' },
      titles: { Mon: 'T' },
    })
    expect(readDialoguePatchEditorState([1, 2, 3])).toEqual({ entries: {} })
  })
})
