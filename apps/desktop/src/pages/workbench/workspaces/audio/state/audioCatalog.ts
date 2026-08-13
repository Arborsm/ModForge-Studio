import type { AudioCueEntry } from './useAudioWorkspace'

/** Kind filter for the audio catalog toolbar chips. */
export type AudioKindFilter = 'all' | 'music' | 'sound'

/**
 * A tile quick-play intent consumed by the player bar. `play` starts the cue
 * once its audio is loaded; `toggle` flips play/pause on the already-selected
 * cue. The nonce makes repeated clicks on the same cue distinct.
 */
export type AudioQuickPlayRequest = {
  cueId: string
  nonce: number
  mode: 'play' | 'toggle'
}

/**
 * Resolves a tile quick-play click: clicking another cue selects and plays it,
 * clicking the already-selected cue toggles playback.
 */
export function buildQuickPlayRequest(activeCueId: string | null, cueId: string, previousNonce: number): AudioQuickPlayRequest {
  return {
    cueId,
    nonce: previousNonce + 1,
    mode: cueId === activeCueId ? 'toggle' : 'play',
  }
}

/** A virtualized catalog row: a group header or one grid row of cue tiles. */
export type AudioTileRow =
  | { kind: 'header'; id: string; group: 'music' | 'sound'; count: number }
  | { kind: 'tiles'; id: string; cues: AudioCueEntry[] }

/**
 * Applies the toolbar kind filter plus the free-text search (cue name, label,
 * source, category) to the catalog.
 */
export function filterAudioCues(cues: AudioCueEntry[], filterText: string, kindFilter: AudioKindFilter): AudioCueEntry[] {
  const needle = filterText.trim().toLowerCase()
  return cues.filter((cue) => {
    if (kindFilter !== 'all' && cue.kind !== kindFilter) return false
    if (!needle) return true
    return (
      cue.cue.toLowerCase().includes(needle) ||
      cue.label.toLowerCase().includes(needle) ||
      cue.source.toLowerCase().includes(needle) ||
      (cue.category?.toLowerCase().includes(needle) ?? false)
    )
  })
}

/**
 * Chunks the music/sound groups into virtualizer rows at the given column
 * count. Empty groups are skipped; each group starts with a header row.
 */
export function buildAudioTileRows(groups: { music: AudioCueEntry[]; sound: AudioCueEntry[] }, columns: number): AudioTileRow[] {
  const rows: AudioTileRow[] = []
  const cols = Math.max(1, Math.floor(columns))
  for (const [group, cues] of [
    ['music', groups.music],
    ['sound', groups.sound],
  ] as const) {
    if (cues.length === 0) continue
    rows.push({ kind: 'header', id: `header:${group}`, group, count: cues.length })
    for (let index = 0; index < cues.length; index += cols) {
      rows.push({ kind: 'tiles', id: `tiles:${group}:${index}`, cues: cues.slice(index, index + cols) })
    }
  }
  return rows
}
