import { describe, expect, test } from 'vite-plus/test'
import type { DraftPatch } from '@shared/contracts'
import { buildEventResourceRegistry } from './eventResourceRegistry'

function patch(editorEntries: Record<string, string>): DraftPatch {
  return {
    id: 'event-registry-test',
    workspace: 'events',
    action: 'EditData',
    target: 'Data/Events/Town',
    logName: 'Town events',
    enabled: true,
    editorState: {
      entries: editorEntries,
    },
  }
}

describe('buildEventResourceRegistry', () => {
  test('keeps spring2 as music and collects scene, command, and project resources', () => {
    const currentPatch = patch({
      '900001/Season spring':
        'spring2/12 45/farmer 12 47 0 Abigail 12 45 2/skippable/playSound doorClose/addObject 13 47 "(O)72"/changeLocation Beach/end dialogue',
    })

    const registry = buildEventResourceRegistry({
      patch: currentPatch,
      draftPatches: [
        currentPatch,
        patch({
          '900002/Season summer': 'wavy/follow/Elliott 34 14 3/playMusic event1/playSound waves/itemAboveHead "(O)372"/end dialogue',
        }),
      ],
      entries: (currentPatch.editorState as { entries: Record<string, unknown> }).entries,
      eventLocations: {
        '900001/Season spring': 'Town',
        '900002/Season summer': 'Beach',
      },
      actorAssets: {
        Abigail: {
          spriteUrl: 'data:image/png;base64,actor',
          portraitUrl: 'data:image/png;base64,portrait',
        },
      },
      locale: 'en-US',
    })

    expect(registry.music.some((option) => option.value === 'spring2')).toBe(true)
    expect(registry.location.some((option) => option.value === 'spring2')).toBe(false)
    expect(registry.location.some((option) => option.value === 'Beach')).toBe(true)
    expect(registry.actor.find((option) => option.value === 'Abigail')?.preview).toBe('data:image/png;base64,portrait')
    expect(registry.item.some((option) => option.value === '(O)72')).toBe(true)
    expect(registry.sound.some((option) => option.value === 'waves')).toBe(true)
  })
})
