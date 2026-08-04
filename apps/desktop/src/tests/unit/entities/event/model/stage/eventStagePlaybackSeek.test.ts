import { describe, expect, test } from 'vite-plus/test'
import { parseEventCommand } from '@entities/event/model/parser'
import { seekPlaybackToEntry } from '@entities/event/model/stage/eventStagePlayback'
import { createInitialPlaybackState } from '@entities/event/model/stage/eventStageShared'
import type { EventScript } from '@entities/event/model/types'
import type { EventStageCopy } from '@locales/api'

function eventWithScript(key: string, rawScript: string, actorName = 'Abigail'): EventScript {
  const rawSegments = rawScript.split('/')
  return {
    key,
    eventId: key,
    preconditions: [key],
    rawScript,
    rawSegments,
    scene: {
      musicCue: rawSegments[0] ?? null,
      cameraInstruction: rawSegments[1] ?? null,
      characterInstruction: rawSegments[2] ?? null,
      actors: [{ id: `${actorName}:0`, actorName, tileX: 12, tileY: 45, facingDirection: 2 }],
    },
    commands: rawSegments.slice(3).map((rawCommand, index) => parseEventCommand(rawCommand, index)),
  }
}

const copy = {
  playbackHaltedTitle: 'Playback halted',
  playbackHaltedDetail: 'Event loop detected',
} as unknown as EventStageCopy

describe('event stage playback seek across interactive choices', () => {
  test('seek past a quickQuestion reaches the later entry instead of sticking on the pending question', () => {
    const event = eventWithScript(
      '900001',
      'spring/follow/Abigail 12 45 2/quickQuestion "What#Yes#No\\pause 100\\pause 200"/message "after choice"/end',
    )
    // Commands: [0] quickQuestion, [1] message, [2] end. Resolving the first
    // branch injects `pause 100` with id cmd:1, so `cmd:2` (end) is the first
    // id past the injected branch and the original tail.
    const target = event.commands[2]!

    const state = seekPlaybackToEntry(event, { '900001': event }, target.id, 'Town', copy)

    expect(state.pendingChoice).toBeNull()
    expect(state.currentCommandId).toBe(target.id)
    expect(state.ended).toBe(true)
    expect(state.currentEntry?.tone).toBe('system')
  })

  test('seek to the quickQuestion itself keeps the pending question for the user to answer', () => {
    const event = eventWithScript('900001', 'spring/follow/Abigail 12 45 2/quickQuestion "What#Yes#No\\pause 100\\pause 200"/end')
    const target = event.commands[0]!

    const state = seekPlaybackToEntry(event, { '900001': event }, target.id, 'Town', copy)

    expect(state.pendingChoice).not.toBeNull()
    expect(state.pendingChoice?.choices).toHaveLength(2)
    expect(state.currentCommandId).toBe(target.id)
    expect(state.ended).toBe(false)
  })

  test('seek past an embedded $q speak question auto-resolves the branch and continues', () => {
    const event = eventWithScript(
      '900001',
      'spring/follow/Abigail 12 45 2/speak Abigail "$q 847951 null#Ask?#$r 847951 10 none#Yes#$r 847951 0 none#No"/pause 200/message "done"/end',
    )
    const target = event.commands[2]!

    const state = seekPlaybackToEntry(event, { '900001': event }, target.id, 'Town', copy)

    expect(state.pendingChoice).toBeNull()
    expect(state.currentCommandId).toBe(target.id)
    expect(state.currentEntry?.detail).toContain('done')
  })

  test('seek starting from a paused command still clears waits and lands on the target', () => {
    const event = eventWithScript('900001', 'spring/follow/Abigail 12 45 2/pause 10000/message "later"/end')
    const target = event.commands[1]!

    const state = seekPlaybackToEntry(event, { '900001': event }, target.id, 'Town', copy)

    expect(state.currentCommandId).toBe(target.id)
    expect(state.waitingMs).toBeNull()
    expect(state.currentEntry?.detail).toContain('later')
    const initial = createInitialPlaybackState(event, 'Town')
    expect(initial.waitingMs).toBeNull()
  })
})
