import { describe, expect, it } from 'vite-plus/test'
import { buildAudioTileRows, buildQuickPlayRequest, filterAudioCues } from '@pages/workbench/workspaces/audio/state/audioCatalog'
import type { AudioCueEntry } from '@pages/workbench/workspaces/audio/state/useAudioWorkspace'

function cue(partial: Partial<AudioCueEntry> & { id: string }): AudioCueEntry {
  return {
    cue: partial.id,
    label: partial.id,
    kind: 'sound',
    source: 'Game assets',
    sourceKind: 'game',
    category: null,
    relativePath: null,
    absolutePath: `C:/game/${partial.id}.wav`,
    isXact: false,
    format: 'wav',
    ...partial,
  }
}

describe('filterAudioCues', () => {
  const cues = [
    cue({ id: 'spring', kind: 'music' }),
    cue({ id: 'doorCreak', kind: 'sound' }),
    cue({ id: 'rain', kind: 'sound', category: 'ambient' }),
  ]

  it('returns every cue without text and with the all kind filter', () => {
    expect(filterAudioCues(cues, '', 'all')).toHaveLength(3)
    expect(filterAudioCues(cues, '   ', 'all')).toHaveLength(3)
  })

  it('filters by kind before applying text', () => {
    expect(filterAudioCues(cues, '', 'music').map((entry) => entry.id)).toEqual(['spring'])
    expect(filterAudioCues(cues, 'rain', 'music')).toHaveLength(0)
  })

  it('matches text against cue, label, source, and category', () => {
    expect(filterAudioCues(cues, 'DOOR', 'all').map((entry) => entry.id)).toEqual(['doorCreak'])
    expect(filterAudioCues(cues, 'ambient', 'all').map((entry) => entry.id)).toEqual(['rain'])
    expect(filterAudioCues(cues, 'game assets', 'all')).toHaveLength(3)
    expect(filterAudioCues(cues, 'missing', 'all')).toHaveLength(0)
  })
})

describe('buildAudioTileRows', () => {
  const groups = {
    music: [cue({ id: 'a', kind: 'music' }), cue({ id: 'b', kind: 'music' }), cue({ id: 'c', kind: 'music' })],
    sound: [cue({ id: 'd' }), cue({ id: 'e' })],
  }

  it('emits a header per non-empty group followed by chunked tile rows', () => {
    const rows = buildAudioTileRows(groups, 2)
    expect(rows.map((row) => row.kind)).toEqual(['header', 'tiles', 'tiles', 'header', 'tiles'])
    expect(rows[0]).toMatchObject({ group: 'music', count: 3 })
    expect(rows[1]?.kind === 'tiles' && rows[1].cues.map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(rows[2]?.kind === 'tiles' && rows[2].cues.map((entry) => entry.id)).toEqual(['c'])
    expect(rows[4]?.kind === 'tiles' && rows[4].cues.map((entry) => entry.id)).toEqual(['d', 'e'])
  })

  it('skips empty groups', () => {
    const rows = buildAudioTileRows({ music: [], sound: groups.sound }, 3)
    expect(rows.map((row) => row.kind)).toEqual(['header', 'tiles'])
    expect(rows[0]).toMatchObject({ group: 'sound', count: 2 })
  })

  it('clamps column counts below 1 to a single column', () => {
    const rows = buildAudioTileRows(groups, 0)
    const tileRows = rows.filter((row) => row.kind === 'tiles')
    expect(tileRows.every((row) => row.kind === 'tiles' && row.cues.length === 1)).toBe(true)
  })

  it('returns stable row ids for keys', () => {
    const ids = buildAudioTileRows(groups, 2).map((row) => row.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]).toBe('header:music')
  })
})

describe('buildQuickPlayRequest', () => {
  it('plays when the clicked cue is not the active one', () => {
    expect(buildQuickPlayRequest(null, 'a', 0)).toEqual({ cueId: 'a', nonce: 1, mode: 'play' })
    expect(buildQuickPlayRequest('b', 'a', 4)).toEqual({ cueId: 'a', nonce: 5, mode: 'play' })
  })

  it('toggles when the clicked cue is already active', () => {
    expect(buildQuickPlayRequest('a', 'a', 7)).toEqual({ cueId: 'a', nonce: 8, mode: 'toggle' })
  })
})
