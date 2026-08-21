import { describe, expect, test } from 'vite-plus/test'
import { GAME_MUSIC_COMMON_CUES, resolveGameAudioCueKind } from '@entities/map/lib/musicCues'

describe('resolveGameAudioCueKind', () => {
  test('known vanilla music cues classify as music regardless of scanner fallback', () => {
    expect(resolveGameAudioCueKind('spring1', 'sound')).toBe('music')
    expect(resolveGameAudioCueKind('wavy', 'sound')).toBe('music')
    expect(resolveGameAudioCueKind('IslandMusic', 'sound')).toBe('music')
  })

  test('unknown cues keep the scanner fallback', () => {
    expect(resolveGameAudioCueKind('coin', 'sound')).toBe('sound')
    expect(resolveGameAudioCueKind('customModTrack', 'music')).toBe('music')
  })

  test('cue matching is exact (no case folding)', () => {
    expect(resolveGameAudioCueKind('SPRING1', 'sound')).toBe('sound')
  })

  test('every listed music cue resolves to music', () => {
    for (const cue of GAME_MUSIC_COMMON_CUES) {
      expect(resolveGameAudioCueKind(cue, 'sound')).toBe('music')
    }
  })
})
