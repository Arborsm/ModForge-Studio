import { useEffect, useMemo, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Music, Pause, Play, Search, Volume2 } from 'lucide-react'
import { useAudioPanelCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { buildAudioTileRows, type AudioCueEntry, type AudioKindFilter } from '@pages/workbench/workspaces/audio'

type AudioBrowserPanelProps = {
  cues: AudioCueEntry[]
  filteredCues: AudioCueEntry[]
  filter: string
  onFilterChange: (value: string) => void
  kindFilter: AudioKindFilter
  onKindFilterChange: (value: AudioKindFilter) => void
  activeCueId: string | null
  playing: boolean
  onSelectCue: (cueId: string) => void
  onQuickPlay: (cueId: string) => void
}

const HEADER_ROW_HEIGHT_REM = 2.25
const TILE_ROW_HEIGHT_REM = 4.5
const TILE_MIN_WIDTH_REM = 12.5
const GRID_GAP_REM = 0.5

function readRootFontSize(): number {
  if (typeof document === 'undefined') return 16
  const value = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(value) && value > 0 ? value : 16
}

function AudioCueTile({
  cue,
  isActive,
  isPlaying,
  onSelect,
  onQuickPlay,
}: {
  cue: AudioCueEntry
  isActive: boolean
  isPlaying: boolean
  onSelect: () => void
  onQuickPlay: () => void
}) {
  const labels = useAudioPanelCopy()
  const Icon = cue.kind === 'music' ? Music : Volume2
  return (
    <div className={cx('audio-cue-tile-host', isActive && 'is-active', isPlaying && 'is-playing')}>
      <button type="button" className="audio-cue-tile" aria-pressed={isActive} onClick={onSelect}>
        <span className="audio-cue-tile-leading">
          <Icon className="audio-cue-tile-icon h-4 w-4" aria-hidden="true" />
        </span>
        <span className="audio-cue-tile-text min-w-0">
          <span className="audio-cue-tile-label truncate">{cue.label}</span>
          <span className="audio-cue-tile-cue truncate">{cue.cue}</span>
        </span>
        <span className="audio-cue-tile-format">{cue.format}</span>
      </button>
      <button
        type="button"
        className={cx('audio-cue-tile-quickplay', isPlaying && 'is-playing')}
        aria-label={isPlaying ? labels.pause : labels.play}
        title={isPlaying ? labels.pause : labels.play}
        tabIndex={isPlaying ? 0 : -1}
        onClick={(event) => {
          event.stopPropagation()
          onQuickPlay()
        }}
      >
        {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      </button>
    </div>
  )
}

/**
 * Audio catalog: search + kind filter toolbar over a virtualized cue tile grid
 * grouped into music/sound sections. Virtualized so hundreds of cues stay cheap.
 */
export function AudioBrowserPanel({
  cues,
  filteredCues,
  filter,
  onFilterChange,
  kindFilter,
  onKindFilterChange,
  activeCueId,
  playing,
  onSelectCue,
  onQuickPlay,
}: AudioBrowserPanelProps) {
  const labels = useAudioPanelCopy()
  const [gridElement, setGridElement] = useState<HTMLDivElement | null>(null)
  const [columnCount, setColumnCount] = useState(1)
  const [rootFontSize, setRootFontSize] = useState(16)

  const groupedCues = useMemo(() => {
    const music = filteredCues.filter((cue) => cue.kind === 'music')
    const sound = filteredCues.filter((cue) => cue.kind === 'sound')
    return { music, sound }
  }, [filteredCues])

  const rows = useMemo(() => buildAudioTileRows(groupedCues, columnCount), [groupedCues, columnCount])

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => gridElement,
    estimateSize: (index) => rootFontSize * (rows[index]?.kind === 'header' ? HEADER_ROW_HEIGHT_REM : TILE_ROW_HEIGHT_REM),
    overscan: 4,
  })

  // The fluid root font size (base.css) scales every rem with viewport width,
  // so row heights and column counts must be derived from it, not hardcoded px.
  useEffect(() => {
    if (!gridElement) return
    const updateLayout = () => {
      const nextRootFontSize = readRootFontSize()
      const width = gridElement.clientWidth
      const gap = GRID_GAP_REM * nextRootFontSize
      const tileMinWidth = TILE_MIN_WIDTH_REM * nextRootFontSize
      setRootFontSize(nextRootFontSize)
      setColumnCount(Math.max(1, Math.floor((width + gap) / (tileMinWidth + gap))))
    }
    const observer = new ResizeObserver(updateLayout)
    observer.observe(gridElement)
    updateLayout()
    return () => observer.disconnect()
  }, [gridElement])

  useEffect(() => {
    rowVirtualizer.measure()
  }, [rootFontSize, rowVirtualizer])

  const kindChips: { id: AudioKindFilter; label: string; count: number }[] = [
    { id: 'all', label: labels.statsAll, count: cues.length },
    { id: 'music', label: labels.statsMusic, count: groupedCues.music.length },
    { id: 'sound', label: labels.statsSound, count: groupedCues.sound.length },
  ]

  return (
    <div className="audio-browser">
      <div className="audio-browser-toolbar">
        <label className="audio-browser-search">
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">{labels.browserPlaceholder}</span>
          <input
            className="control-input"
            type="search"
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder={labels.browserPlaceholder}
            spellCheck={false}
          />
        </label>
        <div className="audio-browser-chips" role="group" aria-label={labels.browserTitle}>
          {kindChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={chip.id === kindFilter}
              className={cx('audio-browser-chip', chip.id === kindFilter && 'is-active')}
              onClick={() => onKindFilterChange(chip.id)}
            >
              {chip.label}
              <span className="audio-browser-chip-count tabular-nums">{chip.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div ref={setGridElement} className="audio-browser-grid-scroll custom-scrollbar">
        {cues.length === 0 ? (
          <div className="audio-browser-state">
            <Music className="h-6 w-6" aria-hidden="true" />
            <p>{labels.browserEmptyMissing}</p>
          </div>
        ) : filteredCues.length === 0 ? (
          <div className="audio-browser-state">
            <Search className="h-6 w-6" aria-hidden="true" />
            <p>{labels.browserEmptyFiltered}</p>
          </div>
        ) : (
          <div className="audio-browser-virtual-space" style={{ height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              if (!row) return null
              return (
                <div
                  key={row.id}
                  className={cx('audio-browser-virtual-row', row.kind === 'header' ? 'is-header' : 'is-tiles')}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {row.kind === 'header' ? (
                    <header className="audio-browser-group-header">
                      <h3>{row.group === 'music' ? labels.groupMusic : labels.groupSound}</h3>
                      <span className="tabular-nums">{row.count}</span>
                    </header>
                  ) : (
                    <div className="audio-browser-virtual-grid" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
                      {row.cues.map((cue) => (
                        <AudioCueTile
                          key={cue.id}
                          cue={cue}
                          isActive={cue.id === activeCueId}
                          isPlaying={playing && cue.id === activeCueId}
                          onSelect={() => onSelectCue(cue.id)}
                          onQuickPlay={() => onQuickPlay(cue.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
