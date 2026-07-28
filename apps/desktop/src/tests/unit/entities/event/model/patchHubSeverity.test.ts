import { describe, expect, it } from 'vite-plus/test'
import { buildEventPatchHubPatches } from '@entities/event'
import type { EventPatchHubSourcePatch } from '@entities/event'

/** A script the game accepts: music, camera, actors, one line, then `end`. */
const CLEAN_SCRIPT = 'continue/64 15/Abigail 20 20 2 farmer 21 21 0/speak Abigail "Hi there!"/end'

function sourcePatch(
  id: string,
  entries: Record<string, unknown>,
  overrides: Partial<EventPatchHubSourcePatch> = {},
): EventPatchHubSourcePatch {
  return {
    id,
    workspace: 'events',
    action: 'EditData',
    target: 'Data/Events/Town',
    logName: `Patch ${id}`,
    enabled: true,
    editorState: { entries },
    ...overrides,
  }
}

function hubEvents(patches: EventPatchHubSourcePatch[]) {
  return buildEventPatchHubPatches(patches).flatMap((patch) => patch.events)
}

describe('event hub severity', () => {
  it('marks a script that validates cleanly as done', () => {
    const [event] = hubEvents([sourcePatch('p1', { '1000/Friendship Abigail 500': CLEAN_SCRIPT })])

    expect(event?.severity).toBe('ok')
    expect(event?.status).toBe('done')
    expect(event?.issueCount).toBe(0)
  })

  it('notes a legacy precondition alias without downgrading the severity', () => {
    const [event] = hubEvents([sourcePatch('p1', { '1000/f Abigail 500': CLEAN_SCRIPT })])

    expect(event?.severity).toBe('ok')
    expect(event?.status).toBe('draft')
    expect(event?.issues.map((issue) => [issue.severity, issue.code])).toEqual([['info', 'eventPreconditionDeprecated']])
  })

  it('reports a script that never hands control back as an error', () => {
    const [event] = hubEvents([sourcePatch('p1', { '1000': 'continue/64 15/Abigail 20 20 2/speak Abigail "Hi!"' })])

    expect(event?.severity).toBe('error')
    expect(event?.status).toBe('error')
    expect(event?.issues.map((issue) => issue.code)).toEqual(['eventMissingEnd'])
  })

  it('reports a truncated scene setup and an empty script', () => {
    const events = hubEvents([sourcePatch('p1', { '1000': 'continue/64 15', '1001': '   ' })])

    expect(events.map((event) => event.issues.map((issue) => issue.code))).toEqual([
      ['eventSceneSetupIncomplete', 'eventMissingEnd'],
      ['eventScriptEmpty'],
    ])
  })

  it('warns about an unknown command and an actor missing from the setup line', () => {
    const [event] = hubEvents([
      sourcePatch('p1', { '1000': 'continue/64 15/Abigail 20 20 2/teleportEveryone 3/speak Sebastian "Hi!"/end' }),
    ])

    expect(event?.severity).toBe('warn')
    expect(event?.status).toBe('draft')
    expect(event?.issues.map((issue) => issue.code)).toEqual(['eventCommandUnknown', 'eventActorNotInScene'])
    expect(event?.issues[0]?.params?.['command']).toBe('teleportEveryone')
    expect(event?.issues[1]?.params?.['actor']).toBe('Sebastian')
  })

  it('accepts the farmer and mod tokens as actors without a setup entry', () => {
    const [event] = hubEvents([
      sourcePatch('p1', { '1000': 'continue/64 15/Abigail 20 20 2/speak farmer "Hi!"/speak {{ModId}}_Aspen "Hello"/end' }),
    ])

    expect(event?.issueCount).toBe(0)
  })

  it('flags an unrecognised precondition on the entry key', () => {
    const [event] = hubEvents([sourcePatch('p1', { [`1000/notARealCondition 3`]: CLEAN_SCRIPT })])

    expect(event?.severity).toBe('warn')
    expect(event?.issues.map((issue) => [issue.code, issue.params?.['precondition']])).toEqual([
      ['eventPreconditionUnknown', 'notARealCondition'],
    ])
  })

  it('flags the same event key claimed by two patches on one target', () => {
    const patches = buildEventPatchHubPatches([
      sourcePatch('p1', { '1000': CLEAN_SCRIPT }),
      sourcePatch('p2', { '1000': CLEAN_SCRIPT }),
      sourcePatch('p3', { '1000': CLEAN_SCRIPT }, { target: 'Data/Events/Beach' }),
    ])

    expect(patches.map((patch) => patch.stats.errors)).toEqual([1, 1, 0])
    expect(patches[0]?.events[0]?.issues.map((issue) => issue.code)).toEqual(['duplicateEntryKey'])
    expect(patches[2]?.events[0]?.status).toBe('done')
  })

  it('keeps a switched-off event out of the status ladder but still counts its findings', () => {
    const [event] = hubEvents([
      sourcePatch(
        'p1',
        { '1000': 'continue/64 15/Abigail 20 20 2/speak Abigail "Hi!"' },
        { editorState: { entries: { '1000': 'continue/64 15/Abigail 20 20 2/speak Abigail "Hi!"' }, disabledEventKeys: ['1000'] } },
      ),
    ])

    expect(event?.status).toBe('disabled')
    expect(event?.severity).toBe('error')
  })

  it('rolls per-event findings up into patch statistics', () => {
    const [patch] = buildEventPatchHubPatches([
      sourcePatch('p1', {
        '1000': CLEAN_SCRIPT,
        '1001': 'continue/64 15/Abigail 20 20 2/speak Abigail "Hi!"',
        '1002': 'continue/64 15/Abigail 20 20 2/teleportEveryone 3/end',
      }),
    ])

    expect(patch?.stats.errors).toBe(1)
    expect(patch?.stats.warnings).toBe(1)
    expect(patch?.stats.events).toBe(3)
  })
})
