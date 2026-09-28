import { describe, expect, test } from 'vite-plus/test'
import { parseEventCommand } from '@entities/event/model/parser'
import { continuePlayback } from '@entities/event/model/stage/eventStagePlayback'
import { createInitialPlaybackState } from '@entities/event/model/stage/eventStageShared'
import type { PlaybackState } from '@entities/event/model/stage/eventStageShared'
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

function isHalted(state: PlaybackState) {
  return state.ended && state.notices.some((notice) => notice.id === 'playback:halted')
}

describe('event stage playback loop guard', () => {
  test('halts a switchEvent cycle between two events instead of running forever', () => {
    const eventA = eventWithScript('900001', 'spring/follow/Abigail 12 45 2/switchEvent 900002')
    const eventB = eventWithScript('900002', 'spring/follow/Abigail 12 45 2/switchEvent 900001')
    const eventIndex = { '900001': eventA, '900002': eventB }

    let state = createInitialPlaybackState(eventA, 'Town')
    for (let step = 0; step < 20 && !state.ended; step += 1) {
      state = continuePlayback(state, eventIndex, copy)
    }

    expect(isHalted(state)).toBe(true)
    expect(state.currentEntry?.tone).toBe('system')
    expect(state.waitingMs).toBeNull()
    expect(state.stageEffects.length).toBeLessThanOrEqual(2)
  })

  test('halts a self-referential switchEvent within a single call', () => {
    const eventA = eventWithScript('900001', 'spring/follow/Abigail 12 45 2/switchEvent 900001')
    const eventIndex = { '900001': eventA }

    const state = continuePlayback(createInitialPlaybackState(eventA, 'Town'), eventIndex, copy)

    expect(isHalted(state)).toBe(true)
  })

  test('bounds a loop longer than a single batch via the step budget across calls', () => {
    const eventCount = 400
    const events: Record<string, EventScript> = {}
    for (let index = 0; index < eventCount; index += 1) {
      const nextIndex = index + 1 === eventCount ? 0 : index + 1
      const key = `900000${index}`
      events[key] = eventWithScript(key, `spring/follow/Abigail 12 45 2/switchEvent 900000${nextIndex}`)
    }

    let state = createInitialPlaybackState(events['9000000']!, 'Town')
    let calls = 0
    while (!state.ended && calls < 400) {
      state = continuePlayback(state, events, copy)
      calls += 1
    }

    expect(isHalted(state)).toBe(true)
    expect(calls).toBeLessThan(400)
    expect(state.executionCount).toBeLessThanOrEqual(4_000)
  })

  test('caps stageEffects when a switch loop re-executes specificTemporarySprite commands', () => {
    const eventA = eventWithScript('900001', 'spring/follow/Abigail 12 45 2/specificTemporarySprite abbyGraveyard/switchEvent 900002')
    const eventB = eventWithScript('900002', 'spring/follow/Abigail 12 45 2/switchEvent 900001')
    const eventIndex = { '900001': eventA, '900002': eventB }

    let state = createInitialPlaybackState(eventA, 'Town')
    for (let step = 0; step < 700; step += 1) {
      state = continuePlayback(state, eventIndex, copy)
    }

    expect(state.stageEffects.length).toBeLessThanOrEqual(600)
  })

  test('caps stageEffects growth when a switch loop re-executes temporary sprite commands', () => {
    const eventA = eventWithScript('900001', 'spring/follow/Abigail 12 45 2/temporarySprite 20 20 0 4 300 false 0.1/switchEvent 900002')
    const eventB = eventWithScript('900002', 'spring/follow/Abigail 12 45 2/switchEvent 900001')
    const eventIndex = { '900001': eventA, '900002': eventB }

    let state = createInitialPlaybackState(eventA, 'Town')
    for (let step = 0; step < 700; step += 1) {
      state = continuePlayback(state, eventIndex, copy)
    }

    expect(state.stageEffects.length).toBeLessThanOrEqual(600)
  })

  test('keeps playing a single branch into another event without halting', () => {
    const eventA = eventWithScript('900001', 'spring/follow/Abigail 12 45 2/switchEvent 900002')
    const eventB = eventWithScript('900002', 'spring/follow/Abigail 12 45 2/message "Branch reached"/end')
    const eventIndex = { '900001': eventA, '900002': eventB }

    let state = createInitialPlaybackState(eventA, 'Town')
    state = continuePlayback(state, eventIndex, copy)

    expect(state.ended).toBe(false)
    expect(state.currentEntry?.tone).toBe('message')
    expect(state.currentEntry?.detail).toContain('Branch reached')

    state = continuePlayback(state, eventIndex, copy)
    expect(state.ended).toBe(true)
    expect(state.notices.some((notice) => notice.id === 'playback:halted')).toBe(false)
  })
})
