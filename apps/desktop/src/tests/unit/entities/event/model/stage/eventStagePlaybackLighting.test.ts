import { describe, expect, test } from 'vite-plus/test'
import { parseEventCommand } from '@entities/event/model/parser'
import { continuePlayback } from '@entities/event/model/stage/eventStagePlayback'
import { deriveEventSeason, deriveEventStageLighting } from '@entities/event/model/stage/eventStageLighting'
import { appendLanternLight, createInitialPlaybackState } from '@entities/event/model/stage/eventStageShared'
import type { StageLanternLight } from '@entities/event/model/stage/eventStageShared'
import type { EventScript } from '@entities/event/model/types'
import { MINE_LIGHTMAP_COLOR, deriveOutdoorLightmapColor } from '@entities/map/model/lighting'
import type { MapDocument } from '@entities/map'
import type { EventStageCopy } from '@locales/api'

function eventWithScript(key: string, rawScript: string, preconditions: string[] = [key], actorName = 'Abigail'): EventScript {
  const rawSegments = rawScript.split('/')
  return {
    key,
    eventId: key,
    preconditions,
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

function stageMap(name: string, properties: Record<string, string> = {}) {
  return { name, properties } as unknown as MapDocument
}

const copy = {
  playbackHaltedTitle: 'Playback halted',
  playbackHaltedDetail: 'Event loop detected',
} as unknown as EventStageCopy

describe('event season preconditions', () => {
  test('defaults to spring without a Season precondition', () => {
    expect(deriveEventSeason(eventWithScript('4', 'nightTime/continue 64 15/farmer 47 95 2/end', ['4', 't 900 1830']))).toBe('spring')
  })

  test('reads the Season precondition', () => {
    expect(
      deriveEventSeason(eventWithScript('4', 'nightTime/continue 64 15/farmer 47 95 2/end', ['4', 'Season winter', 't 900 1830'])),
    ).toBe('winter')
  })
})

describe('event stage world lighting', () => {
  test('a pure daylight window outdoors produces no overlay', () => {
    const event = eventWithScript('900001', 'spring/follow/Abigail 12 45 2/end', ['900001', 't 600 1000', 'w sunny'])
    expect(deriveEventStageLighting({ event, mapDocument: stageMap('Town'), lanterns: [], ambientLightColor: null })).toBeNull()
  })

  test('a late-afternoon window (`t 900 1830`) darkens from its end time', () => {
    const event = eventWithScript('900001', 'spring/follow/Abigail 12 45 2/end', ['900001', 't 900 1830', 'w sunny'])
    const state = deriveEventStageLighting({ event, mapDocument: stageMap('Town'), lanterns: [], ambientLightColor: null })
    expect(state).not.toBeNull()
    expect(state!.baseColor).toEqual(deriveOutdoorLightmapColor(1830, 'spring'))
    expect(state!.glows).toEqual([])
  })

  test('the Season precondition switches the darkness schedule', () => {
    const event = eventWithScript('900001', 'fall/follow/Abigail 12 45 2/end', ['900001', 'Season fall', 't 1600 1750'])
    const state = deriveEventStageLighting({ event, mapDocument: stageMap('Town'), lanterns: [], ambientLightColor: null })
    expect(state!.baseColor).toEqual(deriveOutdoorLightmapColor(1750, 'fall'))
  })

  test('a mine map always uses the shaft lighting color', () => {
    const event = eventWithScript('900003', 'spring/follow/Abigail 12 45 2/end', ['900003', 't 600 1000'])
    const state = deriveEventStageLighting({ event, mapDocument: stageMap('UndergroundMine4'), lanterns: [], ambientLightColor: null })
    expect(state!.baseColor).toEqual(MINE_LIGHTMAP_COLOR)
  })

  test('an ambientLight command overrides every other base color', () => {
    const event = eventWithScript('900001', 'spring/follow/Abigail 12 45 2/end', ['900001', 't 600 1000'])
    const state = deriveEventStageLighting({
      event,
      mapDocument: stageMap('Town'),
      lanterns: [],
      ambientLightColor: { r: 12, g: 34, b: 56 },
    })
    expect(state!.baseColor).toEqual({ r: 12, g: 34, b: 56 })
  })

  test('lanterns become sconce-texture glows in the lightmap', () => {
    const event = eventWithScript('900001', 'spring/follow/Abigail 12 45 2/end', ['900001', 't 2100 2400'])
    const lanterns: StageLanternLight[] = [{ id: 'cmd:0:lantern', commandId: 'cmd:0', worldX: 46 * 64, worldY: 86 * 64, radius: 1 }]
    const state = deriveEventStageLighting({ event, mapDocument: stageMap('Town'), lanterns, ambientLightColor: null })
    expect(state!.glows).toHaveLength(1)
    expect(state!.glows[0]).toMatchObject({
      worldX: 46 * 64 + 32,
      worldY: 86 * 64 + 32,
      textureIndex: 4,
      scale: 1,
      color: { r: 0, g: 65, b: 128 },
    })
  })
})

describe('event stage addLantern lights', () => {
  test('addLantern emits a warm light at the tile position scaled to world pixels', () => {
    const event = eventWithScript('900001', 'spring/follow/Abigail 12 45 2/addLantern 735 46 86 1/message "lit"')
    const initial = createInitialPlaybackState(event, 'Town')
    expect(initial.lanternLights).toEqual([])

    const state = continuePlayback(initial, { '900001': event }, copy)

    expect(state.lanternLights).toHaveLength(1)
    expect(state.lanternLights[0]).toMatchObject({
      commandId: event.commands[0]!.id,
      worldX: 46 * 64,
      worldY: 86 * 64,
      radius: 1,
    })
    expect(state.currentEntry?.tone).toBe('command')
  })

  test('consecutive addLantern commands each emit their own light', () => {
    const event = eventWithScript('900001', 'spring/follow/Abigail 12 45 2/addLantern 735 46 86 1/addLantern 736 46 88 2')
    let state = createInitialPlaybackState(event, 'Town')
    state = continuePlayback(state, { '900001': event }, copy)
    state = continuePlayback(state, { '900001': event }, copy)

    expect(state.lanternLights).toHaveLength(2)
    expect(state.lanternLights[1]).toMatchObject({ commandId: event.commands[1]!.id, worldX: 46 * 64, worldY: 88 * 64, radius: 2 })
  })

  test('appendLanternLight replaces an earlier light from the same command id', () => {
    const first: StageLanternLight = { id: 'cmd:0:lantern', commandId: 'cmd:0', worldX: 1, worldY: 2, radius: 1 }
    const second: StageLanternLight = { id: 'cmd:0:lantern', commandId: 'cmd:0', worldX: 3, worldY: 4, radius: 2 }

    const replaced = appendLanternLight([first], second)

    expect(replaced).toHaveLength(1)
    expect(replaced[0]).toEqual(second)
  })
})

describe('event stage ambientLight command', () => {
  test('stores the parsed light color triple for the lighting overlay', () => {
    const event = eventWithScript('900001', 'spring/follow/Abigail 12 45 2/ambientLight 20 40 60/message "dim"')
    const initial = createInitialPlaybackState(event, 'Town')
    const state = continuePlayback(initial, { '900001': event }, copy)

    expect(state.ambientOverlayColor).toEqual({ r: 20, g: 40, b: 60 })
    expect(state.currentEntry?.tone).toBe('command')
  })
})
