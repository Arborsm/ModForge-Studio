import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { makeTestPatch, mountDraftPort, type DraftPortHost } from '@test/draftPortHost'

const MAIL_TARGET = 'Data/mail'

describe('asset draft port staging', () => {
  let host: DraftPortHost

  beforeEach(() => {
    host = mountDraftPort([makeTestPatch('patch-1', MAIL_TARGET, { entries: { Letter_A: 'body a', Letter_B: 'body b' } })])
  })

  it('resolves an asset case-insensitively and across separator styles', () => {
    expect(host.port().hasAsset('data\\MAIL')).toBe(true)
    expect(host.port().hasAsset('Data/TriggerActions')).toBe(false)
    expect(host.port().readValue('DATA/MAIL', 'Letter_A')).toBe('body a')
  })

  it('stages an entry write without committing it', () => {
    host.port().stageValue(MAIL_TARGET, 'Letter_A', 'edited')

    expect(host.port().readValue(MAIL_TARGET, 'Letter_A')).toBe('edited')
    expect(host.port().isDirty()).toBe(true)
    expect(host.log).toEqual([])
  })

  it('deletes an entry by staging null', () => {
    host.port().stageValue(MAIL_TARGET, 'Letter_A', null)

    expect(host.port().listEntries(MAIL_TARGET)).toEqual(['Letter_B'])
    expect(host.port().readValue(MAIL_TARGET, 'Letter_A')).toBeUndefined()
  })

  it('applies every write of one stageValues call, unlike sequential stageValue calls', () => {
    // Both writes read the same render's patch; only the batch keeps both.
    const stale = host.port()
    stale.stageValue(MAIL_TARGET, 'Letter_A', 'first')
    stale.stageValue(MAIL_TARGET, 'Letter_B', 'second')
    expect(host.port().readValue(MAIL_TARGET, 'Letter_A')).toBe('body a')
    expect(host.port().readValue(MAIL_TARGET, 'Letter_B')).toBe('second')

    host.port().stageValues(MAIL_TARGET, { Letter_A: 'first', Letter_B: 'second' })
    expect(host.port().readValue(MAIL_TARGET, 'Letter_A')).toBe('first')
    expect(host.port().readValue(MAIL_TARGET, 'Letter_B')).toBe('second')
  })

  it('refuses to stage into an asset no patch edits', () => {
    expect(() => host.port().stageValue('Data/TriggerActions', 'T1', {})).toThrow(/No EditData patch edits "Data\/TriggerActions"/u)
  })

  it('commits and reverts the whole draft rather than single entries', () => {
    host.port().stageValue(MAIL_TARGET, 'Letter_A', 'edited')
    host.port().commit()
    expect(host.log).toEqual(['commit'])
    expect(host.port().isDirty()).toBe(false)

    host.port().stageValue(MAIL_TARGET, 'Letter_A', 'edited again')
    host.port().revert()
    expect(host.log).toEqual(['commit', 'revert'])
    expect(host.port().readValue(MAIL_TARGET, 'Letter_A')).toBe('body a')
    expect(host.port().isDirty()).toBe(false)
  })

  it('adds a patch that only the next port sees', () => {
    const patchId = host.port().addPatch('EditData', 'Data/TriggerActions')

    expect(patchId).toBe('patch-2')
    expect(host.port().hasAsset('Data/TriggerActions')).toBe(true)
    host.port().stageValue('Data/TriggerActions', 'T1', { Id: 'T1' })
    expect(host.port().readValue('Data/TriggerActions', 'T1')).toEqual({ Id: 'T1' })
  })
})

describe('asset draft port entry metadata', () => {
  let host: DraftPortHost

  beforeEach(() => {
    host = mountDraftPort([makeTestPatch('patch-1', MAIL_TARGET, { entries: { Letter_A: 'body a', Letter_B: 'body b' } })])
  })

  it('parks a disabled entry outside the exported entries', () => {
    host.port().stageEntryMeta(MAIL_TARGET, 'Letter_A', { enabled: false })

    const state = host.editorState('patch-1') as { entries: Record<string, unknown>; disabledEntries: Record<string, unknown> }
    expect(state.entries).toEqual({ Letter_B: 'body b' })
    expect(state.disabledEntries).toEqual({ Letter_A: 'body a' })
    expect(host.port().readEntryMeta(MAIL_TARGET, 'Letter_A')).toEqual({ enabled: false, label: null })
    // Disabled entries stay listed and readable, after the enabled ones.
    expect(host.port().listEntries(MAIL_TARGET)).toEqual(['Letter_B', 'Letter_A'])
    expect(host.port().readValue(MAIL_TARGET, 'Letter_A')).toBe('body a')
  })

  it('edits a disabled entry in place instead of re-enabling it', () => {
    host.port().stageEntryMeta(MAIL_TARGET, 'Letter_A', { enabled: false })
    host.port().stageValue(MAIL_TARGET, 'Letter_A', 'edited while off')

    expect(host.port().readEntryMeta(MAIL_TARGET, 'Letter_A').enabled).toBe(false)
    expect(host.port().readValue(MAIL_TARGET, 'Letter_A')).toBe('edited while off')
  })

  it('drops the sibling records once they run empty', () => {
    host.port().stageEntryMeta(MAIL_TARGET, 'Letter_A', { enabled: false, label: 'Intro letter' })
    host.port().stageEntryMeta(MAIL_TARGET, 'Letter_A', { enabled: true, label: null })

    expect(host.editorState('patch-1')).toEqual({ entries: { Letter_B: 'body b', Letter_A: 'body a' } })
  })

  it('carries the label and the disabled state through a rename', () => {
    host.port().stageEntryMeta(MAIL_TARGET, 'Letter_A', { label: 'Intro letter' })
    host.port().stageEntryMeta(MAIL_TARGET, 'Letter_B', { enabled: false })
    host.port().renameEntry(MAIL_TARGET, 'Letter_A', 'Letter_Intro')
    host.port().renameEntry(MAIL_TARGET, 'Letter_B', 'Letter_Late')

    expect(host.port().readEntryMeta(MAIL_TARGET, 'Letter_Intro')).toEqual({ enabled: true, label: 'Intro letter' })
    expect(host.port().readEntryMeta(MAIL_TARGET, 'Letter_Late')).toEqual({ enabled: false, label: null })
    expect(host.port().readValue(MAIL_TARGET, 'Letter_Late')).toBe('body b')
  })

  it('refuses a rename onto a taken key, including a disabled one', () => {
    expect(() => host.port().renameEntry(MAIL_TARGET, 'Letter_A', 'Letter_B')).toThrow(/already exists/u)

    host.port().stageEntryMeta(MAIL_TARGET, 'Letter_B', { enabled: false })
    expect(() => host.port().renameEntry(MAIL_TARGET, 'Letter_A', 'Letter_B')).toThrow(/already exists/u)
  })

  it('forgets the label when the entry is deleted', () => {
    host.port().stageEntryMeta(MAIL_TARGET, 'Letter_A', { label: 'Intro letter' })
    host.port().stageValue(MAIL_TARGET, 'Letter_A', null)

    expect(host.editorState('patch-1')).toEqual({ entries: { Letter_B: 'body b' } })
    host.port().stageValue(MAIL_TARGET, 'Letter_A', 'recreated')
    expect(host.port().readEntryMeta(MAIL_TARGET, 'Letter_A').label).toBeNull()
  })
})

describe('asset draft port draft binding', () => {
  it('reads nothing from a draft whose patches were replaced by another project', () => {
    const first = mountDraftPort([makeTestPatch('patch-1', MAIL_TARGET, { entries: { Letter_A: 'body a' } })])
    expect(first.port().listEntries(MAIL_TARGET)).toEqual(['Letter_A'])

    // Switching projects hands the port a different draft; nothing of the old
    // one survives, because the port holds no cache of its own.
    const second = mountDraftPort([makeTestPatch('patch-9', 'Data/TriggerActions', { entries: { T1: { Id: 'T1' } } })])
    expect(second.port().hasAsset(MAIL_TARGET)).toBe(false)
    expect(second.port().listEntries(MAIL_TARGET)).toEqual([])
    expect(second.port().readValue(MAIL_TARGET, 'Letter_A')).toBeUndefined()
    expect(second.port().listEntries('Data/TriggerActions')).toEqual(['T1'])
  })

  it('tolerates a foreign editor state instead of dropping the patch', () => {
    const host = mountDraftPort([makeTestPatch('patch-1', MAIL_TARGET, 'not an object')])

    expect(host.port().listEntries(MAIL_TARGET)).toEqual([])
    host.port().stageValue(MAIL_TARGET, 'Letter_A', 'body a')
    expect(host.port().readValue(MAIL_TARGET, 'Letter_A')).toBe('body a')
  })

  it('reads Pascal-cased entries imported from a content.json', () => {
    const host = mountDraftPort([makeTestPatch('patch-1', MAIL_TARGET, { Entries: { Letter_A: 'body a' } })])

    expect(host.port().listEntries(MAIL_TARGET)).toEqual(['Letter_A'])
    expect(host.port().readValue(MAIL_TARGET, 'Letter_A')).toBe('body a')
  })
})
