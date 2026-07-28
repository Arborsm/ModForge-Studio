import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { nextDraftEditMergeKey, tagNextDraftEdit, useDraftUndoStore } from '@features/cp-maker'
import { makeTestPatch, mountDraftPort } from '@test/draftPortHost'

function entriesOf(state: unknown): Record<string, unknown> {
  return (state as { entries: Record<string, unknown> }).entries
}

function history() {
  const { past, future } = useDraftUndoStore.getState()
  return { past: past.length, future: future.length }
}

beforeEach(() => {
  useDraftUndoStore.setState({ scopeKey: null, past: [], future: [], applying: false, pendingTag: null })
})

describe('draft undo stack', () => {
  it('walks a staged entry write back and forward again', () => {
    const host = mountDraftPort([makeTestPatch('p1', 'Data/Buildings', { entries: { Barn: { Name: 'Barn' } } })])

    host.port().stageValue('Data/Buildings', 'Silo', { Name: 'Silo' })
    expect(Object.keys(entriesOf(host.editorState('p1')))).toEqual(['Barn', 'Silo'])

    expect(host.port().undo()).toBe(true)
    expect(Object.keys(entriesOf(host.editorState('p1')))).toEqual(['Barn'])
    expect(history()).toEqual({ past: 0, future: 1 })

    expect(host.port().redo()).toBe(true)
    expect(entriesOf(host.editorState('p1'))['Silo']).toEqual({ Name: 'Silo' })
    expect(history()).toEqual({ past: 1, future: 0 })
  })

  it('reports nothing to walk on an untouched draft', () => {
    const host = mountDraftPort([makeTestPatch('p1', 'Data/Buildings', { entries: {} })])

    expect(host.port().undo()).toBe(false)
    expect(host.port().redo()).toBe(false)
  })

  it('folds a burst of writes to one entry into a single operation', () => {
    const host = mountDraftPort([makeTestPatch('p1', 'Data/Buildings', { entries: { Barn: { Name: 'B' } } })])

    for (const name of ['Ba', 'Bar', 'Barn']) {
      host.port().stageValue('Data/Buildings', 'Barn', { Name: name })
    }

    expect(history().past).toBe(1)
    host.port().undo()
    expect(entriesOf(host.editorState('p1'))['Barn']).toEqual({ Name: 'B' })
  })

  it('keeps writes to different entries as separate operations', () => {
    const host = mountDraftPort([makeTestPatch('p1', 'Data/Buildings', { entries: {} })])

    host.port().stageValue('Data/Buildings', 'Silo', { Name: 'Silo' })
    host.port().stageValue('Data/Buildings', 'Barn', { Name: 'Barn' })

    expect(history().past).toBe(2)
    host.port().undo()
    expect(Object.keys(entriesOf(host.editorState('p1')))).toEqual(['Silo'])
  })

  it('undoes a switched-off entry back into the exported record', () => {
    const host = mountDraftPort([makeTestPatch('p1', 'Data/Buildings', { entries: { Barn: { Name: 'Barn' } } })])

    host.port().stageEntryMeta('Data/Buildings', 'Barn', { enabled: false })
    expect(host.port().readEntryMeta('Data/Buildings', 'Barn').enabled).toBe(false)

    host.port().undo()
    expect(host.port().readEntryMeta('Data/Buildings', 'Barn').enabled).toBe(true)
    expect(Object.keys(entriesOf(host.editorState('p1')))).toEqual(['Barn'])
  })

  it('undoes a rename, key order included', () => {
    const host = mountDraftPort([makeTestPatch('p1', 'Data/Buildings', { entries: { Barn: { Name: 'Barn' }, Silo: { Name: 'Silo' } } })])

    host.port().renameEntry('Data/Buildings', 'Barn', 'BigBarn')
    expect(Object.keys(entriesOf(host.editorState('p1')))).toEqual(['BigBarn', 'Silo'])

    host.port().undo()
    expect(Object.keys(entriesOf(host.editorState('p1')))).toEqual(['Barn', 'Silo'])
  })

  it('drops the redo branch once a new operation is staged', () => {
    const host = mountDraftPort([makeTestPatch('p1', 'Data/Buildings', { entries: {} })])

    host.port().stageValue('Data/Buildings', 'Silo', { Name: 'Silo' })
    host.port().undo()
    expect(history()).toEqual({ past: 0, future: 1 })

    host.port().stageValue('Data/Buildings', 'Barn', { Name: 'Barn' })
    expect(history()).toEqual({ past: 1, future: 0 })
    expect(host.port().redo()).toBe(false)
  })

  it('never records the write an undo itself performs', () => {
    const host = mountDraftPort([makeTestPatch('p1', 'Data/Buildings', { entries: {} })])

    host.port().stageValue('Data/Buildings', 'Silo', { Name: 'Silo' })
    host.port().undo()
    host.port().redo()

    expect(history()).toEqual({ past: 1, future: 0 })
  })

  it('starts a fresh history when another draft is edited', () => {
    const first = mountDraftPort([makeTestPatch('p1', 'Data/Buildings', { entries: {} })])
    first.port().stageValue('Data/Buildings', 'Silo', { Name: 'Silo' })

    const second = mountDraftPort([makeTestPatch('p2', 'Data/Characters', { entries: {} })], 'draft-b')
    second.port().stageValue('Data/Characters', 'Abigail', { DisplayName: 'Abigail' })

    expect(history()).toEqual({ past: 1, future: 0 })
    second.port().undo()
    expect(history()).toEqual({ past: 0, future: 1 })
  })

  it('forgets the history when the draft is reloaded from disk', () => {
    const host = mountDraftPort([makeTestPatch('p1', 'Data/Buildings', { entries: {} })])

    host.port().stageValue('Data/Buildings', 'Silo', { Name: 'Silo' })
    host.port().revert()

    expect(history()).toEqual({ past: 0, future: 0 })
    expect(host.port().undo()).toBe(false)
  })

  it('keeps a tagged operation out of the neighbouring merge window', () => {
    const host = mountDraftPort([makeTestPatch('p1', 'Data/Buildings', { entries: { Barn: 'a' } })])

    tagNextDraftEdit('event:update:0')
    host.port().stageValue('Data/Buildings', 'Barn', 'ab')
    tagNextDraftEdit('event:update:0')
    host.port().stageValue('Data/Buildings', 'Barn', 'abc')
    expect(history().past).toBe(1)

    tagNextDraftEdit(nextDraftEditMergeKey('event:insert'))
    host.port().stageValue('Data/Buildings', 'Barn', 'abc/end')
    tagNextDraftEdit(nextDraftEditMergeKey('event:insert'))
    host.port().stageValue('Data/Buildings', 'Barn', 'abc/end/end')
    expect(history().past).toBe(3)

    host.port().undo()
    expect(entriesOf(host.editorState('p1'))['Barn']).toBe('abc/end')
  })

  it('undoes the first write into a freshly added patch once the patch has landed', () => {
    const host = mountDraftPort([])

    // A port closes over one render's draft, so the patch it just added is not
    // visible to it yet and staging into it is refused rather than recorded
    // outside the history. This is why pages defer the write by a render.
    const addingPort = host.port()
    const patchId = addingPort.addPatch('EditData', 'Data/Buildings') ?? ''
    expect(() => addingPort.stageValue('Data/Buildings', 'Barn', { Name: 'Barn' })).toThrow(/No EditData patch/u)
    expect(history()).toEqual({ past: 0, future: 0 })

    // Replayed on the next render, it is one undoable operation like any other.
    host.port().stageValue('Data/Buildings', 'Barn', { Name: 'Barn' })
    expect(history().past).toBe(1)

    host.port().undo()
    expect(host.editorState(patchId)).toEqual({})
  })

  it('ignores a write that changes nothing', () => {
    const host = mountDraftPort([makeTestPatch('p1', 'Data/Buildings', { entries: { Barn: 'a' } })])

    host.port().updatePatch('p1', { logName: host.patches()[0]?.logName ?? '' })

    expect(history()).toEqual({ past: 0, future: 0 })
  })

  it('walks patch metadata edits alongside entry edits', () => {
    const host = mountDraftPort([makeTestPatch('p1', 'Data/Buildings', { entries: {} }, { logName: 'Barn pack' })])

    host.port().updatePatch('p1', { logName: 'Barn pack v2' })
    expect(host.patches()[0]?.logName).toBe('Barn pack v2')

    host.port().undo()
    expect(host.patches()[0]?.logName).toBe('Barn pack')
  })
})
