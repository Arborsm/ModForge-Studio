import { describe, expect, test } from 'vite-plus/test'
import { parseEventCommand } from '../parser'
import { applyFarmerSingleAnimationCommand, applyMoveCommand, applyWarpCommand } from './eventStagePlaybackCommands'
import { createInitialPlaybackState, createItemAboveActorEffect, createItemAtTileEffect } from './eventStageShared'
import type { EventScript } from '../types'

function eventWithScript(rawScript: string, actorName = 'Abigail'): EventScript {
  const rawSegments = rawScript.split('/')
  return {
    key: '900001',
    eventId: '900001',
    preconditions: ['900001'],
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

describe('event stage playback movement commands', () => {
  test('applies graphically authored move paths as relative Stardew movement groups', () => {
    const event = eventWithScript('spring/follow/Abigail 12 45 2/move Abigail -2 -34 0 Abigail 2 0 1 Abigail 0 3 2')
    const initialState = createInitialPlaybackState(event, 'Town')
    const command = event.commands[0]!

    const result = applyMoveCommand(initialState.actors, command)

    expect(result.actors.abigail?.tileX).toBe(12)
    expect(result.actors.abigail?.tileY).toBe(14)
    expect(result.actors.abigail?.facingDirection).toBe(2)
    expect(result.durationMs).toBeGreaterThan(0)
  })

  test('treats player scene actors as the farmer for playback commands', () => {
    const event = eventWithScript('spring/follow/player 12 45 2/farmerAnimation 216', 'player')
    const initialState = createInitialPlaybackState(event, 'Town')

    expect(initialState.actors.player?.farmerRenderState).not.toBeNull()

    const result = applyFarmerSingleAnimationCommand(initialState.actors, 216)

    expect(result.player?.animation).not.toBeNull()
    expect(result.player?.farmerRenderState?.pauseForSingleAnimation).toBe(true)
  })

  test('applies optional warp facing direction to the actor frame state', () => {
    const event = eventWithScript('spring/follow/player 12 45 0/warp farmer 35 12 2', 'player')
    const initialState = createInitialPlaybackState(event, 'Town')
    const command = event.commands[0]!

    const result = applyWarpCommand(initialState.actors, command)

    expect(result.player?.tileX).toBe(35)
    expect(result.player?.tileY).toBe(12)
    expect(result.player?.facingDirection).toBe(2)
    expect(result.player?.frame).toBe(0)
    expect(result.player?.animation).toBeNull()
  })

  test('shows vanilla farmerAnimation frame ids that are not special multi-frame sequences', () => {
    const event = eventWithScript('spring/follow/player 12 45 2/farmerAnimation 7', 'player')
    const initialState = createInitialPlaybackState(event, 'Town')

    const result = applyFarmerSingleAnimationCommand(initialState.actors, 7)

    expect(result.player?.frame).toBe(7)
    expect(result.player?.animation?.frames[0]?.frame).toBe(7)
    expect(result.player?.farmerRenderState?.pauseForSingleAnimation).toBe(true)
  })

  test('anchors itemAboveHead objects to the actor head instead of the tile item offset', () => {
    const event = eventWithScript('spring/follow/player 12 45 2/itemAboveHead "(O)372"', 'player')
    const initialState = createInitialPlaybackState(event, 'Town')

    const effect = createItemAboveActorEffect('command-1', 'itemAboveHead', initialState.actors, 'farmer', '"(O)372"')

    expect(effect?.baseX).toBe(12 * 64)
    expect(effect?.baseY).toBe(45 * 64 - 96)
    expect(effect?.scale).toBe(4)
  })

  test('anchors object sheet items to the tile top-left for ground placement', () => {
    const effect = createItemAtTileEffect('command-1', 'addObject', 35, 12, '"(O)372"')

    expect(effect?.baseX).toBe(35 * 64)
    expect(effect?.baseY).toBe(12 * 64)
    expect(effect?.scale).toBe(4)
  })
})
