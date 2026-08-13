import { useEffect, useMemo, useState } from 'react'
import { loadResourceRegistry, type GameDirectoryInfo, type ResourceRegistryEntry } from '@entities/game/api'
import type { LocaleCode } from '@locales/api'
import { MUSIC_OPTIONS, SOUND_OPTIONS } from '@pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-model/commandOptions'
import { scheduleDeferred } from '@shared/lib/react'
import { buildQuickPlayRequest, filterAudioCues, type AudioKindFilter, type AudioQuickPlayRequest } from './audioCatalog'

/** A single audio cue derived from the global resource registry. */
export type AudioCueEntry = {
  id: string
  cue: string
  label: string
  kind: 'music' | 'sound'
  source: string
  sourceKind: 'game' | 'project'
  category: string | null
  relativePath: string | null
  absolutePath: string | null
  /** True when the underlying file is an XACT sound bank cue. */
  isXact: boolean
  /** Format label derived from the file extension. */
  format: 'xact' | 'ogg' | 'wav' | 'mp3' | 'unknown'
}

type UseAudioWorkspaceOptions = {
  directoryInfo: GameDirectoryInfo | null
  locale: LocaleCode
  active: boolean
}

type AudioWorkspaceState = {
  cues: AudioCueEntry[]
  filteredCues: AudioCueEntry[]
  filter: string
  setFilter: (value: string) => void
  kindFilter: AudioKindFilter
  setKindFilter: (value: AudioKindFilter) => void
  activeCueId: string | null
  activeCue: AudioCueEntry | null
  handleSelectCue: (cueId: string) => void
  /** Mirrors the player bar's transport state so tiles can show a pause affordance. */
  playing: boolean
  /** Latest tile quick-play intent, consumed by the player bar. */
  quickPlayRequest: AudioQuickPlayRequest | null
  handleQuickPlay: (cueId: string) => void
  reportPlaying: (playing: boolean) => void
  status: 'idle' | 'loading' | 'ready' | 'error'
  statusMessage: string
}

const EMPTY_CUES: AudioCueEntry[] = []

function detectFormat(absolutePath: string | null): AudioCueEntry['format'] {
  if (!absolutePath) return 'unknown'
  const lower = absolutePath.toLowerCase()
  if (lower.endsWith('.xsb') || lower.endsWith('.xwb')) return 'xact'
  if (lower.endsWith('.ogg')) return 'ogg'
  if (lower.endsWith('.wav')) return 'wav'
  if (lower.endsWith('.mp3')) return 'mp3'
  return 'unknown'
}

function isXactPath(absolutePath: string | null): boolean {
  if (!absolutePath) return false
  const lower = absolutePath.toLowerCase()
  return lower.endsWith('.xsb') || lower.endsWith('.xwb')
}

function resolveKind(cue: string, fallback: 'music' | 'sound'): 'music' | 'sound' {
  if (MUSIC_OPTIONS.includes(cue)) return 'music'
  if (SOUND_OPTIONS.includes(cue)) return 'sound'
  return fallback
}

function toAudioCueEntry(entry: ResourceRegistryEntry): AudioCueEntry {
  const isXact = isXactPath(entry.absolutePath)
  const fallbackKind = entry.kind === 'music' ? 'music' : 'sound'
  const kind = resolveKind(entry.value, fallbackKind)
  return {
    id: entry.id,
    cue: entry.value,
    label: entry.label || entry.value,
    kind,
    source: entry.source,
    sourceKind: entry.sourceKind === 'project' || entry.sourceKind === 'mod' ? 'project' : 'game',
    category: entry.category,
    relativePath: entry.relativePath,
    absolutePath: entry.absolutePath,
    isXact,
    format: detectFormat(entry.absolutePath),
  }
}

/**
 * Owns audio-cue loading from the global resource registry, filter state,
 * selection state, and derived filtered/active cues for the audio browse workspace.
 */
export function useAudioWorkspace({ directoryInfo, locale, active }: UseAudioWorkspaceOptions): AudioWorkspaceState {
  const [cues, setCues] = useState<AudioCueEntry[]>(EMPTY_CUES)
  const [filter, setFilter] = useState('')
  const [kindFilter, setKindFilter] = useState<AudioKindFilter>('all')
  const [activeCueId, setActiveCueId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [quickPlayRequest, setQuickPlayRequest] = useState<AudioQuickPlayRequest | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    if (!active) return
    const rootPath = directoryInfo?.rootPath
    if (!rootPath) {
      setCues(EMPTY_CUES)
      setStatus('idle')
      setStatusMessage('')
      return
    }

    let cancelled = false
    setStatus('loading')
    setStatusMessage('')

    const cancelDeferred = scheduleDeferred(() => {
      if (cancelled) return
      loadResourceRegistry(rootPath, locale)
        .then((registry) => {
          if (cancelled) return
          const audioCues = registry.entries
            .filter((entry) => entry.kind === 'music' || entry.kind === 'sound')
            .map(toAudioCueEntry)
            .sort((left, right) => left.kind.localeCompare(right.kind) || left.cue.localeCompare(right.cue))
          setCues(audioCues)
          setStatus('ready')
          setStatusMessage('')
        })
        .catch((error: unknown) => {
          if (cancelled) return
          setCues(EMPTY_CUES)
          setStatus('error')
          setStatusMessage(error instanceof Error ? error.message : String(error))
        })
    })

    return () => {
      cancelled = true
      cancelDeferred()
    }
  }, [directoryInfo?.rootPath, locale, active])

  const filteredCues = useMemo(() => filterAudioCues(cues, filter, kindFilter), [cues, filter, kindFilter])

  const activeCue = useMemo(() => cues.find((cue) => cue.id === activeCueId) ?? null, [cues, activeCueId])

  function handleSelectCue(cueId: string) {
    setActiveCueId(cueId)
  }

  function handleQuickPlay(cueId: string) {
    setQuickPlayRequest((previous) => buildQuickPlayRequest(activeCueId, cueId, previous?.nonce ?? 0))
    if (cueId !== activeCueId) setActiveCueId(cueId)
  }

  function reportPlaying(next: boolean) {
    setPlaying(next)
  }

  return {
    cues,
    filteredCues,
    filter,
    setFilter,
    kindFilter,
    setKindFilter,
    activeCueId,
    activeCue,
    handleSelectCue,
    playing,
    quickPlayRequest,
    handleQuickPlay,
    reportPlaying,
    status,
    statusMessage,
  }
}
