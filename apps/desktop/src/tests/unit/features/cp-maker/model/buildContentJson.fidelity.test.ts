import { describe, expect, it } from 'vite-plus/test'
import { buildContentJson } from '@features/cp-maker'
import { makeTestDraft, makeTestPatch, mountDraftPort } from '@test/draftPortHost'
import type { CpMakerDraft, DraftPatch } from '@features/cp-maker'

const MAIL_TARGET = 'Data/mail'

type CpChange = Record<string, unknown>

/** Parses the pack back the way Content Patcher reads it: content.json plus its includes. */
function readPack(draft: CpMakerDraft) {
  const built = buildContentJson(draft)
  const content = JSON.parse(built.contentJson) as { Format: string; Changes: CpChange[] }
  const files = new Map(built.includeFiles.map((file) => [file.relativePath, JSON.parse(file.content) as { Changes: CpChange[] }]))
  const changes = content.Changes.flatMap((change) =>
    change['Action'] === 'Include' ? (files.get(String(change['FromFile']))?.Changes ?? []) : [change],
  )
  return { content, changes, text: [built.contentJson, ...built.includeFiles.map((file) => file.content)].join('\n') }
}

function mailDraft(patches: DraftPatch[]): CpMakerDraft {
  return makeTestDraft('fidelity', patches)
}

describe('content.json export fidelity', () => {
  it('keeps the pack format the game and CP agree on', () => {
    const { content } = readPack(mailDraft([makeTestPatch('p1', MAIL_TARGET, { entries: { A: 'a' } }, { workspace: 'mail' })]))
    expect(content.Format).toBe('2.9.0')
    expect(content.Changes).toEqual([{ Action: 'Include', FromFile: 'changes/mail.json' }])
  })

  it('exports enabled entries with their patch config intact', () => {
    const { changes } = readPack(
      mailDraft([
        makeTestPatch(
          'p1',
          MAIL_TARGET,
          { entries: { '{{ModId}}_Intro': 'Welcome!' } },
          { workspace: 'mail', logName: 'Mail letters', when: { Season: 'spring' } },
        ),
      ]),
    )

    expect(changes).toEqual([
      {
        Action: 'EditData',
        Target: MAIL_TARGET,
        Entries: { '{{ModId}}_Intro': 'Welcome!' },
        LogName: 'Mail letters',
        When: { Season: 'spring' },
      },
    ])
  })

  it('leaves a switched-off entry out of the pack', () => {
    const host = mountDraftPort([makeTestPatch('p1', MAIL_TARGET, { entries: { Keep: 'keep', Off: 'off' } }, { workspace: 'mail' })])
    host.port().stageEntryMeta(MAIL_TARGET, 'Off', { enabled: false })

    const { changes, text } = readPack(mailDraft(host.patches()))
    expect(changes[0]!['Entries']).toEqual({ Keep: 'keep' })
    expect(text).not.toContain('"Off"')
  })

  it('drops a key that a stale draft lists as both enabled and disabled', () => {
    // An import or a pre-port draft can carry the key twice; the author's
    // switch-off has to win over the leftover enabled copy.
    const { changes } = readPack(
      mailDraft([
        makeTestPatch(
          'p1',
          MAIL_TARGET,
          { entries: { Keep: 'keep', Off: 'stale' }, disabledEntries: { Off: 'off' } },
          { workspace: 'mail' },
        ),
      ]),
    )
    expect(changes[0]!['Entries']).toEqual({ Keep: 'keep' })
  })

  it('skips a patch whose entries are all switched off instead of writing an empty change', () => {
    const { content, changes } = readPack(
      mailDraft([makeTestPatch('p1', MAIL_TARGET, { entries: {}, disabledEntries: { Off: 'off' } }, { workspace: 'mail' })]),
    )
    expect(changes).toEqual([])
    expect(content.Changes).toEqual([])
  })

  it('keeps editor-only metadata out of every emitted change', () => {
    const host = mountDraftPort([makeTestPatch('p1', MAIL_TARGET, { entries: { Intro: 'body' } }, { workspace: 'mail' })])
    host.port().stageEntryMeta(MAIL_TARGET, 'Intro', { label: 'Opening letter' })

    const { changes, text } = readPack(
      mailDraft([
        ...host.patches(),
        // The dialogue page keeps its labels under `titles`, and a non-EditData
        // patch forwards unknown editor state verbatim — both paths must filter.
        makeTestPatch(
          'p2',
          'Characters/Dialogue/Abigail',
          { entries: { Mon: 'Hi' }, titles: { Mon: 'Monday' } },
          { workspace: 'dialogue' },
        ),
        makeTestPatch(
          'p3',
          'Portraits/Abigail',
          { entryLabels: { X: 'x' }, titles: { X: 't' }, disabledEntries: { X: 1 }, patchMode: 'Overlay' },
          { workspace: 'characters', action: 'EditImage', fromFile: 'assets/abigail.png' },
        ),
      ]),
    )

    for (const key of ['entryLabels', 'titles', 'disabledEntries']) {
      expect(text).not.toContain(key)
    }
    expect(changes.find((change) => change['Target'] === 'Portraits/Abigail')).toEqual({
      Action: 'EditImage',
      Target: 'Portraits/Abigail',
      FromFile: 'assets/abigail.png',
      PatchMode: 'Overlay',
    })
  })

  it('round-trips a draft the port wrote, entry values and order included', () => {
    const host = mountDraftPort([makeTestPatch('p1', 'Data/Objects', { entries: {} }, { workspace: 'items' })])
    const port = host.port()
    port.stageValues('Data/Objects', {
      '{{ModId}}_Apple': { Name: 'Apple', Price: 50 },
      '{{ModId}}_Pear': { Name: 'Pear', Price: 80 },
      '{{ModId}}_Plum': { Name: 'Plum', Price: 30 },
    })
    host.port().stageEntryMeta('Data/Objects', '{{ModId}}_Pear', { enabled: false, label: 'Not ready' })
    host.port().renameEntry('Data/Objects', '{{ModId}}_Plum', '{{ModId}}_Damson')

    const { changes } = readPack(mailDraft(host.patches()))
    expect(Object.keys(changes[0]!['Entries'] as Record<string, unknown>)).toEqual(['{{ModId}}_Apple', '{{ModId}}_Damson'])
    expect(changes[0]!['Entries']).toEqual({
      '{{ModId}}_Apple': { Name: 'Apple', Price: 50 },
      '{{ModId}}_Damson': { Name: 'Plum', Price: 30 },
    })
  })

  it('merges patches that share a target and config, and splits those that do not', () => {
    const { changes } = readPack(
      mailDraft([
        makeTestPatch('p1', MAIL_TARGET, { entries: { A: 'a' } }, { workspace: 'mail' }),
        makeTestPatch('p2', MAIL_TARGET, { entries: { B: 'b' } }, { workspace: 'mail' }),
        makeTestPatch('p3', MAIL_TARGET, { entries: { C: 'c' } }, { workspace: 'mail', when: { Season: 'winter' } }),
      ]),
    )

    expect(changes).toHaveLength(2)
    expect(changes[0]!['Entries']).toEqual({ A: 'a', B: 'b' })
    expect(changes[1]!['Entries']).toEqual({ C: 'c' })
    expect(changes[1]!['When']).toEqual({ Season: 'winter' })
  })

  it('keeps a string Enabled token verbatim through parse and export', () => {
    // The parser stores a string `enabled` as-is (never coerced to boolean); an
    // untouched token must reach the pack unchanged and keep the patch active.
    const { changes } = readPack(
      mailDraft([makeTestPatch('p1', MAIL_TARGET, { entries: { A: 'a' } }, { workspace: 'mail', enabled: '{{EnableMail}}' })]),
    )
    expect(changes[0]!['Enabled']).toBe('{{EnableMail}}')
  })

  it('drops a stale patch-level FromFile for EditMap once the card model has no file card', () => {
    const { changes } = readPack(
      mailDraft([
        makeTestPatch(
          'p1',
          'Maps/Town',
          { changes: [{ id: 'tiles-1', type: 'tiles', mapTiles: [{ layer: 'Back', x: 1, y: 2 }] }] },
          { workspace: 'map', action: 'EditMap', fromFile: 'assets/maps/Stale.tbin' },
        ),
      ]),
    )
    expect(changes[0]!['FromFile']).toBeUndefined()
    expect(changes[0]!['MapTiles']).toEqual([{ Layer: 'Back', Position: { X: 1, Y: 2 } }])
  })

  it('exports the patch-level FromFile for an EditMap file card', () => {
    const { changes } = readPack(
      mailDraft([
        makeTestPatch(
          'p1',
          'Maps/Town',
          {
            changes: [
              { id: 'file-1', type: 'file', fromArea: { x: 0, y: 0, width: 1, height: 1 }, toArea: { x: 5, y: 5, width: 1, height: 1 } },
            ],
          },
          { workspace: 'map', action: 'EditMap', fromFile: 'assets/maps/Source.tbin' },
        ),
      ]),
    )
    expect(changes[0]!['FromFile']).toBe('assets/maps/Source.tbin')
    expect(changes[0]!['FromArea']).toEqual({ X: 0, Y: 0, Width: 1, Height: 1 })
  })
})
