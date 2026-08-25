import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Music, Pause, Play, Repeat, Volume2 } from 'lucide-react'
import { loadAudioDataUrl, loadXactAudioDataUrl } from '@entities/game/api'
import { useAudioPanelCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import {
  computeWaveformPeaks,
  decodeAudioDataUrl,
  formatAudioTime,
  type AudioCueEntry,
  type AudioQuickPlayRequest,
} from '@pages/workbench/workspaces/audio'

type AudioPreviewPanelProps = {
  cue: AudioCueEntry | null
  rootPath: string | null
  loading: boolean
  statusMessage: string
  /** Whether the audio module is the active workbench view; gates global shortcuts. */
  active: boolean
  quickPlayRequest: AudioQuickPlayRequest | null
  onPlayingChange: (playing: boolean) => void
}

const WAVEFORM_BUCKETS = 160
const SEEK_STEP_SECONDS = 5

function formatLabelKey(format: AudioCueEntry['format'], labels: ReturnType<typeof useAudioPanelCopy>): string {
  switch (format) {
    case 'xact':
      return labels.formatXact
    case 'ogg':
      return labels.formatOgg
    case 'wav':
      return labels.formatWav
    case 'mp3':
      return labels.formatMp3
    default:
      return labels.formatUnknown
  }
}

function clampFraction(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function WaveformSeek({
  peaks,
  progress,
  disabled,
  ariaLabel,
  valueText,
  onSeek,
  onSeekStep,
}: {
  peaks: number[] | null
  progress: number
  disabled: boolean
  ariaLabel: string
  valueText: string
  onSeek: (fraction: number) => void
  onSeekStep: (deltaSeconds: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)

  function fractionFromClientX(clientX: number): number {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    return rect.width > 0 ? clampFraction((clientX - rect.left) / rect.width) : 0
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return
    event.currentTarget.setPointerCapture(event.pointerId)
    onSeek(fractionFromClientX(event.clientX))
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    onSeek(fractionFromClientX(event.clientX))
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onSeekStep(-SEEK_STEP_SECONDS)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      onSeekStep(SEEK_STEP_SECONDS)
    }
  }

  return (
    <div
      ref={trackRef}
      className={cx('audio-player-waveform', disabled && 'is-disabled')}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-valuetext={valueText}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
    >
      {peaks ? (
        peaks.map((peak, index) => {
          const isActive = index / peaks.length <= progress
          return (
            <span
              key={index}
              className={cx('audio-player-waveform-bar', isActive && 'is-active')}
              style={{ '--audio-bar-height': `${Math.max(6, peak * 100)}%` } as React.CSSProperties}
            />
          )
        })
      ) : (
        <span className="audio-player-waveform-flat" style={{ '--audio-progress': `${progress * 100}%` } as React.CSSProperties} />
      )}
    </div>
  )
}

/**
 * Bottom player bar: cue identity chips, real decoded waveform with click/drag
 * seek and keyboard stepping, transport controls, and compact metadata.
 */
export function AudioPreviewPanel({
  cue,
  rootPath,
  loading,
  statusMessage,
  active,
  quickPlayRequest,
  onPlayingChange,
}: AudioPreviewPanelProps) {
  const labels = useAudioPanelCopy()
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(false)
  const [volume, setVolume] = useState(0.7)
  const [loadedAudio, setLoadedAudio] = useState<{ cueId: string; url: string } | null>(null)
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [copied, setCopied] = useState(false)
  const [autoPlayPending, setAutoPlayPending] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const handledQuickPlayNonce = useRef(0)
  const seekByRef = useRef<(deltaSeconds: number) => void>(() => {})

  // The data URL is only valid for the cue it was loaded for; deriving it
  // keeps the previous cue's audio from leaking into the new selection.
  const url = loadedAudio && cue && loadedAudio.cueId === cue.id ? loadedAudio.url : null

  // Reset transport state when the selected cue changes.
  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setPeaks(null)
    setLoadError(null)
    setCopied(false)
    setAutoPlayPending(false)
    setLoadedAudio(null)
  }, [cue?.id])

  // Load the audio data URL for the current cue, then decode it for real
  // waveform peaks and an exact duration (no play press required).
  useEffect(() => {
    if (!cue || !cue.absolutePath) {
      setLoadedAudio(null)
      setAudioLoading(false)
      return
    }
    let cancelled = false
    setLoadError(null)
    setAudioLoading(true)

    const loadPromise = cue.isXact && rootPath ? loadXactAudioDataUrl(rootPath, cue.cue) : loadAudioDataUrl(cue.absolutePath)

    loadPromise
      .then(async (dataUrl) => {
        if (cancelled) return
        setLoadedAudio({ cueId: cue.id, url: dataUrl })
        try {
          const buffer = await decodeAudioDataUrl(dataUrl)
          if (cancelled) return
          const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index))
          setPeaks(computeWaveformPeaks(channels, WAVEFORM_BUCKETS))
          setDuration(buffer.duration)
        } catch {
          // Decode failure must not block playback: fall back to element metadata.
        }
        if (!cancelled) setAudioLoading(false)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoadedAudio(null)
        setAudioLoading(false)
        setLoadError(error instanceof Error ? error.message : String(error))
      })

    return () => {
      cancelled = true
    }
  }, [cue, rootPath])

  // Manage the audio element lifecycle.
  useEffect(() => {
    if (!url) {
      audioRef.current?.pause()
      audioRef.current = null
      return
    }
    const audio = new Audio(url)
    audio.preload = 'auto'
    audio.loop = loop
    audio.volume = volume
    audio.addEventListener('timeupdate', () => setCurrentTime(audio.currentTime))
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration)) setDuration((previous) => (previous > 0 ? previous : audio.duration))
    })
    audio.addEventListener('ended', () => {
      if (!loop) setPlaying(false)
    })
    audio.addEventListener('error', () => setPlaying(false))
    audioRef.current = audio

    return () => {
      audio.pause()
      audioRef.current = null
    }
    // Only re-create the element when the URL changes; loop/volume are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  // Apply loop/volume changes to the existing element without re-creating it.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = loop
      audioRef.current.volume = volume
    }
  }, [loop, volume])

  // Drive play/pause on the current element.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      void audio.play().catch(() => setPlaying(false))
    } else {
      audio.pause()
    }
  }, [playing])

  // Mirror transport state upward so catalog tiles can show a pause affordance.
  useEffect(() => {
    onPlayingChange(playing)
  }, [playing, onPlayingChange])

  // Consume tile quick-play intents: play selects start playback (deferred until
  // the data URL is ready), toggles flip the current transport.
  useEffect(() => {
    if (!quickPlayRequest || quickPlayRequest.nonce === handledQuickPlayNonce.current) return
    handledQuickPlayNonce.current = quickPlayRequest.nonce
    if (quickPlayRequest.cueId !== cue?.id) return
    if (quickPlayRequest.mode === 'toggle') {
      if (url) setPlaying((previous) => !previous)
      return
    }
    if (url) {
      setPlaying(true)
    } else {
      setAutoPlayPending(true)
    }
  }, [quickPlayRequest, cue?.id, url])

  useEffect(() => {
    if (autoPlayPending && url) {
      setAutoPlayPending(false)
      setPlaying(true)
    }
  }, [autoPlayPending, url])

  // Keep the latest seek implementation reachable from the global shortcut
  // listener without re-registering it on every timeupdate.
  useEffect(() => {
    seekByRef.current = (deltaSeconds: number) => {
      if (duration <= 0) return
      const target = clampFraction((currentTime + deltaSeconds) / duration) * duration
      if (audioRef.current) audioRef.current.currentTime = target
      setCurrentTime(target)
    }
  })

  // Playback shortcuts, active only while the audio module is visible:
  // Space play/pause, Left/Right seek ±5s, Up/Down volume, L loop. Text inputs
  // keep their keys, and focused buttons/sliders keep their native activation.
  useEffect(() => {
    if (!active) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) {
        return
      }
      switch (event.code) {
        case 'Space': {
          if (target instanceof HTMLElement && target.closest('button, [role="button"], a[href]')) return
          if (!audioRef.current) return
          event.preventDefault()
          setPlaying((previous) => !previous)
          break
        }
        case 'ArrowLeft':
          event.preventDefault()
          seekByRef.current(-SEEK_STEP_SECONDS)
          break
        case 'ArrowRight':
          event.preventDefault()
          seekByRef.current(SEEK_STEP_SECONDS)
          break
        case 'ArrowUp':
          event.preventDefault()
          setVolume((previous) => Math.min(1, previous + 0.05))
          break
        case 'ArrowDown':
          event.preventDefault()
          setVolume((previous) => Math.max(0, previous - 0.05))
          break
        case 'KeyL':
          setLoop((previous) => !previous)
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [active])

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0
  const seekEnabled = Boolean(url) && duration > 0 && !audioLoading

  function seekToFraction(fraction: number) {
    if (duration <= 0) return
    const target = clampFraction(fraction) * duration
    if (audioRef.current) audioRef.current.currentTime = target
    setCurrentTime(target)
  }

  function seekBy(deltaSeconds: number) {
    if (duration <= 0) return
    seekToFraction((currentTime + deltaSeconds) / duration)
  }

  function togglePlay() {
    setPlaying((prev) => !prev)
  }

  function toggleLoop() {
    setLoop((prev) => !prev)
  }

  function handleCopyCue() {
    if (!cue) return
    void navigator.clipboard.writeText(cue.cue).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  if (loading) {
    return (
      <div className="audio-player audio-player--state">
        <p className="audio-player-status">{statusMessage || labels.previewLoading}</p>
      </div>
    )
  }

  if (!cue) {
    return (
      <div className="audio-player audio-player--state">
        <Music className="text-text-tertiary h-6 w-6" aria-hidden="true" />
        <p className="audio-player-status">{statusMessage || labels.previewEmpty}</p>
      </div>
    )
  }

  return (
    <div className="audio-player">
      <div className="audio-player-header">
        <div className="audio-player-identity min-w-0">
          {cue.kind === 'music' ? (
            <Music className="text-accent h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <Volume2 className="text-accent h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <h2 className="audio-player-title truncate">{cue.label}</h2>
          <span className="audio-player-cue truncate">{cue.cue}</span>
          <button
            type="button"
            className="audio-player-copy"
            onClick={handleCopyCue}
            disabled={!cue.cue}
            title={copied ? labels.copyCueDone : labels.copyCue}
            aria-label={copied ? labels.copyCueDone : labels.copyCue}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="audio-player-chips">
          <span className="dock-chip">{cue.kind === 'music' ? labels.groupMusic : labels.groupSound}</span>
          <span className="dock-chip">{formatLabelKey(cue.format, labels)}</span>
          <span className="dock-chip">{cue.source}</span>
        </div>
      </div>

      {loadError ? (
        <div className="audio-player-waveform-host audio-player-waveform-host--message">
          <p className="audio-player-error">{labels.previewError(loadError)}</p>
        </div>
      ) : audioLoading ? (
        <div className="audio-player-waveform-host audio-player-waveform-host--message">
          <p className="audio-player-status">{labels.previewLoading}</p>
        </div>
      ) : (
        <div className="audio-player-waveform-host">
          <WaveformSeek
            peaks={peaks}
            progress={progress}
            disabled={!seekEnabled}
            ariaLabel={labels.seekLabel}
            valueText={formatAudioTime(currentTime)}
            onSeek={seekToFraction}
            onSeekStep={seekBy}
          />
        </div>
      )}

      <div className="audio-player-transport">
        <button
          type="button"
          className="audio-browser-transport-button audio-browser-transport-button--primary"
          onClick={togglePlay}
          disabled={!url}
          title={playing ? labels.pause : labels.play}
          aria-label={playing ? labels.pause : labels.play}
        >
          {playing ? <Pause className="h-4.5 w-4.5" /> : <Play className="h-4.5 w-4.5" />}
        </button>
        <button
          type="button"
          className={cx('audio-browser-transport-button', loop && 'is-active')}
          onClick={toggleLoop}
          title={loop ? labels.loopEnabled : labels.loop}
          aria-label={loop ? labels.loopEnabled : labels.loop}
          aria-pressed={loop}
        >
          <Repeat className="h-4 w-4" />
        </button>
        <span className="audio-browser-time tabular-nums">
          {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
        </span>
        {cue.relativePath ? <span className="audio-player-path truncate">{cue.relativePath}</span> : <span className="flex-1" />}
        <label className="audio-browser-volume">
          <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label={labels.volume}
          />
        </label>
      </div>
    </div>
  )
}
